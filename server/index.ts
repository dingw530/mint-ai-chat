import 'dotenv/config';
import app from './app.js';
import { createLogger } from './utils/logger.js';
import { listSkills } from './services/api/skillService.js';
import { getAddressPort, getErrorMessage } from './utils/typeGuards.js';
import { cleanupArtifacts } from './services/utils/toolResultArtifact.js';

const log = createLogger('server');
const LOOPBACK_HOST = '127.0.0.1';
const CONTAINER_HOST = '0.0.0.0';

type ListenMode = 'loopback' | 'container';

// 启动时检查加密密钥，防止未配置时写入加密数据导致不可恢复的错误
if (!process.env.AI_CHAT_ENCRYPTION_KEY) {
  console.error('FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is not set');
  process.exit(1);
}

// 启动时扫描技能
listSkills().catch((err) => log.error('技能扫描失败', { error: err.message }));

/**
 * Resolve the only supported HTTP listener addresses.
 * @param mode Restricted runtime mode selected by a trusted entry point
 * @returns IPv4 address used for the HTTP listener
 * @throws {Error} When the requested mode is not supported
 */
export function resolveListenHost(mode: string | undefined): string {
  if (mode === undefined || mode === 'loopback') return LOOPBACK_HOST;
  if (mode === 'container') return CONTAINER_HOST;
  throw new Error(`Unsupported HTTP listen mode: ${mode}`);
}

/**
 * Start the HTTP service with a restricted listener mode.
 * @param preferredPort Preferred port, defaulting to process.env.PORT or 3001
 * @param mode Restricted listener mode selected by an internal entry point
 * @returns Actual listening port
 */
async function startServerWithMode(
  preferredPort: number | undefined,
  mode: ListenMode,
): Promise<number> {
  const desiredPort = preferredPort ?? parseInt(process.env.PORT || '3001', 10);
  const host = resolveListenHost(mode);

  try {
    await cleanupArtifacts({ mode: 'startup' });
  } catch (error) {
    log.warn('Artifact 启动清理失败，继续启动服务', { error: getErrorMessage(error) });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(desiredPort, host, () => {
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
        const fallback = app.listen(0, host, () => {
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

/**
 * Start the local-only HTTP service used by Node, CLI, and Electron.
 * @param preferredPort Preferred port, defaulting to process.env.PORT or 3001
 * @returns Actual listening port
 */
export function startServer(preferredPort?: number): Promise<number> {
  return startServerWithMode(preferredPort, 'loopback');
}

/**
 * Start the HTTP service for the Docker container network only.
 * @param preferredPort Preferred port, defaulting to process.env.PORT or 3001
 * @returns Actual listening port
 */
export function startDockerServer(preferredPort?: number): Promise<number> {
  return startServerWithMode(preferredPort, 'container');
}

// 独立运行（非 Electron 环境）时自动启动
if (!process.env.AI_CHAT_CLIENT_DIST) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
