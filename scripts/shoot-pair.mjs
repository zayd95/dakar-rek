// Both hands beside the body, from the front and from each side, in the game (idle, or the pose given by POSE=walk|run): are the two hands mirror images?
// Usage: AVATARS=homme,femme POSE=idle node scripts/shoot-pair.mjs [baseUrl] [out.jpg]
import { chromium } from 'playwright';
import sharp from 'sharp';
const base = process.argv[2] ?? 'http://localhost:4310/', outFile = process.argv[3] ?? 'docs/meshy/proof/hands/pair.jpg';
const AV = (process.env.AVATARS ?? 'homme,femme').split(','), POSE = process.env.POSE ?? 'idle';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
for (const avatar of AV) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.teleport('plateau'); k.setHour(12); }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__dakar.pause(true));
  if (POSE !== 'idle') { await p.keyboard.down('KeyW'); if (POSE === 'run') await p.keyboard.down('ShiftLeft'); await p.evaluate(() => window.__dakar.step(1 / 60, 140)); } else await p.evaluate(() => window.__dakar.step(1 / 60, 120));
  const cells = [];
  for (const view of ['front', 'left', 'right']) {
    await p.evaluate(view => { const k = window.__dakar, g = k.body().group, f = g.rotation.y, c = g.position, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)];
      const o = view === 'front' ? [fw[0] * 1.5, fw[1] * 1.5] : view === 'left' ? [rt[0] * 1.5, rt[1] * 1.5] : [-rt[0] * 1.5, -rt[1] * 1.5];
      k.cam([c.x + o[0], c.y + 0.95, c.z + o[1]], [c.x, c.y + 0.82, c.z]); k.render(); }, view);
    await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' });
    cells.push(await sharp(await p.screenshot()).extract({ left: 120, top: 40, width: 400, height: 400 }).toBuffer());
    await p.evaluate(() => document.querySelectorAll('style').forEach(s => { if (/visibility:hidden/.test(s.textContent)) s.remove(); }));
  }
  rows.push(cells); await ctx.close();
}
await browser.close();
await sharp({ create: { width: 400 * 3, height: 400 * rows.length, channels: 3, background: '#111' } }).composite(rows.flatMap((r, ri) => r.map((c, ci) => ({ input: c, left: ci * 400, top: ri * 400 })))).jpeg({ quality: 85 }).toFile(outFile);
