// Close-ups of the player avatar for quick review. Usage: node scripts/face.mjs <baseUrl> <out.png> [lookJSON] [clip]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'face.png';
const look = JSON.parse(process.argv[4] ?? '{}'), clip = process.argv[5] ?? 'Idle';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${base}?debug`, { timeout: 120000 }); await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
await page.waitForTimeout(1000);
await page.evaluate(([l, c]) => { const d = window.__dakar; d.setHour(15); d.teleport('plateau', -60, -28, 0); d.playerLook(l, c); }, [look, clip]);
const shots = [[0.55, 1.68, 0.15], [1.4, 1.45, 0.35], [2.8, 1.2, 0.6], [2.6, 1.3, 2.7]];
const { PNG } = await import('node:fs').then(() => ({ PNG: null }));
const bufs = [];
for (const [dist, h, a] of shots) { await page.evaluate(([dist, h, a]) => window.__dakar.portrait(dist, h, a), [dist, h, a]); await page.waitForTimeout(900); bufs.push(await page.screenshot()); }
const fs = await import('node:fs'); bufs.forEach((b, i) => fs.writeFileSync(out.replace('.png', `-${i}.png`), b));
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'ok');
await browser.close();
