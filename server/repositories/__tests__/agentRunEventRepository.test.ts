import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../migrations/index.js';
import { AgentRunEventRepository } from '../agentRunEventRepository.js';

describe('AgentRunEventRepository', () => {
  let db: Database.Database;
  let repository: AgentRunEventRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    repository = new AgentRunEventRepository(db);
  });

  it('appends ordered events and makes identical retries idempotent', () => {
    const started = repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-1', conversationId: 'c-1' } });
    const retried = repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-1', conversationId: 'c-1' } });
    repository.append({ sequence: 2, event: { type: 'round_started', runId: 'run-1', round: 1 } });

    expect(retried).toEqual(started);
    expect(repository.read('run-1')).toHaveLength(2);
  });

  it('rejects gaps, conflicting retries, and events after terminal', () => {
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-2' } });
    expect(() => repository.append({ sequence: 3, event: { type: 'round_started', runId: 'run-2', round: 1 } })).toThrow(/sequence/);
    expect(() => repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-2', conversationId: 'different' } })).toThrow(/Conflicting/);
    repository.append({ sequence: 2, event: { type: 'run_terminal', runId: 'run-2', outcome: 'cancelled' } });
    expect(() => repository.append({ sequence: 3, event: { type: 'round_started', runId: 'run-2', round: 2 } })).toThrow(/terminal/);
  });

  it('persists only the safe event whitelist', () => {
    repository.append({
      sequence: 1,
      event: { type: 'run_started', runId: 'run-3', conversationId: 'c-3', secret: 'should-not-persist' } as never,
    });
    repository.append({
      sequence: 2,
      event: { type: 'tool_call_started', runId: 'run-3', callId: 'call-3', toolName: 'bash', round: 1, arguments: { authorization: 'secret' } } as never,
    });
    const row = db.prepare('SELECT payload_json FROM agent_run_events WHERE run_id = ? AND sequence = 2').get('run-3') as { payload_json: string };
    expect(row.payload_json).not.toContain('authorization');
    expect(row.payload_json).not.toContain('secret');
  });

  it('lists only runs without a durable terminal event', () => {
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'open-run' } });
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'closed-run' } });
    repository.append({ sequence: 2, event: { type: 'run_terminal', runId: 'closed-run', outcome: 'completed' } });
    expect(repository.listOpenRuns()).toEqual(['open-run']);
  });

  it('fails closed for invalid status and corrupt JSON', () => {
    expect(() => repository.append({
      sequence: 1,
      event: { type: 'run_terminal', runId: 'invalid-run', outcome: 'not-an-outcome' } as never,
    })).toThrow(/Invalid AgentRun outcome/);
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'corrupt-run' } });
    db.prepare('UPDATE agent_run_events SET payload_json = ? WHERE run_id = ?').run('{bad', 'corrupt-run');
    expect(() => repository.read('corrupt-run')).toThrow(/Corrupt AgentRun event JSON/);
  });
});
