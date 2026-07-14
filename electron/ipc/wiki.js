const fs = require('fs');
const path = require('path');

/**
 * 注册 Wiki 上传与后台作业 IPC handlers。
 *
 * @param {object} dependencies Electron 与服务依赖
 */
function registerWikiHandlers({ ipcMain, services, logger }) {
  ipcMain.handle('wiki:upload', async (_, { name, size, buffer }) => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    const fileBuffer = Buffer.from(buffer);

    const settings = services.settSvc.get();
    const wikiPath = settings.wikiPath;
    if (!wikiPath) throw new Error('Wiki 路径未配置');

    const sourcesDir = path.join(wikiPath, 'sources');
    if (!fs.existsSync(sourcesDir)) fs.mkdirSync(sourcesDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const slug = name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, '-')
      .replace(/^-|-$/g, '');
    const ext = path.extname(name).toLowerCase();
    const archiveName = `${date}-${slug}${ext}`;
    const archivePath = path.join(sourcesDir, archiveName);
    fs.writeFileSync(archivePath, fileBuffer);
    logger.info(`wiki:upload saved ${archiveName} (${fileBuffer.length} bytes)`);

    const { v4: uuidv4 } = await import('uuid');
    const jobId = uuidv4();
    const sourceFile = `sources/${archiveName}`;
    if (!global.__wikiJobs) global.__wikiJobs = new Map();

    const job = {
      id: jobId,
      status: 'pending',
      fileName: name,
      fileSize: size || fileBuffer.length,
      progress: 0,
      step: '等待中',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    global.__wikiJobs.set(jobId, job);

    processElectronWikiJob(jobId, archivePath, name, archiveName, {
      services,
      logger,
    }).catch((err) => {
      logger.error(`wiki job ${jobId} failed: ${err.message}`);
      const currentJob = global.__wikiJobs.get(jobId);
      if (currentJob) {
        Object.assign(currentJob, {
          status: 'error',
          error: err.message,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    return { jobId, sourceFile, fileName: name, fileSize: size || fileBuffer.length };
  });

  ipcMain.handle('wiki:getJobStatus', (_, jobId) => {
    const jobs = global.__wikiJobs;
    if (!jobs) throw new Error('No jobs');
    const job = jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    return job;
  });
}

/**
 * 执行 Wiki 文件解析与编译后台作业。
 *
 * @param {string} jobId 作业 ID
 * @param {string} archivePath 原始文件路径
 * @param {string} name 原始文件名
 * @param {string} archiveName 归档文件名
 * @param {object} dependencies 服务依赖
 */
async function processElectronWikiJob(jobId, archivePath, name, archiveName, { services, logger }) {
  const jobs = global.__wikiJobs;
  const update = (updates) => {
    const job = jobs.get(jobId);
    if (job) Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  };
  const log = (message) => logger.info(`[wiki:job:${jobId}] ${message}`);

  const settings = services.settSvc.get();
  const wikiPath = settings.wikiPath;
  if (!wikiPath) {
    update({ status: 'error', error: 'Wiki 路径未配置' });
    return;
  }
  log(`start, archivePath=${archivePath}`);

  update({ status: 'parsing', progress: 30, step: '解析文件中' });
  const savedContent = fs.readFileSync(archivePath);
  log(`file size=${savedContent.length}`);
  const result = await services.fileParseService.parseFile({
    name,
    content: savedContent,
    size: savedContent.length,
  });
  log(`parse done, format=${result.format} textLength=${result.text.length}`);
  const preview = result.text.length > 500 ? `${result.text.substring(0, 500)}\n...` : result.text;

  update({ status: 'compiling', progress: 60, step: 'AI 编译中' });
  let compiledPages = [];
  let compileError;
  try {
    const ingestMod = services.wikiCompiler;
    const aiSettings = services.settSvc.getAiSettings();
    log(`ingestWikiSource start, apiUrl=${aiSettings.apiUrl}, model=${aiSettings.modelId}`);
    const compiled = await ingestMod.ingestWikiSource(aiSettings, wikiPath, {
      sourceText: ingestMod.buildWikiSourceText('', [{ kind: 'file', name, content: result.text }]),
      sourceTitle: name.replace(/\.[^.]+$/, ''),
      sourceFilenameHint: archiveName,
      archivedFiles: [{ name, existingRelativePath: `sources/${archiveName}` }],
    });
    compiledPages = compiled.pages;
    log(`ingestWikiSource done, pages=${compiled.pages.length}`);
    if (compiled.graphErrors && compiled.graphErrors.length > 0) {
      log(`ingestWikiSource graph warnings: ${compiled.graphErrors.join('; ')}`);
    }
  } catch (err) {
    compileError = err.message;
    log(`ingestWikiSource ERROR: ${err.message}`);
    log(`ingestWikiSource stack: ${err.stack ? err.stack.substring(0, 500) : 'no stack'}`);
  }

  update({
    status: compileError ? 'error' : 'done',
    progress: 100,
    step: compileError ? '编译失败' : '完成',
    error: compileError,
    result: {
      sourceFile: `sources/${archiveName}`,
      format: result.format,
      textLength: result.text.length,
      pageCount: result.pageCount,
      preview,
      pages: compiledPages.length > 0 ? compiledPages : undefined,
    },
  });
}

module.exports = {
  registerWikiHandlers,
  processElectronWikiJob,
};
