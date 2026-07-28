import * as endpointService from '../../services/api/endpointService.js';
import * as settingsRepo from '../../repositories/settingsRepository.js';
import type { EndpointDescriptor } from '../types.js';
import type { EndpointInput } from '../../types.js';
import { httpError } from '../helpers.js';

function readEndpointCategory(value: unknown): 'text' | 'image' | undefined {
  if (value === undefined) return undefined;
  if (value === 'text' || value === 'image') return value;
  throw httpError(400, '分类值无效，仅支持 text 或 image');
}

function toEndpointInput(data: Record<string, unknown>): EndpointInput {
  return {
    name: typeof data.name === 'string' ? data.name : '',
    apiUrl: typeof data.apiUrl === 'string' ? data.apiUrl : '',
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : undefined,
    modelId: typeof data.modelId === 'string' ? data.modelId : '',
    apiType: typeof data.apiType === 'string' ? data.apiType : undefined,
    category: readEndpointCategory(data.category),
  };
}

export const modelEndpointsEndpoints: EndpointDescriptor[] = [
  {
    id: 'endpoints:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getEndpoints',
    service: () => {
      // 首次调用时尝试迁移旧版配置
      try {
        const legacy = settingsRepo.getAll();
        endpointService.migrateLegacyEndpoint({
          apiUrl: legacy.apiUrl,
          apiKey: legacy.apiKey,
          modelId: legacy.modelId,
        });
      } catch { /* 迁移失败不影响列表返回 */ }
      return endpointService.list();
    },
    result: 'direct',
  },
  {
    id: 'endpoints:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createEndpoint',
    service: (data: Record<string, unknown>) => {
      const endpoint = endpointService.create(toEndpointInput(data));
      return { endpoint };
    },
    args: [{ from: 'body' }],
    result: 'direct',
  },
  {
    id: 'endpoints:update',
    method: 'PUT',
    path: '/:id',
    preloadMethod: 'updateEndpoint',
    service: (id: string, data: Record<string, unknown>) => {
      const endpoint = endpointService.updateEndpoint(id, toEndpointInput(data));
      return { endpoint };
    },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body' },
    ],
    result: 'direct',
  },
  {
    id: 'endpoints:delete',
    method: 'DELETE',
    path: '/:id',
    preloadMethod: 'deleteEndpoint',
    service: (id: string) => {
      endpointService.remove(id);
      return { success: true };
    },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'endpoints:activate',
    method: 'PUT',
    path: '/:id/activate',
    preloadMethod: 'activateEndpoint',
    service: (id: string) => {
      endpointService.activate(id);
      return { success: true };
    },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
];
