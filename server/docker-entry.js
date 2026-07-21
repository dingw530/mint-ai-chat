/* global process, console */

// Docker 入口：设置静态文件路径并启动 HTTP 服务
process.env.AI_CHAT_CLIENT_DIST = '/app/client/dist';

const { startServer } = await import('./dist/index.js');
const port = parseInt(process.env.PORT || '3001', 10);

startServer(port).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
