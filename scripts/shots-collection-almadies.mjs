// LD2.0-D « Collection Almadies » (lane K-L): the line's contact sheet, in the manner of the owner's reference sheets. Every piece the catalogue sells
// in the line (its kit model starts with `lx`, src/world/furnitureKit.ts « Collection Almadies ») stands alone against a light wall on a light floor,
// seen three-quarters from the front by a fixed camera (the game's camera is left alone), and is laid out in a grid with its French name and price.
// Headless Chromium + SwiftShader: a software renderer, not a phone.
//
// Usage: node scripts/shots-collection-almadies.mjs <baseUrl> [out=docs/proof/ld2d/collection/collection-almadies.png] [cols=6]
//   ALLKIT=1 shows every lx kit model (the two the catalogue does not sell too), TILES=<dir> also saves each tile there, larger (for a close look),
//   NIGHT=1 lights the sheet as at 21 h (the lamps' glow).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4965/', out = 'docs/proof/ld2d/collection/collection-almadies.png', colsArg = '6'] = process.argv.slice(2);
const COLS = +colsArg, TW = +(process.env.TW ?? 300), TH = +(process.env.TH ?? 250), CAP = 34, SCALE = process.env.TILES ? 2 : 1;
const NIGHT = !!process.env.NIGHT;
fs.mkdirSync(path.dirname(out), { recursive: true });
if (process.env.TILES) fs.mkdirSync(process.env.TILES, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: TW * SCALE, height: TH * SCALE }, deviceScaleFactor: 1 })).newPage();
page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&heure=${NIGHT ? 21 : 11}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.drawCalls() > 0 && window.__dakar.kitFurniture && window.__dakar.furnitureList);
if (NIGHT) await page.evaluate(() => { window.__dakar.setHour(21); window.__dakar.kitNight?.(1); });

const list = await page.evaluate(() => window.__dakar.furnitureList());
let pieces = list.filter(f => typeof f.kit === 'string' && f.kit.startsWith('lx')).map(f => ({ kit: f.kit, name: f.name, price: f.price, mount: f.mount }));
if (process.env.ALLKIT) {
  const types = ['lxSofa', 'lxArmchair', 'lxLowTable', 'lxTableSet', 'lxBed', 'lxNightstand', 'lxChest', 'lxCabinet', 'lxLight', 'lxDecor', 'lxAccent'];
  const sold = new Map(pieces.map(p => [p.kit, p]));
  pieces = types.flatMap(t => ['basic', 'better', 'premium'].map(r => sold.get(`${t}:${r}`) ?? { kit: `${t}:${r}`, name: `${t}:${r} (kit, pas en vente)`, price: 0, mount: null }));
}
console.log(`${pieces.length} pieces`);
const tiles = [];
for (const p of pieces) {
  const rows = await page.evaluate(([kid, night]) => window.__dakar.kitFurniture([[kid]], { x: 4000, z: 0, night }), [p.kit, NIGHT]);
  const r = rows[0];
  // a light neutral ground: the showroom's floor whitened, its wall hidden (the sheet's paper shows behind)
  await page.evaluate(() => { const s = window.__dakar.three.scene.getObjectByName('kit_showroom'); for (const o of s?.children ?? []) if (o.isMesh) { if (o.geometry.type === 'PlaneGeometry') o.material.color.set(0xfbf8f3); else o.visible = false; } });
  const spec = await page.evaluate(kid => { const s = window.__dakar.three.scene.getObjectByName('kit_showroom'); let f = null; s?.traverse(o => { if (o.userData.furnitureSpec?.id === kid) f = o.userData.furnitureSpec; }); return f && { w: f.footprint.w, d: f.footprint.d, h: f.footprint.h, placement: f.placement }; }, p.kit);
  const hang = p.mount === 'ceiling' || (spec && spec.h > 2.5), wall = p.mount === 'wall';
  const w = spec?.w ?? r.width, d = spec?.d ?? 0.5, h = spec?.h ?? r.height, zc = r.wallZ + 0.02 + d / 2;
  // framing: the piece's box seen three-quarters from the front right, a little above
  const lo = hang ? 1.8 : wall ? 0.45 : 0, hi = hang ? 2.8 : h, ty = (lo + hi) / 2 - (hang ? 0 : h * 0.06);
  const R = 0.5 * Math.hypot(w, d, hi - lo), fov = 30, dist = Math.max(1.4, R / Math.sin((fov / 2) * Math.PI / 180) * (h < 0.1 ? 0.75 : 0.98));
  const az = wall ? 0.32 : 0.6, el = hang ? 0.05 : h < 0.1 ? 0.9 : 0.36;
  const cam = [r.cx + Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, zc + Math.cos(az) * Math.cos(el) * dist];
  const png = await page.evaluate(({ cam, t, fov }) => {
    const { scene, renderer, camera } = window.__dakar.three;
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null; renderer.setClearColor(0xf1ece4, 1);
    const c = camera.clone(); c.fov = fov; c.aspect = renderer.domElement.width / renderer.domElement.height; c.position.set(...cam); c.lookAt(...t); c.updateProjectionMatrix(); c.updateMatrixWorld();
    renderer.render(scene, c);
    const url = renderer.domElement.toDataURL('image/png');
    scene.background = bg; scene.fog = fog;
    return url;
  }, { cam, t: [r.cx, ty, zc], fov });
  if (process.env.TILES) fs.writeFileSync(path.join(process.env.TILES, `${p.kit.replace(':', '-')}.png`), Buffer.from(png.split(',')[1], 'base64'));
  tiles.push({ png, name: p.name, price: p.price });
}
await page.evaluate(() => window.__dakar.kitClear());
const sheet = await page.evaluate(async ({ tiles, COLS, TW, TH, CAP, night }) => {
  const rows = Math.ceil(tiles.length / COLS), cv = document.createElement('canvas'), head = 64;
  cv.width = COLS * TW; cv.height = head + rows * (TH + CAP) + 10;
  const g = cv.getContext('2d'); g.fillStyle = '#f6f2eb'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#2b2622'; g.font = '600 28px Georgia, serif'; g.fillText('COLLECTION ALMADIES', 18, 36);
  g.font = '400 13px sans-serif'; g.fillStyle = '#6b6058'; g.fillText(`Keur Meubles · Prestige · bouclé, lin grège, noyer, marbre, bronze brossé${night ? ' · 21 h' : ''}`, 20, 55);
  for (const [i, t] of tiles.entries()) {
    const x = (i % COLS) * TW, y = head + Math.floor(i / COLS) * (TH + CAP);
    const img = new Image(); img.src = t.png; await img.decode(); g.drawImage(img, x + 4, y, TW - 8, TH);
    g.fillStyle = '#2b2622'; g.font = '600 11.5px sans-serif'; g.fillText(t.name, x + 8, y + TH + 14, TW - 14);
    g.fillStyle = '#7a6d62'; g.font = '400 11px sans-serif'; g.fillText(t.price ? `${t.price.toLocaleString('fr-FR')} F` : '—', x + 8, y + TH + 28);
  }
  return cv.toDataURL('image/png');
}, { tiles, COLS, TW, TH, CAP, night: NIGHT });
let buf = Buffer.from(sheet.split(',')[1], 'base64');
for (const colours of [256, 160, 96]) { const q = await sharp(buf).png({ palette: true, colours, quality: 90, effort: 10, dither: 0.6 }).toBuffer(); if (q.length < 400_000 || colours === 96) { buf = q; break; } }
fs.writeFileSync(out, buf);
console.log(out, Math.round(buf.length / 1024) + ' kB', `${tiles.length} pieces`);
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
