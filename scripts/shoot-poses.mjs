// The held poses seen from above-front, to see the hands: Sit, SitFloor, Lie, Kneel (the body is made to hold the clip in the open, no furniture).
// Usage: AVATARS=homme,femme node scripts/shoot-poses.mjs [baseUrl] [out.jpg]
import { chromium } from 'playwright';
import sharp from 'sharp';
const base = process.argv[2] ?? 'http://localhost:4310/', outFile = process.argv[3] ?? 'docs/meshy/proof/hands/poses.jpg';
const AV = (process.env.AVATARS ?? 'homme,femme').split(','), CLIPS = (process.env.CLIPS ?? 'Sit,SitFloor,Lie,Kneel').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
for (const avatar of AV) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.teleport('plateau'); k.setHour(12); }); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__dakar.pause(true));
  const cells = [];
  for (const clip of CLIPS) {
    await p.evaluate(c => { const k = window.__dakar, b = k.body(); b.hold = c; k.step(1 / 60, 90); const g = b.group, f = g.rotation.y, o = g.position, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)];
      k.cam([o.x + fw[0] * 1.5 + rt[0] * 0.7, o.y + (c === 'Lie' ? 1.7 : 1.4), o.z + fw[1] * 1.5 + rt[1] * 0.7], [o.x, o.y + (c === 'Lie' ? 0.2 : 0.8), o.z]); k.render(); }, clip);
    await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' });
    cells.push(await sharp(await p.screenshot()).extract({ left: 120, top: 40, width: 400, height: 400 }).toBuffer());
    await p.evaluate(() => document.querySelectorAll('style').forEach(s => { if (/visibility:hidden/.test(s.textContent)) s.remove(); }));
  }
  rows.push(cells); await ctx.close();
}
await browser.close();
await sharp({ create: { width: 400 * CLIPS.length, height: 400 * rows.length, channels: 3, background: '#111' } }).composite(rows.flatMap((r, ri) => r.map((c, ci) => ({ input: c, left: ci * 400, top: ri * 400 })))).jpeg({ quality: 85 }).toFile(outFile);
