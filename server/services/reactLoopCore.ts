import { HistoryMessage, AiSettings, StreamResult } from '../types.js';
import { getAdapter } from './adapters/apiAdapter.js';
import { toolLoopEngine } from './toolRoundEngine.js';
import { getAllToolDefinitions } from './toolRegistry.js';
import { Sink } from './sink.js';
import { trimContext } from './utils/contextWindow.js';


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
  const recentCallSignatures: string[] = [];
  let forceFinalAnswer = false;


  while (iteration < maxIterations) {
    if (sink.writableEnded || signal?.aborted) break;

    // 滑动窗口：保留 system + 最近 N 轮对话，防止 context window 超限
    currentMessages = trimContext(currentMessages, {
      maxRounds: settings.maxContextRounds || 10,
    });

    const isLast = forceFinalAnswer || iteration === maxIterations - 1;
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

    // ── 循环检测：连续 3 轮相同工具+相似参数 → 强制回答 ──
    if (result.toolCalls && result.toolCalls.length > 0) {
      const signature = result.toolCalls
        .map(tc => `${tc.function.name}:${tc.function.arguments}`)
        .sort()
        .join('|');
      recentCallSignatures.push(signature);

      if (recentCallSignatures.length >= 3) {
        const last3 = recentCallSignatures.slice(-3);
        if (last3.every(s => levenshteinSimilarity(s, last3[0]) > 0.7)) {
          forceFinalAnswer = true;
          if (!sink.writableEnded) {
            sink.write(JSON.stringify({
              type: 'loop_detected',
              message: '检测到重复工具调用，强制生成最终答案',
            }));
          }
        }
      }
    }

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
