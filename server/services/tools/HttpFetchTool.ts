/**
 * HTTP 请求工具 - 基于 BaseTool 的具体实现
 */

import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';

// ── 输入 Schema ──

const HttpFetchInputSchema = z.object({
  url: z.string().describe('请求 URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET').describe('HTTP 方法，默认 GET'),
  headers: z.record(z.string(), z.string()).optional().describe('自定义请求头'),
  body: z.string().optional().describe('请求体（字符串）'),
  timeout: z.coerce.number().int().min(1000).max(60000).optional().default(30000).describe('超时时间（毫秒），默认 30000'),
});

type HttpFetchInput = z.infer<typeof HttpFetchInputSchema>;

// ── 输出类型 ──

interface HttpFetchOutput {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

// ── HTTP 请求工具 ──

export class HttpFetchTool extends BaseTool<HttpFetchInput, HttpFetchOutput> {
  readonly name = 'http_fetch';
  readonly description = '发起 HTTP 请求获取外部数据（支持 GET/POST/PUT/DELETE/PATCH）';
  readonly inputSchema = HttpFetchInputSchema;

  /**
   * HTTP 请求不是只读操作
   */
  isReadOnly(): boolean {
    return false;
  }

  /**
   * HTTP 请求不是幂等的（取决于具体请求）
   */
  isIdempotent(): boolean {
    return false;
  }

  /**
   * 自定义验证逻辑
   */
  validate(input: unknown): { valid: boolean; error?: string } {
    const baseValidation = super.validate(input);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // 额外验证：POST/PUT/PATCH 需要有 body
    const typedInput = input as HttpFetchInput;
    if (['POST', 'PUT', 'PATCH'].includes(typedInput.method || 'GET') && !typedInput.body) {
      // 这只是警告，不是错误
      console.warn(`[HttpFetchTool] ${typedInput.method} request without body`);
    }

    return { valid: true };
  }

  /**
   * 执行 HTTP 请求
   */
  async execute(input: HttpFetchInput, context: ToolContext): Promise<HttpFetchOutput> {
    const { url, method, headers, body, timeout } = input;
    const startTime = Date.now();

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 合并 signal（支持外部取消）
    const signal = context.signal
      ? anySignal([context.signal, controller.signal])
      : controller.signal;

    try {
      const fetchInit: RequestInit = {
        method: method || 'GET',
        headers: {
          'User-Agent': 'Mint-Chat/1.0',
          ...headers,
        },
        signal,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method || 'GET')) {
        fetchInit.body = body;
        // 如果没有设置 Content-Type，默认设置为 JSON
        if (!headers?.['Content-Type']) {
          (fetchInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(url, fetchInit);
      const responseText = await response.text();
      const duration = Date.now() - startTime;

      // 转换 headers 为 Record<string, string>
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseText.length > 10000
          ? responseText.substring(0, 10000) + '\n...(truncated)'
          : responseText,
        duration,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (context.signal?.aborted) {
          throw new Error('Request was cancelled');
        }
        throw new Error(`Request timed out after ${timeout}ms`);
      }

      throw new Error(`HTTP request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ── 辅助函数 ──

/**
 * 合并多个 AbortSignal
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
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
