import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WikiServiceContext } from '../index.js';
import { isPathSafe } from '../../services/utils/pathSecurity.js';
import { isSystemWikiPath, parseWikiPage } from '../../services/utils/wikiShared.js';
import * as lifecycleRepo from '../../repositories/wikiLifecycleRepository.js';
import { calculateWikiRetentionScore } from '../../services/utils/wikiRetention.js';
import { searchWiki } from '../../services/api/wikiSearchService.js';

const SearchInputSchema = {
  question: z.string().optional().describe('搜索关键词或问题（与 paths 二选一）'),
  paths: z.array(z.string()).optional().describe('直接读取指定文件路径列表（与 question 二选一）'),
  maxResults: z.number().optional().default(5).describe('返回 top N 结果，默认 5'),
  includeContent: z.boolean().optional().default(true).describe('是否返回完整文件内容，默认 true'),
};

// ── 关键词提取 ──

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '什么', '怎么', '如何', '为什么', '哪些', '哪个',
  '请', '吗', '吧', '呢', '啊',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'about',
]);

function extractKeywords(text: string): string[] {
  return text
    .split(/[\]\s,，。.！？、；：""''（）()【】[{}]+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
}

function countMatches(content: string, keywords: string[]): number {
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

function scorePage(
  page: { file: string; title: string; tags: string[]; headings: string[]; body: string },
  keywords: string[],
): number {
  const pathScore = countMatches(page.file, keywords) * 40;
  const titleScore = countMatches(page.title, keywords) * 50;
  const tagScore = countMatches(page.tags.join(' '), keywords) * 35;
  const headingScore = countMatches(page.headings.join('\n'), keywords) * 20;
  const bodyScore = countMatches(page.body, keywords);
  return pathScore + titleScore + tagScore + headingScore + bodyScore;
}

function extractSnippet(content: string, keywords: string[], headings: string[]): string {
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
    if (idx >= 0) {
      bestIdx = idx;
      break;
    }
  }
  if (bestIdx < 0) return content.length <= 500 ? content : content.substring(0, 500) + '...';

  const start = Math.max(0, bestIdx - 200);
  const end = Math.min(content.length, bestIdx + 800);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return prefix + content.substring(start, end) + suffix;
}

function findMdFiles(dirPath: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...findMdFiles(fullPath));
      } else if (entry.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch {
    // skip unreadable directories
  }
  return files;
}

// ── 搜索逻辑 ──

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

function searchAndRead(
  wikiPath: string,
  question: string,
  maxResults: number,
  includeContent: boolean,
): WikiSearchOutput {
  maxResults = Math.max(1, maxResults);
  const keywords = extractKeywords(question);
  if (keywords.length === 0) {
    return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
  }

  const pagesDir = path.join(wikiPath, 'pages');
  if (!fs.existsSync(pagesDir)) {
    return { results: [], total: 0, message: 'Wiki pages 目录不存在' };
  }

  const mdFiles = findMdFiles(pagesDir);
  const scored: { file: string; score: number; content: string; snippet: string }[] = [];

  for (const filePath of mdFiles) {
    const relativePath = path.relative(wikiPath, filePath);
    if (isSystemWikiPath(relativePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseWikiPage(relativePath, content);
      const baseScore = scorePage(parsed, keywords);
      let lifecycle: lifecycleRepo.WikiPage | null = null;
      try {
        lifecycle = lifecycleRepo.findPageByPath(relativePath);
      } catch {
        // 生命周期索引不可用时保留原有 MCP 文件搜索能力。
      }
      if (lifecycle && ['superseded', 'archived', 'deleted'].includes(lifecycle.status)) continue;
      const score = baseScore * (lifecycle ? 1 + calculateWikiRetentionScore(lifecycle) : 2);
      if (baseScore > 0) {
        scored.push({
          file: relativePath,
          score,
          content,
          snippet: extractSnippet(parsed.body, keywords, parsed.headings),
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults);

  for (const item of top) {
    let lifecycle: lifecycleRepo.WikiPage | null = null;
    try {
      lifecycle = lifecycleRepo.findPageByPath(item.file);
    } catch {
      // 访问反馈失败不影响 MCP 搜索响应。
    }
    if (lifecycle) {
      try {
        lifecycleRepo.touchPage(lifecycle.id);
        lifecycleRepo.recordEvent('page', lifecycle.id, 'accessed', null, lifecycle.sourceId, item.file, 'mcp wiki search result selected');
      } catch {
        // 搜索结果已经确定，访问统计失败不影响响应。
      }
    }
  }

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
    message:
      scored.length > 0
        ? `找到 ${scored.length} 个相关页面，已返回前 ${results.length} 个。可用 paths 直接读取以下文件：\n${filesList}`
        : '未找到相关内容',
  };
}

function readFiles(wikiPath: string, paths: string[]): WikiSearchOutput {
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
      const entries = fs.readdirSync(resolvedPath);
      const listing = entries
        .map(e => {
          const full = path.join(resolvedPath, e);
          const isDir = fs.statSync(full).isDirectory();
          return `${isDir ? '[DIR]' : '[FILE]'} ${e}`;
        })
        .join('\n');
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

export function registerSearchTool(server: McpServer, ctx: WikiServiceContext): void {
  server.registerTool(
    'mint_wiki_search',
    {
      description:
        '搜索并读取 Wiki 知识库。支持 paths 批量读取多个文件，也支持 question 关键词搜索返回匹配页面。' +
        '推荐：知道具体文件时用 paths 一次性读取多个；不确定时用 question 搜索',
      inputSchema: SearchInputSchema,
    },
    async ({ question, paths, maxResults, includeContent }) => {
      const normalizedMaxResults = maxResults ?? 5;
      const normalizedIncludeContent = includeContent ?? true;

      // 路径模式
      if (paths && paths.length > 0) {
        const result = readFiles(ctx.wikiPath, paths);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      }

      if (!question) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'question 或 paths 至少需要提供一个' }) }],
          isError: true,
        };
      }

      // 搜索模式
      const result = searchWiki(ctx.wikiPath, question, normalizedMaxResults, normalizedIncludeContent);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    },
  );
}
