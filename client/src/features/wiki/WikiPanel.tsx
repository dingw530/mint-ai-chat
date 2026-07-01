import { useState, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { readWiki } from '@/services/api';
import MarkdownRenderer from '@/shared/components/MarkdownRenderer';

type WikiFrontmatter = {
  title?: string;
  tags?: string[];
  created?: string;
  source?: string;
};

type WikiDocument = {
  title: string;
  fileName: string;
  fileDir: string;
  fileExt: string;
  frontmatter: WikiFrontmatter;
  body: string;
};

function isExternalWikiLink(href: string): boolean {
  return /^(https?:|mailto:|tel:|\/\/)/i.test(href);
}

function resolveWikiLinkPath(currentPath: string, href: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith('#')) return null;
  if (isExternalWikiLink(trimmedHref)) return null;

  const [pathPart] = trimmedHref.split(/[?#]/, 1);
  // URL-decode the path: AI-generated links may contain percent-encoded Chinese characters
  // (e.g., %E5%AE%9E for 实), which are already encoded once in the markdown href.
  // Without decoding here, buildUrlFromManifest's encodeURIComponent would double-encode them,
  // resulting in a filesystem path mismatch.  decodeURIComponent is a no-op for ASCII-only paths.
  let decodedPart = pathPart.replace(/\\/g, '/');
  try { decodedPart = decodeURIComponent(decodedPart); } catch { /* use raw path on malformed input */ }
  const normalizedHref = decodedPart;
  const currentDirParts = currentPath.split('/').slice(0, -1).filter(Boolean);
  let parts: string[];

  if (normalizedHref.startsWith('/')) {
    const rootRelative = normalizedHref.slice(1);
    if (rootRelative.startsWith('_')) {
      parts = rootRelative.split('/');
    } else if (rootRelative.startsWith('pages/') || rootRelative.startsWith('sources/')) {
      parts = rootRelative.split('/');
    } else {
      parts = ['pages', ...rootRelative.split('/')];
    }
  } else if (normalizedHref.startsWith('pages/') || normalizedHref.startsWith('sources/')) {
    parts = normalizedHref.split('/');
  } else {
    parts = [...currentDirParts, ...normalizedHref.split('/')];
  }

  const resolvedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolvedParts.pop();
      continue;
    }
    resolvedParts.push(part);
  }

  let resolvedPath = resolvedParts.join('/');
  if (!resolvedPath) return null;

  const lastSegment = resolvedParts[resolvedParts.length - 1] || '';
  if (!/\.[^.\/]+$/.test(lastSegment)) {
    resolvedPath += '.md';
  }

  return resolvedPath;
}

function parseWikiDocument(filePath: string, content: string): WikiDocument {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter: WikiFrontmatter = {};
  let body = content;

  if (match) {
    const rawFrontmatter = match[1];
    body = content.slice(match[0].length);

    for (const line of rawFrontmatter.split('\n')) {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      if (!key) continue;

      if (key === 'tags' && rawValue.startsWith('[') && rawValue.endsWith(']')) {
        frontmatter.tags = rawValue
          .slice(1, -1)
          .split(',')
          .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        continue;
      }

      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (key === 'title') frontmatter.title = value;
      if (key === 'created') frontmatter.created = value;
      if (key === 'source') frontmatter.source = value;
    }
  }

  const fileName = filePath.split('/').pop() || filePath;
  const fileDir = filePath.split('/').slice(0, -1).join('/');
  const fileExt = fileName.split('.').pop()?.toLowerCase() || 'md';

  return {
    title: frontmatter.title?.trim() || fileName,
    fileName,
    fileDir,
    fileExt,
    frontmatter,
    body,
  };
}

interface WikiPanelProps {
  filePath: string | null;
  onAskQuestion?: (question: string) => void;
  onBack?: () => void;
  onFileSelect?: (path: string) => void;
}

export default function WikiPanel({ filePath, onAskQuestion, onBack, onFileSelect }: WikiPanelProps) {
  const unsupportedExts = new Set(['pdf', 'html', 'htm']);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const document = filePath && content !== null ? parseWikiDocument(filePath, content) : null;
  const hasFrontmatterMeta = Boolean(
    document?.frontmatter.created || document?.frontmatter.source || document?.frontmatter.tags?.length,
  );

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setContent(null);
    setError(null);
    readWiki(filePath)
      .then((data) => setContent(data.content))
      .catch((err) => setError((err as Error).message || '加载失败'))
      .finally(() => setLoading(false));
  }, [filePath]);

  useEffect(() => {
    if (!filePath && inputRef.current) {
      inputRef.current.focus();
    }
  }, [filePath]);

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || !onAskQuestion) return;
    onAskQuestion(trimmed);
    setQuery('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleWikiLinkClick = (href: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (!filePath) return;
    const nextPath = resolveWikiLinkPath(filePath, href);
    if (!nextPath) return;

    event.preventDefault();
    onFileSelect?.(nextPath);
  };

  return (
    <div className="wiki-content-area">
      <div className="wiki-content-header">
        {filePath ? (
          <div className="wiki-content-breadcrumb">
            <span className="wiki-content-breadcrumb-link" onClick={onBack}>知识库</span>
            {document?.fileDir && (
              <>
                <span className="wiki-content-breadcrumb-sep">/</span>
                <span>{document.fileDir}</span>
              </>
            )}
            <span className="wiki-content-breadcrumb-sep">/</span>
            <span className="wiki-content-breadcrumb-current">{document?.fileName || ''}</span>
          </div>
        ) : (
          <span className="wiki-content-title">知识库</span>
        )}
      </div>
      <div className="wiki-content-scroll">
      {loading && (
        <div className="skeleton-wiki-content">
          <div className="skeleton skeleton-title-block" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
        </div>
      )}
      {error && <div className="wiki-error">{error}</div>}
      {!filePath && !loading && (
        <div className="wiki-welcome">
          <div className="wiki-welcome-glyph">
            <div className="wiki-welcome-glyph-bg" />
            <div className="wiki-welcome-glyph-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
                <path d="M12 6v7" />
                <path d="M9 9l3-3 3 3" />
              </svg>
            </div>
          </div>
          <h2>知识库</h2>
          <p>选择文件查看内容，或上传新文件</p>
          <div className="wiki-search-container">
            <div className="wiki-search-box">
              <div className="wiki-search-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                className="wiki-search-input"
                placeholder="基于知识库提问..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="wiki-search-btn"
                onClick={handleSubmit}
                disabled={!query.trim()}
                aria-label="提问"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="wiki-search-hints">
              <span className="wiki-search-hint">
                <kbd>Enter</kbd> 发送
              </span>
            </div>
          </div>
        </div>
      )}
      {!loading && !error && content !== null && (() => {
        if (document && unsupportedExts.has(document.fileExt)) {
          return (
            <div className="wiki-unsupported">
              <div className="wiki-unsupported-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              </div>
              <p className="wiki-unsupported-text">暂不支持预览</p>
              <p className="wiki-unsupported-hint">该文件格式 ({document.fileExt.toUpperCase()}) 当前暂不支持在线预览</p>
            </div>
          );
        }
        return (
          <div className="wiki-document-shell">
            <div className="wiki-document-hero">
              <div className="wiki-document-hero-main">
                <div className="wiki-document-kicker">知识库文档</div>
                <h1 className="wiki-document-title">{document?.title || document?.fileName || ''}</h1>
                <div className="wiki-document-path">
                  {document?.fileDir ? document.fileDir : '根目录'}
                </div>
                {hasFrontmatterMeta && document && (
                  <div className="wiki-document-meta">
                    {document.frontmatter.created && (
                      <span className="wiki-document-meta-item">
                        <span className="wiki-document-meta-label">创建</span>
                        <span>{document.frontmatter.created}</span>
                      </span>
                    )}
                    {document.frontmatter.source && (
                      <span className="wiki-document-meta-item">
                        <span className="wiki-document-meta-label">来源</span>
                        <span>{document.frontmatter.source}</span>
                      </span>
                    )}
                    {document.frontmatter.tags?.length ? (
                      <span className="wiki-document-meta-tags">
                        {document.frontmatter.tags.map((tag) => (
                          <span key={tag} className="wiki-document-tag">{tag}</span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <span className="wiki-document-badge">{document?.fileExt.toUpperCase() || 'MD'}</span>
            </div>
            <div className="wiki-document-body">
              <MarkdownRenderer
                content={document ? document.body : (content || '')}
                onLinkClick={handleWikiLinkClick}
              />
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
