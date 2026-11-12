// Pikine Street DNA, phase 2: iPhone-sized close-ups of what the slice adds (see ROUTE_DETAILS in pikine-route.mjs).
// Usage: [SET=home] node scripts/capture-pikine-details.mjs [baseUrl] [outDir] [hours=11,18.5] [quality=medium]   (SET=home: the home street and its frontage)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { ROUTE_DETAILS as DETAILS, HOME_DETAILS } from './pikine-route.mjs';
let ROUTE_DETAILS = process.env.SET === 'home' ? HOME_DETAILS : DETAILS;

const base = process.argv[2] ?? 'http://127.0.0.1:4323/', out = process.argv[3] ?? 'shots/pikine-details';
const hours = (process.argv[4] ?? '11,18.5').split(',').map(Number), quality = process.argv[5] ?? 'medium';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
if (process.env.SET === 'life') {   // every shop and every roadside cluster the slice placed, seen from the middle of the road in front of it
  const items = await page.evaluate(() => window.__dakar.pikineDna());
  const roads = [-120, -60, 0, 60, 120], near = v => roads.reduce((b, c) => Math.abs(v - c) < Math.abs(v - b) ? c : b, roads[0]);
  ROUTE_DETAILS = items.filter(i => ['shop', 'tontine', 'tea', 'tray', 'sacks', 'bench', 'laundry'].includes(i.kind)).map((i, k) => {
    const cx = near(i.x), cz = near(i.z), alongZ = Math.abs(i.x - cx) < Math.abs(i.z - cz);      // on the avenue (runs along z) or on an east–west road
    return alongZ ? [`l${String(k).padStart(2, '0')}-${i.kind}`, cx - Math.sign(i.x - cx) * 1.5, i.z - 5, i.x, i.z] : [`l${String(k).padStart(2, '0')}-${i.kind}`, i.x - 5, cz - Math.sign(i.z - cz) * 1.5, i.x, i.z];
  });
}
for (const h of hours) {
  await page.evaluate(x => window.__dakar.setHour(x), h); await page.waitForTimeout(1500);
  for (const [name, x, z, tx, tz] of ROUTE_DETAILS) {
    await page.evaluate(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x, z, Math.atan2(tx - x, tz - z)]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/${name}-${String(h).replace('.', '')}h.png` });
  }
}
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors', `· ${ROUTE_DETAILS.length * hours.length} shots in ${out}`);
await browser.close();
