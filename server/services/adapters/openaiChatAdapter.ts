import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ApiAdapter } from './apiAdapter.js';
import { registerAdapter } from './apiAdapter.js';
import { createAiSdkAdapter } from './aiSdkAdapter.js';

/** OpenAI Chat Completions and OpenAI-compatible chat endpoints. */
export const openaiChatAdapter: ApiAdapter = createAiSdkAdapter((apiUrl, apiKey, settings) => {
  const provider = createOpenAICompatible({
    name: 'mint-openai-chat',
    baseURL: appendV1(apiUrl),
    apiKey,
  });
  return provider.chatModel(settings.modelId);
}, (settings, options) => {
  const thinkingEnabled = options?.thinking ?? settings.thinkingMode ?? false;

  return {
    ...(thinkingEnabled ? { 'openai-compatible': { reasoningEffort: 'medium' } } : {}),
    // The SDK preserves unknown options for the named compatible provider.
    // These fields retain the common DeepSeek-compatible thinking contract.
    'mint-openai-chat': {
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
      enable_thinking: thinkingEnabled,
      return_reasoning: true,
    },
  };
});

registerAdapter('openai-chat', openaiChatAdapter);

function appendV1(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/v1`;
}
