import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DB = '/tmp/ai-chat-vitest.db';
process.env.AI_CHAT_DB_PATH = TEST_DB;

// Must set before importing modules
import * as endpointRepo from '../../../repositories/endpointRepository.js';
import * as imageService from '../imageService.js';
import { encrypt } from '../../utils/encryption.js';

describe('imageService', () => {
  beforeEach(() => {
    endpointRepo.getAll()
      .filter(endpoint => endpoint.name.startsWith('ImageService Test '))
      .forEach(endpoint => endpointRepo.del(endpoint.id));
  });

  afterAll(() => {
    ['img-test-ep1', 'img-test-ep2', 'img-test-ep3', 'img-test-ep4'].forEach(id => {
      try { endpointRepo.del(id); } catch {}
    });
  });

  it('throws on empty prompt', async () => {
    await expect(imageService.generateImage({ prompt: '', endpointId: 'e' })).rejects.toThrow('prompt');
    await expect(imageService.generateImage({ prompt: '   ', endpointId: 'e' })).rejects.toThrow('prompt');
  });

  it('throws on non-existent endpoint', async () => {
    await expect(imageService.generateImage({ prompt: 'cat', endpointId: 'nope' })).rejects.toThrow(/不存在/);
  });

  it('throws on text endpoint', async () => {
    endpointRepo.insert({ id: 'img-test-ep1', name: 'ImageService Test Text', apiUrl: 'https://a.com', apiKey: '', modelId: 'gpt-4o', isActive: true, sortOrder: 50 });
    await expect(imageService.generateImage({ prompt: 'cat', endpointId: 'img-test-ep1' })).rejects.toThrow(/不是图片/);
  });

  it('throws fetch error', async () => {
    const encKey = encrypt('sk-key');
    endpointRepo.insert({ id: 'img-test-ep2', name: 'ImageService Test Fetch', apiUrl: 'https://img.com', apiKey: encKey, modelId: 'dall-e-3', category: 'image', isActive: true, sortOrder: 51 });
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    await expect(imageService.generateImage({ prompt: 'cat', endpointId: 'img-test-ep2' })).rejects.toThrow('network');
    globalThis.fetch = orig;
  });

  it('handles API error with message field', async () => {
    const encKey = encrypt('sk-key2');
    endpointRepo.insert({ id: 'img-test-ep3', name: 'ImageService Test Error Object', apiUrl: 'https://img.com', apiKey: encKey, modelId: 'dall-e-3', category: 'image', isActive: true, sortOrder: 52 });
    const orig = globalThis.fetch;
    const mockResponse = {
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: { message: 'safety violation' } }),
      text: vi.fn(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
    await expect(imageService.generateImage({ prompt: 'cat', endpointId: 'img-test-ep3' })).rejects.toThrow('safety violation');
    globalThis.fetch = orig;
  });

  it('handles API error with error string', async () => {
    const encKey = encrypt('sk-key3');
    endpointRepo.insert({ id: 'img-test-ep4', name: 'ImageService Test Error String', apiUrl: 'https://img.com', apiKey: encKey, modelId: 'dall-e-3', category: 'image', isActive: true, sortOrder: 53 });
    const orig = globalThis.fetch;
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'server error' }),
      text: vi.fn(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
    await expect(imageService.generateImage({ prompt: 'cat', endpointId: 'img-test-ep4' })).rejects.toThrow('server error');
    globalThis.fetch = orig;
  });
});
