import { chromium } from 'playwright';
import { realTouch, boardVehicle, padRig } from '../scripts/lib/realTouch.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch {} });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const d = (fn, a) => page.evaluate(fn, a);
await page.goto('http://127.0.0.1:4700/?debug&touch&heure=15&argent=4500000');
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.vtc, null, { timeout: 300000 });
const t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, { timeout: 300000 });
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 300000 });
await d(() => window.__dakar.teranga.place(-100, 3.2, Math.PI / 2)); await d(() => window.__dakar.place(-100, 0.6, 0));
await page.waitForTimeout(800); await boardVehicle(page, t, 'teranga'); await page.waitForTimeout(1000);
const R = await padRig(page, t), gasP = R.gas(5);
const geo = await d(() => window.__dakar.cityGeometry());
const free = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)); for (let i = 0; i <= n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; if (geo.colliders.some(c => x > c.x0 - 1.4 && x < c.x1 + 1.4 && z > c.z0 - 1.4 && z < c.z1 + 1.4 && c.h > 0.4)) return false; } return true; };
let target = null;
for (let tries = 0; tries < 6 && !target; tries++) {
  const walkers = (await d(() => window.__dakar.street.where())).filter(a => a.role === 'walk');
  for (const w of walkers) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const start = { x: w.x - dx * 18, z: w.z - dz * 18 }; if (free(start, w) && Math.abs(start.x) < 118 && Math.abs(start.z) < 118) { target = { w, dx, dz, start }; break; } }
  if (target) break; await page.waitForTimeout(1500);
}
console.log('target', JSON.stringify(target));
const yaw = Math.atan2(target.dx, target.dz);
await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [target.start.x, target.start.z, yaw]); await page.waitForTimeout(600);
await gasP(true, 0.97);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const o = await d(() => { const c = window.__dakar.teranga.at(), s = window.__dakar.street.info(), w = window.__dakar.street.where(); const near = w.filter(a => a.role !== 'off').map(a => ({ id: a.id, role: a.role, dist: Math.hypot(a.x - c.x, a.z - c.z) })).sort((p, q) => p.dist - q.dist)[0]; return { x: +c.x.toFixed(1), z: +c.z.toFixed(1), sp: +c.speed.toFixed(1), near, reacted: s.reacted, shout: s.shouting.length }; });
  console.log(i, JSON.stringify(o));
}
await browser.close();
