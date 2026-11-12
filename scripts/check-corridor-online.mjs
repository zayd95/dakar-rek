// Two real clients on real local Workers / Durable Objects (the same set-up as scripts/check-multiplayer.mjs), one DRIVING the Pikine ↔ Almadies road with the real touch controls and one
// standing on the road at Almadies's end. Proved: the room follows the district that is loaded (the driver is in Pikine's room, then in Almadies's one after the middle of the road, and is seen
// there at the place the road gives, in Almadies's frame); a driver whose connection drops over the swap goes on driving, comes back online in the new district's room and is seen again;
// driving back across the middle returns the driver to Pikine's room and the other client no longer sees them.
// Usage: node scripts/check-corridor-online.mjs <saveJson-with-the-car-parked-at-s500>        (it builds the online bundle and starts wrangler itself; needs `npm run build:online` time)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const saveFile = process.argv[2];
const ROAD = 'pikine-almadies';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const portServer = net.createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r));
const port = portServer.address().port; await new Promise(r => portServer.close(r));
const base = `http://127.0.0.1:${port}/`;
let logs = '';
const worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [worker.stdout, worker.stderr]) s.on('data', b => { logs = (logs + b).slice(-8000); });
const deadline = Date.now() + 240000;
for (;;) {
  if (worker.exitCode !== null) throw new Error(`worker exited: ${logs}`);
  try { if ((await fetch(new URL('/api/health', base))).ok) break; } catch { /* starting */ }
  if (Date.now() > deadline) throw new Error('worker did not start: ' + logs);
  await sleep(500);
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const mk = async (name, save) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await ctx.addInitScript(([n, s]) => { localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: n, look: n === 'Moussa' ? 0 : 1 })); if (s) localStorage.setItem('dakarrek.guest.save.v6', s); }, [name, save]);
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.goto(`${base}?debug&touch&heure=11`);
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online', null, { timeout: 240000 });
    return { ctx, page };
  };
  const A = await mk('Moussa', fs.readFileSync(saveFile, 'utf8'));
  const B = await mk('Awa', null);
  const a = A.page, b = B.page;
  const da = (f, x) => a.evaluate(f, x), db = (f, x) => b.evaluate(f, x);
  // B stands on the road at Almadies's end (a road position in Almadies's frame)
  await b.evaluate(() => window.__dakar.teleport('almadies', 140, -62, 0)); await b.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, { timeout: 120000 });
  await a.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
  check('the driver is in Pikine, the other client in Almadies: they are in different rooms and do not see each other', (await da(() => window.__dakar.pos().hub)) === 'pikine' && (await db(() => window.__dakar.presence().peers.length)) === 0);
  const t = await realTouch(a);
  const c = await da(() => window.__dakar.berline.at());
  await walkTo(a, t, c.x + Math.cos(c.yaw) * 2, c.z - Math.sin(c.yaw) * 2 + 0.4, { tol: 0.4, ms: 60000 });
  await t.tap('#act'); await a.waitForFunction(() => window.__dakar.berline.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const road = await da(id => { const p = window.__dakar.road.at(id, 0, 0), q = window.__dakar.road.project(p.x, p.z); return { swapS: q.swapS, length: q.length }; }, ROAD);
  // up to just before the middle, then the connection drops for the swap
  await driveRoad(a, t, 'berline', ROAD, road.swapS - 25, { cruise: 9, brakeAtEnd: false, stall: 120000 });
  check('before the middle: still in Pikine\'s room, unseen by the other client', (await da(() => window.__dakar.pos().hub)) === 'pikine' && (await db(() => window.__dakar.presence().peers.length)) === 0);
  await A.ctx.setOffline(true);
  await driveRoad(a, t, 'berline', ROAD, road.swapS + 50, { cruise: 9, brakeAtEnd: false, stall: 120000 });
  const mid = await da(() => ({ hub: window.__dakar.pos().hub, car: window.__dakar.berline.at(), status: window.__dakar.presence().status }));
  check('the connection is down while the district swaps: the car goes on driving across it (same car, driver\'s seat, pad)', mid.hub === 'almadies' && mid.car.driving && mid.car.speed > 3 && mid.status !== 'online', JSON.stringify({ hub: mid.hub, speed: mid.car.speed, status: mid.status }));
  await A.ctx.setOffline(false);
  await a.waitForFunction(() => window.__dakar.presence().status === 'online', null, { timeout: 120000 }).catch(() => {});
  check('the connection comes back: the driver is online again', (await da(() => window.__dakar.presence().status)) === 'online');
  // keep driving a little so the position is fresh, then the other client sees the driver in Almadies's room
  await driveRoad(a, t, 'berline', ROAD, road.swapS + 90, { cruise: 9, brakeAtEnd: true, stall: 120000 });
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.name === 'Moussa'), null, { timeout: 90000 }).catch(() => {});
  const seen = await db(() => window.__dakar.presence().peers.find(p => p.name === 'Moussa') ?? null), mine = await da(() => window.__dakar.berline.at());
  check('after the middle the driver is in Almadies\'s room and the other client sees them, at the place the road gives (Almadies\'s frame)', !!seen && Math.hypot(seen.x - mine.x, seen.z - mine.z) < 15, JSON.stringify({ seen: seen && [Math.round(seen.x), Math.round(seen.z)], mine: [Math.round(mine.x), Math.round(mine.z)] }));
  // back across the middle: the car is turned (set, not driven: the turn is checked by check-corridor.mjs), then driven home across it
  await da(([x, z, yaw]) => window.__dakar.berline.place(x, z, yaw), [mine.x, mine.z, mine.yaw + Math.PI]);
  await driveRoad(a, t, 'berline', ROAD, road.swapS - 60, { cruise: 9, brakeAtEnd: false, stall: 120000 });
  check('back across the middle: the driver is in Pikine\'s room again', (await da(() => window.__dakar.pos().hub)) === 'pikine');
  await sleep(4000);
  check('the other client no longer sees them', !(await db(() => window.__dakar.presence().peers.some(p => p.name === 'Moussa'))));
  check('no JavaScript errors in either client', a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 2).join(' | '));
} finally {
  await browser.close(); worker.kill('SIGTERM');
}
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
