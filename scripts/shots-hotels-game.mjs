// LD2.0-E lane E-H: the three hotels in the real game, on a phone page (390 × 844), by day (10 h) and at 21 h, from cameras on their sites (the plan's: the boutique
// at block (1,0), the resort at (0,0), the tower at (2,3)); a copy of scripts/shots-almadies-district.mjs with its own cameras.
//   node scripts/shots-hotels-game.mjs <baseUrl> <outDir> [label]      (a dev server: npx vite --port 4972)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2), onlyIdx = args.indexOf('--only'), ONLY = onlyIdx >= 0 ? args.splice(onlyIdx, 2)[1].split(',') : null;   // --only boutique-entry,tower-entry
const [base = 'http://127.0.0.1:4972/', out = 'docs/proof/ld2e/hotels/game', label = 'hotels'] = args;
fs.mkdirSync(out, { recursive: true });
const SHOTS = {
  'boutique-aerial': { p: [-30, 42, -150], t: [-30, 6, -100] },
  'boutique-street': { p: [-14, 2.2, -124], t: [-30, 7, -108] },
  'boutique-east': { p: [8, 14, -98], t: [-30, 8, -104] },
  'tower-aerial': { p: [30, 44, 35], t: [30, 9, 78] },
  'tower-street': { p: [8, 2.4, 52], t: [30, 9, 72] },
  'tower-east': { p: [66, 16, 72], t: [30, 10, 78] },
  'resort-aerial': { p: [-90, 46, -22], t: [-90, 6, -90] },
  'resort-street': { p: [-72, 2.4, -50], t: [-90, 7, -76] },
  'resort-sea': { p: [-90, 24, -160], t: [-90, 6, -100] },
  // the road-side flanks, from the cross roads
  'boutique-flank': { p: [8, 3.2, -96], t: [-7, 5, -104] },
  'tower-flank': { p: [-8, 3.2, 62], t: [7, 6, 76] },
  'resort-flank': { p: [-52, 3.2, -78], t: [-67, 6, -92] },
  // the way in from the pavement, at eye level
  'boutique-entry': { p: [-35, 1.7, -123.5], t: [-30, 3.5, -105] },
  'tower-entry': { p: [21, 1.7, 57], t: [30, 3.5, 74] },
  'resort-entry': { p: [-90, 1.7, -56.5], t: [-90, 3.5, -78] },
};
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
      if (ONLY && !ONLY.includes(name)) continue;
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
