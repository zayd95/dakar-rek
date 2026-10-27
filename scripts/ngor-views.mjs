// Performance views of the Plage de Ngor and the embarkation (draw calls / triangles of one frame, headless SwiftShader, 390 × 844) at low and medium quality, on whichever build
// `baseUrl` serves (run it on the previous branch tip and on this one to compare; budget 300 calls).
// Usage: node scripts/ngor-views.mjs <baseUrl> <outJson>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4690/', out = '/tmp/claude-0/m4/ngor/views.json'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const VIEWS = { 'boardwalk and stalls': [[-14, 1.7, -130.4, 0], [10, 1.6, -140]], 'sun beds': [[-17, 1.7, -131.5, 0], [-12, 1.2, -146]], 'embarkation': [[34, 1.7, -130.4, 0], [48, 1.2, -140]], 'lookout, the island': [[24.4, 1.7, -150, Math.PI], [40, 6, -335]] };
const res = {};
for (const q of ['low', 'medium']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(qq => { try { localStorage.setItem('dakarrek.quality', qq); } catch { /* */ } }, q);
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  await page.goto(`${base}?debug&touch&heure=15&argent=100000`);
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub);
  await page.evaluate(() => window.__dakar.teleport('almadies'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play');
  await page.waitForTimeout(3000);
  for (const [name, [[x, y, z], look]] of Object.entries(Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, [v[0].slice(0, 3), v[1]]])))) {
    await page.evaluate(([x, z, l]) => { const d = window.__dakar; d.place(x, z, Math.PI); d.cam([x, 1.8, z], l); }, [x, z, look]);
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__dakar.pause?.(true)); await page.waitForTimeout(500);
    const m = await page.evaluate(() => { const A = window.__dakar; A.render?.(); return { calls: A.drawCalls(), tris: A.tris() }; });
    await page.evaluate(() => window.__dakar.pause?.(false));
    (res[q] ??= {})[name] = m;
  }
  await context.close();
}
fs.writeFileSync(out, JSON.stringify(res, null, 2)); console.log(JSON.stringify(res));
await browser.close();
