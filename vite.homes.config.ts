import { defineConfig } from 'vite';
import { showcaseDefine } from './showcaseFlag';
/** The home kit's viewer page (tools/home-viewer/, src/housing/kit/viewer.ts), built apart from the game by scripts/shots-home-kit.mjs. */
export default defineConfig({ root: 'tools/home-viewer', base: './', define: { __BUILD_ID__: JSON.stringify('homes'), ...showcaseDefine() }, build: { target: 'es2022', emptyOutDir: true, chunkSizeWarningLimit: 9000 } });
