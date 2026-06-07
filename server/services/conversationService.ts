import { v4 as uuidv4 } from 'uuid';
import * as conversationRepo from '../repositories/conversationRepository.js';
import * as settingsRepo from '../repositories/settingsRepository.js';
import { HttpError } from '../types.js';

function getSettingsRoutingMode(): string {
  const raw = settingsRepo.getAll();
  return raw.routingMode || 'auto';
}

export function list(type?: string) {
  return conversationRepo.findAll(type);
}

export function create({ title, type }: { title?: string; type?: string } = {}) {
  const id = uuidv4();
  const routingMode = getSettingsRoutingMode();
  return conversationRepo.create({ id, title: title || 'New Chat', type, routingMode });
}

// 删除会话，不存在时抛出 404 错误
export function remove(id: string) {
  const result = conversationRepo.deleteById(id);
  if (result.changes === 0) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return { success: true };
}

// 重命名会话，校验标题非空
export function rename(id: string, title: string) {
  if (!title) {
    const err: HttpError = new Error('Title is required');
    err.status = 400;
    throw err;
  }
  const updated = conversationRepo.updateTitle(id, title);
  if (!updated) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return updated;
}

// 锁定/解锁 Agent
export function setLockedAgent(id: string, lockedAgent: string | null) {
  const updated = conversationRepo.updateLockedAgent(id, lockedAgent);
  if (!updated) {
    const err: HttpError = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return updated;
}
