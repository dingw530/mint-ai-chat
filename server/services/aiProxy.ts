import { Response as ExpressResponse } from 'express';
import { getAllToolDefinitions } from './toolRegistry.js';
import { HistoryMessage, AiSettings, StreamResult } from '../types.js';
import { ApiAdapter, getAdapter } from './adapters/apiAdapter.js';
import { createLogger } from '../utils/logger.js';
import { toolLoopEngine, parseSSEStream } from './toolLoopEngine.js';
import { ResSink } from './sink.js';

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

// ── 兼容层：读取 SSE 流并实时写入 Express Response ──
// 新代码应直接使用 toolLoopEngine.executeRound() 或 parseSSEStream()
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

  const sink = streamToClient ? new ResSink(res) : undefined;
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
export async function streamChat(messages: HistoryMessage[], settings: AiSettings, res: ExpressResponse, agent?: string): Promise<StreamResult> {
  const { apiUrl, apiKey } = settings;

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

  // 工具路径：先通过引擎执行首轮，判断是否触发 tool_call
  let result: StreamResult;
  try {
    result = await toolLoopEngine.executeRound(
      { messages, settings, tools, adapter, label: 'streamChat-tool1' },
    );
  } catch (err) {
    const error = err as any;
    if (!res.headersSent) {
      res.status(error.status || 500).json({ error: error.message });
    }
    return { content: '', reasoning: '', toolCalls: null };
  }

  // 未触发工具调用 → 将缓存内容以 SSE 格式发送给前端
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
    const { assistantMsg, toolMsg } = await toolLoopEngine.executeToolCall(tc, result.reasoning);
    toolMessages.push(assistantMsg, toolMsg);
  }

  const secondMessages: HistoryMessage[] = [
    ...messages.map(m => ({ role: m.role, content: m.content, reasoning: m.reasoning })),
    ...toolMessages,
  ];

  const sink = new ResSink(res);
  if (!sink.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  let secondResult: StreamResult;
  try {
    secondResult = await toolLoopEngine.executeRound(
      { messages: secondMessages, settings, adapter, label: 'streamChat-tool2' },
      sink,
    );
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
    const label = isLast ? 'react-answer' : 'react-thought';
    const sink = new ResSink(res);

    let result: StreamResult;
    try {
      result = await toolLoopEngine.executeRound(
        { messages: currentMessages, settings, tools, adapter, signal, label },
        sink,
      );
    } catch (err) {
      console.error('[reactChat] executeRound failed:', err);
      if (!res.writableEnded) res.end();
      return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalContent = result.content;
      finalReasoning = result.reasoning;
      if (isLast) streamedAsAnswer = true;
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

      let attempts = 0;

      const { assistantMsg, toolMsg, succeeded } = await toolLoopEngine.executeToolCallWithRetry(
        tc,
        result.reasoning,
        maxRetries,
        (attempt, error) => {
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
      );

      const resultStr = toolMsg.content;

      if (!res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: succeeded ? 'tool_call_end' : 'tool_call_error',
          toolName: tc.function.name,
          ...(succeeded
            ? { result: resultStr.substring(0, 2000) }
            : { error: resultStr.substring(0, 2000), retryCount: attempts }
          ),
        })}\n\n`);
      }

      toolMessages.push(assistantMsg, toolMsg);
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
