// M4 performance views: draw calls and triangles of a frame at the Terrasse de Ngor (the street at its door, up on the terrace) and at La Vague's gate,
// at low and medium quality, on whichever build `baseUrl` serves (run it on the previous branch tip and on this one to compare).
// Usage: node scripts/m4-views.mjs <baseUrl> <outJson>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4650/', out = '/tmp/claude-0/m4/views.json'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const res = {};
for (const q of ['low', 'medium']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(qq => { try { localStorage.setItem('dakarrek.quality', qq); } catch { /* */ } }, q);
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  await page.goto(`${base}?debug&touch&heure=21.5&argent=100000`);
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.rooftop);
  await page.evaluate(() => window.__dakar.teleport('almadies'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.rooftop.info()?.hub === 'almadies' && window.__dakar.pos().mode === 'play');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => window.__dakar.rooftop.info());
  const measure = async name => { await page.evaluate(() => window.__dakar.pause?.(true)); await page.waitForTimeout(600); const m = await page.evaluate(() => { const A = window.__dakar; A.render?.(); return { calls: A.drawCalls(), tris: A.tris() }; }); await page.evaluate(() => window.__dakar.pause?.(false)); (res[q] ??= {})[name] = m; };
  await page.evaluate(i => window.__dakar.place(i.door.x + i.facade.nx * 1.2, i.door.z + i.facade.nz * 1.2, Math.atan2(-i.facade.nx, -i.facade.nz)), info);
  await page.waitForTimeout(2500); await measure('street at the terrace door');
  await page.evaluate(() => window.__dakar.act()); await page.waitForFunction(() => window.__dakar.pos().x > 3000); await page.waitForTimeout(2500);
  await page.evaluate(i => window.__dakar.place(i.bar.x, i.bar.z + 1.5, Math.PI), info); await page.waitForTimeout(2000); await measure('terrace, at the bar');
  await page.evaluate(() => window.__dakar.place(3324.5, 3.5, 0)); await page.waitForTimeout(2000); await measure('terrace, at the stairs');
  await context.close();
}
fs.writeFileSync(out, JSON.stringify(res, null, 2)); console.log(JSON.stringify(res, null, 2));
await browser.close();
