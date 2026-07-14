import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockAdapter = {
  getUrl: vi.fn(() => 'https://api.test.com/v1/chat/completions'),
  getHeaders: vi.fn(() => ({})),
  buildRequest: vi.fn(() => ({})),
  parseChunk: vi.fn(),
  call: vi.fn(),
};

vi.mock('../services/adapters/apiAdapter.js', () => ({
  getAdapter: vi.fn(() => mockAdapter as any),
  registerAdapter: vi.fn(),
}));

vi.mock('../services/toolRoundEngine.js', () => ({
  toolLoopEngine: {
    executeRound: vi.fn(),
    executeToolCallWithRetry: vi.fn(),
  },
}));

vi.mock('../services/toolRegistry.js', () => ({
  getAllToolDefinitions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/utils/contextWindow.js', () => ({
  trimContext: vi.fn((msgs) => msgs),
}));

import { reactChat } from '../services/reactLoopCore.js';
import { toolLoopEngine } from '../services/toolRoundEngine.js';
import { getAdapter } from '../services/adapters/apiAdapter.js';

describe('reactChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when apiUrl is missing', async () => {
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
    const result = await reactChat([], { apiUrl: '', apiKey: '' } as any, sink);
    expect(result.content).toBe('');
  });

  it('returns error when apiKey is missing', async () => {
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
    const result = await reactChat([], { apiUrl: 'https://api.test.com', apiKey: '' } as any, sink);
    expect(result.content).toBe('');
  });

  it('handles executeRound failure', async () => {
    vi.mocked(toolLoopEngine.executeRound).mockRejectedValue(new Error('API error'));
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
    const result = await reactChat(
      [{ role: 'user', content: 'hi' }],
      { apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat', reactMaxIterations: 5, toolMaxRetries: 3, maxContextRounds: 10 } as any,
      sink,
    );
    expect(result.content).toBe('');
  });

  it('returns content when no tool calls', async () => {
    vi.mocked(toolLoopEngine.executeRound).mockResolvedValue({
      content: 'final answer',
      reasoning: 'some reasoning',
      toolCalls: null,
    });
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
    const result = await reactChat(
      [{ role: 'user', content: 'hi' }],
      { apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat', reactMaxIterations: 3, toolMaxRetries: 3, maxContextRounds: 10 } as any,
      sink,
      'general',
    );
    expect(result.content).toBe('final answer');
    expect(result.reasoning).toBe('some reasoning');
  });
});
