import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath } from '../utils/pathSecurity.js';
import { browserFetch } from '../utils/browserFetch.js';
import * as settingsService from '../api/settingsService.js';
import { parseFile, isSupportedFile } from '../utils/fileParseService.js';
import { ingestWikiSource, buildWikiSourceText } from '../api/wikiIngestionService.js';

const execAsync = promisify(exec);

const FileInputSchema = z.object({
  name: z.string().describe('原始文件名（含扩展名）'),
  content: z.string().describe('Base64 编码的文件内容'),
  type: z.string().optional().describe('MIME type'),
});

const WikiIngestInputSchema = z.object({
  source: z.string().optional().default('').describe('要摄入的原始资料内容（文本/Markdown），与 urls/files 至少提供一个'),
  title: z.string().optional().describe('原始资料标题，用于源文件名，省略则由 AI 自动生成'),
  category: z.string().optional().describe('分类目录名，省略则 AI 自动归类'),
  urls: z.array(z.string().url()).optional().describe('要抓取的网页 URL 列表，服务端自动获取内容（无 CORS 限制）'),
  files: z.array(FileInputSchema).optional().describe('要上传的文件列表（Base64 编码），支持 HTML/TXT/MD/PDF'),
});

type WikiIngestInput = z.infer<typeof WikiIngestInputSchema>;

interface WikiPageResult {
  filename: string;
  title: string;
  size: number;
}

interface WikiIngestOutput {
  sourceFile: string;
  pages: WikiPageResult[];
  summary: string;
}
export class WikiIngestTool extends BaseTool<WikiIngestInput, WikiIngestOutput> {
  readonly name = 'wiki_ingest';
  readonly description = `将原始资料编译到 Wiki 知识库，遵循三层架构：
1. 保存原始资料到 sources/ 目录（不可变）
2. 调用 AI 分析并生成结构化 Markdown 页面
3. 写入 pages/ 目录并更新 _index.md`;
  readonly inputSchema = WikiIngestInputSchema;

  isReadOnly(): boolean {
    return false;
  }

  isIdempotent(): boolean {
    return false;
  }

  async execute(input: WikiIngestInput, _context: ToolContext): Promise<WikiIngestOutput> {
    const wikiPath = getWikiPath();
    if (!wikiPath) {
      throw new Error('Wiki 路径未配置，请在设置中配置 wikiPath');
    }

    if (!input.source && (!input.urls || input.urls.length === 0) && (!input.files || input.files.length === 0)) {
      throw new Error('请提供 source（原始资料）、urls（网页链接）或 files（文件）');
    }

    const settings = settingsService.getAiSettings();
    if (!settings.apiUrl || !settings.apiKey) {
      throw new Error('AI API 未配置');
    }

    // 1. 获取所有内容（source + urls + files）
    let combinedSource = input.source || '';
    const segments: Array<{ kind: 'url' | 'file'; name: string; content: string }> = [];
    const fileTitles: string[] = [];

    if (input.urls && input.urls.length > 0) {
      for (const url of input.urls) {
        const content = await this.fetchUrl(url);
        segments.push({ kind: 'url', name: url, content });
      }
    }

    if (input.files && input.files.length > 0) {
      const maxSize = settings.wikiMaxFileSize; // 0 = 不限制
      for (const file of input.files) {
        // 文件类型校验
        if (!isSupportedFile(file.name)) {
          throw new Error(`不支持的文件类型: ${path.extname(file.name)}，支持: HTML/TXT/MD/PDF`);
        }

        // Base64 解码
        let buffer: Buffer;
        try {
          buffer = Buffer.from(file.content, 'base64');
        } catch {
          throw new Error(`文件 ${file.name} 内容编码异常`);
        }

        // 文件大小校验
        if (maxSize > 0 && buffer.length > maxSize) {
          const sizeMB = (buffer.length / 1048576).toFixed(1);
          const limitMB = (maxSize / 1048576).toFixed(1);
          throw new Error(`文件 ${file.name} 大小 ${sizeMB}MB 超过限制 ${limitMB}MB`);
        }

        // 解析文件内容
        const result = await parseFile({ name: file.name, content: buffer, size: buffer.length });
        segments.push({ kind: 'file', name: file.name, content: result.text });
        fileTitles.push(file.name.replace(/\.[^.]+$/, ''));
      }
    }

    combinedSource = buildWikiSourceText(combinedSource, segments);

    if (!combinedSource.trim()) {
      throw new Error('未获取到有效内容');
    }

    // 2. 保存原始资料到 sources/
    const sourceTitle = input.title
      || (input.urls?.[0] ? `web-${new Date().toISOString().slice(0, 10)}` : '')
      || (input.files?.[0] ? fileTitles[0] : '')
      || 'untitled';
    const archivedFiles = input.files?.map(file => ({
      name: file.name,
      buffer: Buffer.from(file.content, 'base64'),
    })) || [];
    const ingestion = await ingestWikiSource(settings, wikiPath, {
      sourceText: combinedSource,
      sourceTitle,
      sourceFilenameHint: sourceTitle,
      category: input.category,
      archivedFiles,
    });

    return {
      sourceFile: ingestion.sourceFile,
      pages: ingestion.pages,
      summary: ingestion.summary,
    };
  }

  private async fetchUrl(url: string): Promise<string> {
    // 尝试 fetch
    const fetchResult = await this.tryFetch(url);
    if (fetchResult) return fetchResult;

    // fetch 失败，降级到 curl
    console.log(`[wiki_ingest] fetch failed for ${url}, falling back to curl`);
    const curlResult = await this.tryCurl(url);
    if (curlResult) return curlResult;

    return `[${url}] 无法获取内容（fetch 和 curl 均失败）`;
  }

  private async tryFetch(url: string): Promise<string | null> {
    try {
      const response = await browserFetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000,
      });

      if (!response.ok) return null;

      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return text;
      return this.htmlToText(text);
    } catch {
      return null;
    }
  }

  private async tryCurl(url: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `curl -sL --max-time 15 -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' ${JSON.stringify(url)}`,
        { timeout: 20000, maxBuffer: 1024 * 1024 },
      );

      if (!stdout) return null;
      return this.htmlToText(stdout);
    } catch {
      return null;
    }
  }

  private htmlToText(html: string): string {
    // 移除 script 和 style
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // 替换换行标签为换行符
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<\/tr>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');

    // 移除所有 HTML 标签
    text = text.replace(/<[^>]+>/g, '');

    // 解码 HTML 实体
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&#x2F;/g, '/');
    text = text.replace(/&nbsp;/g, ' ');

    // 合并空白行
    text = text.replace(/\n{3,}/g, '\n\n');

    // 截取过长内容（限制 50000 字符）
    if (text.length > 50000) {
      text = text.substring(0, 50000) + '\n\n...(内容已截断)';
    }

    return text.trim();
  }
}
