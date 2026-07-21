import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const isElectronBuild = process.env.ELECTRON === 'true';

export default defineConfig({
  plugins: [react()],
  base: isElectronBuild ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5800,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'markdown-vendor': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'rehype-sanitize', 'hast-util-sanitize'],
        },
      },
    },
  },
});
