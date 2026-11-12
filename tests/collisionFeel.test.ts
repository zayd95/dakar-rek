import { describe, expect, it } from 'vitest';
import { ContactTracker, REARM, RE_HIT, SCRAPE_MIN, STRONG, strengthOf } from '../src/transport/contact';
import { IMPACT_SPEED } from '../src/transport/vehicleAudio';
import { buzz, canVibrate, hapticsOn, setHaptics, _resetHaptics } from '../src/transport/haptics';
import { HORN_TICK, impactBuzz } from '../src/transport/hapticsRules';
import { driveStep, driveSteps, hits, newDriveState } from '../src/transport/drive';
import { DriveControls, REVERSE_DELAY, REVERSE_DELAY_HIT, type DriveCmd } from '../src/transport/controls';
import type { DriveSpec } from '../src/transport/spec';

const spec: DriveSpec = { maxSpeed: 20, reverseSpeed: 4, accel: 4, brake: 9, steer: 6, turnRadius: 4, halfWidth: 0.9, halfLength: 2.3 } as DriveSpec;
/** A wall: a box x0…x1 × z0…z1; a circle of radius r at (x, z) touches it when closer than r. */
const wall = (x0: number, x1: number, z0 = -50, z1 = 50) => (x: number, z: number, r: number) => { const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1)); return Math.hypot(x - cx, z - cz) < r; };

describe('the three things a contact is', () => {
  it('a slow touch is a bump: one soft thud, no strength, and pushing on does not knock again', () => {
    const t = new ContactTracker(); let impacts = 0, first = null as null | ReturnType<ContactTracker['step']>['impact'];
    for (let i = 0; i < 6 * 60; i++) { const f = t.step(1 / 60, true, i === 0 ? 1.6 : 0.4, i === 0 ? -0.24 : 0.2); if (f.impact) { impacts++; first ??= f.impact; } }
    expect(impacts).toBe(1); expect(first).toMatchObject({ kind: 'bump', strength: 0 });
  });
  it('a fast head-on contact is ONE hit, stronger the faster, and the rebound against the wall does not hit again', () => {
    const t = new ContactTracker(); const got: { kind: string; strength: number; headOn: boolean }[] = [];
    for (let i = 0; i < 4 * 60; i++) { const f = t.step(1 / 60, i % 2 === 0 || i < 40, i === 0 ? 11 : 0.8, i === 0 ? -1.65 : 0.5); if (f.impact) got.push(f.impact); }
    expect(got).toHaveLength(1); expect(got[0].kind).toBe('hit'); expect(got[0].strength).toBeGreaterThan(0.7); expect(got[0].headOn).toBe(true);
    expect(strengthOf(IMPACT_SPEED)).toBe(0); expect(strengthOf(STRONG)).toBe(1); expect(strengthOf(30)).toBe(1); expect(strengthOf(8)).toBeGreaterThan(strengthOf(5));
  });
  it('a glancing blow is softer than a head-on one at the same speed, and it scrapes while it slides', () => {
    const a = new ContactTracker(), b = new ContactTracker();
    const head = a.step(1 / 60, true, 9, -1.35).impact!, glance = b.step(1 / 60, true, 9, 5.4);
    expect(glance.impact!.strength).toBeCloseTo(head.strength * 0.6, 5); expect(glance.scraping).toBe(true);
    expect(head.headOn).toBe(true); expect(glance.impact!.headOn).toBe(false);
  });
  it('the scrape follows the speed along the wall, is silent when slow, and stops the frame the contact ends', () => {
    const t = new ContactTracker(); t.step(1 / 60, true, 9, 5.4);
    const fast = t.step(1 / 60, true, 6, 3.6), slow = t.step(1 / 60, true, 2, 1.2), crawl = t.step(1 / 60, true, SCRAPE_MIN - 0.1, 0.4);
    expect(fast.scraping && slow.scraping).toBe(true); expect(fast.scrape).toBeGreaterThan(slow.scrape); expect(crawl.scraping).toBe(false);
    expect(t.step(1 / 60, false, 3, 3)).toMatchObject({ scraping: false, scrape: 0 });
  });
  it('a new contact after a spell without one is a new episode; a hit after the rebound needs a fast new run-up and time', () => {
    const t = new ContactTracker(); expect(t.step(1 / 60, true, 5, -0.75).impact).not.toBeNull();
    for (let i = 0; i < Math.ceil(REARM * 60) + 2; i++) t.step(1 / 60, false, 0, 0);
    expect(t.step(1 / 60, true, 6, -0.9).impact).not.toBeNull();                       // a new episode
    // inside an episode: a fast second hit only after RE_HIT
    const u = new ContactTracker(); u.step(1 / 60, true, 5, -0.75);
    for (let i = 0; i < 20; i++) u.step(1 / 60, true, 0.5, 0.3);
    expect(u.step(1 / 60, true, 5, -0.75).impact).toBeNull();                          // too soon
    for (let i = 0; i < Math.ceil(RE_HIT * 60); i++) u.step(1 / 60, true, 0.5, 0.3);
    expect(u.step(1 / 60, true, 5, -0.75).impact).not.toBeNull();                      // a real second hit
  });
});

describe('the real driving against a wall: no pass-through, no knock per frame, never stuck for good', () => {
  const driveInto = (dt: number, seconds: number, throttle = 1, blocked = wall(10, 10.1)) => {
    const s = newDriveState(0, 0, Math.PI / 2), t = new ContactTracker(); let impacts = 0, scrapes = 0, entered = false, first = 0;
    for (let i = 0; i < seconds / dt; i++) {
      const v0 = s.speed, hit = driveStep(s, { throttle, steer: 0 }, spec, dt, blocked), f = t.step(dt, hit, v0, s.speed);
      if (f.impact) { impacts++; if (!first) first = f.impact.speed; } if (f.scraping) scrapes++;
      if (hits(spec, s.x, s.z, s.yaw, blocked, 0.99)) entered = true;
    }
    return { s, impacts, scrapes, entered, first };
  };
  it('at full speed, even with slow frames (30, 20 and 10 fps), the car never goes through a wall 10 cm thick', () => {
    for (const dt of [1 / 60, 1 / 30, 1 / 20, 1 / 10]) {
      const r = driveInto(dt, 12);
      expect(r.entered, `dt ${dt}`).toBe(false); expect(r.s.x, `dt ${dt}`).toBeLessThan(10 - 0.8);
    }
  });
  it('held against the wall for six seconds it knocks once (or twice), not on every frame', () => {
    for (const dt of [1 / 60, 1 / 30]) { const r = driveInto(dt, 6); expect(r.impacts, `dt ${dt}`).toBeGreaterThanOrEqual(1); expect(r.impacts, `dt ${dt}`).toBeLessThanOrEqual(2); }
  });
  it('and it is never locked in: after the push it backs away from the wall', () => {
    const blocked = wall(10, 10.1), s = newDriveState(0, 0, Math.PI / 2);
    for (let i = 0; i < 6 * 60; i++) driveStep(s, { throttle: 1, steer: 0 }, spec, 1 / 60, blocked);
    const x0 = s.x; for (let i = 0; i < 3 * 60; i++) driveStep(s, { throttle: -1, steer: 0 }, spec, 1 / 60, blocked);
    expect(x0 - s.x).toBeGreaterThan(1);
  });
  it('a parked vehicle (a box) and a vehicle of the traffic stop the car the same way', () => {
    const parked = (x: number, z: number, r: number) => { const cx = Math.max(8, Math.min(x, 10.4)), cz = Math.max(-0.9, Math.min(z, 0.9)); return Math.hypot(x - cx, z - cz) < r; };
    const r = driveInto(1 / 30, 8, 1, parked); expect(r.entered).toBe(false); expect(r.s.x).toBeLessThan(8 - 0.7); expect(r.impacts).toBeLessThanOrEqual(2);
  });
  it('sliding along a wall at an angle scrapes, and no more than one knock starts it', () => {
    // (the wall runs along x; the car meets it at 20° from its line. This used a heading of 0.35, 70° from the wall's line: that is running INTO it, which now stops the car instead of sliding it)
    const blocked = wall(-50, 50, 6, 7), s = newDriveState(0, 0, Math.PI / 2 - 0.35), t = new ContactTracker(); let impacts = 0, scrapes = 0;
    s.speed = 9;
    for (let i = 0; i < 4 * 60; i++) { const v0 = s.speed, hit = driveStep(s, { throttle: 1, steer: 0 }, spec, 1 / 60, blocked), f = t.step(1 / 60, hit, v0, s.speed); if (f.impact) impacts++; if (f.scraping) scrapes++; }
    expect(impacts).toBeLessThanOrEqual(2); expect(scrapes).toBeGreaterThan(3);
  });
});

describe('recovering from a contact (docs/DRIVING_FEEL.md): a glancing touch costs a little, a wall met square on stops the car and lets it back out', () => {
  const car: DriveSpec = { maxSpeed: 21.5, boostSpeed: 46, reverseSpeed: 4.5, accel: 6.6, brake: 11, turnRadius: 4.2, steer: 5.6, grip: 13.5, halfWidth: 0.87, halfLength: 1.97 };
  const gas = { throttle: 1, steer: 0, target: 21.5, braking: false, boost: 0 };
  it('a wall met at 20° at 45 km/h: the car is turned along it, keeps most of its speed, and comes off the wall by itself (no grinding along it for good)', () => {
    for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
      const blocked = wall(-500, 500, 6, 7), s = newDriveState(0, 2, Math.PI / 2 - 0.35), t = new ContactTracker(); s.speed = 12.5;
      let contacts = 0, lastContact = 0, impacts = 0, entered = false;
      for (let i = 0; i < 3 / dt; i++) {
        const v0 = s.speed, hit = driveSteps(s, gas, car, dt, blocked); if (hit) { contacts++; lastContact = i * dt; } if (t.step(dt, hit, v0, s.speed).impact) impacts++;
        if (hits(car, s.x, s.z, s.yaw, blocked, 0.99)) entered = true;
        if (i * dt < 1) expect(s.speed, `dt ${dt}`).toBeGreaterThan(12.5 * 0.75);                 // never the dead stop it used to be (1 % of the speed left after a second)
      }
      expect(entered, `dt ${dt}`).toBe(false); expect(contacts).toBeGreaterThan(0); expect(impacts).toBe(1);
      expect(lastContact, `dt ${dt}`).toBeLessThan(1.5);                                           // it has left the wall
      expect(Math.cos(s.yaw), `dt ${dt}`).toBeLessThanOrEqual(0.001);                              // heading along the wall or a hair away from it, never into it
      expect(Math.abs(Math.cos(s.yaw))).toBeLessThan(0.1); expect(s.speed).toBeGreaterThan(15);
    }
  });
  it('the loss in a slide does not depend on the frame rate (it was 40 % a frame)', () => {
    const left = (dt: number) => { const blocked = wall(-500, 500, 6, 7), s = newDriveState(0, 2, Math.PI / 2 - 0.5); s.speed = 12.5; for (let i = 0; i < 1.2 / dt; i++) driveSteps(s, { throttle: 0, steer: 0, target: 12.5, braking: false, boost: 0 }, car, dt, blocked); return s.speed; };
    const a = left(1 / 120), b = left(1 / 60), c = left(1 / 30);
    expect(Math.abs(a - b)).toBeLessThan(0.8); expect(Math.abs(b - c)).toBeLessThan(0.8); expect(b).toBeGreaterThan(12.5 * 0.6);
  });
  it('a wall met square on (even exactly square, on the grid\'s axes) is a head-on stop with a short roll back, never a « slide » on the spot', () => {
    for (const yaw of [0, 0.05, -0.2, 0.4]) {
      const blocked = wall(-50, 50, 30, 30.3), s = newDriveState(0, 20, yaw), t = new ContactTracker(); s.speed = 9;
      let first: ReturnType<ContactTracker['step']>['impact'] = null, impacts = 0;
      for (let i = 0; i < 3 * 60; i++) { const v0 = s.speed, hit = driveSteps(s, gas, car, 1 / 60, blocked), f = t.step(1 / 60, hit, v0, s.speed); if (f.impact) { impacts++; first ??= f.impact; } }
      expect(first, `yaw ${yaw}`).not.toBeNull(); expect(first!.headOn, `yaw ${yaw}`).toBe(true); expect(first!.kind).toBe('hit');
      expect(impacts, `yaw ${yaw}`).toBeLessThanOrEqual(2);                                         // the pedal still down: one knock, not one a frame
      expect(hits(car, s.x, s.z, s.yaw, blocked, 0.99)).toBe(false);
    }
  });
  it('leaning on the corner of something (the rear corner of a stopped car, met almost square on): after the stop the pedal slides the car off it, slowly, without backing up', () => {
    // a stopped car's rear: a box across the lane's right half; the driver comes at it 10° off square and keeps the pedal down
    const box = (x: number, z: number, r: number) => { const cx = Math.max(-0.2, Math.min(x, 3)), cz = Math.max(30, Math.min(z, 34.5)); return Math.hypot(x - cx, z - cz) < r; };
    const s = newDriveState(0.9, 20, -0.18), t = new ContactTracker(); s.speed = 6; let impacts = 0, headOn = false, entered = false, secs = 0;
    while (s.z < 36 && secs < 60) { const v0 = s.speed, hit = driveSteps(s, gas, car, 1 / 60, box), f = t.step(1 / 60, hit, v0, s.speed); if (f.impact) { impacts++; headOn ||= f.impact.headOn; } if (hits(car, s.x, s.z, s.yaw, box, 0.99)) entered = true; secs += 1 / 60; }
    expect(headOn).toBe(true); expect(impacts).toBeLessThanOrEqual(2); expect(entered).toBe(false);
    expect(s.z, `after ${secs.toFixed(0)} s at x ${s.x.toFixed(2)}`).toBeGreaterThanOrEqual(36);    // it got past, on the pedal alone
  });
  it('after it: the brake, held, backs the car 2.5 m clear of the wall in under two seconds (the hold is shorter right after a contact), and a tap never reverses', () => {
    const blocked = wall(-50, 50, 30, 30.3), s = newDriveState(0, 20, 0), ctl = new DriveControls(); s.speed = 9;
    const step = (cmd: DriveCmd) => { const v0 = s.speed, hit = driveSteps(s, ctl.update(1 / 60, cmd, s.speed, car, true), car, 1 / 60, blocked); if (hit && v0 > 0 && s.speed <= 0) ctl.stoppedBy(); return hit; };
    let t = 0; while (!step({ fwd: 1, steer: 0, boost: false, brake: false }) && t < 5) t += 1 / 60;
    for (let i = 0; i < 30; i++) step({ fwd: 1, steer: 0, boost: false, brake: false });               // half a second more on the pedal
    let secs = 0; while (s.z + car.halfLength > 30 - 2.5 && secs < 10) { step({ fwd: 0, steer: 0, boost: false, brake: true }); secs += 1 / 60; }
    expect(secs).toBeLessThan(2);
    expect(REVERSE_DELAY_HIT).toBeLessThan(REVERSE_DELAY); expect(REVERSE_DELAY_HIT).toBeGreaterThan(0.1);
    const u = newDriveState(0, 0, 0), c2 = new DriveControls(); c2.stoppedBy();
    for (let i = 0; i < 6; i++) driveSteps(u, c2.update(1 / 60, { fwd: 0, steer: 0, boost: false, brake: true }, u.speed, car, true), car, 1 / 60, () => false);   // a 0.1 s dab
    for (let i = 0; i < 60; i++) driveSteps(u, c2.update(1 / 60, { fwd: 0, steer: 0, boost: false, brake: false }, u.speed, car, true), car, 1 / 60, () => false);
    expect(u.z).toBeGreaterThan(-0.01);
  });
  it('a fast car sliding along a wall in a slow frame keeps the rest of its frame (it used to drop it: two thirds of its speed at 30 fps)', () => {
    const blocked = wall(-5000, 5000, 6, 7), s = newDriveState(0, 6 - car.halfWidth - 0.3, Math.PI / 2 - 0.05); s.speed = 40;
    const x0 = s.x; for (let i = 0; i < 30; i++) driveSteps(s, { ...gas, target: 40 }, car, 1 / 30, blocked);
    expect(s.x - x0).toBeGreaterThan(40 * 0.85);
  });
});

describe('the buzz of the phone, only where the browser can', () => {
  const nav = () => { const calls: (number | number[])[] = []; return { calls, vibrate: (p: number | number[]) => { calls.push(p); return true; } }; };
  it('Safari on iPhone has no navigator.vibrate: nothing is asked, nothing throws, no claim is made', () => {
    _resetHaptics(); const iphone = {};
    expect(canVibrate(iphone)).toBe(false); expect(buzz(30, iphone, 1000)).toBe(false);
  });
  it('where there is one, a hit buzzes longer and harder than a bump, and the horn only ticks', () => {
    _resetHaptics(); const n = nav();
    expect(buzz(impactBuzz('bump', 0), n, 1000)).toBe(true); expect(buzz(impactBuzz('hit', 1), n, 1500)).toBe(true);
    const sum = (p: number | number[]) => [p].flat().reduce((a, b) => a + b, 0);
    expect(sum(impactBuzz('hit', 1))).toBeGreaterThan(sum(impactBuzz('hit', 0))); expect(sum(impactBuzz('hit', 0))).toBeGreaterThan(sum(impactBuzz('bump', 0)));
    expect(HORN_TICK).toBeLessThan(sum(impactBuzz('bump', 0)));
  });
  it('the setting switches it off, and buzzes closer than 100 ms are not asked twice', () => {
    _resetHaptics(); const n = nav(); setHaptics(false);
    expect(hapticsOn()).toBe(false); expect(buzz(20, n, 1000)).toBe(false); expect(n.calls).toHaveLength(0);
    setHaptics(true); expect(buzz(20, n, 1000)).toBe(true); expect(buzz(20, n, 1050)).toBe(false); expect(buzz(20, n, 1200)).toBe(true); expect(n.calls).toHaveLength(2);
  });
  it('a device that refuses (throws, or returns false) is not an error', () => {
    _resetHaptics(); expect(buzz(20, { vibrate: () => { throw new Error('no'); } }, 5000)).toBe(false); expect(buzz(20, { vibrate: () => false }, 6000)).toBe(false);
  });
});
