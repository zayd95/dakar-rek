import { defineConfig, type Plugin } from 'vite';
import { buildId } from './buildId';
import { showcaseDefine } from './showcaseFlag';
declare const process: { env: Record<string, string | undefined> };

/**
 * MOBILE-01: the build for a private device playtest (scripts/build-preview.mjs, docs/mobile/MOBILE-01.md). The same game as `vite build` (same target, same code splitting, files
 * fetched by relative path, so it runs from any folder), with four differences that are all about telling the build apart and measuring it:
 *  - the build id says it is a playtest build (`<commit>-<date>-apercu`) and `__BASE_COMMIT__` names the accepted candidate it was made from;
 *  - « Mesure de fluidité » starts on (src/core/frameStats.ts; the player can switch it off in Réglages);
 *  - the owner's showcase start is compiled in (VITE_OWNER_SHOWCASE=1 in the environment, as for `build:showcase`): its own save, so the player's real game is never touched;
 *  - a few lines of script in the page's head say on screen what stopped the game from starting (a blocked script, a refused file), because nobody can open a console on a phone.
 * Nothing here changes how the game plays.
 */
const base = process.env.MOBILE_BASE_COMMIT ?? '';
const id = `${buildId()}-apercu`;

/** Runs before the game's own script. Shows a dismissable (tap) red box with the build on a failure to load or an uncaught error; says nothing otherwise. */
const BOOT = `(function(){var box,info='Dakar Rek aperçu · build ${id}${base ? ` · candidat ${base.slice(0, 8)}` : ''}';
function show(m){try{if(!box){box=document.createElement('pre');box.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:99999;margin:0;padding:8px;max-height:60vh;overflow:auto;background:#4a0d0d;color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;border-radius:8px';box.textContent=info+'  (toucher pour fermer)\\n';box.onclick=function(){box.remove();box=null};(document.body||document.documentElement).appendChild(box);}box.textContent+=m+'\\n';}catch(e){}}
window.addEventListener('error',function(e){var t=e.target;if(t&&t!==window){if(t.tagName==='SCRIPT'||t.tagName==='LINK')show('Fichier non chargé : '+(t.src||t.href));return;}show('Erreur : '+(e.message||'?')+' ('+String(e.filename||'').split('/').pop()+':'+e.lineno+')');},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('Promesse rejetée : '+(r&&r.message||r));});
document.addEventListener('securitypolicyviolation',function(e){show('Refusé par la politique de sécurité : '+e.violatedDirective+' '+e.blockedURI);});})();`;

const bootDiagnostics: Plugin = { name: 'mobile-01-boot-diagnostics', transformIndexHtml: () => [{ tag: 'script', children: BOOT, injectTo: 'head-prepend' }] };

export default defineConfig({
  base: './',
  plugins: [bootDiagnostics],
  define: {
    __BUILD_ID__: JSON.stringify(id),
    __BASE_COMMIT__: JSON.stringify(base),
    'import.meta.env.VITE_MEASURE_DEFAULT': JSON.stringify('1'),
    ...showcaseDefine(),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 9000, outDir: process.env.PREVIEW_OUT ?? 'dist-preview', emptyOutDir: true },
});
