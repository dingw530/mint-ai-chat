import type { HistoryMessage, ToolDefinition } from '../../types.js';
import type { ApiAdapter, ParsedChunk, CallOptions} from './apiAdapter.js';
import { AI_REQUEST_TIMEOUT_MS, registerAdapter } from './apiAdapter.js';
import { isRecord, readNumber, readString } from '../../utils/typeGuards.js';

export const openaiChatAdapter: ApiAdapter = {
  getUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  },

  getHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  },

  buildRequest(
    messages: HistoryMessage[],
    settings: { modelId: string; thinkingMode: boolean; systemPrompt: string },
    tools?: ToolDefinition[],
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: settings.modelId,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.role === 'assistant' && m.reasoning) msg.reasoning_content = m.reasoning;
        return msg;
      }),
      stream: true,
    };

    body.thinking = { type: settings.thinkingMode ? 'enabled' : 'disabled' };

    body.enable_thinking = true;
    body.return_reasoning = true;

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    return body;
  },

  async stream(messages, settings, apiUrl, apiKey, tools, options) {
      console.log(apiUrl);
      const response = await fetch(this.getUrl(apiUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getHeaders(apiKey) },
      body: JSON.stringify(this.buildRequest(messages, settings, tools)),
      signal: options?.signal ?? AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
    return response;
  },

  parseChunk(data: string): ParsedChunk | null {
    if (data === '[DONE]') return { isFinished: true };

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) return null;
    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) return null;
    const delta = firstChoice.delta;

    const result: ParsedChunk = {};

    const content = readString(delta, 'content');
    if (content) result.content = content;

    const reasoningContent = readString(delta, 'reasoning_content');
    if (reasoningContent) result.reasoning = reasoningContent;

    const reasoning = readString(delta, 'reasoning');
    if (reasoning) result.reasoning = reasoning;

    if (Array.isArray(delta.tool_calls)) {
      const rawToolCall = delta.tool_calls.find(isRecord);
      if (rawToolCall) {
        const rawFunction = isRecord(rawToolCall.function) ? rawToolCall.function : undefined;
        result.toolCallDelta = {
          index: readNumber(rawToolCall, 'index') ?? 0,
          id: readString(rawToolCall, 'id'),
          type: readString(rawToolCall, 'type'),
          function: rawFunction ? {
            name: readString(rawFunction, 'name'),
            arguments: readString(rawFunction, 'arguments'),
          } : undefined,
        };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  },

  async call(
    messages: { role: string; content: string }[],
    settings: { modelId: string },
    apiUrl: string,
    apiKey: string,
    options?: CallOptions,
  ): Promise<string> {
    const url = this.getUrl(apiUrl);
    const headers = this.getHeaders(apiKey);

    const body: Record<string, unknown> = {
      model: settings.modelId,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: options?.signal ?? AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`AI API error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data.choices)) return '';
    const choice = data.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) return '';
    return readString(choice.message, 'content') || '';
  },
};

registerAdapter('openai-chat', openaiChatAdapter);
