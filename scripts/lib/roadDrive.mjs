// Drives the owned car along one of the roads between districts (src/road) with the REAL touch controls (the stick of src/transport/ridePad.ts: forward = throttle, sideways = steering; « Accélérer » with `boost`), steering by the road's own
// centre line: the road's points are asked of the page in the frame of whichever district is loaded (`__dakar.road.at`), so the route needs no waypoint table and no shift when the district swaps.
import { realTouch, STICK } from './realTouch.mjs';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** Pure pursuit in the vehicle's own turning model (the same law as tests/helpers/pilot.ts, proved on every road in tests/driveRoads.test.ts): the stick that gives the curvature toward the aim point. */
const steerFor = (err, dist, v, d) => Math.max(-1, Math.min(1, -((2 * Math.sin(err)) / Math.max(6, dist)) * Math.max(d.turnRadius, d.grip ? (v * v) / d.grip : 0)));

/**
 * Drive along `road` until the arc length reaches `toS` (going up if `toS` is above where the car is, down otherwise), keeping to the right-hand lane. Returns the car's last `at()`.
 * `cruise`: m/s on a straight; slower in a bend and in a junction. `onTick(at, pr)` is called each step. `brakeAtEnd`: stop at the end with the brake pedal.
 */
export async function driveRoad(page, t, key, road, toS, { cruise = 8, lane = 2.8, look = 0, ms = 400000, brakeAtEnd = true, onTick, stall = 60000, boost = false } = {}) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const drv = await page.evaluate(k => window.__dakar[k].info().drive, key);
  const gas = await t.centre('#ridepad .rp-gas'), brk = await t.centre('#ridepad .rp-brake'), j = await t.centre('#joy'), r = STICK, t0 = Date.now();
  let gasOn = false, brakeOn = false, last = null, at = null, bestT = Date.now(), bestS = null;
  let steerNow = 0, boostOn = false;
  const sendStick = () => t.move(2, j.x + steerNow * r, j.y - (gasOn ? r : 0), 1);
  const press = async on => { if (on === gasOn) return; gasOn = on; await sendStick(); };
  const boostBtn = async on => { if (on === boostOn) return; boostOn = on; if (on) await t.down(1, gas.x, gas.y); else await t.up(1); };
  const brake = async on => { if (on === brakeOn) return; brakeOn = on; if (on) await t.down(4, brk.x, brk.y); else await t.up(4); };
  await t.down(2, j.x, j.y);
  let dir = 0;
  while (Date.now() - t0 < ms) {
    at = await page.evaluate(k => window.__dakar[k].at(), key); if (!at) break;
    const pr = await page.evaluate(([x, z, id]) => { const p = window.__dakar.road.project(x, z); return p && p.road === id ? p : null; }, [at.x, at.z, road]);
    if (!pr) { await page.waitForTimeout(90); continue; }
    if (!dir) dir = toS > pr.s ? 1 : -1;
    onTick?.(at, pr);
    if ((dir > 0 && pr.s >= toS) || (dir < 0 && pr.s <= toS)) break;
    if (bestS === null || Math.abs(pr.s - bestS) > 3) { bestS = pr.s; bestT = Date.now(); } else if (Date.now() - bestT > stall) { const near = await page.evaluate(([x, z, id]) => { const i = window.__dakar.road.info().find(r => r.road === id); return (i?.traffic ?? []).filter(c => Math.hypot(c.x - x, c.z - z) < 60).map(c => [Math.round(c.x), Math.round(c.z), c.dir, +c.v.toFixed(1), c.kind]); }, [at.x, at.z, road]); const dbg = await page.evaluate(([k, x, z]) => ({ info: (({ driving, bumps, speed, x, z, yaw }) => ({ driving, bumps, speed, x, z, yaw }))(window.__dakar[k].info()), probe: window.__dakar.road.probe(x, z, 5), staged: window.__dakar.road.staged(), mode: window.__dakar.pos().mode, pad: document.body.classList.contains('ridepad'), feel: window.__dakar[k].feel?.() }), [key, at.x, at.z]); throw new Error(`stalled ${JSON.stringify(dbg).slice(0, 700)} at s=${pr.s.toFixed(0)} d=${pr.d.toFixed(1)} (speed ${at.speed.toFixed(2)}) at (${at.x.toFixed(0)},${at.z.toFixed(0)}) yaw ${at.yaw.toFixed(2)}; traffic near ${JSON.stringify(near)}`); }
    const lookS = look || Math.max(14, Math.min(48, 10 + 1.3 * Math.abs(at.speed))), sT = Math.max(0, Math.min(pr.length, pr.s + dir * lookS)), lat = dir > 0 ? -lane : lane;           // right of the direction of travel, in the road's a → b left-hand frame
    const aim = await page.evaluate(([id, s, l]) => window.__dakar.road.at(id, s, l), [road, sT, lat]);
    const err = wrap(Math.atan2(aim.x - at.x, aim.z - at.z) - at.yaw);
    last = { t: at.t, yaw: at.yaw };
    const steer = steerFor(err, Math.hypot(aim.x - at.x, aim.z - at.z), Math.abs(at.speed), drv);
    steerNow = steer; await sendStick();
    const limit = cruise * (Math.abs(err) > 0.35 ? 0.45 : 1);
    await brake(at.speed > limit + 1.5);
    await press(at.speed < limit); await boostBtn(boost && gasOn);
    await page.waitForTimeout(90);
  }
  gasOn = false; await boostBtn(false); await t.up(2); await brake(false);
  if (brakeAtEnd) {
    // the brake pedal slows the car and, on a motorbike, goes on to reverse it: it is let go as soon as the vehicle has (nearly) stopped, and the vehicle then rolls the last bit
    await t.down(1, brk.x, brk.y);
    for (let i = 0; i < 400; i++) { const sp = await page.evaluate(k => window.__dakar[k].at()?.speed ?? 0, key); if (sp < 0.35) break; await page.waitForTimeout(40); }
    await t.up(1);
    await page.waitForFunction(k => Math.abs(window.__dakar[k].at()?.speed ?? 0) < 0.15, key, { timeout: 30000 }).catch(() => {});
  }
  return await page.evaluate(k => window.__dakar[k].at(), key);
}

export { realTouch };
