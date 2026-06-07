const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  // 下载文件：弹出系统保存对话框，绕过 CORS 限制
  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', { url, filename }),
});
