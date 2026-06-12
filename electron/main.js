const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('./logger');

let mainWindow = null;

const isDev = !app.isPackaged;

// ── 尽早初始化日志（在 app ready 之前就准备好日志路径） ──

function getLogDir() {
  try {
    return path.join(app.getPath('userData'), 'logs');
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
  return path.join(app.getPath('userData'), 'data.db');
}

// ── 加密密钥管理（首次启动自动生成，持久化到 userData/.env） ──

function getEnvFilePath() {
  return path.join(app.getPath('userData'), '.env');
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

  const serverModulePath = path.join(__dirname, 'server-dist', 'index.js');
  if (!fs.existsSync(serverModulePath)) {
    throw new Error(`Server module not found: ${serverModulePath}`);
  }

  const serverModule = await import(serverModulePath);
  const actualPort = await serverModule.startServer();
  logger.info(`Server started on port ${actualPort}`);
  return actualPort;
}

// ── IPC Handlers：直调服务层（绕过 HTTP） ──

let services = {};

async function loadServiceModules() {
  const servicesDir = isDev
    ? path.join(__dirname, '..', 'server', 'dist', 'services')
    : path.join(__dirname, 'server-dist', 'services');

  if (!fs.existsSync(servicesDir)) {
    logger.warn(`Services directory not found: ${servicesDir} — IPC disabled`);
    return false;
  }

  logger.info(`Loading service modules from: ${servicesDir}`);

  const importService = async (name) => {
    const p = path.join(servicesDir, `${name}.js`);
    if (!fs.existsSync(p)) return null;
    return import(`file://${p}`);
  };

  const repoDir = isDev
    ? path.join(__dirname, '..', 'server', 'dist', 'repositories')
    : path.join(__dirname, 'server-dist', 'repositories');

  const importRepo = async (name) => {
    const p = path.join(repoDir, `${name}.js`);
    if (!fs.existsSync(p)) return null;
    return import(`file://${p}`);
  };

  const [
    msgSvc,
    convSvc,
    settSvc,
    agentSvc,
    epSvc,
    memSvc,
    sinkMod,
    mcpRepo,
    mcpSvc,
  ] = await Promise.all([
    importService('messageService'),
    importService('conversationService'),
    importService('settingsService'),
    importService('agentService'),
    importService('endpointService'),
    importService('memoryService'),
    importService('sink'),
    importRepo('mcpServerRepository'),
    importService('mcpService'),
  ]);

  services = { msgSvc, convSvc, settSvc, agentSvc, epSvc, memSvc, sinkMod, mcpRepo, mcpSvc };
  logger.info('Service modules loaded');
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

  // ── 会话 CRUD（匹配路由层包装格式）──
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
    const repoDir = isDev
      ? path.join(__dirname, '..', 'server', 'dist', 'repositories')
      : path.join(__dirname, 'server-dist', 'repositories');
    const msgRepo = await import(`file://${path.join(repoDir, 'messageRepository.js')}`);
    const messages = msgRepo.findByConversationId(id);
    const firstUser = messages.find((m) => m.role === 'user');
    const firstAssistant = messages.find((m) => m.role === 'assistant');
    if (!firstUser || !firstAssistant) return { title: '' };
    const settings = services.settSvc.getAiSettings();
    const aiDir = isDev
      ? path.join(__dirname, '..', 'server', 'dist', 'services')
      : path.join(__dirname, 'server-dist', 'services');
    const aiMod = await import(`file://${path.join(aiDir, 'aiProxy.js')}`);
    const title = await aiMod.generateTitle(settings, firstUser.content, firstAssistant.content);
    if (title) services.convSvc.rename(id, title);
    return { title };
  });

  // ── 消息 ──
  ipcMain.handle('messages:list', (_, convId) => {
    if (!services.msgSvc) throw new Error('Services not loaded');
    return { messages: services.msgSvc.getMessages(convId) };
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

  // ── 端点（endpointService.list 已返回 { endpoints: [...] }）──
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

  // ── 记忆（记忆路由直接返回数组/对象，不额外包装）──
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
    services.memSvc.removeMemory(id);
    return { success: true };
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

  logger.info('IPC handlers registered');
}

// ── 窗口管理 ──

function createWindow() {
  logger.info('Creating main window...');

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'client-dist', 'index.html')}`;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Mint · 叶语',
    icon: path.join(__dirname, 'icon.png'),
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Page load failed: ${errorDescription} (code: ${errorCode}) URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('did-finish-load', () => logger.info('Page loaded successfully'));

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) logger.debug(`[renderer] ${message}`);
  });

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 应用生命周期 ──

app.whenReady().then(async () => {
  const logDir = getLogDir();
  const logFile = logger.init(logDir);
  setupGlobalErrorHandlers();
  logger.info(`Log file: ${logFile}`);

  // 设置环境变量（在导入服务之前）
  loadOrCreateEncryptionKey();
  process.env.AI_CHAT_DB_PATH = getDbPath();

  // 加载服务模块并注册 IPC handlers
  const servicesLoaded = await loadServiceModules();
  if (servicesLoaded) setupIpcHandlers();

  try {
    await startServer();
    createWindow();
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

app.on('activate', () => { if (mainWindow === null) createWindow(); });
app.on('will-quit', () => { logger.close(); });
