import { useEffect, useRef, useState } from 'react';
import type { MarkdownRendererProps } from '@/shared/components/MarkdownRenderer';
import ChatAreaView from './ChatAreaView';
import useSSE from '@/hooks/useSSE';
import type { Conversation, EndpointOutput } from '@/types';
import useChatConversationData from '../hooks/useChatConversationData';
import useChatRunActions from '../hooks/useChatRunActions';
import useChatAgentActions from '../hooks/useChatAgentActions';

export interface ChatAreaProps {
  activeConversation: string | null;
  conversations: Conversation[];
  onAutoCreate: (title?: string) => Promise<string | undefined>;
  onTitleUpdate: (id: string, title: string) => void;
  onUpdateConversation?: (convId: string, updates: Partial<Conversation>) => void;
  activeEndpoint: EndpointOutput | null;
  endpoints: EndpointOutput[];
  onEndpointChange: () => Promise<void>;
  initialMessage?: string | null;
  onInitialMessageSent?: () => void;
  onLinkClick?: MarkdownRendererProps['onLinkClick'];
}

/** 聊天页控制器：组合页面数据、运行动作和代理选择，再交给纯视图渲染。 */
export default function ChatArea({
  activeConversation,
  conversations,
  onAutoCreate,
  onTitleUpdate,
  onUpdateConversation,
  activeEndpoint,
  endpoints,
  onEndpointChange,
  initialMessage,
  onInitialMessageSent,
  onLinkClick,
}: ChatAreaProps) {
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const { send, abort } = useSSE();
  const previousConversationRef = useRef<string | null>(null);
  const conversationData = useChatConversationData({ activeConversation, initialMessage });
  const {
    messages,
    setMessages,
    loading,
    agents,
    activeAgent,
    setActiveAgent,
    autoRoutedAgent,
    setAutoRoutedAgent,
    reactSteps,
    decisionTrace,
    agentRunStatus,
    setAgentRunStatus,
    showReactSteps,
    messagesEndRef,
    dispatchReactEvent,
    resetReactEvents,
  } = conversationData;

  const runActions = useChatRunActions({
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
  });
  const { handleSend } = runActions;

  useEffect(() => {
    if (previousConversationRef.current && previousConversationRef.current !== activeConversation) abort();
    previousConversationRef.current = activeConversation;
  }, [abort, activeConversation]);

  useEffect(() => {
    if (!initialMessage || sending) return;
    handleSend(initialMessage);
    onInitialMessageSent?.();
  }, [handleSend, initialMessage, onInitialMessageSent, sending]);

  const currentConversation = activeConversation
    ? conversations.find((conversation) => conversation.id === activeConversation)
    : undefined;
  const lockedAgent = currentConversation?.lockedAgent || null;
  const routingMode = currentConversation?.routingMode || 'auto';
  const title = currentConversation?.title || (activeConversation ? 'Conversation' : '');

  const agentActions = useChatAgentActions({
    activeConversation,
    routingMode,
    onUpdateConversation,
    setActiveAgent,
  });

  return (
    <ChatAreaView
      activeConversation={activeConversation}
      activeEndpoint={activeEndpoint}
      endpoints={endpoints}
      title={title}
      loading={loading}
      messages={messages}
      streamingId={streamingId}
      messagesEndRef={messagesEndRef}
      reactSteps={reactSteps}
      decisionTrace={decisionTrace}
      agentRunStatus={agentRunStatus}
      showReactSteps={showReactSteps}
      sending={sending}
      agents={agents}
      activeAgent={activeAgent}
      autoRoutedAgent={autoRoutedAgent}
      lockedAgent={lockedAgent}
      routingMode={routingMode}
      onEndpointChange={onEndpointChange}
      onRegenerate={runActions.handleRegenerate}
      onLinkClick={onLinkClick}
      onToolApproval={runActions.handleToolApproval}
      onSelectAgent={agentActions.handleSelectAgent}
      onUnlock={agentActions.handleUnlock}
      onStop={runActions.handleStop}
      onSend={handleSend}
    />
  );
}
