import { v4 as uuidv4 } from 'uuid';
import * as conversationRepo from '../repositories/conversationRepository.js';
import * as messageRepo from '../repositories/messageRepository.js';
import * as settingsService from './api/settingsService.js';
import * as memoryService from './api/memoryService.js';
import * as agentService from './api/agentService.js';
import { routingService } from './api/routingService.js';
import { streamChat } from './aiProxy.js';
import { reactChat } from './reactLoopCore.js';
import { getAllToolDefinitions } from './toolRegistry.js';
import type { HttpError, HistoryMessage } from '../types.js';
import type { Sink } from './sink.js';
import { parseFile, isSupportedFile } from './utils/fileParseService.js';

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
interface FileAttachment {
  name: string;
  content: string; // Base64
  type?: string;
}

export async function sendMessage(conversationId: string, content: string, sink: Sink, agent?: string, regenerate?: boolean, files?: FileAttachment[]): Promise<void> {
  const conversation = conversationRepo.findById(conversationId);
  if (!conversation) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }

  const now = new Date().toISOString();
  const userMsgId = uuidv4();

  // 处理文件附件：解析文件并追加到消息内容
  let augmentedContent = content;
  if (files && files.length > 0) {
    const fileParts: string[] = [];
    for (const file of files) {
      if (!isSupportedFile(file.name)) {
        fileParts.push(`\n[文件 ${file.name}] 不支持的文件类型，已跳过`);
        continue;
      }
      try {
        const buffer = Buffer.from(file.content, 'base64');
        const result = await parseFile({ name: file.name, content: buffer, size: buffer.length });
        fileParts.push(`\n--- 上传文件：${file.name} ---\n${result.text}\n--- 文件结束 ---`);
      } catch (err) {
        fileParts.push(`\n[文件 ${file.name}] 解析失败: ${(err as Error).message}`);
      }
    }
    if (fileParts.length > 0) {
      augmentedContent = (content || '') + '\n\n以下是从上传文件中提取的内容：\n' + fileParts.join('\n');
    }
  }

  // 先持久化用户消息（非重新生成场景），确保不丢失
  if (!regenerate) {
    messageRepo.create({ id: userMsgId, conversationId, role: 'user', content: augmentedContent, createdAt: now });
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

  // 收集 system 附加上下文，统一追加到第一条 system message 末尾
  const systemExtras: string[] = [];

  if (settings.memoryEnabled) {
    const memoryContext = memoryService.buildMemoryContext();
    if (memoryContext) {
      systemExtras.push(memoryContext);
    }
  }

  if (settings.wikiPath) {
    systemExtras.push([
      `⚠️ Wiki 知识库使用规则（必须遵守）：知识库根目录: ${settings.wikiPath}`,
      '',
      '【禁止操作】',
      '- 严禁使用 bash 工具读取、搜索或列出 Wiki 目录下的任何文件。bash 的读文件操作（cat/ls/grep/cd 等）已被系统拦截，执行会直接报错。',
      '- 不要尝试 cd 到 Wiki 目录，不要用 cat 打开 .md 文件，不要用 grep 搜索关键词。所有 Wiki 文件访问必须使用 wiki_search 工具。',
      '',
      '【wiki_search 工具使用指南】',
      '- 该工具返回的是文件的**完整内容**（单文件可达数万字），不存在截断问题。',
      '- 支持两种模式：',
      '  · question 模式：输入关键词搜索，返回匹配度最高的页面完整内容',
      '  · paths 模式：直接传入文件路径列表，批量读取多个文件的完整内容',
      '- 已知文件路径时，始终用 paths 模式一次读完，paths 接受任意数量的路径。',
      '- 如需同时搜索多个关键词，可以在**同一轮**中并行发起多个 wiki_search 调用。',
      '',
      '【知识库结构】',
      '- Wiki 根目录下的 _index.md 是首页，包含分类索引和最近更新，建议先读取了解整体结构。',
      '- Wiki 根目录下分 pages/（结构化页面）、sources/（原始材料）等子目录。',
      '- pages/ 下的文件是正式知识页面，按领域/主题组织子目录。',
      '- sources/ 下的文件是原始材料（直播转录、笔记等）。',
      '- 文件名格式通常为 "主题-子主题.md"，如 pages/AI实践/LLM-Wiki-系统架构与编译流水线.md。',
      '- 第一次搜索获取到文件路径后，后续直接使用 paths 模式读取即可，无需再次搜索。',
      '',
      '【效率建议】',
      '- 一次 search 返回的结果通常已包含足够信息，避免反复换关键词搜索。',
      '- 如需查阅多个页面，优先使用 paths 批量读取或并行调用，减少工具调用轮次。',
      '- 对知识库不熟悉时，先读取 _index.md 了解整体结构，再决定要查阅哪些页面。',
    ].join('\n'));
  }

  if (systemExtras.length > 0) {
    const sysIdx = messages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      messages[sysIdx].content += '\n\n' + systemExtras.join('\n\n');
    } else {
      messages.unshift({ role: 'system', content: systemExtras.join('\n\n') });
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
