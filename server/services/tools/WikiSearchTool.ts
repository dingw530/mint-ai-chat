import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { isPathSafe, getWikiPath } from '../utils/pathSecurity.js';

const WikiSearchInputSchema = z.object({
  question: z.string().min(1).describe('搜索问题或关键词'),
  paths: z.array(z.string()).optional().describe('直接读取指定文件路径（相对 Wiki 根目录），跳过搜索'),
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
 * 复合 Wiki 搜索工具：一次调用完成搜索 + 读取。
 * 替代原 wiki_query + list_files + read_file 三个独立工具。
 */
export class WikiSearchTool extends BaseTool<WikiSearchInput, WikiSearchOutput> {
  readonly name = 'wiki_search';
  readonly description = '搜索并读取 Wiki 知识库。输入 question 进行关键词搜索（返回匹配页面的完整内容），或输入 paths 直接读取指定文件。所有 Wiki 文件的读取和搜索必须使用此工具，禁止使用 bash 读取 Wiki 文件。';
  readonly inputSchema = WikiSearchInputSchema;

  isReadOnly(): boolean { return true; }
  isConcurrencySafe(): boolean { return true; }

  async execute(input: WikiSearchInput, _context: ToolContext): Promise<WikiSearchOutput> {
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    // 路径模式：直接读取指定文件
    if (input.paths && input.paths.length > 0) {
      return this.readFiles(wikiPath, input.paths);
    }

    // 搜索模式：关键词搜索 + 返回完整内容
    return this.searchAndRead(wikiPath, input.question, input.maxResults, input.includeContent);
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
        results.push({ file: filePath, content: content.substring(0, 4000), score: 1 });
      }
    }

    return {
      results,
      total: results.length,
      message: `已读取 ${results.length} 个文件`,
    };
  }

  private searchAndRead(wikiPath: string, question: string, maxResults: number, includeContent: boolean): WikiSearchOutput {
    const keywords = this.extractKeywords(question);
    if (keywords.length === 0) {
      return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
    }

    const mdFiles = this.findMdFiles(wikiPath);
    const scored: { file: string; score: number; content: string }[] = [];

    for (const filePath of mdFiles) {
      const relativePath = path.relative(wikiPath, filePath);
      if (relativePath.startsWith('_')) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const score = this.matchScore(content, keywords);
        if (score > 0) {
          scored.push({ file: relativePath, score, content });
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
        ? (item.content.length <= 4000 ? item.content : item.content.substring(0, 4000) + '...')
        : this.extractSnippet(item.content, keywords),
      score: item.score,
    }));

    return {
      results,
      total: scored.length,
      message: scored.length > 0
        ? `找到 ${scored.length} 个相关页面，已返回前 ${results.length} 个的完整内容`
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
      .split(/[\s,，。.！？、；：""''（）()【】\[\]{}]+/)
      .filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  }

  private matchScore(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      const regex = new RegExp(lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = lowerContent.match(regex);
      if (matches) {
        if (lowerContent.startsWith('#') && lowerContent.split('\n')[0].includes(lowerKw)) {
          score += matches.length * 3;
        } else {
          score += matches.length;
        }
      }
    }
    return score;
  }

  private extractSnippet(content: string, keywords: string[]): string {
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
