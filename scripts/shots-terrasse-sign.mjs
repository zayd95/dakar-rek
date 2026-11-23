// The Terrasse de Ngor's lit name and the boutique hotel's gantry in the release candidate (docs/ld2/LD2_E.md, « Rounds 3–4 in the combined build »): free-camera pictures by day and at night.
// Usage: node scripts/shots-terrasse-sign.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4740/', out = '/tmp/claude-0/rc/sign'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 700, height: 420 }, deviceScaleFactor: 1 })).newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const views = [
  ['terrasse-from-the-sea-road', [-70, 3.5, -131], [-30, 8.5, -103]],
  ['terrasse-from-far-east', [60, 3, -127], [-30, 8.5, -103]],
  ['terrasse-from-the-beach', [-30, 2.5, -150], [-30, 8.5, -103]],
  ['strip-wide', [-95, 14, -146], [-30, 4, -104]],
  ['hotel-gantry-from-the-sea-road', [40, 3.5, -128], [90, 16, -100]],
];
for (const [hour, tag] of [[14, 'day'], [21, 'night']]) {
  await page.goto(`${base}?debug&heure=${hour}&qualite=medium`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, { timeout: 180000 });
  await page.evaluate(() => window.__dakar.teleport('almadies'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  for (const [name, p, t] of views) {
    await page.evaluate(([p, t]) => window.__dakar.cam(p, t), [p, t]); await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${name}-${tag}.png` });
  }
}
console.log(errors.length ? 'errors: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
await browser.close();
