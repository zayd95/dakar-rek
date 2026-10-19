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
