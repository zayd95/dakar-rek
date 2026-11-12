// LD2.0-E round 3 (docs/ld2/LD2_E.md decision 8): how much of the Almadies' street the city's people use, measured in the real game with the ambient scheduler run on (the hook `ambientRun`):
// the people the scheduler has placed out of doors at 9 h, 13 h, 19 h and 21 h (live, seated, on a district seat), and the seats the street has to offer. The same script on the round-2 build and on this one.
//   node scripts/measure-street-life.mjs <baseUrl> <out.json>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4971/', out = 'docs/proof/ld2e/street-life.json'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const res = { base, at: new Date().toISOString(), hours: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 300000 });
  await page.evaluate(() => { window.__dakar.setHour(9); window.__dakar.teleport('almadies', -3.6, 4, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 300000 });
  await page.waitForTimeout(6000);
  res.spots = await page.evaluate(() => (window.__dakar.ambientSpots?.() ?? []).length);
  res.streetSeats = await page.evaluate(() => window.__dakar.district?.streetSeats?.().length ?? null);
  for (const h of [9, 13, 19, 21]) {
    await page.evaluate(h => { window.__dakar.setHour(h); window.__dakar.ambientDay?.(2); }, h);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const D = window.__dakar; D.ambientRun(180); D.ambientSettle?.(); const a = D.ambientActors(), s = D.ambient(); return { live: s.live, sitting: a.filter(x => x.sitting).length, street: a.filter(x => x.space === 'street').length, streetSitting: a.filter(x => x.space === 'street' && x.sitting).length, byTag: s.byTag, problems: s.problems }; });
    res.hours[h] = r;
  }
  res.errors = errors.slice(0, 3);
} finally { await browser.close(); }
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ spots: res.spots, streetSeats: res.streetSeats, hours: Object.fromEntries(Object.entries(res.hours).map(([h, r]) => [h, { live: r.live, sitting: r.sitting, street: r.street, streetSitting: r.streetSitting, problems: r.problems.length }])), errors: res.errors }));
