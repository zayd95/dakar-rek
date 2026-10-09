// Lineup and turntable captures of the 3D asset kits (vehicles, furniture), day and night, in the real renderer.
// Usage: node scripts/shots-assets.mjs [baseUrl] [outDir] [filter]
//   needs a running build (npx vite preview --port 4215); filter = substring of the shot names to capture (optional).
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4215/';
const out = process.argv[3] ?? 'docs/screenshots/assets';
const only = process.argv[4] ?? '';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'high'); } catch { /* */ } });
await page.goto(`${base}?debug`, T);
await page.waitForFunction(() => window.__dakar?.pos().hub && window.__dakar.kitShowroom && window.__dakar.drawCalls() > 0, null, T);
await page.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; window.__dakar.teleport('almadies'); });
await page.waitForTimeout(800);
const d = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.evaluate(() => new Promise(r => { let n = 0; const f = () => (++n < 4 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }));
const want = name => !only || name.includes(only);
const done = [];
async function shot(name, cam, hour) {
  if (!want(name)) return;
  await d(([c, h]) => { window.__dakar.setHour(h); window.__dakar.kitNight(h >= 19 || h < 6 ? 1 : 0); window.__dakar.cam(c.p, c.t); }, [cam, hour]);
  await settle(); await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.jpg`, quality: 82 });
  done.push(name); console.log('shot', name);
}
/** Put the (hidden) player near the lineup so the sun's shadow box covers it. */
const anchorPlayer = (x, z) => d(([x, z]) => { const d = window.__dakar; d.place(x, z, 0); const b = d.body(); if (b) b.group.scale.setScalar(0.0001); }, [x, z]);

// ---------------------------------------------------------------------------------------------- vehicles
const KINDS = ['carRapide', 'bus', 'taxi', 'moto', 'sedan', 'suv', 'luxury', 'pickup', 'truck'];
if (!only || !/^(furn|room)/.test(only)) {
  const spots = await d(k => window.__dakar.kitShowroom({ vehicles: k.map((kind, i) => ({ kind, seed: 3 + i })), gap: 5 }), KINDS);
  const mid = (spots[0].x + spots[spots.length - 1].x) / 2;
  await anchorPlayer(mid, 30);
  for (const h of [10, 21]) await shot(`vehicles-lineup-${h === 10 ? 'day' : 'night'}`, { p: [mid + 6, 16, 34], t: [mid, 0.8, 0] }, h);
  for (const s of spots) {
    const L = s.length, H = s.height, k = Math.max(L, 2.6);
    await shot(`vehicle-${s.kind}-front-day`, { p: [s.x + k * 0.75, 1.3 + H * 0.35, k * 0.95], t: [s.x, H * 0.42, 0] }, 10);
    await shot(`vehicle-${s.kind}-rear-day`, { p: [s.x - k * 0.7, 1.5 + H * 0.4, -k * 0.95], t: [s.x, H * 0.42, 0] }, 16);
    await shot(`vehicle-${s.kind}-front-night`, { p: [s.x + k * 0.6, 1.4 + H * 0.3, k * 1.15], t: [s.x, H * 0.35, k * 0.25] }, 21);
  }
  // variants: car rapide liveries, car colours, motorbikes (rider, pillion, scooter, parked), far LOD next to near
  const rows = {
    'variants-carRapide': [1, 2, 4, 6].map(seed => ({ kind: 'carRapide', seed })),
    'variants-cars': [['sedan', 1], ['sedan', 5], ['taxi', 2], ['taxi', 3], ['luxury', 2], ['suv', 4], ['pickup', 7]].map(([kind, seed]) => ({ kind, seed })),
    'variants-moto': [1, 2, 3, 4, 5, 6].map(seed => ({ kind: 'moto', seed, opts: seed === 6 ? { driver: false } : {} })),
    'lod-near-far': ['carRapide', 'sedan', 'moto', 'bus'].flatMap(kind => [{ kind, seed: 3 }, { kind, seed: 3, opts: { lod: 'far' } }]),
  };
  for (const [name, vehicles] of Object.entries(rows)) {
    if (!want(name)) continue;
    const sp = await d(v => window.__dakar.kitShowroom({ vehicles: v, gap: 2.2 }), vehicles);
    const a = sp[0].x - sp[0].width / 2, b = sp[sp.length - 1].x + sp[sp.length - 1].width / 2, m = (a + b) / 2, span = b - a;
    await anchorPlayer(m, 30);
    await shot(name, { p: [m + span * 0.1, 3 + span * 0.12, span * 0.62 + 4], t: [m, 0.9, 0] }, 10);
  }
  await d(() => window.__dakar.kitClear());
}

// ---------------------------------------------------------------------------------------------- furniture
const TYPES = ['bed', 'sofa', 'armchair', 'plasticChair', 'woodenChair', 'table', 'lowTable', 'desk', 'tv', 'wardrobe', 'shower', 'kitchen', 'fan', 'rug', 'lamp', 'shelf', 'mirror', 'attaya', 'prayerMat'];
const NIGHT_TYPES = new Set(['lamp', 'tv', 'kitchen', 'bed', 'sofa']);
for (const t of TYPES) {
  for (const night of [false, true]) {
    const name = `furniture-${t}-${night ? 'night' : 'day'}`;
    if (!want(name) || (night && !NIGHT_TYPES.has(t))) continue;
    const [row] = await d(([t, night]) => window.__dakar.kitFurniture([['basic', 'better', 'premium'].map(r => `${t}:${r}`)], { night }), [t, night]);
    await anchorPlayer(row.cx, row.wallZ + 25);
    const dist = Math.max(3.4, row.width * 0.72 + 1.4), h = Math.max(0.6, row.height);
    await shot(name, { p: [row.cx + row.width * 0.08, 1.2 + h * 0.55, row.wallZ + dist], t: [row.cx, h * 0.38, row.wallZ + 0.5] }, night ? 21 : 12);
  }
}
for (const night of [false, true]) {
  if (!want(`rooms-${night ? 'night' : 'day'}`) && !want('room-')) continue;
  const rooms = await d(n => window.__dakar.kitRooms({ night: n }), night);
  await anchorPlayer(rooms[1].cx, rooms[1].cz + 20);
  for (const r of rooms) await shot(`room-${r.tier}-${night ? 'night' : 'day'}`, { p: [r.cx + 5.2, 5.2, r.cz + 6.2], t: [r.cx - 0.2, 0.4, r.cz - 0.6] }, night ? 21 : 11);
}
await d(() => window.__dakar.kitClear());

console.log(JSON.stringify({ shots: done.length, errors }));
await browser.close();
if (errors.length) process.exitCode = 1;
