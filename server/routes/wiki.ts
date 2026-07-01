import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as wikiService from '../services/api/wikiService.js';
import { ingestWikiSource, buildWikiSourceText, archiveWikiRawFile } from '../services/api/wikiIngestionService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { parseFile, isSupportedFile } from '../services/utils/fileParseService.js';
import * as settingsService from '../services/api/settingsService.js';
import { getWikiPath } from '../services/utils/pathSecurity.js';
import { createJob, updateJob, getJob } from '../services/utils/jobStore.js';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// 文件上传配置（内存存储，最大 50MB 给路由层兜底，业务层按 wikiMaxFileSize 限制）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/wiki/upload — 上传文件到 Wiki 知识库（异步：立即返回 jobId，后台处理）
router.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: '请上传文件' });
    return;
  }

  const settings = settingsService.getAiSettings();
  const wikiPath = getWikiPath();
  if (!wikiPath) {
    res.status(400).json({ error: 'Wiki 路径未配置' });
    return;
  }

  const { originalname, buffer, size } = req.file;

  // 文件类型校验
  if (!isSupportedFile(originalname)) {
    res.status(400).json({ error: `不支持的文件类型: ${originalname}，支持: HTML/TXT/MD/PDF` });
    return;
  }

  // 文件大小校验
  const maxSize = settings.wikiMaxFileSize;
  if (maxSize > 0 && size > maxSize) {
    const sizeMB = (size / 1048576).toFixed(1);
    const limitMB = (maxSize / 1048576).toFixed(1);
    res.status(400).json({ error: `文件大小 ${sizeMB}MB 超过限制 ${limitMB}MB` });
    return;
  }

  const archivedRelativePath = archiveWikiRawFile(wikiPath, originalname, buffer);

  // 创建后台作业
  const jobId = createJob(originalname, size);

  // 立即返回 jobId（不等待解析和编译）
  res.json({ jobId, sourceFile: archivedRelativePath, fileName: originalname, fileSize: size });

  // 后台异步处理：解析 → AI 编译
  processJob(jobId, archivedRelativePath, originalname, settings, wikiPath).catch(err => {
    console.error(`[wiki] background job ${jobId} failed:`, err);
    updateJob(jobId, { status: 'error', error: err.message, progress: 0, step: '处理失败' });
  });
}));

async function processJob(
  jobId: string,
  archivedRelativePath: string,
  originalName: string,
  settings: ReturnType<typeof settingsService.getAiSettings>,
  wikiPath: string,
): Promise<void> {
  // 1. 解析文件
  updateJob(jobId, { status: 'parsing', progress: 30, step: '解析文件中' });
  const archivePath = path.join(wikiPath, archivedRelativePath);
  const savedBuffer = fs.readFileSync(archivePath);
  const result = await parseFile({ name: originalName, content: savedBuffer, size: savedBuffer.length });

  const preview = result.text.length > 500 ? result.text.substring(0, 500) + '\n...' : result.text;

  // 2. AI 编译
  updateJob(jobId, { status: 'compiling', progress: 60, step: 'AI 编译中' });
  let compiledPages: { filename: string; title: string; size: number }[] = [];
  let compiledSourceFile = '';
  let compileError: string | undefined;

  try {
    const compiled = await ingestWikiSource(settings, wikiPath, {
      sourceText: buildWikiSourceText('', [{ kind: 'file', name: originalName, content: result.text }]),
      sourceTitle: originalName.replace(/\.[^.]+$/, ''),
      sourceFilenameHint: path.basename(archivedRelativePath),
      archivedFiles: [{ name: originalName, existingRelativePath: archivedRelativePath }],
    });
    compiledPages = compiled.pages;
    compiledSourceFile = compiled.sourceFile;
  } catch (err) {
    compileError = (err as Error).message;
  }

  // 3. 完成
  updateJob(jobId, {
    status: compileError ? 'error' : 'done',
    progress: 100,
    step: compileError ? '编译失败' : '完成',
    error: compileError,
    result: {
      sourceFile: compiledSourceFile || archivedRelativePath,
      format: result.format,
      textLength: result.text.length,
      pageCount: result.pageCount,
      preview,
      pages: compiledPages.length > 0 ? compiledPages : undefined,
    },
  });
}

// GET /api/wiki/jobs/:jobId — 查询作业状态（轮询用）
router.get('/jobs/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const job = getJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: '作业不存在或已过期' });
    return;
  }
  res.json({ job });
}));

// GET /api/wiki/list — 列出 Wiki 文件树（递归）
router.get('/list', asyncHandler(async (_req: Request, res: Response) => {
  const result = wikiService.listWiki();
  res.json(result);
}));

// GET /api/wiki/read?path=xxx — 读取 Wiki 文件内容
router.get('/read', asyncHandler(async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const result = wikiService.readWiki(filePath);
  res.json(result);
}));

export default router;
