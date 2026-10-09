// Street views with the normal game camera (crowd, loiterers). Usage: node scripts/street.mjs <baseUrl> <outPrefix>
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'street';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${base}?debug`, { timeout: 120000 }); await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
const views = [['pikine', 17.2], ['plateau', 10.5], ['corniche', 16]];
let i = 0;
for (const [hub, h] of views) {
  await page.evaluate(([hub, h]) => { const d = window.__dakar; d.setHour(h); d.teleport(hub); }, [hub, h]);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}-${i++}.png` });
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'ok');
await browser.close();
