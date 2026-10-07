// Street-level review shots for the world look. Usage: node scripts/street.mjs <baseUrl> <outDir> [desktop|phone] [hub,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'shots', which = process.argv[4] ?? 'desktop';
const hubs = (process.argv[5] ?? 'plateau,corniche,almadies,pikine').split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const vp = which === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const page = await (await browser.newContext({ viewport: vp, hasTouch: which === 'phone', isMobile: which === 'phone' })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${base}?debug${which === 'phone' ? '&touch' : ''}`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
await page.waitForTimeout(1500);
for (const hub of hubs) {
  for (const [tag, hour] of [['day', 13], ['dusk', 18.6]]) {
    await page.evaluate(([h, hr]) => { const d = window.__dakar; d.setHour(hr); d.teleport(h); }, [hub, hour]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${which}-street-${hub}-${tag}.png` });
  }
  await page.evaluate(() => { const d = window.__dakar; d.setHour(13); d.look(Math.PI * 0.75, 0.12); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${which}-street-${hub}-wide.png` });
}
console.log(which, errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await browser.close();
