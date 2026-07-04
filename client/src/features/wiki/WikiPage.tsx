import { useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import SidebarHeader from '@/shared/components/SidebarHeader';
import WikiSidebar from './WikiSidebar';
import WikiPanel from './WikiPanel';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { createConversation } from '@/services/api';

type AppContext = { onOpenSettings: () => void };
type ViewMode = 'file' | 'graph';

export default function WikiPage() {
  const { onOpenSettings } = useOutletContext<AppContext>();
  const { width: sidebarWidth, onMouseDown: onResizeMouseDown } = useSidebarResize();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('file');
  const navigate = useNavigate();

  const handleAskQuestion = useCallback(async (question: string) => {
    try {
      const { conversation } = await createConversation('New Conversation');
      navigate('/chat?ask=' + encodeURIComponent(question) + '&cid=' + conversation.id);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }, [navigate]);

  const handleFileSelect = useCallback((path: string | null) => {
    setSelectedFile(path);
    if (path) setViewMode('file');
  }, []);

  return (
    <>
      <aside className="sidebar sidebar--wiki" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <SidebarHeader onOpenSettings={onOpenSettings} />
        <WikiSidebar selectedFile={selectedFile} onFileSelect={handleFileSelect} viewMode={viewMode} onViewModeChange={setViewMode} />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
      </aside>
      <WikiPanel
        filePath={selectedFile}
        viewMode={viewMode}
        onAskQuestion={handleAskQuestion}
        onBack={() => setSelectedFile(null)}
        onFileSelect={handleFileSelect}
      />
    </>
  );
}
