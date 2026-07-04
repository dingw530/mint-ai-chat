import * as fs from 'fs';
import * as path from 'path';
import { isPathSafe } from './pathSecurity.js';

// ── Types ──

export interface CompiledPage {
  filename: string;
  title: string;
  tags: string[];
  created?: string;
  source?: string;
  content: string;
}

export interface WikiManifestEntry {
  id: string;
  sourceFile: string;
  archivedFiles: string[];
  pageFiles: string[];
  summary: string;
  createdAt: string;
}

export interface WikiManifest {
  version: number;
  entries: WikiManifestEntry[];
}

export interface ParsedWikiPage {
  file: string;
  title: string;
  tags: string[];
  created: string;
  source: string;
  headings: string[];
  body: string;
}

// ── Prompt ──

export const INGEST_SYSTEM_PROMPT = `你是一个知识编译助手，遵循 LLM Wiki 三层架构（Schema → Wiki → Sources）。

你的任务是将用户提供的原始资料编译为结构化的 Wiki 知识页面。

## 三层架构说明
- **Sources 层（sources/）**：原始资料已由工具保存，不可变
- **Wiki 知识层（pages/）**：你需要生成结构化的 Markdown 页面，放入 pages/ 目录
- **Schema 层（_schema.json）**：遵循此标签和分类规范

## 要求
1. 分析资料内容，提取关键知识点
2. 根据资料长度和主题复杂度，决定建一个或多个页面
3. 每个页面必须包含以下字段：
   - title: 页面标题
   - tags: [标签列表]
   - created: YYYY-MM-DD（当前日期）
   - source: {sourceFilename}（原始资料文件名）
4. 内容用 Markdown 编写，结构清晰
5. 页面之间使用相对路径交叉链接
6. 文件名为 pages/分类/页面名.md，分类必须填写且不能为空。禁止将页面直接放在 pages/ 根目录下。

## 输出格式
纯 JSON（不要包含其他文字）：
{
  "pages": [
    {
      "filename": "pages/分类/页面名.md",
      "title": "页面标题",
      "tags": ["标签1"],
      "created": "YYYY-MM-DD",
      "source": "原始文件名",
      "content": "正文内容（纯 Markdown，不含 YAML frontmatter）"
    }
  ],
  "summary": "一句话总结本次摄入"
}`;

// ── JSON Parse with fallback ──

/** AI 输出的 content 字段常含字面换行符和未转义双引号，
 *  标准 JSON.parse 必然失败。此函数通过逐字段提取绕过此问题：
 *  1. 先尝试标准 parse / 提取 {...}
 *  2. 若仍失败，用正则逐个提取 page 对象中的 filename/title/tags/content
 *  3. 对 content 字段，通过引号平衡算法安全截取原始内容并手动转义 */
export function tryParseLooseJson(text: string): any {
  // 1. standard parse
  try { return JSON.parse(text); } catch { /* empty */ }

  // 2. extract outermost { ... }
  const bs = text.indexOf('{');
  const be = text.lastIndexOf('}');
  if (bs >= 0 && be > bs) {
    try { return JSON.parse(text.slice(bs, be + 1)); } catch { /* empty */ }
  }

  // 3. field-by-field extraction when content has unescaped quotes/newlines
  const pages: any[] = [];
  const pageRe = /\{\s*"filename"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]+)"\s*,\s*"tags"\s*:\s*(\[[^\]]+\])\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = pageRe.exec(text)) !== null) {
    const filename = m[1];
    const title = m[2];
    let tags: string[];
    try { tags = JSON.parse(m[3]); } catch { tags = []; }

    const rest = text.slice(m.index + m[0].length);
    const contentKeyMatch = rest.match(/"content"\s*:\s*"/);
    if (!contentKeyMatch) continue;
    const contentStart = contentKeyMatch.index! + contentKeyMatch[0].length;
    let content = '';
    let esc = false;
    for (let i = contentStart; i < rest.length; i++) {
      const ch = rest[i];
      if (esc) {
        esc = false;
        if (ch === 'n') { content += '\n'; continue; }
        if (ch === 'r') continue;
        if (ch === 't') { content += '\t'; continue; }
        content += ch;
        continue;
      }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') {
        const after = rest.slice(i + 1).replace(/\s*\n?\s*/, '');
        if (after.startsWith('}') || after.startsWith(',') || after.startsWith(']')) break;
        content += '"';
        continue;
      }
      content += ch;
    }

    // extract optional created/source fields (appear after tags, before content)
    let created = '';
    let source = '';
    const beforeContent = rest.slice(0, contentKeyMatch.index!);
    const createdMatch = beforeContent.match(/"created"\s*:\s*"([^"]+)"/);
    if (createdMatch) created = createdMatch[1];
    const sourceMatch = beforeContent.match(/"source"\s*:\s*"([^"]+)"/);
    if (sourceMatch) source = sourceMatch[1];

    pages.push({ filename, title, tags, created, source, content });
  }

  if (pages.length > 0) {
    return { pages, summary: `成功提取 ${pages.length} 个页面` };
  }

  return null;
}

/**
 * 判断路径是否属于 Wiki 系统文件，系统文件不会参与普通 question 搜索结果。
 */
export function isSystemWikiPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const baseName = path.basename(normalized);
  return normalized === '_index.md'
    || normalized === '_schema.json'
    || normalized === '_manifest.json'
    || baseName.startsWith('_');
}

/**
 * 从 Markdown 中解析 YAML frontmatter。解析失败或不存在时返回 null。
 */
export function parseWikiFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const result: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) continue;

    let value = rest.join(':').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1);
      result[key.trim()] = value
        .split(',')
        .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      result[key.trim()] = value.replace(/^['"]|['"]$/g, '');
    }
  }

  return result;
}

/**
 * 去掉 Markdown frontmatter，仅保留正文内容。
 */
export function stripWikiFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * 提取 Markdown 正文中的所有 heading 文本，供搜索与 lint 共享。
 */
export function extractWikiHeadings(content: string): string[] {
  const body = stripWikiFrontmatter(content);
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^#{1,6}\s+/.test(line))
    .map(line => line.replace(/^#{1,6}\s+/, '').trim())
    .filter(Boolean);
}

/**
 * 将 Wiki Markdown 页面统一解析为结构化对象，兼容缺失 frontmatter 的旧页面。
 */
export function parseWikiPage(relativePath: string, content: string): ParsedWikiPage {
  const frontmatter = parseWikiFrontmatter(content) || {};
  const title = typeof frontmatter.title === 'string' && frontmatter.title
    ? frontmatter.title
    : path.basename(relativePath, path.extname(relativePath));
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const created = typeof frontmatter.created === 'string' ? frontmatter.created : '';
  const source = typeof frontmatter.source === 'string' ? frontmatter.source : '';
  const body = stripWikiFrontmatter(content);

  return {
    file: relativePath.replace(/\\/g, '/'),
    title,
    tags,
    created,
    source,
    headings: extractWikiHeadings(content),
    body,
  };
}

function getManifestPath(wikiPath: string): string {
  return path.join(wikiPath, '_manifest.json');
}

/**
 * 读取 `_manifest.json`，缺失或损坏时返回空 manifest 结构。
 */
export function readWikiManifest(wikiPath: string): WikiManifest {
  const manifestPath = getManifestPath(wikiPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Partial<WikiManifest>;
    return {
      version: parsed.version || 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries as WikiManifestEntry[] : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

/**
 * 覆盖写入 Wiki manifest。
 */
export function writeWikiManifest(wikiPath: string, manifest: WikiManifest): void {
  fs.writeFileSync(getManifestPath(wikiPath), JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * 追加一条 manifest 记录，供共享编译服务统一调用。
 */
export function appendWikiManifestEntry(wikiPath: string, entry: WikiManifestEntry): void {
  const manifest = readWikiManifest(wikiPath);
  manifest.entries.push(entry);
  writeWikiManifest(wikiPath, manifest);
}

// ── Write pages ──

/** Replace whitespace in filename portion of a wiki path with hyphens. */
function sanitizeWikiFilename(pagePath: string): string {
  const parts = pagePath.split('/');
  if (parts.length > 2) {
    const filename = parts.pop()!;
    parts.push(filename.replace(/[\s]+/g, '-'));
  }
  return parts.join('/');
}

/**
 * Write compiled pages to disk, assembling YAML frontmatter from separate fields + markdown body.
 */
export function writeWikiPages(wikiPath: string, pages: CompiledPage[]): { filename: string; title: string; size: number }[] {
  const results: { filename: string; title: string; size: number }[] = [];

  for (const page of pages) {
    const pagePath = page.filename.startsWith('pages/') ? page.filename : `pages/${page.filename}`;
    if (!isPathSafe(wikiPath, pagePath)) {
      throw new Error(`路径穿越被拒绝: ${pagePath}`);
    }
    // sanitize: replace whitespace in filename (not category dirs) with hyphens
    const sanitizedPath = sanitizeWikiFilename(pagePath);
    page.filename = sanitizedPath; // update for caller (e.g. updateIndexMd)

    // require a category directory in the path (pages/category/file.md)
    const pathSegments = sanitizedPath.split('/');
    if (pathSegments.length < 3) {
      throw new Error(`页面缺少分类目录: ${sanitizedPath}，格式必须为 pages/分类/文件名.md`);
    }

    const resolvedPath = path.resolve(wikiPath, sanitizedPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // assemble YAML frontmatter from separate fields + markdown body
    const frontmatterParts: string[] = [];
    frontmatterParts.push(`title: ${page.title}`);
    if (page.tags && page.tags.length > 0) {
      frontmatterParts.push(`tags: [${page.tags.join(', ')}]`);
    }
    if (page.created) frontmatterParts.push(`created: ${page.created}`);
    if (page.source) frontmatterParts.push(`source: ${page.source}`);
    const fullContent = ['---', ...frontmatterParts, '---', '', page.content].join('\n');

    fs.writeFileSync(resolvedPath, fullContent, 'utf-8');
    const stat = fs.statSync(resolvedPath);

    results.push({
      filename: sanitizedPath, // return sanitized path
      title: page.title,
      size: stat.size,
    });
  }

  return results;
}

// ── Update _index.md ──

/** Parse YAML frontmatter title from markdown content. */
function parseFrontmatterTitle(md: string): string | null {
  const m = md.match(/^---\s*\ntitle:\s*(.+)\n/);
  return m ? m[1].trim() : null;
}

/** Scan pages/ directory recursively and group by top-level category. */
function scanPagesByCategory(wikiPath: string): Record<string, { filename: string; title: string }[]> {
  const pagesDir = path.join(wikiPath, 'pages');
  const grouped: Record<string, { filename: string; title: string }[]> = {};
  if (!fs.existsSync(pagesDir)) return grouped;

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir).sort()) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === '.gitkeep' || entry.startsWith('.')) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.endsWith('.md') || entry === '.gitkeep') continue;
      try {
        const relativePath = path.relative(wikiPath, fullPath).replace(/\\/g, '/');
        const segments = relativePath.split('/');
        const category = segments.length >= 2 ? segments[1] : 'uncategorized';
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const title = parseFrontmatterTitle(fileContent) || entry.replace(/\.md$/, '');
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push({ filename: relativePath, title });
      } catch { /* skip unreadable files */ }
    }
  };

  walk(pagesDir);
  return grouped;
}

/** Regenerate _index.md with category index + recent updates. */
export function updateIndexMd(wikiPath: string, newPages: { filename: string; title: string }[]): void {
  const indexPath = path.join(wikiPath, '_index.md');

  // Scan current pages from disk
  const grouped = scanPagesByCategory(wikiPath);

  // Also merge newly added pages (in case they haven't been written yet)
  for (const p of newPages) {
    const segs = p.filename.replace(/^pages\//, '').split('/');
    const cat = segs.length >= 2 ? segs[0] : 'uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    if (!grouped[cat].find(e => e.filename === p.filename)) {
      grouped[cat].push(p);
    }
  }

  // Build _index.md
  const lines: string[] = [
    '# Wiki 首页',
    '',
    '这是 LLM Wiki 知识库的首页。',
    '',
  ];

  // Category index section
  const sortedCats = Object.keys(grouped).sort();
  if (sortedCats.length > 0) {
    lines.push('## 分类索引');
    lines.push('');
    for (const cat of sortedCats) {
      lines.push(`### ${cat}`);
      for (const page of grouped[cat]) {
        lines.push(`- [${page.title}](${page.filename})`);
      }
      lines.push('');
    }
  }

  // Recent updates
  const allPages = Object.values(grouped).flat();
  if (allPages.length > 0) {
    lines.push('## 最近更新');
    lines.push('');
    const recent = allPages.slice(-20).reverse();
    for (const page of recent) {
      lines.push(`- [${page.title}](${page.filename})`);
    }
    lines.push('');
  } else {
    lines.push('## 最近更新');
    lines.push('');
  }

  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
}

// ── Discover categories from pages/ ──

/** Auto-discover categories from existing pages/ subdirectories and merge into schema. */
export function discoverCategoriesFromDir(wikiPath: string, schema: Record<string, unknown>): void {
  const pagesDir = path.join(wikiPath, 'pages');
  const discovered: string[] = [];
  if (fs.existsSync(pagesDir)) {
    for (const entry of fs.readdirSync(pagesDir)) {
      const fullPath = path.join(pagesDir, entry);
      if (entry !== '.gitkeep' && !entry.startsWith('.') && fs.statSync(fullPath).isDirectory()) {
        discovered.push(entry);
      }
    }
  }
  if (discovered.length > 0) {
    const existing = (schema.categories as string[]) || [];
    schema.categories = [...new Set([...existing, ...discovered])];
  }
}
