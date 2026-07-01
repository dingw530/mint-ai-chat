import * as fs from 'fs';
import * as path from 'path';
import type { AiSettings } from '../../types.js';
import { compileSource } from '../utils/wikiCompiler.js';
import { appendWikiManifestEntry } from '../utils/wikiShared.js';

/**
 * 原始归档文件输入。上传链路可直接传 buffer，异步作业链路可复用既有相对路径。
 */
export interface WikiArchivedFileInput {
  name: string;
  buffer?: Buffer;
  existingRelativePath?: string;
}

/**
 * 共享编译服务的标准入参，覆盖文本源、归档文件和分类提示。
 */
export interface WikiIngestionRequest {
  sourceText: string;
  sourceTitle: string;
  sourceFilenameHint?: string;
  category?: string;
  summaryHint?: string;
  archivedFiles?: WikiArchivedFileInput[];
}

/**
 * 统一编译后返回给入口层的落盘结果与 manifest 关联信息。
 */
export interface WikiIngestionResult {
  sourceFile: string;
  archivedFiles: string[];
  pages: { filename: string; title: string; size: number }[];
  summary: string;
  manifestId: string;
}

/**
 * 用于统一拼装 source 文本的结构化片段。
 */
export interface WikiSourceSegment {
  kind: 'url' | 'file';
  name: string;
  content: string;
}

/**
 * 将原始名称转换为适合写入文件系统的 slug。
 */
function slugifyFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
}

/**
 * 确保目标目录存在。
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 为归档文件生成不冲突的目标路径。
 */
function ensureUniqueFilePath(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let counter = 2;
  let nextPath = path.join(dir, `${base}-${counter}${ext}`);
  while (fs.existsSync(nextPath)) {
    counter += 1;
    nextPath = path.join(dir, `${base}-${counter}${ext}`);
  }
  return nextPath;
}

/**
 * 统一原始文件归档逻辑，确保所有入口遵循相同的命名与防覆盖策略。
 */
export function archiveWikiRawFile(wikiPath: string, fileName: string, buffer: Buffer): string {
  const sourcesDir = path.join(wikiPath, 'sources');
  ensureDir(sourcesDir);
  const date = new Date().toISOString().slice(0, 10);
  const ext = path.extname(fileName).toLowerCase();
  const baseName = slugifyFileName(path.basename(fileName, ext));
  const resolvedPath = ensureUniqueFilePath(path.join(sourcesDir, `${date}-${baseName}${ext}`));
  fs.writeFileSync(resolvedPath, buffer);
  return path.relative(wikiPath, resolvedPath).replace(/\\/g, '/');
}

function archiveRawFiles(wikiPath: string, files: WikiArchivedFileInput[] | undefined): string[] {
  if (!files || files.length === 0) return [];

  const sourcesDir = path.join(wikiPath, 'sources');
  ensureDir(sourcesDir);
  const date = new Date().toISOString().slice(0, 10);
  const archivedPaths: string[] = [];

  for (const file of files) {
    if (file.existingRelativePath) {
      archivedPaths.push(file.existingRelativePath.replace(/\\/g, '/'));
      continue;
    }
    if (!file.buffer) continue;
    archivedPaths.push(archiveWikiRawFile(wikiPath, file.name, file.buffer));
  }

  return archivedPaths;
}

/**
 * 将规范化后的 source 文本落盘到 `sources/`，作为不可变编译输入。
 */
function saveSourceText(
  wikiPath: string,
  sourceText: string,
  title: string,
  filenameHint?: string,
): string {
  const sourcesDir = path.join(wikiPath, 'sources');
  ensureDir(sourcesDir);

  const date = new Date().toISOString().slice(0, 10);
  const hintBase = filenameHint
    ? path.basename(filenameHint, path.extname(filenameHint))
    : title;
  const resolvedPath = ensureUniqueFilePath(path.join(sourcesDir, `${date}-${slugifyFileName(hintBase)}.md`));
  const sourceContent = `# ${title || '未命名资料'}

> 原始资料，不可变。摄入日期：${date}

${sourceText}
`;
  fs.writeFileSync(resolvedPath, sourceContent, 'utf-8');
  return path.relative(wikiPath, resolvedPath).replace(/\\/g, '/');
}

/**
 * 统一 sources 编译前的文本拼装口径，确保不同入口对相同原始内容生成一致的 source 文本。
 */
export function buildWikiSourceText(baseText: string, segments: WikiSourceSegment[] = []): string {
  let combinedSource = baseText || '';
  for (const segment of segments) {
    const heading = segment.kind === 'url' ? '来源' : '文件';
    combinedSource += `\n\n---\n## ${heading}：${segment.name}\n\n${segment.content}`;
  }
  return combinedSource;
}

/**
 * 统一 Wiki 编译入口：保存 source、归档原始文件、写页面、更新索引并追加 manifest。
 */
export async function ingestWikiSource(
  settings: AiSettings,
  wikiPath: string,
  request: WikiIngestionRequest,
): Promise<WikiIngestionResult> {
  const archivedFiles = archiveRawFiles(wikiPath, request.archivedFiles);
  const sourceFile = saveSourceText(
    wikiPath,
    request.sourceText,
    request.sourceTitle,
    request.sourceFilenameHint,
  );

  const compileResult = await compileSource(
    settings,
    wikiPath,
    request.sourceText,
    path.basename(sourceFile),
    { title: request.sourceTitle, category: request.category },
  );

  const manifestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  appendWikiManifestEntry(wikiPath, {
    id: manifestId,
    sourceFile,
    archivedFiles,
    pageFiles: compileResult.pages.map(page => page.filename),
    summary: request.summaryHint || compileResult.summary,
    createdAt: new Date().toISOString(),
  });

  return {
    sourceFile,
    archivedFiles,
    pages: compileResult.pages,
    summary: compileResult.summary,
    manifestId,
  };
}
