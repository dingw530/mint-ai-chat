import * as settingsService from '../../services/api/settingsService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';
import type { SettingsInput } from '../../types.js';
import * as vectorConnectionService from '../../services/api/vectorConnectionService.js';

function toSettingsInput(data: Record<string, unknown>): SettingsInput {
  return {
    ...(typeof data.apiUrl === 'string' ? { apiUrl: data.apiUrl } : {}),
    ...(typeof data.modelId === 'string' ? { modelId: data.modelId } : {}),
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
    systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : undefined,
    thinkingMode: typeof data.thinkingMode === 'boolean' ? data.thinkingMode : undefined,
    memoryEnabled: typeof data.memoryEnabled === 'boolean' ? data.memoryEnabled : undefined,
    routingMode: typeof data.routingMode === 'string' ? data.routingMode : undefined,
    reactMaxIterations:
      typeof data.reactMaxIterations === 'number' ? data.reactMaxIterations : undefined,
    toolMaxRetries: typeof data.toolMaxRetries === 'number' ? data.toolMaxRetries : undefined,
    showReactSteps: typeof data.showReactSteps === 'boolean' ? data.showReactSteps : undefined,
    wikiPath: typeof data.wikiPath === 'string' ? data.wikiPath : undefined,
    wikiMaxFileSize: typeof data.wikiMaxFileSize === 'number' ? data.wikiMaxFileSize : undefined,
    wikiSearchMode:
      data.wikiSearchMode === 'hybrid' || data.wikiSearchMode === 'keyword'
        ? data.wikiSearchMode
        : undefined,
    embeddingApiUrl: typeof data.embeddingApiUrl === 'string' ? data.embeddingApiUrl : undefined,
    embeddingModel: typeof data.embeddingModel === 'string' ? data.embeddingModel : undefined,
    embeddingDimensions:
      typeof data.embeddingDimensions === 'number' ? data.embeddingDimensions : undefined,
    vectorStore:
      data.vectorStore === 'chroma' || data.vectorStore === 'sqlite' ? data.vectorStore : undefined,
    chromaUrl: typeof data.chromaUrl === 'string' ? data.chromaUrl : undefined,
    chromaApiKey: typeof data.chromaApiKey === 'string' ? data.chromaApiKey : undefined,
  };
}

// ── settings:save 的包装函数（包含验证逻辑，Express/IPC 共享） ──

function saveSettings(data: Record<string, unknown>) {
  if (data.apiUrl !== undefined) {
    if (typeof data.apiUrl !== 'string' || !data.apiUrl.trim()) {
      throw httpError(400, 'apiUrl must be a valid URL');
    }
    try {
      new URL(data.apiUrl);
    } catch {
      throw httpError(400, 'apiUrl must be a valid URL');
    }
  }
  if (data.modelId !== undefined && (typeof data.modelId !== 'string' || !data.modelId.trim())) {
    throw httpError(400, 'modelId is required');
  }
  if (
    data.wikiSearchMode !== undefined &&
    data.wikiSearchMode !== 'keyword' &&
    data.wikiSearchMode !== 'hybrid'
  ) {
    throw httpError(400, 'wikiSearchMode must be keyword or hybrid');
  }
  if (data.embeddingDimensions !== undefined && data.embeddingDimensions !== 1024) {
    throw httpError(400, 'embeddingDimensions must be 1024');
  }
  if (data.embeddingApiUrl !== undefined) {
    try {
      new URL(data.embeddingApiUrl as string);
    } catch {
      throw httpError(400, 'embeddingApiUrl must be a valid URL');
    }
  }
  if (
    data.vectorStore !== undefined &&
    data.vectorStore !== 'sqlite' &&
    data.vectorStore !== 'chroma'
  ) {
    throw httpError(400, 'vectorStore must be sqlite or chroma');
  }
  if (data.chromaUrl !== undefined) {
    if (typeof data.chromaUrl !== 'string' || !data.chromaUrl.trim()) {
      throw httpError(400, 'chromaUrl must be a valid URL');
    }
    try {
      new URL(data.chromaUrl);
    } catch {
      throw httpError(400, 'chromaUrl must be a valid URL');
    }
  }
  settingsService.save(toSettingsInput(data));
  return { success: true };
}

export const settingsEndpoints: EndpointDescriptor[] = [
  {
    id: 'settings:get',
    method: 'GET',
    path: '/',
    preloadMethod: 'getSettings',
    service: settingsService.get,
    result: 'direct',
  },
  {
    id: 'settings:save',
    method: 'PUT',
    path: '/',
    preloadMethod: 'saveSettings',
    service: saveSettings,
    args: [{ from: 'body' }],
    result: 'direct',
  },
  {
    id: 'settings:testEmbeddingConnection',
    method: 'POST',
    path: '/test-embedding-connection',
    preloadMethod: 'testEmbeddingConnection',
    service: (data: Record<string, unknown>) =>
      vectorConnectionService.testEmbeddingConnection({
        apiUrl: typeof data.apiUrl === 'string' ? data.apiUrl : '',
        model: typeof data.model === 'string' ? data.model : '',
        dimensions: typeof data.dimensions === 'number' ? data.dimensions : 0,
      }),
    args: [{ from: 'body' }],
    result: 'direct',
    async: true,
  },
  {
    id: 'settings:testChromaConnection',
    method: 'POST',
    path: '/test-chroma-connection',
    preloadMethod: 'testChromaConnection',
    service: (data: Record<string, unknown>) =>
      vectorConnectionService.testChromaConnection(
        typeof data.url === 'string' ? data.url : '',
        typeof data.apiKey === 'string' && data.apiKey.trim()
          ? data.apiKey
          : settingsService.getChromaApiKey(),
      ),
    args: [{ from: 'body' }],
    result: 'direct',
    async: true,
  },
];
