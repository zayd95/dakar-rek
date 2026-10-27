// Real touch input for the phone checks: fingers go through Chrome's own input pipeline (CDP Input.dispatchTouchEvent), so the page gets touchstart / touchmove /
// touchend and the pointer events the browser derives from them, with several fingers at once (one on the gas button, one on the joystick), exactly as on a phone.
// Not synthetic `new PointerEvent(...)` dispatches and not the mouse. Usage: const t = await realTouch(page); await t.down(1, x, y); await t.move(1, x2, y2); await t.up(1);
export async function realTouch(page) {
  const cdp = await page.context().newCDPSession(page), fingers = new Map();
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1 })) });
  return {
    fingers,
    /** A finger lands at (x, y). */
    async down(id, x, y) { fingers.set(id, { x, y }); await send('touchStart', [...fingers]); },
    /** A finger slides to (x, y) (in `steps` small moves). */
    async move(id, x, y, steps = 3) {
      const a = fingers.get(id); if (!a) return;
      for (let i = 1; i <= steps; i++) { fingers.set(id, { x: a.x + ((x - a.x) * i) / steps, y: a.y + ((y - a.y) * i) / steps }); await send('touchMove', [...fingers]); }
    },
    /** A finger leaves the glass. */
    async up(id) { if (!fingers.has(id)) return; const gone = [[id, fingers.get(id)]]; fingers.delete(id); await send('touchEnd', gone); },
    /** Every finger leaves. */
    async upAll() { for (const id of [...fingers.keys()]) await this.up(id); },
    /** The centre of an element, in page pixels. */
    async centre(selector) {
      const c = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
      if (!c) throw new Error(`realTouch: nothing matches « ${selector} » on the page`);
      return c;
    },
    /** Tap an element with one finger. */
    async tap(selector, id = 9) { const c = await this.centre(selector); await this.down(id, c.x, c.y); await new Promise(r => setTimeout(r, 60)); await this.up(id); },
  };
}

/** The joystick's full travel in page pixels (src/ui/hud.ts R): a push of `f` of it is `f` of the stick (walking on foot; a vehicle has the steering rocker and the pedals instead). */
export const STICK = 50;

/**
 * The driving pad's parts in page pixels (src/transport/ridePad.ts): the steering rocker under the left thumb (the thumb's place on it sets the wheel: the rim ±1, never less than 0.4 once it is
 * down, nothing in the middle gap) and the tall gas pedal under the right (the lower the toe, the more throttle; to the floor, the boosted range).
 */
export async function padRig(page, t) {
  const b = await page.evaluate(() => { const r = document.querySelector('#steerpad').getBoundingClientRect(), g = document.querySelector('#ridepad .rp-gas').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, half: r.width / 2, gx: g.left + g.width / 2, gtop: g.top, gh: g.height }; });
  return {
    ...b,
    /** A finger on the rocker for a wheel of `s` (−1 … 1): lifted for a small one, a half-and-half press for a gentle one, the real place on the rocker for a firm one. Call it again as `s` changes. */
    rocker(id) {
      let on = false, tog = 0;
      return async s => {
        const a = Math.abs(s), want = a >= 0.4 || (a >= 0.12 && tog++ % 2 === 0);
        if (!want) { if (on) { await t.up(id); on = false; } return; }
        const m = Math.max(0.08, Math.min(0.97, (Math.max(0.4, a) - 0.4) / 0.6)), x = b.cx + Math.sign(s) * m * b.half;
        if (!on) { await t.down(id, x, b.cy); on = true; } else await t.move(id, x, b.cy, 1);
      };
    },
    /** A finger on the gas pedal: off, on at the heel's half (cruising: no boost), `boost` true (the toe on the floor) or a number (how far down the pedal, 0 heel … 1 toe). Call it again as the wish changes. */
    gas(id) {
      let on = false, f = 0;
      return async (want, boost = false) => {
        const nf = typeof boost === 'number' ? boost : boost ? 0.97 : 0.8;
        if (!want) { if (on) { await t.up(id); on = false; } return; }
        if (!on) { await t.down(id, b.gx, b.gtop + nf * b.gh); on = true; f = nf; } else if (nf !== f) { await t.move(id, b.gx, b.gtop + nf * b.gh, 1); f = nf; }
      };
    },
  };
}

/**
 * Drive a vehicle with real fingers, as on a phone (src/transport/ridePad.ts): the LEFT thumb on the steering rocker (`steer`: how far, −1 left … 1 right), the RIGHT thumb on a pedal:
 * « Frein » (`brake`: a car held at a standstill backs up; `reverse` is the same hold, kept for the older checks) or the gas pedal (`fwd` 0…1, default 1 unless braking: how low the toe is;
 * `boost`: the toe on the floor). Holds until `hold()` resolves, then lets go.
 */
export async function padDrive(page, t, { steer = 0, fwd, brake = false, reverse = false, boost = false, hold }) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const braking = brake || reverse, up = fwd ?? (braking ? 0 : 1), R = await padRig(page, t);
  if (braking) { const b = await t.centre('#ridepad .rp-brake'); await t.down(1, b.x, b.y); }
  else if (boost || up) { const f = boost ? 0.97 : Math.max(0, Math.min(1, (Math.max(0.35, up * 0.9 + 0.1) - 0.35) / 0.65)); await t.down(1, R.gx, R.gtop + f * R.gh); }
  const rocker = R.rocker(2); if (steer) await rocker(steer);
  await hold();
  if (fingers_has(t, 1)) await t.up(1);
  if (steer) await rocker(0);
}
const fingers_has = (t, id) => t.fingers.has(id);

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * Walk on foot to (x, z) with the joystick, as a thumb does: the stick is pushed the way the target lies relative to the camera, and re-aimed every ~120 ms as the camera follows.
 * Resolves when within `tol` metres (or after `ms`); the finger is lifted at the end. Returns the final distance.
 */
export async function walkTo(page, t, x, z, { tol = 0.5, ms = 90000, finger = 3 } = {}) {
  const j = await t.centre('#joy'), r = 30, t0 = Date.now();
  await t.down(finger, j.x, j.y);
  let dist = Infinity;
  while (Date.now() - t0 < ms) {
    const p = await page.evaluate(() => window.__dakar.pos());
    dist = Math.hypot(x - p.x, z - p.z); if (dist < tol) break;
    const a = wrap(Math.atan2(x - p.x, z - p.z) - p.cam), mx = -Math.sin(a), my = Math.cos(a);
    await t.move(finger, j.x + mx * r, j.y - my * r, 1);
    await page.waitForTimeout(120);
  }
  await t.up(finger);
  return dist;
}

/**
 * Drive a car through waypoints with real fingers on the stick (src/transport/ridePad.ts): the stick is pushed up and lifted for a tight turn or a close point (and the brake used),
 * and steers toward the next point (the car's own heading error), each point is done within `tol` m. A stall (no progress for `stall` ms) moves on to the next point.
 * Lifts both fingers at the end (`brakeAtEnd`: then holds the brake until the car has stopped). Returns the car's last `at()`.
 */
export async function pilot(page, t, key, points, { tol = 3.5, ms = 300000, stall = 12000, brakeAtEnd = false, cruise = 4.5, boost = false } = {}) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const R = await padRig(page, t), rocker = R.rocker(2), gasP = R.gas(5), t0 = Date.now();
  let gasOn = false, steerNow = 0;
  const stick = async () => rocker(steerNow);
  const press = async on => { if (on === gasOn) return; gasOn = on; await gasP(on, boost); };                    // `boost`: the toe on the floor (the boosted range, for a drive at speed)
  const brk = await t.centre('#ridepad .rp-brake'); let brakeOn = false;
  const brake = async on => { if (on === brakeOn) return; brakeOn = on; if (on) await t.down(4, brk.x, brk.y); else await t.up(4); };
  let at = null, prev = null, last = null, seen = null;
  points = points.map(p => ({ ...p }));                                     // written in the frame of the district the route starts in; a crossing into the next one (z jumps by a whole street grid) shifts the rest
  for (const w of points) {
    let best = Infinity, lastGain = Date.now();
    while (Date.now() - t0 < ms) {
      at = await page.evaluate(k => window.__dakar[k].at(), key); if (!at) break;
      if (!prev) prev = { x: at.x, z: at.z };
      if (seen && Math.abs(at.z - seen.z) > 100) { const dz = at.z - seen.z; for (const q of points) q.z += dz; prev.z += dz; best = Infinity; lastGain = Date.now(); last = null; }   // another district: same road, new coordinates
      seen = { z: at.z };
      const d = Math.hypot(w.x - at.x, w.z - at.z);
      if (d < (w.tol ?? tol)) break;
      // the sim runs slower than the clock and a sample can land metres apart: a waypoint the car has already passed along its segment is done too
      const gx = w.x - prev.x, gz = w.z - prev.z, gl = Math.hypot(gx, gz) || 1;
      if (((at.x - prev.x) * gx + (at.z - prev.z) * gz) / gl > gl - 1.5) break;
      if (d < best - 0.3) { best = d; lastGain = Date.now(); } else if (Date.now() - lastGain > stall) break;
      // pure pursuit: aim at a point 9 m ahead of the car's nearest point on the segment from the last waypoint to this one (the car holds the lane, it does not cut the corner)
      const sx = w.x - prev.x, sz = w.z - prev.z, sl = Math.hypot(sx, sz) || 1, u = Math.max(0, Math.min(sl, ((at.x - prev.x) * sx + (at.z - prev.z) * sz) / sl)), look = Math.min(sl, u + 14);
      const aim = { x: prev.x + (sx / sl) * look, z: prev.z + (sz / sl) * look };
      const err = wrap(Math.atan2(aim.x - at.x, aim.z - at.z) - at.yaw);
      // PD on the heading: the yaw rate is read against the game's own clock (the headless one runs slower than the wall's), and damps the swing
      const rate = last && at.t > last.t ? wrap(at.yaw - last.yaw) / (at.t - last.t) : 0; last = { t: at.t, yaw: at.yaw };
      const steer = Math.max(-1, Math.min(1, -(1.7 * err - 0.55 * Math.max(-1.5, Math.min(1.5, rate)))));   // the stick to the right turns the car to the right: its yaw falls
      steerNow = steer; await stick();
      const limit = (w.speed ?? cruise) * (Math.abs(err) > 0.5 ? 0.4 : 1) * (d < 9 ? 0.7 : 1);
      await brake(at.speed > limit + 1.2);                               // a corner is taken slowly: the brake, then the gas again
      await press(at.speed < limit);
      await page.waitForTimeout(90);
    }
    prev = { x: w.x, z: w.z };
  }
  steerNow = 0; await stick(); await press(false); await brake(false);
  if (brakeAtEnd) { const b = await t.centre('#ridepad .rp-brake'); await t.down(1, b.x, b.y); await page.waitForFunction(k => Math.abs(window.__dakar[k].at()?.speed ?? 0) < 0.15, key, { timeout: 60000 }).catch(() => {}); await t.up(1); }
  return at;
}

/**
 * Turn a car round in a street too narrow for one sweep, as a driver does: a multi-point turn with the real controls. The stick locks the wheel the way that brings the heading
 * (`yaw`) closer to `target` and goes forward until the bumper is `margin` m from the edge of `area` ({ x0, x1, z0, z1 }: the carriageway), then the car is braked to a stop and the
 * brake is HELD at the standstill until it backs (no reverse button: a deliberate hold), with the opposite lock (reversing flips the effect of the lock on the heading), and so on
 * until the heading is within `tol`. Lifts every finger and leaves the car stopped. Returns the car's last `at()`.
 */
export async function turnAround(page, t, key, target, { area, tol = 0.3, margin = 1.4, length = 4.7, ms = 300000, speed = 2.6 } = {}) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const brk = await t.centre('#ridepad .rp-brake'), R = await padRig(page, t), rocker = R.rocker(2), gasP = R.gas(5), t0 = Date.now();
  let reverse = false, gasOn = false, lockNow = 0, at = null, moves = 0, brakeOn = false;
  const stick = async () => { await rocker(lockNow); await gasP(gasOn); };
  const brake = async on => { if (on === brakeOn) return; brakeOn = on; if (on) await t.down(4, brk.x, brk.y); else await t.up(4); };
  const stop = async () => { gasOn = false; await stick(); await brake(true); await page.waitForFunction(k => Math.abs(window.__dakar[k].at()?.speed ?? 0) < 0.15, key, { timeout: 30000 }).catch(() => {}); if (!reverse) await brake(false); };
  while (Date.now() - t0 < ms) {
    at = await page.evaluate(k => window.__dakar[k].at(), key); if (!at) break;
    const err = Math.atan2(Math.sin(target - at.yaw), Math.cos(target - at.yaw));
    if (Math.abs(err) < tol) break;
    const f = { x: Math.sin(at.yaw), z: Math.cos(at.yaw) }, dir = reverse ? -1 : 1, reach = length / 2 + margin;
    const px = at.x + f.x * dir * reach, pz = at.z + f.z * dir * reach;
    const outside = px < area.x0 || px > area.x1 || pz < area.z0 || pz > area.z1;
    if (outside) {                                                                      // the bumper has reached the kerb: stop, then go the other way
      await brake(false); await stop(); moves++; if (moves > 14) break;
      reverse = !reverse;
      if (reverse) { await brake(true); await page.waitForFunction(k => (window.__dakar[k].at()?.speed ?? 0) < -0.5, key, { timeout: 15000 }).catch(() => {}); }   // the brake, held at the standstill, backs it up
      else await brake(false);
      continue;
    }
    lockNow = (err > 0 ? -1 : 1) * (reverse ? -1 : 1);                                  // forward: the stick to the left raises the heading; in reverse the effect flips
    if (reverse) { gasOn = false; await stick(); if (Math.abs(at.speed) > speed) { await brake(false); } else await brake(true); }
    else { gasOn = Math.abs(at.speed) < speed; await stick(); }
    await page.waitForTimeout(90);
  }
  gasOn = false; lockNow = 0; await stick(); await brake(false); await stop(); await brake(false);
  return page.evaluate(k => window.__dakar[k].at(), key);
}

/**
 * Get into the player's parked vehicle with real touch: walk to its left side (the driver's door / the saddle's side), face it, tap the action button and wait for the pad.
 * `key` is the debug namespace of the vehicle (`berline`, `moto`, …). Leaves the player at the wheel.
 */
export async function boardVehicle(page, t, key, { tries = 3 } = {}) {
  for (let n = 0; n < tries; n++) {
    const c = await page.evaluate(k => window.__dakar[k].at(), key), L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
    for (const [side, along] of [[2.0, 0.4], [2.4, 0], [1.6, -1.2]]) {
      await walkTo(page, t, c.x + L.x * side + F.x * along, c.z + L.z * side + F.z * along, { tol: 0.9, ms: 40000 });
      const me = await page.evaluate(() => window.__dakar.pos()); await page.evaluate(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [me.x, me.z, Math.atan2(c.x - me.x, c.z - me.z)]);
      if (await page.waitForFunction(k => window.__dakar.focus()?.id === `${k}:parked`, key, { timeout: 6000 }).then(() => true, () => false)) break;
    }
    await t.tap('#act');
    if (await page.waitForFunction(k => window.__dakar[k].at().driving && document.body.classList.contains('ridepad'), key, { timeout: 60000 }).then(() => true, () => false)) { await page.waitForTimeout(600); return; }
  }
  throw new Error('could not board ' + key);
}
