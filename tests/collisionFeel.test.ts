import { describe, expect, it } from 'vitest';
import { ContactTracker, REARM, RE_HIT, SCRAPE_MIN, STRONG, strengthOf } from '../src/transport/contact';
import { IMPACT_SPEED } from '../src/transport/vehicleAudio';
import { buzz, canVibrate, hapticsOn, setHaptics, _resetHaptics } from '../src/transport/haptics';
import { HORN_TICK, impactBuzz } from '../src/transport/hapticsRules';
import { driveStep, hits, newDriveState } from '../src/transport/drive';
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

describe('the real driving against a wall (physics untouched): no pass-through, no knock per frame, never stuck for good', () => {
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
    const blocked = wall(-50, 50, 6, 7), s = newDriveState(0, 0, 0.35), t = new ContactTracker(); let impacts = 0, scrapes = 0;
    s.speed = 9;
    for (let i = 0; i < 4 * 60; i++) { const v0 = s.speed, hit = driveStep(s, { throttle: 1, steer: 0 }, spec, 1 / 60, blocked), f = t.step(1 / 60, hit, v0, s.speed); if (f.impact) impacts++; if (f.scraping) scrapes++; }
    expect(impacts).toBeLessThanOrEqual(2); expect(scrapes).toBeGreaterThan(3);
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
