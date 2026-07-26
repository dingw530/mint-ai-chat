import { describe, expect, it, vi } from 'vitest';
import { buildUrlFromManifest, extractBodyFromManifest, ipcOrHttp, isElectron, parseSSEChunk } from '../_base';

describe('API base helpers', () => {
  it('builds manifest URLs and extracts body arguments', () => {
    const endpoint = {
      id: 'test', ipcChannel: 'test', preloadMethod: null, method: 'POST', httpPath: '/items/:id?kind=all',
      args: [{ from: 'path', name: 'id' }, { from: 'query', name: 'filter', optional: true }, { from: 'body', name: 'payload' }],
      result: null, async: false,
    } as const;
    const args = ['a/b', 'x y', { enabled: true }];
    expect(buildUrlFromManifest(endpoint, args)).toBe('/items/a/b?kind=all&filter=x%20y');
    expect(extractBodyFromManifest(endpoint, args)).toEqual({ enabled: true });
    expect(extractBodyFromManifest({ ...endpoint, args: [] }, [])).toBeUndefined();
  });

  it('uses HTTP fallback when Electron is unavailable or IPC fails', async () => {
    window.electronAPI = undefined;
    expect(isElectron()).toBe(false);
    const http = vi.fn().mockResolvedValue('http');
    expect(await ipcOrHttp(vi.fn(), http)).toBe('http');
    window.electronAPI = { isElectron: true } as unknown as typeof window.electronAPI;
    expect(await ipcOrHttp(vi.fn().mockRejectedValue(new Error('IPC failed')), http)).toBe('http');
  });

  it('dispatches SSE event types and tracks thought text', () => {
    const callbacks = {
      onThought: vi.fn(), onAnswerReady: vi.fn(), onToolCallStart: vi.fn(), onChunk: vi.fn(),
      onRouting: vi.fn(), onTokenUsage: vi.fn(), onRoundStarted: vi.fn(), onLoopDetected: vi.fn(),
      onToolApprovalRequired: vi.fn(),
    };
    const lastThought = { value: '' };
    parseSSEChunk({ type: 'round_started', round: 2 }, callbacks, lastThought);
    parseSSEChunk({ type: 'thought', content: 'thinking' }, callbacks, lastThought);
    parseSSEChunk({ type: 'tool_call_start', callId: 'call-1' }, callbacks, lastThought);
    parseSSEChunk({ type: 'answer', content: 'answer' }, callbacks, lastThought);
    parseSSEChunk({ type: 'agent', agent: 'custom-agent' }, callbacks, lastThought);
    parseSSEChunk({ type: 'answer_ready' }, callbacks, lastThought);
    parseSSEChunk({ type: 'token_usage', estimatedTokens: 42 }, callbacks, lastThought);
    parseSSEChunk({ type: 'loop_detected', message: 'fallback' }, callbacks, lastThought);
    parseSSEChunk({ type: 'approval_required', approvalId: 'approval-1', reason: 'confirm' }, callbacks, lastThought);
    expect(callbacks.onThought).toHaveBeenCalledWith('thinking');
    expect(callbacks.onToolCallStart).toHaveBeenCalled();
    expect(callbacks.onChunk).toHaveBeenCalledWith('answer');
    expect(callbacks.onRouting).toHaveBeenCalledWith('custom-agent');
    expect(callbacks.onAnswerReady).not.toHaveBeenCalled();
    expect(callbacks.onTokenUsage).toHaveBeenCalledWith({ type: 'token_usage', estimatedTokens: 42 });
    expect(callbacks.onRoundStarted).toHaveBeenCalledWith({ type: 'round_started', round: 2 });
    expect(callbacks.onLoopDetected).toHaveBeenCalledWith({ type: 'loop_detected', message: 'fallback' });
    expect(callbacks.onToolApprovalRequired).toHaveBeenCalledWith({ type: 'approval_required', approvalId: 'approval-1', reason: 'confirm' });
  });
});
