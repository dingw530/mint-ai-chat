import { HistoryMessage, ToolCallDelta, ToolDefinition } from '../../types.js';
import { ApiAdapter, ParsedChunk, registerAdapter } from './apiAdapter.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('anthropic-adapter');

export const anthropicAdapter: ApiAdapter = {
  getUrl(baseUrl: string): string {
    // Anthropic API：追加 /v1/messages
    // baseUrl = "https://api.deepseek.com/anthropic"  → "https://api.deepseek.com/anthropic/v1/messages"
    // baseUrl = "https://api.anthropic.com/v1"        → "https://api.anthropic.com/v1/messages" (不重复 v1)
    const base = baseUrl.replace(/\/+$/, '');
    const url = base.endsWith('/v1') ? base + '/messages' : base + '/v1/messages';
    log.debug('getUrl', { baseUrl, url });
    return url;
  },

  getHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  },

  buildRequest(
    messages: HistoryMessage[],
    settings: { modelId: string; thinkingMode: boolean; systemPrompt: string },
    tools?: ToolDefinition[],
  ): Record<string, unknown> {
    let systemPrompt = settings.systemPrompt;
    const msgs: Record<string, unknown>[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt = m.content;
        continue;
      }

      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const content: any[] = [];
        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }
        if (m.reasoning) {
          content.push({ type: 'text', text: m.reasoning });
        }
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }
        msgs.push({ role: 'assistant', content });
        continue;
      }

      if (m.role === 'tool') {
        let toolContent: any;
        try {
          toolContent = JSON.parse(m.content);
        } catch {
          toolContent = m.content;
        }
        msgs.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent) }],
        });
        continue;
      }

      msgs.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: settings.modelId,
      messages: msgs,
      max_tokens: 4096,
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    log.debug('buildRequest', {
      model: settings.modelId,
      messageCount: msgs.length,
      hasTools: (tools?.length ?? 0) > 0,
      bodyKeys: Object.keys(body),
    });

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

    const type = parsed.type;
    if (!type) return null;

    switch (type) {
      case 'message_start':
        log.debug('parseChunk:message_start', { model: parsed.message?.model, stopReason: parsed.message?.stop_reason });
        return null;

      case 'content_block_start': {
        const block = parsed.content_block;
        if (block?.type === 'tool_use') {
          const index = parsed.index ?? 0;
          const tc: ToolCallDelta = {
            index,
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: '' },
          };
          log.debug('parseChunk:tool_use_start', { name: block.name, id: block.id });
          return { toolCallDelta: tc };
        }
        return null;
      }

      case 'content_block_delta': {
        const delta = parsed.delta;
        if (delta?.type === 'text_delta') {
          return { content: delta.text };
        }
        if (delta?.type === 'input_json_delta') {
          const index = parsed.index ?? 0;
          const tc: ToolCallDelta = {
            index,
            function: { arguments: delta.partial_json || '' },
          };
          return { toolCallDelta: tc };
        }
        return null;
      }

      case 'content_block_stop':
        return null;

      case 'message_delta':
        log.debug('parseChunk:message_delta', { stopReason: parsed.delta?.stop_reason, usage: parsed.usage });
        return null;

      case 'message_stop':
        log.debug('parseChunk:message_stop');
        return { isFinished: true };

      case 'ping':
        return null;

      default:
        log.debug('parseChunk:unknown', { type });
        return null;
    }
  },
};

registerAdapter('anthropic', anthropicAdapter);
