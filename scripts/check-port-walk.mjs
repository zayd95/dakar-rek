// Port prototype: walk from the Plateau's east road to the quay and onto the ferry pier; collisions; perf budget. Preview/local only.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = 'shots/port-preview'; await mkdir(out, { recursive: true });
const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
const base = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
let browser;
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
  await page.goto(base + '?debug&hub=plateau&portPrototype=1');
  await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 120000 });
  const pos = () => page.evaluate(() => window.__dakar.pos());
  await page.evaluate(() => window.__dakar.teleport('plateau', 112, 0, 0)); await sleep(2500);
  // calibrate the camera yaw -> heading map by walking one second
  const heading = async yaw => {
    await page.evaluate(y => window.__dakar.lookYaw(y), yaw); const a = await pos();
    await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); const b = await pos();
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  const h0 = await heading(0), h1 = await heading(1);
  const sign = Math.abs(Math.atan2(Math.sin(h1 - h0 - 1), Math.cos(h1 - h0 - 1))) < 0.5 ? 1 : -1;
  const yawFor = target => sign * (target - h0);
  async function goTo(x, z, tol = 2, ms = 300000) {
    const end = Date.now() + ms; await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
    try { while (Date.now() < end) {
      const p = await pos(); const dx = x - p.x, dz = z - p.z;
      if (Math.hypot(dx, dz) < tol) return p;
      await page.evaluate(y => window.__dakar.lookYaw(y), yawFor(Math.atan2(dx, dz))); await sleep(150);
    } } finally { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); }
    throw Error(`stuck before ${x},${z}: ${JSON.stringify(await pos())}`);
  }
  await goTo(128, 0); console.log('PASS road reaches the Plateau east edge');
  const p1 = await goTo(150, 0); assert.ok(p1.x > 148); console.log('PASS through the PORT AUTONOME arch onto the quay apron');
  await page.screenshot({ path: out + '/walk-1-gate.jpg', type: 'jpeg', quality: 80 });
  await goTo(190, 44); console.log('PASS walked along the quay to the ferry pier gap');
  const p2 = await goTo(228, 44, 3); assert.ok(p2.x > 220); console.log('PASS ferry pier walkable to its end');
  await page.evaluate(y => window.__dakar.lookYaw(y), yawFor(Math.PI / 2));
  await page.screenshot({ path: out + '/walk-2-pier.jpg', type: 'jpeg', quality: 80 });
  // water side stays closed: push east off the pier end, and south through the pier rail
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  assert.ok((await pos()).x < 232.2, 'pier end blocks the water'); console.log('PASS pier end collision');
  await page.evaluate(() => window.__dakar.teleport('plateau', 190, -40, 0)); await sleep(2000);
  await page.evaluate(y => window.__dakar.lookYaw(y), yawFor(Math.PI / 2));
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  assert.ok((await pos()).x < 199.6, 'quay fence blocks the water'); console.log('PASS quay fence collision');
  // perf: the port's own draw calls / triangles = same view rendered with its group hidden, per quality
  for (const q of ['low', 'medium', 'high']) {
    await page.evaluate(q => localStorage.setItem('dakarrek.quality', q), q);
    await page.goto(base + '?debug&hub=plateau&portPrototype=1&portVisit=1');
    await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 120000 }); await sleep(3000);
    await page.evaluate(() => window.__dakar.perfOn(true)); await sleep(4000);
    const r = await page.evaluate(() => ({ b: window.__dakar.renderBreakdown(), perf: window.__dakar.perf() }));
    const mine = r.b.by['portwise-dakar-prototype'] ?? { calls: 0, tris: 0 };
    const upd = Object.entries(r.perf).filter(([k]) => /portwise/.test(k)).map(([, v]) => v)[0];
    console.log(`PERF ${q}: view ${r.b.base.calls} calls / ${r.b.base.tris} tris; port alone ${mine.calls} calls / ${mine.tris} tris; update ${upd ?? 'n/a'} ms`);
    assert.ok(mine.calls <= 30 && mine.calls > 0, q + ': port <= 30 draw calls');
  }
  assert.equal(errors.length, 0, 'JS errors ' + errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
