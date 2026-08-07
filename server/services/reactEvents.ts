import type { Sink } from './sink.js';
import type { AgentStatusSnapshot } from './agentStatusBar.js';
import type { A2uiMessage } from './a2ui/types.js';

export type ReactRunState =
  | 'running'
  | 'awaiting_model'
  | 'executing_tools'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ReactEventBase {
  runId: string;
  sequence: number;
  round?: number;
}

/**
 * ReAct 运行期间向客户端发送的事件载荷。
 *
 * `thought` 表示模型的中间推理或规划，`answer` 表示面向用户的回答内容。
 */
export type ReactEventPayload =
  /** 标记一次 ReAct 运行开始。 */
  | { type: 'run_started'; state: 'running' }
  /** 标记模型开始处理当前轮次。 */
  | { type: 'round_started'; state: 'awaiting_model'; round: number }
  /** 更新 Agent 当前阶段、轮次、工具调用计数和耗时等运行状态。 */
  | ({ type: 'agent_status' } & AgentStatusSnapshot)
  /** 发送模型的中间思考或规划内容，不代表最终回答。 */
  | { type: 'thought'; content?: string; reasoning?: string; round?: number }
  /** 发送面向用户的最终回答增量内容。 */
  | { type: 'answer'; content?: string; reasoning?: string; round?: number }
  /** 标记开始调用工具，并提供工具名称、参数和调用标识。 */
  | {
      type: 'tool_call_start';
      state: 'executing_tools';
      round: number;
      callId: string;
      toolName: string;
      arguments: unknown;
      summary?: string;
    }
  /** 标记工具调用失败，并说明是否会重试及当前重试次数。 */
  | {
      type: 'tool_call_error';
      round: number;
      callId: string;
      toolName: string;
      error: string;
      retryCount: number;
      phase: 'retrying' | 'final';
      status: 'retrying' | 'failed' | 'approval_required';
      maxRetries?: number;
    }
  /** 请求用户批准需要人工确认的工具调用。 */
  | {
      type: 'approval_required';
      round: number;
      callId: string;
      toolName: string;
      approvalId?: string;
      reason: string;
    }
  /** 标记工具调用成功结束，并返回工具结果和耗时。 */
  | {
      type: 'tool_call_end';
      round: number;
      callId: string;
      toolName: string;
      result: string;
      duration?: number;
      status: 'success';
      summary?: string;
    }
  /** 检测到重复工具调用，运行将转入最终回答阶段。 */
  | { type: 'loop_detected'; state: 'finalizing'; round: number; message: string }
  /** 标记回答内容已经准备完成。 */
  | { type: 'answer_ready' }
  /** 发送 A2UI 片段或组件消息。 */
  | { type: 'a2ui'; segmentId: string; surfaceId: string; message: A2uiMessage; round?: number }
  /** 标记运行成功结束，并携带最终回答、推理摘要和 token 估算。 */
  | { type: 'run_completed'; state: 'completed'; content: string; reasoning: string; estimatedTokens?: number }
  /** 标记运行因错误失败。 */
  | { type: 'run_failed'; state: 'failed'; error: string }
  /** 标记运行被用户或系统取消。 */
  | { type: 'run_cancelled'; state: 'cancelled' };

export type ReactEvent = ReactEventBase & ReactEventPayload;

const TERMINAL_TYPES = new Set<ReactEventPayload['type']>([
  'run_completed',
  'run_failed',
  'run_cancelled',
]);

/**
 * 为一次 ReAct 运行分配序列号，并保证最多发送一个终态事件。
 */
export class ReactEventEmitter {
  private sequence = 0;
  private terminal = false;

  constructor(
    private readonly sink: Sink,
    private readonly runId: string,
  ) {}

  emit(payload: ReactEventPayload): boolean {
    if (this.terminal || this.sink.writableEnded) return false;

    const event = {
      ...payload,
      runId: this.runId,
      sequence: ++this.sequence,
    } as ReactEvent;

    if (this.sink.writeEvent) {
      this.sink.writeEvent(event);
    } else {
      this.sink.write(JSON.stringify(event));
    }

    if (TERMINAL_TYPES.has(payload.type)) {
      this.terminal = true;
    }
    return true;
  }

  get isTerminal(): boolean {
    return this.terminal;
  }
}

export function isReactTerminalEvent(event: ReactEvent): boolean {
  return TERMINAL_TYPES.has(event.type);
}
