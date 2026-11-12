// Which triangles of a body can be seen from outside the car? Writes the list prepare-vehicle-glb.mjs reads as `cull` (the others are not shipped).
// Usage: node scripts/vehicles/visible-triangles.mjs <split.glb under the project> <out.json> [directions=220]
// (dev server on 5199: npx vite --port 5199). Every triangle is drawn in a flat colour of its own from many directions (proof/vehicles/glbvis.ts); the wheels are
// listed too but never culled by the build (they turn: what faces the arch now will not stay there).
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, src, out, dirs = '220'] = process.argv;
if (!src || !out) { console.error('usage: node scripts/vehicles/visible-triangles.mjs <split.glb under the project> <out.json> [directions]'); process.exit(2); }
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 640 } }); p.setDefaultTimeout(600000); p.on('pageerror', e => console.log('PAGEERR', String(e)));
await p.goto('http://127.0.0.1:5199/proof/vehicles/glbvis.html'); await p.waitForFunction(() => window.ready);
const r = await p.evaluate(([s, d]) => window.visible(s, Number(d)), ['/' + src, dirs]);
console.log(r.total, 'triangles;', r.meshes.map(m => `${m.name} ${m.visible.length}/${m.tris}`).join(' · '));
fs.writeFileSync(out, JSON.stringify(r)); await b.close();
