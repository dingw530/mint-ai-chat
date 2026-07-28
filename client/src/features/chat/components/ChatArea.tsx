import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarkdownRendererProps } from '@/shared/components/MarkdownRenderer';
import ChatAreaView from './ChatAreaView';
import { parseAgentRunStatusData } from './AgentRunStatus';
import {
  generateTitle,
  lockAgent,
  unlockAgent,
} from '@/services/api';
import useSSE from '@/hooks/useSSE';
import type { Conversation, EndpointOutput, Message } from '@/types';
import useChatConversationData from '../hooks/useChatConversationData';

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
  const convIdRef = useRef<string | null>(activeConversation);
  // Streaming perf: accumulate chunks in a ref and throttle state updates
  const streamBufferRef = useRef<{ id: string; content: string }>({ id: '', content: '' });
  const streamRafRef = useRef<number>(0);

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
  } = useChatConversationData({ activeConversation, initialMessage });

  const handleToolApproval = useCallback((approvalId: string, action: 'approve' | 'deny') => {
    if (!activeConversation) return;
    const updateApprovalMessage = (update: (message: Message) => Message) => {
      setMessages((prev) => prev.map((message) => (
        message.segments?.some((segment) => segment.type === 'tool_call' && segment.approvalId === approvalId)
          ? update(message)
          : message
      )));
    };
    const appendText = (content: string) => updateApprovalMessage((message) => {
      const segments = [...(message.segments || [])];
      const last = segments[segments.length - 1];
      if (last?.type === 'text') segments[segments.length - 1] = { ...last, content: last.content + content };
      else segments.push({ type: 'text', content });
      return { ...message, content: message.content + content, segments };
    });

    setSending(true);
    send(activeConversation, '', {
      onRunStarted: (data) => dispatchReactEvent({ type: 'run_started', ...data }),
      onRoundStarted: (data) => dispatchReactEvent({ type: 'round_started', ...data }),
      onAgentStatus: (data) => {
        const status = parseAgentRunStatusData(data);
        if (status) setAgentRunStatus(status);
      },
      onChunk: appendText,
      onAnswerReady: (content) => { if (content) appendText(content); },
      onReasoning: (content) => updateApprovalMessage((message) => ({
        ...message,
        reasoning: `${message.reasoning || ''}${content}`,
      })),
      onToolCallStart: (data) => updateApprovalMessage((message) => ({
        ...message,
        segments: [...(message.segments || []), {
          type: 'tool_call',
          callId: data.callId as string | undefined,
          toolName: String(data.toolName || ''),
          status: 'running',
          arguments: data.arguments,
        }],
      })),
      onToolCallEnd: (data) => updateApprovalMessage((message) => ({
        ...message,
        segments: message.segments?.map((segment) => (
          segment.type === 'tool_call' && (segment.approvalId === approvalId || segment.callId === data.callId)
            ? { ...segment, status: 'done' as const, result: String(data.result || '') }
            : segment
        )),
      })),
      onToolCallError: (data) => updateApprovalMessage((message) => ({
        ...message,
        segments: message.segments?.map((segment) => (
          data.status !== 'approval_required'
            && segment.type === 'tool_call'
            && (segment.approvalId === approvalId || segment.callId === data.callId)
            ? { ...segment, status: 'error' as const, error: String(data.error || '') }
            : segment
        )),
      })),
      onToolApprovalRequired: (data) => updateApprovalMessage((message) => ({
        ...message,
        segments: [...(message.segments || []), {
          type: 'tool_call',
          callId: data.callId as string | undefined,
          toolName: String(data.toolName || ''),
          status: 'approval_required',
          approvalId: data.approvalId as string | undefined,
          approvalReason: data.reason as string | undefined,
        }],
      })),
      onRunCompleted: (data) => dispatchReactEvent({ type: 'run_completed', ...data }),
      onRunCancelled: (data) => {
        dispatchReactEvent({ type: 'run_cancelled', ...data });
        setAgentRunStatus((previous) => previous ? { ...previous, phase: 'cancelled' } : previous);
      },
      onLoopDetected: (data) => dispatchReactEvent({ type: 'loop_detected', ...data }),
      onDone: () => { setSending(false); setStreamingId(null); },
      onError: (error) => {
        updateApprovalMessage((message) => ({
          ...message,
          segments: message.segments?.map((segment) => (
            segment.type === 'tool_call' && segment.approvalId === approvalId
              ? { ...segment, status: 'error' as const, error: error.message }
              : segment
          )),
        }));
        setSending(false);
        setStreamingId(null);
      },
    }, undefined, { control: { type: 'tool_approval', approvalId, action } });
  }, [activeConversation, dispatchReactEvent, send]);

  useEffect(() => {
    convIdRef.current = activeConversation;
  }, [activeConversation, initialMessage]);
  const prevConvRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevConvRef.current && prevConvRef.current !== activeConversation) {
      abort();
    }
    prevConvRef.current = activeConversation;
  }, [activeConversation, abort]);

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
          onAgentStatus: (data) => {
            const status = parseAgentRunStatusData(data);
            if (status) setAgentRunStatus(status);
          },
          onLoopDetected: (data) => {
            dispatchReactEvent({ type: 'loop_detected', ...data });
          },
          onRunCompleted: (data) => {
            dispatchReactEvent({ type: 'run_completed', ...data });
          },
          onRunCancelled: (data) => {
            dispatchReactEvent({ type: 'run_cancelled', ...data });
            setAgentRunStatus((previous) => previous ? { ...previous, phase: 'cancelled' } : previous);
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
          onToolApprovalRequired: (data: Record<string, unknown>) => {
            dispatchReactEvent({ type: 'approval_required', ...data });
            setMessages((prev) => prev.map((message) => {
              if ((message as Message & { _tempId?: string })._tempId !== tempAssistantMsg._tempId) return message;
              return {
                ...message,
                segments: message.segments?.map((segment) => (
                  segment.type === 'tool_call' && segment.status === 'running' && segment.callId === data.callId
                    ? {
                      ...segment,
                      status: 'approval_required' as const,
                      approvalId: data.approvalId as string | undefined,
                      approvalReason: data.reason as string | undefined,
                    }
                    : segment
                )),
              };
            }));
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
          onAgentStatus: (data) => {
            const status = parseAgentRunStatusData(data);
            if (status) setAgentRunStatus(status);
          },
        onLoopDetected: (data) => {
          dispatchReactEvent({ type: 'loop_detected', ...data });
        },
        onRunCompleted: (data) => {
          dispatchReactEvent({ type: 'run_completed', ...data });
        },
        onRunCancelled: (data) => {
          dispatchReactEvent({ type: 'run_cancelled', ...data });
          setAgentRunStatus((previous) => previous ? { ...previous, phase: 'cancelled' } : previous);
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
        onToolApprovalRequired: (data: Record<string, unknown>) => {
          dispatchReactEvent({ type: 'approval_required', ...data });
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
      onRegenerate={handleRegenerate}
      onLinkClick={onLinkClick}
      onToolApproval={handleToolApproval}
      onSelectAgent={handleSelectAgent}
      onUnlock={handleUnlock}
      onStop={handleStop}
      onSend={handleSend}
    />
  );
}
