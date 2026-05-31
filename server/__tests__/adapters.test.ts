import { describe, it, expect } from 'vitest';
import { openaiChatAdapter } from '../services/adapters/openaiChatAdapter.js';
import { anthropicAdapter } from '../services/adapters/anthropicAdapter.js';
import { openaiResponsesAdapter } from '../services/adapters/openaiResponsesAdapter.js';

const mockSettings = {
  modelId: 'test-model',
  thinkingMode: false,
  systemPrompt: 'You are a helpful assistant.',
};

// ── OpenAI Chat Adapter ──

describe('OpenAI Chat Adapter', () => {
  it('should build URL with /v1/chat/completions suffix', () => {
    expect(openaiChatAdapter.getUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/v1/chat/completions');
    expect(openaiChatAdapter.getUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/v1/chat/completions');
  });

  it('should use Bearer auth header', () => {
    const headers = openaiChatAdapter.getHeaders('sk-test');
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should build request body with messages and stream', () => {
    const body = openaiChatAdapter.buildRequest(
      [{ role: 'user', content: 'Hello' }],
      mockSettings,
    );
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should include tools in request body when provided', () => {
    const tools = [{ type: 'function' as const, function: { name: 'test_tool', description: 'Test', parameters: {} } }];
    const body = openaiChatAdapter.buildRequest(
      [{ role: 'user', content: 'Use a tool' }],
      mockSettings,
      tools,
    );
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
  });

  it('should parse content delta chunk', () => {
    const result = openaiChatAdapter.parseChunk(JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }));
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Hello');
  });

  it('should parse tool call delta chunk', () => {
    const data = JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_123', function: { name: 'get_weather' } }] } }] });
    const result = openaiChatAdapter.parseChunk(data);
    expect(result).not.toBeNull();
    expect(result!.toolCallDelta).toBeDefined();
    expect(result!.toolCallDelta!.index).toBe(0);
    expect(result!.toolCallDelta!.id).toBe('call_123');
  });

  it('should detect [DONE] as finished', () => {
    const result = openaiChatAdapter.parseChunk('[DONE]');
    expect(result).not.toBeNull();
    expect(result!.isFinished).toBe(true);
  });

  it('should return null for empty delta', () => {
    const result = openaiChatAdapter.parseChunk(JSON.stringify({ choices: [{ delta: {} }] }));
    expect(result).toBeNull();
  });
});

// ── Anthropic Adapter ──

describe('Anthropic Adapter', () => {
  it('should append /v1/messages to base URL', () => {
    expect(anthropicAdapter.getUrl('https://api.anthropic.com/v1')).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropicAdapter.getUrl('https://api.anthropic.com/v1/')).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropicAdapter.getUrl('https://api.deepseek.com/anthropic')).toBe('https://api.deepseek.com/anthropic/v1/messages');
    expect(anthropicAdapter.getUrl('https://api.deepseek.com/anthropic/')).toBe('https://api.deepseek.com/anthropic/v1/messages');
  });

  it('should use x-api-key header', () => {
    const headers = anthropicAdapter.getHeaders('sk-ant-test');
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should build request with system prompt and messages', () => {
    const body = anthropicAdapter.buildRequest(
      [{ role: 'user', content: 'Hi' }],
      { ...mockSettings, systemPrompt: 'Be helpful.' },
    );
    expect(body.model).toBe('test-model');
    expect(body.system).toBe('Be helpful.');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Hi' });
    expect(body.max_tokens).toBe(4096);
    expect(body.stream).toBe(true);
  });

  it('should build request with anthropic tool format', () => {
    const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { loc: { type: 'string' } } } } }];
    const body = anthropicAdapter.buildRequest(
      [{ role: 'user', content: 'Weather?' }],
      mockSettings,
      tools,
    );
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toHaveProperty('name', 'get_weather');
    expect(body.tools[0]).toHaveProperty('input_schema');
    expect(body.tools[0]).not.toHaveProperty('type');
  });

  it('should parse text delta chunk', () => {
    const result = anthropicAdapter.parseChunk(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }));
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Hello');
  });

  it('should parse tool_use content_block_start', () => {
    const result = anthropicAdapter.parseChunk(JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_123', name: 'get_weather', input: {} } }));
    expect(result).not.toBeNull();
    expect(result!.toolCallDelta).toBeDefined();
    expect(result!.toolCallDelta!.index).toBe(0);
    expect(result!.toolCallDelta!.id).toBe('toolu_123');
    expect(result!.toolCallDelta!.function!.name).toBe('get_weather');
  });

  it('should parse input_json_delta for tool arguments', () => {
    const result = anthropicAdapter.parseChunk(JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"loc": "NYC"}' } }));
    expect(result).not.toBeNull();
    expect(result!.toolCallDelta).toBeDefined();
    expect(result!.toolCallDelta!.function!.arguments).toBe('{"loc": "NYC"}');
  });

  it('should handle message_stop as finished', () => {
    const result = anthropicAdapter.parseChunk(JSON.stringify({ type: 'message_stop' }));
    expect(result).not.toBeNull();
    expect(result!.isFinished).toBe(true);
  });

  it('should ignore ping events', () => {
    const result = anthropicAdapter.parseChunk(JSON.stringify({ type: 'ping' }));
    expect(result).toBeNull();
  });
});

// ── OpenAI Responses Adapter ──

describe('OpenAI Responses Adapter', () => {
  it('should build URL with /v1/responses suffix', () => {
    expect(openaiResponsesAdapter.getUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/v1/responses');
  });

  it('should use Bearer auth header', () => {
    const headers = openaiResponsesAdapter.getHeaders('sk-test');
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('should build request with input array instead of messages', () => {
    const body = openaiResponsesAdapter.buildRequest(
      [{ role: 'user', content: 'Hello' }],
      { ...mockSettings, systemPrompt: 'Be helpful.' },
    );
    expect(body.model).toBe('test-model');
    expect(body.input).toHaveLength(1);
    expect(body.input[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(body.instructions).toBe('Be helpful.');
    expect(body.stream).toBe(true);
  });

  it('should parse output_text.delta chunk', () => {
    const result = openaiResponsesAdapter.parseChunk(JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello' }));
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Hello');
  });

  it('should parse function_call_arguments.delta chunk', () => {
    const result = openaiResponsesAdapter.parseChunk(JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"loc":' }));
    expect(result).not.toBeNull();
    expect(result!.toolCallDelta).toBeDefined();
    expect(result!.toolCallDelta!.index).toBe(0);
    expect(result!.toolCallDelta!.function!.arguments).toBe('{"loc":');
  });

  it('should handle response.completed as finished', () => {
    const result = openaiResponsesAdapter.parseChunk(JSON.stringify({ type: 'response.completed' }));
    expect(result).not.toBeNull();
    expect(result!.isFinished).toBe(true);
  });

  it('should ignore response.created event', () => {
    const result = openaiResponsesAdapter.parseChunk(JSON.stringify({ type: 'response.created' }));
    expect(result).toBeNull();
  });
});
