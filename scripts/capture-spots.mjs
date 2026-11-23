// iPhone-sized shots from given spots: node scripts/capture-spots.mjs <baseUrl> <outDir> "<name>,<x>,<z>,<tx>,<tz>;..." [hour=11]   (the player stands at x,z looking at tx,tz; the follow camera rides behind him)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base, out, spec] = process.argv.slice(2, 5), hour = Number(process.argv[5] ?? 11);
const spots = spec.split(';').filter(Boolean).map(s => { const [n, x, z, tx, tz] = s.split(','); return [n, +x, +z, +tx, +tz]; });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.evaluate(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(1500);
for (const [n, x, z, tx, tz] of spots) {
  await page.evaluate(([x, z, y]) => window.__dakar.place(x, z, y), [x, z, Math.atan2(tx - x, tz - z)]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${n}.png` });
}
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors', `· ${spots.length} shots in ${out}`);
await browser.close();
