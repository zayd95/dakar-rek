// Real riding times of the Tiak bike on the legs of the Pikine tour, in the browser (docs/M1B-TIAK-TOUR.md): the legs of
// paths.json, each ridden N times from rest by the keyboard rider and the touch rider (gas pad held), in game seconds.
// Usage: npx vite preview --port 4311 (after a build), node scripts/m1b-tour/measure-rides.mjs [baseUrl] [trials]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mountAt, ride } from './rider.mjs';

const base = process.argv[2] ?? 'http://localhost:4311/';
const TRIALS = Number(process.argv[3] ?? 3);
// FLY=5: the bike already moves at that speed (m/s) at the start, as it does leaving a stop it did not stop at; LEGS=a>b,c>d limits the legs
const FLY = Number(process.env.FLY ?? 0), LEGS = process.env.LEGS ? process.env.LEGS.split(',') : ['pickup>agence', 'pickup>dames', 'agence>dames', 'dames>agence'];
const paths = JSON.parse(fs.readFileSync(new URL('./paths.json', import.meta.url), 'utf8'));
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
for (const style of ['clavier', 'touch']) {
  const context = await browser.newContext({ viewport: style === 'touch' ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: style === 'touch', isMobile: style === 'touch' });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${style === 'touch' ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.tiak, null, T);
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.tiak.at(), null, T);
  await page.waitForTimeout(1500);
  for (const leg of LEGS) {
    const times = [];
    for (let i = 0; i < TRIALS; i++) {
      const path = paths[leg].path;
      const seated = await mountAt(page, path);
      if (!seated) { console.log(style, leg, 'could not mount'); break; }
      if (FLY) await page.evaluate(v => window.__dakar.tiak.boost(v), FLY);
      const r = await ride(page, path, { style, maxS: 90 });
      times.push(r);
      await page.evaluate(() => { const d = window.__dakar; for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); d.step(1 / 30, 40); if (d.tiak.at()?.driving) { d.act(); d.step(1 / 30, 40); } });
    }
    const ok = times.filter(t => t.ok).map(t => t.played);
    const row = { style, leg, fly: FLY, trials: times.length, ok: ok.length, mean: ok.length ? +(ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(1) : null, min: ok.length ? Math.min(...ok) : null, max: ok.length ? Math.max(...ok) : null, headless: paths[leg][style === 'touch' ? 'touch' : 'clavier'].s };
    rows.push(row); console.log(JSON.stringify(row), JSON.stringify(times.map(t => [t.played, t.ok])));
  }
  if (errors.length) console.log(style, 'page errors:', errors.slice(0, 3));
  await context.close();
}
console.log('\nSUMMARY (game seconds, from rest, browser)');
for (const r of rows) console.log(r.style.padEnd(8), r.leg.padEnd(14), 'mean', String(r.mean).padStart(5), 'min', String(r.min).padStart(5), 'max', String(r.max).padStart(5), `ok ${r.ok}/${r.trials}`, ' headless', r.headless);
await browser.close();
