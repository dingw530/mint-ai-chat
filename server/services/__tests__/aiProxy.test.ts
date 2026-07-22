import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../adapters/apiAdapter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adapters/apiAdapter.js')>()),
  getAdapter: vi.fn(() => ({
    getUrl: vi.fn(() => 'https://api.test.com/v1/chat/completions'),
    getHeaders: vi.fn(() => ({ 'Authorization': 'Bearer sk-key' })),
    buildRequest: vi.fn(() => ({ model: 'gpt-4', messages: [] })),
    parseChunk: vi.fn(),
    call: vi.fn(),
  })),
}));

import { streamChat, generateTitle } from '../aiProxy.js';

describe('aiProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('streamChat', () => {
    it('returns error when apiUrl missing', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      const result = await streamChat([], { apiUrl: '', apiKey: 'key' } as any, sink);
      expect(result.content).toBe('');
      expect(sink.end).toHaveBeenCalled();
    });

    it('returns error when apiKey missing', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      const result = await streamChat([], { apiUrl: 'https://api.test.com', apiKey: '' } as any, sink);
      expect(result.content).toBe('');
    });
  });

  describe('generateTitle', () => {
    it('returns empty when apiUrl missing', async () => {
      const title = await generateTitle({ apiUrl: '', apiKey: '' } as any, 'hi', 'hello');
      expect(title).toBe('');
    });

    it('returns fallback on API error', async () => {
      // getAdapter returns a mock from the vi.mock above
      const { getAdapter } = await import('../adapters/apiAdapter.js');
      const mockAdapter = vi.mocked(getAdapter)();
      mockAdapter.call = vi.fn().mockRejectedValue(new Error('API fail'));

      const title = await generateTitle(
        { apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat' } as any,
        'Hello world this is a long message',
        'Response',
      );
      // Falls back to truncated title
      expect(title).toBeTruthy();
    });
  });
});
