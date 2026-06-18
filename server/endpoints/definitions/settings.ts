import * as settingsService from '../../services/api/settingsService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';

// ── settings:save 的包装函数（包含验证逻辑，Express/IPC 共享） ──

function saveSettings(data: Record<string, unknown>) {
  const { apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode } = data;
  if (!apiUrl || !modelId) {
    throw httpError(400, 'apiUrl and modelId are required');
  }
  try {
    new URL(apiUrl as string);
  } catch {
    throw httpError(400, 'apiUrl must be a valid URL');
  }
  settingsService.save({ apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode } as any);
  return { success: true };
}

export const settingsEndpoints: EndpointDescriptor[] = [
  {
    id: 'settings:get',
    method: 'GET',
    path: '/',
    preloadMethod: 'getSettings',
    service: settingsService.get,
    ipcServiceRef: { module: 'settSvc', method: 'get' },
    result: 'direct',
  },
  {
    id: 'settings:save',
    method: 'PUT',
    path: '/',
    preloadMethod: 'saveSettings',
    service: saveSettings,
    args: [{ from: 'body', name: 'data' }],
    result: 'direct',
  },
];
