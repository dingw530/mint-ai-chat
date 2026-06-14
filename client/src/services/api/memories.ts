import type { Memory } from '@/types';
import { callEndpoint } from '../api/_base';

export function getMemories(category?: string): Promise<Memory[]> {
  return callEndpoint('memories:list', category);
}

export function createMemory(data: Partial<Memory>): Promise<Memory> {
  return callEndpoint('memories:create', data);
}

export function updateMemory(id: string, data: Partial<Memory>): Promise<Memory> {
  return callEndpoint('memories:update', id, data);
}

export function deleteMemory(id: string): Promise<{ success: boolean }> {
  return callEndpoint('memories:delete', id);
}
