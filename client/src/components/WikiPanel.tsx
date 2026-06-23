import { useState, useEffect } from 'react';
import { readWiki } from '../services/api';

interface WikiPanelProps {
  filePath: string | null;
}

export default function WikiPanel({ filePath }: WikiPanelProps) {
  const fileName = filePath?.split('/').pop() || '';
  const fileDir = filePath?.split('/').slice(0, -1).join('/') || '';
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    readWiki(filePath)
      .then((data) => setContent(data.content))
      .catch((err) => setError((err as Error).message || '加载失败'))
      .finally(() => setLoading(false));
  }, [filePath]);

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
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
    <div className="wiki-content-area">
      <div className="wiki-content-header">
        {filePath ? (
          <div className="wiki-content-breadcrumb">
            <span>{fileDir || '知识库'}</span>
            <span className="wiki-content-breadcrumb-sep">/</span>
            <span className="wiki-content-breadcrumb-current">{fileName}</span>
          </div>
        ) : (
          <span className="wiki-content-title">知识库</span>
        )}
      </div>
      <div className="wiki-content-scroll">
      {loading && <div className="wiki-loading">加载中...</div>}
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
        </div>
      )}
      {!loading && !error && content && (() => {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const unsupportedExts = ['pdf', 'html', 'htm'];
        if (unsupportedExts.includes(ext)) {
          return (
            <div className="wiki-unsupported">
              <div className="wiki-unsupported-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              </div>
              <p className="wiki-unsupported-text">暂不支持预览</p>
              <p className="wiki-unsupported-hint">该文件格式 ({ext.toUpperCase()}) 当前暂不支持在线预览</p>
            </div>
          );
        }
        return <div className="wiki-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
      })()}
      </div>
    </div>
  );
}
