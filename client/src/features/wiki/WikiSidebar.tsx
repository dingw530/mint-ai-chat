import { useState, useEffect, useRef, useCallback } from 'react';
import { listWiki, uploadWiki, getWikiJob, listWikiJobs } from '@/services/api';
import type { WikiFileTreeNode, UploadJob } from '@/types';

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function Spinner() {
  return <span className="wiki-spinner" />;
}

function CheckIcon() {
  return <span className="wiki-check-icon">✓</span>;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

interface WikiSidebarProps {
  selectedFile: string | null;
  onFileSelect: (path: string | null) => void;
  viewMode: 'file' | 'graph';
  onViewModeChange: (mode: 'file' | 'graph') => void;
}

export default function WikiSidebar({
  selectedFile,
  onFileSelect,
  viewMode,
  onViewModeChange,
}: WikiSidebarProps) {
  const [wikiTree, setWikiTree] = useState<WikiFileTreeNode[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const [wikiExpandedDirs, setWikiExpandedDirs] = useState<Set<string>>(new Set());
  const [wikiDragOver, setWikiDragOver] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    loadWikiTree();
  }, [loadWikiTree]);

  const loadJobs = useCallback(async () => {
    try {
      const data = await listWikiJobs(undefined, 100);
      setUploadJobs(data.jobs);
    } catch (err) {
      console.error('无法加载 Wiki 摄入任务', err);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    return () => {
      pollingRefs.current.forEach((interval) => clearInterval(interval));
      pollingRefs.current.clear();
    };
  }, []);

  const toggleWikiDir = (dirPath: string) => {
    setWikiExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const selectWikiFile = (filePath: string) => {
    onFileSelect(filePath);
  };

  const startPolling = useCallback(
    (job: UploadJob) => {
      const { id } = job;
      const existing = pollingRefs.current.get(id);
      if (existing) clearInterval(existing);

      const interval = setInterval(async () => {
        try {
          const updated = await getWikiJob(id);
          setUploadJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
          if (updated.isTerminal) {
            clearInterval(interval);
            pollingRefs.current.delete(id);
            if (updated.isSuccessful) loadWikiTree();
          }
        } catch {
          clearInterval(interval);
          pollingRefs.current.delete(id);
        }
      }, 1500);
      pollingRefs.current.set(id, interval);
    },
    [loadWikiTree],
  );

  useEffect(() => {
    uploadJobs
      .filter((job) => !job.isTerminal)
      .forEach(startPolling);
  }, [uploadJobs, startPolling]);

  const uploadSingleFile = async (file: File) => {
    const validTypes = ['.html', '.htm', '.txt', '.md', '.pdf'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      setUploadJobs((prev) => [
        ...prev,
        {
          id: '',
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          step: '不支持的类型',
          createdAt: '',
          updatedAt: '',
          error: '支持: HTML/TXT/MD/PDF',
          statusLabel: '上传失败',
          phase: 'error',
          isTerminal: true,
          isSuccessful: false,
        },
      ]);
      return;
    }
    try {
      const jobId = await uploadWiki(file);
      const job = await getWikiJob(jobId);
      setUploadJobs((prev) => [...prev, job]);
      startPolling(job);
    } catch (err) {
      setUploadJobs((prev) => [
        ...prev,
        {
          id: '',
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          step: '上传失败',
          createdAt: '',
          updatedAt: '',
          error: (err as Error).message || '上传失败',
          statusLabel: '上传失败',
          phase: 'error',
          isTerminal: true,
          isSuccessful: false,
        },
      ]);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      uploadSingleFile(files[i]);
    }
  };

  const handleWikiDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setWikiDragOver(true);
  };
  const handleWikiDragLeave = () => setWikiDragOver(false);
  const handleWikiDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setWikiDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  };

  const handleWikiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearCompletedJobs = () => {
    setUploadJobs((prev) =>
        prev.filter(
        (j) => !j.isTerminal,
      ),
    );
  };

  const isWikiUploading = uploadJobs.some(
    (j) => !j.isTerminal,
  );

  const renderUploadJobItem = (job: UploadJob) => {
    const isError = job.phase === 'error';
    const isDone = job.phase === 'success';
    const isActive = !job.isTerminal;
    return (
      <div
        key={job.id || job.fileName + Math.random()}
        className={`wiki-job-item ${isError ? 'error' : ''} ${isDone ? 'done' : ''}`}
      >
        <div className="wiki-job-header">
          <span className="wiki-job-name">{job.fileName}</span>
          <span className="wiki-job-size">{formatFileSize(job.fileSize)}</span>
        </div>
        <div className="wiki-job-progress-bar">
          <div
            className={`wiki-job-progress-fill ${isError ? 'error' : ''}`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <div className="wiki-job-status-row">
          {isDone && <CheckIcon />}
          {isActive && <Spinner />}
          {isError && <span className="wiki-job-error-icon">!</span>}
          <span className={`wiki-job-status-text ${isError ? 'error' : ''}`}>
            {isDone ? job.statusLabel : isError ? job.error || job.statusLabel : job.statusLabel || job.step}
          </span>
        </div>
      </div>
    );
  };

  const renderWikiTreeNode = (node: WikiFileTreeNode, depth: number = 0) => {
    const isExpanded = wikiExpandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;
    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div
            className="wiki-tree-node wiki-tree-dir"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => toggleWikiDir(node.path)}
          >
            <span className={`wiki-tree-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
            <FolderIcon />
            <span className="wiki-tree-name">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child) => renderWikiTreeNode(child, depth + 1))}
        </div>
      );
    }
    return (
      <div
        key={node.path}
        className={`wiki-tree-node wiki-tree-file${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${28 + depth * 16}px` }}
        onClick={() => selectWikiFile(node.path)}
      >
        <FileIcon />
        <span className="wiki-tree-name">{node.name}</span>
      </div>
    );
  };

  return (
    <div className="sidebar-wiki-content">
      <div className="wiki-mode-row">
        <div className="wiki-mode-toggle">
          <button
            className={`wiki-mode-btn ${viewMode === 'file' ? 'active' : ''}`}
            onClick={() => onViewModeChange('file')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="14"
              height="14"
            >
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            文档
          </button>
          <span className="wiki-mode-sep" />
          <button
            className={`wiki-mode-btn ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => onViewModeChange('graph')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="14"
              height="14"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="5" cy="5" r="2" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
              <line x1="9" y1="9" x2="7" y2="7" />
              <line x1="15" y1="9" x2="17" y2="7" />
              <line x1="9" y1="15" x2="7" y2="17" />
              <line x1="15" y1="15" x2="17" y2="17" />
            </svg>
            图谱
          </button>
        </div>
      </div>
      <div className="wiki-tree-header-bar">
        <span className="wiki-tree-header-label">文件</span>
        <div className="wiki-tree-header-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleWikiFileSelect}
            accept=".html,.htm,.txt,.md,.pdf"
            multiple
            style={{ display: 'none' }}
          />
          <button
            className="wiki-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isWikiUploading}
          >
            +
          </button>
          <button className="wiki-tree-refresh" onClick={loadWikiTree}>
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="wiki-tree-scroll"
        onDragOver={handleWikiDragOver}
        onDragLeave={handleWikiDragLeave}
        onDrop={handleWikiDrop}
      >
        {wikiLoading && (
          <div className="wiki-tree-skeleton">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="skeleton-wiki-item"
                style={{ paddingLeft: `${12 + (i % 3) * 16}px` }}
              >
                <div className="skeleton skeleton-icon" />
                <div className="skeleton skeleton-text" />
              </div>
            ))}
          </div>
        )}
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
            {uploadJobs.some((j) => j.isTerminal) && (
              <button className="wiki-upload-clear-btn" onClick={clearCompletedJobs}>
                清除
              </button>
            )}
          </div>
          <div className="wiki-upload-list">{uploadJobs.map(renderUploadJobItem)}</div>
        </div>
      )}
    </div>
  );
}
