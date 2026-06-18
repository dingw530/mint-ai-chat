import { generateImage } from '../../services/api/imageService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';

async function generateImageEndpoint(data: Record<string, unknown>) {
  const { endpointId, prompt, size, quality, output_format } = data;
  if (!endpointId) {
    throw httpError(400, 'endpointId 不能为空');
  }
  if (!prompt || !(prompt as string).trim()) {
    throw httpError(400, 'prompt 不能为空');
  }
  return generateImage({ endpointId, prompt, size, quality, output_format } as any);
}

export const imagesEndpoints: EndpointDescriptor[] = [
  {
    id: 'images:generate',
    method: 'POST',
    path: '/generate',
    preloadMethod: 'generateImage',
    service: generateImageEndpoint,
    args: [{ from: 'body', name: 'data' }],
    result: 'direct',
    async: true,
  },
];
