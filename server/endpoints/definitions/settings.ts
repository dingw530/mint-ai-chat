import * as settingsService from '../../services/api/settingsService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';
import type { SettingsInput } from '../../types.js';

function toSettingsInput(data: Record<string, unknown>): SettingsInput {
  return {
    apiUrl: typeof data.apiUrl === 'string' ? data.apiUrl : '',
    modelId: typeof data.modelId === 'string' ? data.modelId : '',
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
    systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : undefined,
    thinkingMode: typeof data.thinkingMode === 'boolean' ? data.thinkingMode : undefined,
    memoryEnabled: typeof data.memoryEnabled === 'boolean' ? data.memoryEnabled : undefined,
    routingMode: typeof data.routingMode === 'string' ? data.routingMode : undefined,
    reactMaxIterations: typeof data.reactMaxIterations === 'number' ? data.reactMaxIterations : undefined,
    toolMaxRetries: typeof data.toolMaxRetries === 'number' ? data.toolMaxRetries : undefined,
    showReactSteps: typeof data.showReactSteps === 'boolean' ? data.showReactSteps : undefined,
    wikiPath: typeof data.wikiPath === 'string' ? data.wikiPath : undefined,
    wikiMaxFileSize: typeof data.wikiMaxFileSize === 'number' ? data.wikiMaxFileSize : undefined,
  };
}

// ── settings:save 的包装函数（包含验证逻辑，Express/IPC 共享） ──

function saveSettings(data: Record<string, unknown>) {
  const { apiUrl, modelId } = data;
  if (!apiUrl || !modelId) {
    throw httpError(400, 'apiUrl and modelId are required');
  }
  try {
    new URL(apiUrl as string);
  } catch {
    throw httpError(400, 'apiUrl must be a valid URL');
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
];
