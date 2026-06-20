import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import AppIcon from '@/shared/components/AppIcon';
import ConfirmDialog from './ConfirmDialog';
import { listWiki, uploadWiki, getJobStatus } from '../services/api';
import type { Conversation, WikiFileTreeNode, UploadJob } from '@/types';

// ── Icons ──

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
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

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.08a2 2 0 011 1.72v.5a2 2 0 01-1 1.74l-.15.08a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.72v-.5a2 2 0 011-1.74l.15-.08a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 2a1 1 0 00-1 1v1H5a1 1 0 000 2h14a1 1 0 100-2h-4V3a1 1 0 00-1-1h-4zm-3 6a1 1 0 00-1 1v10a2 2 0 002 2h8a2 2 0 002-2V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H14V9a1 1 0 10-2 0v10h-.5V9a1 1 0 10-2 0v10H8V9a1 1 0 00-1-1z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.232 3.41a2.5 2.5 0 113.536 3.536L7.09 18.624a2.5 2.5 0 01-1.11.66l-3.064.766a.5.5 0 01-.612-.612l.766-3.064a2.5 2.5 0 01.66-1.11L15.232 3.41z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z" />
    </svg>
  );
}

function Spinner() {
  return <span className="wiki-spinner" />;
}

function CheckIcon() {
  return <span className="wiki-check-icon">✓</span>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Props ──

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  loading: boolean;
  activeView: string;
  onViewChange: (view: string) => void;
  onOpenSettings?: () => void;
  onWikiFileSelect?: (path: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onClearAll,
  loading,
  activeView,
  onViewChange,
  onOpenSettings,
  onWikiFileSelect,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    variant: 'danger' | 'accent';
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // ── Wiki state ──
  const [wikiTree, setWikiTree] = useState<WikiFileTreeNode[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const [wikiExpandedDirs, setWikiExpandedDirs] = useState<Set<string>>(new Set());
  const [wikiSelectedFile, setWikiSelectedFile] = useState<string | null>(null);
  const [wikiDragOver, setWikiDragOver] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showConfirm = useCallback((opts: {
    variant: 'danger' | 'accent';
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }) => {
    setConfirmDialog(opts);
  }, []);

  // ── Wiki tree loading ──

  const loadWikiTree = useCallback(async () => {
    setWikiLoading(true);
    setWikiError(null);
    try {
      const data = await listWiki();
      setWikiTree(data.tree);
    } catch (err) {
      setWikiError('无法加载 Wiki 目录');
      console.error(err);
    } finally {
      setWikiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'wiki') loadWikiTree();
  }, [activeView, loadWikiTree]);

  useEffect(() => {
    return () => {
      pollingRefs.current.forEach((interval) => clearInterval(interval));
      pollingRefs.current.clear();
    };
  }, []);

  // ── Wiki tree interaction ──

  const toggleWikiDir = (dirPath: string) => {
    setWikiExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  // Expose selected file to parent for WikiPanel
  const onWikiFileSelectRef = useRef<((path: string) => void) | null>(null);
  onWikiFileSelectRef.current = onWikiFileSelect ?? null;

  const selectWikiFile = (filePath: string) => {
    setWikiSelectedFile(filePath);
    if (onWikiFileSelectRef.current) onWikiFileSelectRef.current(filePath);
  };

  // ── Wiki upload ──

  const startPolling = useCallback((job: UploadJob) => {
    const { id } = job;
    const existing = pollingRefs.current.get(id);
    if (existing) clearInterval(existing);

    const interval = setInterval(async () => {
      try {
        const updated = await getJobStatus(id);
        setUploadJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
        if (updated.status === 'done' || updated.status === 'error') {
          clearInterval(interval);
          pollingRefs.current.delete(id);
          if (updated.status === 'done') loadWikiTree();
        }
      } catch {
        clearInterval(interval);
        pollingRefs.current.delete(id);
      }
    }, 1500);
    pollingRefs.current.set(id, interval);
  }, [loadWikiTree]);

  const handleFileUpload = async (file: File) => {
    const validTypes = ['.html', '.htm', '.txt', '.md', '.pdf'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      setUploadJobs((prev) => [...prev, {
        id: '', status: 'error' as const, fileName: file.name, fileSize: file.size,
        progress: 0, step: '不支持的类型', createdAt: '', updatedAt: '',
        error: '支持: HTML/TXT/MD/PDF',
      }]);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadJobs((prev) => [...prev, {
        id: '', status: 'error' as const, fileName: file.name, fileSize: file.size,
        progress: 0, step: '文件过大', createdAt: '', updatedAt: '',
        error: '超过 10MB 限制',
      }]);
      return;
    }
    try {
      const jobId = await uploadWiki(file);
      const now = new Date().toISOString();
      setUploadJobs((prev) => [...prev, {
        id: jobId, status: 'pending', fileName: file.name, fileSize: file.size,
        progress: 0, step: '等待处理', createdAt: now, updatedAt: now,
      }]);
      startPolling({ id: jobId, status: 'pending', fileName: file.name, fileSize: file.size, progress: 0, step: '等待处理', createdAt: now, updatedAt: now });
    } catch (err) {
      setUploadJobs((prev) => [...prev, {
        id: '', status: 'error' as const, fileName: file.name, fileSize: file.size,
        progress: 0, step: '上传失败', createdAt: '', updatedAt: '',
        error: (err as Error).message || '上传失败',
      }]);
    }
  };

  const handleWikiDragOver = (e: React.DragEvent) => { e.preventDefault(); setWikiDragOver(true); };
  const handleWikiDragLeave = () => setWikiDragOver(false);
  const handleWikiDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setWikiDragOver(false);
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  const handleWikiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearCompletedJobs = () => {
    setUploadJobs((prev) => prev.filter((j) => j.status === 'pending' || j.status === 'parsing' || j.status === 'compiling'));
  };

  // ── Chat handlers ──

  const handleCreate = () => onCreate();

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const submitRename = () => {
    const title = editTitle.trim();
    if (title) onRename(editingId!, title);
    setEditingId(null);
    setEditTitle('');
  };

  const handleRenameKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submitRename();
    else if (e.key === 'Escape') { setEditingId(null); setEditTitle(''); }
  };

  // ── Render helpers ──

  const renderUploadJobItem = (job: UploadJob) => {
    const isError = job.status === 'error';
    const isDone = job.status === 'done';
    const isActive = job.status === 'parsing' || job.status === 'compiling';
    return (
      <div key={job.id || job.fileName + Math.random()} className={`wiki-job-item ${isError ? 'error' : ''} ${isDone ? 'done' : ''}`}>
        <div className="wiki-job-header">
          <span className="wiki-job-name">{job.fileName}</span>
          <span className="wiki-job-size">{formatFileSize(job.fileSize)}</span>
        </div>
        <div className="wiki-job-progress-bar">
          <div className={`wiki-job-progress-fill ${isError ? 'error' : ''}`} style={{ width: `${job.progress}%` }} />
        </div>
        <div className="wiki-job-status-row">
          {isDone && <CheckIcon />}
          {isActive && <Spinner />}
          {isError && <span className="wiki-job-error-icon">!</span>}
          <span className={`wiki-job-status-text ${isError ? 'error' : ''}`}>
            {isDone ? '已完成' : isError ? (job.error || '失败') : job.step}
          </span>
        </div>
      </div>
    );
  };

  const renderWikiTreeNode = (node: WikiFileTreeNode, depth: number = 0) => {
    const isExpanded = wikiExpandedDirs.has(node.path);
    const isSelected = wikiSelectedFile === node.path;
    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div className="wiki-tree-node wiki-tree-dir" style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => toggleWikiDir(node.path)}>
            <span className={`wiki-tree-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
            <FolderIcon />
            <span className="wiki-tree-name">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child) => renderWikiTreeNode(child, depth + 1))}
        </div>
      );
    }
    return (
      <div key={node.path} className={`wiki-tree-node wiki-tree-file${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${28 + depth * 16}px` }} onClick={() => selectWikiFile(node.path)}>
        <FileIcon />
        <span className="wiki-tree-name">{node.name}</span>
      </div>
    );
  };

  const isWikiUploading = uploadJobs.some((j) => j.status === 'parsing' || j.status === 'compiling');

  return (
    <aside className={`sidebar sidebar--${activeView}`}>
      {/* ── Brand & Module Switcher ── */}
      <div className="sidebar-header">
        {window.electronAPI?.isElectron && window.electronAPI?.platform === 'darwin' && (
          <div className="titlebar-spacer" />
        )}
        <div className="sidebar-brand">
          <AppIcon size={28} />
          <div className="sidebar-brand-name">Mint</div>
          <button className="sidebar-header-settings" onClick={() => onOpenSettings?.()} title="设置">
            <SettingsIcon />
          </button>
        </div>
        <div className="module-switcher">
          <button
            className={`module-btn${activeView === 'chat' ? ' active' : ''}`}
            onClick={() => onViewChange('chat')}
            title="对话"
          >
            <ChatIcon />
          </button>
          <button
            className={`module-btn${activeView === 'image' ? ' active' : ''}`}
            onClick={() => onViewChange('image')}
            title="生图"
          >
            <ImageIcon />
          </button>
          <button
            className={`module-btn${activeView === 'wiki' ? ' active' : ''}`}
            onClick={() => onViewChange('wiki')}
            title="知识库"
          >
            <WikiIcon />
          </button>
        </div>
      </div>

      {/* ── Module Content ── */}
      {activeView === 'wiki' ? (
        /* ══════ WIKI MODE ══════ */
        <div className="sidebar-wiki-content">
          <div className="wiki-tree-header-bar">
            <span className="wiki-tree-header-label">文件</span>
            <div className="wiki-tree-header-actions">
              <input type="file" ref={fileInputRef} onChange={handleWikiFileSelect} accept=".html,.htm,.txt,.md,.pdf" style={{ display: 'none' }} />
              <button className="wiki-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={isWikiUploading}>+</button>
              <button className="wiki-tree-refresh" onClick={loadWikiTree}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" /></svg>
              </button>
            </div>
          </div>
          <div className="wiki-tree-scroll"
            onDragOver={handleWikiDragOver} onDragLeave={handleWikiDragLeave} onDrop={handleWikiDrop}
          >
            {wikiLoading && <div className="wiki-loading">加载中...</div>}
            {wikiError && <div className="wiki-error">{wikiError}</div>}
            {!wikiLoading && !wikiError && wikiTree.length === 0 && (
              <div className="wiki-empty">暂无文件</div>
            )}
            {!wikiLoading && !wikiError && wikiTree.map((node) => renderWikiTreeNode(node))}
            {wikiDragOver && <div className="wiki-drop-hint">释放以上传</div>}
          </div>
          {uploadJobs.length > 0 && (
            <div className="wiki-upload-section">
              <div className="wiki-upload-section-header">
                <span>上传（{uploadJobs.length}）</span>
                {uploadJobs.some((j) => j.status === 'done' || j.status === 'error') && (
                  <button className="wiki-upload-clear-btn" onClick={clearCompletedJobs}>清除</button>
                )}
              </div>
              <div className="wiki-upload-list">
                {uploadJobs.map(renderUploadJobItem)}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ══════ CHAT MODE ══════ */
        <div className="sidebar-chat-content">
          <div className="sidebar-actions">
            <button className="new-chat-btn" onClick={handleCreate} disabled={loading}>
              <PlusIcon />
              新建对话
            </button>
          </div>
          <div className="conversation-list">
            {conversations.length === 0 && (
              <div className="empty-state">
                {loading ? 'Loading...' : '暂无对话，点击上方按钮新建'}
              </div>
            )}
            {conversations.map((conv) => (
              <div key={conv.id} className={`conversation-item${conv.id === activeId ? ' active' : ''}`}
                onClick={() => onSelect(conv.id)}>
                {editingId === conv.id ? (
                  <input className="title-input" value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={submitRename} onKeyDown={handleRenameKeyDown} autoFocus
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <>
                    <div className="conv-icon"><ChatIcon /></div>
                    <span className="title">{conv.title}</span>
                    <span className="actions">
                      <button title="重命名" onClick={(e) => { e.stopPropagation(); startRename(conv); }}><EditIcon /></button>
                      <button title="删除" onClick={(e) => {
                        e.stopPropagation();
                        showConfirm({ variant: 'danger', title: '删除对话', message: `确定要删除"${conv.title}"吗？`, confirmLabel: '删除', onConfirm: () => onDelete(conv.id) });
                      }}><TrashIcon /></button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        {activeView === 'chat' && conversations.length > 0 && (
          <button className="sidebar-clear-btn" onClick={() => {
            showConfirm({ variant: 'danger', title: '清空全部对话', message: '确定要清空所有对话记录吗？', confirmLabel: '清空全部', onConfirm: onClearAll });
          }}>
            <TrashIcon />
            清空全部
          </button>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog open={!!confirmDialog} title={confirmDialog.title} message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel} variant={confirmDialog.variant}
          onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          onCancel={() => setConfirmDialog(null)} />
      )}
    </aside>
  );
}
