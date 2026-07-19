import type { HistoryMessage, AiSettings, StreamResult } from '../types.js';
import { getAdapter } from './adapters/apiAdapter.js';
import { toolLoopEngine } from './toolRoundEngine.js';
import { getAllToolDefinitions, getToolCallSummary } from './toolRegistry.js';
import type { Sink } from './sink.js';
import { trimContext } from './utils/contextWindow.js';
import { v4 as uuidv4 } from 'uuid';
import { ReactEventEmitter } from './reactEvents.js';
import type { ReactEventPayload } from './reactEvents.js';

// ── 编辑距离相似度（用于循环检测） ──
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;

  const maxLen = Math.max(lenA, lenB);
  const matrix: number[][] = Array.from({ length: lenA + 1 }, () => Array(lenB + 1).fill(0));

  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[lenA][lenB];
  return 1 - distance / maxLen;
}

// ── ReAct 循环引擎 ──
export async function reactChat(
  messages: HistoryMessage[],
  settings: AiSettings,
  sink: Sink,
  agent?: string,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const runId = uuidv4();
  const events = new ReactEventEmitter(sink, runId);
  const finishSink = () => {
    if (!sink.writableEnded) sink.end();
  };
  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    events.emit({ type: 'run_failed', state: 'failed', error: message });
    finishSink();
  };

  events.emit({ type: 'run_started', state: 'running' });

  const { apiUrl, apiKey } = settings;
  if (!apiUrl || !apiKey) {
    fail(new Error('API URL or API Key not configured'));
    return { content: '', reasoning: '', toolCalls: null };
  }

  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) {
    fail(new Error(`Unsupported API type: ${settings.apiType}`));
    return { content: '', reasoning: '', toolCalls: null };
  }

  const maxIterations = Math.max(1, Math.min(20, settings.reactMaxIterations ?? 5));
  const maxRetries = Math.max(0, Math.min(10, settings.toolMaxRetries ?? 5));

  let tools;
  try {
    tools = await getAllToolDefinitions(agent);
  } catch (error) {
    fail(error);
    return { content: '', reasoning: '', toolCalls: null };
  }

  let currentMessages: HistoryMessage[] = [...messages];
  let finalContent = '';
  let finalReasoning = '';
  let streamedAsAnswer = false;
  let iteration = 0;
  const recentCallSignatures: string[] = [];
  let forceFinalAnswer = false;

  while (iteration < maxIterations && !events.isTerminal) {
    const round = iteration + 1;
    if (sink.writableEnded) break;
    if (signal?.aborted) {
      events.emit({ type: 'run_cancelled', state: 'cancelled' });
      break;
    }

    currentMessages = trimContext(currentMessages, {
      maxRounds: settings.maxContextRounds || 10,
    });

    const isLast = forceFinalAnswer || iteration === maxIterations - 1;
    const label = isLast ? 'react-answer' : 'react-thought';
    events.emit({ type: 'round_started', state: 'awaiting_model', round });

    let result: StreamResult;
    try {
      result = await toolLoopEngine.executeRound(
        {
          messages: currentMessages,
          settings,
          tools,
          adapter,
          signal,
          label,
          emitEvent: (event: ReactEventPayload) => {
            events.emit({
              ...event,
              ...(event.type === 'thought' || event.type === 'answer' ? { round } : {}),
            } as ReactEventPayload);
          },
        },
        sink,
      );
    } catch (error) {
      console.error('[reactChat] executeRound failed:', error);
      fail(error);
      break;
    }

    if (!result.toolCalls || result.toolCalls.length === 0) {
      finalContent = result.content;
      finalReasoning = result.reasoning;
      streamedAsAnswer = true;
      events.emit({
        type: 'run_completed',
        state: 'completed',
        content: finalContent,
        reasoning: finalReasoning,
      });
      break;
    }

    const toolResults = await Promise.all(
      result.toolCalls.map(async (originalCall, index) => {
        const callId = originalCall.id || `${runId}:r${round}:c${index}`;
        const toolCall = { ...originalCall, id: callId };
        const startedAt = Date.now();
        events.emit({
          type: 'tool_call_start',
          state: 'executing_tools',
          round,
          callId,
          toolName: toolCall.function.name,
          arguments: (() => {
            try {
              return JSON.parse(toolCall.function.arguments);
            } catch {
              return toolCall.function.arguments;
            }
          })(),
          summary: getToolCallSummary(toolCall),
        });

        let attempts = 0;
        const execution = await toolLoopEngine.executeToolCallWithRetry(
          toolCall,
          result.reasoning,
          maxRetries,
          (attempt, error) => {
            attempts = attempt;
            events.emit({
              type: 'tool_call_error',
              round,
              callId,
              toolName: toolCall.function.name,
              error: error.message.substring(0, 200),
              retryCount: attempt,
              maxRetries,
              phase: 'retrying',
              status: 'retrying',
            });
          },
        );
        const duration = Date.now() - startedAt;
        const resultStr = execution.toolMsg.content.substring(0, 2000);

        if (execution.succeeded) {
          events.emit({
            type: 'tool_call_end',
            round,
            callId,
            toolName: toolCall.function.name,
            result: resultStr,
            duration,
            status: 'success',
            summary: execution.resultSummary,
          });
        } else {
          events.emit({
            type: 'tool_call_error',
            round,
            callId,
            toolName: toolCall.function.name,
            error: resultStr,
            retryCount: attempts,
            phase: 'final',
            status: 'failed',
          });
        }

        return { index, assistantMsg: execution.assistantMsg, toolMsg: execution.toolMsg };
      }),
    );

    toolResults
      .sort((left, right) => left.index - right.index)
      .forEach(({ assistantMsg, toolMsg }) => currentMessages.push(assistantMsg, toolMsg));

    if (signal?.aborted) {
      events.emit({ type: 'run_cancelled', state: 'cancelled' });
      break;
    }

    const signature = result.toolCalls
      .map((tc) => `${tc.function.name}:${tc.function.arguments}`)
      .sort()
      .join('|');
    recentCallSignatures.push(signature);

    if (recentCallSignatures.length >= 3) {
      const last3 = recentCallSignatures.slice(-3);
      if (last3.every((s) => levenshteinSimilarity(s, last3[0]) > 0.7)) {
        forceFinalAnswer = true;
        events.emit({
          type: 'loop_detected',
          state: 'finalizing',
          round,
          message: '检测到重复工具调用，强制生成最终答案',
        });
      }
    }

    iteration++;
  }

  if (!events.isTerminal && !sink.writableEnded) {
    if (signal?.aborted) {
      events.emit({ type: 'run_cancelled', state: 'cancelled' });
    } else if (!streamedAsAnswer) {
      if (finalReasoning) events.emit({ type: 'thought', reasoning: finalReasoning });
      events.emit({ type: 'answer_ready' });
      events.emit({
        type: 'run_completed',
        state: 'completed',
        content: finalContent,
        reasoning: finalReasoning,
      });
    }
  }

  finishSink();
  return { content: finalContent, reasoning: finalReasoning, toolCalls: null };
}
