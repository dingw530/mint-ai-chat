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

const ImageGenerator = lazy(() => import('./components/ImageGenerator'));
const Settings = lazy(() => import('./components/Settings'));

function getInitialTheme() {
  try {
    return localStorage.getItem('mint-theme') || 'mint';
  } catch {
    return 'mint';
  }
}

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [endpoints, setEndpoints] = useState([]);
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  const [activeView, setActiveView] = useState('chat');

  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
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
      const active = list.find((ep) => ep.isActive) || null;
      setActiveEndpoint(active);
    } catch (err) {
      console.error('Failed to fetch endpoints:', err);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchEndpoints();
  }, [fetchConversations, fetchEndpoints]);

  // 加载完成后，有对话则自动选中第一个
  useEffect(() => {
    if (!loading && conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [loading, conversations, activeId]);

  // 主题切换：应用到 document + 持久化
  useEffect(() => {
    document.documentElement.classList.remove('theme-mint', 'theme-ocean', 'theme-snow', 'theme-anthropic', 'theme-reddot');
    document.documentElement.classList.add(`theme-${theme}`);
    try {
      localStorage.setItem('mint-theme', theme);
    } catch { /* ignore */ }
  }, [theme]);

  const handleCreate = async (title) => {
    try {
      const data = await createConversation(title || 'New Conversation');
      setConversations((prev) => [data.conversation, ...prev]);
      setActiveId(data.conversation.id);
      return data.conversation.id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleDelete = async (id) => {
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

  const handleRename = async (id, title) => {
    try {
      const data = await renameConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? data.conversation : c))
      );
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const handleTitleUpdate = useCallback((convId, title) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, title } : c))
    );
  }, []);

  const handleEndpointChange = useCallback(async () => {
    try {
      const data = await getEndpoints();
      setEndpoints(data.endpoints || []);
      const active = (data.endpoints || []).find((ep) => ep.isActive) || null;
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
          <ImageGenerator
            endpoints={endpoints}
            onOpenSettings={() => setShowSettings(true)}
          />
        </Suspense>
      ) : (
        <ChatArea
          activeConversation={activeId}
          conversations={conversations}
          onOpenSettings={() => setShowSettings(true)}
          onAutoCreate={handleCreate}
          onTitleUpdate={handleTitleUpdate}
          onUpdateConversation={(convId, updates) => {
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
