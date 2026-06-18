import { useState, useEffect } from 'react';
import { listWiki, readWiki } from '../services/api';
import type { WikiFileTreeNode } from '@/types';

interface WikiPanelProps {
  onClose: () => void;
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function WikiPanel({ onClose }: WikiPanelProps) {
  const [tree, setTree] = useState<WikiFileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    loadTree();
  }, []);

  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWiki();
      setTree(data.tree);
    } catch (err) {
      setError('无法加载 Wiki 目录，请检查配置');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const selectFile = async (filePath: string) => {
    setSelectedFile(filePath);
    setContentLoading(true);
    try {
      const data = await readWiki(filePath);
      setFileContent(data.content);
    } catch (err) {
      setFileContent('**加载失败：' + ((err as Error).message || '未知错误') + '**');
    } finally {
      setContentLoading(false);
    }
  };

  const renderTreeNode = (node: WikiFileTreeNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedFile === node.path;

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div
            className="wiki-tree-node wiki-tree-dir"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => toggleDir(node.path)}
          >
            <span className={`wiki-tree-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
            <FolderIcon />
            <span className="wiki-tree-name">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child: WikiFileTreeNode) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`wiki-tree-node wiki-tree-file${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${28 + depth * 16}px` }}
        onClick={() => selectFile(node.path)}
      >
        <FileIcon />
        <span className="wiki-tree-name">{node.name}</span>
      </div>
    );
  };

  // 简单的 Markdown 渲染（支持标题、粗体、列表、代码块、链接）
  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    const html = lines.map((line) => {
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      if (line.startsWith('> ')) return `<blockquote>${line.slice(2)}</blockquote>`;
      if (line.startsWith('```')) return '<hr/>';
      if (line === '') return '<br/>';
      return `<p>${line}</p>`;
    }).join('\n');
    return html;
  };

  return (
    <div className="wiki-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wiki-panel">
        <div className="wiki-panel-header">
          <h2>Wiki 知识库</h2>
          <button className="wiki-panel-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="wiki-panel-body">
          <div className="wiki-tree-panel">
            <div className="wiki-tree-header">目录</div>
            <div className="wiki-tree-content">
              {loading && <div className="wiki-loading">加载中...</div>}
              {error && <div className="wiki-error">{error}</div>}
              {!loading && !error && tree.length === 0 && (
                <div className="wiki-empty">Wiki 知识库为空，请先通过 Agent 写入内容</div>
              )}
              {!loading && !error && tree.map((node) => renderTreeNode(node))}
            </div>
          </div>
          <div className="wiki-content-panel">
            {contentLoading && <div className="wiki-loading">加载中...</div>}
            {!contentLoading && !selectedFile && (
              <div className="wiki-content-placeholder">选择一个文件查看内容</div>
            )}
            {!contentLoading && selectedFile && fileContent !== null && (
              <div
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
