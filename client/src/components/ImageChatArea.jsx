import { useState, useEffect, useRef, useCallback } from 'react';
import MessageList from './MessageList';
import ImageInputBar from './ImageInputBar';
import { getMessages, sendImageMessage } from '../services/api';

export default function ImageChatArea({
  activeConversation,
  conversations,
  endpoints,
  onOpenSettings,
  onAutoCreate,
  onTitleUpdate,
}) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const prevConvRef = useRef(activeConversation);

  const imageEndpoints = (endpoints || []).filter((ep) => ep.category === 'image');

  // 切换对话时加载消息
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

  // 切换对话时重置
  useEffect(() => {
    if (prevConvRef.current && prevConvRef.current !== activeConversation) {
      setSending(false);
    }
    prevConvRef.current = activeConversation;
  }, [activeConversation]);

  const handleSend = useCallback(async (imageParams) => {
    let convId = activeConversation;
    let createdNow = false;

    // 无活跃对话时自动创建
    if (!convId) {
      if (!onAutoCreate) return;
      try {
        convId = await onAutoCreate();
        createdNow = true;
      } catch {
        return;
      }
    }

    const { content, endpointId, size, quality, output_format } = imageParams;

    const tempUserMsg = {
      id: `user-${Date.now()}`,
      _tempId: `user-${Date.now()}`,
      role: 'user',
      content,
    };

    const tempAssistantMsg = {
      id: `assistant-${Date.now()}`,
      _tempId: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
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
          (m) => m._tempId !== tempUserMsg._tempId && m._tempId !== tempAssistantMsg._tempId
        );
        if (data.userMessage) updated.push(data.userMessage);
        if (data.assistantMessage) updated.push(data.assistantMessage);
        return updated;
      });

      // 新建对话生成标题
      if (createdNow && data.userMessage && data.assistantMessage) {
        const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
        if (onTitleUpdate) onTitleUpdate(convId, title);
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = prev.filter((m) => m._tempId !== tempAssistantMsg._tempId);
        updated.push({
          id: `error-${Date.now()}`,
          role: 'error',
          content: `Error: ${err.message}`,
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
