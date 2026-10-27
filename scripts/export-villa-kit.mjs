// LD2.0-D round 2, lane R2-E: the Almadies villa kit (src/kits/almadiesVilla.ts) pictured and saved, piece by piece, for its catalogue
// (docs/kits/ALMADIES_VILLA_KIT.md): each piece built on its own in the kit's viewer page (tools/kit-viewer/, src/kits/viewer.ts) in a real browser
// (three's GLTFExporter needs the browser's FileReader), a picture of it (PNG < 400 kB), what it costs to draw, and its GLB file (all GLB < 10 MB).
// Easy to run again for one piece, e.g. once lane R2-H's helicopter is merged: node scripts/export-villa-kit.mjs --only helicopter
// Usage: node scripts/export-villa-kit.mjs [outDir=docs/kits/almadies-villa] [--only id,id] [--url http://127.0.0.1:4994/ (a viewer already served)]
//   Builds the viewer with vite (vite.kit.config.ts) into a temporary folder and serves it on KIT_PORT (default 4994) unless --url is given.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const ONLY = (flag('--only') ?? '').split(',').filter(Boolean), URL0 = flag('--url');
const OUT = args[0] || 'docs/kits/almadies-villa', GLB = `${OUT}/glb`, PORT = Number(process.env.KIT_PORT || 4994);
fs.mkdirSync(GLB, { recursive: true });
const want = id => !ONLY.length || ONLY.includes(id);

// ------------------------------------------------------------------ the viewer: built and served here unless given
let server = null, base = URL0;
if (!base) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'villa-kit-'));
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.kit.config.ts', '--outDir', dir, '--logLevel', 'warn'], { stdio: 'inherit' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(dir, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  base = `http://127.0.0.1:${PORT}/`;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(300000);
await page.goto(base, { timeout: 120000 });
await page.waitForFunction(() => window.kit?.ready, null, { timeout: 120000 });

/** A picture of a piece (the viewer's canvas), under 400 kB; returns what it costs to draw. */
async function picture(file, id, spec = {}, view = {}, night = false) {
  const c = await page.evaluate(([id, spec, view, night]) => window.kit.show(id, spec, view, night), [id, spec, view, night]);
  await page.waitForTimeout(150);
  let png = await sharp(await page.screenshot()).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${OUT}/${file}.png`, png);
  console.log(`picture ${file}.png ${Math.round(png.length / 1024)} kB · ${c.draws} meshes, ${c.tris} triangles`);
  return { ...c, png: `${file}.png`, pngBytes: png.length };
}
/** The piece's GLB file. */
async function save(id, spec = {}) {
  const r = await page.evaluate(([id, spec]) => window.kit.glb(id, spec), [id, spec]);
  fs.writeFileSync(`${GLB}/${id}.glb`, Buffer.from(r.base64, 'base64'));
  console.log(`glb ${id}.glb ${Math.round(r.bytes / 1024)} kB`);
  return r.bytes;
}

// the views: from the street side (+z) and the east by default; [direction, framing]
const FROM_BEHIND = { dir: [0.55, 0.65, -1] }, ABOVE = { dir: [0.25, 1.6, 0.6] };
const PIECES = {
  facade: { fit: 0.62 }, wall: { dir: [0.5, 0.95, 1], fit: 0.6 }, carGate: { dir: [0.35, 0.3, 1], fit: 0.6 }, entrance: { dir: [0.45, 0.35, 1], fit: 0.62 },
  bays: { dir: [0.35, 1.1, 1], fit: 0.62 }, frontGarden: { dir: [0.4, 0.9, 1], fit: 0.6 }, poolDeck: { ...FROM_BEHIND, fit: 0.6 }, pergola: { dir: [0.7, 0.6, 1], fit: 0.65 },
  helipad: { ...ABOVE, fit: 0.62 }, helicopter: { dir: [0.9, 0.5, 1], fit: 0.62 },
};
const VARIANT = { mirror: true, storeys: 3, pool: false, helipad: false, number: '12', palette: { render: 0xefe2cc, travertine: 0xcdb08a, clad: 0xcdb08a, wall: 0xece2d2, slat: 0x5a4636, frame: 0x3c2e24, door: 0x6e4428, bloom: 0xd8643a, bloom2: 0xe98a52 } };
const kit = { generated: new Date().toISOString().slice(0, 10), viewer: 'tools/kit-viewer (src/kits/viewer.ts)', pieces: [], villa: null, variant: null };
const pieces = await page.evaluate(() => window.kit.pieces());
const prior = fs.existsSync(`${OUT}/kit.json`) ? JSON.parse(fs.readFileSync(`${OUT}/kit.json`, 'utf8')) : null;
for (const p of pieces) {
  if (!want(p.id)) { const was = prior?.pieces.find(q => q.id === p.id); if (was) kit.pieces.push(was); continue; }
  const shot = p.id === 'plan' ? await picture(p.id, 'plan-rdc', {}, { dir: [0.35, 1.5, 0.8], fit: 0.6 }) : p.id === 'furniture' ? await picture(p.id, 'furniture-rdc', {}, { dir: [0.35, 1.5, 0.8], fit: 0.6 }) : await picture(p.id, p.id, {}, PIECES[p.id]);
  // what the whole piece costs (the plan and the furniture: all three levels, as saved), and its file
  const whole = p.id === 'plan' || p.id === 'furniture' ? await page.evaluate(id => window.kit.show(id, {}, {}, false), p.id) : shot;
  kit.pieces.push({ ...p, picture: shot.png, meshes: whole.draws, tris: whole.tris, verts: whole.verts, size: whole.size, glb: `glb/${p.id}.glb`, glbBytes: await save(p.id) });
}
if (want('villa')) {
  const day = await picture('villa-day', 'villa', {}, { dir: [0.75, 0.6, 1], fit: 0.62 }), night = await picture('villa-21h', 'villa', {}, { dir: [0.75, 0.6, 1], fit: 0.62 }, true);
  await picture('villa-back', 'villa', {}, { ...FROM_BEHIND, fit: 0.62 });
  kit.villa = { picture: day.png, night: night.png, meshes: day.draws, tris: day.tris, verts: day.verts, size: day.size, glb: 'glb/villa.glb', glbBytes: await save('villa') };
} else kit.villa = prior?.villa ?? null;
if (want('variant')) {
  const v = await picture('villa-variant', 'villa', VARIANT, { dir: [0.75, 0.6, 1], fit: 0.62 });
  kit.variant = { spec: VARIANT, picture: v.png, meshes: v.draws, tris: v.tris };
} else kit.variant = prior?.variant ?? null;
// the finishes' textures (the travertine and marble slabs, the oak boards, the window view), as drawn in code
if (want('finishes')) {
  fs.mkdirSync(`${OUT}/finishes`, { recursive: true });
  for (const [k, url] of Object.entries(await page.evaluate(() => window.kit.finishes()))) fs.writeFileSync(`${OUT}/finishes/${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
const total = fs.readdirSync(GLB).filter(f => f.endsWith('.glb')).reduce((s, f) => s + fs.statSync(`${GLB}/${f}`).size, 0);
kit.glbTotalBytes = total;
fs.writeFileSync(`${OUT}/kit.json`, JSON.stringify(kit, null, 1) + '\n');
await browser.close(); server?.close();
console.log(`\nGLB total ${(total / 1048576).toFixed(2)} MB (limit about 10 MB) · page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
const big = fs.readdirSync(OUT).filter(f => f.endsWith('.png') && fs.statSync(`${OUT}/${f}`).size >= 400_000);
process.exit(total < 10 * 1048576 && !errors.length && !big.length ? 0 : 1);
