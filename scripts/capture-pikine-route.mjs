// Pikine Street DNA, phase 2: iPhone-sized (390×844 @2x) screenshots along the starting walk — the room, the street south,
// the gare, the grand-place, Salon Awa, Boutique Diallo — at fixed waypoints and city hours, for before/after comparison.
// Usage: node scripts/capture-pikine-route.mjs [baseUrl] [outDir] [hours=11,18.5] [quality=medium]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4322/', out = process.argv[3] ?? 'shots/pikine-route';
const hours = (process.argv[4] ?? '11,18.5').split(',').map(Number), quality = process.argv[5] ?? 'medium';
fs.mkdirSync(out, { recursive: true });
import { ROUTE_SHOTS as ROUTE } from './pikine-route.mjs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => { window.__dakar.teleport('pikine'); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
for (const h of hours) {
  await page.evaluate(x => window.__dakar.setHour(x), h); await page.waitForTimeout(1500);
  for (const [name, x, z, yaw] of ROUTE) {
    await page.evaluate(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x, z, yaw]);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/${name}-${String(h).replace('.', '')}h.png` });
  }
}
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors', `· ${ROUTE.length * hours.length} shots in ${out}`);
await browser.close();
