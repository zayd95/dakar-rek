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
    async centre(selector) { return page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector); },
    /** Tap an element with one finger. */
    async tap(selector, id = 9) { const c = await this.centre(selector); await this.down(id, c.x, c.y); await new Promise(r => setTimeout(r, 60)); await this.up(id); },
  };
}

/**
 * Drive a car with real fingers, as on a phone (src/transport/ridePad.ts): one thumb on the gas (or, with `brake`, the brake) pedal on the right and, for `steer` ≠ 0, another
 * on the joystick on the left, which only steers. `reverse` first selects the reverse gear with a tap on « R » (the car must be stopped). Holds until `hold()` resolves, then lets go.
 */
export async function padDrive(page, t, { steer = 0, brake = false, reverse = false, hold }) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  if (reverse) await t.tap('#ridepad .rp-rev');
  const pedal = await t.centre(brake ? '#ridepad .rp-brake' : '#ridepad .rp-gas');
  await t.down(1, pedal.x, pedal.y);
  if (steer) { const j = await t.centre('#joy'); await t.down(2, j.x, j.y); await t.move(2, j.x + steer * 30, j.y); }
  await hold();
  await t.up(1); if (steer) await t.up(2);
  if (reverse) await t.tap('#ridepad .rp-rev');
}

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
 * Drive a car through waypoints with real fingers on the pedal and the stick (src/transport/ridePad.ts): the gas is held and lifted for a tight turn or a close point,
 * the stick steers toward the next point (the car's own heading error), each point is done within `tol` m. A stall (no progress for `stall` ms) moves on to the next point.
 * Lifts both fingers at the end (`brakeAtEnd`: then holds the brake until the car has stopped). Returns the car's last `at()`.
 */
export async function pilot(page, t, key, points, { tol = 3.5, ms = 300000, stall = 12000, brakeAtEnd = false, cruise = 4.5 } = {}) {
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  const gas = await t.centre('#ridepad .rp-gas'), j = await t.centre('#joy'), r = 30, t0 = Date.now();
  let gasOn = false;
  const press = async on => { if (on === gasOn) return; gasOn = on; if (on) await t.down(1, gas.x, gas.y); else await t.up(1); };
  const brk = await t.centre('#ridepad .rp-brake'); let brakeOn = false;
  const brake = async on => { if (on === brakeOn) return; brakeOn = on; if (on) await t.down(4, brk.x, brk.y); else await t.up(4); };
  await t.down(2, j.x, j.y);
  let at = null, prev = null, last = null;
  for (const w of points) {
    let best = Infinity, lastGain = Date.now();
    while (Date.now() - t0 < ms) {
      at = await page.evaluate(k => window.__dakar[k].at(), key); if (!at) break;
      if (!prev) prev = { x: at.x, z: at.z };
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
      const steer = Math.max(-1, Math.min(1, -(0.9 * err - 0.55 * Math.max(-1.5, Math.min(1.5, rate)))));   // the stick to the right turns the car to the right: its yaw falls
      await t.move(2, j.x + steer * r, j.y, 1);
      const limit = (w.speed ?? cruise) * (Math.abs(err) > 0.5 ? 0.4 : 1) * (d < 9 ? 0.7 : 1);
      await brake(at.speed > limit + 1.2);                               // a corner is taken slowly: the brake, then the gas again
      await press(at.speed < limit);
      await page.waitForTimeout(90);
    }
    prev = { x: w.x, z: w.z };
  }
  await t.up(2); await press(false); await brake(false);
  if (brakeAtEnd) { const b = await t.centre('#ridepad .rp-brake'); await t.down(1, b.x, b.y); await page.waitForFunction(k => Math.abs(window.__dakar[k].at()?.speed ?? 0) < 0.15, key, { timeout: 60000 }).catch(() => {}); await t.up(1); }
  return at;
}
