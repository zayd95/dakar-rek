import { defineConfig, type Plugin } from 'vite';
import { buildCommit, buildId } from './buildId';
import { showcaseDefine } from './showcaseFlag';
/**
 * Release 1.0: every build carries `version.json` next to the page (the commit it was built from, its build id, when), so the public game can be tied to its source
 * by anyone with the link: `<the game's address>/version.json`. Nothing private in it.
 */
const versionFile = (mode: string): Plugin => ({
  name: 'dakar-rek-version-file', apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ name: 'Dakar Rek', commit: buildCommit(), buildId: buildId(), mode, builtAtUtc: new Date().toISOString() }, null, 2) + '\n' }); },
});
export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [versionFile(mode)],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId() : 'dev'), ...showcaseDefine() },   // LD2.0-D: the owner's showcase only with VITE_OWNER_SHOWCASE=1 (showcaseFlag.ts)
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
}));
