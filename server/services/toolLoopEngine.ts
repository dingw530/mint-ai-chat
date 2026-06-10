// ── Tool 调用循环引擎 ──
// 将"一轮工具调用往返"（构建请求 → fetch → 解析 SSE → 返回结构化结果）抽象为统一引擎
// 不依赖 Express，可单元测试

import { HistoryMessage, AiSettings, ToolCall, ToolDefinition } from '../types.js';
import { ApiAdapter, getAdapter } from './adapters/apiAdapter.js';
import { executeTool } from './toolRegistry.js';
import { createLogger } from '../utils/logger.js';
import { Sink } from './sink.js';
import { retry } from './retryWrapper.js';

// 导入 Adapter 实现
import './adapters/openaiChatAdapter.js';
import './adapters/anthropicAdapter.js';
import './adapters/openaiResponsesAdapter.js';

const log = createLogger('tool-loop');

// ── 类型定义 ──

export interface ToolRoundInput {
  messages: HistoryMessage[];
  settings: AiSettings;
  tools?: ToolDefinition[];
  adapter?: ApiAdapter;       // 可选注入，不传则从 settings 自动获取
  signal?: AbortSignal;
  label?: string;             // 日志标签
}

export interface ToolRoundResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[] | null;   // null 或空数组表示无需继续
}

// 工具执行结果（包含拼接用的 message 和成功标志）
export interface ToolExecutionResult {
  assistantMsg: HistoryMessage;
  toolMsg: HistoryMessage;
  succeeded: boolean;
}

// ── SSE 流解析（无 Express 依赖） ──
// 从 fetch Response 中读取 SSE data，通过 sink 实时回传，同时累加返回结构化结果

export async function parseSSEStream(
  response: Response,
  adapter: ApiAdapter,
  sink?: Sink,
  options?: { eventType?: string; signal?: AbortSignal },
): Promise<ToolRoundResult> {
  if (!response.ok) {
    const errorText = await response.text();
    const err: any = new Error(`AI API error (${response.status}): ${errorText}`);
    err.status = response.status;
    throw err;
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let fullReasoning = '';
  const toolCalls: (ToolCall | null)[] = [];
  let buffer = '';

  try {
    while (true) {
      if (options?.signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        const chunk = adapter.parseChunk(data);
        if (!chunk) continue;

        if (chunk.isFinished) {
          break;
        }

        if (chunk.toolCallDelta) {
          const tc = chunk.toolCallDelta;
          if (!toolCalls[tc.index]) {
            toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) toolCalls[tc.index]!.id = tc.id;
          if (tc.type) toolCalls[tc.index]!.type = tc.type;
          if (tc.function) {
            if (tc.function.name) toolCalls[tc.index]!.function.name += tc.function.name;
            if (tc.function.arguments) toolCalls[tc.index]!.function.arguments += tc.function.arguments;
          }
        }

        if (chunk.content) {
          fullContent += chunk.content;
          sink?.write(JSON.stringify({ content: chunk.content, ...(options?.eventType ? { type: options.eventType } : {}) }));
        }

        if (chunk.reasoning) {
          fullReasoning += chunk.reasoning;
          sink?.write(JSON.stringify({ reasoning: chunk.reasoning, ...(options?.eventType ? { type: options.eventType } : {}) }));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const hasToolCalls = toolCalls.length > 0;
  return { content: fullContent, reasoning: fullReasoning, toolCalls: hasToolCalls ? (toolCalls as ToolCall[]) : null };
}

// ── Tool 循环引擎 ──

export class ToolLoopEngine {
  // 执行一轮工具调用：构建请求 → fetch → 解析 SSE → 返回结构化结果
  async executeRound(input: ToolRoundInput, sink?: Sink): Promise<ToolRoundResult> {
    const { messages, settings, tools, signal, label } = input;
    const { apiUrl, apiKey } = settings;

    if (!apiUrl || !apiKey) {
      throw Object.assign(new Error('API URL or API Key not configured'), { status: 400 });
    }

    const adapter = input.adapter || getAdapter(settings.apiType || 'openai-chat');
    if (!adapter) {
      throw new Error(`Unsupported API type: ${settings.apiType}`);
    }

    const url = adapter.getUrl(apiUrl);
    const headers = adapter.getHeaders(apiKey);
    const body = adapter.buildRequest(messages, settings, tools);

    log.debug('executeRound', { label: label || 'unnamed', url, toolCount: tools?.length || 0 });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    const eventType = label === 'react-answer' ? 'answer' : label === 'react-thought' ? 'thought' : undefined;
    return await parseSSEStream(response, adapter, sink, { eventType, signal });
  }

  // 执行工具并返回拼接用的 message 对
  async executeToolCall(tc: ToolCall, reasoning?: string): Promise<ToolExecutionResult> {
    let toolResult: unknown;
    try {
      toolResult = await executeTool(tc);
      log.debug('tool executed', { name: tc.function.name, resultPreview: JSON.stringify(toolResult).substring(0, 200) });
    } catch (err) {
      toolResult = { error: (err as Error).message };
    }

    const resultStr = JSON.stringify(toolResult);
    const assistantMsg: HistoryMessage = {
      role: 'assistant',
      content: null as unknown as string,
      tool_calls: [tc],
      reasoning: reasoning || undefined,
    };
    const toolMsg: HistoryMessage = {
      role: 'tool',
      tool_call_id: tc.id,
      content: resultStr.substring(0, 5000),
    };

    return { assistantMsg, toolMsg, succeeded: true };
  }

  // 执行工具并支持重试（用于 reactChat 场景）
  async executeToolCallWithRetry(
    tc: ToolCall,
    reasoning: string | undefined,
    maxRetries: number,
    onRetry?: (attempt: number, error: Error) => void,
  ): Promise<ToolExecutionResult> {
    let toolResult: unknown;
    let succeeded = true;
    try {
      toolResult = await retry(() => executeTool(tc), {
        maxRetries,
        baseDelay: 1000,
        maxDelay: 16000,
        onRetry: onRetry || (() => {}),
      });
    } catch (err) {
      toolResult = { error: `All retries failed: ${(err as Error).message}` };
      succeeded = false;
    }

    const resultStr = JSON.stringify(toolResult);
    const assistantMsg: HistoryMessage = {
      role: 'assistant',
      content: null as unknown as string,
      tool_calls: [tc],
      reasoning: reasoning || undefined,
    };
    const toolMsg: HistoryMessage = {
      role: 'tool',
      tool_call_id: tc.id,
      content: resultStr.substring(0, 5000),
    };

    return { assistantMsg, toolMsg, succeeded };
  }
}

// 单例
export const toolLoopEngine = new ToolLoopEngine();
