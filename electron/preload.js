const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // ── 流式对话 ──
  sendMessage: (convId, content, agent, regenerate) =>
    ipcRenderer.invoke('chat:send', convId, content, agent, regenerate),
  onChunk: (callback) => {
    ipcRenderer.on('chat:chunk', (_event, data) => callback(data));
  },
  onDone: (callback) => {
    ipcRenderer.on('chat:done', () => callback());
  },
  onError: (callback) => {
    ipcRenderer.on('chat:error', (_event, err) => callback(err));
  },
  removeListener: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ── 会话 ──
  getConversations: (type) => ipcRenderer.invoke('conversations:list', type),
  createConversation: (title, type) => ipcRenderer.invoke('conversations:create', title, type),
  deleteConversation: (id) => ipcRenderer.invoke('conversations:delete', id),
  clearAllConversations: () => ipcRenderer.invoke('conversations:clearAll'),
  patchConversation: (id, data) => ipcRenderer.invoke('conversations:patch', id, data),
  renameConversation: (id, title) => ipcRenderer.invoke('conversations:rename', id, title),
  lockAgent: (id, agentId) => ipcRenderer.invoke('conversations:lockAgent', id, agentId),
  generateTitle: (id) => ipcRenderer.invoke('conversations:generateTitle', id),

  // ── 消息 ──
  getMessages: (convId) => ipcRenderer.invoke('messages:list', convId),

  // ── 设置 ──
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  // ── Agent ──
  getAgents: () => ipcRenderer.invoke('agents:list'),
  getAgent: (id) => ipcRenderer.invoke('agents:get', id),
  createAgent: (data) => ipcRenderer.invoke('agents:create', data),
  updateAgent: (id, data) => ipcRenderer.invoke('agents:update', id, data),
  deleteAgent: (id) => ipcRenderer.invoke('agents:delete', id),

  // ── 端点 ──
  getEndpoints: () => ipcRenderer.invoke('endpoints:list'),
  createEndpoint: (data) => ipcRenderer.invoke('endpoints:create', data),
  updateEndpoint: (id, data) => ipcRenderer.invoke('endpoints:update', id, data),
  deleteEndpoint: (id) => ipcRenderer.invoke('endpoints:delete', id),
  activateEndpoint: (id) => ipcRenderer.invoke('endpoints:activate', id),

  // ── 记忆 ──
  getMemories: (category) => ipcRenderer.invoke('memories:list', category),
  createMemory: (data) => ipcRenderer.invoke('memories:create', data),
  updateMemory: (id, data) => ipcRenderer.invoke('memories:update', id, data),
  deleteMemory: (id) => ipcRenderer.invoke('memories:delete', id),

  // ── MCP Server ──
  getMcpServers: () => ipcRenderer.invoke('mcp-servers:list'),
  getMcpServer: (id) => ipcRenderer.invoke('mcp-servers:get', id),
  createMcpServer: (data) => ipcRenderer.invoke('mcp-servers:create', data),
  updateMcpServer: (id, data) => ipcRenderer.invoke('mcp-servers:update', id, data),
  deleteMcpServer: (id) => ipcRenderer.invoke('mcp-servers:delete', id),
  restartMcpServer: (id) => ipcRenderer.invoke('mcp-servers:restart', id),

  // ── 技能 ──
  getSkills: () => ipcRenderer.invoke('skills:list'),

  // ── Bash 安全 ──
  getBashSecurity: () => ipcRenderer.invoke('bash-security:get'),
  updateBashSecurity: (data) => ipcRenderer.invoke('bash-security:update', data),

  // ── 文件 ──
  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', { url, filename }),

  // ── Wiki ──
  listWiki: () => ipcRenderer.invoke('wiki:list'),
  readWiki: (path) => ipcRenderer.invoke('wiki:read', path),
  uploadWiki: (data) => ipcRenderer.invoke('wiki:upload', data),
  getJobStatus: (jobId) => ipcRenderer.invoke('wiki:getJobStatus', jobId),
  getWikiSchema: () => ipcRenderer.invoke('wiki:schema'),
  addWikiCategory: (category) => ipcRenderer.invoke('wiki:addCategory', category),
  removeWikiCategory: (category) => ipcRenderer.invoke('wiki:removeCategory', category),
  updateWikiSchema: (schema) => ipcRenderer.invoke('wiki:updateSchema', schema),

  // ── 知识图谱 ──
  getGraphData: () => ipcRenderer.invoke('graph:data'),
  getGraphNode: (id) => ipcRenderer.invoke('graph:node', id),
  getGraphNodeNeighbors: (id) => ipcRenderer.invoke('graph:neighbors', id),
  searchGraphNodes: (query) => ipcRenderer.invoke('graph:search', query),
  createGraphNode: (data) => ipcRenderer.invoke('graph:createNode', data),
  createGraphEdge: (data) => ipcRenderer.invoke('graph:createEdge', data),
  deleteGraphNode: (id) => ipcRenderer.invoke('graph:deleteNode', id),
  deleteGraphEdge: (id) => ipcRenderer.invoke('graph:deleteEdge', id),
  listGraphCandidates: (status) => ipcRenderer.invoke('graph:listCandidates', status),
  acceptGraphCandidate: (id) => ipcRenderer.invoke('graph:acceptCandidate', id),
  rejectGraphCandidate: (id, data) => ipcRenderer.invoke('graph:rejectCandidate', id, data),
});
