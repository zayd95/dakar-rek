// LD2.0-E (docs/ld2/LD2_E.md): the Almadies hub's streets pictured on a phone page (390 × 844) from free cameras, by day (10 h) and at 21 h, with what the
// view costs (draw calls and triangles of the whole frame). The same script pictures the hub before and after the district pass:
//   node scripts/shots-almadies-district.mjs <baseUrl> <outDir> [label]
// The cameras are in the hub's coordinates (blocks (i, j) at −113 + 60 i … + 46; the roads between them at −120, −60, 0, 60; the sea to the north, −z).
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4970/', out = 'docs/proof/ld2e/before', label = 'before'] = process.argv.slice(2);
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
