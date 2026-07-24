import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockAdapter = {
  getUrl: vi.fn(() => 'https://api.test.com/v1/chat/completions'),
  getHeaders: vi.fn(() => ({})),
  buildRequest: vi.fn(() => ({})),
  stream: vi.fn(),
  parseChunk: vi.fn(),
  call: vi.fn(),
};

vi.mock('../adapters/apiAdapter.js', () => ({
  getAdapter: vi.fn(() => mockAdapter as any),
  registerAdapter: vi.fn(),
}));

vi.mock('../toolRoundEngine.js', () => ({
  toolLoopEngine: {
    executeRound: vi.fn(),
    executeToolCallWithRetry: vi.fn(),
  },
}));

vi.mock('../toolRegistry.js', () => ({
  getAllToolDefinitions: vi.fn().mockResolvedValue([]),
  getToolCallSummary: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../utils/contextWindow.js', () => ({
  DEFAULT_CONTEXT_TOKEN_BUDGET: 100000,
  DEFAULT_OUTPUT_TOKEN_RESERVE: 4096,
  prepareContext: vi.fn(async (msgs) => msgs),
}));

import { reactChat } from '../reactLoopCore.js';
import { toolLoopEngine } from '../toolRoundEngine.js';
import { getAdapter } from '../adapters/apiAdapter.js';

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
      {
        apiUrl: 'https://api.test.com',
        apiKey: 'sk-key',
        apiType: 'openai-chat',
        reactMaxIterations: 5,
        toolMaxRetries: 3,
        maxContextRounds: 10,
      } as any,
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
      {
        apiUrl: 'https://api.test.com',
        apiKey: 'sk-key',
        apiType: 'openai-chat',
        reactMaxIterations: 3,
        toolMaxRetries: 3,
        maxContextRounds: 10,
      } as any,
      sink,
      'general',
    );
    expect(result.content).toBe('final answer');
    expect(result.reasoning).toBe('some reasoning');
  });

  it('preserves tool call order while correlating same-name calls by callId', async () => {
    const firstCall = {
      id: 'call-1',
      type: 'function' as const,
      function: { name: 'bash', arguments: '{"command":"first"}' },
    };
    const secondCall = {
      id: 'call-2',
      type: 'function' as const,
      function: { name: 'bash', arguments: '{"command":"second"}' },
    };
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
    const contextMessages: any[] = [];
    const { getToolCallSummary } = await import('../toolRegistry.js');
    vi.mocked(getToolCallSummary).mockReturnValue('正在执行工具');

    vi.mocked(toolLoopEngine.executeRound)
      .mockImplementationOnce(async ({ messages }) => {
        contextMessages.push(...messages);
        return { content: '', reasoning: 'thinking', toolCalls: [firstCall, secondCall] };
      })
      .mockImplementationOnce(async ({ messages }) => {
        contextMessages.push(...messages);
        return { content: 'done', reasoning: '', toolCalls: null };
      });
    vi.mocked(toolLoopEngine.executeToolCallWithRetry).mockImplementation(async (toolCall) => {
      await new Promise((resolve) => setTimeout(resolve, toolCall.id === 'call-1' ? 10 : 1));
      return {
        assistantMsg: {
          role: 'assistant',
          content: null as unknown as string,
          tool_calls: [toolCall],
        },
        toolMsg: { role: 'tool', tool_call_id: toolCall.id, content: toolCall.id },
        succeeded: true,
        resultSummary: '工具执行完成',
      };
    });

    await reactChat(
      [{ role: 'user', content: 'hi' }],
      {
        apiUrl: 'https://api.test.com',
        apiKey: 'sk-key',
        apiType: 'openai-chat',
        reactMaxIterations: 3,
        toolMaxRetries: 0,
        maxContextRounds: 10,
      } as any,
      sink,
    );

    const events = sink.write.mock.calls.map(([data]) => JSON.parse(data));
    expect(
      events.filter((event) => event.type === 'tool_call_start').map((event) => event.callId),
    ).toEqual(['call-1', 'call-2']);
    expect(
      events.filter((event) => event.type === 'tool_call_start').map((event) => event.summary),
    ).toEqual(['正在执行工具', '正在执行工具']);
    expect(
      events.filter((event) => event.type === 'tool_call_end').map((event) => event.callId),
    ).toEqual(['call-2', 'call-1']);
    expect(
      events.filter((event) => event.type === 'tool_call_end').map((event) => event.summary),
    ).toEqual(['工具执行完成', '工具执行完成']);
    const toolMessages = contextMessages
      .flat()
      .filter((message: any) => message.role === 'tool')
      .map((message: any) => message.tool_call_id);
    expect(toolMessages).toEqual(['call-1', 'call-2']);
    expect(
      events.filter((event) =>
        ['run_completed', 'run_failed', 'run_cancelled'].includes(event.type),
      ),
    ).toHaveLength(1);
  });

  it('ignores sparse tool call slots from streamed tool indexes', async () => {
    const firstCall = {
      id: 'call-1',
      type: 'function' as const,
      function: { name: 'bash', arguments: '{"command":"first"}' },
    };
    const thirdCall = {
      id: 'call-3',
      type: 'function' as const,
      function: { name: 'bash', arguments: '{"command":"third"}' },
    };
    const sparseCalls = [] as any[];
    sparseCalls[0] = firstCall;
    sparseCalls[2] = thirdCall;
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };

    vi.mocked(toolLoopEngine.executeRound)
      .mockResolvedValueOnce({ content: '', reasoning: '', toolCalls: sparseCalls })
      .mockResolvedValueOnce({ content: 'done', reasoning: '', toolCalls: null });
    vi.mocked(toolLoopEngine.executeToolCallWithRetry).mockResolvedValue({
      assistantMsg: { role: 'assistant', content: null as unknown as string, tool_calls: [] },
      toolMsg: { role: 'tool', tool_call_id: 'tool', content: '{}' },
      succeeded: true,
    });

    const result = await reactChat(
      [{ role: 'user', content: 'hi' }],
      { apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat' } as any,
      sink,
    );

    expect(result.content).toBe('done');
    expect(vi.mocked(toolLoopEngine.executeToolCallWithRetry)).toHaveBeenCalledTimes(2);
  });

  it('emits a single cancelled terminal event and skips the model call', async () => {
    const controller = new AbortController();
    controller.abort();
    const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };

    await reactChat(
      [{ role: 'user', content: 'hi' }],
      {
        apiUrl: 'https://api.test.com',
        apiKey: 'sk-key',
        apiType: 'openai-chat',
        reactMaxIterations: 3,
        toolMaxRetries: 0,
        maxContextRounds: 10,
      } as any,
      sink,
      undefined,
      controller.signal,
    );

    const events = sink.write.mock.calls.map(([data]) => JSON.parse(data));
    expect(vi.mocked(toolLoopEngine.executeRound)).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === 'run_cancelled')).toHaveLength(1);
    expect(
      events.some((event) => event.type === 'run_completed' || event.type === 'run_failed'),
    ).toBe(false);
  });
});
