import { Response as ExpressResponse } from 'express';
import { getAllToolDefinitions, executeTool } from './toolRegistry.js';
import { retry } from './retryWrapper.js';
import { HistoryMessage, AiSettings, ToolCall, StreamResult, StreamChunk, ToolDefinition } from '../types.js';
import { ApiAdapter, getAdapter } from './adapters/apiAdapter.js';
import { createLogger } from '../utils/logger.js';

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

// 调用 AI API，返回 fetch Response
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

// 读取 SSE 流：通过 Adapter 解析每行 data，累加 content/reasoning/tool_calls
// streamToClient=true 时，将每块内容实时写入 Express Response
// options.eventType 设置后，写入 SSE 时在 data JSON 中添加 type 字段（用于 ReAct 区分事件类型）
// options.signal 用于提前中止读取
export async function readStream(
  response: Response,
  res: ExpressResponse,
  streamToClient: boolean,
  adapter: ApiAdapter,
  options?: { eventType?: string; signal?: AbortSignal },
): Promise<StreamResult> {
  if (!response.ok) {
    const errorText = await response.text();
    const err: any = new Error(`AI API error (${response.status}): ${errorText}`);
    err.status = response.status;
    throw err;
  }

  if (streamToClient && !res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
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
          if (streamToClient) res.write('data: [DONE]\n\n');
          break;
        }

        // tool_call 流式片段，按 index 累加
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
          if (streamToClient) {
            const sseChunk: StreamChunk = { content: chunk.content };
            if (options?.eventType) sseChunk.type = options.eventType;
            res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          }
        }

        if (chunk.reasoning) {
          fullReasoning += chunk.reasoning;
          if (streamToClient) {
            const sseChunk: StreamChunk = { reasoning: chunk.reasoning };
            if (options?.eventType) sseChunk.type = options.eventType;
            res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const hasToolCalls = toolCalls.length > 0;
  return { content: fullContent, reasoning: fullReasoning, toolCalls: hasToolCalls ? (toolCalls as ToolCall[]) : null };
}

// 核心入口：发起 AI 流式对话，支持无工具/有工具两条路径
export async function streamChat(messages: HistoryMessage[], settings: AiSettings, res: ExpressResponse, agent?: string): Promise<StreamResult> {
  const { apiUrl, apiKey, apiType } = settings;

  if (!apiUrl || !apiKey) {
    res.status(400).json({ error: 'API URL or API Key not configured' });
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
      const result = await readStream(response, res, true, adapter);
      if (!res.writableEnded) {
        res.end();
      }
      return result;
    } catch (err) {
      const error = err as any;
      if (!res.headersSent) {
        res.status(error.status || 500).json({ error: error.message });
      }
      return { content: '', reasoning: '', toolCalls: null };
    }
  }

  // 工具路径：先缓存首轮响应判断是否触发 tool_call
  const body1 = adapter.buildRequest(messages, settings, tools);
  const response1 = await streamFromAPI(url, headers, body1, 'streamChat-tool1');

  let result: StreamResult;
  try {
    result = await readStream(response1, res, false, adapter);
  } catch (err) {
    const error = err as any;
    if (!res.headersSent) {
      res.status(error.status || 500).json({ error: error.message });
    }
    return { content: '', reasoning: '', toolCalls: null };
  }

  // 未触发工具调用 → 刷新缓存内容到前端
  if (!result.toolCalls) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    if (result.content) {
      res.write(`data: ${JSON.stringify({ content: result.content })}\n\n`);
    }
    if (result.reasoning) {
      res.write(`data: ${JSON.stringify({ reasoning: result.reasoning })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return { content: result.content, reasoning: result.reasoning, toolCalls: null };
  }

  // ---- 工具调用路径：执行工具后二次调用 AI ----
  const toolMessages: HistoryMessage[] = [];
  for (const tc of result.toolCalls) {
    let toolResult: unknown;
    try {
      toolResult = await executeTool(tc);
      console.log('[aiProxy] toolResult:', JSON.stringify(toolResult).substring(0, 200));
    } catch (err) {
      toolResult = { error: (err as Error).message };
    }
    toolMessages.push({ role: 'assistant', content: null as unknown as string, tool_calls: [tc], reasoning: result.reasoning || undefined });
    toolMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
  }

  const secondMessages: HistoryMessage[] = [
    ...messages.map(m => ({ role: m.role, content: m.content, reasoning: m.reasoning })),
    ...toolMessages,
  ];

  const body2 = adapter.buildRequest(secondMessages, settings);
  const response2 = await streamFromAPI(url, headers, body2, 'streamChat-tool2');

  let secondResult: StreamResult;
  try {
    secondResult = await readStream(response2, res, true, adapter);
  } catch (err) {
    const error = err as any;
    if (!res.headersSent) {
      res.status(error.status || 500).json({ error: error.message });
    } else {
      res.end();
    }
    return { content: '', reasoning: '', toolCalls: null };
  }

  res.write('data: [DONE]\n\n');
  res.end();
  return { content: secondResult.content, reasoning: secondResult.reasoning, toolCalls: null };
}

// ── ReAct 循环引擎 ──
export async function reactChat(messages: HistoryMessage[], settings: AiSettings, res: ExpressResponse, agent?: string, signal?: AbortSignal): Promise<StreamResult> {
  const { apiUrl, apiKey } = settings;

  if (!apiUrl || !apiKey) {
    if (!res.headersSent) res.status(400).json({ error: 'API URL or API Key not configured' });
    return { content: '', reasoning: '', toolCalls: null };
  }

  const adapter = getApiAdapter(settings);
  const url = adapter.getUrl(apiUrl);
  const headers = adapter.getHeaders(apiKey);

  const maxIterations = Math.max(1, Math.min(20, settings.reactMaxIterations ?? 5));
  const maxRetries = Math.max(0, Math.min(10, settings.toolMaxRetries ?? 5));
  const tools = await getAllToolDefinitions(agent);

  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  let currentMessages: HistoryMessage[] = [...messages];
  let finalContent = '';
  let finalReasoning = '';
  let streamedAsAnswer = false;

  let iteration = 0;

  while (iteration < maxIterations) {
    if (res.destroyed || res.writableEnded || signal?.aborted) break;

    const isLast = iteration === maxIterations - 1;
    const body = adapter.buildRequest(currentMessages, settings, tools);

    let response: Response;
    try {
      response = await streamFromAPI(url, headers, body, 'reactChat');
    } catch (err) {
      console.error('[reactChat] streamFromAPI failed:', err);
      if (!res.writableEnded) res.end();
      return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
    }

    const eventType = isLast ? 'answer' : 'thought';
    let result: StreamResult;
    try {
      result = await readStream(response, res, true, adapter, { eventType, signal });
    } catch (err) {
      const error = err as any;
      console.error('[reactChat] readStream failed:', error.message);
      if (!res.writableEnded) res.end();
      return { content: result?.content || finalContent, reasoning: result?.reasoning || finalReasoning, toolCalls: null };
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalContent = result.content;
      finalReasoning = result.reasoning;
      if (eventType === 'answer') streamedAsAnswer = true;
      break;
    }

    const toolMessages: HistoryMessage[] = [];
    const toolPromises = result.toolCalls.map(async (tc) => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: 'tool_call_start',
          toolName: tc.function.name,
          arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })(),
        })}\n\n`);
      }

      let toolResult: unknown;
      let succeeded = false;
      let attempts = 0;

      try {
        toolResult = await retry(() => executeTool(tc), {
          maxRetries,
          baseDelay: 1000,
          maxDelay: 16000,
          onRetry: (attempt, error) => {
            attempts = attempt;
            if (!res.destroyed && !res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'tool_call_error',
                toolName: tc.function.name,
                error: error.message.substring(0, 200),
                retryCount: attempt,
                maxRetries,
              })}\n\n`);
            }
          },
        });
        succeeded = true;
      } catch (err) {
        toolResult = { error: `All retries failed: ${(err as Error).message}` };
      }

      if (!res.destroyed && !res.writableEnded) {
        const resultStr = JSON.stringify(toolResult);
        res.write(`data: ${JSON.stringify({
          type: succeeded ? 'tool_call_end' : 'tool_call_error',
          toolName: tc.function.name,
          ...(succeeded
            ? { result: resultStr.substring(0, 2000) }
            : { error: resultStr.substring(0, 2000), retryCount: attempts }
          ),
        })}\n\n`);
      }

      const resultStr = JSON.stringify(toolResult);
      toolMessages.push({
        role: 'assistant',
        content: null as unknown as string,
        tool_calls: [tc],
        reasoning: result.reasoning || undefined,
      });
      toolMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr.substring(0, 5000),
      });
    });

    await Promise.all(toolPromises);
    currentMessages.push(...toolMessages);
    iteration++;
  }

  if (!streamedAsAnswer && !res.writableEnded) {
    if (finalReasoning) {
      res.write(`data: ${JSON.stringify({ type: 'thought', reasoning: finalReasoning })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'answer_ready' })}\n\n`);
  }

  if (!res.writableEnded) {
    res.write('data: [DONE]\n\n');
    res.end();
  }

  return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
}

// 非流式调用 AI 生成对话标题（保持 OpenAI Chat 格式）
export async function generateTitle(settings: AiSettings, userContent: string, assistantContent: string): Promise<string> {
  const { apiUrl, apiKey } = settings;
  if (!apiUrl || !apiKey) return '';

  const url = apiUrl.replace(/\/+$/, '') + '/v1/chat/completions';

  const body = {
    model: settings.modelId,
    messages: [
      { role: 'system', content: '根据对话内容生成一个简短的标题（最多6个汉字或12个英文字符）。只返回标题本身，不要引号、标点和解释。\nGenerate a very short title (max 6 Chinese characters or 12 English characters) for this conversation. Return ONLY the title.' },
      { role: 'user', content: userContent },
      { role: 'assistant', content: assistantContent },
    ],
    stream: false,
    max_tokens: 60,
    temperature: 0.5,
    thinking: { type: 'disabled' },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[generateTitle] API error:', response.status, errText);
      return fallbackTitle(userContent);
    }

    const data = await response.json() as any;
    console.log('[generateTitle] full response:', JSON.stringify(data).substring(0, 500));

    let title = '';
    const msg = data.choices?.[0]?.message;
    if (msg?.content?.trim()) {
      title = msg.content.trim();
    } else if (msg?.reasoning_content?.trim()) {
      title = msg.reasoning_content.trim();
    } else if (data.choices?.[0]?.text) {
      title = data.choices[0].text.trim();
    }

    title = title.replace(/^["'「「『""]+|["'」」』""]+$/g, '').trim();

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
