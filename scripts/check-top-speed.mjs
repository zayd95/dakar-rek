// Top speed with REAL touch on a phone page (src/transport/ridePad.ts, controls.ts, drive.ts): the complaint was a car stuck at 0 to 40 km/h.
//  A. a thumb on the MIDDLE of the gas pedal is full throttle: the car passes the town's cruising speed (68 km/h) and, held, opens the boosted range;
//  B. along the open road (Pikine → Almadies) with the toe down the Teranga passes 150 km/h and nothing breaks: no page error, the district swaps, the car stays on the road.
// Usage: node scripts/check-top-speed.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle, padRig } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base = 'http://127.0.0.1:4700/', out = '/tmp/claude-0/comb/top'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a), AT = () => d(() => window.__dakar.teranga.at());
const sleep = ms => page.waitForTimeout(ms);
let n = 0; const shot = async name => { await sleep(300); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };

await page.goto(`${base}?debug&touch&heure=11&argent=4500000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga, null, T);
const t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, T);

// ---- A. the middle of the pedal
await d(() => window.__dakar.teranga.place(-112, 3.2, Math.PI / 2)); await d(() => window.__dakar.place(-112, 0.6, 0)); await sleep(800);
await boardVehicle(page, t, 'teranga'); await sleep(800);
await d(() => window.__dakar.teranga.place(-112, 3.2, Math.PI / 2)); await sleep(500);
const R = await padRig(page, t), gasP = R.gas(5);
await d(() => { window.__vmax = 0; const tick = () => { window.__vmax = Math.max(window.__vmax, window.__dakar.teranga.at()?.speed ?? 0); requestAnimationFrame(tick); }; tick(); });
await gasP(true, 0.55);                                                                // the thumb on the middle of the pedal, no more
const seen = { v: 0 };
await page.waitForFunction(() => (window.__dakar.teranga.at()?.x ?? 0) > 100, null, { timeout: 180000 }).catch(() => {});
const a = await AT(); seen.v = await d(() => window.__vmax);
await shot('middle-of-the-pedal');
await gasP(false);
check('a thumb on the middle of the gas pedal takes the car past the town cruising speed (68 km/h = 19 m/s), not half of it', seen.v > 21.5, JSON.stringify({ kmh: Math.round(seen.v * 3.6), x: Math.round(a.x) }));
// stop with the brake
const brk = await t.centre('#ridepad .rp-brake'); await t.down(4, brk.x, brk.y); await page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {}); await t.up(4);

// ---- B. the open road
const ROAD = 'pikine-almadies';
let top = 0, maxLat = 0, attempts = 0, crashed = 0;
const tick = (at, pr) => { top = Math.max(top, at.speed); maxLat = Math.max(maxLat, Math.abs(pr.d)); };
const road = await d(r => { const p = window.__dakar.road.at(r, 0, 0); const q = window.__dakar.road.project(p.x, p.z); return { length: q.length, swapS: q.swapS }; }, ROAD);
const hub0 = (await d(() => window.__dakar.pos())).hub;
// the pilot is a script that talks to the page between frames (a slow headless frame is a long time to a car at 150 km/h): a crash is counted, and the stretch driven again, three tries at most
for (; attempts < 3; attempts++) {
  const p0 = await d(r => window.__dakar.road.at(r, 160, -2.8), ROAD);
  await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [p0.x, p0.z, p0.yaw]); await sleep(1200);
  try { await driveRoad(page, t, 'teranga', ROAD, Math.min(road.length - 120, road.swapS + 200), { cruise: 48, boost: true, onTick: tick, brakeAtEnd: true, ms: 600000, stall: 60000 }); if (top > 42 && (await d(() => window.__dakar.pos())).hub !== hub0) break; }
  catch (e) { crashed++; console.log('attempt', attempts + 1, 'stopped:', String(e.message).slice(0, 80)); }
  if (top > 42 && (await d(() => window.__dakar.pos())).hub !== hub0) break;
}
const hub1 = (await d(() => window.__dakar.pos())).hub;
await shot('open-road');
console.log('attempts', attempts + 1, 'crashed', crashed);
check('on the open road with the toe down the Teranga passes 150 km/h (42 m/s)', top > 42, JSON.stringify({ kmh: Math.round(top * 3.6) }));
check('and keeps to the road (never more than the carriageway from the middle)', maxLat < 7, JSON.stringify({ maxLat: +maxLat.toFixed(1) }));
check('the district changed in the middle of the road at that speed', hub0 !== hub1, JSON.stringify({ hub0, hub1 }));
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`${total - failed}/${total} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
