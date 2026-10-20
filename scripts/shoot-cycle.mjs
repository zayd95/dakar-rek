// A run or walk cycle seen from the front at game distance (the hands as the player sees them): frames every few steps over one cycle, cropped round the body.
// Usage: AVATARS=homme,femme MODE=run|walk node scripts/shoot-cycle.mjs [baseUrl] [out.jpg]
import { chromium } from 'playwright';
import sharp from 'sharp';
const base = process.argv[2] ?? 'http://localhost:4310/', outFile = process.argv[3] ?? 'docs/meshy/proof/hands/cycle.jpg';
const AV = (process.env.AVATARS ?? 'homme,femme').split(','), MODE = process.env.MODE ?? 'run', FR = 8, GAP = MODE === 'run' ? 5 : 8;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
for (const avatar of AV) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.teleport('plateau'); k.setHour(12); }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__dakar.pause(true));
  await p.keyboard.down('KeyW'); if (MODE === 'run') await p.keyboard.down('ShiftLeft');
  await p.evaluate(() => window.__dakar.step(1 / 60, 140));
  const cells = [];
  for (let i = 0; i < FR; i++) {
    await p.evaluate(g => window.__dakar.step(1 / 60, g), GAP);
    await p.evaluate(() => { const k = window.__dakar, b = k.body().group, f = b.rotation.y, c = b.position; k.cam([c.x + Math.sin(f) * 2.6, c.y + 1.1, c.z + Math.cos(f) * 2.6], [c.x, c.y + 0.95, c.z]); k.render(); });
    await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' });
    cells.push(await sharp(await p.screenshot()).extract({ left: 170, top: 90, width: 300, height: 460 }).toBuffer());
    await p.evaluate(() => document.querySelectorAll('style').forEach(s => { if (/visibility:hidden/.test(s.textContent)) s.remove(); }));
  }
  rows.push(cells); await ctx.close();
}
await browser.close();
await sharp({ create: { width: 300 * FR, height: 460 * rows.length, channels: 3, background: '#111' } }).composite(rows.flatMap((r, ri) => r.map((c, ci) => ({ input: c, left: ci * 300, top: ri * 460 })))).jpeg({ quality: 82 }).toFile(outFile);
