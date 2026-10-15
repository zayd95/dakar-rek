// Smoke check for the opt-in port scene. No production changes.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

let server, browser;
const out = 'shots/port-preview';
await mkdir(out, { recursive: true });
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = 'http://127.0.0.1:' + port + '/';
try {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
  const limit = Date.now() + 20000;
  let ready = false;
  while (Date.now() < limit) {
    if (server.exitCode !== null) throw Error('Preview exited');
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(ready, 'Vite preview running');
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [label, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 720 }, false]]) {
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
    await context.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?debug&hub=plateau&portPrototype=1&portVisit=1');
    await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 90000 });
    const result = await page.evaluate(() => {
      const d = window.__dakar, p = d.pos(), details = d.portPrototype(), group = d.three.scene.getObjectByName('portwise-dakar-prototype');
      return { p, details, group: !!group, children: group?.children.length ?? 0,
        gantry: !!group?.getObjectByName('dakar-port-gantry'), vessel: !!group?.getObjectByName('dakar-port-ship'),
        sign: !!group?.children.find(o => o.type === 'Mesh' && o.material?.map),
        within: d.cityGeometry().bounds.x1 >= p.x, calls: d.drawCalls() };
    });
    assert.equal(result.p.hub, 'plateau');
    assert.ok(Math.hypot(result.p.x - 166, result.p.z - 37) < 3, label + ': port arrival ' + JSON.stringify(result.p));
    assert.ok(result.group && result.gantry && result.vessel && result.sign && result.details.containers === 50,
      label + ': port scene ' + JSON.stringify(result));
    assert.ok(result.within, label + ': walkable arrival');
    assert.equal(errors.length, 0, label + ': JS errors ' + errors.join(' | '));
    await page.screenshot({ path: out + '/' + label + '-arrival.jpg', type: 'jpeg', quality: 84 });
    console.log('PASS', label, 'quay arrival and objects');
    await page.goto(base + '?debug&hub=plateau');
    await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === false, null, { timeout: 90000 });
    assert.ok(await page.evaluate(() => !window.__dakar.three.scene.getObjectByName('portwise-dakar-prototype')),
      label + ': port absent without preview flag');
    console.log('PASS', label, 'port opt-out');
    await context.close();
  }
} finally {
  await browser?.close();
  if (server) server.kill();
}
