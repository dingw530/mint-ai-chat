import { useState, useEffect, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import ImageInputBar from './ImageInputBar';
import { getMessages, sendImageMessage } from '../services/api';
import type { Conversation, EndpointOutput, Message } from '../types';

interface ImageChatAreaProps {
  activeConversation: string | null;
  conversations: Conversation[];
  endpoints: EndpointOutput[];
  onOpenSettings: () => void;
  onAutoCreate: (title?: string) => Promise<string | undefined>;
  onTitleUpdate: (id: string, title: string) => void;
}

export default function ImageChatArea({
  activeConversation,
  conversations,
  endpoints,
  onOpenSettings,
  onAutoCreate,
  onTitleUpdate,
}: ImageChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevConvRef = useRef(activeConversation);

  const imageEndpoints = (endpoints || []).filter((ep) => ep.category === 'image');

  useEffect(() => {
    if (activeConversation) {
      setLoading(true);
      setMessages([]);
      getMessages(activeConversation)
        .then((data) => {
          setMessages(data.messages || []);
        })
        .catch((err) => {
          console.error('Failed to load image messages:', err);
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
      setSending(false);
    }
    prevConvRef.current = activeConversation;
  }, [activeConversation]);

  const handleSend = useCallback(async (imageParams: { content: string; endpointId: string; size: string; quality: string; output_format: string }) => {
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

    const { content, endpointId, size, quality, output_format } = imageParams;

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
      conversationId: convId,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
    setSending(true);

    try {
      const data = await sendImageMessage(convId, {
        content,
        endpointId,
        size,
        quality,
        output_format,
      });

      setMessages((prev) => {
        const updated = prev.filter(
          (m: Message & { _tempId?: string }) => m._tempId !== tempUserMsg._tempId && m._tempId !== tempAssistantMsg._tempId
        );
        if (data.userMessage) updated.push(data.userMessage);
        if (data.assistantMessage) updated.push(data.assistantMessage);
        return updated;
      });

      if (createdNow && data.userMessage && data.assistantMessage) {
        const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
        if (onTitleUpdate) onTitleUpdate(convId, title);
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = prev.filter((m: Message & { _tempId?: string }) => m._tempId !== tempAssistantMsg._tempId);
        updated.push({
          id: `error-${Date.now()}`,
          role: 'error',
          content: `Error: ${(err as Error).message}`,
          conversationId: convId!,
          createdAt: new Date().toISOString(),
        });
        return updated;
      });
    } finally {
      setSending(false);
    }
  }, [activeConversation, onAutoCreate, onTitleUpdate]);

  const currentConv = activeConversation
    ? conversations.find((c) => c.id === activeConversation)
    : null;
  const title = currentConv?.title || (activeConversation ? '图片对话' : '');

  if (imageEndpoints.length === 0) {
    return (
      <div className="main-area">
        <div className="image-gen-empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <h3>暂无图片生成模型</h3>
          <p>请先在设置中配置一个分类为"图片生成"的模型端点。</p>
          <button className="btn-primary" onClick={onOpenSettings}>前往设置</button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-area">
      <div className="main-header">
        <h2>{title}</h2>
      </div>
      <div className="chat-area">
        {loading ? (
          <div className="messages-loading">
            <div className="loading-spinner"><span /><span /><span /></div>
          </div>
        ) : (
          <MessageList messages={messages} streamingId={null} scrollRef={messagesEndRef} />
        )}
        <ImageInputBar
          imageEndpoints={imageEndpoints}
          onSend={handleSend}
          sending={sending}
        />
      </div>
    </div>
  );
}
