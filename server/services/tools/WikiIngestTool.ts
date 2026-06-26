import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { getWikiPath, isPathSafe } from '../utils/pathSecurity.js';
import { browserFetch } from '../utils/browserFetch.js';
import * as settingsService from '../api/settingsService.js';
import { parseFile, isSupportedFile } from '../utils/fileParseService.js';
import { INGEST_SYSTEM_PROMPT as SHARED_PROMPT, tryParseLooseJson, writeWikiPages, updateIndexMd } from '../utils/wikiShared.js';

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
    const fetchedUrls: string[] = [];
    const fileTitles: string[] = [];

    if (input.urls && input.urls.length > 0) {
      for (const url of input.urls) {
        const content = await this.fetchUrl(url);
        combinedSource += `\n\n---\n## 来源：${url}\n\n${content}`;
        fetchedUrls.push(url);
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
        combinedSource += `\n\n---\n## 文件：${file.name}\n\n${result.text}`;
        fileTitles.push(file.name.replace(/\.[^.]+$/, ''));
      }
    }

    if (!combinedSource.trim()) {
      throw new Error('未获取到有效内容');
    }

    // 2. 保存原始资料到 sources/
    const sourceTitle = input.title
      || (input.urls?.[0] ? `web-${new Date().toISOString().slice(0, 10)}` : '')
      || (input.files?.[0] ? fileTitles[0] : '')
      || 'untitled';
    const sourceFilename = this.saveSource(wikiPath, {
      ...input,
      source: combinedSource,
      title: sourceTitle,
      files: input.files,
    });

    // 3. 读取 _schema.json
    const schema = this.readSchema(wikiPath);

    // 4. 调用 AI 编译知识
    const aiResult = await this.callAi(settings, { ...input, source: combinedSource }, sourceFilename, schema);

    // 4. 解析 AI 输出
    const parsed = tryParseLooseJson(aiResult);
    if (!parsed) {
      console.error(`[wiki_ingest] AI 返回非 JSON 格式 (len=${aiResult.length})，完整返回:`);
      console.error(aiResult);
      throw new Error('AI 返回格式异常，完整返回已打印到日志');
    }
    const compiled = parsed;

    if (!compiled.pages || compiled.pages.length === 0) {
      throw new Error('AI 未生成任何 Wiki 页面');
    }

    // 5. 写入 pages/
    const results = writeWikiPages(wikiPath, compiled.pages);

    // 6. 更新 _index.md
    updateIndexMd(wikiPath, compiled.pages);

    return {
      sourceFile: `sources/${sourceFilename}`,
      pages: results,
      summary: compiled.summary || `成功创建 ${results.length} 个 Wiki 页面`,
    };
  }

  private saveSource(wikiPath: string, input: WikiIngestInput): string {
    const sourcesDir = path.join(wikiPath, 'sources');
    if (!fs.existsSync(sourcesDir)) {
      fs.mkdirSync(sourcesDir, { recursive: true });
    }

    const date = new Date().toISOString().slice(0, 10);
    const slug = (input.title || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${date}-${slug}.md`;

    // 保存原始上传文件（二进制或文本）
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        try {
          const fileSlug = path.basename(file.name, path.extname(file.name))
            .toLowerCase()
            .replace(/[^a-z0-9一-龥]+/g, '-')
            .replace(/^-|-$/g, '');
          const ext = path.extname(file.name).toLowerCase();
          const archiveName = `${date}-${fileSlug}${ext}`;
          const archivePath = path.join(sourcesDir, archiveName);
          const buffer = Buffer.from(file.content, 'base64');
          fs.writeFileSync(archivePath, buffer);
        } catch (err) {
          console.error(`[wiki_ingest] 存档原始文件失败: ${file.name}`, err);
        }
      }
    }

    // 保存编译用文本源文件
    const sourcePath = path.join(sourcesDir, filename);
    const sourceContent = `# ${input.title || '未命名资料'}

> 原始资料，不可变。摄入日期：${date}

${input.source}
`;
    fs.writeFileSync(sourcePath, sourceContent, 'utf-8');
    return filename;
  }

  private readSchema(wikiPath: string): Record<string, unknown> {
    const schemaPath = path.join(wikiPath, '_schema.json');
    try {
      return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    } catch {
      return {};
    }
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

  private async callAi(
    settings: { apiUrl: string; apiKey: string; modelId: string },
    input: WikiIngestInput,
    sourceFilename: string,
    schema: Record<string, unknown>,
  ): Promise<string> {
    const schemaInfo = JSON.stringify(schema, null, 2);
    const categories = (schema.categories as string[]) || [];    const userMessage = `标题：${input.title || '（AI 自动生成）'}
分类：${input.category || '（AI 自动归类）'}
原始文件名：${sourceFilename}

当前可用分类：${JSON.stringify(categories)}
当前 Schema 规范：
\`\`\`json
${schemaInfo}
\`\`\`

原始资料：
${input.source}`;

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.modelId,
        messages: [
          { role: 'system', content: SHARED_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown error');
      throw new Error(`AI API 请求失败 (${response.status}): ${errText}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content || '';
  }

  }
