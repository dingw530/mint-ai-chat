import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    env: {
      AI_CHAT_LOG_LEVEL: 'debug',
    },
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
  },
});
