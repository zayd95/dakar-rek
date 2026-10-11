// Before/after screenshots from identical player positions and camera yaw.
// Usage: node scripts/compare.mjs <baseUrl> <outDir> [desktop|phone|both]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, base = 'http://localhost:4173/', out = 'shots', which = 'both'] = process.argv;
fs.mkdirSync(out, { recursive: true });
// Street-level views: [name, hub, x, z, yaw]. Same coordinates in every build (the street grid is unchanged).
const VIEWS = [
  ['plateau-street', 'plateau', 5.8, 62, Math.PI],
  ['plateau-station', 'plateau', 27, 37, Math.PI + 0.75],
  ['corniche-street', 'corniche', -54.2, 62, Math.PI],
  ['almadies-street', 'almadies', 5.8, 2, Math.PI],
  ['pikine-home', 'pikine', -42, -54.5, 0.95],
  ['pikine-street', 'pikine', -5.8, -10, 0],
  ['pikine-arena', 'pikine', 30, -62, 0],
  ['plateau-gargote', 'plateau', -18, 59, Math.PI],
  ['pikine-gargote', 'pikine', 78, 59, Math.PI],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const vps = [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]].filter(v => which === 'both' || v[0] === which);
for (const [label, vp, touch] of vps) {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  page.setDefaultTimeout(90000);
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const hasInteriors = await page.evaluate(() => typeof window.__dakar.enter === 'function');
  for (const [name, hub, x, z, yaw] of VIEWS) for (const hour of [13, 21]) {
    await page.evaluate(([h, x, z, y, hr]) => { const d = window.__dakar; d.setHour(hr); d.teleport(h, x, z, y); }, [hub, x, z, yaw, hour]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${label}-${name}-${hour === 13 ? 'day' : 'night'}.png` });
  }
  if (hasInteriors) for (const [hub, kind] of [['pikine', 'home'], ['pikine', 'gargote']]) for (const hour of [13, 21]) {
    await page.evaluate(([h, k, hr]) => { const d = window.__dakar; d.setHour(hr); d.teleport(h); d.enter(k); }, [hub, kind, hour]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${label}-interior-${kind}-${hour === 13 ? 'day' : 'night'}.png` });
    await page.evaluate(() => window.__dakar.exit()); await page.waitForTimeout(600);
  }
  await page.context().close();
}
await browser.close();
