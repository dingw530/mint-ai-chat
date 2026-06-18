import type { Message, ImageGenerateParams, GenerateImageResult } from '@/types';
import { request } from '../api/_base';

export function generateImage(data: ImageGenerateParams): Promise<GenerateImageResult> {
  return request('/images/generate', { method: 'POST', body: JSON.stringify(data) });
}

export function sendImageMessage(
  conversationId: string,
  data: Record<string, unknown>
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  return request(`/conversations/${conversationId}/images`, { method: 'POST', body: JSON.stringify(data) });
}
