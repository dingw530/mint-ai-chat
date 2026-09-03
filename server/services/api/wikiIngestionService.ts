import type { AiSettings } from '../../types.js';
import { compileSource, type WikiCompileProgressStage } from '../utils/wikiCompiler.js';
import { appendWikiManifestEntry } from '../utils/wikiShared.js';
import { buildGraphFromPages } from '../graphBuilder.js';
import { generateCrossBatchCandidates } from './crossBatchSemanticService.js';
import { createLogger } from '../../utils/logger.js';
import {
  discardWikiStagedFile,
  finalizeWikiSourceFile,
  rollbackWikiSourceFile,
  stageWikiRawFile,
  stageWikiSourceText,
} from './wikiFileService.js';
import { registerCompiledKnowledge } from './wikiKnowledgeLifecycleService.js';
import { rebuildWikiSearchIndex } from './wikiSearchService.js';
import type { OpenAICompatibleEmbeddingConfig } from '../vector/types.js';
import type { WikiPageSummary } from './wikiIngestionTypes.js';
import type { CompiledPage, Relationship } from '../utils/wikiShared.js';

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
  /** 异步可重试任务失败时保留其暂存输入；成功后仍会 finalize。 */
  retainStagedFilesOnError?: boolean;
  /** 将真实编译阶段转发给异步任务状态。 */
  onCompileProgress?: (stage: WikiCompileProgressStage) => void;
}

/**
 * 统一编译后返回给入口层的落盘结果与 manifest 关联信息。
 */
export interface WikiIngestionResult {
  sourceFile: string;
  archivedFiles: string[];
  pages: WikiPageSummary[];
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
    archivedPaths.push(stageWikiRawFile(wikiPath, file.name, file.buffer));
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
      : stageWikiSourceText(
          wikiPath,
          request.sourceText,
          request.sourceTitle,
          request.sourceFilenameHint,
        );
  const stagedFiles = [...new Set([...archivedFiles, sourceFile])];
  const finalizedFiles: string[] = [];

  try {
    const compileResult = await compileSource(
      settings,
      wikiPath,
      request.sourceText,
      sourceFile.split('/').pop() || request.sourceTitle,
      {
        title: request.sourceTitle,
        category: request.category,
        onProgress: request.onCompileProgress,
      },
    );
    const finalizedByPath = finalizeStagedFiles(wikiPath, stagedFiles, finalizedFiles);
    const committedSourceFile = finalizedByPath.get(sourceFile) || sourceFile;
    const committedArchivedFiles = archivedFiles.map((file) => finalizedByPath.get(file) || file);

    registerCompiledKnowledge(
      committedSourceFile,
      request.sourceText,
      compileResult.compiledPages,
      compileResult.claims,
    );
    const embeddingConfig: OpenAICompatibleEmbeddingConfig | undefined =
      settings.wikiSearchMode === 'hybrid'
        ? {
            apiUrl: settings.embeddingApiUrl,
            model: settings.embeddingModel,
            dimensions: settings.embeddingDimensions,
          }
        : undefined;
    await rebuildWikiSearchIndex(wikiPath, embeddingConfig);

    const graphErrors = buildIngestionGraph(
      compileResult.compiledPages,
      compileResult.relationships,
      wikiPath,
    );
    try {
      await generateCrossBatchCandidates(settings, wikiPath, compileResult.compiledPages);
    } catch (err) {
      log.warn('[crossBatchCandidates] 生成失败', { error: (err as Error).message });
    }

    const manifestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    appendWikiManifestEntry(wikiPath, {
      id: manifestId,
      sourceFile: committedSourceFile,
      archivedFiles: committedArchivedFiles,
      pageFiles: compileResult.pages.map((page) => page.filename),
      summary: request.summaryHint || compileResult.summary,
      createdAt: new Date().toISOString(),
    });

    return {
      sourceFile: committedSourceFile,
      archivedFiles: committedArchivedFiles,
      pages: compileResult.pages,
      summary: compileResult.summary,
      manifestId,
      graphErrors: graphErrors.length > 0 ? graphErrors : undefined,
    };
  } catch (error: unknown) {
    if (!request.retainStagedFilesOnError) {
      stagedFiles.forEach((file) => discardWikiStagedFile(wikiPath, file));
    }
    finalizedFiles.forEach((file) => rollbackWikiSourceFile(wikiPath, file));
    throw error;
  }
}

function finalizeStagedFiles(
  wikiPath: string,
  files: string[],
  finalizedFiles: string[],
): Map<string, string> {
  const finalizedByPath = new Map<string, string>();
  for (const file of files) {
    const finalized = finalizeWikiSourceFile(wikiPath, file);
    finalizedByPath.set(file, finalized);
    if (finalized !== file) finalizedFiles.push(finalized);
  }
  return finalizedByPath;
}

function buildIngestionGraph(
  pages: CompiledPage[],
  relationships: Relationship[],
  wikiPath: string,
): string[] {
  try {
    const graphResult = buildGraphFromPages(pages, relationships, wikiPath);
    if (graphResult.errors.length > 0)
      log.warn('[graphBuilder] 部分构建失败:', { errors: graphResult.errors });
    return graphResult.errors;
  } catch (err) {
    log.error('[graphBuilder] 构建异常:', { error: (err as Error).message });
    return [(err as Error).message];
  }
}
