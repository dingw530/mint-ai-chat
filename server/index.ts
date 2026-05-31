import 'dotenv/config';
import app from './app.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');

// 启动时检查加密密钥，防止未配置时写入加密数据导致不可恢复的错误
if (!process.env.AI_CHAT_ENCRYPTION_KEY) {
  console.error('FATAL: AI_CHAT_ENCRYPTION_KEY environment variable is not set');
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

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

app.listen(PORT, () => {
  log.info('服务启动完成', { port: Number(PORT) });
});
