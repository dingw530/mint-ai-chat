import { HistoryMessage, ToolCallDelta, ToolDefinition } from '../../types.js';
import { ApiAdapter, ParsedChunk, registerAdapter } from './apiAdapter.js';

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

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    return body;
  },

  parseChunk(data: string): ParsedChunk | null {
    if (data === '[DONE]') return { isFinished: true };

    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return null;

    const result: ParsedChunk = {};

    if (delta.content) {
      result.content = delta.content;
    }

    if (delta.reasoning_content) {
      result.reasoning = delta.reasoning_content;
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls as ToolCallDelta[]) {
        result.toolCallDelta = tc;
        break; // 只取第一个 tool call delta
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  },
};

registerAdapter('openai-chat', openaiChatAdapter);
