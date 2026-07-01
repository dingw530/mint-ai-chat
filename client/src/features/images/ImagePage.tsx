import { useOutletContext } from 'react-router-dom';
import SidebarHeader from '@/shared/components/SidebarHeader';
import ImageSidebar from './ImageSidebar';
import ImageChatArea from './components/ImageChatArea';
import { useConversations } from '@/hooks/useConversations';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { useState, useEffect, useCallback } from 'react';
import { getEndpoints } from '@/services/api';
import type { EndpointOutput } from '@/types';

type AppContext = { onOpenSettings: () => void };

export default function ImagePage() {
  const { onOpenSettings } = useOutletContext<AppContext>();
  const { width: sidebarWidth, onMouseDown: onResizeMouseDown } = useSidebarResize();
  const {
    conversations,
    loading,
    activeId,
    setActiveId,
    create,
    delete: deleteConv,
    rename,
    updateTitle,
  } = useConversations('image');

  const [endpoints, setEndpoints] = useState<EndpointOutput[]>([]);

  const fetchEndpoints = useCallback(async () => {
    try {
      const data = await getEndpoints();
      setEndpoints(data.endpoints || []);
    } catch (err) {
      console.error('Failed to fetch endpoints:', err);
    }
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  return (
    <>
      <aside className="sidebar sidebar--image" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <SidebarHeader onOpenSettings={onOpenSettings} />
        <ImageSidebar
          conversations={conversations}
          loading={loading}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => create(undefined, 'image')}
          onRename={rename}
          onDelete={deleteConv}
        />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
      </aside>
      <ImageChatArea
        activeConversation={activeId}
        conversations={conversations}
        endpoints={endpoints}
        onOpenSettings={onOpenSettings}
        onAutoCreate={(title) => create(title, 'image')}
        onTitleUpdate={updateTitle}
      />
    </>
  );
}
