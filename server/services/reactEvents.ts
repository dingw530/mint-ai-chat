import type { Sink } from './sink.js';

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

export type ReactEventPayload =
  | { type: 'run_started'; state: 'running' }
  | { type: 'round_started'; state: 'awaiting_model'; round: number }
  | { type: 'thought' | 'answer'; content?: string; reasoning?: string }
  | {
      type: 'tool_call_start';
      state: 'executing_tools';
      round: number;
      callId: string;
      toolName: string;
      arguments: unknown;
      summary?: string;
    }
  | {
      type: 'tool_call_error';
      round: number;
      callId: string;
      toolName: string;
      error: string;
      retryCount: number;
      phase: 'retrying' | 'final';
      status: 'retrying' | 'failed';
      maxRetries?: number;
    }
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
  | { type: 'loop_detected'; state: 'finalizing'; round: number; message: string }
  | { type: 'answer_ready' }
  | { type: 'run_completed'; state: 'completed'; content: string; reasoning: string; estimatedTokens?: number }
  | { type: 'run_failed'; state: 'failed'; error: string }
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
