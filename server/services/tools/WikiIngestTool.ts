import { z } from 'zod';
import * as path from 'path';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath } from '../utils/pathSecurity.js';
import * as settingsService from '../api/settingsService.js';
import { parseFile, isSupportedFile } from '../utils/fileParseService.js';
import { ingestWikiSource, buildWikiSourceText } from '../api/wikiIngestionService.js';
import { captureWikiPage } from '../utils/wikiPageCapture.js';

const FileInputSchema = z.object({
  name: z.string().describe('原始文件名（含扩展名）'),
  content: z.string().describe('Base64 编码的文件内容'),
  type: z.string().optional().describe('MIME type'),
});

const WikiIngestInputSchema = z.object({
  source: z.string().optional().default('').describe('要摄入的原始资料内容（文本/Markdown），与 urls/files 至少提供一个'),
  title: z.string().optional().describe('原始资料标题，用于源文件名，省略则由 AI 自动生成'),
  category: z.string().optional().describe('分类目录名，省略则 AI 自动归类'),
  urls: z.array(z.string().url().refine(value => /^https?:\/\//i.test(value), '仅支持 http/https URL')).optional().describe('要抓取的网页 URL 列表，服务端自动获取内容（无 CORS 限制）'),
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
  readonly executionTimeoutMs = 120000;
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
    const capturedUrlTitles: string[] = [];

    if (input.urls && input.urls.length > 0) {
      for (const url of input.urls) {
        const captured = await this.captureAndParseUrl(url, _context);
        const displayName = captured.title ? `${captured.title} (${captured.url})` : captured.url;
        segments.push({ kind: 'url', name: displayName, content: captured.text });
        if (captured.title) capturedUrlTitles.push(captured.title);
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
      || capturedUrlTitles[0]
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

  private async captureAndParseUrl(url: string, context: ToolContext): Promise<{ url: string; text: string; title?: string }> {
    const captured = await captureWikiPage(url, {
      signal: context.signal,
    });

    const parsed = await parseFile({
      name: this.buildCaptureFileName(captured.finalUrl || url, captured.mode),
      content: Buffer.from(captured.content, 'utf-8'),
      size: Buffer.byteLength(captured.content),
    });

    return {
      url: captured.finalUrl || url,
      title: captured.title,
      text: parsed.text,
    };
  }

  private buildCaptureFileName(url: string, mode: 'html' | 'text'): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, '');
      const pathPart = parsed.pathname
        .replace(/\/+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]+/g, '-');
      const base = [host, pathPart, parsed.search ? 'query' : '']
        .filter(Boolean)
        .join('-')
        .replace(/-+/g, '-');
      return `${base || 'web-page'}.${mode === 'html' ? 'html' : 'txt'}`;
    } catch {
      return `web-page.${mode === 'html' ? 'html' : 'txt'}`;
    }
  }
}
