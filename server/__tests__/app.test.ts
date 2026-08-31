import { describe, expect, it } from 'vitest';

process.env.AI_CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.AI_CHAT_DB_PATH = '/tmp/ai-chat-cors-test.db';

const { isAllowedCorsOrigin } = await import('../app.js');

describe('CORS policy', () => {
  it('allows the development client origin', async () => {
    expect(isAllowedCorsOrigin('http://localhost:5800')).toBe(true);
  });

  it('does not grant CORS headers to an unrelated origin', async () => {
    expect(isAllowedCorsOrigin('https://untrusted.example')).toBe(false);
  });
});
