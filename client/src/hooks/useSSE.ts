import { useRef, useCallback } from 'react';
import { sendMessageStream } from '../services/api';
import type { SendCallbacks, SendOptions } from '../types';

interface UseSSEReturn {
  send: (
    conversationId: string,
    content: string,
    callbacks: SendCallbacks,
    agent?: string,
    options?: SendOptions,
  ) => void;
  abort: () => void;
}

/**
 * Hook to manage SSE streaming for AI responses.
 * Returns a send function and an abort function.
 */
export default function useSSE(): UseSSEReturn {
  const abortRef = useRef<(() => void) | null>(null);

  const send = useCallback<UseSSEReturn['send']>((conversationId, content, callbacks, agent, options = {}) => {
    const { abort } = sendMessageStream(conversationId, content, {
      ...callbacks,
      regenerate: options.regenerate,
    }, agent);
    abortRef.current = abort;
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
  }, []);

  return { send, abort };
}
