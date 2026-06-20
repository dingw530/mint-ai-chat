import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Shared mutable wikiPath for mocks ──
let mockWikiPath: string | null = null;

// ── Mock pathSecurity ──
vi.mock('../services/utils/pathSecurity.js', () => ({
  isPathSafe: (root: string, target: string) => {
    const p = require('path');
    const resolvedRoot = p.resolve(root);
    const resolvedTarget = p.resolve(resolvedRoot, target);
    return resolvedTarget.startsWith(resolvedRoot + p.sep) || resolvedTarget === resolvedRoot;
  },
  getWikiPath: () => mockWikiPath,
}));

// ── Mock settingsService ──
vi.mock('../services/api/settingsService.js', () => ({
  getAiSettings: () => ({
    apiUrl: '', apiKey: '', modelId: '', systemPrompt: '',
    thinkingMode: false, memoryEnabled: false, wikiPath: mockWikiPath,
    wikiMaxFileSize: 0,
  }),
}));

// ── Mock bashSecurityService ──
vi.mock('../services/api/bashSecurityService.js', () => ({
  checkCommand: (cmd: string) => {
    if (cmd.includes('rm -rf /')) return { allowed: false, reason: '不允许删除根目录' };
    if (cmd.includes('sudo')) return { allowed: false, reason: '不允许使用 sudo' };
    return { allowed: true };
  },
}));

// ── Mock browserFetch ──
vi.mock('../services/utils/browserFetch.js', () => ({
  browserFetch: vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    text: () => Promise.resolve('<html><body>Mock content</body></html>'),
    headers: new Map([['content-type', 'text/html']]),
  }),
}));

// ── Mock fileParseService ──
vi.mock('../services/utils/fileParseService.js', () => ({
  parseFile: vi.fn().mockResolvedValue({ text: 'parsed content' }),
  isSupportedFile: (name: string) => /\.(html?|txt|md|pdf)$/i.test(name),
}));

// Re-import after mocks
import { ReadFileTool } from '../services/tools/ReadFileTool.js';
import { WriteFileTool } from '../services/tools/WriteFileTool.js';
import { ListFilesTool } from '../services/tools/ListFilesTool.js';
import { WikiQueryTool } from '../services/tools/WikiQueryTool.js';
import { WikiLintTool } from '../services/tools/WikiLintTool.js';
import { BashTool } from '../services/tools/BashTool.js';
import { HttpFetchTool } from '../services/tools/HttpFetchTool.js';

const ctx = { conversationId: 'test-conv' };
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-test-'));
  mockWikiPath = tmpDir;
});

afterEach(() => {
  mockWikiPath = null;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ══════════════════════════════════════════
// ReadFileTool
// ══════════════════════════════════════════
describe('ReadFileTool', () => {
  const tool = new ReadFileTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('read_file');
    expect(tool.isReadOnly()).toBe(true);
    expect(tool.isConcurrencySafe()).toBe(true);
  });

  it('should read a file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.md'), 'hello world');
    const result = await tool.execute({ path: 'test.md' }, ctx);
    expect(result.content).toBe('hello world');
    expect(result.path).toBe('test.md');
  });

  it('should list directory contents', async () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
    const result = await tool.execute({ path: '.' }, ctx);
    expect(result.content).toContain('[FILE] a.txt');
    expect(result.content).toContain('[DIR] sub');
  });

  it('should throw on non-existent file', async () => {
    await expect(tool.execute({ path: 'nope.md' }, ctx))
      .rejects.toThrow('文件不存在');
  });

  it('should reject path traversal', async () => {
    await expect(tool.execute({ path: '../etc/passwd' }, ctx))
      .rejects.toThrow('路径穿越被拒绝');
  });

  it('should throw when wikiPath not configured', async () => {
    mockWikiPath = null;
    await expect(tool.execute({ path: 'test.md' }, ctx))
      .rejects.toThrow('Wiki 路径未配置');
  });
});

// ══════════════════════════════════════════
// WriteFileTool
// ══════════════════════════════════════════
describe('WriteFileTool', () => {
  const tool = new WriteFileTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('write_file');
    expect(tool.isReadOnly()).toBe(false);
    expect(tool.isIdempotent()).toBe(true);
  });

  it('should write a file', async () => {
    const result = await tool.execute({ path: 'output.md', content: '# Hello' }, ctx);
    expect(result.path).toBe('output.md');
    expect(result.size).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(tmpDir, 'output.md'), 'utf-8')).toBe('# Hello');
  });

  it('should create subdirectories automatically', async () => {
    await tool.execute({ path: 'pages/sub/deep.md', content: 'nested' }, ctx);
    expect(fs.existsSync(path.join(tmpDir, 'pages/sub/deep.md'))).toBe(true);
  });

  it('should reject path traversal', async () => {
    await expect(tool.execute({ path: '../etc/crontab', content: 'evil' }, ctx))
      .rejects.toThrow('路径穿越被拒绝');
  });
});

// ══════════════════════════════════════════
// ListFilesTool
// ══════════════════════════════════════════
describe('ListFilesTool', () => {
  const tool = new ListFilesTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('list_files');
    expect(tool.isReadOnly()).toBe(true);
  });

  it('should list root directory', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), 'a');
    fs.mkdirSync(path.join(tmpDir, 'dir'));
    const result = await tool.execute({ path: '' }, ctx);
    expect(result.total).toBe(2);
    expect(result.entries.some(e => e.name === 'a.md' && e.type === 'file')).toBe(true);
    expect(result.entries.some(e => e.name === 'dir' && e.type === 'directory')).toBe(true);
  });

  it('should list recursively', async () => {
    fs.mkdirSync(path.join(tmpDir, 'a'));
    fs.mkdirSync(path.join(tmpDir, 'a/b'));
    fs.writeFileSync(path.join(tmpDir, 'a/b/file.txt'), 'x');
    const result = await tool.execute({ path: '', recursive: true }, ctx);
    expect(result.entries.some(e => e.path === 'a/b/file.txt')).toBe(true);
  });

  it('should throw on non-existent directory', async () => {
    await expect(tool.execute({ path: 'nope' }, ctx))
      .rejects.toThrow('目录不存在');
  });

  it('should throw when path is a file not directory', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'x');
    await expect(tool.execute({ path: 'file.txt' }, ctx))
      .rejects.toThrow('不是目录');
  });
});

// ══════════════════════════════════════════
// WikiQueryTool
// ══════════════════════════════════════════
describe('WikiQueryTool', () => {
  const tool = new WikiQueryTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('wiki_query');
    expect(tool.isReadOnly()).toBe(true);
  });

  it('should find matching content', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/react.md'), '# React\nReact 是一个前端框架。');
    const result = await tool.execute({ question: 'React 前端' }, ctx);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].file).toContain('react.md');
  });

  it('should return empty for no matches', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/empty.md'), '# 空页面\n没有相关内容。');
    const result = await tool.execute({ question: 'quantum computing' }, ctx);
    expect(result.results.length).toBe(0);
  });

  it('should skip system files (_ prefixed)', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/_schema.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'pages/test.md'), '# Test');
    const result = await tool.execute({ question: 'schema' }, ctx);
    expect(result.results.every(r => !r.file.startsWith('_'))).toBe(true);
  });

  it('should throw when wikiPath not configured', async () => {
    mockWikiPath = null;
    await expect(tool.execute({ question: 'test' }, ctx))
      .rejects.toThrow('Wiki 路径未配置');
  });
});

// ══════════════════════════════════════════
// WikiLintTool
// ══════════════════════════════════════════
describe('WikiLintTool', () => {
  const tool = new WikiLintTool();

  it('should report healthy for empty wiki', async () => {
    const result = await tool.execute({}, ctx);
    expect(result.healthy).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect orphan pages', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/orphan.md'), '# Orphan\nNo links here.');
    const result = await tool.execute({}, ctx);
    expect(result.issues.some(i => i.type === 'orphan')).toBe(true);
  });

  it('should detect broken links', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/a.md'), '# A\n[link to B](./b)');
    const result = await tool.execute({}, ctx);
    expect(result.issues.some(i => i.type === 'broken_link')).toBe(true);
  });

  it('should detect missing frontmatter', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/nofm.md'), 'No frontmatter here.');
    const result = await tool.execute({}, ctx);
    expect(result.issues.some(i => i.type === 'missing_frontmatter')).toBe(true);
  });

  it('should not flag pages with valid frontmatter', async () => {
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'pages/good.md'), '---\ntitle: Good\ntags: [test]\n---\n# Good page');
    const result = await tool.execute({}, ctx);
    expect(result.issues.some(i => i.type === 'missing_frontmatter')).toBe(false);
  });
});

// ══════════════════════════════════════════
// BashTool
// ══════════════════════════════════════════
describe('BashTool', () => {
  const tool = new BashTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('bash');
    expect(tool.isReadOnly()).toBe(false);
    expect(tool.isIdempotent()).toBe(false);
  });

  it('should execute simple commands', async () => {
    const result = await tool.execute({ command: 'echo hello' }, ctx);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('should capture stderr', async () => {
    const result = await tool.execute({ command: 'echo err >&2' }, ctx);
    expect(result.stderr.trim()).toBe('err');
  });

  it('should return non-zero exit code', async () => {
    const result = await tool.execute({ command: 'exit 42' }, ctx);
    expect(result.exitCode).toBe(42);
  });

  it('should block rm -rf /', async () => {
    const perm = tool.checkPermission({ command: 'rm -rf /' }, ctx);
    expect(perm.allowed).toBe(false);
  });

  it('should block sudo', async () => {
    const perm = tool.checkPermission({ command: 'sudo ls' }, ctx);
    expect(perm.allowed).toBe(false);
  });

  it('should allow safe commands', async () => {
    const perm = tool.checkPermission({ command: 'ls -la' }, ctx);
    expect(perm.allowed).toBe(true);
  });
});

// ══════════════════════════════════════════
// HttpFetchTool
// ══════════════════════════════════════════
describe('HttpFetchTool', () => {
  const tool = new HttpFetchTool();

  it('should have correct metadata', () => {
    expect(tool.name).toBe('http_fetch');
  });

  it('should validate input schema', () => {
    expect(tool.validate({ url: 'https://example.com' }).valid).toBe(true);
    expect(tool.validate({}).valid).toBe(false);
  });
});
