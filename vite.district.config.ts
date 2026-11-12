import { defineConfig } from 'vite';
import { showcaseDefine } from './showcaseFlag';
/** LD2.0-E: the Almadies district's viewer page (tools/district-viewer/, src/world/almadies/viewer.ts), built apart from the game by scripts/shots-district-designs.mjs. */
export default defineConfig({ root: 'tools/district-viewer', base: './', define: { __BUILD_ID__: JSON.stringify('district'), ...showcaseDefine() }, build: { target: 'es2022', emptyOutDir: true, chunkSizeWarningLimit: 9000 } });
