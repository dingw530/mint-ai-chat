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
    args: [{ from: 'query', name: 'category', optional: true }],
    result: 'direct',
  },
  {
    id: 'memories:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createMemory',
    service: (data: Record<string, unknown>) => {
      const content = data.content as string | undefined;
      if (content === undefined || content === null || (typeof content === 'string' && !content.trim())) {
        throw Object.assign(new Error('内容不能为空'), { status: 400 });
      }
      return memoryService.createMemory({
        id: uuidv4(),
        content,
        category: (data.category as string) || 'general',
        sourceConversationId: (data.sourceConversationId as string) || null,
      });
    },
    args: [{ from: 'body' }],
    result: 'direct',
  },
  {
    id: 'memories:update',
    method: 'PUT',
    path: '/:id',
    preloadMethod: 'updateMemory',
    service: (id: string, data: Record<string, unknown>) => {
      const result = memoryService.updateMemory(id, { content: data.content as string | undefined, category: data.category as string | undefined });
      if (!result) {
        throw Object.assign(new Error('记忆不存在'), { status: 404 });
      }
      return result;
    },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body' },
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
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
];
