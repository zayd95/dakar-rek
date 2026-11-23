// One sheet of every vehicle body the game owns, labelled with what the player can do with it: node scripts/vehicles/shoot-coverage.mjs [outFile=docs/vehicles/coverage.jpg]
// (dev server on 5199: npx vite --port 5199). Each body is drawn by the game itself (the kit's procedural models and the prepared GLB), in a three-quarter view.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const out = process.argv[2] ?? 'docs/vehicles/coverage.jpg';
fs.mkdirSync(out.replace(/\/[^/]*$/, '') || '.', { recursive: true });
const ITEMS = [
  { kind: 'moto', seed: 8, label: 'Moto Jakarta', note: 'DRIVABLE · bought at Garage Modou, Pikine · kit body', ok: 1 },
  { kind: 'moto', seed: 2, label: 'Moto Tiak Tiak', note: 'DRIVABLE · lent, free, never owned · kit body', ok: 1 },
  { kind: 'moto', seed: 1, label: 'Scooter (cargo)', note: 'MODEL ONLY · no catalogue entry, no ride pose', ok: 0 },
  { glb: 'compacte', kind: 'sedan', seed: 14, label: 'Berline moderne', note: 'DRIVABLE · Ndiaye Auto, Plateau · generated GLB', ok: 1 },
  { kind: 'luxury', seed: 12, label: 'Berline neuve', note: 'DRIVABLE (new) · Prestige Auto, Almadies · kit body, interim', ok: 2 },
  { kind: 'suv', seed: 6, label: '4 × 4 de luxe', note: 'DRIVABLE (new) · Prestige Auto, Almadies · kit body, interim', ok: 2 },
  { kind: 'pickup', seed: 1, label: 'Pick-up', note: 'MODEL ONLY · traffic and deliveries, not a catalogue vehicle', ok: 0 },
  { kind: 'truck', seed: 1, label: 'Camion', note: 'MODEL ONLY · « Camion de livraison » stays « soon »', ok: 0 },
];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } }); p.setDefaultTimeout(240000);
await p.goto('http://127.0.0.1:5199/?debug&vehicleModel=kit'); await p.waitForFunction(() => window.__dakar?.pos?.().hub);
await p.evaluate(() => { window.__dakar.setHour(11); document.body.querySelectorAll(':scope > *:not(canvas):not(script)').forEach(e => { e.style.visibility = 'hidden'; }); });
const tiles = [];
for (const it of ITEMS) {
  const len = await p.evaluate(async it => {
    const D = window.__dakar; D.kitShowroom({ vehicles: it.glb ? [] : [{ kind: it.kind, seed: it.seed, opts: { driver: false, passengers: false } }], x: 4000, z: 0, gap: 30 });
    let length = 4.5;
    if (it.glb) { const g = await D.kitGlb(it.glb, it.kind, it.seed); g.position.set(4002, 0.02, 0); D.three.scene.getObjectByName('kit_showroom').add(g); }
    else length = D.kitSpec(it.kind, it.seed).length;
    return length;
  }, it);
  const f = Math.max(0.5, len / 4.5), cx = it.glb ? 4002 : await p.evaluate(() => { const r = window.__dakar.three.scene.getObjectByName('kit_showroom'); return r.children.find(c => c.userData.vehicleSpec)?.position.x ?? 4001; });
  await p.evaluate(([x, f]) => { window.__dakar.cam([x + 3.7 * f, 1.5 * f + 0.5, -4.5 * f], [x, 0.55 * f + 0.2, 0]); window.__dakar.render(); }, [cx, f]);
  await p.waitForTimeout(350);
  const shot = await sharp(await p.screenshot()).resize(600, 375).toBuffer();
  const col = it.ok === 1 ? '#1f7a3a' : it.ok === 2 ? '#b8860b' : '#9a2f2f';
  const label = Buffer.from(`<svg width="600" height="64"><rect width="600" height="64" fill="#15171c"/><rect width="8" height="64" fill="${col}"/><text x="20" y="27" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="700" fill="#fff">${it.label}</text><text x="20" y="52" font-family="Helvetica,Arial,sans-serif" font-size="14" fill="#cfd3da">${it.note}</text></svg>`);
  tiles.push(await sharp({ create: { width: 600, height: 439, channels: 3, background: '#000' } }).composite([{ input: shot, top: 0, left: 0 }, { input: label, top: 375, left: 0 }]).png().toBuffer());
}
const cols = 2, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 600 * cols + 6 * (cols - 1), height: 439 * rows + 6 * (rows - 1), channels: 3, background: '#0b0c0f' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 606, top: Math.floor(i / cols) * 445 }))).jpeg({ quality: 86 }).toFile(out);
console.log('wrote', out);
await b.close();
