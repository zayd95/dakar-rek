// Almadies car park behind the hospitality strip (src/world/hospitalityStrip.ts): the Teranga is driven with the pedal stick (real touch) from the south road through the car park's way in
// (gantry, booth and barrier beside it) and along the aisle between the two rows of painted bays, without touching a solid; the way out is the same. Captures for the evidence.
// Debug hooks used (labelled): the hour, putting the Teranga's parking record at the start of the lane, reading its position.
// Usage: node scripts/check-almadies-carpark.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4660/', out = '/tmp/claude-0/m4/carpark'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let n = 0; const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };

await page.goto(`${base}?debug&touch&heure=20&argent=4500000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga, null, T);
const t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
// block 1's car park: the way in at x −30 on its south edge (z −69.5), the road at z −60; the car starts on the road's north lane heading west
const start = { x: -2, z: -63.7 }, yaw = -Math.PI / 2;
await d(([x, z, y]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('almadies'); c[`vehicle:${id}:x`] = x; c[`vehicle:${id}:z`] = z; c[`vehicle:${id}:yaw`] = y; A.save?.(); A.teleport('corniche'); }, [start.x, start.z, yaw]);
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
await d(([x, z]) => window.__dakar.teleport('almadies', x, z, 0), [start.x + 2.4, start.z + 0.5]);
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
await page.waitForTimeout(1500);
await boardVehicle(page, t, 'teranga');
await shot('on-the-road');
// a right turn from the lane into the opening (turning radius 5.6 m), then straight in and along the aisle
const R = 5.6, xs = -23.8, zl = start.z;
const arc = [30, 60, 90].map(a => { const r = a * Math.PI / 180; return { x: xs - R * Math.sin(r), z: zl - R * (1 - Math.cos(r)), tol: 1.2, speed: 2.4 }; });
const route = [{ x: -14, z: zl, tol: 2.5, speed: 4.5 }, { x: xs, z: zl, tol: 1.2, speed: 2.4 }, ...arc, { x: -30, z: -74, tol: 1.5, speed: 3 }, { x: -30, z: -81.5, tol: 1.5, speed: 2.2 }, { x: -37, z: -82.8, tol: 2, speed: 1.6 }];
await pilot(page, t, 'teranga', route, { brakeAtEnd: true, cruise: 4.5 });
const at = await d(() => window.__dakar.teranga.at());
await shot('in-the-car-park');
const inLot = at.x > -51 && at.x < -9 && at.z < -75 && at.z > -90;
check('driven with the pedal stick from the road, through the way in, to the aisle between the rows of bays', inLot, JSON.stringify({ x: +at.x.toFixed(1), z: +at.z.toFixed(1) }));
check('the car is still a car (not stuck on a solid): it moved well into the lot', Math.hypot(at.x - start.x, at.z - start.z) > 20, JSON.stringify({ from: start, to: [+at.x.toFixed(1), +at.z.toFixed(1)] }));
await d(() => window.__dakar.pause?.(true));
await d(() => { const A = window.__dakar; A.cam([-20, 18, -66], [-33, 0.5, -84]); A.render?.(); });
await page.waitForTimeout(600); await shot('lot-from-above');
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `${failed} car park checks FAILED` : 'car park checks passed');
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
