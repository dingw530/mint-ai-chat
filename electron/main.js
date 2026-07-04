const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const logger = require('./logger');

let mainWindow = null;
let serverBundlePromise = null;
let electronServiceBootstrapPromise = null;

const isDev = !app.isPackaged;

// ── 尽早初始化日志（在 app ready 之前就准备好日志路径） ──

const MINT_DIR = path.join(os.homedir(), '.mint');

function getLogDir() {
  try {
    return path.join(MINT_DIR, 'logs');
  } catch {
    return path.join(__dirname, 'logs');
  }
}

// ── 全局错误捕获（在日志初始化后注册） ──

function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error(`UNCAUGHT EXCEPTION: ${err.message}`);
    logger.error(`Stack: ${err.stack}`);
    logger.close();
    app.quit();
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`UNHANDLED REJECTION: ${reason}`);
    if (reason && reason.stack) {
      logger.error(`Stack: ${reason.stack}`);
    }
  });

  app.on('render-process-gone', (event, webContents, details) => {
    logger.error(`RENDER PROCESS GONE: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  app.on('child-process-gone', (event, details) => {
    logger.error(`CHILD PROCESS GONE: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`);
  });
}

// ── 路径辅助 ──

function getClientDistPath() {
  return path.join(__dirname, 'client-dist');
}

function getDbPath() {
  return path.join(MINT_DIR, 'data.db');
}

// ── 加密密钥管理（首次启动自动生成，持久化到 .mint/.env） ──

function getEnvFilePath() {
  return path.join(MINT_DIR, '.env');
}

function loadOrCreateEncryptionKey() {
  const envPath = getEnvFilePath();

  if (process.env.AI_CHAT_ENCRYPTION_KEY) {
    logger.info('AI_CHAT_ENCRYPTION_KEY loaded from system environment');
    return;
  }

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^AI_CHAT_ENCRYPTION_KEY=(.+)$/m);
    if (match) {
      process.env.AI_CHAT_ENCRYPTION_KEY = match[1].trim();
      logger.info('AI_CHAT_ENCRYPTION_KEY loaded from .env file');
      return;
    }
  }

  const key = crypto.randomBytes(32).toString('hex');
  logger.info('Generated new encryption key');
  fs.writeFileSync(envPath, `AI_CHAT_ENCRYPTION_KEY=${key}\n`, 'utf-8');
  logger.info(`Encryption key saved to: ${envPath}`);
  process.env.AI_CHAT_ENCRYPTION_KEY = key;
}

// ── Server 生命周期（in-process：导入 ESM 模块启动 Express） ──

async function startServer() {
  logger.info('Starting server setup...');

  if (isDev) {
    logger.info('Dev mode — assuming external server on port 3001');
    return 3001;
  }

  loadOrCreateEncryptionKey();
  process.env.AI_CHAT_DB_PATH = getDbPath();
  process.env.AI_CHAT_CLIENT_DIST = getClientDistPath();
  process.env.NODE_ENV = 'production';

  const bundle = await getServerBundle();
  const actualPort = await bundle.startServer();
  logger.info(`Server started on port ${actualPort}`);
  return actualPort;
}

// ── IPC Handlers：直调服务层（绕过 HTTP） ──

let services = {};

async function getServerBundle() {
  if (serverBundlePromise) return serverBundlePromise;

  const bundlePath = isDev
    ? path.join(__dirname, '..', 'server', 'dist', 'electron-bundle.js')
    : path.join(__dirname, 'server-dist', 'index.js');

  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Server bundle not found: ${bundlePath}`);
  }

  logger.info(`Loading server bundle: ${bundlePath}`);

  serverBundlePromise = import(`file://${bundlePath}`).catch((err) => {
    serverBundlePromise = null;
    throw err;
  });

  return serverBundlePromise;
}

async function loadElectronServiceBootstrap() {
  if (electronServiceBootstrapPromise) return electronServiceBootstrapPromise;

  const bootstrapPath = isDev
    ? path.join(__dirname, 'services', 'bootstrap.js')
    : path.join(__dirname, 'services', 'bootstrap.js');

  if (!fs.existsSync(bootstrapPath)) {
    throw new Error(`Electron service bootstrap not found: ${bootstrapPath}`);
  }

  electronServiceBootstrapPromise = import(`file://${bootstrapPath}`).catch((err) => {
    electronServiceBootstrapPromise = null;
    throw err;
  });

  return electronServiceBootstrapPromise;
}

async function loadServiceModules() {
  let bundle;
  try {
    bundle = await getServerBundle();
  } catch (err) {
    logger.error(`Failed to load server bundle: ${err.message}`);
    return false;
  }

  services = {
    msgSvc: bundle.messageService,
    convSvc: bundle.conversationService,
    settSvc: bundle.settingsService,
    agentSvc: bundle.agentService,
    epSvc: bundle.endpointService,
    memSvc: bundle.memoryService,
    sinkMod: bundle,
    mcpRepo: bundle.mcpServerRepository,
    mcpSvc: { mcpService: bundle.mcpService },
    skillSvc: bundle.skillService,
    bashSecurity: bundle.bashSecurityService,
    wikiSvc: bundle.wikiService,
    // For generateTitle / parseFile / compileSource
    aiProxy: bundle,
    fileParseService: bundle,
    wikiCompiler: bundle,
    messageRepository: bundle.messageRepository,
  };
  logger.info('Service modules loaded');

  try {
    const bootstrap = await loadElectronServiceBootstrap();
    if (bootstrap?.registerElectronServices) {
      bootstrap.registerElectronServices(bundle);
      logger.info('Electron service bootstrap registered');
    }
  } catch (err) {
    logger.warn(`Electron service bootstrap skipped: ${err.message}`);
  }

  // 启动时扫描技能
  if (services.skillSvc) {
    services.skillSvc.listSkills().catch(err => logger.error('Skill scan failed: ' + err.message));
  }

  return true;
}

function setupIpcHandlers() {
  // ── 流式对话 ──
  ipcMain.handle('chat:send', async (event, convId, content, agent, regenerate) => {
    if (!services.msgSvc) { event.sender.send('chat:error', 'Services not loaded'); return; }
    const IpcSink = services.sinkMod.IpcSink;
    const sink = new IpcSink(event);
    try {
      await services.msgSvc.sendMessage(convId, content, sink, agent, regenerate);
    } catch (err) {
      logger.error(`chat:send error: ${err.message}`);
      if (!sink.writableEnded) event.sender.send('chat:error', err.message);
    }
  });

  // ── 会话 CRUD ──
  ipcMain.handle('conversations:list', (_, type) => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return { conversations: services.convSvc.list(type) };
  });
  ipcMain.handle('conversations:create', (_, title, type) => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return { conversation: services.convSvc.create({ title, type }) };
  });
  ipcMain.handle('conversations:delete', (_, id) => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return services.convSvc.remove(id);
  });
  ipcMain.handle('conversations:clearAll', () => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return services.convSvc.removeAll();
  });
  ipcMain.handle('conversations:rename', (_, id, title) => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return { conversation: services.convSvc.rename(id, title) };
  });
  ipcMain.handle('conversations:lockAgent', (_, id, agentId) => {
    if (!services.convSvc) throw new Error('Services not loaded');
    return { conversation: services.convSvc.setLockedAgent(id, agentId) };
  });
  ipcMain.handle('conversations:generateTitle', async (_, id) => {
    if (!services.convSvc || !services.settSvc) return { title: '' };
    const messages = services.messageRepository.findByConversationId(id);
    const firstUser = messages.find((m) => m.role === 'user');
    const firstAssistant = messages.find((m) => m.role === 'assistant');
    if (!firstUser || !firstAssistant) return { title: '' };
    const settings = services.settSvc.getAiSettings();
    const title = await services.aiProxy.generateTitle(settings, firstUser.content, firstAssistant.content);
    if (title) services.convSvc.rename(id, title);
    return { title };
  });

  // ── 设置 ──
  ipcMain.handle('settings:get', () => {
    if (!services.settSvc) throw new Error('Services not loaded');
    return services.settSvc.get();
  });
  ipcMain.handle('settings:save', (_, data) => {
    if (!services.settSvc) throw new Error('Services not loaded');
    services.settSvc.save(data);
    return { success: true };
  });

  // ── Agent ──
  ipcMain.handle('agents:list', () => {
    if (!services.agentSvc) throw new Error('Services not loaded');
    return { agents: services.agentSvc.list() };
  });
  ipcMain.handle('agents:create', (_, data) => {
    if (!services.agentSvc) throw new Error('Services not loaded');
    return { agent: services.agentSvc.create(data) };
  });
  ipcMain.handle('agents:update', (_, id, data) => {
    if (!services.agentSvc) throw new Error('Services not loaded');
    return { agent: services.agentSvc.update(id, data) };
  });
  ipcMain.handle('agents:delete', (_, id) => {
    if (!services.agentSvc) throw new Error('Services not loaded');
    services.agentSvc.remove(id);
    return { success: true };
  });

  // ── 端点 ──
  ipcMain.handle('endpoints:list', () => {
    if (!services.epSvc) throw new Error('Services not loaded');
    return services.epSvc.list();
  });
  ipcMain.handle('endpoints:create', (_, data) => {
    if (!services.epSvc) throw new Error('Services not loaded');
    return { endpoint: services.epSvc.create(data) };
  });
  ipcMain.handle('endpoints:update', (_, id, data) => {
    if (!services.epSvc) throw new Error('Services not loaded');
    return { endpoint: services.epSvc.updateEndpoint(id, data) };
  });
  ipcMain.handle('endpoints:delete', (_, id) => {
    if (!services.epSvc) throw new Error('Services not loaded');
    services.epSvc.remove(id);
    return { success: true };
  });
  ipcMain.handle('endpoints:activate', (_, id) => {
    if (!services.epSvc) throw new Error('Services not loaded');
    services.epSvc.activate(id);
    return { success: true };
  });

  // ── 记忆 ──
  ipcMain.handle('memories:list', (_, category) => {
    if (!services.memSvc) throw new Error('Services not loaded');
    return services.memSvc.listMemories(category);
  });
  ipcMain.handle('memories:create', (_, data) => {
    if (!services.memSvc) throw new Error('Services not loaded');
    return services.memSvc.createMemory(data);
  });
  ipcMain.handle('memories:update', (_, id, data) => {
    if (!services.memSvc) throw new Error('Services not loaded');
    return services.memSvc.updateMemory(id, data);
  });
  ipcMain.handle('memories:delete', (_, id) => {
    if (!services.memSvc) throw new Error('Services not loaded');
    services.memSvc.deleteMemory(id);
    return { success: true };
  });

  // ── 消息 ──
  ipcMain.handle('messages:list', (_, convId) => {
    if (!services.msgSvc) throw new Error('Services not loaded');
    return { messages: services.msgSvc.getMessages(convId) };
  });

  // ── MCP Server（mcpService 是命名导出实例，需 .mcpService.xxx）──
  const mcp = () => services.mcpSvc?.mcpService;

  ipcMain.handle('mcp-servers:list', () => {
    if (!services.mcpRepo || !mcp()) throw new Error('Services not loaded');
    const servers = services.mcpRepo.findAll();
    return {
      servers: servers.map((s) => ({
        ...s,
        tools: mcp().getServerTools(s.name) || [],
      })),
    };
  });

  ipcMain.handle('mcp-servers:get', (_, id) => {
    if (!services.mcpRepo) throw new Error('Services not loaded');
    const server = services.mcpRepo.findById(id);
    if (!server) throw new Error('MCP Server not found');
    return { server };
  });

  ipcMain.handle('mcp-servers:create', async (_, data) => {
    if (!services.mcpRepo || !mcp()) throw new Error('Services not loaded');
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const server = services.mcpRepo.create({
      id, name: data.name, command: data.command,
      args: data.args || [], env: data.env || {},
    });
    try { await mcp().connectServer(server); } catch {}
    return { server };
  });

  ipcMain.handle('mcp-servers:update', async (_, id, data) => {
    if (!services.mcpRepo || !mcp()) throw new Error('Services not loaded');
    const existing = services.mcpRepo.findById(id);
    if (!existing) throw new Error('MCP Server not found');
    await mcp().disconnectServer(existing.name);
    const updated = services.mcpRepo.update(id, data);
    if (!updated) throw new Error('MCP Server not found');
    try { await mcp().connectServer(updated); } catch {}
    return { server: updated };
  });

  ipcMain.handle('mcp-servers:delete', async (_, id) => {
    if (!services.mcpRepo || !mcp()) throw new Error('Services not loaded');
    const server = services.mcpRepo.findById(id);
    if (!server) throw new Error('MCP Server not found');
    await mcp().disconnectServer(server.name);
    services.mcpRepo.deleteById(id);
    return { success: true };
  });

  ipcMain.handle('mcp-servers:restart', async (_, id) => {
    if (!services.mcpRepo || !mcp()) throw new Error('Services not loaded');
    const server = services.mcpRepo.findById(id);
    if (!server) throw new Error('MCP Server not found');
    await mcp().restartServer(server.name);
    const updated = services.mcpRepo.findById(id);
    return { server: updated };
  });

  // ── 下载文件 ──
  ipcMain.handle('download-file', async (event, { url, filename }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || 'image.png',
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) return { success: false, reason: 'cancelled' };

    try {
      let fileData;
      if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        const base64Data = url.slice(commaIdx + 1);
        fileData = Buffer.from(base64Data, 'base64');
      } else {
        const urlObj = new URL(url);
        const httpMod = urlObj.protocol === 'https:' ? require('https') : require('http');
        fileData = await new Promise((resolve, reject) => {
          httpMod.get(url, (response) => {
            if (response.statusCode !== 200) { reject(new Error(`HTTP ${response.statusCode}`)); return; }
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', reject);
        });
      }
      fs.writeFileSync(result.filePath, fileData);
      return { success: true, filePath: result.filePath };
    } catch (err) {
      logger.error(`Download failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  });

  // ── 技能 ──
  ipcMain.handle('skills:list', async () => {
    try {
      if (!services.skillSvc) throw new Error('Skill service not loaded');
      const skills = await services.skillSvc.listSkills();
      return { skills: skills.map(s => ({ name: s.name, description: s.description })) };
    } catch (err) {
      logger.error(`skills:list failed: ${err.message}`);
      return { skills: [] };
    }
  });

  // ── Bash 安全 ──
  ipcMain.handle('bash-security:get', () => {
    try {
      if (!services.bashSecurity) throw new Error('Bash security service not loaded');
      return services.bashSecurity.getBashSecurity();
    } catch (err) {
      logger.error(`bash-security:get failed: ${err.message}`);
      return { blockedCommands: [], blockedDirs: [] };
    }
  });

  ipcMain.handle('bash-security:update', (_, data) => {
    try {
      if (!services.bashSecurity) throw new Error('Bash security service not loaded');
      services.bashSecurity.updateBashSecurity(data);
      return { success: true };
    } catch (err) {
      logger.error(`bash-security:update failed: ${err.message}`);
      return { success: false };
    }
  });

  // ── Wiki ──
  ipcMain.handle('wiki:list', () => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    return services.wikiSvc.listWiki();
  });
  ipcMain.handle('wiki:read', (_, filePath) => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    return services.wikiSvc.readWiki(filePath);
  });
  ipcMain.handle('wiki:upload', async (_, { name, size, buffer }) => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    const fileBuffer = Buffer.from(buffer);

    // 存档原始文件
    const settings = services.settSvc.get();
    const wikiPath = settings.wikiPath;
    if (!wikiPath) throw new Error('Wiki 路径未配置');
    const sourcesDir = path.join(wikiPath, 'sources');
    if (!fs.existsSync(sourcesDir)) fs.mkdirSync(sourcesDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const slug = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
    const ext = path.extname(name).toLowerCase();
    const archiveName = `${date}-${slug}${ext}`;
    const archivePath = path.join(sourcesDir, archiveName);
    fs.writeFileSync(archivePath, fileBuffer);
    logger.info(`wiki:upload saved ${archiveName} (${fileBuffer.length} bytes)`);

    // 创建后台作业
    const { v4: uuidv4 } = await import('uuid');
    const jobId = uuidv4();
    const sourceFile = `sources/${archiveName}`;
    if (!global.__wikiJobs) global.__wikiJobs = new Map();

    const job = {
      id: jobId, status: 'pending', fileName: name, fileSize: size || fileBuffer.length,
      progress: 0, step: '等待中',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    global.__wikiJobs.set(jobId, job);

    // 后台处理：解析 → AI 编译
    processElectronWikiJob(jobId, archivePath, name, archiveName).catch(err => {
      logger.error(`wiki job ${jobId} failed: ${err.message}`);
      const j = global.__wikiJobs.get(jobId);
      if (j) Object.assign(j, { status: 'error', error: err.message, updatedAt: new Date().toISOString() });
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

  ipcMain.handle('wiki:schema', () => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    return services.wikiSvc.getSchema();
  });
  ipcMain.handle('wiki:addCategory', (_, category) => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    return services.wikiSvc.addCategory(category);
  });
  ipcMain.handle('wiki:removeCategory', (_, category) => {
    if (!services.wikiSvc) throw new Error('Services not loaded');
    return services.wikiSvc.removeCategory(category);
  });  logger.info('IPC handlers registered');
}

// ── Wiki 后台作业处理 ──

async function processElectronWikiJob(jobId, archivePath, name, archiveName) {
  const jobs = global.__wikiJobs;
  const update = (updates) => {
    const j = jobs.get(jobId);
    if (j) Object.assign(j, updates, { updatedAt: new Date().toISOString() });
  };
  const log = (msg) => logger.info(`[wiki:job:${jobId}] ${msg}`);

  const settings = services.settSvc.get();
  const wikiPath = settings.wikiPath;
  if (!wikiPath) { update({ status: 'error', error: 'Wiki 路径未配置' }); return; }
  log(`start, archivePath=${archivePath}`);

  // 1. 解析文件
  update({ status: 'parsing', progress: 30, step: '解析文件中' });
  const parseMod = services.fileParseService;
  const savedContent = fs.readFileSync(archivePath);
  log(`file size=${savedContent.length}`);
  const result = await parseMod.parseFile({ name, content: savedContent, size: savedContent.length });
  log(`parse done, format=${result.format} textLength=${result.text.length}`);
  const preview = result.text.length > 500 ? result.text.substring(0, 500) + '\n...' : result.text;

  // 2. AI 编译
  update({ status: 'compiling', progress: 60, step: 'AI 编译中' });
  let compiledPages = [];
  let compileError;
  try {
    const compileMod = services.wikiCompiler;
    const aiSettings = services.settSvc.getAiSettings();
    log(`compileSource start, apiUrl=${aiSettings.apiUrl}, model=${aiSettings.modelId}, apiKey=${aiSettings.apiKey ? 'set(' + aiSettings.apiKey.substring(0, 8) + '...)' : 'NOT SET'}`);
    const compiled = await compileMod.compileSource(aiSettings, wikiPath, result.text, archiveName, {
      title: name.replace(/\.[^.]+$/, ''),
    });
    compiledPages = compiled.pages;
    log(`compileSource done, pages=${compiled.pages.length}`);
  } catch (err) {
    compileError = err.message;
    log(`compileSource ERROR: ${err.message}`);
    log(`compileSource stack: ${err.stack ? err.stack.substring(0, 500) : 'no stack'}`);
  }

  // 3. 完成
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

// ── 窗口管理 ──

function createWindow(port) {
  logger.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Mint',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#f1f5f3',
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'client-dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:|^tel:/i.test(url)) {
      shell.openExternal(url).catch((err) => {
        logger.error(`Failed to open external URL: ${url} (${err.message})`);
      });
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Page load failed: ${errorDescription} (code: ${errorCode}) URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('did-finish-load', () => logger.info('Page loaded successfully'));

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) logger.debug(`[renderer] ${message}`);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function loadClientApp() {
  if (!mainWindow) return;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'client-dist', 'index.html'));
  }
}

// ── 旧 userData 迁移（~/.mint 不存在时从 userData 拷贝）──

function migrateFromOldUserData() {
  // 此时 logger 尚未初始化，用 console.log
  try {
    const oldDir = app.getPath('userData');
    console.log(`[migrate] oldDir=${oldDir}, MINT_DIR=${MINT_DIR}`);

    if (oldDir === MINT_DIR) { console.log('[migrate] same path, skip'); return; }
    if (!fs.existsSync(oldDir)) { console.log('[migrate] oldDir not found, skip'); return; }
    if (fs.existsSync(path.join(MINT_DIR, 'data.db')) || fs.existsSync(path.join(MINT_DIR, '.env'))) {
      console.log('[migrate] .mint already has data, skip');
      return;
    }

    const items = fs.readdirSync(oldDir).filter(f => f !== 'logs');
    console.log(`[migrate] items to migrate: ${items.length} — ${items.join(', ') || '(none)'}`);
    if (items.length === 0) return;

    // 只搬核心数据文件，跳过 Cache / Session Storage 等 Electron 运行时目录
    const coreFiles = items.filter(f => f === 'data.db' || f === '.env');
    if (coreFiles.length === 0) { console.log('[migrate] no core files to migrate'); return; }

    fs.mkdirSync(MINT_DIR, { recursive: true });

    for (const item of coreFiles) {
      const src = path.join(oldDir, item);
      const dst = path.join(MINT_DIR, item);
      fs.cpSync(src, dst, { recursive: true });
      console.log(`[migrate] copied: ${src} → ${dst}`);
    }

    console.log(`[migrate] done: ${oldDir} → ${MINT_DIR}`);
  } catch (err) {
    console.error(`[migrate] FAILED: ${err.message}`);
  }
}

// ── 应用生命周期 ──

app.whenReady().then(async () => {
  // 迁移旧数据（必须在 logger.init 之前，避免 .mint 被创建后干扰判断）
  migrateFromOldUserData();

  const logDir = getLogDir();
  const logFile = logger.init(logDir);
  setupGlobalErrorHandlers();
  logger.info(`Log file: ${logFile}`);

  // 设置环境变量（在导入服务之前）
  loadOrCreateEncryptionKey();
  process.env.AI_CHAT_DB_PATH = getDbPath();

  try {
    createWindow();


    // 加载服务模块并启动 server
    const [servicesLoaded] = await Promise.all([
      loadServiceModules(),
      startServer(),
    ]);

    if (servicesLoaded) {
      setupIpcHandlers();
    }

    loadClientApp();
  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    const { dialog } = require('electron');
    dialog.showErrorBox('应用启动失败', `${err.message}\n\n详细日志：${logFile}`);
    logger.close();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { logger.close(); app.quit(); }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
    loadClientApp();
  }
});
app.on('will-quit', () => {
  logger.close();
});
