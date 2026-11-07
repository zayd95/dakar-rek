// Diagnostic, not a journey: drives the Teranga the way check-vtc-ride.mjs does for its last leg (from where the Pikine → Plateau road ends, along the Plateau's street grid, to the Grande Mosquée's
// drop-off kerb), with the car's pose sampled four times a second and every impact recorded with the pose it happened at, so that a stall can be explained instead of re-run.
// Usage: HOUR=8 [DAY=1931] [ROLL=1] node scripts/probe-vtc-dropoff.mjs <baseUrl> <outDir>     (the passenger is left out: the question is the car's way, not the ride's bookkeeping)
// DAY pins the city day (the day seeds the road events and the rides, and follows the wall clock: 24 real minutes a day); ROLL=1 moves the city day on by one when the car is halfway, as a ride that
// spans a day's end does, to see what a road event built for the new day does to a route planned before it.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';
import { route, closedZones } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4176/', out = '/tmp/claude-0/probe-vtc'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const HOUR = Number(process.env.HOUR ?? 8), DAY = process.env.DAY ? Number(process.env.DAY) : null, ROLL = process.env.ROLL === '1', T = { timeout: 300000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
await page.goto(`${base}?debug&touch&heure=${HOUR}&argent=4500000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga, null, T);
const t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, T);
await d(() => window.__dakar.setHour(Number(new URLSearchParams(location.search).get('heure') ?? 8)));
if (DAY !== null) await d(n => { const A = window.__dakar; A.nextDay(n - A.nextDay(0)); }, DAY);
console.log('city day', await d(() => window.__dakar.nextDay(0)), 'hour', HOUR, ROLL ? '(+1 at z -110)' : '');
// where the Pikine → Plateau road ends (the journey's log: at [-62.34, -157.05, 0.01]) and the drop-off kerb of the Grande Mosquée (the journey's log: x -30, z -55.7, yaw π/2)
const START = { x: -62.34, z: -157.05, yaw: 0.01 }, DROP = { x: -30, z: -55.7, yaw: Math.PI / 2 };
// the car's parking record is moved to the Plateau's road end (the labelled shortcut the nightlife journey uses), then the player is put beside it
await d(([x, z, yaw]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('plateau'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = yaw; A.save?.(); A.teleport('plateau', x + 2.6, z, 0); }, [START.x, START.z, START.yaw]);
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
await page.waitForTimeout(1500);
await boardVehicle(page, t, 'teranga');
await d(roll => {
  const A = window.__dakar; window.__tr = []; window.__imp = []; let seen = 0, rolled = false; window.__rolled = null;
  window.__trace = setInterval(() => {
    const a = A.teranga.at(), f = A.teranga.feel(), n = (f.impacts ?? []).length;
    window.__tr.push({ t: +(performance.now() / 1000).toFixed(1), x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2), v: +(a.speed ?? 0).toFixed(2) });
    if (roll && !rolled && a.z > -110) { rolled = true; window.__rolled = { day: A.nextDay(1), at: { x: +a.x.toFixed(1), z: +a.z.toFixed(1) } }; }
    if (n > seen) { for (let i = seen; i < n; i++) window.__imp.push({ ...f.impacts[i], at: { x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2) } }); seen = n; }
  }, 250);
}, ROLL);
const a0 = await d(() => window.__dakar.teranga.at());
const closed = await closedZones(page);
const toDrop = route({ x: a0.x, z: a0.z, yaw: a0.yaw }, DROP, { cruise: 7, avoid: closed });
console.log('start', JSON.stringify({ x: a0.x, z: a0.z, yaw: a0.yaw }), 'closed zones', JSON.stringify(closed));
console.log('route', JSON.stringify(toDrop?.map(p => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), speed: p.speed, tol: p.tol }))));
if (toDrop) await pilot(page, t, 'teranga', toDrop, { cruise: 7, stall: 60000, ms: 600000, brakeAtEnd: true });
await page.waitForTimeout(1500);
const tr = await d(() => { clearInterval(window.__trace); return { tr: window.__tr, imp: window.__imp, feel: window.__dakar.teranga.feel(), roadEvents: window.__dakar.roadEvents?.() ?? [], rolled: window.__rolled }; });
const last = tr.tr.at(-1);
console.log('end', JSON.stringify(last), 'distance to the drop-off', Math.hypot(last.x - DROP.x, last.z - DROP.z).toFixed(1), 'm');
console.log('trace (every 2 s):', tr.tr.filter((_, i) => i % 8 === 0).map(p => `${p.t}:${p.x},${p.z},v${p.v}`).join(' '));
console.log('impacts:', JSON.stringify(tr.imp));
console.log('feel keys:', Object.keys(tr.feel).join(','));
console.log('rolled:', JSON.stringify(tr.rolled));
console.log('road events at the end (hour', HOUR, '):', JSON.stringify(tr.roadEvents.filter(e => e.on || e.built).map(e => ({ kind: e.kind, on: e.on, built: e.built, closed: e.closed, from: [e.edge.ax, e.edge.az], to: [e.edge.bx, e.edge.bz] }))));
await page.screenshot({ path: `${out}/end-h${HOUR}-d${DAY ?? 'now'}${ROLL ? '-roll' : ''}.png` });
fs.writeFileSync(`${out}/trace-h${HOUR}-d${DAY ?? 'now'}${ROLL ? '-roll' : ''}.json`, JSON.stringify(tr));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
