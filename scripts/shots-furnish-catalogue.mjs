// LD2.0-C « Walkable Homes », lane F: the catalogue sheet of the furnishing upgrade. Every kit type the upgrade added (src/world/furnitureKit.ts
// HOME_TYPES) in its three grades, plus the kit's shelves and fans the catalogue now sells, each row against a plain wall, photographed by a fixed
// camera (the game's own camera is left alone) and laid out in a grid with the catalogue's names and prices.
// Headless Chromium + SwiftShader: a software renderer, not a phone.
//
// Usage: node scripts/shots-furnish-catalogue.mjs <baseUrl> <out.png> [cols=3]
//   (the PNG is then reduced to a 256-colour palette with Python PIL when it is there, to stay under 400 kB)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [base = 'http://127.0.0.1:4972/', out = 'docs/proof/ld2c/furnish/catalogue.png', colsArg = '3'] = process.argv.slice(2);
const COLS = +colsArg, TW = +(process.env.TW ?? 400), TH = +(process.env.TH ?? 250), CAP = 50;
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: TW, height: TH }, deviceScaleFactor: 1 })).newPage();
page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&heure=11`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.drawCalls() > 0 && window.__dakar.kitFurniture && window.__dakar.furnitureList);

const TYPES = ['dining', 'kitchenTable', 'microwave', 'waterDispenser', 'cooker', 'vanity', 'bathMirror', 'towelRail', 'floorLamp', 'pendant',
  'bedside', 'dresser', 'closet', 'wallArt', 'tvWall', 'audio', 'plant', 'lounger', 'parasol', 'gardenSet', 'shelf', 'fan'];
const list = await page.evaluate(() => window.__dakar.furnitureList());
const sold = kit => list.filter(f => f.kit === kit);
const tiles = [];
for (const type of TYPES) {
  const ids = ['basic', 'better', 'premium'].map(t => `${type}:${t}`);
  // the row against its wall, far from the hub; a fixed camera in front of it, a little above
  const rows = await page.evaluate(ids => window.__dakar.kitFurniture([ids], { x: 4000, z: 0 }), ids);
  const r = rows[0], hang = type === 'pendant', wall = ['bathMirror', 'towelRail', 'wallArt'].includes(type);
  const span = r.width + 1.5, fov = 38, aspect = TW / TH, tanH = Math.tan((fov / 2) * Math.PI / 180) * aspect;
  const dist = Math.max(span / 2 / tanH, (r.height + 0.5) / 2 / Math.tan((fov / 2) * Math.PI / 180)) * 0.98;
  const ty = hang ? 2.25 : wall ? 1.45 : Math.max(0.45, r.height * 0.42), py = hang ? 1.75 : ty + dist * 0.32;
  const png = await page.evaluate(({ p, t, fov }) => {
    const { scene, renderer, camera } = window.__dakar.three;
    const c = camera.clone(); c.fov = fov; c.aspect = renderer.domElement.width / renderer.domElement.height; c.position.set(...p); c.lookAt(...t); c.updateProjectionMatrix(); c.updateMatrixWorld();
    renderer.render(scene, c);
    return renderer.domElement.toDataURL('image/png');
  }, { p: [r.cx, py, r.wallZ + 0.6 + dist], t: [r.cx, ty, r.wallZ + 0.5], fov });
  const names = ids.map(k => sold(k).map(f => `${f.name} · ${f.price.toLocaleString('fr-FR')} F`).join(' / ') || '(kit)');
  tiles.push({ type, png, names });
}
await page.evaluate(() => window.__dakar.kitClear());
// the grid, drawn in the page (its fonts), saved as one PNG
const sheet = await page.evaluate(async ({ tiles, COLS, TW, TH, CAP }) => {
  const rows = Math.ceil(tiles.length / COLS), cv = document.createElement('canvas');
  cv.width = COLS * TW; cv.height = 40 + rows * (TH + CAP);
  const g = cv.getContext('2d'); g.fillStyle = '#f4efe6'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1f2937'; g.font = '700 20px sans-serif'; g.fillText('Keur Meubles · les nouveaux meubles (LD2.0-C) — Simple · Confort · Prestige', 12, 27);
  for (const [i, t] of tiles.entries()) {
    const x = (i % COLS) * TW, y = 40 + Math.floor(i / COLS) * (TH + CAP);
    const img = new Image(); img.src = t.png; await img.decode(); g.drawImage(img, x, y, TW, TH);
    g.fillStyle = '#ffffff'; g.fillRect(x, y + TH, TW, CAP);
    g.fillStyle = '#111114'; g.font = '700 12px sans-serif'; g.fillText(t.type, x + 6, y + TH + 14);
    g.font = '500 10.5px sans-serif'; g.fillStyle = '#374151';
    t.names.forEach((n, k) => g.fillText(['Simple', 'Confort', 'Prestige'][k] + ' : ' + n, x + 6, y + TH + 26 + k * 11, TW - 10));
    g.strokeStyle = '#d6cfc2'; g.strokeRect(x + 0.5, y + 0.5, TW - 1, TH + CAP - 1);
  }
  return cv.toDataURL('image/png');
}, { tiles, COLS, TW, TH, CAP });
const palette = f => { try { execFileSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGB"); im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)', f]); } catch (e) { console.log('palette:', e.message); } };
fs.writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64')); palette(out);
console.log(out, Math.round(fs.statSync(out).size / 1024) + ' kB', `${tiles.length} rows`);

// Keur Meubles (Pikine, Cité Jàmm): the new pieces on show, from fixed cameras (src/economy/citeJamm.ts; the block's corner is at x −53, z −113)
await page.setViewportSize({ width: 780, height: 520 }); await page.waitForTimeout(600);
await page.evaluate(() => { window.__dakar.teleport('pikine'); }); await page.waitForTimeout(3000);
await page.evaluate(() => { window.__dakar.setHour(11); window.__dakar.place(-44, -60.5, Math.PI); }); await page.waitForTimeout(4000);
const W = (u, v, y) => [-53 + u, y, -113 + v];
for (const [name, cam, at, fov] of [['keur-meubles-showroom', W(14.2, 40.6, 2.55), W(6.0, 35.2, 0.45), 70], ['keur-meubles-forecourt', W(9.5, 50.5, 2.4), W(12.5, 42.6, 0.7), 58]]) {
  const png = await page.evaluate(({ p, t, fov }) => {
    const { scene, renderer, camera } = window.__dakar.three;
    const c = camera.clone(); c.fov = fov; c.aspect = renderer.domElement.width / renderer.domElement.height; c.position.set(...p); c.lookAt(...t); c.updateProjectionMatrix(); c.updateMatrixWorld();
    renderer.render(scene, c);
    return renderer.domElement.toDataURL('image/png');
  }, { p: cam, t: at, fov });
  const f = path.join(path.dirname(out), `${name}.png`); fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64')); palette(f);
  console.log(f, Math.round(fs.statSync(f).size / 1024) + ' kB');
}
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
