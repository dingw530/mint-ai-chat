import { SignJWT, importPKCS8 } from 'jose';
import { webcrypto } from 'crypto';

// Node.js 18 兼容：jose v6 依赖 globalThis.crypto（Web Crypto API），
// 但文件 ESM 模式下默认不可用，需手动垫片
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

const GEO_URL = 'https://geoapi.qweather.com';   // 地理编码 API
const API_URL = 'https://api.qweather.com';       // 天气数据 API

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let privateKey: any = null;

// 规范化 PEM 格式：处理 .env 中可能出现的 \n 转义和缺失的头尾标记
function normalizePem(pem: string): string {
  const cleaned = pem.replace(/\\n/g, '\n');
  return cleaned.includes('-----BEGIN') ? cleaned : `-----BEGIN PRIVATE KEY-----\n${cleaned}\n-----END PRIVATE KEY-----`;
}

async function getPrivateKey(): Promise<any> {
  if (!privateKey) {
    const pem = normalizePem(process.env.QWEATHER_PRIVATE_KEY!);
    privateKey = await importPKCS8(pem, 'EdDSA');
  }
  return privateKey;
}

// 生成 JWT EdDSA 令牌，有效期 15 分钟
async function generateToken(): Promise<string> {
  const key = await getPrivateKey();
  const iat = Math.floor(Date.now() / 1000) - 30;   // 提前 30 秒防时钟偏差
  const exp = iat + 900;

  const token = await new SignJWT({ sub: process.env.QWEATHER_PROJECT_ID, iat, exp })
    .setProtectedHeader({ alg: 'EdDSA', kid: process.env.QWEATHER_KEY_ID })
    .sign(key);

  tokenExpiry = exp;
  return token;
}

// 确保令牌未过期（提前 60 秒刷新）
async function ensureToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!cachedToken || now >= tokenExpiry - 60) {
    cachedToken = await generateToken();
  }
  return cachedToken;
}

// QWeather API 通用请求封装，自动附带 JWT Bearer 认证
async function qfetch(path: string, baseUrl: string = API_URL): Promise<any> {
  const token = await ensureToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QWeather API error (${response.status}): ${text}`);
  }
  return response.json();
}

// 城市搜索（地理编码）：获取城市 location ID
export async function getCityLocation(cityName: string): Promise<any[]> {
  const data = await qfetch(`/v2/city/lookup?location=${encodeURIComponent(cityName)}`, GEO_URL);
  return data.location || [];
}

// 获取天气预报（3 天或 7 天）
export async function getWeatherForecast(locationId: string, days: number = 3): Promise<any[]> {
  const data = await qfetch(`/v7/weather/${days}d?location=${locationId}`);
  return data.daily || [];
}
