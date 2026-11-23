// Fast visual iteration: hub views day/night on desktop + phone, plus arena and a character close-up.
// Usage: node scripts/quickshots.mjs <baseUrl> <outDir> [hubs comma list]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const hubs = (process.argv[4] ?? 'plateau,corniche,almadies,pikine').split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const h of hubs) for (const hour of [13, 21]) {
    await page.evaluate(([hub, hr]) => { window.__dakar.setHour(hr); window.__dakar.teleport(hub); }, [h, hour]);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/${label}-${h}-${hour === 13 ? 'day' : 'night'}.png` });
  }
  if (hubs.includes('pikine')) {
    // arena from the street, and a close-up of the player
    await page.evaluate(() => { const d = window.__dakar; d.setHour(17); const a = d.interactables().find(i => i.id.includes('arena')); d.teleport('pikine', a.x, a.z - 6, 0); });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/${label}-arena-17h.png` });
    await page.evaluate(() => { const d = window.__dakar; d.setHour(10); d.teleport('pikine', 0, -30, 0); d.faceCamera(); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${label}-player-closeup.png` });
    await page.evaluate(() => window.__dakar.scene('entrance')); await page.waitForTimeout(300);
    await page.evaluate(() => window.__dakar.scenePeek(9)); await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${label}-scene-entrance.png` });
    await page.evaluate(() => window.__dakar.scenePeek(99)); await page.waitForTimeout(500);
  }
  const p = await page.evaluate(() => ({ dc: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
  console.log(label, 'drawcalls', p.dc, 'tris', p.tris, 'errors', errors.slice(0, 3));
  await ctx.close();
}
await browser.close();
