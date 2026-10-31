// Almadies night street (docs/districts/ALMADIES-NIGHTLIFE.md, « the street through the day »): how many of the city's people the ambient scheduler puts on the night street's promenade, and how
// many sit on its café chairs, at each hour of the day, measured in the real game with the scheduler run on (the hook `ambientRun`), with what the street's own counters say (open / closed).
//   node scripts/measure-night-street-life.mjs <baseUrl> <out.json>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4980/', out = '/tmp/claude-0/nightlife/night-street-life.json', quality = 'medium'] = process.argv.slice(2);
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const res = { base, quality, at: new Date().toISOString(), hours: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 300000 });
  await page.evaluate(() => { window.__dakar.setHour(9); window.__dakar.teleport('almadies', -36, -122, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.nightPlaces, null, { timeout: 300000 });
  await page.waitForTimeout(6000);
  res.spots = await page.evaluate(() => (window.__dakar.ambientSpots?.() ?? []).filter(s => /night/.test(s.id) || (s.x > -124 && s.x < 13 && s.z < -127)).map(s => ({ id: s.id, tags: s.tags, x: s.x, z: s.z, seats: s.seats })));
  res.places = await page.evaluate(() => window.__dakar.nightPlaces());
  res.chairs = await page.evaluate(() => window.__dakar.district.nightStreet()?.bays.length ?? null);
  for (const h of [8, 11, 13, 15, 17, 19, 21, 23, 2]) {
    await page.evaluate(h => { window.__dakar.setHour(h); window.__dakar.ambientDay?.(2); }, h);
    await page.waitForTimeout(1500);
    res.hours[h] = await page.evaluate(() => {
      const D = window.__dakar; D.ambientRun(240); D.ambientSettle?.();
      const a = D.ambientActors(), inStreet = x => x.x > -124 && x.x < 13 && x.z < -127 && x.z > -158;
      const here = a.filter(inStreet);
      return { live: D.ambient().live, onTheNightStreet: here.length, sitting: here.filter(x => x.sitting).length, atPlaces: here.map(x => x.spot).reduce((m, k) => (m[k] = (m[k] ?? 0) + 1, m), {}) };
    });
  }
  res.errors = errors.slice(0, 3);
} finally { await browser.close(); }
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ spots: res.spots.length, places: res.places.map(p => `${p.name} ${p.hours}`), hours: Object.fromEntries(Object.entries(res.hours).map(([h, r]) => [h, `${r.onTheNightStreet} on the street, ${r.sitting} sitting`])), errors: res.errors }));
