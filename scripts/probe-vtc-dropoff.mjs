// Diagnostic, not a journey: drives the Teranga the way check-vtc-ride.mjs does for its last leg (from where the Pikine → Plateau road ends, along the Plateau's street grid, to the Grande Mosquée's
// drop-off kerb), with the car's pose sampled four times a second and every impact recorded with the pose it happened at, so that a stall can be explained instead of re-run.
// Usage: HOUR=8 node scripts/probe-vtc-dropoff.mjs <baseUrl> <outDir>     (the passenger is left out: the question is the car's way, not the ride's bookkeeping)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';
import { route, closedZones } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4176/', out = '/tmp/claude-0/probe-vtc'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const HOUR = Number(process.env.HOUR ?? 8), T = { timeout: 300000 };
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
await d(() => window.__dakar.teleport('plateau'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play', null, T);
// where the Pikine → Plateau road ends (the journey's log: at [-62.34, -157.05, 0.01]) and the drop-off kerb of the Grande Mosquée (the journey's log: x -30, z -55.7, yaw π/2)
const START = { x: -62.34, z: -157.05, yaw: 0.01 }, DROP = { x: -30, z: -55.7, yaw: Math.PI / 2 };
await d(([x, z, yaw]) => window.__dakar.teranga.place(x, z, yaw), [START.x, START.z, START.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [START.x + 2.6, START.z]);
await page.waitForTimeout(1500);
await boardVehicle(page, t, 'teranga');
await d(() => {
  const A = window.__dakar; window.__tr = []; window.__imp = []; let seen = 0;
  window.__trace = setInterval(() => {
    const a = A.teranga.at(), f = A.teranga.feel(), n = (f.impacts ?? []).length;
    window.__tr.push({ t: +(performance.now() / 1000).toFixed(1), x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2), v: +(a.speed ?? 0).toFixed(2) });
    if (n > seen) { for (let i = seen; i < n; i++) window.__imp.push({ ...f.impacts[i], at: { x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2) } }); seen = n; }
  }, 250);
});
const a0 = await d(() => window.__dakar.teranga.at());
const closed = await closedZones(page);
const toDrop = route({ x: a0.x, z: a0.z, yaw: a0.yaw }, DROP, { cruise: 7, avoid: closed });
console.log('start', JSON.stringify({ x: a0.x, z: a0.z, yaw: a0.yaw }), 'closed zones', JSON.stringify(closed));
console.log('route', JSON.stringify(toDrop?.map(p => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), speed: p.speed, tol: p.tol }))));
if (toDrop) await pilot(page, t, 'teranga', toDrop, { cruise: 7, stall: 60000, ms: 600000, brakeAtEnd: true });
await page.waitForTimeout(1500);
const tr = await d(() => { clearInterval(window.__trace); return { tr: window.__tr, imp: window.__imp, feel: window.__dakar.teranga.feel(), roadEvents: window.__dakar.roadEvents?.() ?? [] }; });
const last = tr.tr.at(-1);
console.log('end', JSON.stringify(last), 'distance to the drop-off', Math.hypot(last.x - DROP.x, last.z - DROP.z).toFixed(1), 'm');
console.log('trace (every 2 s):', tr.tr.filter((_, i) => i % 8 === 0).map(p => `${p.t}:${p.x},${p.z},v${p.v}`).join(' '));
console.log('impacts:', JSON.stringify(tr.imp));
console.log('feel keys:', Object.keys(tr.feel).join(','));
console.log('road events (hour', HOUR, '):', JSON.stringify(tr.roadEvents.map(e => ({ kind: e.kind, closed: e.closed, from: e.edge && [e.edge.ax, e.edge.az], to: e.edge && [e.edge.bx, e.edge.bz] }))));
await page.screenshot({ path: `${out}/end-h${HOUR}.png` });
fs.writeFileSync(`${out}/trace-h${HOUR}.json`, JSON.stringify(tr));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
