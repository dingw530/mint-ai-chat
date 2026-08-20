import type { ReactEvent, ReactEventBase, ReactEventPayload } from './reactEvents.js';

export type AgentRunPhase =
  | 'running'
  | 'paused_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentRunApproval {
  approvalId?: string;
  callId: string;
  toolName: string;
  reason: string;
}

export interface AgentRunToolState {
  callId: string;
  toolName: string;
  status: 'running' | 'success' | 'failed' | 'retrying' | 'approval_required';
}

export interface AgentRunSnapshot {
  runId: string;
  conversationId?: string;
  phase: AgentRunPhase;
  sequence: number;
  round: number;
  toolCalls: AgentRunToolState[];
  terminal: boolean;
  approval?: AgentRunApproval;
}

export type AgentRunSubscriber = (event: ReactEvent) => void;

export interface AgentRunOptions {
  runId: string;
  conversationId?: string;
}

const TERMINAL_EVENT_TYPES = new Set<ReactEventPayload['type']>([
  'run_completed',
  'run_failed',
  'run_cancelled',
]);

/**
 * Owns the in-memory lifecycle, event ordering, and subscriber boundary of one agent run.
 */
export class AgentRun {
  private readonly subscribers = new Set<AgentRunSubscriber>();
  private readonly toolCalls = new Map<string, AgentRunToolState>();
  private sequence = 0;
  private round = 0;
  private phase: AgentRunPhase = 'running';
  private approval?: AgentRunApproval;
  private terminal = false;

  constructor(private readonly options: AgentRunOptions) {}

  /** Publishes one typed runtime event and returns it, or undefined after a terminal event. */
  publish(payload: ReactEventPayload): ReactEvent | undefined {
    if (this.terminal) return undefined;

    this.updateState(payload);
    const event = withEventIdentity(payload, {
      runId: this.options.runId,
      ...(this.options.conversationId ? { conversationId: this.options.conversationId } : {}),
      sequence: ++this.sequence,
    });
    this.notifySubscribers(event);
    return event;
  }

  /** Registers an event subscriber and returns an idempotent cleanup function. */
  subscribe(subscriber: AgentRunSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  /** Returns a defensive snapshot suitable for transport, UI, or evaluation consumers. */
  getSnapshot(): AgentRunSnapshot {
    return {
      runId: this.options.runId,
      ...(this.options.conversationId ? { conversationId: this.options.conversationId } : {}),
      phase: this.phase,
      sequence: this.sequence,
      round: this.round,
      toolCalls: [...this.toolCalls.values()].map((toolCall) => ({ ...toolCall })),
      terminal: this.terminal,
      ...(this.approval ? { approval: { ...this.approval } } : {}),
    };
  }

  /** Resumes a paused run only when the supplied approval belongs to its active pause. */
  resumeApproval(approvalId: string): boolean {
    if (this.terminal || this.phase !== 'paused_for_approval' || this.approval?.approvalId !== approvalId) {
      return false;
    }
    this.phase = 'running';
    this.approval = undefined;
    return true;
  }

  /** Cancels the run by publishing its single terminal cancellation event. */
  cancel(): void {
    this.publish({ type: 'run_cancelled', state: 'cancelled' });
  }

  get isTerminal(): boolean {
    return this.terminal;
  }

  get runId(): string {
    return this.options.runId;
  }

  private updateState(payload: ReactEventPayload): void {
    if ('round' in payload && typeof payload.round === 'number') {
      this.round = Math.max(this.round, payload.round);
    }

    if (payload.type === 'tool_call_start') {
      this.toolCalls.set(payload.callId, {
        callId: payload.callId,
        toolName: payload.toolName,
        status: 'running',
      });
    }

    if (payload.type === 'tool_call_end' || payload.type === 'tool_call_error') {
      this.toolCalls.set(payload.callId, {
        callId: payload.callId,
        toolName: payload.toolName,
        status: payload.type === 'tool_call_end' ? 'success' : payload.status,
      });
    }

    if (payload.type === 'approval_required') {
      this.phase = 'paused_for_approval';
      this.approval = {
        approvalId: payload.approvalId,
        callId: payload.callId,
        toolName: payload.toolName,
        reason: payload.reason,
      };
      const toolCall = this.toolCalls.get(payload.callId);
      if (toolCall) toolCall.status = 'approval_required';
    }

    if (TERMINAL_EVENT_TYPES.has(payload.type)) {
      this.terminal = true;
      this.approval = undefined;
      this.phase = getTerminalPhase(payload.type);
    }
  }

  private notifySubscribers(event: ReactEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        console.error('[AgentRun] event subscriber failed:', error);
      }
    }
  }
}

function withEventIdentity<T extends ReactEventPayload>(
  payload: T,
  identity: ReactEventBase,
): T & ReactEventBase {
  return { ...payload, ...identity };
}

function getTerminalPhase(type: ReactEventPayload['type']): AgentRunPhase {
  if (type === 'run_completed') return 'completed';
  if (type === 'run_failed') return 'failed';
  return 'cancelled';
}

/** Manages active and approval-paused runs without providing persistence or restart recovery. */
export class AgentRunRegistry {
  private readonly runs = new Map<string, AgentRun>();
  private readonly runsByConversation = new Map<string, string>();

  /** Adds a run to the registry and releases it when it reaches a terminal state. */
  register(run: AgentRun): () => void {
    const snapshot = run.getSnapshot();
    this.runs.set(snapshot.runId, run);
    if (snapshot.conversationId) this.runsByConversation.set(snapshot.conversationId, snapshot.runId);
    return run.subscribe((event) => {
      if (TERMINAL_EVENT_TYPES.has(event.type)) this.delete(event.runId);
    });
  }

  /** Finds a non-terminal run by its stable run ID. */
  get(runId: string): AgentRun | undefined {
    const run = this.runs.get(runId);
    return run?.isTerminal ? undefined : run;
  }

  /** Finds the active run owned by one conversation. */
  getByConversation(conversationId: string): AgentRun | undefined {
    const runId = this.runsByConversation.get(conversationId);
    return runId ? this.get(runId) : undefined;
  }

  /** Removes a run and its conversation index when the index still points to that run. */
  delete(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const snapshot = run.getSnapshot();
    this.runs.delete(runId);
    if (snapshot.conversationId && this.runsByConversation.get(snapshot.conversationId) === runId) {
      this.runsByConversation.delete(snapshot.conversationId);
    }
  }

  /** Clears all registered runs for test isolation. */
  clear(): void {
    this.runs.clear();
    this.runsByConversation.clear();
  }
}

export const agentRunRegistry = new AgentRunRegistry();
