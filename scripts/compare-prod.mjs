// Same views as the production captures (spawn Plateau, Pikine 18:30, Corniche 13:00). Usage: node scripts/compare-prod.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/', out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1272, height: 868 } })).newPage();
await page.goto(`${base}?debug`, { timeout: 120000 }); await page.waitForFunction(() => window.__dakar, null, { timeout: 90000 });
await page.evaluate(() => { window.__dakar.setHour(15.2); window.__dakar.teleport('plateau'); });
await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/local-plateau.png` });
await page.evaluate(() => { window.__dakar.setHour(18.5); window.__dakar.teleport('pikine'); });
await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/local-pikine.png` });
await page.evaluate(() => { window.__dakar.setHour(13); window.__dakar.teleport('corniche'); });
await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/local-corniche.png` });
await browser.close();
