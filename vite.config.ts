import { defineConfig } from 'vite';
import { buildId } from './buildId';
import { showcaseDefine } from './showcaseFlag';
export default defineConfig(({ command }) => ({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev'), ...showcaseDefine() },   // LD2.0-D: the owner's showcase only with VITE_OWNER_SHOWCASE=1 (showcaseFlag.ts)
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
}));
