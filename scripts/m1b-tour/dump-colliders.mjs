// Dumps Pikine's solid boxes as the running game has them (modules add street dress, stalls and parked vehicles to the
// built hub) to scripts/m1b-tour/colliders.json, for legs.ts (COLLIDERS=…). Usage: node scripts/m1b-tour/dump-colliders.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4311/';
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(`${base}?debug`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.colliders, null, T);
await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.tiak.at(), null, T);
await page.waitForTimeout(3000);
const boxes = await page.evaluate(() => window.__dakar.colliders().map(b => b.map(n => +n.toFixed(2))));
fs.writeFileSync(new URL('./colliders.json', import.meta.url), JSON.stringify(boxes));
console.log(boxes.length, 'boxes');
await browser.close();
