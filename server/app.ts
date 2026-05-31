import path from 'path';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import settingsRouter from './routes/settings.js';
import agentsRouter from './routes/agents.js';
import weatherRouter from './routes/weather.js';
import mcpServersRouter from './routes/mcpServers.js';
import memoriesRouter from './routes/memories.js';
import routingLogsRouter from './routes/routingLogs.js';
import modelEndpointsRouter from './routes/modelEndpoints.js';
import imagesRouter from './routes/images.js';
import { mcpService } from './services/mcpService.js';

const app = express();

// CORS 允许前端（localhost:5173）跨域请求
app.use(cors());
app.use(express.json());

// 路由注册：conversations 和 messages 共享同一前缀但职责分离
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations', messagesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/mcp-servers', mcpServersRouter);
app.use('/api/memories', memoriesRouter);
app.use('/api/routing-logs', routingLogsRouter);
app.use('/api/model-endpoints', modelEndpointsRouter);
app.use('/api/images', imagesRouter);

// ── 生产模式静态文件服务 ──
// 当 AI_CHAT_CLIENT_DIST 环境变量设置时，serve 前端构建产物并提供 SPA fallback
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
