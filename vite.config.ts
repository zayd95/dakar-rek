import { defineConfig } from 'vite';
import { buildId } from './buildId';
export default defineConfig(({ command }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev') },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
}));
