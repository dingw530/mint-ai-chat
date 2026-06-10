import * as settingsService from './settingsService.js';
import * as agentService from './agentService.js';
import { getAllToolDefinitions } from './toolRegistry.js';
import { toolLoopEngine } from './toolLoopEngine.js';
import { AccumulatingSink } from './sink.js';
import { HistoryMessage, ToolDefinition, StreamResult } from '../types.js';

// 编排 Agent 的默认系统提示词后缀
export const ORCHESTRATOR_INSTRUCTION = `
你是一个编排助手（Orchestrator）。你的职责是：
1. 分析用户的问题，判断是否可以拆分为多个子任务。
2. 如果可以拆分，使用 invoke_agent 工具将子任务委派给最合适的专业 Agent。
3. 收集所有子任务的结果后进行汇总和整合，给出最终的完整回答。
4. 如果问题简单不需要拆分，直接使用你的通用知识回答。

注意：invoke_agent 是同步操作，等待返回结果后再继续。
一次可以并行调用多个 invoke_agent 来加速处理。`;

// 获取当前可用的 Worker Agent 列表文本
function getAvailableWorkers(): string {
  const agents = agentService.list();
  return agents
    .filter(a => a.available !== false && a.id !== 'orchestrator' && a.id !== 'general')
    .map(a => `- ${a.id}: ${a.description || a.name}`)
    .join('\n');
}

// 内部调用 Worker Agent（非流式，捕获完整回复）
export async function invokeAgent(agentId: string, task: string, timeoutMs = 30000): Promise<string> {
  const settings = settingsService.getAiSettings();
  if (!settings.apiUrl || !settings.apiKey) {
    return 'Error: AI API not configured';
  }

  // 校验 Agent 可用性
  const agent = agentService.findById(agentId);
  if (!agent) return `Error: Agent "${agentId}" not found`;
  if (!agent.available) return `Error: Agent "${agentId}" is not available`;

  const tools: ToolDefinition[] = await getAllToolDefinitions(agentId);

  // 构造消息
  const messages: HistoryMessage[] = [];
  if (agent.systemPrompt) {
    messages.push({ role: 'system', content: agent.systemPrompt });
  }
  messages.push({ role: 'user', content: task });

  // 无工具路径：直接非流式调用
  if (tools.length === 0) {
    return await directCall(settings, messages, timeoutMs);
  }

  // 有工具路径：通过引擎执行首轮
  let result: StreamResult;
  try {
    result = await toolLoopEngine.executeRound(
      { messages, settings, tools, label: 'orchestrator-tool1' },
    );
  } catch (err) {
    return `Error: AI request failed: ${(err as Error).message}`;
  }

  // 无 tool_calls → 直接返回
  if (!result.toolCalls || result.toolCalls.length === 0) {
    return result.content || '(empty response)';
  }

  // 有 tool_calls → 执行后二次调用
  const toolMessages: HistoryMessage[] = [];
  for (const tc of result.toolCalls) {
    const { assistantMsg, toolMsg } = await toolLoopEngine.executeToolCall(tc, result.reasoning);
    toolMessages.push(assistantMsg, toolMsg);
  }

  const secondMessages = [...messages, ...toolMessages];
  const sink = new AccumulatingSink();

  let secondResult: StreamResult;
  try {
    secondResult = await toolLoopEngine.executeRound(
      { messages: secondMessages, settings, label: 'orchestrator-tool2' },
      sink,
    );
  } catch (err) {
    return `Error: AI retry failed: ${(err as Error).message}`;
  }

  return secondResult.content || '(empty response)';
}

// 非流式直接调用 AI
async function directCall(settings: any, messages: HistoryMessage[], timeoutMs: number): Promise<string> {
  const { apiUrl, apiKey, modelId } = settings;

  const body = {
    model: modelId,
    messages,
    stream: false,
    max_tokens: 4096,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(apiUrl.replace(/\/+$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return `Error: AI API error (${response.status})`;

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '(empty response)';
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// 构建编排 Agent 的 invoke_agent 工具定义
export function getInvokeAgentToolDefinition(): ToolDefinition {
  const workers = getAvailableWorkers();
  return {
    type: 'function',
    function: {
      name: 'invoke_agent',
      description: `将子任务委派给指定的专业 Agent 执行，等待结果返回。在需要其他 Agent 专业能力时调用。\n\n可用 Worker Agent：\n${workers || '(暂无可用 Worker)'}`,
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: '目标 Agent ID' },
          task: { type: 'string', description: '要委派给该 Agent 的子任务描述' },
        },
        required: ['agent_id', 'task'],
      },
    },
  };
}
