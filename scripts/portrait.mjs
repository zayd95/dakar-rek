// Close-up avatar review shots. Usage: node scripts/portrait.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`); await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = window.__dakar; d.setHour(15); d.teleport('plateau', -60, -28, 0); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const d = window.__dakar; d.addPeople(7); d.portrait(1.6, 1.62, 0.3); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-face.png` });
  await page.evaluate(() => window.__dakar.portrait(5.5, 2.2, 0.55)); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${label}-avatar-group.png` });
  await page.evaluate(() => { const d = window.__dakar; d.setLook('indigo', 'bordure', ['taille', 'bras_d']); d.emote(1); d.portrait(3.2, 1.6, 0.4); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-wrestler.png` });
  console.log(label, errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
}
await browser.close();
