import type { SendCallbacks, SendOptions, StreamReturn } from '@/types';
import { BASE_URL, electronAPI, isElectron, parseSSEChunk } from '../api/_base';

export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks & { regenerate?: boolean },
  agent?: string,
): StreamReturn;
export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks,
  agent?: string,
  options?: SendOptions,
): StreamReturn;
export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks,
  agent?: string,
  options?: SendOptions,
): StreamReturn {
  // Electron IPC 路径
  if (isElectron && electronAPI) {
    const lastThought = { value: '' };

    electronAPI.onChunk((raw: string) => {
      try { parseSSEChunk(JSON.parse(raw), callbacks, lastThought); } catch {}
    });
    electronAPI.onDone(() => callbacks.onDone?.());
    electronAPI.onError((err) => callbacks.onError?.(new Error(err)));
    electronAPI.sendMessage(conversationId, content, agent, !!options?.regenerate);

    return {
      abort: () => {
        electronAPI.removeListener('chat:chunk');
        electronAPI.removeListener('chat:done');
        electronAPI.removeListener('chat:error');
      },
    };
  }

  // HTTP SSE 路径
  const controller = new AbortController();
  const body: Record<string, unknown> = { content };
  if (options?.regenerate) body.regenerate = true;
  if (agent !== undefined) body.agent = agent;

  const lastThought = { value: '' };

  fetch(`${BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try { parseSSEChunk(JSON.parse(dataStr), callbacks, lastThought); } catch {}
        }
      }

      if (buffer.startsWith('data: ')) {
        const dataStr = buffer.slice(6).trim();
        if (dataStr !== '[DONE]') {
          try { parseSSEChunk(JSON.parse(dataStr), callbacks, lastThought); } catch {}
        }
      }

      callbacks.onDone?.();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      callbacks.onError?.(err);
    });

  return { abort: () => controller.abort() };
}
