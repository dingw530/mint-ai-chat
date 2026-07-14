import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/adapters/apiAdapter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/adapters/apiAdapter.js')>()),
  getAdapter: vi.fn(),
}));

import { ToolLoopEngine, parseSSEStream } from '../services/toolRoundEngine.js';

describe('ToolLoopEngine', () => {
  const engine = new ToolLoopEngine();

  it('rejects missing apiUrl', async () => {
    await expect(engine.executeRound({
      messages: [],
      settings: { apiUrl: '', apiKey: '' } as any,
    })).rejects.toThrow('API URL');
  });

  it('rejects missing apiKey', async () => {
    await expect(engine.executeRound({
      messages: [],
      settings: { apiUrl: 'https://api.test.com', apiKey: '' } as any,
    })).rejects.toThrow('API Key');
  });
});

describe('parseSSEStream', () => {
  it('throws on non-ok response', async () => {
    const response = { ok: false, status: 401, text: vi.fn().mockResolvedValue('Unauthorized') } as any;
    await expect(parseSSEStream(response, {} as any)).rejects.toThrow('AI API error');
  });

  it('accumulates content from SSE chunks', async () => {
    const adapter = {
      parseChunk: vi.fn((data: string) => {
        if (data === 'h') return { content: 'Hello ' };
        if (data === 'w') return { content: 'World!' };
        if (data === '[DONE]') return { isFinished: true };
        return null;
      }),
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: h\n\n'));
        controller.enqueue(encoder.encode('data: w\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const result = await parseSSEStream({ ok: true, body: stream, status: 200 } as any, adapter as any);
    expect(result.content).toBe('Hello World!');
  });

  it('writes to sink', async () => {
    const adapter = {
      parseChunk: vi.fn((data: string) => {
        if (data === 't') return { content: 'test' };
        if (data === '[DONE]') return { isFinished: true };
        return null;
      }),
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: t\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const sink = { write: vi.fn() };
    await parseSSEStream({ ok: true, body: stream, status: 200 } as any, adapter as any, sink as any);
    expect(sink.write).toHaveBeenCalledWith(expect.stringContaining('test'));
  });
});
