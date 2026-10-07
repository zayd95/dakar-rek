// Close-up avatar review shots (front, three-quarter, group, wrestler). Usage: node scripts/portrait.mjs <baseUrl> <outDir> [desktop|phone|both]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'shots', which = process.argv[4] ?? 'both';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const views = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]].filter(v => which === 'both' || v[0] === which);
for (const [label, vp, touch] of views) {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 }); await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = window.__dakar; d.setHour(15); d.teleport('plateau', -60, -28, 0); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const d = window.__dakar; d.addPeople(7); d.portrait(1.5, 1.7, 0.25); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-front.png` });
  await page.evaluate(() => window.__dakar.portrait(2.6, 1.45, 0.75)); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-avatar-34.png` });
  await page.evaluate(() => window.__dakar.portrait(5.5, 2.0, 0.45)); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-avatar-group.png` });
  await page.evaluate(() => { const d = window.__dakar; d.clearPeople(); d.setLook('indigo', 'uni', ['taille', 'bras_d']); d.wrestle('Stance'); d.portrait(2.6, 1.35, 0.5); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-wrestler.png` });
  await page.evaluate(() => { const d = window.__dakar; d.setLook('rouge', 'bordure', []); d.wrestle('Idle'); d.portrait(2.4, 1.3, 2.6); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-wrestler-back.png` });
  await page.evaluate(() => { const d = window.__dakar; d.playerLook({ style: 'boubou', top: 0x2f5fa8, pattern: 'bazin', accent: 0xe9cf7a, hat: 'kufi', hatColor: 0xf2f2ec, beard: 0x222222, heavy: 0.3 }, 'Idle'); d.portrait(2.9, 1.45, 0.45); });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${label}-avatar-boubou.png` });
  await page.evaluate(() => window.__dakar.portrait(3.0, 1.4, 1.7)); await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-avatar-boubou-side.png` });
  console.log(label, errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
}
await browser.close();
