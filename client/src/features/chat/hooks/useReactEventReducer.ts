import type { ReActStep } from '@/types';

export type ReactEventStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ReactEventState {
  runId: string | null;
  status: ReactEventStatus;
  steps: ReActStep[];
  error?: string;
}

export interface ReactReducerEvent {
  type: string;
  runId?: string;
  callId?: string;
  toolName?: string;
  arguments?: unknown;
  result?: string;
  error?: string;
  retryCount?: number;
  duration?: number;
  content?: string;
}

export function createInitialReactEventState(): ReactEventState {
  return { runId: null, status: 'idle', steps: [] };
}

/**
 * 将新旧 ReAct 事件归约为展示状态，并按 callId 关联工具调用。
 */
export function reduceReactEvent(
  state: ReactEventState,
  event: ReactReducerEvent,
): ReactEventState {
  if (event.type === 'run_started') {
    return {
      runId: event.runId || state.runId,
      status: 'running',
      steps: [],
    };
  }

  if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
    return state;
  }

  if (event.runId && state.runId && event.runId !== state.runId) return state;

  switch (event.type) {
    case 'thought': {
      const content = event.content || '';
      if (!content) return state;
      const last = state.steps[state.steps.length - 1];
      if (last?.type === 'thought') {
        return {
          ...state,
          status: 'running',
          steps: [...state.steps.slice(0, -1), { ...last, content: last.content + content }],
        };
      }
      return { ...state, status: 'running', steps: [...state.steps, { type: 'thought', content }] };
    }
    case 'tool_call_start':
      return {
        ...state,
        status: 'running',
        steps: [
          ...state.steps,
          {
            type: 'tool_call_start',
            callId: event.callId,
            toolName: event.toolName || '',
            arguments: event.arguments as string,
          },
        ],
      };
    case 'tool_call_end':
      return {
        ...state,
        status: 'running',
        steps: [
          ...state.steps,
          {
            type: 'tool_call_end',
            callId: event.callId,
            toolName: event.toolName || '',
            result: event.result || '',
            duration: event.duration || 0,
          },
        ],
      };
    case 'tool_call_error':
      return {
        ...state,
        status: 'running',
        steps: [
          ...state.steps,
          {
            type: 'tool_call_error',
            callId: event.callId,
            toolName: event.toolName || '',
            error: event.error || '',
            retryCount: event.retryCount || 0,
          },
        ],
      };
    case 'answer_ready': {
      const last = state.steps[state.steps.length - 1];
      return last?.type === 'thought' ? { ...state, steps: state.steps.slice(0, -1) } : state;
    }
    case 'run_completed':
      return { ...state, status: 'completed' };
    case 'run_failed':
      return { ...state, status: 'failed', error: event.error };
    case 'run_cancelled':
      return { ...state, status: 'cancelled' };
    default:
      return state;
  }
}
