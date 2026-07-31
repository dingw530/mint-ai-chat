import 'dotenv/config';
import app from './app.js';
import { createLogger } from './utils/logger.js';
import { listSkills } from './services/api/skillService.js';
import { getAddressPort, getErrorMessage } from './utils/typeGuards.js';

const log = createLogger('server');

// 启动时检查加密密钥，防止未配置时写入加密数据导致不可恢复的错误
if (!process.env.AI_CHAT_ENCRYPTION_KEY) {
  console.error('FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is not set');
  process.exit(1);
}

// 启动时扫描技能
listSkills().catch(err => log.error('技能扫描失败', { error: err.message }));

/**
 * 启动 HTTP 服务，如果端口被占用则自动回退到随机可用端口。
 * @param preferredPort 期望端口号，默认从 process.env.PORT 或 3001
 * @returns 实际监听的端口号
 */
export async function startServer(preferredPort?: number): Promise<number> {
  const desiredPort = preferredPort ?? parseInt(process.env.PORT || '3001', 10);

  return new Promise((resolve, reject) => {
    const server = app.listen(desiredPort, () => {
      const actualPort = getAddressPort(server.address());
      if (actualPort === null) {
        reject(new Error('Server started without a TCP address'));
        return;
      }
      log.info('服务启动完成', { port: actualPort });
      resolve(actualPort);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`端口 ${desiredPort} 已被占用，尝试随机端口`);
        server.close();
        const fallback = app.listen(0, () => {
          const actualPort = getAddressPort(fallback.address());
          if (actualPort === null) {
            reject(new Error('Fallback server started without a TCP address'));
            return;
          }
          log.info('服务在随机端口启动完成', { port: actualPort });
          resolve(actualPort);
        });
        fallback.on('error', reject);
      } else {
        log.error('服务启动失败', { error: getErrorMessage(err) });
        reject(err);
      }
    });
  });
}

// 独立运行（非 Electron 环境）时自动启动
if (!process.env.AI_CHAT_CLIENT_DIST) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
