import * as endpointService from '../../services/endpointService.js';
import * as settingsRepo from '../../repositories/settingsRepository.js';
import type { EndpointDescriptor } from '../types.js';

export const modelEndpointsEndpoints: EndpointDescriptor[] = [
  {
    id: 'model-endpoints:list',
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
    ipcServiceRef: { module: 'epSvc', method: 'list' },
    result: 'direct',
  },
  {
    id: 'model-endpoints:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createEndpoint',
    service: (data: Record<string, unknown>) => {
      const endpoint = endpointService.create(data as any);
      return { endpoint };
    },
    args: [{ from: 'body', name: 'data' }],
    result: 'direct',
  },
  {
    id: 'model-endpoints:update',
    method: 'PUT',
    path: '/:id',
    preloadMethod: 'updateEndpoint',
    service: (id: string, data: Record<string, unknown>) => {
      const endpoint = endpointService.updateEndpoint(id, data as any);
      return { endpoint };
    },
    ipcServiceRef: { module: 'epSvc', method: 'updateEndpoint' },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body', name: 'data' },
    ],
    result: 'direct',
  },
  {
    id: 'model-endpoints:delete',
    method: 'DELETE',
    path: '/:id',
    preloadMethod: 'deleteEndpoint',
    service: (id: string) => {
      endpointService.remove(id);
      return { success: true };
    },
    ipcServiceRef: { module: 'epSvc', method: 'remove' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'model-endpoints:activate',
    method: 'PUT',
    path: '/:id/activate',
    preloadMethod: 'activateEndpoint',
    service: (id: string) => {
      endpointService.activate(id);
      return { success: true };
    },
    ipcServiceRef: { module: 'epSvc', method: 'activate' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
];
