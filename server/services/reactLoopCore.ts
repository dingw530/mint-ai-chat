import { HistoryMessage, AiSettings, StreamResult } from '../types.js';
import { getAdapter } from './adapters/apiAdapter.js';
import { toolLoopEngine } from './toolRoundEngine.js';
import { getAllToolDefinitions } from './toolRegistry.js';
import { Sink } from './sink.js';

// ── ReAct 循环引擎 ──
export async function reactChat(messages: HistoryMessage[], settings: AiSettings, sink: Sink, agent?: string, signal?: AbortSignal): Promise<StreamResult> {
  const { apiUrl, apiKey } = settings;

  if (!apiUrl || !apiKey) {
    sink.write(JSON.stringify({ error: 'API URL or API Key not configured' }));
    sink.end();
    return { content: '', reasoning: '', toolCalls: null };
  }

  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) {
    sink.write(JSON.stringify({ error: `Unsupported API type: ${settings.apiType}` }));
    sink.end();
    return { content: '', reasoning: '', toolCalls: null };
  }

  const maxIterations = Math.max(1, Math.min(20, settings.reactMaxIterations ?? 5));
  const maxRetries = Math.max(0, Math.min(10, settings.toolMaxRetries ?? 5));
  const tools = await getAllToolDefinitions(agent);

  let currentMessages: HistoryMessage[] = [...messages];
  let finalContent = '';
  let finalReasoning = '';
  let streamedAsAnswer = false;

  let iteration = 0;

  while (iteration < maxIterations) {
    if (sink.writableEnded || signal?.aborted) break;

    const isLast = iteration === maxIterations - 1;
    const label = isLast ? 'react-answer' : 'react-thought';

    let result: StreamResult;
    try {
      result = await toolLoopEngine.executeRound(
        { messages: currentMessages, settings, tools, adapter, signal, label },
        sink,
      );
    } catch (err) {
      console.error('[reactChat] executeRound failed:', err);
      if (!sink.writableEnded) sink.end();
      return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalContent = result.content;
      finalReasoning = result.reasoning;
      streamedAsAnswer = true;
      break;
    }

    const toolMessages: HistoryMessage[] = [];
    const toolPromises = result.toolCalls.map(async (tc) => {
      if (!sink.writableEnded) {
        sink.write(JSON.stringify({
          type: 'tool_call_start',
          toolName: tc.function.name,
          arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })(),
        }));
      }

      let attempts = 0;

      const { assistantMsg, toolMsg, succeeded } = await toolLoopEngine.executeToolCallWithRetry(
        tc,
        result.reasoning,
        maxRetries,
        (attempt, error) => {
          attempts = attempt;
          if (!sink.writableEnded) {
            sink.write(JSON.stringify({
              type: 'tool_call_error',
              toolName: tc.function.name,
              error: error.message.substring(0, 200),
              retryCount: attempt,
              maxRetries,
            }));
          }
        },
      );

      const resultStr = toolMsg.content;

      if (!sink.writableEnded) {
        sink.write(JSON.stringify({
          type: succeeded ? 'tool_call_end' : 'tool_call_error',
          toolName: tc.function.name,
          ...(succeeded
            ? { result: resultStr.substring(0, 2000) }
            : { error: resultStr.substring(0, 2000), retryCount: attempts }
          ),
        }));
      }

      toolMessages.push(assistantMsg, toolMsg);
    });

    await Promise.all(toolPromises);
    currentMessages.push(...toolMessages);
    iteration++;
  }

  if (!streamedAsAnswer && !sink.writableEnded) {
    if (finalReasoning) {
      sink.write(JSON.stringify({ type: 'thought', reasoning: finalReasoning }));
    }
    sink.write(JSON.stringify({ type: 'answer_ready' }));
  }

  if (!sink.writableEnded) {
    sink.end();
  }

  return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
}
