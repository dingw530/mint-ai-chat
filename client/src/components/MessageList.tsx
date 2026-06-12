import { useState, useEffect, RefObject } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import ReActStep from './ReActStep';
import AppIcon from './AppIcon';
import type { Message, ReActStep as ReActStepData, ContentSegment } from '../types';

async function downloadImage(src: string, filename = 'image.png') {
  if ((window as any).electronAPI?.downloadFile) {
    const result = await (window as any).electronAPI.downloadFile(src, filename);
    if (result?.success) return;
    console.warn('[ImageChat] Electron download failed, falling back to blob download:', result?.reason);
  }

  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.warn('[ImageChat] Download via blob failed, opening in new tab:', err);
    window.open(src, '_blank');
  }
}

function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="image-preview-overlay" onClick={onClose}>
      <img className="image-preview-img" src={src} alt={alt || '大图'} onClick={e => e.stopPropagation()} />
    </div>
  );
}

function ImageMessage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(false);

  if (error) {
    return (
      <div className="image-message-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span>图片已过期，可重新生成</span>
      </div>
    );
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    const ext = src.includes('.png') ? 'png' : src.includes('.jpeg') || src.includes('.jpg') ? 'jpg' : 'webp';
    await downloadImage(src, alt && alt !== '生成图片' ? `${alt}.${ext}` : `image.${ext}`);
    setDownloading(false);
  };

  return (
    <>
      <div className="image-message-wrapper">
        <img
          className="image-message-img"
          src={src}
          alt={alt || '生成图片'}
          onClick={() => setPreview(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
        <button
          className="image-download-btn"
          onClick={handleDownload}
          disabled={downloading}
          title="下载图片"
        >
          {downloading ? (
            <span className="spinner" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>
      </div>
      {preview && <ImagePreview src={src} alt={alt} onClose={() => setPreview(false)} />}
    </>
  );
}

interface ImageItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

function renderImageContent(imageData: string | Record<string, unknown> | null | undefined) {
  let images: ImageItem[];
  try {
    images = typeof imageData === 'string' ? JSON.parse(imageData) : (imageData as ImageItem[] | undefined);
  } catch {
    console.warn('[ImageChat] Failed to parse imageData:', imageData);
    return null;
  }
  if (!Array.isArray(images) || images.length === 0) {
    console.warn('[ImageChat] imageData is not an array:', images);
    return null;
  }

  return (
    <div className="image-message-container">
      {images.map((item, index) => {
        const src = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
        if (!src || (typeof src === 'string' && !src.trim())) {
          console.warn('[ImageChat] Image item has no usable src:', item);
          return null;
        }
        return (
          <div key={index} className="image-message-item">
              <ImageMessage src={src} alt={item.revised_prompt || `图片 ${index + 1}`} />
            {item.revised_prompt && (
              <details className="image-message-revised" open={images.length === 1}>
                <summary>优化后的提示词</summary>
                <p>{item.revised_prompt}</p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  streamingId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  containerRef?: RefObject<HTMLDivElement | null>;
  onRegenerate?: () => void;
  reactSteps?: ReActStepData[];
  showReactSteps?: boolean;
}

export default function MessageList({ messages, streamingId, scrollRef, containerRef, onRegenerate, reactSteps, showReactSteps = true }: MessageListProps) {
  const roleIcon: Record<string, string> = {
    user: '&#x1F338;',
    assistant: '&#x2728;',
    error: '&#x26A0;&#xFE0F;',
  };

  if (messages.length === 0) {
    return (
      <div className="messages-container" ref={containerRef}>
        <div className="welcome-screen">
          <AppIcon size={80} className="welcome" />
          <h2>Mint</h2>
          <p>Mint · 发送消息开始对话</p>
        </div>
      </div>
    );
  }

  function renderSegments(segments: ContentSegment[]) {
    return (
      <div className="content-segments">
        {segments.map((seg, i) => {
          if (seg.type === 'thinking') {
            return (
              <details key={i} className="thinking-segment" open>
                <summary>思考过程</summary>
                <div className="thinking-segment-content">{seg.content}</div>
              </details>
            );
          }
          if (seg.type === 'tool_call') {
            const statusIcon = seg.status === 'running'
              ? <span className="tool-call-cursor">●</span>
              : seg.status === 'error'
                ? <span className="tool-call-status-error">✕</span>
                : null;
            return (
              <div key={i} className={`tool-call-segment tool-call-${seg.status}`}>
                <div className="tool-call-header">
                  <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" fill="currentColor"/>
                  </svg>
                  <span className="tool-call-label">
                    {seg.status === 'done' ? '工具返回' : seg.status === 'error' ? '工具失败' : '调用工具'}: {seg.toolName}
                    {seg.status === 'done' && seg.duration != null ? ` (${(Number(seg.duration) / 1000).toFixed(1)}s)` : ''}
                    {seg.status === 'error' && seg.retryCount ? ` (重试 ${seg.retryCount} 次)` : ''}
                  </span>
                  {statusIcon}
                </div>
                {seg.status === 'error' && seg.error && (
                  <div className="tool-call-error-body">{seg.error.length > 200 ? seg.error.substring(0, 200) + '...' : seg.error}</div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <div className="messages-container" ref={containerRef}>
      {messages.map((msg) => {
        const isStreaming = msg.role === 'assistant' && msg.id === streamingId;
        const hasSegments = msg.segments && msg.segments.length > 0;
        return (
          <div
            key={msg.id || (msg as any)._tempId}
            className={`message ${msg.role}${isStreaming ? ' streaming' : ''}`}
          >
            <div className="message-label"
              dangerouslySetInnerHTML={{
                __html: `${roleIcon[msg.role] || ''} ${
                  msg.role === 'user' ? '你' : msg.role === 'error' ? '错误' : 'AI'
                }`,
              }}
            />
            {msg.role === 'assistant' && hasSegments ? (
              <>
                {renderSegments(msg.segments!)}
                {msg.content && <MarkdownRenderer content={msg.content} />}
              </>
            ) : (
              <>
                {msg.reasoning && (
                  <details className="reasoning-block" open>
                    <summary>思考过程</summary>
                    <div className="reasoning-content">{msg.reasoning}</div>
                  </details>
                )}
                {showReactSteps && msg.role === 'assistant' && reactSteps && reactSteps.length > 0 ? (
                  <div className="react-steps-container">
                    {reactSteps.map((step, i) => (
                      <ReActStep key={i} step={step} isLast={isStreaming && i === reactSteps.length - 1} />
                    ))}
                  </div>
                ) : null}
                {msg.role === 'assistant'
                  ? <MarkdownRenderer content={msg.content} />
                  : <span>{msg.content}</span>}
              </>
            )}
            {msg.role === 'assistant' && msg.imageData && renderImageContent(msg.imageData)}
            {isStreaming && <span className="cursor" />}
            {msg.role === 'assistant' && !isStreaming && onRegenerate && messages.indexOf(msg) === messages.length - 1 && (
              <button
                className="regenerate-btn"
                title="重新生成"
                onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
      <div ref={scrollRef} />
    </div>
  );
}
