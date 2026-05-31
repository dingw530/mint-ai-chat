import * as endpointRepo from '../repositories/endpointRepository.js';
import { decrypt } from './encryption.js';

export interface GenerateImageParams {
  endpointId: string;
  prompt: string;
  size?: string;
  quality?: string;
  output_format?: string;
}

export interface GeneratedImage {
  url: string;
  revised_prompt?: string;
}

export interface GenerateImageResult {
  created: number;
  data: GeneratedImage[];
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const { endpointId, prompt, size, quality, output_format } = params;
  if (!prompt || !prompt.trim()) {
    throw Object.assign(new Error('prompt 不能为空'), { status: 400 });
  }

  const endpoint = endpointRepo.getById(endpointId);
  if (!endpoint) {
    throw Object.assign(new Error('端点不存在'), { status: 404 });
  }

  if (endpoint.category !== 'image') {
    throw Object.assign(new Error('该端点不是图片模型'), { status: 400 });
  }

  let apiKey = '';
  if (endpoint.apiKey) {
    try {
      apiKey = decrypt(endpoint.apiKey);
    } catch {
      throw Object.assign(new Error('API Key 解密失败'), { status: 500 });
    }
  }

  const baseUrl = endpoint.apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/images/generations`;

  const body: Record<string, unknown> = {
    model: endpoint.modelId,
    prompt: prompt.trim(),
    n: 1,
  };

  if (size) body.size = size;
  if (quality) body.quality = quality;
  if (output_format) body.output_format = output_format;
  body.response_format = 'url';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `上游 API 错误 (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody.error?.message) {
        errorMessage = errBody.error.message;
      } else if (errBody.error) {
        errorMessage = typeof errBody.error === 'string' ? errBody.error : JSON.stringify(errBody.error);
      }
    } catch {
      // ignore parse error
    }
    throw Object.assign(new Error(errorMessage), { status: response.status });
  }

  const result = await response.json() as GenerateImageResult;
  return result;
}
