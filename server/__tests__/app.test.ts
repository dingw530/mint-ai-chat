import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';

process.env.AI_CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.AI_CHAT_DB_PATH = '/tmp/ai-chat-cors-test.db';

const { default: app } = await import('../app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe('CORS policy', () => {
  it('allows the development client origin', async () => {
    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5800',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5800');
  });

  it('does not grant CORS headers to an unrelated origin', async () => {
    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted.example',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
