import type { Conversation, Message } from '@/types';
import { ipcOrHttp, request, electronAPI } from '../api/_base';

export function getConversations(type?: string): Promise<{ conversations: Conversation[] }> {
  return ipcOrHttp(
    () => electronAPI!.getConversations(type),
    () => request(`/conversations${type ? `?type=${type}` : ''}`),
  );
}

export function createConversation(title?: string, type?: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.createConversation(title, type),
    () => request('/conversations', { method: 'POST', body: JSON.stringify({ title, type }) }),
  );
}

export function deleteConversation(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteConversation(id),
    () => request(`/conversations/${id}`, { method: 'DELETE' }),
  );
}

export function clearAllConversations(): Promise<{ changes: number }> {
  return ipcOrHttp(
    () => electronAPI!.clearAllConversations(),
    () => request('/conversations', { method: 'DELETE' }),
  );
}

export function renameConversation(id: string, title: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.renameConversation(id, title),
    () => request(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  );
}

export function lockAgent(conversationId: string, agentId: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.lockAgent(conversationId, agentId),
    () => request(`/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ lockedAgent: agentId }) }),
  );
}

export function unlockAgent(conversationId: string): Promise<{ conversation: Conversation }> {
  return lockAgent(conversationId, null as unknown as string);
}

export function getMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return ipcOrHttp(
    () => electronAPI!.getMessages(conversationId),
    () => request(`/conversations/${conversationId}/messages`),
  );
}

export function generateTitle(conversationId: string): Promise<{ title: string }> {
  return ipcOrHttp(
    () => electronAPI!.generateTitle(conversationId),
    () => request(`/conversations/${conversationId}/generate-title`, { method: 'POST' }),
  );
}
