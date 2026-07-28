import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { generateTitle } from '@/services/api';
import type { Conversation, Message, SendOptions } from '@/types';
import type { AgentRunStatusData } from '../components/AgentRunStatus';
import type { ReactReducerEvent } from './useReactEventReducer';
import {
  createChatStreamCallbacks,
  createToolApprovalCallbacks,
} from './chatStreamCallbacks';

type MessageWithTempId = Message & { _tempId: string };
type SendStream = (
  conversationId: string,
  content: string,
  callbacks: import('@/types').SendCallbacks,
  agent?: string,
  options?: SendOptions,
) => void;

interface UseChatRunActionsOptions {
  activeConversation: string | null;
  conversations: Conversation[];
  messages: Message[];
  activeAgent: string;
  onAutoCreate: (title?: string) => Promise<string | undefined>;
  onTitleUpdate: (id: string, title: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setSending: Dispatch<SetStateAction<boolean>>;
  setStreamingId: Dispatch<SetStateAction<string | null>>;
  setActiveAgent: Dispatch<SetStateAction<string>>;
  setAutoRoutedAgent: Dispatch<SetStateAction<string | null>>;
  setAgentRunStatus: Dispatch<SetStateAction<AgentRunStatusData | null>>;
  dispatchReactEvent: (event: ReactReducerEvent) => void;
  resetReactEvents: () => void;
  send: SendStream;
  abort: () => void;
}

function createAssistantMessage(conversationId: string): MessageWithTempId {
  const tempId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: tempId,
    _tempId: tempId,
    role: 'assistant',
    content: '',
    reasoning: '',
    conversationId,
    createdAt: new Date().toISOString(),
  };
}

function createUserMessage(conversationId: string, content: string): MessageWithTempId {
  const tempId = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: tempId,
    _tempId: tempId,
    role: 'user',
    content,
    conversationId,
    createdAt: new Date().toISOString(),
  };
}

function getTempId(message: Message): string | undefined {
  return '_tempId' in message && typeof message._tempId === 'string' ? message._tempId : undefined;
}

function isAutoRoute(conversation: Conversation | undefined): boolean {
  return (conversation?.routingMode || 'auto') === 'auto' && !conversation?.lockedAgent;
}

function needsGeneratedTitle(conversation: Conversation | undefined, createdNow: boolean): boolean {
  const title = conversation?.title?.trim();
  return createdNow || !title || title === 'New Conversation';
}

/** 管理消息流式运行、重新生成和工具审批动作。 */
export default function useChatRunActions({
  activeConversation,
  conversations,
  messages,
  activeAgent,
  onAutoCreate,
  onTitleUpdate,
  setMessages,
  setSending,
  setStreamingId,
  setActiveAgent,
  setAutoRoutedAgent,
  setAgentRunStatus,
  dispatchReactEvent,
  resetReactEvents,
  send,
  abort,
}: UseChatRunActionsOptions) {
  const streamBufferRef = useRef<{ id: string; content: string }>({ id: '', content: '' });
  const streamRafRef = useRef<number>(0);

  const updateTempMessage = useCallback((tempId: string, update: (message: Message) => Message) => {
    setMessages((previous) => previous.map((message) => (
      getTempId(message) === tempId ? update(message) : message
    )));
  }, [setMessages]);

  const flushStream = useCallback(() => {
    const buffer = streamBufferRef.current;
    if (!buffer.content) return;
    const content = buffer.content;
    buffer.content = '';
    updateTempMessage(buffer.id, (message) => {
      const segments = [...(message.segments || [])];
      const last = segments[segments.length - 1];
      if (last?.type === 'text') segments[segments.length - 1] = { ...last, content };
      else segments.push({ type: 'text', content });
      return { ...message, content, segments };
    });
  }, [updateTempMessage]);

  const scheduleFlush = useCallback(() => {
    if (streamRafRef.current) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = 0;
      flushStream();
    });
  }, [flushStream]);

  const finishStream = useCallback((tempId: string, error?: Error) => {
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = 0;
    }
    flushStream();
    if (error) updateTempMessage(tempId, (message) => ({ ...message, role: 'error', content: `Error: ${error.message}` }));
    setSending(false);
    setStreamingId(null);
  }, [flushStream, setSending, setStreamingId, updateTempMessage]);

  const runConversation = useCallback((
    conversationId: string,
    content: string,
    tempId: string,
    agent?: string,
    options?: SendOptions,
    onCompleted?: () => void,
  ) => {
    streamBufferRef.current = { id: tempId, content: '' };
    const conversation = conversations.find((item) => item.id === conversationId);
    send(conversationId, content, createChatStreamCallbacks({
      tempId,
      isAutoRoute: isAutoRoute(conversation),
      streamBufferRef,
      scheduleFlush,
      finishStream,
      onCompleted,
      updateTempMessage,
      setActiveAgent,
      setAutoRoutedAgent,
      setAgentRunStatus,
      dispatchReactEvent,
    }), agent, options);
  }, [conversations, dispatchReactEvent, finishStream, scheduleFlush, send, setActiveAgent, setAgentRunStatus, setAutoRoutedAgent, updateTempMessage]);

  const handleToolApproval = useCallback((approvalId: string, action: 'approve' | 'deny') => {
    if (!activeConversation) return;
    const updateApprovalMessage = (update: (message: Message) => Message) => {
      setMessages((previous) => previous.map((message) => (
        message.segments?.some((segment) => segment.type === 'tool_call' && segment.approvalId === approvalId)
          ? update(message)
          : message
      )));
    };
    setSending(true);
    send(activeConversation, '', createToolApprovalCallbacks(
      approvalId,
      updateApprovalMessage,
      setSending,
      setStreamingId,
      setAgentRunStatus,
      dispatchReactEvent,
    ), undefined, { control: { type: 'tool_approval', approvalId, action } });
  }, [activeConversation, dispatchReactEvent, send, setAgentRunStatus, setMessages, setSending, setStreamingId]);

  const handleSend = useCallback(async (content: string) => {
    let conversationId = activeConversation;
    let createdNow = false;
    if (!conversationId) {
      let newId: string | undefined;
      try {
        newId = await onAutoCreate();
      } catch {
        return;
      }
      if (!newId) return;
      conversationId = newId;
      createdNow = true;
    }
    const conversation = conversations.find((item) => item.id === conversationId);
    const userMessage = createUserMessage(conversationId, content);
    const assistantMessage = createAssistantMessage(conversationId);
    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setSending(true);
    setStreamingId(assistantMessage.id);
    resetReactEvents();
    const shouldGenerateTitle = needsGeneratedTitle(conversation, createdNow);
    const onCompleted = shouldGenerateTitle
      ? () => {
        generateTitle(conversationId)
          .then((data) => { if (data?.title) onTitleUpdate(conversationId, data.title); })
          .catch(() => {});
      }
      : undefined;
    runConversation(
      conversationId,
      content,
      assistantMessage._tempId,
      isAutoRoute(conversation) ? undefined : activeAgent,
      undefined,
      onCompleted,
    );
  }, [activeAgent, activeConversation, conversations, onAutoCreate, onTitleUpdate, resetReactEvents, runConversation, setMessages, setSending, setStreamingId]);

  const handleRegenerate = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    if (!lastUserMessage || !activeConversation) return;
    const assistantMessage = createAssistantMessage(activeConversation);
    setMessages((previous) => [...previous.slice(0, -1), assistantMessage]);
    setSending(true);
    setStreamingId(assistantMessage.id);
    resetReactEvents();
    runConversation(activeConversation, lastUserMessage.content, assistantMessage._tempId, undefined, { regenerate: true });
  }, [activeConversation, messages, resetReactEvents, runConversation, setMessages, setSending, setStreamingId]);

  const handleStop = useCallback(() => {
    abort();
    finishStream(streamBufferRef.current.id);
  }, [abort, finishStream]);

  return { handleSend, handleRegenerate, handleStop, handleToolApproval };
}
