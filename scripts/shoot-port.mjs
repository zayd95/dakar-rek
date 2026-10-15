// Port prototype: daytime views (chaloupe, ship + crane, yard, trucks). Local/preview only: writes shots/port-look/*.jpg
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir } from 'node:fs/promises';
const out = 'shots/port-look'; await mkdir(out, { recursive: true });
const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
const base = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'medium'));
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(base + '?debug&hub=plateau&portPrototype=1&heure=8.05');
  await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 120000 });
  const shot = async (name, x, z, yaw, h = 8.05) => {
    await page.evaluate(h => window.__dakar.setHour(h), h);
    await page.evaluate(([x, z]) => window.__dakar.teleport('plateau', x, z, 0), [x, z]); await sleep(2500);
    await page.evaluate(y => window.__dakar.lookYaw(y), yaw); await sleep(900);
    await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 });
  };
  // free-camera beauty shots: [name, [camx,camy,camz], [lookx,looky,lookz]]
  await page.evaluate(() => window.__dakar.setHour(8.05));
  await page.evaluate(() => window.__dakar.teleport('plateau', 150, 0, 0)); await sleep(3000);
  const { writeFile } = await import('node:fs/promises');
  for (const [name, c, l, h] of JSON.parse(process.argv[2] ?? '[]')) {
    await page.evaluate(h => window.__dakar.setHour(h), h ?? 8.05); await sleep(1500);
    const url = await page.evaluate(([c, l]) => { const d = window.__dakar.three, cam = d.camera; cam.position.set(...c); cam.lookAt(...l); cam.updateMatrixWorld(); d.renderer.render(d.scene, cam); return d.renderer.domElement.toDataURL('image/jpeg', 0.88); }, [c, l]);
    await writeFile(`${out}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
} finally { await browser?.close(); server.kill(); }
