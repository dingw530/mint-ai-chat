import { useRef, useCallback } from 'react';
import { sendMessageStream } from '../services/api';

/**
 * Hook to manage SSE streaming for AI responses.
 * Returns a send function and an abort function.
 * Supports ReAct event callbacks: onThought, onToolCallStart, onToolCallEnd, onToolCallError, onAnswerReady
 */
export default function useSSE() {
  const abortRef = useRef(null);

  const send = useCallback((conversationId, content, callbacks, agent, options = {}) => {
    const {
      onChunk, onReasoning, onDone, onError, onTitle, onRouting,
      onThought, onToolCallStart, onToolCallEnd, onToolCallError,
      onAnswerReady,
    } = callbacks;
    const { abort } = sendMessageStream(conversationId, content, {
      onChunk, onReasoning, onDone, onError, onTitle, onRouting,
      onThought, onToolCallStart, onToolCallEnd, onToolCallError,
      onAnswerReady,
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
