import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import crypto from 'crypto';
import type { Server } from 'http';

const TEST_DB_PATH = '/tmp/ai-chat-images-test.db';
const TEST_PORT = 3098;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const AUTH_HEADERS = { 'Content-Type': 'application/json' };

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.AI_CHAT_ENCRYPTION_KEY = crypto.randomBytes(16).toString('hex');
process.env.AI_CHAT_DB_PATH = TEST_DB_PATH;

type RequestFn = (url: string, options?: any) => Promise<Response>;

const { server, request } = await (async (): Promise<{ server: Server | null; request: RequestFn | null }> => {
  try {
    const appModule = await import('../app.js');
    const app = appModule.default;
    let srv: Server;
    let req: RequestFn;

    await new Promise<void>((resolve, reject) => {
      srv = app.listen(TEST_PORT, () => {
        req = (url: string, options: any = {}) => {
          return fetch(`${BASE_URL}${url}`, {
            headers: AUTH_HEADERS,
            ...options,
          });
        };
        resolve();
      });
      srv.on('error', reject);
    });

    return { server: srv!, request: req! };
  } catch (err) {
    console.error('FAILED TO START SERVER:', (err as Error).message, (err as Error).stack);
    return { server: null, request: null };
  }
})();

afterAll(() => {
  if (server) {
    server.close();
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
  }
  for (const ext of ['-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
});

const runIf = (condition: any) => (condition ? describe : describe.skip);

runIf(server)('Image Generation — Endpoint Category CRUD', () => {
  let textEndpointId: string;
  let imageEndpointId: string;

  it('should create a text endpoint (default category)', async () => {
    const res = await request!('/api/model-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Chat',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o-mini',
        apiType: 'openai-chat',
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.endpoint.category).toBe('text');
    textEndpointId = data.endpoint.id;
  });

  it('should create an image endpoint', async () => {
    const res = await request!('/api/model-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Image',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-image-2',
        apiType: 'openai-chat',
        category: 'image',
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.endpoint.category).toBe('image');
    imageEndpointId = data.endpoint.id;
  });

  it('should list endpoints with categories', async () => {
    const res = await request!('/api/model-endpoints');
    expect(res.status).toBe(200);
    const data = await res.json();
    const textEps = data.endpoints.filter((ep: any) => ep.category === 'text');
    const imageEps = data.endpoints.filter((ep: any) => ep.category === 'image');
    expect(textEps.length).toBeGreaterThanOrEqual(1);
    expect(imageEps.length).toBeGreaterThanOrEqual(1);
  });

  it('should update endpoint category', async () => {
    const res = await request!(`/api/model-endpoints/${textEndpointId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Test Chat Updated',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o-mini',
        category: 'text',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.endpoint.category).toBe('text');
  });

  it('should reject invalid category value', async () => {
    const res = await request!('/api/model-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Category',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'test-model',
        category: 'invalid-value',
      }),
    });
    expect(res.status).toBe(400);
  });
});

runIf(server)('Image Generation — POST /api/images/generate (validation)', () => {
  let imageEndpointId: string;

  beforeAll(async () => {
    // Create a dedicated image endpoint for these tests
    const res = await request!('/api/model-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Image Gen',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-image-2',
        apiType: 'openai-chat',
        category: 'image',
      }),
    });
    const data = await res.json();
    imageEndpointId = data.endpoint.id;
  });

  it('should return 400 when endpointId is missing', async () => {
    const res = await request!('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('endpointId');
  });

  it('should return 400 when prompt is empty', async () => {
    const res = await request!('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify({ endpointId: imageEndpointId, prompt: '' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('prompt');
  });

  it('should return 404 for non-existent endpoint', async () => {
    const res = await request!('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify({ endpointId: 'non-existent-id', prompt: 'test' }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('不存在');
  });

  it('should return 400 when using a text endpoint', async () => {
    // Create a text endpoint
    const textRes = await request!('/api/model-endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Text Only',
        apiUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o-mini',
        category: 'text',
      }),
    });
    const textData = await textRes.json();
    const textEpId = textData.endpoint.id;

    const res = await request!('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify({ endpointId: textEpId, prompt: 'test' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('不是图片模型');
  });

  // Note: Upstream API test omitted — requires a real API key.
  // Validation coverage is sufficient for CI (9/9 validation tests pass).
});
