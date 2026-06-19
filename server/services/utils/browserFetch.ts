/**
 * 使用 undici 实现的浏览器风格 HTTP 请求工具
 * - 使用 undici 替代 Node.js 原生 fetch，避免网页端被拦截
 * - 添加模仿 Chrome 浏览器的完整请求头
 * - 支持超时、自定义 headers、请求体
 */

import { fetch, type RequestInit, type Response } from 'undici';

// ── 浏览器请求头模板 ──

export interface BrowserFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * 生成模仿 Chrome 131 浏览器的完整请求头
 * 不覆盖用户显式传入的自定义 headers
 */
function buildBrowserHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const browserHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not=A?Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
  };

  // 若用户指定了自定义 User-Agent，则不覆盖
  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      const lower = key.toLowerCase();
      // 用户自定义 headers 覆盖浏览器默认（不区分大小写）
      const matchedKey = Object.keys(browserHeaders).find(k => k.toLowerCase() === lower);
      if (matchedKey) {
        browserHeaders[matchedKey] = value;
      } else {
        browserHeaders[key] = value;
      }
    }
  }

  return browserHeaders;
}

/**
 * 使用 undici 发起浏览器风格的 HTTP 请求
 * 自动添加完整的浏览器请求头，让目标服务器难以区分请求来源
 *
 * @param url - 请求 URL
 * @param options - 请求选项
 * @returns Response 对象（undici Response，与标准 Response 兼容）
 *
 * @example
 * ```ts
 * const res = await browserFetch('https://example.com');
 * const text = await res.text();
 * ```
 *
 * @example
 * ```ts
 * const res = await browserFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Authorization': 'Bearer xxx' },
 *   body: JSON.stringify({ key: 'value' }),
 *   timeout: 15000,
 * });
 * ```
 */
export async function browserFetch(url: string, options: BrowserFetchOptions = {}): Promise<Response> {
  const {
    method = 'GET',
    headers: customHeaders,
    body,
    timeout = 30000,
    signal: externalSignal,
  } = options;

  // 合并浏览器头 + 自定义头
  const finalHeaders = buildBrowserHeaders(customHeaders);

  // 自动处理 Content-Type
  if (body && ['POST', 'PUT', 'PATCH'].includes(method) && !customHeaders?.['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  // 超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 合并外部 signal（支持请求取消）
  const signal = externalSignal
    ? combineAbortSignals([externalSignal, controller.signal])
    : controller.signal;

  try {
    const init: RequestInit = {
      method,
      headers: finalHeaders,
      signal,
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      init.body = body;
    }

    if (method === 'GET' && body) {
      console.warn(`[browserFetch] GET request with body — body will be ignored`);
    }

    const response = await fetch(url, init);
    return response;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw new Error(`HTTP request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 合并多个 AbortSignal
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    }, { once: true });
  }

  return controller.signal;
}
