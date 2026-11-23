// The two pictures of the New Game choice screen (public/assets/meshy/preview_m.jpg, preview_f.jpg): each body as the game draws it standing in the Plateau street at noon,
// three-quarter view from the front left, head to mid-thigh so the hands show, 240 × 360. Taken in the game itself (idle pose, game lights), not in a viewer.
// Usage: npx vite --port 5199 & node scripts/meshy/make-previews.mjs [out=public/assets/meshy]   (BASE=http://127.0.0.1:5199 by default)
import { chromium } from 'playwright';
import sharp from 'sharp';
const out = process.argv[2] ?? 'public/assets/meshy', base = process.env.BASE ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [id, avatar] of [['m', 'homme'], ['f', 'femme']]) {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1080 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(180000);
  await p.goto(`${base}/?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.teleport('plateau'); k.setHour(12); }); await p.waitForTimeout(2000);
  await p.evaluate(() => window.__dakar.pause(true)); await p.evaluate(() => window.__dakar.step(1 / 60, 150));
  await p.evaluate(() => { const k = window.__dakar, g = k.body().group, f = g.rotation.y, c = g.position, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)], d = 1.8, s = g.scale.x;
    k.cam([c.x + (fw[0] * 0.8 + rt[0] * 0.6) * d, c.y + 1.15 * s, c.z + (fw[1] * 0.8 + rt[1] * 0.6) * d], [c.x, c.y + 0.92 * s, c.z]); k.render(); });
  await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' });
  await sharp(await p.screenshot()).resize(240, 360).jpeg({ quality: 84, mozjpeg: true }).toFile(`${out}/preview_${id}.jpg`);
  await ctx.close();
}
await browser.close();
