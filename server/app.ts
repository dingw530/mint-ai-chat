import path from 'path';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { createResourceRouter, endpointRegistry } from './endpoints/index.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import wikiRouter from './routes/wiki.js';
import { mcpService } from './services/api/mcpService.js';
import { startMemoryProcessing } from './services/api/memoryJobService.js';
import { startWikiLifecycleProcessing } from './services/api/wikiLifecycleService.js';

const app = express();

const defaultCorsOrigins = [
  'http://localhost:5800',
  'http://127.0.0.1:5800',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * Resolves configured development origins without opening the API to the
 * entire network. Requests without an Origin are allowed for Electron.
 * @param origin Browser Origin header, when present
 * @returns Whether the origin is allowed to receive CORS headers
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const configuredOrigins = process.env.AI_CHAT_CORS_ORIGINS
    ?.split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins?.length ? configuredOrigins : defaultCorsOrigins;
  return allowedOrigins.includes(origin);
}

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedCorsOrigin(origin)),
}));
app.use(express.json());

// ── 手动路由（SSE 流式、generateTitle 等复杂端点） ──
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations', messagesRouter);

// ── Wiki 知识库浏览 ──
app.use('/api/wiki', wikiRouter);

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

// 启动时恢复并处理持久化的用户记忆任务。
setTimeout(() => startMemoryProcessing(), 0);
setTimeout(() => startWikiLifecycleProcessing(), 0);

export default app;
