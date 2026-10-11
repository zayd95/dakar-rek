import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
});
