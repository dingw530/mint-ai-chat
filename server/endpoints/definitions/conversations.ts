import * as conversationService from '../../services/api/conversationService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';

export const conversationsEndpoints: EndpointDescriptor[] = [
  {
    id: 'conversations:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getConversations',
    service: (type?: string) => ({ conversations: conversationService.list(type) }),
    ipcServiceRef: { module: 'convSvc', method: 'list' },
    args: [{ from: 'query', name: 'type', optional: true }],
    result: 'direct',
  },
  {
    id: 'conversations:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createConversation',
    service: (title?: string, type?: string) => {
      if (title !== undefined && typeof title !== 'string') {
        throw httpError(400, 'Title must be a string');
      }
      if (type !== undefined && type !== 'text' && type !== 'image') {
        throw httpError(400, 'Type must be "text" or "image"');
      }
      return { conversation: conversationService.create({ title, type }) };
    },
    args: [
      { from: 'body', name: 'title', optional: true },
      { from: 'body', name: 'type', optional: true },
    ],
    result: 'direct',
  },
  {
    id: 'conversations:delete',
    method: 'DELETE',
    path: '/:id',
    preloadMethod: 'deleteConversation',
    service: (id: string) => conversationService.remove(id),
    ipcServiceRef: { module: 'convSvc', method: 'remove' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'conversations:clearAll',
    method: 'DELETE',
    path: '/',
    preloadMethod: '',
    service: () => conversationService.removeAll(),
    ipcServiceRef: { module: 'convSvc', method: 'removeAll' },
    args: [],
    result: 'direct',
  },
  {
    // 合并 rename + lockAgent（Express 不允许同路径同方法注册两个 handler）
    id: 'conversations:patch',
    method: 'PATCH',
    path: '/:id',
    preloadMethod: 'patchConversation',
    service: (id: string, data: Record<string, unknown>) => {
      if (data?.lockedAgent !== undefined) {
        return { conversation: conversationService.setLockedAgent(id, data.lockedAgent as string) };
      }
      return { conversation: conversationService.rename(id, data.title as string) };
    },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body', name: '' },
    ],
    result: 'direct',
  },
];

// ── 供 IPC 独立使用的 rename 和 lockAgent（IPC 允许同 channel 前缀不同 action） ──

export const conversationsIpcOnlyEndpoints: EndpointDescriptor[] = [
  {
    id: 'conversations:rename',
    ipcChannel: 'conversations:rename',
    method: 'PATCH',
    path: '/',  // 不会用于 Express 路由
    preloadMethod: 'renameConversation',
    service: (id: string, title: string) => ({
      conversation: conversationService.rename(id, title),
    }),
    ipcServiceRef: { module: 'convSvc', method: 'rename' },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body', name: 'title' },
    ],
    result: 'direct',
  },
  {
    id: 'conversations:lockAgent',
    ipcChannel: 'conversations:lockAgent',
    method: 'PATCH',
    path: '/',  // 不会用于 Express 路由
    preloadMethod: 'lockAgent',
    service: (id: string, agentId: string) => ({
      conversation: conversationService.setLockedAgent(id, agentId),
    }),
    ipcServiceRef: { module: 'convSvc', method: 'setLockedAgent' },
    args: [
      { from: 'path', name: 'id' },
      { from: 'body', name: 'lockedAgent' },
    ],
    result: 'direct',
  },
];
