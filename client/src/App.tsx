import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import {
  getConversations,
  createConversation,
  deleteConversation,
  renameConversation,
  getEndpoints,
} from './services/api';
import type { Conversation, EndpointOutput } from './types';

const ImageChatArea = lazy(() => import('./components/ImageChatArea'));
const Settings = lazy(() => import('./components/Settings'));

function getInitialTheme(): string {
  try {
    return localStorage.getItem('mint-theme') || 'mint';
  } catch {
    return 'mint';
  }
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [endpoints, setEndpoints] = useState<EndpointOutput[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<EndpointOutput | null>(null);
  const [activeView, setActiveView] = useState('chat');

  const fetchConversations = useCallback(async (type?: string) => {
    try {
      const data = await getConversations(type);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEndpoints = useCallback(async () => {
    try {
      const data = await getEndpoints();
      const list = data.endpoints || [];
      setEndpoints(list);
      const active = list.find((ep: EndpointOutput) => ep.isActive) || null;
      setActiveEndpoint(active);
    } catch (err) {
      console.error('Failed to fetch endpoints:', err);
    }
  }, []);

  useEffect(() => {
    fetchConversations(activeView === 'image' ? 'image' : undefined);
    fetchEndpoints();
  }, [fetchConversations, fetchEndpoints, activeView]);

  useEffect(() => {
    if (!loading) {
      if (conversations.length > 0) {
        if (!activeId || !conversations.find((c) => c.id === activeId)) {
          setActiveId(conversations[0].id);
        }
      } else {
        setActiveId(null);
      }
    }
  }, [loading, conversations, activeId]);

  useEffect(() => {
    document.documentElement.classList.remove('theme-mint', 'theme-ocean', 'theme-snow', 'theme-anthropic', 'theme-reddot');
    document.documentElement.classList.add(`theme-${theme}`);
    try {
      localStorage.setItem('mint-theme', theme);
    } catch { /* ignore */ }
  }, [theme]);

  const handleCreate = async (title?: string): Promise<string | undefined> => {
    try {
      const convType = activeView === 'image' ? 'image' : undefined;
      const data = await createConversation(title || 'New Conversation', convType);
      setConversations((prev) => [data.conversation, ...prev]);
      setActiveId(data.conversation.id);
      return data.conversation.id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      const data = await renameConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? data.conversation : c))
      );
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleTitleUpdate = useCallback((convId: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, title } : c))
    );
  }, []);

  const handleEndpointChange = useCallback(async () => {
    try {
      const data = await getEndpoints();
      setEndpoints(data.endpoints || []);
      const active = (data.endpoints || []).find((ep: EndpointOutput) => ep.isActive) || null;
      setActiveEndpoint(active);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
        loading={loading}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      {activeView === 'image' ? (
        <Suspense fallback={<div className="view-loading">加载中...</div>}>
          <ImageChatArea
            activeConversation={activeId}
            conversations={conversations}
            endpoints={endpoints}
            onOpenSettings={() => setShowSettings(true)}
            onAutoCreate={handleCreate}
            onTitleUpdate={handleTitleUpdate}
          />
        </Suspense>
      ) : (
        <ChatArea
          activeConversation={activeId}
          conversations={conversations}
          onOpenSettings={() => setShowSettings(true)}
          onAutoCreate={handleCreate}
          onTitleUpdate={handleTitleUpdate}
          onUpdateConversation={(convId: string, updates: Partial<Conversation>) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === convId ? { ...c, ...updates } : c))
            );
          }}
          activeEndpoint={activeEndpoint}
          endpoints={endpoints}
          onEndpointChange={handleEndpointChange}
        />
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <Settings onClose={() => { setShowSettings(false); fetchEndpoints(); }} theme={theme} onThemeChange={setTheme} />
        </Suspense>
      )}
    </div>
  );
}
