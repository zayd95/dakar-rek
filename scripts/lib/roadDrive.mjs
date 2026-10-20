// Drives the owned car along one of the roads between districts (src/road) with the REAL touch controls (the gas pedal and the stick of src/transport/ridePad.ts), steering by the road's own
// centre line: the road's points are asked of the page in the frame of whichever district is loaded (`__dakar.road.at`), so the route needs no waypoint table and no shift when the district swaps.
import { realTouch } from './realTouch.mjs';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Drive along `road` until the arc length reaches `toS` (going up if `toS` is above where the car is, down otherwise), keeping to the right-hand lane. Returns the car's last `at()`.
 * `cruise`: m/s on a straight; slower in a bend and in a junction. `onTick(at, pr)` is called each step. `brakeAtEnd`: stop at the end with the brake pedal.
 */
export async function driveRoad(page, t, key, road, toS, { cruise = 8, lane = 2.8, look = 22, ms = 400000, brakeAtEnd = true, onTick, stall = 60000 } = {}) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const gas = await t.centre('#ridepad .rp-gas'), brk = await t.centre('#ridepad .rp-brake'), j = await t.centre('#joy'), r = 30, t0 = Date.now();
  let gasOn = false, brakeOn = false, last = null, at = null, bestT = Date.now(), bestS = null;
  const press = async on => { if (on === gasOn) return; gasOn = on; if (on) await t.down(1, gas.x, gas.y); else await t.up(1); };
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
    if (bestS === null || Math.abs(pr.s - bestS) > 3) { bestS = pr.s; bestT = Date.now(); } else if (Date.now() - bestT > stall) { const near = await page.evaluate(([x, z]) => { const i = window.__dakar.road.info()[0]; return (i?.traffic ?? []).filter(c => Math.hypot(c.x - x, c.z - z) < 60).map(c => [Math.round(c.x), Math.round(c.z), c.dir, +c.v.toFixed(1), c.kind]); }, [at.x, at.z]); throw new Error(`stalled at s=${pr.s.toFixed(0)} d=${pr.d.toFixed(1)} (speed ${at.speed.toFixed(2)}) at (${at.x.toFixed(0)},${at.z.toFixed(0)}) yaw ${at.yaw.toFixed(2)}; traffic near ${JSON.stringify(near)}`); }
    const sT = Math.max(0, Math.min(pr.length, pr.s + dir * look)), lat = dir > 0 ? -lane : lane;           // right of the direction of travel, in the road's a → b left-hand frame
    const aim = await page.evaluate(([id, s, l]) => window.__dakar.road.at(id, s, l), [road, sT, lat]);
    const err = wrap(Math.atan2(aim.x - at.x, aim.z - at.z) - at.yaw);
    const rate = last && at.t > last.t ? wrap(at.yaw - last.yaw) / (at.t - last.t) : 0; last = { t: at.t, yaw: at.yaw };
    const steer = Math.max(-1, Math.min(1, -(1.7 * err - 0.55 * Math.max(-1.5, Math.min(1.5, rate)))));
    await t.move(2, j.x + steer * r, j.y, 1);
    const limit = cruise * (Math.abs(err) > 0.35 ? 0.45 : 1);
    await brake(at.speed > limit + 1.5);
    await press(at.speed < limit);
    await page.waitForTimeout(90);
  }
  await t.up(2); await press(false); await brake(false);
  if (brakeAtEnd) { await t.down(1, brk.x, brk.y); await page.waitForFunction(k => Math.abs(window.__dakar[k].at()?.speed ?? 0) < 0.15, key, { timeout: 60000 }).catch(() => {}); await t.up(1); }
  return await page.evaluate(k => window.__dakar[k].at(), key);
}

export { realTouch };
