import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch {} });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)); });
await page.goto(process.argv[2] + '?debug&touch&heure=11');
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
const out = process.argv[3];
const shots = [['edge', 'pikine', -118, -60, -Math.PI / 2], ['s120', 'pikine', -230, -60, -Math.PI / 2], ['s400', 'pikine', -520, 55, -1.9]];
for (const [name, hub, x, z, yaw] of shots) {
  await page.evaluate(([h, x, z, yaw]) => window.__dakar.teleport(h, x, z, yaw), [hub, x, z, yaw]);
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => ({ pos: window.__dakar.pos(), road: window.__dakar.road?.info?.() }))).slice(0, 400));
}
await browser.close();
