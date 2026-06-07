const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('./logger');

let mainWindow = null;

const isDev = !app.isPackaged;

// ── 尽早初始化日志（在 app ready 之前就准备好日志路径） ──

function getLogDir() {
  // 必须在 app ready 之后才能用 app.getPath，但 getPath('userData') 需要 ready
  // 如果用不了就用 __dirname 下建 logs/
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

  // 1. 优先从系统环境变量读取
  if (process.env.AI_CHAT_ENCRYPTION_KEY) {
    logger.info('AI_CHAT_ENCRYPTION_KEY loaded from system environment');
    return;
  }

  // 2. 尝试从 userData/.env 文件读取
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^AI_CHAT_ENCRYPTION_KEY=(.+)$/m);
    if (match) {
      process.env.AI_CHAT_ENCRYPTION_KEY = match[1].trim();
      logger.info('AI_CHAT_ENCRYPTION_KEY loaded from .env file');
      return;
    }
  }

  // 3. 都不存在，自动生成新密钥并持久化
  const key = crypto.randomBytes(32).toString('hex');
  logger.info('Generated new encryption key');
  fs.writeFileSync(envPath, `AI_CHAT_ENCRYPTION_KEY=${key}\n`, 'utf-8');
  logger.info(`Encryption key saved to: ${envPath}`);
  process.env.AI_CHAT_ENCRYPTION_KEY = key;
}

// ── Server 生命周期（in-process：动态导入 ESM 模块） ──

async function startServer() {
  logger.info('Starting server setup...');
  logger.info(`isDev: ${isDev}`);

  if (isDev) {
    logger.info('Dev mode — assuming external server on port 3001');
    return;
  }

  // 设置环境变量（在导入 server 之前）
  loadOrCreateEncryptionKey();
  process.env.AI_CHAT_DB_PATH = getDbPath();
  process.env.AI_CHAT_CLIENT_DIST = getClientDistPath();
  process.env.NODE_ENV = 'production';
  process.env.PORT = process.env.PORT || '3001';

  logger.info(`AI_CHAT_DB_PATH: ${process.env.AI_CHAT_DB_PATH}`);
  logger.info(`AI_CHAT_CLIENT_DIST: ${process.env.AI_CHAT_CLIENT_DIST}`);
  logger.info(`PORT: ${process.env.PORT}`);
  logger.info('AI_CHAT_ENCRYPTION_KEY is set ✓');

  // ── 和风天气（QWeather）配置诊断 ──
  const qwProjectId = process.env.QWEATHER_PROJECT_ID;
  const qwKeyId = process.env.QWEATHER_KEY_ID;
  const qwPrivateKey = process.env.QWEATHER_PRIVATE_KEY;
  const qwConfigured = !!(qwProjectId && qwKeyId && qwPrivateKey);
  logger.info(`QWeather PROJECT_ID: ${qwProjectId ? '已设置' : '未设置'}`);
  logger.info(`QWeather KEY_ID: ${qwKeyId ? '已设置' : '未设置'}`);
  logger.info(`QWeather PRIVATE_KEY: ${qwPrivateKey ? `已设置 (长度 ${qwPrivateKey.length})` : '未设置'}`);
  if (qwConfigured) {
    logger.info('和风天气功能: 已启用');
  } else {
    const missing = [];
    if (!qwProjectId) missing.push('QWEATHER_PROJECT_ID');
    if (!qwKeyId) missing.push('QWEATHER_KEY_ID');
    if (!qwPrivateKey) missing.push('QWEATHER_PRIVATE_KEY');
    logger.warn(`和风天气功能: 已禁用（缺少环境变量 ${missing.join(', ')}）`);
  }

  // 动态导入编译后的 server 模块
  const serverModulePath = path.join(__dirname, 'server-dist', 'index.js');
  logger.info(`Loading server module from: ${serverModulePath}`);

  if (!fs.existsSync(serverModulePath)) {
    logger.error(`Server module not found at: ${serverModulePath}`);
    throw new Error(`Server module not found: ${serverModulePath}`);
  }

  try {
    logger.info('Importing server module...');
    await import(serverModulePath);
    logger.info(`Server started successfully on port ${process.env.PORT || 3001}`);
  } catch (err) {
    logger.error(`Failed to import server module: ${err.message}`);
    logger.error(`Stack: ${err.stack}`);
    // 记录 server-dist 目录内容帮助排查
    const distDir = path.join(__dirname, 'server-dist');
    if (fs.existsSync(distDir)) {
      logger.info(`server-dist contents: ${fs.readdirSync(distDir).join(', ')}`);
    }
    throw err;
  }
}

// ── 窗口管理 ──

function createWindow() {
  logger.info('Creating main window...');

  const port = parseInt(process.env.PORT, 10) || 3001;
  const url = isDev ? 'http://localhost:5173' : `http://localhost:${port}`;
  logger.info(`Loading URL: ${url}`);

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

  // 监听页面加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Page load failed: ${errorDescription} (code: ${errorCode}) URL: ${validatedURL}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Page loaded successfully');
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // 渲染进程的 console 也记录到日志（仅记录 warn/error）
    if (level >= 2) {
      logger.debug(`[renderer] ${message}`);
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    logger.info('Main window closed');
    mainWindow = null;
  });

  logger.info('Main window created');
}

// ── IPC Handler：下载文件（绕过 CORS） ──

ipcMain.handle('download-file', async (event, { url, filename }) => {
  logger.info(`Download requested: ${url}`);

  // 弹出保存对话框
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename || 'image.png',
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    logger.info('Download cancelled by user');
    return { success: false, reason: 'cancelled' };
  }

  try {
    // 使用 Node.js 的 http/https 模块下载（无需 CORS）
    const urlObj = new URL(url);
    const httpMod = urlObj.protocol === 'https:' ? require('https') : require('http');

    const fileData = await new Promise((resolve, reject) => {
      httpMod.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });

    fs.writeFileSync(result.filePath, fileData);
    logger.info(`File saved to: ${result.filePath}`);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    logger.error(`Download failed: ${err.message}`);
    return { success: false, reason: err.message };
  }
});

// ── 应用生命周期 ──

app.whenReady().then(async () => {
  // app ready 后才能正确获取 userData 路径，重新初始化日志
  const logDir = getLogDir();
  const logFile = logger.init(logDir);

  setupGlobalErrorHandlers();

  logger.info(`Log file: ${logFile}`);

  try {
    await startServer();
    createWindow();
  } catch (err) {
    logger.error(`Failed to start application: ${err.message}`);
    logger.error(`Stack: ${err.stack}`);

    // 弹出一个错误对话框，让用户能看到错误
    const { dialog } = require('electron');
    dialog.showErrorBox(
      '应用启动失败',
      `${err.message}\n\n详细日志请查看：${logFile}`
    );

    logger.close();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    logger.info('Quitting app (non-macOS)');
    logger.close();
    app.quit();
  }
});

app.on('activate', () => {
  logger.info('App activated');
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  logger.info('App before-quit');
});

app.on('will-quit', () => {
  logger.info('App will-quit');
  logger.close();
});
