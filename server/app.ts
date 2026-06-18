import path from 'path';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { createResourceRouter, endpointRegistry } from './endpoints/index.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import { mcpService } from './services/api/mcpService.js';

const app = express();

// CORS 允许前端（localhost:5173）跨域请求
app.use(cors());
app.use(express.json());

// ── 手动路由（SSE 流式、generateTitle 等复杂端点） ──
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations', messagesRouter);

// ── 自动生成路由（Endpoint Registry） ──
for (const resource of endpointRegistry.resources()) {
  app.use(`/api/${resource}`, createResourceRouter(endpointRegistry.getByResource(resource)));
}

// ── 生产模式静态文件服务 ──
const clientDistPath = process.env.AI_CHAT_CLIENT_DIST;
if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.resolve(clientDistPath, 'index.html'));
    }
  });
}

// 全局错误处理中间件（必须在路由之后注册）
app.use(errorHandler);

// 启动后初始化 MCP 连接
setTimeout(() => {
  mcpService.initialize().catch(err => {
    console.error('Failed to initialize MCP service:', err);
  });
}, 0);

export default app;
