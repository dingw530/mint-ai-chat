import { useOutletContext } from 'react-router-dom';
import SidebarHeader from '@/shared/components/SidebarHeader';
import AgentsPanel from '@/features/settings/components/AgentsPanel';

type AppContext = { onOpenSettings: () => void };

/**
 * Provides a first-class destination for configuring reusable assistants.
 * @returns Assistant configuration page
 */
export default function AssistantPage() {
  const { onOpenSettings } = useOutletContext<AppContext>();

  return (
    <>
      <aside className="sidebar sidebar--assistant">
        <SidebarHeader onOpenSettings={onOpenSettings} />
        <div className="assistant-sidebar-note">
          <span className="assistant-sidebar-kicker">能力配置</span>
          <strong>助手</strong>
          <p>创建适合不同任务的专用助手，在对话中按需调用。</p>
        </div>
      </aside>
      <main className="assistant-page">
        <header className="assistant-page-header">
          <div>
            <span className="assistant-page-kicker">PERSONAL ASSISTANTS</span>
            <h1>配置你的专用助手</h1>
            <p>为不同任务设置指令和工具，在对话中按需使用。</p>
          </div>
        </header>
        <section className="assistant-page-content" aria-label="助手列表">
          <AgentsPanel />
        </section>
      </main>
    </>
  );
}
