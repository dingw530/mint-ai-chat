import { describe, expect, it } from 'vitest';
import { createInitialReactEventState, reduceReactEvent, type ReactReducerEvent, type ReactEventState } from '../useReactEventReducer';

describe('reduceReactEvent', () => {
  function reduce(state: ReactEventState, ...events: ReactReducerEvent[]) {
    return events.reduce((current, event) => reduceReactEvent(current, event), state);
  }

  it('starts a run and accumulates adjacent thought events', () => {
    const state = reduce(createInitialReactEventState(),
      { type: 'run_started', runId: 'run-1' },
      { type: 'thought', content: '先检查 ' }, { type: 'thought', content: '上下文' });
    expect(state).toMatchObject({ status: 'running', runId: 'run-1' });
    expect(state.steps).toEqual([{ type: 'thought', content: '先检查 上下文' }]);
  });

  it('keeps tool summaries and ignores events from another run', () => {
    const started = reduceReactEvent(createInitialReactEventState(), { type: 'run_started', runId: 'run-1' });
    const withTool = reduceReactEvent(started, {
      type: 'tool_call_start', runId: 'run-1', callId: 'call-1', toolName: 'wiki_search', arguments: '{}', summary: '搜索知识库',
    });
    expect(reduceReactEvent(withTool, { type: 'thought', runId: 'run-2', content: '错误事件' })).toBe(withTool);
    expect(withTool.steps).toEqual([expect.objectContaining({ callId: 'call-1', summary: '搜索知识库' })]);
  });

  it('stops accepting events after a terminal status', () => {
    const completed = reduceReactEvent(
      reduceReactEvent(createInitialReactEventState(), { type: 'run_started', runId: 'run-1' }),
      { type: 'run_completed', runId: 'run-1' },
    );
    expect(reduceReactEvent(completed, { type: 'thought', content: 'late event' })).toBe(completed);
  });
});
