// In-game close-ups of the male driver's hands in the Berline moderne (Sit pose): buys it at Ndiaye Auto, gets in, and shoots through the door window, the windscreen and from above.
// Usage: node scripts/avatar/hands-ingame-car.mjs <baseUrl> <outDir>   (a running dev server or `vite preview`, ?debug build; CHROMIUM=… to pick a browser)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [, , base, out] = process.argv;
const T = { timeout: 240000 };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage(); page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${base}?debug&avatar=homme`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (fn, arg) => page.evaluate(fn, arg);
await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 20000000; });
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car.info().dealer, null, T);
const dealer = (await d(() => window.__dakar.car.info())).dealer, toRoad = Math.sign(dealer.delivery.x - dealer.x) || 1;
await d(([p, s]) => window.__dakar.place(p.x + s * 0.7, p.z + 0.4, -s * Math.PI / 2), [dealer, toRoad]);
await page.waitForFunction(() => /Ndiaye Auto/i.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
await d(() => window.__dakar.act());
await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
await page.locator('#modal .item', { hasText: 'Acheter' }).first().click();
await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
await page.waitForFunction(() => window.__dakar.car.info().owned && window.__dakar.car.info().here, null, T).catch(() => {});
await d(() => document.querySelector('#modal .item.close')?.click());
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
const rec = (await d(() => window.__dakar.car.info())).record;
const pave = { x: rec.x - toRoad * 2.2, z: rec.z };
await d(([p, s]) => window.__dakar.place(p.x, p.z, s * Math.PI / 2), [pave, toRoad]);
await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta voiture', null, T).catch(() => {});
await d(() => window.__dakar.act());
await page.waitForFunction(() => window.__dakar.car.info().driving, null, T).catch(() => {});
await page.waitForFunction(() => window.__dakar.clip() === 'Sit', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
await d(() => { const c = document.querySelector('canvas'); document.querySelectorAll('body *').forEach(e => { if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); });
const me = await d(() => window.__dakar.pos()), ci = await d(() => window.__dakar.car.info());
console.log(JSON.stringify({ me, car: { x: ci.x, z: ci.z, yaw: ci.yaw, view: ci.view } }));
const sidex = -toRoad;   // the pavement side: the driver's door
const shots = [['window-out', [me.x + sidex * 1.0, me.y + 0.9, me.z + 0.1], [me.x, me.y + 0.55, me.z + 0.15]], ['window-near', [me.x + sidex * 0.75, me.y + 0.95, me.z - 0.1], [me.x, me.y + 0.5, me.z + 0.25]], ['front-glass', [me.x, me.y + 0.9, me.z + 1.1], [me.x, me.y + 0.55, me.z]], ['from-above', [me.x + sidex * 0.15, me.y + 1.8, me.z + 0.1], [me.x, me.y + 0.5, me.z + 0.3]]];
for (const [name, c, t] of shots) { await d(a => window.__dakar.cam(a[0], a[1]), [c, t]); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/car-${name}.png` }); }
await browser.close();
