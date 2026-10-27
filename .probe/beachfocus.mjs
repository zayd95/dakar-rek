import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch {} });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const d = (fn, a) => page.evaluate(fn, a);
await page.goto('http://127.0.0.1:4700/?debug&touch&heure=15&argent=4500000');
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 300000 });
await d(() => window.__dakar.teleport('almadies'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 300000 });
await page.waitForTimeout(3000);
for (const [x, z] of [[-13, -132.3], [-18.5, -132.3], [-17, -133], [-19, -132.8]]) {
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [x, z]); await page.waitForTimeout(1200);
  console.log(x, z, JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), pos: window.__dakar.pos() }))).slice(0, 300));
}
const pl = await d(() => window.__dakar.placeList?.().filter(p => /plage/.test(p.id)).map(p => ({ id: p.id, x: p.x, z: p.z })));
console.log(JSON.stringify(pl));
await browser.close();
