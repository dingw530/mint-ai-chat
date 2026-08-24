import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../migrations/index.js';
import { AgentRunEventRepository } from '../../repositories/agentRunEventRepository.js';
import { recoverOpenAgentRuns, reduceAgentRunEvents } from '../agentRunRecoveryService.js';

function createRepository(): AgentRunEventRepository {
  const db = new Database(':memory:');
  runMigrations(db);
  return new AgentRunEventRepository(db);
}

describe('agentRunRecoveryService', () => {
  it('rebuilds a completed run without replaying anything', () => {
    const repository = createRepository();
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-1', conversationId: 'c-1' } });
    repository.append({ sequence: 2, event: { type: 'round_started', runId: 'run-1', round: 1 } });
    repository.append({ sequence: 3, event: { type: 'tool_call_started', runId: 'run-1', callId: 'call-1', toolName: 'bash', round: 1 } });
    repository.append({ sequence: 4, event: { type: 'tool_call_finished', runId: 'run-1', callId: 'call-1', status: 'success' } });
    repository.append({ sequence: 5, event: { type: 'run_terminal', runId: 'run-1', outcome: 'completed' } });

    const recovered = reduceAgentRunEvents(repository.read('run-1'));
    expect(recovered).toMatchObject({ runId: 'run-1', phase: 'completed', sequence: 5, round: 1, terminal: true, recovery: 'clean', unknownToolCalls: [] });
    expect(recovered.toolCalls).toEqual([{ callId: 'call-1', toolName: 'bash', status: 'success' }]);
  });

  it('marks unfinished tools unknown after interruption and does not execute them', () => {
    const repository = createRepository();
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-2' } });
    repository.append({ sequence: 2, event: { type: 'tool_call_started', runId: 'run-2', callId: 'call-2', toolName: 'write_file', round: 1 } });
    repository.append({ sequence: 3, event: { type: 'approval_required', runId: 'run-2', callId: 'call-2', approvalId: 'approval-2' } });

    const [recovered] = recoverOpenAgentRuns(repository);
    expect(recovered).toMatchObject({ phase: 'paused_for_approval', recovery: 'interrupted', unknownToolCalls: ['call-2'] });
    expect(recovered.toolCalls[0]).toMatchObject({ callId: 'call-2', status: 'tool_outcome_unknown' });
    expect(recovered.approval).toMatchObject({ callId: 'call-2' });
    expect(recoverOpenAgentRuns(repository)).toEqual(recoverOpenAgentRuns(repository));
  });

  it('fails closed for gaps, unknown events, and malformed state', () => {
    const repository = createRepository();
    repository.append({ sequence: 1, event: { type: 'run_started', runId: 'run-3' } });
    repository.append({ sequence: 2, event: { type: 'round_started', runId: 'run-3', round: 1 } });
    const events = repository.read('run-3');
    expect(() => reduceAgentRunEvents([{ ...events[0], sequence: 2 }, events[1]])).toThrow(/sequence/);
    expect(() => reduceAgentRunEvents([{ ...events[0], event: { type: 'unknown_required', runId: 'run-3' } as never }])).toThrow(/Unknown required/);
    expect(() => reduceAgentRunEvents([{ ...events[0], schemaVersion: 99 }])).toThrow(/schema version/);
    expect(() => reduceAgentRunEvents([
      { ...events[0] },
      { ...events[1], event: { ...events[1].event, round: 0 } },
    ])).toThrow();
  });
});
