// Runs real Workers/Durable Objects locally and checks two browsers + room overflow.
// Usage: npm run check:online [-- http://existing-worker-url/]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); assert.ok(ok, name); }
let base = process.argv[2], worker, logs = '';
let browser;
const sockets = [], contexts = [];
try {
  if (!base) {
    const portServer = net.createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r));
    const port = portServer.address().port; await new Promise(r => portServer.close(r));
    base = `http://127.0.0.1:${port}/`;
    worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [worker.stdout, worker.stderr]) stream.on('data', b => { logs = (logs + b).slice(-12000); });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
      try { if ((await fetch(new URL('/api/health', base))).ok) break; } catch { /* starting */ }
      await sleep(250);
    }
  }
  const health = await (await fetch(new URL('/api/health', base))).json();
  check('worker health and protocol', health.ok && health.protocol === 1 && health.roomCapacity === 24);
  browser = await chromium.launch({
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.DAKAR_BROWSER_PROXY ? { proxy: { server: process.env.DAKAR_BROWSER_PROXY } } : {}),
  });
  const pageErrors = [];
  for (const [i, viewport] of [[0, { width: 390, height: 844 }], [1, { width: 1280, height: 720 }]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: i === 0, isMobile: i === 0,
      ignoreHTTPSErrors: process.env.DAKAR_TEST_PROXY_TLS === 'true',
    }); contexts.push(ctx);
    await ctx.addInitScript(i => { localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: i ? 'Awa' : 'Moussa', look: i ? 1 : 0 })); }, i);
    const page = await ctx.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(`${base}?debug${i === 0 ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online', null, { timeout: 30000 });
  }
  const [a, b] = contexts.map(c => c.pages()[0]);
  await a.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  check('two independent clients see each other', (await a.evaluate(() => window.__dakar.presence().count)) === 2 && (await b.evaluate(() => window.__dakar.presence().count)) === 2);
  await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  check('remote avatar rendered on phone', (await a.evaluate(() => window.__dakar.presence().visible)) === 1);
  await a.evaluate(() => window.__dakar.place(-4, -30, 0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.name === 'Moussa' && Math.abs(p.x + 4) < 0.2 && Math.abs(p.z + 30) < 0.2));
  check('movement replicated', true);
  await a.click('#presenceBtn'); await a.fill('#presenceName', 'Mame Moussa');
  check('typing a name keeps the menu open', await a.locator('#modal.on').count() === 1);
  await a.getByRole('button', { name: 'Enregistrer mon profil', exact: true }).click();
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.name === 'Mame Moussa'));
  check('profile update reconnects without a duplicate player', (await b.evaluate(() => window.__dakar.presence().peers.length)) === 1);
  await a.evaluate(() => window.__dakar.emote(0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.clip === 'Dance_A'));
  check('emote pose shared with the second player', true);
  await a.evaluate(() => window.__dakar.enter('home'));
  await a.waitForFunction(() => window.__dakar.pos().x > 900);
  await b.waitForFunction(() => window.__dakar.presence().visible === 0);
  check('personal home hides the guest avatar from the street', true);
  await a.evaluate(() => window.__dakar.exit());
  await b.waitForFunction(() => window.__dakar.presence().visible === 1);
  for (const page of [a, b]) { await page.evaluate(() => window.__dakar.enter('maiga')); await page.waitForFunction(() => window.__dakar.pos().x > 900); }
  await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  check('public Maiga interior is shared', true);
  for (const page of [a, b]) { await page.evaluate(() => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900); }
  for (const hub of ['plateau', 'corniche', 'almadies', 'pikine']) {
    await a.evaluate(hub => window.__dakar.teleport(hub), hub);
    if (hub !== 'pikine') await b.waitForFunction(() => window.__dakar.presence().peers.length === 0);
    await b.evaluate(hub => window.__dakar.teleport(hub), hub);
    await a.waitForFunction(() => window.__dakar.presence().peers.length === 1);
    await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
    check(`hub membership follows travel: ${hub}`, (await a.evaluate(() => window.__dakar.pos().hub)) === hub);
    if (hub === 'plateau') {
      await a.evaluate(() => window.__dakar.enter('mosque'));
      await a.waitForFunction(() => window.__dakar.pos().x > 900);
      await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.space === 'plateau:mosque:door'));
      await b.waitForFunction(() => window.__dakar.presence().visible === 0);
      check('mosque visitor is hidden from the street', true);
      await b.evaluate(() => window.__dakar.enter('mosque'));
      await b.waitForFunction(() => window.__dakar.pos().x > 900);
      await a.waitForFunction(() => window.__dakar.presence().visible === 1);
      await b.waitForFunction(() => window.__dakar.presence().visible === 1);
      check('two visitors share the mosque interior', true);
      await a.evaluate(() => window.__dakar.exit());
      await a.waitForFunction(() => window.__dakar.pos().x < 900);
      await b.waitForFunction(() => window.__dakar.presence().visible === 0);
      check('a street visitor is hidden from the mosque', true);
      await b.evaluate(() => window.__dakar.exit());
      await b.waitForFunction(() => window.__dakar.pos().x < 900);
      await a.waitForFunction(() => window.__dakar.presence().visible === 1);
      check('mosque visitors reunite in the street', true);
    }
  }
  const before = await a.evaluate(() => ({ id: window.__dakar.presence().id, wallet: window.__dakar.state.wallet }));
  await contexts[0].setOffline(true);
  await a.waitForFunction(() => window.__dakar.presence().status === 'offline');
  await contexts[0].setOffline(false);
  await a.waitForFunction(() => window.__dakar.presence().status === 'online');
  await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  check('network reconnect keeps local money and no duplicate peer', (await a.evaluate(() => window.__dakar.state.wallet)) === before.wallet);
  await a.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-6, -30, 0); });
  await b.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-3, -26, Math.PI); });
  await a.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 3) < 0.2 && Math.abs(p.z + 26) < 0.2));
  await sleep(500);
  await fs.mkdir('shots/multiplayer', { recursive: true });
  await a.screenshot({ path: 'shots/multiplayer/phone-online.png' }); await b.screenshot({ path: 'shots/multiplayer/desktop-online.png' });
  function connect(params) {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/presence', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.search = new URLSearchParams(params).toString();
      const ws = new WebSocket(url); sockets.push(ws);
      const timer = setTimeout(() => reject(new Error('WebSocket welcome timeout')), 10000);
      ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.type === 'welcome') { clearTimeout(timer); resolve({ ws, welcome: m }); } });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket error')); }, { once: true });
    });
  }
  const joined = await Promise.all(Array.from({ length: 25 }, (_, i) => connect({ hub: 'pikine', name: `Guest ${i}` })));
  check('full room automatically opens another group', joined.some(s => s.welcome.room === 2) && joined.every(s => s.welcome.count <= 24));
  const invalid = joined.at(-1).ws;
  const closed = new Promise(resolve => invalid.addEventListener('close', e => resolve(e.code), { once: true }));
  invalid.send(JSON.stringify({ type: 'move', x: 'NaN', y: 0, z: 0, yaw: 0, speed: 0, space: 'street', clip: 'Idle' }));
  check('server rejects malformed positions', await closed === 1008);
  check('no browser page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await fs.writeFile('shots/multiplayer/results.json', JSON.stringify(checks, null, 2));
} catch (error) { console.error(error); if (logs) console.error(logs); process.exitCode = 1; }
finally { for (const ws of sockets) ws.close(); for (const ctx of contexts) await ctx.close(); await browser?.close(); worker?.kill('SIGTERM'); }
