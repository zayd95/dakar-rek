// LD2.0-E (docs/ld2/LD2_E.md): each design of the Almadies district pictured on its own, in the district viewer (tools/district-viewer/,
// src/world/almadies/viewer.ts), in a real browser: front, from the street (eye level), back, side, the aerial, a close-up, and the front at night; the cost
// of each (draw calls, triangles on the medium preset and on the low one). PNG under 400 kB, plus cost.json.
// Usage: node scripts/shots-district-designs.mjs [outDir=docs/proof/ld2e/designs] [--kind house,villa,hotel,residence] [--only id,id] [--views front,street,...] [--url http://…]
//   Builds the viewer with vite (vite.district.config.ts) into a temporary folder and serves it on DISTRICT_PORT (default 4995) unless --url is given.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const KINDS = (flag('--kind') ?? 'house,villa,hotel,residence').split(','), ONLY = (flag('--only') ?? '').split(',').filter(Boolean), URL0 = flag('--url');
const VIEWS = (flag('--views') ?? 'front,street,back,side,aerial,close').split(',');
const OUT = args[0] || 'docs/proof/ld2e/designs', PORT = Number(process.env.DISTRICT_PORT || 4995);
fs.mkdirSync(OUT, { recursive: true });
let server = null, base = URL0;
if (!base) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'district-'));
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.district.config.ts', '--outDir', dir, '--logLevel', 'warn'], { stdio: 'inherit' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(dir, p), (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); r.end(b); } }); });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  base = `http://127.0.0.1:${PORT}/`;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(300000);
await page.goto(base, { timeout: 120000 });
await page.waitForFunction(() => window.district?.ready, null, { timeout: 120000 });
const list = (await page.evaluate(() => window.district.list())).filter(v => KINDS.includes(v.kind) && (!ONLY.length || ONLY.includes(v.id)));
const cost = {};
for (const v of list) {
  const base = { kind: v.kind, size: v.size, variant: v.index };
  const pic = async (name, o) => {
    const r = await page.evaluate(o => window.district.show(o), { ...base, ...o });
    await page.waitForTimeout(120);
    let png = await sharp(await page.screenshot()).png({ compressionLevel: 9 }).toBuffer();
    if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(`${OUT}/${v.id}-${name}.png`, png);
    return { r, kB: Math.round(png.length / 1024) };
  };
  const row = { name: v.name, kind: v.kind, size: v.size, views: {} };
  for (const view of VIEWS) { const x = await pic(view, { view }); row.views[view] = x.kB; if (view === 'front') row.medium = x.r.drawn, row.info = { colliders: x.r.colliders, signs: x.r.signs, tallest: x.r.tallest }; }
  const nt = await pic('night', { view: 'front', night: true }); row.views.night = nt.kB;
  row.low = (await page.evaluate(o => window.district.show(o), { ...base, view: 'front', lite: true })).drawn;
  cost[v.id] = row;
  console.log(`${v.id} (${v.name}): ${row.medium.tris} triangles, ${row.medium.calls} calls (low ${row.low.tris}); ${Object.keys(row.views).length} pictures`);
}
fs.writeFileSync(`${OUT}/cost.json`, JSON.stringify({ at: new Date().toISOString(), cost, errors }, null, 1));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close(); server?.close();
