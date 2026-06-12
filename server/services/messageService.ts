import { v4 as uuidv4 } from 'uuid';
import * as conversationRepo from '../repositories/conversationRepository.js';
import * as messageRepo from '../repositories/messageRepository.js';
import * as settingsService from './settingsService.js';
import * as memoryService from './memoryService.js';
import * as agentService from './agentService.js';
import { routingService } from './routingService.js';
import { streamChat, reactChat } from './aiProxy.js';
import { getAllToolDefinitions } from './toolRegistry.js';
import { HttpError, HistoryMessage } from '../types.js';
import { Sink } from './sink.js';

export function getMessages(conversationId: string) {
  const conversation = conversationRepo.findById(conversationId);
  if (!conversation) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return messageRepo.findByConversationId(conversationId);
}

// 发送消息：保存用户消息 → 路由决策 → 拼接历史 → SSE 流式调用 AI → 保存 AI 回复
export async function sendMessage(conversationId: string, content: string, sink: Sink, agent?: string, regenerate?: boolean): Promise<void> {
  const conversation = conversationRepo.findById(conversationId);
  if (!conversation) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }

  const now = new Date().toISOString();
  const userMsgId = uuidv4();

  // 先持久化用户消息（非重新生成场景），确保不丢失
  if (!regenerate) {
    messageRepo.create({ id: userMsgId, conversationId, role: 'user', content, createdAt: now });
    messageRepo.updateConversationTimestamp(conversationId, now);
  }

  // ── 路由决策 ──
  // 优先级：前端显式指定 > lockedAgent > 自动路由 > 默认 general
  let resolvedAgent = agent;

  if (!resolvedAgent) {
    if (conversation.lockedAgent) {
      // 对话已锁定 Agent
      resolvedAgent = conversation.lockedAgent;
    } else if (conversation.routingMode !== 'manual') {
      // 自动模式：调用路由引擎
      try {
        const agents = agentService.list();
        const routeResult = await routingService.route(content, {
          agents,
          lockedAgent: conversation.lockedAgent,
          routingMode: conversation.routingMode,
          conversationId,
          messageId: userMsgId,
          messagePreview: content.substring(0, 50),
        });
        resolvedAgent = routeResult.agentId;
      } catch (err) {
        console.error('[routing] routing failed, fallback to general:', err);
        resolvedAgent = 'general';
      }
    }
    // manual 模式下不传 agent → 默认通用助手
  }

  // 拼接消息历史：优先使用路由到的 Agent 的 systemPrompt，其次用全局设置
  const history = messageRepo.getHistory(conversationId);
  const settings = settingsService.getAiSettings();

  let systemPrompt = settings.systemPrompt;
  if (resolvedAgent && resolvedAgent !== 'general') {
    const agentInfo = agentService.findById(resolvedAgent);
    if (agentInfo?.systemPrompt) {
      systemPrompt = agentInfo.systemPrompt;
    }
  }

  const messages: HistoryMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...history]
    : history;

  // 注入记忆上下文
  if (settings.memoryEnabled) {
    const memoryContext = memoryService.buildMemoryContext();
    if (memoryContext) {
      const sysIdx = messages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        messages.splice(sysIdx + 1, 0, { role: 'system', content: memoryContext });
      } else {
        messages.unshift({ role: 'system', content: memoryContext });
      }
    }
  }

  try {
    // 判断是否启用 ReAct 循环：Agent 有工具 且 reactMaxIterations > 0
    const agentTools = resolvedAgent ? await getAllToolDefinitions(resolvedAgent) : [];
    const useReact = agentTools.length > 0 && settings.reactMaxIterations > 0;

    // 编排 Agent 设置 120s 总超时（BR-052 / AC-070）
    let orchestratorSignal: AbortSignal | undefined;
    let orchestratorTimer: ReturnType<typeof setTimeout> | undefined;
    if (useReact && resolvedAgent) {
      const agentInfo = agentService.findById(resolvedAgent);
      if (agentInfo?.type === 'orchestrator') {
        const controller = new AbortController();
        orchestratorTimer = setTimeout(() => controller.abort(), 120_000);
        orchestratorSignal = controller.signal;
      }
    }

    const { content: fullContent, reasoning: fullReasoning } = useReact
      ? await reactChat(messages, settings, sink, resolvedAgent, orchestratorSignal)
      : await streamChat(messages, settings, sink, resolvedAgent);

    clearTimeout(orchestratorTimer);
    // AI 回复完成后持久化（流式结束时才写入）
    if (fullContent) {
      messageRepo.create({
        id: uuidv4(),
        conversationId,
        role: 'assistant',
        content: fullContent,
        reasoning: fullReasoning || null,
        createdAt: new Date().toISOString(),
      });

      // 异步提取记忆（v1.5.1 增加价值判断预检查）
      if (settings.memoryEnabled) {
        if (memoryService.isConversationValuable(content)) {
          memoryService.performExtraction(settings, content, fullContent, conversationId)
            .catch(err => console.error('[memory] Extraction failed:', err));
        }
      }
    }
  } catch (err) {
    console.error('AI streaming error:', err);
    if (!sink.writableEnded) {
      sink.write(JSON.stringify({ error: 'AI streaming failed' }));
      sink.end();
    }
  }
}
