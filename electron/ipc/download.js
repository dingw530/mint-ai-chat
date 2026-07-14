const fs = require('fs');
const http = require('http');
const https = require('https');

/**
 * 注册文件下载 IPC handler。
 *
 * @param {object} dependencies Electron 与服务依赖
 */
function registerDownloadHandlers({ ipcMain, dialog, getMainWindow, logger }) {
  ipcMain.handle('download-file', async (_, { url, filename }) => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: filename || 'image.png',
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) return { success: false, reason: 'cancelled' };

    try {
      const fileData = await readFileData(url);
      fs.writeFileSync(result.filePath, fileData);
      return { success: true, filePath: result.filePath };
    } catch (err) {
      logger.error(`Download failed: ${err.message}`);
      return { success: false, reason: err.message };
    }
  });
}

/**
 * 读取 data URL 或 HTTP(S) URL 的文件内容。
 *
 * @param {string} url 文件地址
 * @returns {Promise<Buffer>} 文件内容
 */
function readFileData(url) {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    return Promise.resolve(Buffer.from(url.slice(commaIdx + 1), 'base64'));
  }

  const urlObj = new URL(url);
  const client = urlObj.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    client
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

module.exports = {
  registerDownloadHandlers,
  readFileData,
};
