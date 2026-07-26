import type { AiSettings } from '../../types.js';
import { compileSource } from '../utils/wikiCompiler.js';
import { appendWikiManifestEntry } from '../utils/wikiShared.js';
import { buildGraphFromPages } from '../graphBuilder.js';
import { generateCrossBatchCandidates } from './crossBatchSemanticService.js';
import { createLogger } from '../../utils/logger.js';
import { archiveWikiRawFile, saveWikiSourceText } from './wikiFileService.js';
import { registerCompiledKnowledge } from './wikiKnowledgeLifecycleService.js';
import { rebuildWikiSearchIndex } from './wikiSearchService.js';

export { archiveWikiRawFile, buildWikiSourceText } from './wikiFileService.js';
export type { WikiSourceSegment } from './wikiIngestionTypes.js';

const log = createLogger('wiki-ingestion');

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
  graphErrors?: string[];
}

/**
 * 用于统一拼装 source 文本的结构化片段。
 */
function archiveRawFiles(wikiPath: string, files: WikiArchivedFileInput[] | undefined): string[] {
  if (!files || files.length === 0) return [];

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
 * 统一 Wiki 编译入口：保存 source、归档原始文件、写页面、更新索引并追加 manifest。
 */
export async function ingestWikiSource(
  settings: AiSettings,
  wikiPath: string,
  request: WikiIngestionRequest,
): Promise<WikiIngestionResult> {
  const archivedFiles = archiveRawFiles(wikiPath, request.archivedFiles);
  // 单文件上传已经有不可变原始归档，直接复用它，避免为同一文件再生成规范化副本。
  // 多文件或文本/URL摄入仍生成组合快照。
  const sourceFile =
    archivedFiles.length === 1
      ? archivedFiles[0]
      : saveWikiSourceText(
          wikiPath,
          request.sourceText,
          request.sourceTitle,
          request.sourceFilenameHint,
        );

  const compileResult = await compileSource(
    settings,
    wikiPath,
    request.sourceText,
    sourceFile.split('/').pop() || request.sourceTitle,
    { title: request.sourceTitle, category: request.category },
  );

  registerCompiledKnowledge(sourceFile, request.sourceText, compileResult.compiledPages, compileResult.claims);
  rebuildWikiSearchIndex(wikiPath);

  let graphErrors: string[] = [];

  // 摄入后自动构建知识图谱：页面级边
  try {
    const graphResult = buildGraphFromPages(
      compileResult.compiledPages,
      compileResult.relationships,
      wikiPath,
    );
    if (graphResult.errors.length > 0) {
      log.warn('[graphBuilder] 部分构建失败:', { errors: graphResult.errors });
      graphErrors = graphResult.errors;
    }
  } catch (err) {
    log.error('[graphBuilder] 构建异常:', { error: (err as Error).message });
    graphErrors = [(err as Error).message];
  }
  try {
    await generateCrossBatchCandidates(settings, wikiPath, compileResult.compiledPages);
  } catch (err) {
    log.warn('[crossBatchCandidates] 生成失败', { error: (err as Error).message });
  }

  const manifestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  appendWikiManifestEntry(wikiPath, {
    id: manifestId,
    sourceFile,
    archivedFiles,
    pageFiles: compileResult.pages.map((page) => page.filename),
    summary: request.summaryHint || compileResult.summary,
    createdAt: new Date().toISOString(),
  });

  return {
    sourceFile,
    archivedFiles,
    pages: compileResult.pages,
    summary: compileResult.summary,
    manifestId,
    graphErrors: graphErrors.length > 0 ? graphErrors : undefined,
  };
}
