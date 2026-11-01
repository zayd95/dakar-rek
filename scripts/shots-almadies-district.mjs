// LD2.0-E round 3 (docs/ld2/LD2_E.md decision 8): the same cameras as round 2 (before: docs/proof/ld2e/after/) plus the places the round put life in — the port's plaza, the gare's garden,
// the square's ring, an avenue's kerb, the hotels' and residences' bases. Pass `--only a,b` for some of the cameras.
// LD2.0-E (docs/ld2/LD2_E.md): the Almadies hub's streets pictured on a phone page (390 × 844) from free cameras, by day (10 h) and at 21 h, with what the
// view costs (draw calls and triangles of the whole frame). The same script pictures the hub before and after the district pass:
//   node scripts/shots-almadies-district.mjs <baseUrl> <outDir> [label]
// The cameras are in the hub's coordinates (blocks (i, j) at −113 + 60 i … + 46; the roads between them at −120, −60, 0, 60; the sea to the north, −z).
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const [base = 'http://127.0.0.1:4970/', out = 'docs/proof/ld2e/before', label = 'before'] = args.filter((a, i) => a !== '--only' && args[i - 1] !== '--only');
fs.mkdirSync(out, { recursive: true });
const SHOTS = {
  'aerial-south-east': { p: [120, 105, 130], t: [-10, 0, -20] },
  'aerial-sea-front': { p: [-20, 70, 40], t: [-20, 0, -70] },
  'street-west': { p: [52, 2.6, 3.5], t: [-30, 5, -6] },
  'street-north': { p: [3.6, 2.6, 52], t: [-4, 6, -30] },
  'crossing': { p: [14, 4.5, 14], t: [-6, 5, -14] },
  'villa-row': { p: [-44, 3, 6], t: [-44, 6, -20] },
  'corner-low': { p: [66, 1.8, 66], t: [40, 5, 40] },
  'sea-front-row': { p: [-90, 3, -52], t: [-90, 6, -90] },
  // round 3
  'port-plaza-aerial': { p: [30, 38, -50], t: [30, 0, -88] },
  'port-plaza-eye': { p: [30, 1.7, -66], t: [30, 2.2, -96] },
  'port-plaza-promenade': { p: [10, 2.0, -97], t: [38, 1.4, -84] },
  'gare-garden': { p: [-44, 3.0, 56.5], t: [-26, 1.8, 42] },
  'square-ring': { p: [66, 3.0, 8], t: [92, 1.4, 30] },
  'square-garden': { p: [62, 16, 4], t: [92, 0, 34] },
  'square-eye': { p: [90, 1.7, 5.5], t: [90, 2, 30] },
  'avenue-kerb': { p: [4, 2.2, 112], t: [0.5, 3, 20] },
  'avenue-kerb-mall': { p: [3.2, 2.2, 100], t: [20, 3, 60] },
  'hotel-base': { p: [-35, 1.7, -123.5], t: [-30, 3.2, -105] },
  'residence-ngor': { p: [-42, 2.4, 5.8], t: [-42, 3, -12] },
  'residence-alizes': { p: [84, 1.8, -117.5], t: [92, 2.6, -108] },
  'residence-salam': { p: [24, 1.8, -58.5], t: [30, 2.6, -46] },
  'residence-jardins': { p: [-36, 1.8, 62.5], t: [-30, 2.6, 76] },
  'villa-street': { p: [-30, 1.8, -62], t: [-24, 2.6, -46] },
  'cross-street': { p: [-62, 2.4, -20], t: [-62, 3, 40] },
};
// SET=rooftop (round 4: « put the Terrasse de Ngor's name on top, visible from the street and far »): the boutique hotel (x −50…−10, z −113…−91, the sea road to the north) from the street, from far along the
// road both ways, from the avenue and the cross street at its sides, from the beach and the air, and the stair door (−40, −105.6) with its plaque.
if (process.env.SET === 'rooftop') for (const k of Object.keys(SHOTS)) delete SHOTS[k];
if (process.env.SET === 'rooftop') Object.assign(SHOTS, {
  'sign-street-near': { p: [-30, 1.8, -117], t: [-30, 16, -104.6] },
  'sign-street-east': { p: [-6, 1.8, -118], t: [-30, 14, -104] },
  'sign-road-far-east': { p: [50, 2.0, -118], t: [-30, 17, -104] },
  'sign-road-far-west': { p: [-80, 2.0, -118], t: [-30, 17, -104] },
  'sign-avenue': { p: [0, 1.8, -70], t: [-12, 16, -100] },
  'sign-cross-street': { p: [-60, 1.8, -70], t: [-48, 16, -100] },
  'sign-beach': { p: [-30, 1.8, -140], t: [-30, 15, -105] },
  'sign-aerial': { p: [-30, 40, -152], t: [-30, 12, -104] },
  'sign-door': { p: [-44, 1.8, -117], t: [-40, 7, -105.6] },
  'sign-door-near': { p: [-36, 1.7, -114.5], t: [-40, 4, -105.6] },
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const cost = {}, errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 300000 });
  const t0 = Date.now();
  await d(() => { const D = window.__dakar; D.setHour(10); D.teleport('almadies'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  cost.buildSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(900);
    for (const [name, c] of Object.entries(SHOTS)) {
      if (only && !only.includes(name)) continue;
      await d(c => window.__dakar.cam(c.p, c.t), c); await page.waitForTimeout(1300);
      let buf = await page.screenshot({ scale: 'css' });
      if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
      fs.writeFileSync(`${out}/${name}-${tag}.png`, buf);
      cost[`${name}-${tag}`] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    }
  }
  await d(() => window.__dakar.cam(null));
  fs.writeFileSync(`${out}/cost.json`, JSON.stringify({ label, at: new Date().toISOString(), cost, errors }, null, 1));
  console.log(label, JSON.stringify(cost), 'errors', JSON.stringify(errors.slice(0, 3)));
} finally { await browser.close(); }
