import MarkdownRenderer from './MarkdownRenderer';
import ReActStep from './ReActStep';
import AppIcon from './AppIcon';

export default function MessageList({ messages, streamingId, scrollRef, containerRef, onRegenerate, reactSteps, showReactSteps = true }) {
  const roleIcon = {
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

  return (
    <div className="messages-container" ref={containerRef}>
      {messages.map((msg) => {
        const isStreaming = msg.role === 'assistant' && msg.id === streamingId;
        return (
          <div
            key={msg.id || msg._tempId}
            className={`message ${msg.role}${isStreaming ? ' streaming' : ''}`}
          >
            <div className="message-label"
              dangerouslySetInnerHTML={{
                __html: `${roleIcon[msg.role] || ''} ${
                  msg.role === 'user' ? '你' : msg.role === 'error' ? '错误' : 'AI'
                }`,
              }}
            />
            {msg.reasoning && (
              <details className="reasoning-block" open>
                <summary>思考过程</summary>
                <div className="reasoning-content">{msg.reasoning}</div>
              </details>
            )}
            {/* ReAct 推理步骤展示：受 showReactSteps 控制 */}
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
