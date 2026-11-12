// In-game close-ups of the male's hands closed on the Jakarta handlebar (the real shaders, the real bike), from four free cameras per hand (`__dakar.cam`).
// Usage: node scripts/avatar/hands-ingame-ride.mjs <baseUrl> <outDir>   (a running dev server or `vite preview`, ?debug build; CHROMIUM=… to pick a browser)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [, , base, out] = process.argv;
const T = { timeout: 240000 };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage(); page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${base}?debug&avatar=homme`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);
await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 400000; });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().dealer, null, T);
const dealer = (await d(() => window.__dakar.moto.info())).dealer;
await d(p => window.__dakar.place(p.x, p.z + 1.3, Math.PI), dealer);
await page.waitForFunction(() => /Motos/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
await d(() => window.__dakar.act());
await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
await page.locator('#modal .item', { hasText: 'Acheter' }).first().click();
await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
await page.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, T).catch(() => {});
await d(() => document.querySelector('#modal .item.close')?.click());
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
const rec = (await d(() => window.__dakar.moto.info())).record;
await d(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), rec);
await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, T).catch(() => {});
await d(() => window.__dakar.act());
await page.waitForFunction(() => window.__dakar.moto.info().driving, null, T).catch(() => {});
await page.waitForFunction(() => window.__dakar.clip() === 'Ride', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
await d(() => { const c = document.querySelector('canvas'); document.querySelectorAll('body *').forEach(e => { if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); });
const me = await d(() => window.__dakar.pos());
const f = [Math.sin(me.yaw), Math.cos(me.yaw)], r = [Math.cos(me.yaw), -Math.sin(me.yaw)];
const at = (ahead, lat, y) => [me.x + f[0] * ahead + r[0] * lat, y, me.z + f[1] * ahead + r[1] * lat];
const GY = +(process.env.GY ?? 1.12), AH = +(process.env.AH ?? 0.55), LT = +(process.env.LT ?? 0.36), D = +(process.env.D ?? 0.34);
for (const [side, lat] of [['A', LT], ['B', -LT]]) {
  const tgt = at(AH, lat, GY), s_ = Math.sign(lat);
  for (const [name, cam] of [['out', at(AH + 0.08, lat + s_ * D, GY + 0.12)], ['front', at(AH + D, lat, GY + 0.1)], ['top', at(AH + 0.02, lat, GY + D * 1.8)], ['back34', at(AH - 0.2, lat + s_ * D * 0.8, GY + 0.2)]]) {
    await d(a => window.__dakar.cam(a[0], a[1]), [cam, tgt]); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/ride-${side}-${name}.png` });
  }
}
await browser.close();
