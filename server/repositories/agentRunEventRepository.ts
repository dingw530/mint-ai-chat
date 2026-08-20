import type Database from 'better-sqlite3';
import { getDb } from '../db.js';

export const AGENT_RUN_EVENT_SCHEMA_VERSION = 1;

/** The deliberately small, non-sensitive event vocabulary used for recovery. */
export type PersistedAgentRunEvent =
  | { type: 'run_started'; runId: string; conversationId?: string }
  | { type: 'round_started'; runId: string; round: number }
  | { type: 'tool_call_started'; runId: string; callId: string; toolName: string; round: number }
  | { type: 'tool_call_finished'; runId: string; callId: string; toolName?: string; status: 'success' | 'failed' | 'cancelled' }
  | { type: 'approval_required'; runId: string; callId: string; approvalId?: string }
  | { type: 'run_terminal'; runId: string; outcome: 'completed' | 'failed' | 'cancelled' };

export interface AgentRunEventInput {
  sequence: number;
  event: PersistedAgentRunEvent;
  schemaVersion?: number;
  createdAt?: string;
}

export interface AgentRunEventWriter {
  append(input: AgentRunEventInput): AgentRunEventRecord;
}

export interface AgentRunEventRecord {
  runId: string;
  sequence: number;
  schemaVersion: number;
  event: PersistedAgentRunEvent;
  createdAt: string;
}

interface AgentRunEventRow {
  run_id: string;
  sequence: number;
  schema_version: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export class AgentRunEventRepository {
  private readonly database?: Database.Database;

  constructor(database?: Database.Database) {
    this.database = database;
  }

  /** Appends one event atomically, enforcing ordering, terminal, and idempotency rules. */
  append(input: AgentRunEventInput): AgentRunEventRecord {
    const event = sanitizeEvent(input.event);
    validateInput(input, event);
    const schemaVersion = input.schemaVersion ?? AGENT_RUN_EVENT_SCHEMA_VERSION;
    if (schemaVersion !== AGENT_RUN_EVENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported AgentRun event schema version: ${schemaVersion}`);
    }
    const createdAt = input.createdAt ?? new Date().toISOString();
    const db = this.getDatabase();
    const append = db.transaction(() => {
      const existing = db.prepare(
        'SELECT * FROM agent_run_events WHERE run_id = ? AND sequence = ?',
      ).get(event.runId, input.sequence) as AgentRunEventRow | undefined;
      if (existing) {
        const existingEvent = decodeRow(existing);
        if (
          existing.schema_version === schemaVersion
          && existing.event_type === event.type
          && existing.payload_json === JSON.stringify(toPayload(event))
        ) return existingEvent;
        throw new Error(`Conflicting AgentRun event at ${event.runId}#${input.sequence}`);
      }

      const last = db.prepare(
        'SELECT * FROM agent_run_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1',
      ).get(event.runId) as AgentRunEventRow | undefined;
      if (last) {
        if (last.event_type === 'run_terminal') {
          throw new Error(`Cannot append AgentRun event after terminal state: ${event.runId}`);
        }
        if (input.sequence !== last.sequence + 1) {
          throw new Error(`AgentRun event sequence must be ${last.sequence + 1}, received ${input.sequence}`);
        }
      } else if (input.sequence !== 1) {
        throw new Error(`AgentRun event sequence must start at 1, received ${input.sequence}`);
      } else if (event.type !== 'run_started') {
        throw new Error(`AgentRun must start with run_started, received ${event.type}`);
      }

      db.prepare(`
        INSERT INTO agent_run_events
          (run_id, sequence, schema_version, event_type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        event.runId,
        input.sequence,
        schemaVersion,
        event.type,
        JSON.stringify(toPayload(event)),
        createdAt,
      );
      return {
        runId: event.runId,
        sequence: input.sequence,
        schemaVersion,
        event,
        createdAt,
      };
    });
    return append();
  }

  /** Reads an immutable, sequence-ordered event log and fails on malformed JSON. */
  read(runId: string): AgentRunEventRecord[] {
    const rows = this.getDatabase().prepare(
      'SELECT * FROM agent_run_events WHERE run_id = ? ORDER BY sequence ASC',
    ).all(runId) as AgentRunEventRow[];
    return rows.map(decodeRow);
  }

  /** Lists runs whose latest durable event is not terminal. */
  listOpenRuns(): string[] {
    const rows = this.getDatabase().prepare(`
      SELECT run_id
      FROM agent_run_events
      GROUP BY run_id
      HAVING MAX(sequence) FILTER (WHERE event_type = 'run_terminal') IS NULL
      ORDER BY run_id ASC
    `).all() as Array<{ run_id: string }>;
    return rows.map((row) => row.run_id);
  }

  private getDatabase(): Database.Database {
    return this.database ?? getDb();
  }
}

export const agentRunEventRepository = new AgentRunEventRepository();

function validateInput(input: AgentRunEventInput, event: PersistedAgentRunEvent): void {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error(`Invalid AgentRun event sequence: ${input.sequence}`);
  }
  if (!event.runId || !event.runId.trim()) throw new Error('AgentRun event runId is required');
  if (event.type === 'round_started' || event.type === 'tool_call_started') {
    if (!Number.isSafeInteger(event.round) || event.round < 1) throw new Error('AgentRun event round is invalid');
  }
}

/** Copies only the recovery-safe fields, dropping arguments, results, and accidental secrets. */
function sanitizeEvent(event: PersistedAgentRunEvent): PersistedAgentRunEvent {
  switch (event.type) {
    case 'run_started': {
      requireText(event.runId, 'runId');
      return {
      type: event.type, runId: event.runId,
      ...(event.conversationId ? { conversationId: event.conversationId } : {}),
      };
    }
    case 'round_started':
      requireText(event.runId, 'runId');
      return { type: event.type, runId: event.runId, round: event.round };
    case 'tool_call_started':
      requireText(event.runId, 'runId');
      requireText(event.callId, 'callId');
      requireText(event.toolName, 'toolName');
      return { type: event.type, runId: event.runId, callId: event.callId, toolName: event.toolName, round: event.round };
    case 'tool_call_finished':
      requireText(event.runId, 'runId');
      requireText(event.callId, 'callId');
      if (!['success', 'failed', 'cancelled'].includes(event.status)) throw new Error(`Invalid tool outcome: ${String(event.status)}`);
      return {
        type: event.type, runId: event.runId, callId: event.callId,
        ...(event.toolName ? { toolName: event.toolName } : {}), status: event.status,
      };
    case 'approval_required':
      requireText(event.runId, 'runId');
      requireText(event.callId, 'callId');
      return {
        type: event.type, runId: event.runId, callId: event.callId,
        ...(event.approvalId ? { approvalId: event.approvalId } : {}),
      };
    case 'run_terminal':
      requireText(event.runId, 'runId');
      if (!['completed', 'failed', 'cancelled'].includes(event.outcome)) throw new Error(`Invalid AgentRun outcome: ${String(event.outcome)}`);
      return { type: event.type, runId: event.runId, outcome: event.outcome };
    default: return assertNever(event);
  }
}

function requireText(value: string, field: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AgentRun event ${field} is required`);
}

function toPayload(event: PersistedAgentRunEvent): Omit<PersistedAgentRunEvent, 'runId'> {
  const { runId: _runId, ...payload } = event;
  return payload;
}

function decodeRow(row: AgentRunEventRow): AgentRunEventRecord {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (error) {
    throw new Error(`Corrupt AgentRun event JSON at ${row.run_id}#${row.sequence}`, { cause: error });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Corrupt AgentRun event payload at ${row.run_id}#${row.sequence}`);
  }
  const decoded = { runId: row.run_id, type: row.event_type, ...payload } as PersistedAgentRunEvent;
  if (decoded.type !== row.event_type || decoded.runId !== row.run_id) {
    throw new Error(`Corrupt AgentRun event identity at ${row.run_id}#${row.sequence}`);
  }
  const event = sanitizeEvent(decoded);
  return {
    runId: row.run_id,
    sequence: row.sequence,
    schemaVersion: row.schema_version,
    event,
    createdAt: row.created_at,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported AgentRun event type: ${String(value)}`);
}
