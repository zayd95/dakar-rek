// What is solid on the road between districts (src/road): a vehicle parked on it is a wall for the traffic (the cars behind it stop, they do not drive through it); the roadside stalls are
// walls for the player's car (it stops, it is hurt, it does not pass through); the traffic's footprints are handed to the vehicle's collisions. Real touch controls throughout.
// Usage: node scripts/check-corridor-hazards.mjs <baseUrl> <outDir> <saveJson>     (a v6 save with the berline parked on the road: see scripts/lib/roadDrive.mjs)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base, out, saveFile] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const ROAD = 'pikine-almadies';
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(s => { try { localStorage.setItem('dakarrek.guest.save.v6', s); localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, fs.readFileSync(saveFile, 'utf8'));
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=11`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const d = (f, a) => page.evaluate(f, a), t = await realTouch(page);

// ---------------------------------------------------------------- 1. a vehicle parked in a lane stops the traffic behind it
const car = await d(() => window.__dakar.berline.at());
const pr = await d(([x, z]) => window.__dakar.road.project(x, z), [car.x, car.z]);
check('the car is parked on the road, in the right-hand lane', pr.on && pr.road === ROAD && Math.abs(pr.d + 2.8) < 1.2, JSON.stringify({ s: pr.s, d: pr.d }));
const put = await d(([id, s]) => window.__dakar.road.putTraffic(id, 0, s - 45, 1), [ROAD, pr.s]);
let minGap = Infinity, stoppedGap = null, last = null;
for (let i = 0; i < 90 && stoppedGap === null; i++) {
  await page.waitForTimeout(700);
  const cars = await d(id => window.__dakar.road.info().find(r => r.road === id).traffic, ROAD);
  const mine = cars.filter(c => c.dir === 1 && c.x > car.x - 5).map(c => ({ ...c, gap: Math.hypot(c.x - car.x, c.z - car.z) })).sort((a, b) => a.gap - b.gap)[0];
  if (!mine) continue;
  last = mine; minGap = Math.min(minGap, mine.gap);
  if (mine.v < 0.1 && mine.gap < 20) stoppedGap = mine.gap;
}
check('the traffic car behind it stops, a few metres short (it does not drive through the parked car)', stoppedGap !== null && minGap > put.hl + 1.6, JSON.stringify({ stoppedGap, minGap: +minGap.toFixed(1), kind: put.kind, last }));
await page.screenshot({ path: `${out}/traffic-behind-parked.png` });

// ---------------------------------------------------------------- 2. what stands at the roadside is a wall for the car
const stalls = await d(([id]) => {
  const g = window.__dakar.cityGeometry(), found = [];
  for (const c of g.colliders) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, p = window.__dakar.road.project(cx, cz);
    if (!p || !p.on || p.road !== id || Math.abs(p.d) > 9.6 || Math.abs(p.d) < 5.6 || p.s < 120 || p.s > 560 || c.h < 2.3 || c.h > 2.5) continue;
    found.push({ cx, cz, s: p.s, d: p.d, w: c.x1 - c.x0, dd: c.z1 - c.z0 });
  }
  return found;
}, [ROAD]);
check('the road has roadside stalls within reach of the carriageway, on its right-hand side', !!stalls.find(k => k.d < 0), JSON.stringify(stalls.slice(0, 2)));
const st = stalls.find(k => k.d < 0);                         // on the right of the road: the driver's door (on the left of the car) is then on ground the walker can reach
if (st) {
  // the car, at the same distance from the centre line as the stall and 26 m before it, pointing along the road
  const start = await d(([id, s, lat]) => window.__dakar.road.at(id, s, lat), [ROAD, st.s - 26, st.d]);
  await d(([p]) => { window.__dakar.berline.place(p.x, p.z, p.yaw); }, [start]);
  const c = await d(() => window.__dakar.berline.at());
  await d(([x, z]) => window.__dakar.place(x, z, 0), [c.x + Math.cos(c.yaw) * 3, c.z - Math.sin(c.yaw) * 3]); await page.waitForTimeout(1500);
  await walkTo(page, t, c.x + Math.cos(c.yaw) * 2, c.z - Math.sin(c.yaw) * 2 + 0.4, { tol: 0.4, ms: 40000 });
  await t.tap('#act');
  try { await page.waitForFunction(() => window.__dakar.berline.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 40000 }); }
  catch (e) { console.log('getIn failed', JSON.stringify(await d(() => ({ focus: window.__dakar.focus()?.id ?? null, me: window.__dakar.pos(), car: window.__dakar.berline.at(), near: window.__dakar.road.probe(window.__dakar.pos().x, window.__dakar.pos().z, 4) }))), JSON.stringify(c), JSON.stringify(st)); await page.screenshot({ path: `${out}/getin-failed.png` }); throw e; }
  const hp0 = (await d(() => window.__dakar.berline.info())).asset?.condition;
  // gas, wheel straight (the stick left alone): the car runs at the stall
  const gas = await t.centre('#ridepad .rp-gas'); await t.down(1, gas.x, gas.y);
  let minD = Infinity, speedMax = 0, t0 = Date.now(), hit = false;
  while (Date.now() - t0 < 120000) {
    const a = await d(() => window.__dakar.berline.at()); speedMax = Math.max(speedMax, a.speed);
    minD = Math.min(minD, Math.hypot(a.x - st.cx, a.z - st.cz));
    const f = await d(() => window.__dakar.berline.feel?.()); if (f?.impacts?.length) { hit = true; break; }
    if (speedMax > 4 && a.speed < 0.2) { hit = true; break; }
    await page.waitForTimeout(150);
  }
  await t.up(1);
  await page.waitForTimeout(1500);
  const after = await d(() => ({ car: window.__dakar.berline.at(), info: window.__dakar.berline.info(), feel: window.__dakar.berline.feel?.() }));
  const inside = after.car.x > st.cx - st.w / 2 && after.car.x < st.cx + st.w / 2 && after.car.z > st.cz - st.dd / 2 && after.car.z < st.cz + st.dd / 2;
  check('the car runs into a roadside solid thing (a lamp post or the stall) and stops: it does not pass through (its centre never gets inside the stall)', hit && !inside && Math.abs(after.car.speed) < 1 && minD > 0.8, JSON.stringify({ minD: +minD.toFixed(2), speedMax: +speedMax.toFixed(1), speed: after.car.speed }));
  check('the hit is felt and costs the car: an impact is recorded and its condition falls', (after.feel?.impacts?.length ?? 0) >= 1 && after.info.asset?.condition < hp0, JSON.stringify({ hp: [hp0, after.info.asset?.condition], impacts: after.feel?.impacts?.slice(0, 2) }));
  await page.screenshot({ path: `${out}/stall-hit.png` });
  // and the car can back away and drive on
  const brake = await t.centre('#ridepad .rp-brake'); await t.tap('#ridepad .rp-rev'); await t.down(1, gas.x, gas.y); await page.waitForTimeout(3000); await t.up(1); await t.tap('#ridepad .rp-rev');
  const back = await d(() => window.__dakar.berline.at());
  check('it backs away from the stall and is free again', Math.hypot(back.x - st.cx, back.z - st.cz) > minD + 1.5, JSON.stringify({ was: +minD.toFixed(2), now: +Math.hypot(back.x - st.cx, back.z - st.cz).toFixed(2) }));
  void brake;
}
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
