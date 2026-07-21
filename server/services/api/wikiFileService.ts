import * as fs from 'fs';
import * as path from 'path';
import type { AiSettings } from '../../types.js';
import { isSupportedFile } from '../utils/fileParseService.js';
import { isPathSafe } from '../utils/pathSecurity.js';
import type { WikiSourceSegment, WikiUploadInput } from './wikiIngestionTypes.js';

export class WikiUploadValidationError extends Error {
  readonly status = 400;
}

/**
 * 校验上传文件的格式和业务大小限制。
 */
export function validateWikiUpload(
  settings: Pick<AiSettings, 'wikiMaxFileSize'>,
  input: WikiUploadInput,
): void {
  if (!isSupportedFile(input.name)) {
    throw new WikiUploadValidationError(`不支持的文件类型: ${input.name}，支持: HTML/TXT/MD/PDF`);
  }

  const maxSize = settings.wikiMaxFileSize;
  if (maxSize > 0 && input.size > maxSize) {
    const sizeMB = (input.size / 1048576).toFixed(1);
    const limitMB = (maxSize / 1048576).toFixed(1);
    throw new WikiUploadValidationError(`文件大小 ${sizeMB}MB 超过限制 ${limitMB}MB`);
  }
}

/**
 * 归档上传文件，并返回相对于 Wiki 根目录的规范化路径。
 */
export function archiveWikiUpload(
  wikiPath: string,
  settings: Pick<AiSettings, 'wikiMaxFileSize'>,
  input: WikiUploadInput,
): string {
  validateWikiUpload(settings, input);
  return archiveWikiRawFile(wikiPath, input.name, input.buffer);
}

/**
 * 读取已归档的 Wiki 原始文件，拒绝 Wiki 根目录之外的路径。
 */
export function readArchivedWikiFile(wikiPath: string, relativePath: string): Buffer {
  if (!isPathSafe(wikiPath, relativePath)) {
    throw new Error('归档文件路径不安全');
  }
  return fs.readFileSync(path.resolve(wikiPath, relativePath));
}

/**
 * 将多个来源片段拼装为统一的 source 文本。
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
 * 统一原始文件归档逻辑，确保所有入口遵循相同命名与防覆盖策略。
 */
export function archiveWikiRawFile(wikiPath: string, fileName: string, buffer: Buffer): string {
  const sourcesDir = path.join(wikiPath, 'sources');
  ensureDir(sourcesDir);
  const date = new Date().toISOString().slice(0, 10);
  const ext = path.extname(fileName).toLowerCase();
  const baseName = slugifyFileName(stripDatePrefixes(path.basename(fileName, ext)));
  const resolvedPath = ensureUniqueFilePath(path.join(sourcesDir, `${date}-${baseName}${ext}`));
  fs.writeFileSync(resolvedPath, buffer);
  return path.relative(wikiPath, resolvedPath).replace(/\\/g, '/');
}

/**
 * 将规范化后的 source 文本保存为不可变编译输入。
 */
export function saveWikiSourceText(
  wikiPath: string,
  sourceText: string,
  title: string,
  filenameHint?: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const hintBase = filenameHint
    ? stripDatePrefixes(path.basename(filenameHint, path.extname(filenameHint)))
    : title;
  const sourceContent = `# ${title || '未命名资料'}\n\n> 原始资料，不可变。摄入日期：${date}\n\n${sourceText}\n`;
  return archiveWikiRawFile(wikiPath, `${hintBase}.md`, Buffer.from(sourceContent, 'utf-8'));
}

function slugifyFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

function stripDatePrefixes(name: string): string {
  let normalized = name;
  while (/^\d{4}-\d{2}-\d{2}-/.test(normalized)) {
    normalized = normalized.slice(11);
  }
  return normalized;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

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
