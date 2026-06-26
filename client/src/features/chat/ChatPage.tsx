import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import SidebarHeader from '@/shared/components/SidebarHeader';
import SidebarFooter from '@/shared/components/SidebarFooter';
import ChatSidebar from './ChatSidebar';
import ChatArea from './components/ChatArea';
import { useConversations } from '@/hooks/useConversations';
import { getEndpoints } from '@/services/api';
import type { EndpointOutput } from '@/types';

type AppContext = { onOpenSettings: () => void };

export default function ChatPage() {
  const { onOpenSettings } = useOutletContext<AppContext>();
  const {
    conversations,
    loading,
    activeId,
    setActiveId,
    create,
    delete: deleteConv,
    clearAll,
    rename,
    updateTitle,
    updateConversation,
  } = useConversations();

  const [endpoints, setEndpoints] = useState<EndpointOutput[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<EndpointOutput | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const location = useLocation();

  // Extract wiki jump params from URL and feed to ChatArea
  // Clears URL immediately so StrictMode re-mount won't double-fire
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const msg = params.get('ask');
    const cid = params.get('cid');
    if (!msg || !cid) return;

    window.history.replaceState(null, '', '/chat');
    setActiveId(cid);
    setInitialMessage(msg);
  }, [location.search, setActiveId]);

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
    fetchEndpoints();
  }, [fetchEndpoints]);

  const handleInitialMessageSent = useCallback(() => {
    setInitialMessage(null);
  }, []);

  return (
    <>
      <aside className="sidebar sidebar--chat">
        <SidebarHeader onOpenSettings={onOpenSettings} />
        <ChatSidebar
          conversations={conversations}
          loading={loading}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => create()}
          onRename={rename}
          onDelete={deleteConv}
        />
        <SidebarFooter showClear onClearAll={clearAll} />
      </aside>
      <ChatArea
        activeConversation={activeId}
        conversations={conversations}
        onAutoCreate={create}
        onTitleUpdate={updateTitle}
        onUpdateConversation={updateConversation}
        activeEndpoint={activeEndpoint}
        endpoints={endpoints}
        onEndpointChange={fetchEndpoints}
        initialMessage={initialMessage}
        onInitialMessageSent={handleInitialMessageSent}
      />
    </>
  );
}
