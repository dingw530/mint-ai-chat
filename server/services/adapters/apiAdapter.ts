import { HistoryMessage, ToolCallDelta, ToolDefinition } from '../../types.js';

export interface ParsedChunk {
  content?: string;
  reasoning?: string;
  toolCallDelta?: ToolCallDelta;
  isFinished?: boolean;
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

  /** 解析单条 SSE `data:` 行，返回解析结果或 null（忽略该行） */
  parseChunk(data: string): ParsedChunk | null;
}

/** 注册表：apiType -> Adapter 实例 */
const registry = new Map<string, ApiAdapter>();

export function registerAdapter(apiType: string, adapter: ApiAdapter): void {
  registry.set(apiType, adapter);
}

export function getAdapter(apiType: string): ApiAdapter | undefined {
  return registry.get(apiType);
}
