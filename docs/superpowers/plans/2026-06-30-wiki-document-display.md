# Wiki Document Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve wiki document reading visuals without changing chat markdown rendering.

**Architecture:** Keep the shared markdown renderer intact for chat. Add a wiki-only reading shell around it in `WikiPanel` and scope all presentation overrides under wiki container classes in `wiki.css`, so the new look stays isolated.

**Tech Stack:** React 18, TypeScript, shared `MarkdownRenderer`, scoped CSS custom properties.

---

### Task 1: Switch wiki document view to shared markdown renderer

**Files:**
- Modify: `client/src/features/wiki/WikiPanel.tsx`

- [ ] **Step 1: Replace the bespoke markdown string renderer with `MarkdownRenderer`**

```tsx
import MarkdownRenderer from '@/shared/components/MarkdownRenderer';

// ...

return (
  <div className="wiki-document-shell">
    <div className="wiki-document-hero">
      <div className="wiki-document-hero-main">
        <div className="wiki-document-kicker">知识库文档</div>
        <h1 className="wiki-document-title">{fileName}</h1>
        <div className="wiki-document-path">{fileDir || '根目录'}</div>
      </div>
      <span className="wiki-document-badge">{(ext || 'md').toUpperCase()}</span>
    </div>
    <div className="wiki-document-body">
      <MarkdownRenderer content={content} />
    </div>
  </div>
);
```

- [ ] **Step 2: Keep unsupported file handling and empty states unchanged**

```tsx
const unsupportedExts = new Set(['pdf', 'html', 'htm']);
```

- [ ] **Step 3: Verify TypeScript compiles the updated imports and JSX**

Run: `npm run build`
Expected: build completes without TS errors in `WikiPanel.tsx`.

### Task 2: Add wiki-only article layout and markdown polish

**Files:**
- Modify: `client/src/styles/wiki.css`

- [ ] **Step 1: Add a centered wiki document shell and hero layout**

```css
.wiki-document-shell {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 28px 32px 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-tertiary) 100%);
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 2: Scope markdown typography and block styling to wiki only**

```css
.wiki-document-body .markdown-body h1 {
  font-size: 30px;
  margin: 0 0 18px;
}

.wiki-document-body .markdown-body table {
  font-size: 14px;
}
```

- [ ] **Step 3: Keep chat rendering untouched by scoping all new rules under wiki classes**

```css
.wiki-content-area .markdown-body { /* wiki only */ }
```

- [ ] **Step 4: Verify the wiki page still loads and the new classes are applied**

Run: `npm run build`
Expected: build completes and no CSS syntax errors are reported.

### Task 3: Verify chat markdown remains unchanged

**Files:**
- Inspect: `client/src/features/chat/components/MessageList.tsx`
- Inspect: `client/src/shared/components/MarkdownRenderer.tsx`

- [ ] **Step 1: Confirm chat still imports the shared renderer**

```tsx
import MarkdownRenderer from '@/shared/components/MarkdownRenderer';
```

- [ ] **Step 2: Confirm the shared renderer source itself was not modified**

```tsx
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
```

- [ ] **Step 3: Run a full build to verify both wiki and chat compile together**

Run: `npm run build`
Expected: build completes successfully.

