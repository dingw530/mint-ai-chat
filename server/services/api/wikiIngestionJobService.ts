import * as path from 'path';
import * as settingsService from './settingsService.js';
import { ingestWikiSource, buildWikiSourceText } from './wikiIngestionService.js';
import {
  archiveWikiUpload,
  readArchivedWikiFile,
  WikiUploadValidationError,
} from './wikiFileService.js';
import type {
  WikiJob,
  WikiJobResult,
  WikiUploadInput,
  WikiUploadStartResult,
} from './wikiIngestionTypes.js';
import { parseFile } from '../utils/fileParseService.js';
import * as jobStore from '../utils/jobStore.js';
import type { AiSettings } from '../../types.js';

export interface WikiIngestionJobDependencies {
  getAiSettings: typeof settingsService.getAiSettings;
  parseFile: typeof parseFile;
  ingestWikiSource: typeof ingestWikiSource;
  archiveWikiUpload: typeof archiveWikiUpload;
  readArchivedWikiFile: typeof readArchivedWikiFile;
  createJob: typeof jobStore.createJob;
  updateJob: typeof jobStore.updateJob;
  getJob: typeof jobStore.getJob;
}

const defaultDependencies: WikiIngestionJobDependencies = {
  getAiSettings: settingsService.getAiSettings,
  parseFile,
  ingestWikiSource,
  archiveWikiUpload,
  readArchivedWikiFile,
  createJob: jobStore.createJob,
  updateJob: jobStore.updateJob,
  getJob: jobStore.getJob,
};

/**
 * 创建 Wiki 摄入作业服务。依赖注入用于隔离文件系统、AI 编译器和 JobStore 的测试。
 */
export function createWikiIngestionJobService(
  dependencies: Partial<WikiIngestionJobDependencies> = {},
): WikiIngestionJobService {
  return new WikiIngestionJobService({ ...defaultDependencies, ...dependencies });
}

/**
 * 统一 Web 与 Electron 的 Wiki 上传、解析、编译和作业状态编排。
 */
export class WikiIngestionJobService {
  constructor(private readonly dependencies: WikiIngestionJobDependencies) {}

  /**
   * 校验并归档上传文件，创建后台作业后立即返回。
   */
  start(input: WikiUploadInput): WikiUploadStartResult {
    const normalizedInput: WikiUploadInput = {
      ...input,
      size: input.buffer.length,
    };
    const settings = this.dependencies.getAiSettings();
    const wikiPath = settings.wikiPath;
    if (!wikiPath) {
      throw new WikiUploadValidationError('Wiki 路径未配置');
    }

    const sourceFile = this.dependencies.archiveWikiUpload(wikiPath, settings, normalizedInput);
    const jobId = this.dependencies.createJob(normalizedInput.name, normalizedInput.size);
    void this.run(jobId, normalizedInput, settings, sourceFile).catch((error: unknown) => {
      this.markError(jobId, error);
    });

    return {
      jobId,
      sourceFile,
      fileName: normalizedInput.name,
      fileSize: normalizedInput.size,
    };
  }

  /**
   * 执行一个已创建的摄入作业。该方法公开以便测试验证完整状态序列。
   */
  async run(
    jobId: string,
    input: WikiUploadInput,
    settings: AiSettings,
    sourceFile: string,
  ): Promise<void> {
    try {
      this.dependencies.updateJob(jobId, { status: 'parsing', progress: 30, step: '解析文件中' });
      const content = this.dependencies.readArchivedWikiFile(settings.wikiPath, sourceFile);
      const parsed = await this.dependencies.parseFile({
        name: input.name,
        content,
        size: content.length,
      });
      const preview =
        parsed.text.length > 500 ? `${parsed.text.substring(0, 500)}\n...` : parsed.text;

      this.dependencies.updateJob(jobId, { status: 'compiling', progress: 60, step: 'AI 编译中' });
      const compiled = await this.dependencies.ingestWikiSource(settings, settings.wikiPath, {
        sourceText: buildWikiSourceText('', [
          { kind: 'file', name: input.name, content: parsed.text },
        ]),
        sourceTitle: input.name.replace(/\.[^.]+$/, ''),
        sourceFilenameHint: path.basename(sourceFile),
        archivedFiles: [{ name: input.name, existingRelativePath: sourceFile }],
      });

      const result: WikiJobResult = {
        sourceFile: compiled.sourceFile || sourceFile,
        format: parsed.format,
        textLength: parsed.text.length,
        pageCount: parsed.pageCount,
        preview,
        pages: compiled.pages.length > 0 ? compiled.pages : undefined,
        graphErrors: compiled.graphErrors,
      };
      const hasGraphWarnings = Boolean(compiled.graphErrors && compiled.graphErrors.length > 0);
      this.dependencies.updateJob(jobId, {
        status: 'done',
        progress: 100,
        step: hasGraphWarnings ? '完成（图谱警告）' : '完成',
        result,
      });
    } catch (error: unknown) {
      this.markError(jobId, error);
    }
  }

  /**
   * 查询作业状态，保持入口层的统一返回类型。
   */
  getStatus(jobId: string): WikiJob | undefined {
    return this.dependencies.getJob(jobId);
  }

  private markError(jobId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.dependencies.updateJob(jobId, {
      status: 'error',
      progress: 100,
      step: '处理失败',
      error: message,
    });
  }
}

export const wikiIngestionJobService = createWikiIngestionJobService();
