import 'dotenv/config';
import app from './app.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');

// 启动时检查加密密钥，防止未配置时写入加密数据导致不可恢复的错误
if (!process.env.AI_CHAT_ENCRYPTION_KEY) {
  console.error('FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is not set');
  process.exit(1);
}

// ── 和风天气（QWeather）配置诊断 ──
const qwProjectId = process.env.QWEATHER_PROJECT_ID;
const qwKeyId = process.env.QWEATHER_KEY_ID;
const qwPrivateKey = process.env.QWEATHER_PRIVATE_KEY;
const qwConfigured = !!(qwProjectId && qwKeyId && qwPrivateKey);

// 详细诊断各环境变量的设置情况
log.info('和风天气配置诊断开始', {
  projectIdStatus: qwProjectId ? '已设置' : '未设置',
  projectIdLength: qwProjectId?.length ?? 0,
  keyIdStatus: qwKeyId ? '已设置' : '未设置',
  keyIdLength: qwKeyId?.length ?? 0,
  privateKeyStatus: qwPrivateKey ? '已设置' : '未设置',
  privateKeyLength: qwPrivateKey?.length ?? 0,
  privateKeyPrefix: qwPrivateKey ? qwPrivateKey.substring(0, 20) + '...' : null,
  qwConfigured,
});

if (!qwConfigured) {
  const missing: string[] = [];
  if (!qwProjectId) missing.push('QWEATHER_PROJECT_ID');
  if (!qwKeyId) missing.push('QWEATHER_KEY_ID');
  if (!qwPrivateKey) missing.push('QWEATHER_PRIVATE_KEY');
  log.warn('和风天气功能已禁用', { reason: `缺少环境变量: ${missing.join(', ')}` });
} else {
  log.info('和风天气功能已启用');
}

/**
 * 启动 HTTP 服务，如果端口被占用则自动回退到随机可用端口。
 * @param preferredPort 期望端口号，默认从 process.env.PORT 或 3001
 * @returns 实际监听的端口号
 */
export async function startServer(preferredPort?: number): Promise<number> {
  const desiredPort = preferredPort ?? parseInt(process.env.PORT || '3001', 10);

  return new Promise((resolve, reject) => {
    const server = app.listen(desiredPort, () => {
      const actualPort = (server.address() as any).port;
      log.info('服务启动完成', { port: actualPort });
      resolve(actualPort);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`端口 ${desiredPort} 已被占用，尝试随机端口`);
        server.close();
        const fallback = app.listen(0, () => {
          const actualPort = (fallback.address() as any).port;
          log.info('服务在随机端口启动完成', { port: actualPort });
          resolve(actualPort);
        });
        fallback.on('error', reject);
      } else {
        log.error('服务启动失败', { error: err.message });
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
