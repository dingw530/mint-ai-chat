import { useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import SidebarHeader from '@/shared/components/SidebarHeader';
import WikiSidebar from './WikiSidebar';
import WikiPanel from './WikiPanel';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { createConversation } from '@/services/api';

type AppContext = { onOpenSettings: () => void };

export default function WikiPage() {
  const { onOpenSettings } = useOutletContext<AppContext>();
  const { width: sidebarWidth, onMouseDown: onResizeMouseDown } = useSidebarResize();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAskQuestion = useCallback(async (question: string) => {
    try {
      const { conversation } = await createConversation('New Conversation');
      navigate('/chat?ask=' + encodeURIComponent(question) + '&cid=' + conversation.id);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }, [navigate]);

  return (
    <>
      <aside className="sidebar sidebar--wiki" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <SidebarHeader onOpenSettings={onOpenSettings} />
        <WikiSidebar selectedFile={selectedFile} onFileSelect={setSelectedFile} />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
      </aside>
      <WikiPanel
        filePath={selectedFile}
        onAskQuestion={handleAskQuestion}
        onBack={() => setSelectedFile(null)}
        onFileSelect={setSelectedFile}
      />
    </>
  );
}
