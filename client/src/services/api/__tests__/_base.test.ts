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
    window.electronAPI = { isElectron: true } as typeof window.electronAPI;
    expect(await ipcOrHttp(vi.fn().mockRejectedValue(new Error('IPC failed')), http)).toBe('http');
  });

  it('dispatches SSE event types and tracks thought text', () => {
    const callbacks = { onThought: vi.fn(), onAnswerReady: vi.fn(), onToolCallStart: vi.fn(), onChunk: vi.fn(), onRouting: vi.fn() };
    const lastThought = { value: '' };
    parseSSEChunk({ type: 'thought', content: 'thinking' }, callbacks, lastThought);
    parseSSEChunk({ type: 'tool_call_start', callId: 'call-1' }, callbacks, lastThought);
    parseSSEChunk({ type: 'answer', content: 'answer' }, callbacks, lastThought);
    parseSSEChunk({ type: 'agent', agent: 'weather' }, callbacks, lastThought);
    parseSSEChunk({ type: 'answer_ready' }, callbacks, lastThought);
    expect(callbacks.onThought).toHaveBeenCalledWith('thinking');
    expect(callbacks.onToolCallStart).toHaveBeenCalled();
    expect(callbacks.onChunk).toHaveBeenCalledWith('answer');
    expect(callbacks.onRouting).toHaveBeenCalledWith('weather');
    expect(callbacks.onAnswerReady).not.toHaveBeenCalled();
  });
});
