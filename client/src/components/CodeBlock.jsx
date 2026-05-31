import { useState, useCallback } from 'react';

function extractText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node?.props?.children) return extractText(node.props.children);
  return '';
}

export default function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);

  const codeText = extractText(children);
  const hasLangClass = className && (className.includes('language-') || className.includes('hljs'));
  // Fenced code blocks (even without language) contain newlines;
  // inline code almost never does. This distinguishes them since
  // we strip the <pre> wrapper in MarkdownRenderer.
  const isBlock = hasLangClass || codeText.includes('\n');

  if (!isBlock) {
    return <code className="inline-code">{children}</code>;
  }

  const lang = className
    ? className.replace('language-', '').split(' ')[0]
    : '';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = codeText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeText]);

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-lang">{lang}</span>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="code-block-content">
        <code>{children}</code>
      </pre>
    </div>
  );
}
