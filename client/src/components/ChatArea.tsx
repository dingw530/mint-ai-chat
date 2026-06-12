import { useState, useEffect, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import InputBox from './InputBox';
import ModelSwitcher from './ModelSwitcher';
import { getMessages, fetchAgents, generateTitle, lockAgent, unlockAgent, getSettings } from '../services/api';
import useSSE from '../hooks/useSSE';
import type { Conversation, EndpointOutput, Agent, Message, ReActStep } from '../types';

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z" />
    </svg>
  );
}

function AgentIcon({ id }: { id: string }) {
  const icons: Record<string, React.ReactNode> = {
    general: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
        <circle cx="12" cy="11" r="1.5" />
      </svg>
    ),
    weather: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 6a1 1 0 001-1V3a1 1 0 00-2 0v2a1 1 0 001 1zm0 12a1 1 0 00-1 1v2a1 1 0 002 0v-2a1 1 0 00-1-1zm8-7h-2a1 1 0 000 2h2a1 1 0 000-2zM6 12a1 1 0 00-1-1H3a1 1 0 000 2h2a1 1 0 001-1zm12.07-6.07a1 1 0 00-1.41 0l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06a1 1 0 000-1.41zM7.4 16.6a1 1 0 00-1.41 0l-1.06 1.06a1 1 0 001.41 1.41l1.06-1.06a1 1 0 000-1.41zm11.32 1.06l-1.06-1.06a1 1 0 00-1.41 1.41l1.06 1.06a1 1 0 001.41-1.41zM7.4 7.4a1 1 0 001.41 0 1 1 0 000-1.41L7.75 4.93a1 1 0 00-1.41 1.41L7.4 7.4zm5.6 2.6a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
  };
  const svg = icons[id] || (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2l1.5 6.5L20 9l-5 4.5 1.5 6.5L12 16l-6.5 4L8 13.5 3 9l6.5-.5L12 2z" />
    </svg>
  );
  return <span className="agent-icon">{svg}</span>;
}

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
  onOpenSettings: () => void;
  onAutoCreate: (title?: string) => Promise<string | undefined>;
  onRefreshConversations?: () => void;
  onTitleUpdate: (id: string, title: string) => void;
  onUpdateConversation?: (convId: string, updates: Partial<Conversation>) => void;
  activeEndpoint: EndpointOutput | null;
  endpoints: EndpointOutput[];
  onEndpointChange: () => Promise<void>;
}

export default function ChatArea({
  activeConversation,
  conversations,
  onOpenSettings,
  onAutoCreate,
  onRefreshConversations,
  onTitleUpdate,
  onUpdateConversation,
  activeEndpoint,
  endpoints,
  onEndpointChange,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState('general');
  const [autoRoutedAgent, setAutoRoutedAgent] = useState<string | null>(null);
  const [reactSteps, setReactSteps] = useState<ReActStep[]>([]);
  const [showReactSteps, setShowReactSteps] = useState(true);
  const { send, abort } = useSSE();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(activeConversation);

  useEffect(() => {
    convIdRef.current = activeConversation;
  }, [activeConversation]);
  const prevConvRef = useRef<string | null>(null);

  useEffect(() => {
    fetchAgents()
      .then((data) => {
        setAgents(data.agents || []);
        const weather = (data.agents || []).find((a: Agent) => a.id === 'weather');
        if (!weather?.available && activeAgent === 'weather') {
          setActiveAgent('general');
        }
      })
      .catch(() => {
        setAgents([{ id: 'general', label: '通用助手', available: true } as Agent]);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSettings().then((data) => {
      setShowReactSteps(data.showReactSteps !== false);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeConversation) {
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
  }, [activeConversation]);

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
    setReactSteps([]);
  }, [activeConversation]);

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
      const convTitle = createdNow ? 'New Conversation' : conversations.find((c) => c.id === convId)?.title;

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
      setReactSteps([]);

      const currentConv = conversations.find((c) => c.id === convId);
      const isAutoRoute = (currentConv?.routingMode || 'auto') === 'auto' && !currentConv?.lockedAgent;

      send(convId, content, {
        onChunk: (chunk: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return updated;
          });
        },
        onReasoning: (chunk: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
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
          if (isAutoRoute) {
            setActiveAgent(agentId);
          }
        },
        onThought: (content: string) => {
          if (!content) return;
          setReactSteps((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'thought') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: ((last as ReActStep & { content?: string }).content || '') + content } as ReActStep;
              return updated;
            }
            return [...prev, { type: 'thought', content } as ReActStep];
          });
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + content,
              };
            }
            return updated;
          });
        },
        onToolCallStart: (data: Record<string, unknown>) => {
          setReactSteps((prev) => [...prev, {
            type: 'tool_call_start',
            toolName: data.toolName as string,
            arguments: data.arguments as string,
          } as ReActStep]);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
              const segments = [...(last.segments || []), {
                type: 'tool_call' as const,
                toolName: data.toolName as string,
                status: 'running' as const,
                arguments: data.arguments,
              }];
              updated[updated.length - 1] = { ...last, segments };
            }
            return updated;
          });
        },
        onToolCallEnd: (data: Record<string, unknown>) => {
          setReactSteps((prev) => [...prev, {
            type: 'tool_call_end',
            toolName: data.toolName as string,
            result: data.result as string,
            duration: data.duration as number,
          } as ReActStep]);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
              const segments = [...(last.segments || [])];
              for (let i = segments.length - 1; i >= 0; i--) {
                const seg = segments[i];
                if (seg.type === 'tool_call' && seg.status === 'running' && seg.toolName === data.toolName) {
                  segments[i] = { ...seg, status: 'done' as const, result: data.result as string, duration: data.duration as number };
                  break;
                }
              }
              updated[updated.length - 1] = { ...last, segments };
            }
            return updated;
          });
        },
        onToolCallError: (data: Record<string, unknown>) => {
          setReactSteps((prev) => [...prev, {
            type: 'tool_call_error',
            toolName: data.toolName as string,
            error: data.error as string,
            retryCount: data.retryCount as number,
          } as ReActStep]);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
              const segments = [...(last.segments || [])];
              for (let i = segments.length - 1; i >= 0; i--) {
                const seg = segments[i];
                if (seg.type === 'tool_call' && seg.status === 'running' && seg.toolName === data.toolName) {
                  segments[i] = { ...seg, status: 'error' as const, error: data.error as string, retryCount: data.retryCount as number };
                  break;
                }
              }
              updated[updated.length - 1] = { ...last, segments };
            }
            return updated;
          });
        },
        onAnswerReady: () => {
          // Content already streamed via onThought/onChunk — no append needed
          setReactSteps((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'thought') return prev.slice(0, -1);
            return prev;
          });
        },
        onDone: () => {
          setSending(false);
          setStreamingId(null);
          if (convTitle === 'New Conversation') {
            generateTitle(convId).then((data) => {
              if (data?.title && onTitleUpdate) {
                onTitleUpdate(convId, data.title);
              }
            }).catch(() => {});
          }
        },
        onError: (err: Error) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
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
          setReactSteps([]);
        },
      }, isAutoRoute ? undefined : activeAgent);
    },
    [activeConversation, conversations, send, activeAgent, onAutoCreate, onTitleUpdate]
  );

  const handleStop = useCallback(() => {
    abort();
    setSending(false);
    setStreamingId(null);
  }, [abort]);

  const handleLock = useCallback(async (agentId: string) => {
    const convId = convIdRef.current;
    if (!convId) return;
    try {
      const data = await lockAgent(convId, agentId);
      if (data?.conversation && onUpdateConversation) {
        onUpdateConversation(convId, data.conversation);
      }
    } catch (err) {
      console.error('Failed to lock agent:', err);
    }
  }, [onUpdateConversation]);

  const handleUnlock = useCallback(async () => {
    const convId = convIdRef.current;
    if (!convId) return;
    try {
      const data = await unlockAgent(convId);
      if (data?.conversation && onUpdateConversation) {
        onUpdateConversation(convId, data.conversation);
      }
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

    send(convId, lastUserMsg.content, {
      onChunk: (chunk: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
          }
          return updated;
        });
      },
      onReasoning: (chunk: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
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
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + content,
            };
          }
          return updated;
        });
      },
      onAnswerReady: () => {
        // Content already streamed via onThought/onChunk — no append needed
      },
      onDone: () => {
        setSending(false);
        setStreamingId(null);
      },
      onError: (err: Error) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && (last as Message & { _tempId?: string })._tempId === tempAssistantMsg._tempId) {
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
        setReactSteps([]);
      },
    }, undefined, { regenerate: true });
  }, [messages, send, activeAgent]);

  const currentConv = activeConversation
    ? conversations.find((c) => c.id === activeConversation)
    : null;
  const lockedAgent = currentConv?.lockedAgent || null;
  const routingMode = currentConv?.routingMode || 'auto';
  const title = currentConv?.title || (activeConversation ? 'Conversation' : '');

  return (
    <div className="main-area">
      <div className="main-header">
        <h2>{title}</h2>
        <div className="main-header-right">
          <ModelSwitcher
            activeEndpoint={activeEndpoint}
            endpoints={endpoints}
            onEndpointChange={onEndpointChange}
          />
          <button className="settings-btn" onClick={onOpenSettings} title="设置">
            <SettingsIcon />
          </button>
        </div>
      </div>
      <div className="chat-area">
        {loading ? (
          <div className="messages-loading"><LoadingSpinner /></div>
        ) : (
          <MessageList messages={messages} streamingId={streamingId} scrollRef={messagesEndRef} onRegenerate={handleRegenerate} reactSteps={reactSteps} showReactSteps={showReactSteps} />
        )}
        <div className="agent-selector">
          <div className="agent-bar">
            {agents.map((agent) => {
              const isDisabled = agent.available === false;
              const label = agent.label || agent.name || agent.id;
              const titleText = isDisabled
                ? (agent.errorMessage || `Agent "${label}" is not available`)
                : (agent.description || label);
              const isLocked = !!lockedAgent;
              const isLockedAgent = lockedAgent === agent.id;
              const isAutoRouted = autoRoutedAgent === agent.id && !isLocked;

              let btnClass = 'agent-btn';
              if (isDisabled) {
                btnClass += ' disabled';
              } else if (isLocked && isLockedAgent) {
                btnClass += ' locked';
              } else if (isLocked) {
                btnClass += ' disabled';
              } else if (isAutoRouted) {
                btnClass += ' auto-routed';
              } else if (activeAgent === agent.id && routingMode === 'manual') {
                btnClass += ' active';
              }

              const handleClick = () => {
                if (isDisabled || (isLocked && !isLockedAgent)) return;
                if (routingMode === 'auto') {
                  handleLock(agent.id);
                } else {
                  setActiveAgent(agent.id);
                }
              };

              return (
                <button
                  key={agent.id}
                  className={btnClass}
                  disabled={isDisabled || (isLocked && !isLockedAgent)}
                  onClick={handleClick}
                  title={titleText}
                >
                  <AgentIcon id={agent.id} />
                  {label}
                  {isLockedAgent && (
                    <span className="lock-icon">
                      <svg viewBox="0 0 24 24" width="12" height="12" xmlns="http://www.w3.org/2000/svg">
                        <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
                        <path d="M8 11V7a4 4 0 018 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                  )}
                  {isAutoRouted && <span className="auto-badge">自动</span>}
                  {isLocked && isLockedAgent && (
                    <span className="unlock-btn" onClick={(e) => { e.stopPropagation(); handleUnlock(); }}>
                      解锁
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {sending ? (
          <button
            className="stop-btn"
            onClick={handleStop}
          >
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
  );
}
