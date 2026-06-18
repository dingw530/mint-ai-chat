import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath } from '../utils/pathSecurity.js';

const WikiQueryInputSchema = z.object({
  question: z.string().min(1).describe('要查询的问题或关键词'),
});

type WikiQueryInput = z.infer<typeof WikiQueryInputSchema>;

interface WikiQueryOutput {
  results: WikiQueryResult[];
  total: number;
  message: string;
}

interface WikiQueryResult {
  file: string;
  snippet: string;
  score: number;
}

/**
 * Wiki 查询工具：通过关键词搜索 Wiki 知识库，返回匹配的文件和内容片段。
 * 使用简单的关键词提取和 grep 风格匹配，不依赖 embedding。
 */
export class WikiQueryTool extends BaseTool<WikiQueryInput, WikiQueryOutput> {
  readonly name = 'wiki_query';
  readonly description = '搜索 Wiki 知识库中的相关内容。输入问题或关键词，返回匹配的 Wiki 页面和内容片段。';
  readonly inputSchema = WikiQueryInputSchema;

  isReadOnly(): boolean {
    return true;
  }

  isConcurrencySafe(): boolean {
    return true;
  }

  async execute(input: WikiQueryInput, _context: ToolContext): Promise<WikiQueryOutput> {
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    // 提取关键词（分词：按空格和中文标点分割，过滤停用词）
    const keywords = this.extractKeywords(input.question);
    if (keywords.length === 0) {
      return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
    }

    // 扫描所有 .md 文件
    const mdFiles = this.findMdFiles(wikiPath);
    const results: WikiQueryResult[] = [];

    for (const filePath of mdFiles) {
      const relativePath = path.relative(wikiPath, filePath);
      // 跳过系统文件
      if (relativePath.startsWith('_')) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const score = this.matchScore(content, keywords);
        if (score > 0) {
          const snippet = this.extractSnippet(content, keywords);
          results.push({ file: relativePath, snippet, score });
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    // 按匹配度排序
    results.sort((a, b) => b.score - a.score);

    // 截取前 10 条
    const topResults = results.slice(0, 10);

    return {
      results: topResults,
      total: results.length,
      message: topResults.length > 0
        ? `找到 ${results.length} 个相关页面，已返回前 ${topResults.length} 个`
        : '未找到相关内容',
    };
  }

  private extractKeywords(text: string): string[] {
    // 简单分词：按空格和常见标点分割，过滤短词和停用词
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '什么', '怎么', '如何', '为什么', '哪些', '哪个', '请', '吗', '吧', '呢', '啊', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'about']);
    const words = text.split(/[\s,，。.！？、；：""''（）()【】\[\]{}]+/);
    return words.filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  }

  private matchScore(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase();
      const regex = new RegExp(lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = lowerContent.match(regex);
      if (matches) {
        // 标题中匹配加分
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
    // 找到第一个关键词匹配位置，提取周围上下文
    const lowerContent = content.toLowerCase();
    let bestIdx = -1;

    for (const kw of keywords) {
      const idx = lowerContent.indexOf(kw.toLowerCase());
      if (idx >= 0) {
        bestIdx = idx;
        break;
      }
    }

    if (bestIdx < 0) return content.substring(0, 200);

    const start = Math.max(0, bestIdx - 80);
    const end = Math.min(content.length, bestIdx + 120);
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
