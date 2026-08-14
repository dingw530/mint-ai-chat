import { describe, expect, it, vi } from 'vitest';
import type { AiSettings, HistoryMessage } from '../../types.js';
import {
  applyContextProviders,
  type ContextProvider,
} from '../contextProvider.js';
import { createMemoryContextProvider } from '../contextProviders/memoryContextProvider.js';
import { createWikiContextProvider } from '../contextProviders/wikiContextProvider.js';

const BASE_SETTINGS: AiSettings = {
  apiUrl: 'https://api.test.com',
  apiKey: 'sk-test',
  modelId: 'test-model',
  apiType: 'openai-chat',
  systemPrompt: '',
  thinkingMode: false,
  memoryEnabled: false,
  reactMaxIterations: 5,
  toolMaxRetries: 3,
  showReactSteps: true,
  maxContextRounds: 10,
  wikiPath: '',
  wikiMaxFileSize: 10485760,
  wikiSearchMode: 'keyword',
  embeddingApiUrl: '',
  embeddingModel: '',
  embeddingDimensions: 1536,
};

describe('contextProvider', () => {
  it('inserts memory before the latest user message with the existing safety wrapper', () => {
    const buildMemoryContext = vi.fn(() => '用户在北京');
    const messages: HistoryMessage[] = [
      { role: 'system', content: 'base prompt' },
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: 'current question' },
    ];

    const result = applyContextProviders(messages, {
      settings: { ...BASE_SETTINGS, memoryEnabled: true },
      userContent: 'current question',
    }, [createMemoryContextProvider(buildMemoryContext)]);

    expect(buildMemoryContext).toHaveBeenCalledWith('current question');
    expect(result.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user', 'user']);
    expect(result[3].content).toContain('<user_memory>');
    expect(result[3].content).toContain('用户在北京');
    expect(result[4].content).toBe('current question');
  });

  it('does not retrieve or insert memory when the setting is disabled', () => {
    const buildMemoryContext = vi.fn(() => '用户在北京');
    const messages: HistoryMessage[] = [{ role: 'user', content: 'current question' }];

    const result = applyContextProviders(messages, {
      settings: BASE_SETTINGS,
      userContent: 'current question',
    }, [createMemoryContextProvider(buildMemoryContext)]);

    expect(buildMemoryContext).not.toHaveBeenCalled();
    expect(result).toEqual(messages);
  });

  it('does not insert a memory message when retrieval returns no content', () => {
    const buildMemoryContext = vi.fn(() => '');
    const messages: HistoryMessage[] = [{ role: 'user', content: 'current question' }];

    const result = applyContextProviders(messages, {
      settings: { ...BASE_SETTINGS, memoryEnabled: true },
      userContent: 'current question',
    }, [createMemoryContextProvider(buildMemoryContext)]);

    expect(buildMemoryContext).toHaveBeenCalledWith('current question');
    expect(result).toEqual(messages);
  });

  it('appends Wiki instructions to a system prompt or creates one when absent', () => {
    const settings = { ...BASE_SETTINGS, wikiPath: '/tmp/wiki' };
    const withSystem = applyContextProviders([
      { role: 'system', content: 'base prompt' },
      { role: 'user', content: 'question' },
    ], { settings, userContent: 'question' }, [createWikiContextProvider()]);
    const withoutSystem = applyContextProviders([
      { role: 'user', content: 'question' },
    ], { settings, userContent: 'question' }, [createWikiContextProvider()]);

    expect(withSystem[0].content).toContain('base prompt\n\n⚠️ Wiki 知识库使用规则');
    expect(withoutSystem.map((message) => message.role)).toEqual(['system', 'user']);
    expect(withoutSystem[0].content).toContain('不得删除其他路径或整个知识库目录');
  });

  it('orders equal-priority providers by id and leaves input messages untouched', () => {
    const messages: HistoryMessage[] = [{
      role: 'user',
      content: 'question',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
    }];
    const providers: ContextProvider[] = [
      { id: 'z-provider', order: 10, provide: () => ({ id: 'z-provider', placement: 'system', content: 'Z' }) },
      { id: 'a-provider', order: 10, provide: () => ({ id: 'a-provider', placement: 'system', content: 'A' }) },
    ];

    const result = applyContextProviders(messages, { settings: BASE_SETTINGS, userContent: 'question' }, providers);

    expect(result[0]).toEqual({ role: 'system', content: 'A\n\nZ' });
    expect(messages).toEqual([{
      role: 'user',
      content: 'question',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
    }]);
    expect(result[1].tool_calls).not.toBe(messages[0].tool_calls);
    expect(result[1].tool_calls?.[0].function).not.toBe(messages[0].tool_calls?.[0].function);
  });

  it('rejects duplicate provider ids instead of silently changing order', () => {
    const providers: ContextProvider[] = [
      { id: 'duplicate', order: 1, provide: () => undefined },
      { id: 'duplicate', order: 2, provide: () => undefined },
    ];

    expect(() => applyContextProviders([], { settings: BASE_SETTINGS, userContent: 'question' }, providers))
      .toThrow('duplicate context provider id: duplicate');
  });
});
