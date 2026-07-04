import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { isPathSafe, getWikiPath } from '../utils/pathSecurity.js';
import { isSystemWikiPath, parseWikiPage } from '../utils/wikiShared.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('wiki-search');

const WikiSearchInputSchema = z.object({
  question: z.string().optional().describe('搜索问题或关键词（二选一：question 或 paths）'),
  paths: z.array(z.string()).optional().describe('直接读取指定文件路径（相对 Wiki 根目录），跳过搜索（二选一：question 或 paths）'),
  maxResults: z.coerce.number().optional().default(5).describe('搜索时返回 top N 结果，默认 5'),
  includeContent: z.coerce.boolean().optional().default(true).describe('是否返回完整文件内容，默认 true'),
});

type WikiSearchInput = z.infer<typeof WikiSearchInputSchema>;

interface WikiSearchResult {
  file: string;
  content: string;
  score: number;
}

interface WikiSearchOutput {
  results: WikiSearchResult[];
  total: number;
  message: string;
}

/**
 * 复合 Wiki 搜索工具：支持批量读取和关键词搜索。
 * 当你知道需要哪些文件时，始终用 paths 一次性批量读取多个文件，减少循环次数。
 * 也可以在一轮中并行调用多个 wiki_search，加快多篇查询速度。
 */
export class WikiSearchTool extends BaseTool<WikiSearchInput, WikiSearchOutput> {
  readonly name = 'wiki_search';
  readonly description = '搜索并读取 Wiki 知识库。支持 paths 批量读取多个文件（一次传入任意数量路径），也支持 question 关键词搜索返回匹配页面。所有 Wiki 文件访问必须通过此工具，禁止使用 bash。当你需要多个文件时，把所有路径放入 paths 一次读完，不要分多次调用。你也可以在一轮中并行发起多个 wiki_search 调用加速处理。';
  readonly inputSchema = WikiSearchInputSchema;

  isReadOnly(): boolean { return true; }
  isConcurrencySafe(): boolean { return true; }

  async execute(input: WikiSearchInput, _context: ToolContext): Promise<WikiSearchOutput> {
    const normalizedInput = this.inputSchema.parse(input);
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    // 路径模式：直接读取指定文件
    if (normalizedInput.paths && normalizedInput.paths.length > 0) {
      log.info('[wiki_search] mode=paths', { pathCount: normalizedInput.paths.length, paths: normalizedInput.paths.slice(0, 10) });
      const result = this.readFiles(wikiPath, normalizedInput.paths);
      log.info('[wiki_search] paths result', { totalResults: result.total, message: result.message });
      return result;
    }

    if (!normalizedInput.question) {
      throw new Error('question 或 paths 至少需要提供一个');
    }

    // 搜索模式：关键词搜索 + 返回完整内容
    log.info('[wiki_search] mode=question', {
      question: normalizedInput.question.substring(0, 100),
      maxResults: normalizedInput.maxResults,
      includeContent: normalizedInput.includeContent,
    });
    const result = this.searchAndRead(
      wikiPath,
      normalizedInput.question,
      normalizedInput.maxResults,
      normalizedInput.includeContent,
    );
    log.info('[wiki_search] search result', { totalResults: result.total, topFiles: result.results.slice(0, 5).map(r => r.file) });
    return result;
  }

  private readFiles(wikiPath: string, paths: string[]): WikiSearchOutput {
    const results: WikiSearchResult[] = [];

    for (const filePath of paths) {
      if (!isPathSafe(wikiPath, filePath)) {
        results.push({ file: filePath, content: `[路径不安全: ${filePath}]`, score: 0 });
        continue;
      }

      const resolvedPath = path.resolve(wikiPath, filePath);
      if (!fs.existsSync(resolvedPath)) {
        results.push({ file: filePath, content: `[文件不存在: ${filePath}]`, score: 0 });
        continue;
      }

      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        // 目录 → 列出内容
        const entries = fs.readdirSync(resolvedPath);
        const listing = entries.map(e => {
          const full = path.join(resolvedPath, e);
          const isDir = fs.statSync(full).isDirectory();
          return `${isDir ? '[DIR]' : '[FILE]'} ${e}`;
        }).join('\n');
        results.push({ file: filePath, content: listing, score: 1 });
      } else {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        results.push({ file: filePath, content: content.substring(0, 100000), score: 1 });
      }
    }

    return {
      results,
      total: results.length,
      message: `已读取 ${results.length} 个文件`,
    };
  }

  private searchAndRead(wikiPath: string, question: string, maxResults: number, includeContent: boolean): WikiSearchOutput {
    maxResults = Math.max(1, maxResults);
    const keywords = this.extractKeywords(question);
    if (keywords.length === 0) {
      return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
    }

    const pagesDir = path.join(wikiPath, 'pages');
    const mdFiles = this.findMdFiles(pagesDir);
    const scored: { file: string; score: number; content: string; snippet: string }[] = [];

    for (const filePath of mdFiles) {
      const relativePath = path.relative(wikiPath, filePath);
      if (isSystemWikiPath(relativePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseWikiPage(relativePath, content);
        const score = this.scorePage(parsed, keywords);
        if (score > 0) {
          scored.push({
            file: relativePath,
            score,
            content,
            snippet: this.extractSnippet(parsed.body, keywords, parsed.headings),
          });
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxResults);

    const results: WikiSearchResult[] = top.map(item => ({
      file: item.file,
      content: includeContent
        ? (item.content.length <= 100000 ? item.content : item.content.substring(0, 100000) + '...')
        : item.snippet,
      score: item.score,
    }));

    const filesList = results.map(r => r.file).join('\n');
    return {
      results,
      total: scored.length,
      message: scored.length > 0
        ? `找到 ${scored.length} 个相关页面，已返回前 ${results.length} 个。可用 paths 直接读取以下文件：\n${filesList}`
        : '未找到相关内容',
    };
  }

  // ── 关键词提取 ──

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '什么', '怎么', '如何', '为什么', '哪些', '哪个', '请', '吗', '吧', '呢', '啊',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'about',
    ]);
    return text
      .split(/[\]\s,，。.！？、；：""''（）()【】[{}]+/)
      .filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  }

  private countMatches(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      const regex = new RegExp(lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = lowerContent.match(regex);
      if (matches) score += matches.length;
    }
    return score;
  }

  private scorePage(
    page: { file: string; title: string; tags: string[]; headings: string[]; body: string },
    keywords: string[],
  ): number {
    const pathScore = this.countMatches(page.file, keywords) * 40;
    const titleScore = this.countMatches(page.title, keywords) * 50;
    const tagScore = this.countMatches(page.tags.join(' '), keywords) * 35;
    const headingScore = this.countMatches(page.headings.join('\n'), keywords) * 20;
    const bodyScore = this.countMatches(page.body, keywords);
    return pathScore + titleScore + tagScore + headingScore + bodyScore;
  }

  private extractSnippet(content: string, keywords: string[], headings: string[]): string {
    const headingContext = headings.find(heading =>
      keywords.some(kw => heading.toLowerCase().includes(kw.toLowerCase())),
    );
    if (headingContext) {
      const headingIndex = content.toLowerCase().indexOf(headingContext.toLowerCase());
      if (headingIndex >= 0) {
        const start = Math.max(0, headingIndex - 80);
        const end = Math.min(content.length, headingIndex + 720);
        const prefix = start > 0 ? '...' : '';
        const suffix = end < content.length ? '...' : '';
        return prefix + content.substring(start, end) + suffix;
      }
    }

    const lowerContent = content.toLowerCase();
    let bestIdx = -1;
    for (const kw of keywords) {
      const idx = lowerContent.indexOf(kw.toLowerCase());
      if (idx >= 0) { bestIdx = idx; break; }
    }
    if (bestIdx < 0) return content.length <= 500 ? content : content.substring(0, 500) + '...';

    const start = Math.max(0, bestIdx - 200);
    const end = Math.min(content.length, bestIdx + 800);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';
    return prefix + content.substring(start, end) + suffix;
  }

  private findMdFiles(dirPath: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...this.findMdFiles(fullPath));
        } else if (entry.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // 跳过无法访问的目录
    }
    return files;
  }
}
