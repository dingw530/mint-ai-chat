import { v4 as uuidv4 } from 'uuid';
import * as memoryService from '../../services/api/memoryService.js';
import type { EndpointDescriptor } from '../types.js';

export const memoriesEndpoints: EndpointDescriptor[] = [
  {
    id: 'memories:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getMemories',
    service: memoryService.listMemories,
    ipcServiceRef: { module: 'memSvc', method: 'listMemories' },
    args: [{ from: 'query', name: 'category', optional: true }],
    result: 'direct',
  },
  {
    id: 'memories:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createMemory',
    service: (data: Record<string, unknown>) => {
      return memoryService.createMemory({
        id: uuidv4(),
        content: data.content as string,
        category: (data.category as string) || 'general',
        sourceConversationId: (data.sourceConversationId as string) || null,
      });
    },
    ipcServiceRef: { module: 'memSvc', method: 'createMemory' },
    args: [{ from: 'body', name: 'data' }],
    result: 'direct',
  },
  {
    id: 'memories:update',
    method: 'PUT',
    path: '/:id',
    preloadMethod: 'updateMemory',
    service: (id: string, data: Record<string, unknown>) => {
      return memoryService.updateMemory(id, { content: data.content as string | undefined, category: data.category as string | undefined });
    },
    ipcServiceRef: { module: 'memSvc', method: 'updateMemory' },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body', name: 'data' },
    ],
    result: 'direct',
  },
  {
    id: 'memories:delete',
    method: 'DELETE',
    path: '/:id',
    preloadMethod: 'deleteMemory',
    service: (id: string) => {
      memoryService.deleteMemory(id);
      return { success: true };
    },
    ipcServiceRef: { module: 'memSvc', method: 'deleteMemory' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
];
