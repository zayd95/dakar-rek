// Almadies nightlife street, the evidence pictures (docs/districts/ALMADIES-NIGHTLIFE.md): overviews of the street by day and by night, street-level views of Le Patio's gate and its car park,
// the hotel's roof sign seen from the coast road at points along a drive-by. A debug camera (`cam`) puts the eye where a driver or a walker would have it (eye heights 1.8 – 2.6 m) or above for the
// overviews; everything on the screen is the game's own render (SwiftShader, medium quality, 1280 × 760). These are pictures of the build, not proof of how it feels on an iPhone.
// Usage: node scripts/shots-nightlife.mjs <baseUrl> <outDir> [set,set,...]     sets: overview, patio, signdrive
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4980/', out = 'docs/proof/nightlife/street', setsArg = 'overview,patio,signdrive'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sets = setsArg.split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
const written = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.rooftop && window.__dakar.venues, null, { timeout: 300000 });
  await page.evaluate(() => { const D = window.__dakar; D.setHour(11); D.teleport('almadies', -36, -122, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.district.nightStreet() && window.__dakar.venues().some(v => v.type === 'patio'), null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  const sign = await page.evaluate(() => { const s = window.__dakar.rooftop.info()?.sign; if (!s) return null; const n = s.panels.length; return { x: s.panels.reduce((a, p) => a + p.x, 0) / n, y: s.top ?? s.panels[0].y, z: s.panels.reduce((a, p) => a + p.z, 0) / n }; });
  const patio = await page.evaluate(() => window.__dakar.venues().find(v => v.type === 'patio')?.origin ?? null);
  const gx = patio?.x ?? -109;
  const SHOTS = {
    overview: {
      hours: [11, 22],
      views: {
        'aerial-west': { p: [-90, 70, -70], t: [-90, 0, -135] },
        'aerial-east': { p: [-5, 70, -70], t: [-5, 0, -135] },
        'aerial-all': { p: [-50, 120, -40], t: [-50, 0, -135] },
        'road-west': { p: [-126, 2.6, -123.5], t: [-88, 2.5, -137] },
        'road-east': { p: [34, 2.6, -123.5], t: [-6, 2.5, -137] },
        'hotel-across': { p: [-30, 2.0, -135.5], t: [-30, 6, -105] },
      },
    },
    patio: {
      hours: [22],
      views: {
        'patio-gate-from-the-road': { p: [gx - 12, 2.4, -123], t: [gx, 3.4, -137] },
        'patio-gate-near': { p: [gx, 1.8, -128.5], t: [gx, 3.2, -137] },
        'patio-car-park-street-level': { p: [gx + 24, 2.2, -122], t: [gx - 6, 1.0, -131] },
        'patio-car-park-from-above': { p: [gx, 28, -112], t: [gx, 0, -133] },
        'patio-promenade': { p: [gx - 17, 1.8, -134.5], t: [gx + 8, 1.9, -135.5] },
        'patio-taxi-bay': { p: [gx + 14, 2.0, -121], t: [gx, 1.4, -131] },
      },
    },
    signdrive: sign ? {
      hours: [22, 11],
      views: Object.fromEntries([-110, -85, -60, -35, -10, 15, 40].map(x => [`sign-from-the-road-x${x}`, { p: [x, 2.4, -124.3], t: [sign.x, sign.y, sign.z] }])),
    } : { hours: [], views: {} },
  };
  for (const name of sets) {
    const set = SHOTS[name]; if (!set) continue;
    for (const h of set.hours) {
      await page.evaluate(h => window.__dakar.setHour(h), h); await page.waitForTimeout(1200);
      for (const [view, c] of Object.entries(set.views)) {
        await page.evaluate(c => window.__dakar.cam(c.p, c.t), c); await page.waitForTimeout(1200);
        const f = `${out}/${name === 'overview' ? 'overview-' : ''}${view}-h${h}.jpg`;
        fs.writeFileSync(f, await page.screenshot({ type: 'jpeg', quality: 82 })); written.push(f);
      }
    }
  }
  console.log(JSON.stringify({ written: written.length, sign, patio, errors: errors.slice(0, 3) }));
} finally { await browser.close(); }
