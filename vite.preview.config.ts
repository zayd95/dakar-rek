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
 *  - a few lines of script in the page's head say on screen what stopped the game from starting (a blocked script, a refused file), because nobody can open a console on a phone;
 *  - a hosted page that serves no .glb gets them from one JSON file instead (GLB_SHIM below): the same bytes, so the vehicles and bodies are the real ones, not stand-ins.
 * Nothing here changes how the game plays.
 */
const base = process.env.MOBILE_BASE_COMMIT ?? '';
const id = `${buildId()}-apercu`;

/**
 * Some preview hosts (the claude.ai artifact page among them) serve no .glb file. scripts/build-preview.mjs then packs every GLB of the build into assets/glb-bundle.json (base64, one
 * entry per path below assets/) and this makes the game's own fetch of a .glb get its bytes from there: the vehicles, the characters and the bodies load exactly as they do from a plain
 * .glb, no loader is changed. A path the bundle does not hold (the optional car_rapide.glb) or a bundle that cannot be read goes to the real fetch, so a host that serves .glb still works.
 */
const GLB_SHIM = `(function(){var real=window.fetch.bind(window),bundle=null;
function key(u){u=String(u).split('?')[0].split('#')[0];var i=u.lastIndexOf('/assets/');return i>=0&&u.slice(-4)==='.glb'?u.slice(i+8):null;}
function load(){return bundle||(bundle=real(new URL('assets/glb-bundle.json',document.baseURI).href).then(function(r){if(!r.ok)throw new Error('bundle '+r.status);return r.json();}));}
window.fetch=function(input,init){var k=key(typeof input==='string'?input:(input&&input.url)||input);if(!k)return real(input,init);
return load().then(function(b){var s=b[k];if(!s)return real(input,init);var bin=atob(s),u8=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
return new Response(u8,{status:200,headers:{'content-type':'model/gltf-binary'}});},function(){return real(input,init);});};})();`;

/** Runs before the game's own script. Shows a dismissable (tap) red box with the build on a failure to load or an uncaught error; says nothing otherwise. */
const BOOT = `(function(){var box,info='Dakar Rek aperçu · build ${id}${base ? ` · candidat ${base.slice(0, 8)}` : ''}';
function show(m){try{if(!box){box=document.createElement('pre');box.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:99999;margin:0;padding:8px;max-height:60vh;overflow:auto;background:#4a0d0d;color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;border-radius:8px';box.textContent=info+'  (toucher pour fermer)\\n';box.onclick=function(){box.remove();box=null};(document.body||document.documentElement).appendChild(box);}box.textContent+=m+'\\n';}catch(e){}}
window.addEventListener('error',function(e){var t=e.target;if(t&&t!==window){if(t.tagName==='SCRIPT'||t.tagName==='LINK')show('Fichier non chargé : '+(t.src||t.href));return;}show('Erreur : '+(e.message||'?')+' ('+String(e.filename||'').split('/').pop()+':'+e.lineno+')');},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('Promesse rejetée : '+(r&&r.message||r));});
document.addEventListener('securitypolicyviolation',function(e){show('Refusé par la politique de sécurité : '+e.violatedDirective+' '+e.blockedURI);});})();`;

const bootDiagnostics: Plugin = {
  name: 'mobile-01-boot-diagnostics',
  transformIndexHtml: { order: 'pre', handler: html => ({ html: html.replace('<title>Dakar Rek</title>', '<title>Dakar Rek Playtest</title>'), tags: [{ tag: 'script', children: BOOT + GLB_SHIM, injectTo: 'head-prepend' }] }) },   // (its own name among the older previews)
};

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
