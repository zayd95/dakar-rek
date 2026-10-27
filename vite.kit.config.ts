import { defineConfig } from 'vite';
import { showcaseDefine } from './showcaseFlag';
/** LD2.0-D round 2: the Almadies villa kit's viewer page (tools/kit-viewer/, src/kits/viewer.ts), built apart from the game by scripts/export-villa-kit.mjs. */
export default defineConfig({ root: 'tools/kit-viewer', base: './', define: { __BUILD_ID__: JSON.stringify('kit'), ...showcaseDefine() }, build: { target: 'es2022', emptyOutDir: true, chunkSizeWarningLimit: 9000 } });
