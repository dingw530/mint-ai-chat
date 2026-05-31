import { useState } from 'react';
import AppIcon from './AppIcon';

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17H6v2.25a1.25 1.25 0 002.11.884L11.244 17h7.506A2.25 2.25 0 0021 14.75v-9.5A2.25 2.25 0 0018.75 3H5.25zm0 1.5h13.5a.75.75 0 01.75.75v9.5a.75.75 0 01-.75.75h-7.75a.75.75 0 00-.53.22L8 18.44V17.25a.75.75 0 00-.75-.75H5.25a.75.75 0 01-.75-.75v-9.5a.75.75 0 01.75-.75z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.232 3.41a2.5 2.5 0 113.536 3.536L7.09 18.624a2.5 2.5 0 01-1.11.66l-3.064.766a.5.5 0 01-.612-.612l.766-3.064a2.5 2.5 0 01.66-1.11L15.232 3.41z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2a1 1 0 00-1 1v1H5a1 1 0 000 2h14a1 1 0 100-2h-4V3a1 1 0 00-1-1h-4zm-3 6a1 1 0 00-1 1v10a2 2 0 002 2h8a2 2 0 002-2V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H14V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H8V9a1 1 0 00-1-1z" />
    </svg>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  loading,
  activeView,
  onViewChange,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const handleCreate = () => {
    onCreate();
  };

  const startRename = (conv) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const submitRename = () => {
    const title = editTitle.trim();
    if (title) {
      onRename(editingId, title);
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') {
      submitRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditTitle('');
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        {window.electronAPI?.isElectron && window.electronAPI?.platform === 'darwin' && (
          <div className="titlebar-spacer" />
        )}
        <div className="sidebar-brand">
          <AppIcon size={36} />
          <div>
            <div className="sidebar-brand-text">Mint</div>
            <div className="sidebar-brand-sub">Mint · AI Chat</div>
          </div>
        </div>
        <div className="sidebar-actions">
          <div className="view-switcher">
            <button
              className={`view-switcher-btn${activeView === 'chat' ? ' active' : ''}`}
              onClick={() => onViewChange('chat')}
            >
              <ChatIcon />
              对话
            </button>
            <button
              className={`view-switcher-btn${activeView === 'image' ? ' active' : ''}`}
              onClick={() => onViewChange('image')}
            >
              <ImageIcon />
              生图
            </button>
          </div>
          {activeView === 'chat' && (
            <button className="new-chat-btn" onClick={handleCreate} disabled={loading}>
              <PlusIcon />
              新建
            </button>
          )}
        </div>
      </div>
      <div className="conversation-list">
        {conversations.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ChatIcon />
            </div>
            {loading
              ? 'Loading...'
              : 'No conversations yet. Start a new one above.'}
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item${conv.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            {editingId === conv.id ? (
              <input
                className="title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={submitRename}
                onKeyDown={handleRenameKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="conv-icon">
                  <ChatIcon />
                </div>
                <span className="title">{conv.title}</span>
                <span className="actions">
                  <button
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(conv);
                    }}
                  >
                    <EditIcon />
                  </button>
                  <button
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete "${conv.title}"?`)) {
                        onDelete(conv.id);
                      }
                    }}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
