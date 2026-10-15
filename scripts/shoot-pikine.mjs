// Pikine look: the arrival view (player camera) and free-camera views, phone portrait. Local only: writes shots/pikine/<tag>-*.jpg
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
const tag = process.argv[2] ?? 'after', out = 'shots/pikine'; await mkdir(out, { recursive: true });
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
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&hub=pikine&heure=10');
  await page.waitForFunction(() => window.__dakar?.pos?.()?.hub === 'pikine', null, { timeout: 120000 }); await sleep(5000);
  await page.screenshot({ path: `${out}/${tag}-1-arrival.jpg`, type: 'jpeg', quality: 82 });
  const p = await page.evaluate(() => window.__dakar.pos());
  // residential blocks (2,2), (3,2), (2,3), (3,3) around the road x = 67
  const views = [['2-street', [67, 2.6, 4], [67, 1.4, 60]], ['3-roofs', [36, 32, -6], [92, 0, 48]], ['4-yards', [64, 7, 26], [92, 0.5, 38]]];
  for (const [name, c, l] of views) {
    const url = await page.evaluate(([c, l]) => { const d = window.__dakar.three, cam = d.camera; cam.position.set(...c); cam.lookAt(...l); cam.updateMatrixWorld(); d.renderer.render(d.scene, cam); return d.renderer.domElement.toDataURL('image/jpeg', 0.86); }, [c, l]);
    await writeFile(`${out}/${tag}-${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  const info = await page.evaluate(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
  console.log(tag, JSON.stringify(p), JSON.stringify(info), errors.length ? 'ERRORS ' + errors.join(' | ') : 'no errors');
} finally { await browser?.close(); server.kill(); }
