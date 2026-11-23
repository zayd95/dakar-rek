// Phone screenshots of a place's menu (default: Boutique Diallo, Pikine) by day and by night, for the shared UI primitives
// (docs/UI-PRIMITIVES.md). Usage: node scripts/shots-shop.mjs [baseUrl] [outDir] [prefix] [placeFrag]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4312/', out = process.argv[3] ?? 'docs/screenshots/ui-primitives', prefix = process.argv[4] ?? 'after', frag = process.argv[5] ?? ':city:boutique';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [scene, hour] of [['day', 11], ['night', 22]]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.evaluate(h => { window.__dakar.teleport('pikine'); window.__dakar.setHour(h); }, hour);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(2500);
  const it = await page.evaluate(f => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(f)); return t ? { id: t.id, x: t.x, z: t.z } : null; }, frag);
  await page.evaluate(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), it);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, it.id, T).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${prefix}-${scene}-focus.png` });
  await page.evaluate(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${prefix}-${scene}-menu.png` });
  // the hovered / pressed row (the sheet's rows used a fixed #fafafa on hover: white on white under the night ink)
  await page.locator('#modal.on .item').nth(1).hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${prefix}-${scene}-hover.png`, clip: { x: 0, y: 520, width: 390, height: 324 } });
  const hv = await page.evaluate(() => { const e = document.querySelectorAll('#modal.on .item')[1]; const c = getComputedStyle(e); return { bg: c.backgroundColor, img: c.backgroundImage.slice(0, 60), ink: getComputedStyle(e.querySelector('.tx') ?? e).color }; });
  console.log(scene, 'hover', JSON.stringify(hv));
  const info = await page.evaluate(() => ({ items: [...document.querySelectorAll('#modal.on .item')].map(e => e.innerText.replace(/\s+/g, ' ').trim()), night: document.body.classList.contains('theme-night') }));
  console.log(scene, JSON.stringify(info));
  // unavailable rows (not enough money, too tired): they keep their reason
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(() => { const d = window.__dakar.state.data; d.wallet = 100; d.needs.energie = 5; });
  await page.evaluate(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/${prefix}-${scene}-disabled.png`, clip: { x: 0, y: 440, width: 390, height: 404 } });
  if (errors.length) console.log('page errors', errors.slice(0, 2));
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.ui.theme', 'night'); } catch { /* */ } });
  const page = await context.newPage();
  await page.goto(`${base}?debug`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(22); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(2500);
  const it = await page.evaluate(f => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(f)); return { id: t.id, x: t.x, z: t.z }; }, frag);
  await page.evaluate(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), it);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, it.id, T).catch(() => {});
  await page.evaluate(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T);
  await page.waitForTimeout(1000);
  await page.locator('#modal.on .item').nth(1).hover();
  await page.waitForTimeout(300);
  const box = await page.locator('#modal.on .panel').boundingBox();
  await page.screenshot({ path: `${out}/${prefix}-night-hover-desktop.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 420) } });
  console.log('desktop night hover', JSON.stringify(await page.evaluate(() => { const e = document.querySelectorAll('#modal.on .item')[1], c = getComputedStyle(e); return { bg: c.backgroundColor, img: c.backgroundImage.slice(0, 70), ink: getComputedStyle(e.querySelector('.tx')).color }; })));
  await context.close();
}
await browser.close();
