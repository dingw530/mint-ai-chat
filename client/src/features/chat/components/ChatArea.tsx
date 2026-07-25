import { useState, useEffect, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import type { MarkdownRendererProps } from '@/shared/components/MarkdownRenderer';
import InputBox from './InputBox';
import AgentBar from './AgentBar';
import ChatHeader from './ChatHeader';
import DecisionTrace from './DecisionTrace';
import IngestionTaskCards from './IngestionTaskCards';
import {
  getMessages,
  fetchAgents,
  generateTitle,
  lockAgent,
  unlockAgent,
  getSettings,
} from '@/services/api';
import useSSE from '@/hooks/useSSE';
import type { Conversation, EndpointOutput, Agent, Message, ReActStep, DecisionTraceItem } from '@/types';
import {
  createInitialReactEventState,
  reduceReactEvent,
  type ReactReducerEvent,
} from '../hooks/useReactEventReducer';

function LoadingSpinner() {
  return (
    <div className="loading-spinner">
      <span />
      <span />
      <span />
    </div>
  );
}

interface ChatAreaProps {
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState('general');
  const [autoRoutedAgent, setAutoRoutedAgent] = useState<string | null>(null);
  const [reactSteps, setReactSteps] = useState<ReActStep[]>([]);
  const [decisionTrace, setDecisionTrace] = useState<DecisionTraceItem[]>([]);
  const reactEventStateRef = useRef(createInitialReactEventState());
  const [showReactSteps, setShowReactSteps] = useState(true);
  const { send, abort } = useSSE();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(activeConversation);
  // Streaming perf: accumulate chunks in a ref and throttle state updates
  const streamBufferRef = useRef<{ id: string; content: string }>({ id: '', content: '' });
  const streamRafRef = useRef<number>(0);

  const dispatchReactEvent = useCallback((event: ReactReducerEvent) => {
    const next = reduceReactEvent(reactEventStateRef.current, event);
    reactEventStateRef.current = next;
    setReactSteps(next.steps);
    setDecisionTrace(next.decisionTrace);
  }, []);

  const resetReactEvents = useCallback(() => {
    reactEventStateRef.current = createInitialReactEventState();
    setReactSteps([]);
    setDecisionTrace([]);
  }, []);

  useEffect(() => {
    convIdRef.current = activeConversation;
  }, [activeConversation, initialMessage]);
  const prevConvRef = useRef<string | null>(null);

  useEffect(() => {
    fetchAgents()
      .then((data) => {
        setAgents(data.agents || []);
      })
      .catch(() => {
        setAgents([{ id: 'general', label: '通用助手', available: true } as Agent]);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSettings()
      .then((data) => {
        setShowReactSteps(data.showReactSteps !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeConversation) {
      if (initialMessage) {
        // Wiki -> Chat 跳转: 对话刚创建无消息, handleSend 会加 temp 消息
        setLoading(false);
        setMessages([]);
        return;
      }
      setLoading(true);
      setMessages([]);
      getMessages(activeConversation)
        .then((data) => {
          setMessages(data.messages || []);
        })
        .catch((err) => {
          console.error('Failed to load messages:', err);
        })
        .finally(() => setLoading(false));
    } else {
      setMessages([]);
    }
  }, [activeConversation, initialMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(false);
  }, [messages]);

  useEffect(() => {
    if (prevConvRef.current && prevConvRef.current !== activeConversation) {
      abort();
    }
    prevConvRef.current = activeConversation;
  }, [activeConversation, abort]);

  useEffect(() => {
    setAutoRoutedAgent(null);
    resetReactEvents();
  }, [activeConversation, resetReactEvents]);

  // Auto-send initial message from external source (e.g. wiki -> chat)
  // Conversation is already created by App; just send the message.
  useEffect(() => {
    if (!initialMessage || sending) return;
    handleSend(initialMessage);
    onInitialMessageSent?.();
  }, [initialMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    async (content: string) => {
      let convId: string | null = activeConversation;
      let createdNow = false;
      if (!convId) {
        if (!onAutoCreate) return;
        try {
          const newId = await onAutoCreate();
          if (!newId) return;
          convId = newId;
          createdNow = true;
        } catch {
          return;
        }
      }
      const convTitle = createdNow
        ? 'New Conversation'
        : conversations.find((c) => c.id === convId)?.title;

      const tempUserMsg: Message & { _tempId: string } = {
        id: `user-${Date.now()}`,
        _tempId: `user-${Date.now()}`,
        role: 'user',
        content,
        conversationId: convId,
        createdAt: new Date().toISOString(),
      };

      const tempAssistantMsg: Message & { _tempId: string } = {
        id: `assistant-${Date.now()}`,
        _tempId: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        reasoning: '',
        conversationId: convId,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
      setSending(true);
      setStreamingId(tempAssistantMsg.id);
      resetReactEvents();

      const currentConv = conversations.find((c) => c.id === convId);
      const isAutoRoute =
        (currentConv?.routingMode || 'auto') === 'auto' && !currentConv?.lockedAgent;

      // Streaming perf: buffer chunks in ref, flush via rAF
      streamBufferRef.current = { id: tempAssistantMsg._tempId, content: '' };
      const tempId = tempAssistantMsg._tempId;

      const flushStream = () => {
        const buf = streamBufferRef.current;
        if (!buf.content) return;
        const text = buf.content;
        buf.content = ''; // reset after flush
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && (last as Message & { _tempId?: string })._tempId === tempId) {
            const segments = [...(last.segments || [])];
            const lastSeg = segments[segments.length - 1];
            if (lastSeg && lastSeg.type === 'text') {
              segments[segments.length - 1] = { ...lastSeg, content: text };
            } else {
              segments.push({ type: 'text' as const, content: text });
            }
            updated[updated.length - 1] = { ...last, content: text, segments };
          }
          return updated;
        });
      };

      const scheduleFlush = () => {
        if (streamRafRef.current) return;
        streamRafRef.current = requestAnimationFrame(() => {
          streamRafRef.current = 0;
          flushStream();
        });
      };

      send(
        convId,
        content,
        {
          onRunStarted: (data) => {
            dispatchReactEvent({ type: 'run_started', ...data });
          },
          onRoundStarted: (data) => {
            dispatchReactEvent({ type: 'round_started', ...data });
          },
          onLoopDetected: (data) => {
            dispatchReactEvent({ type: 'loop_detected', ...data });
          },
          onRunCompleted: (data) => {
            dispatchReactEvent({ type: 'run_completed', ...data });
          },
          onRunCancelled: (data) => {
            dispatchReactEvent({ type: 'run_cancelled', ...data });
          },
          onTokenUsage: (data) => {
            const estimatedTokens = Number(data.estimatedTokens);
            if (!Number.isFinite(estimatedTokens)) return;
            setMessages((prev) => prev.map((message) =>
              (message as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
                ? { ...message, estimatedTokens }
                : message,
            ));
          },
          onChunk: (chunk: string) => {
            streamBufferRef.current.content += chunk;
            scheduleFlush();
          },
          onReasoning: (chunk: string) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                const segments = [...(last.segments || [])];
                const lastSeg = segments[segments.length - 1];
                if (lastSeg && lastSeg.type === 'thinking') {
                  segments[segments.length - 1] = { ...lastSeg, content: lastSeg.content + chunk };
                } else {
                  segments.push({ type: 'thinking', content: chunk });
                }
                updated[updated.length - 1] = {
                  ...last,
                  reasoning: (last.reasoning || '') + chunk,
                  segments,
                };
              }
              return updated;
            });
          },
          onRouting: (agentId: string) => {
            setAutoRoutedAgent(agentId);
            if (isAutoRoute) setActiveAgent(agentId);
          },
          onThought: (content: string) => {
            if (!content) return;
            dispatchReactEvent({ type: 'thought', content });
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                const segments = [...(last.segments || [])];
                const lastSeg = segments[segments.length - 1];
                if (lastSeg && lastSeg.type === 'text') {
                  segments[segments.length - 1] = {
                    ...lastSeg,
                    content: lastSeg.content + content,
                  };
                } else {
                  segments.push({ type: 'text' as const, content });
                }
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + content,
                  segments,
                };
              }
              return updated;
            });
          },
          onToolCallStart: (data: Record<string, unknown>) => {
            dispatchReactEvent({ type: 'tool_call_start', ...data });
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                updated[updated.length - 1] = {
                  ...last,
                  segments: [
                    ...(last.segments || []),
                    {
                      type: 'tool_call' as const,
                      callId: data.callId as string | undefined,
                      toolName: data.toolName as string,
                      summary: data.summary as string | undefined,
                      status: 'running' as const,
                      arguments: data.arguments,
                    },
                  ],
                };
              }
              return updated;
            });
          },
          onToolCallEnd: (data: Record<string, unknown>) => {
            dispatchReactEvent({ type: 'tool_call_end', ...data });
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                const segments = [...(last.segments || [])];
                for (let i = segments.length - 1; i >= 0; i--) {
                  const seg = segments[i];
                  if (
                    seg.type === 'tool_call' &&
                    seg.status === 'running' &&
                    (data.callId ? seg.callId === data.callId : seg.toolName === data.toolName)
                  ) {
                    segments[i] = {
                      ...seg,
                      status: 'done' as const,
                      result: data.result as string,
                      duration: data.duration as number,
                      summary: (data.summary as string | undefined) ?? seg.summary,
                    };
                    break;
                  }
                }
                updated[updated.length - 1] = { ...last, segments };
              }
              return updated;
            });
          },
          onToolCallError: (data: Record<string, unknown>) => {
            dispatchReactEvent({ type: 'tool_call_error', ...data });
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                const segments = [...(last.segments || [])];
                for (let i = segments.length - 1; i >= 0; i--) {
                  const seg = segments[i];
                  if (
                    seg.type === 'tool_call' &&
                    seg.status === 'running' &&
                    (data.callId ? seg.callId === data.callId : seg.toolName === data.toolName)
                  ) {
                    segments[i] = {
                      ...seg,
                      status: 'error' as const,
                      error: data.error as string,
                      retryCount: data.retryCount as number,
                    };
                    break;
                  }
                }
                updated[updated.length - 1] = { ...last, segments };
              }
              return updated;
            });
          },
          onAnswerReady: () => {
            dispatchReactEvent({ type: 'answer_ready' });
          },
          onDone: () => {
            if (streamRafRef.current) {
              cancelAnimationFrame(streamRafRef.current);
              streamRafRef.current = 0;
            }
            flushStream(); // commit any buffered content
            setSending(false);
            setStreamingId(null);
            if (!convTitle || convTitle === 'New Conversation') {
              generateTitle(convId)
                .then((data) => {
                  if (data?.title && onTitleUpdate) onTitleUpdate(convId, data.title);
                })
                .catch(() => {});
            }
          },
          onError: (err: Error) => {
            dispatchReactEvent({ type: 'run_failed', error: err.message });
            if (streamRafRef.current) {
              cancelAnimationFrame(streamRafRef.current);
              streamRafRef.current = 0;
            }
            flushStream(); // commit any buffered content before showing error
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (
                last &&
                (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ) {
                updated[updated.length - 1] = {
                  ...last,
                  role: 'error',
                  content: `Error: ${err.message}`,
                };
              }
              return updated;
            });
            setSending(false);
            setStreamingId(null);
          },
        },
        isAutoRoute ? undefined : activeAgent,
      );
    },
    [
      activeConversation,
      conversations,
      send,
      activeAgent,
      onAutoCreate,
      onTitleUpdate,
      dispatchReactEvent,
      resetReactEvents,
    ],
  );

  const handleStop = useCallback(() => {
    abort();
    setSending(false);
    setStreamingId(null);
  }, [abort]);

  const handleLock = useCallback(
    async (agentId: string) => {
      const convId = convIdRef.current;
      if (!convId) return;
      try {
        const data = await lockAgent(convId, agentId);
        if (data?.conversation && onUpdateConversation)
          onUpdateConversation(convId, data.conversation);
      } catch (err) {
        console.error('Failed to lock agent:', err);
      }
    },
    [onUpdateConversation],
  );

  const handleUnlock = useCallback(async () => {
    const convId = convIdRef.current;
    if (!convId) return;
    try {
      const data = await unlockAgent(convId);
      if (data?.conversation && onUpdateConversation)
        onUpdateConversation(convId, data.conversation);
    } catch (err) {
      console.error('Failed to unlock agent:', err);
    }
  }, [onUpdateConversation]);

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;
    const convId = convIdRef.current;
    if (!convId) return;

    setMessages((prev) => prev.slice(0, -1));

    const tempAssistantMsg: Message & { _tempId: string } = {
      id: `assistant-${Date.now()}`,
      _tempId: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      reasoning: '',
      conversationId: convId,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempAssistantMsg]);
    setSending(true);
    setStreamingId(tempAssistantMsg.id);
    resetReactEvents();

    streamBufferRef.current = { id: tempAssistantMsg._tempId, content: '' };
    const regenTempId = tempAssistantMsg._tempId;
    const regenFlush = () => {
      const buf = streamBufferRef.current;
      if (!buf.content) return;
      const text = buf.content;
      buf.content = '';
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && (last as Message & { _tempId?: string })._tempId === regenTempId) {
          const segments = [...(last.segments || [])];
          const lastSeg = segments[segments.length - 1];
          if (lastSeg && lastSeg.type === 'text') {
            segments[segments.length - 1] = { ...lastSeg, content: text };
          } else {
            segments.push({ type: 'text' as const, content: text });
          }
          updated[updated.length - 1] = { ...last, content: text, segments };
        }
        return updated;
      });
    };
    const regenScheduleFlush = () => {
      if (streamRafRef.current) return;
      streamRafRef.current = requestAnimationFrame(() => {
        streamRafRef.current = 0;
        regenFlush();
      });
    };

    send(
      convId,
      lastUserMsg.content,
      {
        onRunStarted: (data) => {
          dispatchReactEvent({ type: 'run_started', ...data });
        },
        onRoundStarted: (data) => {
          dispatchReactEvent({ type: 'round_started', ...data });
        },
        onLoopDetected: (data) => {
          dispatchReactEvent({ type: 'loop_detected', ...data });
        },
        onRunCompleted: (data) => {
          dispatchReactEvent({ type: 'run_completed', ...data });
        },
        onRunCancelled: (data) => {
          dispatchReactEvent({ type: 'run_cancelled', ...data });
        },
        onTokenUsage: (data) => {
          const estimatedTokens = Number(data.estimatedTokens);
          if (!Number.isFinite(estimatedTokens)) return;
          setMessages((prev) => prev.map((message) =>
            (message as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
              ? { ...message, estimatedTokens }
              : message,
          ));
        },
        onChunk: (chunk: string) => {
          streamBufferRef.current.content += chunk;
          regenScheduleFlush();
        },
        onReasoning: (chunk: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (
              last &&
              (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
            ) {
              const segments = [...(last.segments || [])];
              const lastSeg = segments[segments.length - 1];
              if (lastSeg && lastSeg.type === 'thinking') {
                segments[segments.length - 1] = { ...lastSeg, content: lastSeg.content + chunk };
              } else {
                segments.push({ type: 'thinking', content: chunk });
              }
              updated[updated.length - 1] = {
                ...last,
                reasoning: (last.reasoning || '') + chunk,
                segments,
              };
            }
            return updated;
          });
        },
        onRouting: (agentId: string) => {
          setAutoRoutedAgent(agentId);
        },
        onThought: (content: string) => {
          if (!content) return;
          dispatchReactEvent({ type: 'thought', content });
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (
              last &&
              (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
            ) {
              const segments = [...(last.segments || [])];
              const lastSeg = segments[segments.length - 1];
              if (lastSeg && lastSeg.type === 'text') {
                segments[segments.length - 1] = { ...lastSeg, content: lastSeg.content + content };
              } else {
                segments.push({ type: 'text' as const, content });
              }
              updated[updated.length - 1] = { ...last, content: last.content + content, segments };
            }
            return updated;
          });
        },
        onToolCallStart: (data: Record<string, unknown>) => {
          dispatchReactEvent({ type: 'tool_call_start', ...data });
        },
        onToolCallEnd: (data: Record<string, unknown>) => {
          dispatchReactEvent({ type: 'tool_call_end', ...data });
        },
        onToolCallError: (data: Record<string, unknown>) => {
          dispatchReactEvent({ type: 'tool_call_error', ...data });
        },
        onAnswerReady: () => {
          dispatchReactEvent({ type: 'answer_ready' });
        },
        onDone: () => {
          if (streamRafRef.current) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = 0;
          }
          regenFlush();
          setSending(false);
          setStreamingId(null);
        },
        onError: (err: Error) => {
          dispatchReactEvent({ type: 'run_failed', error: err.message });
          if (streamRafRef.current) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = 0;
          }
          regenFlush();
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (
              last &&
              (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId
            ) {
              updated[updated.length - 1] = {
                ...last,
                role: 'error',
                content: `Error: ${err.message}`,
              };
            }
            return updated;
          });
          setSending(false);
          setStreamingId(null);
        },
      },
      undefined,
      { regenerate: true },
    );
  }, [messages, send, dispatchReactEvent, resetReactEvents]);

  const currentConv = activeConversation
    ? conversations.find((c) => c.id === activeConversation)
    : null;
  const lockedAgent = currentConv?.lockedAgent || null;
  const routingMode = currentConv?.routingMode || 'auto';
  const title = currentConv?.title || (activeConversation ? 'Conversation' : '');

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      if (routingMode === 'auto') {
        handleLock(agentId);
      } else {
        setActiveAgent(agentId);
      }
    },
    [routingMode, handleLock],
  );

  return (
    <div className="main-area">
      <ChatHeader
        title={title}
        activeEndpoint={activeEndpoint}
        endpoints={endpoints}
        onEndpointChange={onEndpointChange}
      />
      <div className="chat-area">
        {showReactSteps && decisionTrace.length > 0 && (
          <div className="decision-trace-sticky">
            <DecisionTrace items={decisionTrace} />
          </div>
        )}
        {loading ? (
          <div className="messages-loading">
            <LoadingSpinner />
          </div>
        ) : (
          <MessageList
            messages={messages}
            streamingId={streamingId}
            scrollRef={messagesEndRef}
            onRegenerate={handleRegenerate}
            reactSteps={reactSteps}
            showReactSteps={showReactSteps}
            onLinkClick={onLinkClick}
          />
        )}
        <div className="chat-composer">
          <div className="chat-input-zone">
            <IngestionTaskCards conversationId={activeConversation} />
            <div className="chat-input-row">
              <AgentBar
                agents={agents}
                activeAgent={activeAgent}
                autoRoutedAgent={autoRoutedAgent}
                lockedAgent={lockedAgent}
                routingMode={routingMode}
                onSelectAgent={handleSelectAgent}
                onUnlock={handleUnlock}
              />
              <div className="chat-input-main">
                {sending ? (
                  <button className="stop-btn" onClick={handleStop}>
                    <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                    </svg>
                    停止生成
                  </button>
                ) : (
                  <InputBox onSend={handleSend} disabled={sending} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
