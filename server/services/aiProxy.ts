import { getAllToolDefinitions } from './toolRegistry.js';
import { HistoryMessage, AiSettings, StreamResult } from '../types.js';
import { ApiAdapter, getAdapter } from './adapters/apiAdapter.js';
import { createLogger } from '../utils/logger.js';
import { toolLoopEngine, parseSSEStream } from './toolRoundEngine.js';
import { Sink } from './sink.js';

// 导入 Adapter 实现（触发 registerAdapter 自注册）
import './adapters/openaiChatAdapter.js';
import './adapters/anthropicAdapter.js';
import './adapters/openaiResponsesAdapter.js';

const log = createLogger('ai-proxy');

function getApiAdapter(settings: AiSettings): ApiAdapter {
  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) {
    throw new Error(`Unsupported API type: ${settings.apiType}`);
  }
  return adapter;
}

// ── 兼容层：读取 SSE 流，可选择实时写入 Sink ──
export async function readStream(
  response: Response,
  adapter: ApiAdapter,
  sink?: Sink,
  options?: { eventType?: string; signal?: AbortSignal },
): Promise<StreamResult> {
  if (!response.ok) {
    const errorText = await response.text();
    const err: any = new Error(`AI API error (${response.status}): ${errorText}`);
    err.status = response.status;
    throw err;
  }

  const result = await parseSSEStream(response, adapter, sink, options);
  return result;
}

// ── 调用 AI API，返回 fetch Response ──
export async function streamFromAPI(url: string, headers: Record<string, string>, body: Record<string, unknown>, label?: string): Promise<Response> {
  const bodyPreview = JSON.stringify(body).substring(0, 500);
  log.debug('streamFromAPI', { label: label || 'unnamed', url, method: 'POST', bodyPreview });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('streamFromAPI failed', { label: label || 'unnamed', url, status: response.status, errorText: errorText.substring(0, 1000) });
  } else {
    log.debug('streamFromAPI success', { label: label || 'unnamed', url, status: response.status });
  }

  return response;
}

// 核心入口：发起 AI 流式对话，支持无工具/有工具两条路径
export async function streamChat(messages: HistoryMessage[], settings: AiSettings, sink: Sink, agent?: string): Promise<StreamResult> {
  const { apiUrl, apiKey } = settings;

  if (!apiUrl || !apiKey) {
    sink.write(JSON.stringify({ error: 'API URL or API Key not configured' }));
    sink.end();
    return { content: '', reasoning: '', toolCalls: null };
  }

  const adapter = getApiAdapter(settings);
  const url = adapter.getUrl(apiUrl);
  const headers = adapter.getHeaders(apiKey);

  // 获取 Agent 可用的工具列表
  const tools = await getAllToolDefinitions(agent);
  const hasTools = tools.length > 0;

  // 快速路径：无工具调用，直接将 AI SSE 流透传到前端
  if (!hasTools) {
    const body = adapter.buildRequest(messages, settings);
    const response = await streamFromAPI(url, headers, body, 'streamChat-fast');
    try {
      const result = await readStream(response, adapter, sink);
      if (!sink.writableEnded) {
        sink.end();
      }
      return result;
    } catch (err) {
      const error = err as any;
      sink.write(JSON.stringify({ error: error.message }));
      sink.end();
      return { content: '', reasoning: '', toolCalls: null };
    }
  }

  // 工具路径：先通过引擎执行首轮，判断是否触发 tool_call
  let result: StreamResult;
  try {
    result = await toolLoopEngine.executeRound(
      { messages, settings, tools, adapter, label: 'streamChat-tool1' },
    );
  } catch (err) {
    const error = err as any;
    sink.write(JSON.stringify({ error: error.message }));
    sink.end();
    return { content: '', reasoning: '', toolCalls: null };
  }

  // 未触发工具调用 → 将缓存内容写入 sink
  if (!result.toolCalls) {
    if (result.content) {
      sink.write(JSON.stringify({ content: result.content }));
    }
    if (result.reasoning) {
      sink.write(JSON.stringify({ reasoning: result.reasoning }));
    }
    sink.end();
    return { content: result.content, reasoning: result.reasoning, toolCalls: null };
  }

  // ---- 工具调用路径：执行工具后二次调用 AI ----
  const toolMessages: HistoryMessage[] = [];
  for (const tc of result.toolCalls) {
    const { assistantMsg, toolMsg } = await toolLoopEngine.executeToolCall(tc, result.reasoning);
    toolMessages.push(assistantMsg, toolMsg);
  }

  const secondMessages: HistoryMessage[] = [
    ...messages.map(m => ({ role: m.role, content: m.content, reasoning: m.reasoning })),
    ...toolMessages,
  ];

  let secondResult: StreamResult;
  try {
    secondResult = await toolLoopEngine.executeRound(
      { messages: secondMessages, settings, adapter, label: 'streamChat-tool2' },
      sink,
    );
  } catch (err) {
    const error = err as any;
    sink.write(JSON.stringify({ error: error.message }));
    sink.end();
    return { content: '', reasoning: '', toolCalls: null };
  }

  sink.end();
  return { content: secondResult.content, reasoning: secondResult.reasoning, toolCalls: null };
}

// 非流式调用 AI 生成对话标题（保持 OpenAI Chat 格式）
export async function generateTitle(settings: AiSettings, userContent: string, assistantContent: string): Promise<string> {
  const { apiUrl, apiKey } = settings;
  if (!apiUrl || !apiKey) return '';

  try {
    const adapter = getAdapter(settings.apiType || 'openai-chat');
    if (!adapter) {
      console.error('[generateTitle] Adapter not found');
      return fallbackTitle(userContent);
    }

    const content = await adapter.call(
      [
        { role: 'system', content: '根据对话内容生成一个简短的标题（最多6个汉字或12个英文字符）。只返回标题本身，不要引号、标点和解释。\nGenerate a very short title (max 6 Chinese characters or 12 English characters) for this conversation. Return ONLY the title.' },
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent },
      ],
      { modelId: settings.modelId },
      apiUrl,
      apiKey,
      { maxTokens: 60, temperature: 0.5 },
    );

    console.log('[generateTitle] raw response:', JSON.stringify(content));

    let title = content.replace(/^["'「「『""]+|["'」」』""]+$/g, '').trim();

    console.log('[generateTitle] result:', JSON.stringify(title));
    if (!title) {
      console.log('[generateTitle] empty result, using fallback');
      return fallbackTitle(userContent);
    }
    return title;
  } catch (err) {
    console.error('[generateTitle] failed:', err);
    return fallbackTitle(userContent);
  }
}

function fallbackTitle(userContent: string): string {
  const cleaned = userContent.replace(/[\n\r]+/g, ' ').trim();
  return cleaned.length > 10 ? cleaned.substring(0, 10) + '...' : cleaned;
}
