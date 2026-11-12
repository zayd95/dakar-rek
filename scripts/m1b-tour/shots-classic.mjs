// Screenshots of the ordinary deliveries as cards (kiosk panel and the phone's Travail list), desktop and phone — docs/M1B-TIAK-TOUR.md.
// Usage: node scripts/m1b-tour/shots-classic.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4311/', out = process.argv[3] ?? 'docs/screenshots/tiak-tour';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.tourOffer, null, T);
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.tourOffer().length > 0, null, T);
  await page.waitForTimeout(1500);
  const g = await page.evaluate(() => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(':gargote:')); return { id: t.id, x: t.x, z: t.z }; });
  await page.evaluate(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), g);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, g.id, T).catch(() => {});
  console.log(label, 'focus', JSON.stringify(await page.evaluate(() => window.__dakar.focus())).slice(0, 160));
  await page.evaluate(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 20000 }).catch(async () => { console.log(label, 'no modal', await page.evaluate(() => JSON.stringify(window.__dakar.pos()))); });
  await page.locator('#modal.on .item', { hasText: 'Livraisons Tiak Tiak' }).first().click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/${label}-classic-kiosk.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => window.__dakar.jobsMenu());
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/${label}-travail-app.png` });
  await context.close();
}
await browser.close();
