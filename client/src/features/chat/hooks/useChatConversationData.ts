import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAgents, getMessages, getSettings } from '@/services/api';
import type { Agent, DecisionTraceItem, Message, ReActStep } from '@/types';
import {
  createInitialReactEventState,
  reduceReactEvent,
  type ReactReducerEvent,
} from './useReactEventReducer';
import type { AgentRunStatusData } from '../components/AgentRunStatus';

interface UseChatConversationDataOptions {
  activeConversation: string | null;
  initialMessage?: string | null;
}

/**
 * 管理当前会话的数据加载、运行轨迹和页面级显示状态。
 * @param options 当前会话和外部初始消息
 * @returns 会话状态、引用及 ReAct 事件操作
 */
export default function useChatConversationData({
  activeConversation,
  initialMessage,
}: UseChatConversationDataOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState('general');
  const [autoRoutedAgent, setAutoRoutedAgent] = useState<string | null>(null);
  const [reactSteps, setReactSteps] = useState<ReActStep[]>([]);
  const [reactRunId, setReactRunId] = useState<string | null>(null);
  const [decisionTrace, setDecisionTrace] = useState<DecisionTraceItem[]>([]);
  const [agentRunStatus, setAgentRunStatus] = useState<AgentRunStatusData | null>(null);
  const [showReactSteps, setShowReactSteps] = useState(true);
  const reactEventStateRef = useRef(createInitialReactEventState());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dispatchReactEvent = useCallback((event: ReactReducerEvent) => {
    const next = reduceReactEvent(reactEventStateRef.current, event);
    reactEventStateRef.current = next;
    setReactSteps(next.steps);
    setReactRunId(next.runId);
    setDecisionTrace(next.decisionTrace);
  }, []);

  const resetReactEvents = useCallback(() => {
    reactEventStateRef.current = createInitialReactEventState();
    setReactSteps([]);
    setReactRunId(null);
    setDecisionTrace([]);
    setAgentRunStatus(null);
  }, []);

  useEffect(() => {
    fetchAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgents([{
        id: 'general', name: '通用助手', label: '通用助手', description: '', type: 'general',
        systemPrompt: null, mcpServerIds: [], available: true, errorMessage: null,
        triggerKeywords: [], createdAt: '', updatedAt: '',
      }]));
  }, []);

  useEffect(() => {
    getSettings()
      .then((data) => setShowReactSteps(data.showReactSteps !== false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      return;
    }
    if (initialMessage) {
      setLoading(false);
      setMessages([]);
      return;
    }
    setLoading(true);
    setMessages([]);
    getMessages(activeConversation)
      .then((data) => setMessages(data.messages || []))
      .catch((error: unknown) => console.error('Failed to load messages:', error))
      .finally(() => setLoading(false));
  }, [activeConversation, initialMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(false);
  }, [messages]);

  useEffect(() => {
    setAutoRoutedAgent(null);
    resetReactEvents();
  }, [activeConversation, resetReactEvents]);

  return {
    messages,
    setMessages,
    loading,
    agents,
    setAgents,
    activeAgent,
    setActiveAgent,
    autoRoutedAgent,
    setAutoRoutedAgent,
    reactSteps,
    reactRunId,
    decisionTrace,
    agentRunStatus,
    setAgentRunStatus,
    showReactSteps,
    messagesEndRef,
    dispatchReactEvent,
    resetReactEvents,
  };
}
