import type { HistoryMessage, ToolCallDelta, ToolDefinition } from '../../types.js';
import type { ApiAdapter, ParsedChunk, CallOptions} from './apiAdapter.js';
import { AI_REQUEST_TIMEOUT_MS, registerAdapter } from './apiAdapter.js';

export const openaiResponsesAdapter: ApiAdapter = {
  getUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '') + '/v1/responses';
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
    // Responses API 使用 input 替代 messages
    const body: Record<string, unknown> = {
      model: settings.modelId,
      input: messages.map((m) => {
        const entry: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_calls) entry.tool_calls = m.tool_calls;
        if (m.tool_call_id) entry.tool_call_id = m.tool_call_id;
        return entry;
      }),
      stream: true,
    };

    if (settings.systemPrompt) {
      body.instructions = settings.systemPrompt;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    return body;
  },

  async stream(messages, settings, apiUrl, apiKey, tools, options) {
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

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    const type = parsed.type || '';

    switch (type) {
      case 'response.output_text.delta':
        return { content: parsed.delta || '' };

      case 'response.function_call_arguments.delta': {
        const tc: ToolCallDelta = {
          index: parsed.output_index ?? 0,
          function: { arguments: parsed.delta || '' },
        };
        return { toolCallDelta: tc };
      }

      case 'response.completed':
        return { isFinished: true };

      // 忽略其他事件
      case 'response.created':
      case 'response.in_progress':
      case 'response.output_item.added':
      case 'response.output_text.done':
      case 'response.output_item.done':
      default:
        return null;
    }
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
      input: messages.map(m => ({ role: m.role, content: m.content })),
      max_output_tokens: options?.maxTokens ?? 4096,
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

    const data = (await response.json()) as any;
    return data.output?.[0]?.content?.[0]?.text || '';
  },
};

registerAdapter('openai-responses', openaiResponsesAdapter);
