import { NavLink } from 'react-router-dom';
import AppIcon from './AppIcon';

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function AssistantIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a4 4 0 0 0-4 4v1H6a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3h-2V7a4 4 0 0 0-4-4Z" />
      <path d="M8 13h.01M16 13h.01M9 16c1.7 1 4.3 1 6 0" />
    </svg>
  );
}

function WikiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
      <path d="M12 6v7" />
      <path d="M9 9l3-3 3 3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.08a2 2 0 011 1.72v.5a2 2 0 01-1 1.74l-.15.08a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.72v-.5a2 2 0 011-1.74l.15-.08a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}


interface SidebarHeaderProps {
  onOpenSettings: () => void;
}

export default function SidebarHeader({ onOpenSettings }: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      {window.electronAPI?.isElectron && window.electronAPI?.platform === 'darwin' && (
        <div className="titlebar-spacer" />
      )}
      <div className="sidebar-brand">
        <AppIcon size={28} />
        <div className="sidebar-brand-name">Mint</div>
        <button className="sidebar-header-settings" onClick={onOpenSettings} title="设置">
          <SettingsIcon />
        </button>
      </div>
      <div className="module-switcher">
        <NavLink
          to="/chat"
          className={({ isActive }) => `module-btn${isActive ? ' active' : ''}`}
          title="对话"
        >
          <ChatIcon />
        </NavLink>
        <NavLink
          to="/agents"
          className={({ isActive }) => `module-btn${isActive ? ' active' : ''}`}
          title="助手"
        >
          <AssistantIcon />
        </NavLink>
        <NavLink
          to="/wiki"
          className={({ isActive }) => `module-btn${isActive ? ' active' : ''}`}
          title="知识库"
        >
          <WikiIcon />
        </NavLink>
      </div>
    </div>
  );
}
