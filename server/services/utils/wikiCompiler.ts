import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeWikiCategories,
  parseWikiFrontmatter,
  stripWikiFrontmatter,
} from './wikiShared.js';
import { getAdapter } from '../adapters/apiAdapter.js';
import type { CompiledPage, Relationship, WikiCategory } from './wikiShared.js';
import {
  INGEST_SYSTEM_PROMPT as SHARED_PROMPT,
  tryParseLooseJson,
  writeWikiPages,
  updateIndexMd,
  discoverCategoriesFromDir,
} from './wikiShared.js';
import type { AiSettings } from '../../types.js';

export interface CompileResult {
  pages: { filename: string; title: string; size: number }[];
  compiledPages: CompiledPage[]; // 完整页面数据（含 tags/content），供图构建使用
  relationships: Relationship[]; // AI 输出的页面间语义关系
  summary: string;
}

/**
 * 扫描 pages/ 目录，返回已有页面列表（标题 + 文件路径）。
 * 供概念去重校验和 prompt 索引共用。
 */
function scanExistingPages(
  wikiPath: string,
): { title: string; filename: string; category: string; tags: string[] }[] {
  const pagesDir = path.join(wikiPath, 'pages');
  if (!fs.existsSync(pagesDir)) return [];

  const entries: { title: string; filename: string; category: string; tags: string[] }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === '.gitkeep' || entry.startsWith('.')) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const fm = parseWikiFrontmatter(fileContent);
      const relativePath = path.relative(wikiPath, fullPath).replace(/\\/g, '/');
      const segments = relativePath.split('/');
      const category = segments.length >= 3 ? segments[1] : 'uncategorized';
      const title = fm?.title ? String(fm.title) : entry.replace(/\.md$/, '');
      const tags = Array.isArray(fm?.tags) ? fm.tags.map(String) : [];
      entries.push({ title, filename: relativePath, category, tags });
    }
  };
  walk(pagesDir);
  return entries;
}

/**
 * 构建已有知识索引的格式化文本，注入 AI prompt 做概念去重参考。
 */
function buildExistingKnowledgeIndex(wikiPath: string): string {
  const entries = scanExistingPages(wikiPath);
  if (entries.length === 0) return '（暂无已有知识库）';

  const lines = entries.map(
    (e) =>
      '  - 页面: ' +
      e.title +
      ' (分类: ' +
      e.category +
      (e.tags.length ? ', 标签: ' + e.tags.join(', ') : '') +
      ')',
  );
  return '已有 ' + entries.length + ' 个知识页面：\n' + lines.join('\n');
}

/**
 * 计算两个字符串的字符级 Dice 系数（bigram 重叠度）。
 * 返回值 0~1，越高越相似。适用于中英文混合标题。
 */
function titleSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const result = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      result.add(s.substring(i, i + 2));
    }
    return result;
  };

  const setA = bigrams(a.replace(/\s+/g, ''));
  const setB = bigrams(b.replace(/\s+/g, ''));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * 对 AI 编译出的页面做标题去重校验。
 * 如果某个页面标题与已有知识库中的页面高度相似，则不创建新页面，
 * 而是生成一条 relationship 关联到已有页面。
 */
function deduplicatePages(
  newPages: CompiledPage[],
  existingEntries: { title: string; filename: string }[],
  existingRelationships: Relationship[],
): { pages: CompiledPage[]; relationships: Relationship[] } {
  const threshold = 0.75;
  const kept: CompiledPage[] = [];
  const extraRelationships: Relationship[] = [];

  for (const page of newPages) {
    let matched = false;
    for (const existing of existingEntries) {
      const sim = titleSimilarity(page.title, existing.title);
      if (sim >= threshold) {
        matched = true;
        extraRelationships.push({
          source: page.title,
          target: existing.title,
          relation: '属于',
          reason: '标题相似度 ' + sim.toFixed(2) + '，自动判定为同一概念',
        });
        console.log(
          '[wikiCompiler] 概念去重: "' +
            page.title +
            '" → 已有页面 "' +
            existing.title +
            '" (相似度 ' +
            sim.toFixed(2) +
            ')',
        );
        break;
      }
    }
    if (!matched) {
      kept.push(page);
    }
  }

  return { pages: kept, relationships: [...extraRelationships, ...existingRelationships] };
}

/**
 * 当多篇页面全部落入同一分类时，调用一次轻量 LLM 审计分类。
 * 只修改 pages/ 下的分类目录，不改页面标题和正文。
 */
async function auditPageCategories(
  settings: AiSettings,
  pages: CompiledPage[],
  categories: WikiCategory[],
): Promise<CompiledPage[]> {
  if (pages.length < 2 || categories.length < 2) return pages;

  const currentCategories = new Set(
    pages.map((page) => page.filename.split('/')[1]).filter(Boolean),
  );
  if (currentCategories.size > 1) return pages;

  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) return pages;

  const pageSummaries = pages.map((page, index) => ({
    index,
    filename: page.filename,
    title: page.title,
    content: page.content.slice(0, 1600),
  }));
  const prompt = `请审计以下 Wiki 页面分类。可选分类定义：${JSON.stringify(categories, null, 2)}

当前所有页面被分到了同一个分类，请重新逐页判断。允许最终仍然全部属于同一分类，但不能依据原始文章的整体类型判断，必须依据页面自身的核心主题。
只输出 JSON 数组，不要输出解释：
[{"index":0,"category":"分类名"}]

页面：
${JSON.stringify(pageSummaries, null, 2)}`;

  try {
    const result = await adapter.call(
      [
        { role: 'system', content: '你是 Wiki 分类审计器，只返回合法 JSON。' },
        { role: 'user', content: prompt },
      ],
      { modelId: settings.modelId },
      settings.apiUrl,
      settings.apiKey,
      { maxTokens: 2048, temperature: 0.1 },
    );
    const start = result.indexOf('[');
    const end = result.lastIndexOf(']');
    if (start < 0 || end <= start) return pages;

    const assignments = JSON.parse(result.slice(start, end + 1)) as unknown;
    if (!Array.isArray(assignments)) return pages;

    const validCategories = new Set(categories.map((category) => category.name));
    const audited = pages.map((page, index) => {
      const assignment = assignments.find(
        (item) => item && typeof item === 'object' && (item as { index?: unknown }).index === index,
      ) as { category?: unknown } | undefined;
      const category = typeof assignment?.category === 'string' ? assignment.category : '';
      if (!validCategories.has(category)) return page;

      const parts = page.filename.split('/');
      if (parts.length < 3) return page;
      parts[1] = category;
      return { ...page, filename: parts.join('/') };
    });
    console.log(
      '[wikiCompiler] page category audit completed:',
      audited.map((page) => `${page.title} -> ${page.filename.split('/')[1]}`).join(', '),
    );
    return audited;
  } catch (err) {
    console.warn(
      '[wikiCompiler] page category audit failed, keeping original categories:',
      err instanceof Error ? err.message : String(err),
    );
    return pages;
  }
}

/**
 * 调用 AI API 将原始资料编译为 Wiki 页面
 */
async function callAiForCompilation(
  settings: AiSettings,
  sourceText: string,
  sourceFilename: string,
  schema: Record<string, unknown>,
  existingKnowledgeIndex: string,
  title?: string,
  category?: string,
): Promise<string> {
  const schemaInfo = JSON.stringify(schema, null, 2);
  const categories = normalizeWikiCategories(schema.categories);
  const categoryGuidance = `
分类定义（必须以 Schema 为准）：
${JSON.stringify(categories, null, 2)}
分类必须根据页面自身的核心内容判断，不能因为原始文章整体属于某一类型就把所有页面都归为同一分类。`;
  const prompt = SHARED_PROMPT.replace('{sourceFilename}', sourceFilename);
  const userMessage = `标题：${title || '（AI 自动生成）'}
分类：${category || '（AI 自动归类）'}
原始文件名：${sourceFilename}

已有知识索引：
${existingKnowledgeIndex}

当前可用分类：${JSON.stringify(categories)}
${categoryGuidance}
当前 Schema 规范：
\`\`\`json
${schemaInfo}
\`\`\`

原始资料：
${sourceText}`;

  console.log(
    `[wikiCompiler] calling AI: url=${settings.apiUrl}, model=${settings.modelId}, apiKey=${settings.apiKey ? 'set(' + settings.apiKey.substring(0, 8) + '...)' : 'NOT SET'}`,
  );

  const adapter = getAdapter(settings.apiType || 'openai-chat');
  if (!adapter) throw new Error('Adapter not found');

  // 长文需要输出多个完整页面。固定 4096 tokens 会迫使模型把整篇资料压成一页，
  // 甚至在 JSON 尚未完成时被截断；短文保持原有额度，长文提高输出上限。
  const maxTokens = sourceText.length >= 8000 ? 12000 : 4096;

  const result = await adapter.call(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage },
    ],
    { modelId: settings.modelId },
    settings.apiUrl,
    settings.apiKey,
    { maxTokens, temperature: 0.3 },
  );

  console.log(
    `[wikiCompiler] AI response received, length=${result.length}, preview=${result.substring(0, 100)}`,
  );

  return result;
}

// ── Page Merge ───────────────────────────────────────────────────
// 当摄入新资料生成的页面与磁盘上已有页面路径相同时，不直接覆盖，
// 而是由 LLM 将新旧内容合并为一篇连贯的知识文章。

/** 前端数组字段：合并时取并集。 */
const UNION_FIELDS = ['tags'];

/** Body 安全阈值：LLM 合并后的正文长度不得低于原正文与新正文最大值 * 该比值。 */
const BODY_SHRINK_THRESHOLD = 0.7;

/** Union-merge 两个字符串数组，大小写不敏感去重，先出现的大小写为准。 */
function mergeLists(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...existing, ...incoming]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * 单个页面的合并入口。若页面文件已存在于磁盘，调用 LLM 合并新旧内容；
 * 否则直接返回 AI 生成的新页面。合并失败时回退到新页面（前端数组字段已合并）。
 */
async function mergePageIfExists(
  page: CompiledPage,
  wikiPath: string,
  settings: AiSettings,
): Promise<CompiledPage> {
  const sanitizedPath = page.filename.startsWith('pages/')
    ? page.filename
    : 'pages/' + page.filename;
  const resolvedPath = path.resolve(wikiPath, sanitizedPath);
  if (!fs.existsSync(resolvedPath)) return page;

  const existingMd = fs.readFileSync(resolvedPath, 'utf-8');
  const existingParsed = parseWikiFrontmatter(existingMd);

  // ① 前端数组字段取并集（纯应用层，不依赖 LLM）
  const mergedPage = { ...page };
  for (const field of UNION_FIELDS) {
    const existingValues: string[] = (existingParsed?.[field] as string[] | undefined) ?? [];
    const newValues = ((mergedPage as Record<string, unknown>)[field] as string[]) ?? [];
    if (existingValues.length > 0 || newValues.length > 0) {
      (mergedPage as Record<string, unknown>)[field] = mergeLists(existingValues, newValues);
    }
  }

  const existingBody = stripWikiFrontmatter(existingMd);
  const newBody = page.content || '';
  // ② Fast path：body 完全相同 → 只需前端合并
  if (existingBody.trim() === newBody.trim()) {
    console.log(
      '[wikiCompiler] page-merge: body identical for "' + page.title + '", frontmatter union only',
    );
    if (existingParsed?.title) mergedPage.title = String(existingParsed.title);
    if (existingParsed?.created) mergedPage.created = String(existingParsed.created);
    return mergedPage;
  }

  // ③ LLM 合并 body
  const mergePrompt = `你是一名知识库管理员。磁盘上已存在一个同名页面，现在有新的摄入内容需要对它进行补充。

请将已有内容和新增内容合并为一篇连贯、无重复、信息完整的 Wiki 页面。
- 保留已有内容的全部实质性信息，不可丢失。
- 新内容中与已有内容重复的部分只保留一次。
- 新内容中不重复的部分补充到合适的位置。
- 输出完整的合并后 Markdown（含 frontmatter），保持已有页面的标题。

已有页面（frontmatter + 正文）：
"""
${existingMd}
"""

新增内容（正文）：
"""
${newBody}
"""

仅输出合并后的完整 Markdown 页面，不要加任何说明文字。`;

  try {
    const adapter = getAdapter(settings.apiType || 'openai-chat');
    if (!adapter) throw new Error('Adapter not found');
    const llmResult = await adapter.call(
      [
        {
          role: 'system',
          content: '你是一个严谨的知识库编辑专家，输出纯 Markdown 页面，含 frontmatter。',
        },
        { role: 'user', content: mergePrompt },
      ],
      { modelId: settings.modelId },
      settings.apiUrl,
      settings.apiKey,
      { maxTokens: 4096, temperature: 0.3 },
    );

    const llmParsed = parseWikiFrontmatter(llmResult);
    const llmBody = stripWikiFrontmatter(llmResult);

    // ④ 安全校验：LLM 输出必须可解析、body 长度不缩水太多
    if (!llmParsed || !llmParsed.title) {
      console.warn(
        '[wikiCompiler] page-merge: LLM output has no valid frontmatter for "' +
          page.title +
          '", fallback to new content',
      );
      return mergedPage;
    }

    const maxBodyLen = Math.max(existingBody.length, newBody.length);
    const threshold = maxBodyLen * BODY_SHRINK_THRESHOLD;
    if (llmBody.length < threshold) {
      console.warn(
        '[wikiCompiler] page-merge: LLM body length ' +
          llmBody.length +
          ' below threshold ' +
          threshold.toFixed(0) +
          ' for "' +
          page.title +
          '", fallback',
      );
      return mergedPage;
    }

    // ⑤ 锁定 title / created，设定 updated
    mergedPage.content = llmBody;
    if (existingParsed?.title) mergedPage.title = String(existingParsed.title);
    if (existingParsed?.created) mergedPage.created = String(existingParsed.created);
    mergedPage.tags = mergeLists(
      (existingParsed?.tags as string[] | undefined) ?? [],
      llmParsed?.tags && Array.isArray(llmParsed.tags)
        ? (llmParsed.tags as unknown as string[])
        : (page.tags ?? []),
    );
    console.log(
      '[wikiCompiler] page-merge: merged "' +
        page.title +
        '" via LLM (existing=' +
        existingBody.length +
        ' new=' +
        newBody.length +
        ' merged=' +
        llmBody.length +
        ')',
    );
    return mergedPage;
  } catch (err) {
    console.warn(
      '[wikiCompiler] page-merge: LLM call failed for "' +
        page.title +
        '", fallback to new content: ' +
        (err instanceof Error ? err.message : String(err)),
    );
    return mergedPage;
  }
}

/**
 * 编译源文本并写入 Wiki 页面
 * 返回编译结果（页面列表 + 摘要）
 */
export async function compileSource(
  settings: AiSettings,
  wikiPath: string,
  sourceText: string,
  sourceFilename: string,
  options?: { title?: string; category?: string },
): Promise<CompileResult> {
  const schemaPath = path.join(wikiPath, '_schema.json');
  let schema: Record<string, unknown> = {};
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch {
    // schema 不存在或无法解析时使用空对象
  }

  discoverCategoriesFromDir(wikiPath, schema);
  const existingIndex = buildExistingKnowledgeIndex(wikiPath);

  const aiResult = await callAiForCompilation(
    settings,
    sourceText,
    sourceFilename,
    schema,
    existingIndex,
    options?.title,
    options?.category,
  );

  // AI 常在 content 字段中输出字面换行符，导致 JSON.parse 失败，先尝试宽松解析
  const compiled: { pages: CompiledPage[]; relationships?: Relationship[]; summary: string } =
    tryParseLooseJson(aiResult);
  if (!compiled) {
    console.error(`[wikiCompiler] AI 返回非 JSON 格式 (len=${aiResult.length})，完整返回:`);
    console.error(aiResult);
    throw new Error('AI 返回格式异常，完整返回已打印到日志');
  }

  if (!compiled.pages || compiled.pages.length === 0) {
    throw new Error('AI 未生成任何 Wiki 页面');
  }

  const categories = normalizeWikiCategories(schema.categories);
  compiled.pages = await auditPageCategories(settings, compiled.pages, categories);

  // 概念去重校验：检查 AI 输出的页面标题是否与已有页面重复
  const existingPages = scanExistingPages(wikiPath);
  if (existingPages.length > 0 && compiled.pages.length > 0) {
    const deduped = deduplicatePages(compiled.pages, existingPages, compiled.relationships || []);
    if (deduped.pages.length < compiled.pages.length) {
      const removed = compiled.pages.length - deduped.pages.length;
      console.log('[wikiCompiler] 概念去重自动移除 ' + removed + ' 个重复页面');
      compiled.pages = deduped.pages;
      compiled.relationships = deduped.relationships;
    }
  }

  // 页面合并：对每个页面检查磁盘是否已有同名文件，若有则 LLM 合并
  const mergedPages: CompiledPage[] = [];
  for (const page of compiled.pages) {
    const merged = await mergePageIfExists(page, wikiPath, settings);
    mergedPages.push(merged);
  }

  const results = writeWikiPages(wikiPath, mergedPages);
  updateIndexMd(wikiPath, mergedPages);
  compiled.pages = mergedPages;

  return {
    pages: results,
    compiledPages: compiled.pages,
    relationships: compiled.relationships || [],
    summary: compiled.summary || `成功创建 ${results.length} 个 Wiki 页面`,
  };
}
