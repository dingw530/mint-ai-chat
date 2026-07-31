import type { HistoryMessage, ToolCallDelta, ToolDefinition } from '../../types.js';

/** 应用层单次 LLM 请求的默认超时时间（毫秒）。 */
export const AI_REQUEST_TIMEOUT_MS = 180_000;

export interface ParsedChunk {
  content?: string;
  reasoning?: string;
  toolCallDelta?: ToolCallDelta;
  isFinished?: boolean;
}

export interface CallOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

export interface ApiAdapter {
  /** 构建请求 URL */
  getUrl(baseUrl: string): string;

  /** 构建 HTTP 请求头 */
  getHeaders(apiKey: string): Record<string, string>;

  /** 构建请求体 */
  buildRequest(
    messages: HistoryMessage[],
    settings: { modelId: string; thinkingMode: boolean; systemPrompt: string },
    tools?: ToolDefinition[],
  ): Record<string, unknown>;

  /** 发起一次流式 AI 调用，返回原始 SSE 响应 */
  stream(
    messages: HistoryMessage[],
    settings: { modelId: string; thinkingMode: boolean; systemPrompt: string },
    apiUrl: string,
    apiKey: string,
    tools?: ToolDefinition[],
    options?: StreamOptions,
  ): Promise<Response>;

  /** 解析单条 SSE `data:` 行，返回解析结果或 null（忽略该行） */
  parseChunk(data: string): ParsedChunk | null;

  /** 非流式单次调用 AI，返回纯文本响应内容 */
  call(
    messages: { role: string; content: string }[],
    settings: { modelId: string },
    apiUrl: string,
    apiKey: string,
    options?: CallOptions,
  ): Promise<string>;
}

/** 注册表：apiType -> Adapter 实例 */
const registry = new Map<string, ApiAdapter>();

export function registerAdapter(apiType: string, adapter: ApiAdapter): void {
  registry.set(apiType, adapter);
}

export function getAdapter(apiType: string): ApiAdapter | undefined {
  return registry.get(apiType);
}
