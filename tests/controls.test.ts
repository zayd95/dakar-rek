import { describe, expect, it } from 'vitest';
import { DriveControls, REVERSE_DELAY, STOPPED, forwardIntent, throttleCurve, type DriveCmd, PADDLE_SPEED } from '../src/transport/controls';
import { driveStep, newDriveState, type Blocked } from '../src/transport/drive';
import { carSpec } from '../src/transport/car';
import { berlineSpec, suvSpec } from '../src/transport/premiumCars';
import { motoSpec } from '../src/transport/moto';
import { scaledDrive } from '../src/transport/condition';
import type { DriveSpec } from '../src/transport/spec';

const free: Blocked = () => false;
const car = carSpec().drive!, berline = berlineSpec().drive!, suv = suvSpec().drive!, jakarta = motoSpec().drive!;
const idle: DriveCmd = { fwd: 0, steer: 0, boost: false, brake: false };

/** A simulated driver: holds `cmd` for `secs` at 60 Hz and returns the state (and the controller, for its flags). */
function run(d: DriveSpec, cmd: DriveCmd | ((t: number) => DriveCmd), secs: number, s = newDriveState(0, 0, 0), ctl = new DriveControls(), canReverse = true) {
  const n = Math.round(secs * 60), log: { t: number; v: number; r: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / 60, c = typeof cmd === 'function' ? cmd(t) : cmd;
    driveStep(s, ctl.update(1 / 60, c, s.speed, d, canReverse), d, 1 / 60, free);
    log.push({ t, v: s.speed, r: ctl.showR });
  }
  return { s, ctl, log };
}

describe('the throttle curve and the stick', () => {
  it('is finer at the low end, reaches 1 at a full push, and never leaves 0…1', () => {
    expect(throttleCurve(0)).toBe(0); expect(throttleCurve(1)).toBeCloseTo(1, 6);
    expect(throttleCurve(0.5)).toBeLessThan(0.5); expect(throttleCurve(0.5)).toBeGreaterThan(0.3);
    let last = -1; for (let x = 0; x <= 1.0001; x += 0.05) { const y = throttleCurve(x); expect(y).toBeGreaterThanOrEqual(last); last = y; }
    expect(throttleCurve(2)).toBe(1); expect(throttleCurve(-1)).toBe(0);
  });
  it('a diagonal keeps most of the throttle, a pull back gives none', () => {
    expect(forwardIntent(0, 1)).toBe(1); expect(forwardIntent(0, 0.7)).toBeCloseTo(0.7, 6);
    expect(forwardIntent(0.7, 0.7)).toBeGreaterThan(0.7); expect(forwardIntent(1, 1)).toBe(1); expect(forwardIntent(0.3, -0.8)).toBe(0);
  });
});

describe('forward: the stick sets the speed, « Accélérer » the boosted range', () => {
  it('a full push reaches the cruising speed; a partial push a lower, steady one; release coasts down gradually', () => {
    const full = run(car, { ...idle, fwd: 1 }, 14);
    expect(full.s.speed).toBeGreaterThan(car.maxSpeed * 0.97); expect(full.s.speed).toBeLessThanOrEqual(car.maxSpeed + 0.01);
    const half = run(car, { ...idle, fwd: 0.5 }, 14);
    expect(half.s.speed).toBeCloseTo(car.maxSpeed * throttleCurve(0.5), 0); expect(half.s.speed).toBeLessThan(full.s.speed * 0.6);
    const coast = run(car, t => ({ ...idle, fwd: t < 8 ? 1 : 0 }), 12, newDriveState(0, 0, 0));
    const v8 = coast.log.find(l => l.t >= 8)!.v, v12 = coast.s.speed;
    expect(v12).toBeLessThan(v8); expect(v12).toBeGreaterThan(0);                                  // it slows, gradually: not an instant stop
  });
  it('no step in speed: the acceleration stays smooth from rest to the top, and from boost back to cruise', () => {
    const r = run(car, t => ({ ...idle, fwd: 1, boost: t > 7 && t < 14 }), 22);
    let worst = 0; for (let i = 1; i < r.log.length; i++) worst = Math.max(worst, Math.abs(r.log[i].v - r.log[i - 1].v) * 60);
    expect(worst).toBeLessThan(8);                                                                  // m/s² between two frames: nothing like a jump
  });
  it('holding Accélérer raises the top speed clearly above cruising, releasing it returns to cruising smoothly', () => {
    for (const d of [car, berline, suv, jakarta]) {
      const r = run(d, t => ({ ...idle, fwd: 1, boost: t > 8 && t < 20 }), 38);
      const atBoost = r.log.find(l => l.t >= 19.9)!.v, atCruise = r.log.find(l => l.t >= 7.9)!.v;
      expect(atBoost).toBeGreaterThan(d.maxSpeed * 1.25); expect(atBoost).toBeLessThanOrEqual(d.boostSpeed! + 0.01);
      expect(atCruise).toBeLessThanOrEqual(d.maxSpeed + 0.01);
      expect(r.s.speed).toBeLessThan(d.maxSpeed * 1.08);                                            // back near ordinary cruising a good while after letting go (a car at 200 km/h takes longer to come down than one at 100)
    }
  });
  it('the button alone sets a stopped vehicle off, and without any forward push the boost button does nothing at a standstill when braking', () => {
    const r = run(car, { ...idle, boost: true }, 6); expect(r.s.speed).toBeGreaterThan(5);
    const b = run(car, { ...idle, boost: true, brake: true }, 3); expect(b.s.speed).toBeLessThan(0.5);
  });
  it('the Jakarta is quicker than before and than the cars to pick up, the berline and SUV are stable and substantial', () => {
    expect(jakarta.maxSpeed).toBeGreaterThan(12.5 * 1.3); expect(jakarta.accel).toBeGreaterThan(car.accel);
    expect(berline.maxSpeed).toBeGreaterThan(suv.maxSpeed); expect(suv.turnRadius).toBeGreaterThan(berline.turnRadius); expect(suv.grip!).toBeLessThan(berline.grip!);
    expect(jakarta.turnRadius).toBeLessThan(car.turnRadius * 0.7);
    const t = (d: DriveSpec) => run(d, { ...idle, fwd: 1 }, 5).s.speed;
    expect(t(jakarta)).toBeGreaterThan(t(suv)); expect(t(berline)).toBeGreaterThan(t(suv));          // after 5 s: the bike and the berline are ahead of the heavy SUV
  });
  it('a worn vehicle is slower in both ranges, a dead one does not move', () => {
    const worn = scaledDrive(car, 40), dead = scaledDrive(car, 0);
    expect(worn.maxSpeed).toBeLessThan(car.maxSpeed); expect(worn.boostSpeed!).toBeLessThan(car.boostSpeed!);
    expect(run(dead, { ...idle, fwd: 1, boost: true }, 6).s.speed).toBeLessThan(0.5);
  });
});

describe('steering: proportional, stable at speed, steering and throttle at once', () => {
  it('turns tighter at low speed than at high speed (the lateral acceleration is bounded)', () => {
    for (const d of [car, berline, suv, jakarta]) {
      const turn = (fwd: number, boost: boolean) => {
        const s = newDriveState(0, 0, 0), ctl = new DriveControls();
        run(d, { ...idle, fwd, boost }, 14, s, ctl);
        const speed = s.speed; let w = 0, y0 = s.yaw;
        for (let i = 0; i < 60; i++) { driveStep(s, ctl.update(1 / 60, { ...idle, fwd, boost, steer: 1 }, s.speed, d, true), d, 1 / 60, free); w += Math.abs(s.yaw - y0); y0 = s.yaw; }
        return { speed, rate: w };                                                                     // radians turned in one second at full lock
      };
      const slow = turn(0.3, false), fast = turn(1, true);
      expect(fast.speed).toBeGreaterThan(slow.speed * 2);
      const lat = (x: { speed: number; rate: number }) => x.speed * x.rate;                            // lateral acceleration ≈ speed × yaw rate
      expect(lat(fast)).toBeLessThan(d.grip! * 1.25);                                                  // never beyond what the tyres hold
      expect(fast.rate).toBeLessThan(slow.rate);                                                       // gentler at speed
    }
  });
  it('a small stick deflection steers a little, a full one a lot; the wheel follows smoothly (no flick)', () => {
    const turned = (st: number) => { const r = run(car, { ...idle, fwd: 0.5, steer: st }, 4); return Math.abs(r.s.yaw); };
    expect(turned(0.25)).toBeLessThan(turned(1) * 0.5); expect(turned(0.25)).toBeGreaterThan(0);
    const r = run(jakarta, t => ({ ...idle, fwd: 1, steer: t > 5 ? 1 : 0 }), 6); let worst = 0; for (let i = 1; i < 360; i++) worst = Math.max(worst, 0);
    expect(r.s.steer).toBeGreaterThan(0.3); expect(r.s.steer).toBeLessThan(1);                         // one second after the flick the wheel is part-way, not snapped
    void worst;
  });
});

describe('Frein: brakes progressively, then (a car only) backs up gently after a deliberate hold', () => {
  const cruise = () => { const s = newDriveState(0, 0, 0), ctl = new DriveControls(); run(car, { ...idle, fwd: 1 }, 12, s, ctl); return { s, ctl }; };
  it('braking from cruise stops the car without ever starting to reverse while the brake stays held on the way down', () => {
    const { s, ctl } = cruise(); const log: number[] = [];
    for (let i = 0; i < 60 * 6; i++) { driveStep(s, ctl.update(1 / 60, { ...idle, brake: true }, s.speed, car, true), car, 1 / 60, free); log.push(s.speed); if (i < 60 * 2.5) expect(s.speed).toBeGreaterThanOrEqual(-0.001); }
    expect(Math.min(...log.slice(0, 120))).toBeGreaterThanOrEqual(0);                                   // no sudden forward-to-reverse change
    expect(log[119]).toBeLessThan(car.maxSpeed);                                                       // slowing progressively
  });
  it('holding the brake at a standstill reverses only after the delay, gently, and shows « R » only while it really moves backwards', () => {
    const { s, ctl } = cruise(); let reverseAt = -1, firstR = -1, minV = 0;
    for (let i = 0; i < 60 * 12; i++) {
      driveStep(s, ctl.update(1 / 60, { ...idle, brake: true }, s.speed, car, true), car, 1 / 60, free);
      minV = Math.min(minV, s.speed);
      if (reverseAt < 0 && ctl.reversing) reverseAt = i / 60;
      if (firstR < 0 && ctl.showR) firstR = i / 60;
    }
    expect(reverseAt).toBeGreaterThan(REVERSE_DELAY); expect(minV).toBeLessThan(-1); expect(minV).toBeGreaterThanOrEqual(-car.reverseSpeed - 0.05);
    expect(firstR).toBeGreaterThan(reverseAt - 0.001);                                                  // the badge follows the real movement, never leads it
    expect(ctl.showR).toBe(true);
  });
  it('a quick tap of the brake at a standstill never reverses', () => {
    const s = newDriveState(0, 0, 0), ctl = new DriveControls();
    run(car, t => ({ ...idle, brake: t < REVERSE_DELAY * 0.8 }), 3, s, ctl); expect(s.speed).toBeGreaterThanOrEqual(0); expect(ctl.showR).toBe(false);
  });
  it('letting the brake go while reversing stops the reverse push; the badge goes when it has stopped', () => {
    const s = newDriveState(0, 0, 0), ctl = new DriveControls();
    run(car, t => ({ ...idle, brake: t < 4 }), 4, s, ctl); expect(s.speed).toBeLessThan(-1); expect(ctl.showR).toBe(true);
    const r = run(car, idle, 1.5, s, ctl); expect(Math.abs(r.s.speed)).toBeLessThan(0.1); expect(ctl.showR).toBe(false);
    run(car, { ...idle, fwd: 1 }, 2, s, ctl); expect(s.speed).toBeGreaterThan(1);                      // and it can pull away forward again
  });
  it('no instant forward ↔ reverse: asking forward while backing brakes first', () => {
    const s = newDriveState(0, 0, 0), ctl = new DriveControls();
    run(car, { ...idle, brake: true }, 4, s, ctl); expect(s.speed).toBeLessThan(-1);
    const r = run(car, { ...idle, fwd: 1 }, 0.1, s, ctl); expect(r.s.speed).toBeLessThan(0.5);        // 0.1 s later it has not leapt forward
  });
  it('a motorbike\'s brake only brakes: held at a standstill it never backs up', () => {
    const s = newDriveState(0, 0, 0), ctl = new DriveControls();
    run(jakarta, { ...idle, fwd: 1 }, 8, s, ctl, false);
    const r = run(jakarta, { ...idle, brake: true }, 8, s, ctl, false);
    expect(Math.min(...r.log.map(l => l.v))).toBeGreaterThanOrEqual(-0.001); expect(r.s.speed).toBeLessThan(STOPPED); expect(ctl.showR).toBe(false);
  });
});

describe('calibration: a ~1.5 km corridor is a short journey, not a crawl', () => {
  it('takes about a minute at cruising speed and clearly less with Accélérer, for every vehicle', () => {
    const time = (d: DriveSpec, boost: boolean) => {
      const s = newDriveState(0, 0, 0), ctl = new DriveControls(); let t = 0;
      while (s.z < 1480 && t < 300) { driveStep(s, ctl.update(1 / 60, { ...idle, fwd: 1, boost }, s.speed, d, true), d, 1 / 60, free); t += 1 / 60; }
      return t;
    };
    for (const [name, d] of [['car', car], ['berline', berline], ['suv', suv], ['jakarta', jakarta]] as const) {
      const c = time(d, false), b = time(d, true);
      expect(c, name).toBeLessThan(90); expect(c, name).toBeGreaterThan(50);
      expect(b, name).toBeLessThan(c * 0.8); expect(b, name).toBeGreaterThan(25);
    }
  });
});

describe('the Jakarta pushed backwards with the feet (paddle)', () => {
  const bike = { maxSpeed: 17.5, boostSpeed: 26.5, reverseSpeed: 0, accel: 5.2, brake: 9, turnRadius: 3.2, steer: 3.4, halfWidth: 0.4, halfLength: 1, lean: true } as DriveSpec;
  const run = (secs: number, cmd: DriveCmd, ctl: DriveControls, s: { speed: number }) => { for (let i = 0; i < secs * 60; i++) { const inp = ctl.update(1 / 60, cmd, s.speed, bike, 'paddle'); const st = { x: 0, z: 0, yaw: 0, speed: s.speed, steer: 0, accel: 0, odo: 0 }; driveStep(st, inp, bike, 1 / 60, () => false); s.speed = st.speed; } };
  it('moving, the brake only slows it; stopped and held a moment, it creeps back at a walking pace at most, with no « R »', () => {
    const ctl = new DriveControls(), s = { speed: 8 };
    run(0.5, { fwd: 0, steer: 0, boost: false, brake: true }, ctl, s);
    expect(s.speed).toBeGreaterThanOrEqual(0);
    run(0.3, { fwd: 0, steer: 0, boost: false, brake: true }, ctl, s);                  // stopped now, not yet held long enough
    expect(s.speed).toBeGreaterThan(-0.05);
    run(3, { fwd: 0, steer: 0, boost: false, brake: true }, ctl, s);
    expect(s.speed).toBeLessThan(-0.3); expect(s.speed).toBeGreaterThanOrEqual(-PADDLE_SPEED - 1e-6);
    expect(ctl.paddling).toBe(true); expect(ctl.showR).toBe(false);
  });
  it('lets go and it stops at once (no rolling on): the feet hold it', () => {
    const ctl = new DriveControls(), s = { speed: 0 };
    run(3, { fwd: 0, steer: 0, boost: false, brake: true }, ctl, s);
    expect(s.speed).toBeLessThan(-0.3);
    run(0.25, { fwd: 0, steer: 0, boost: false, brake: false }, ctl, s);
    expect(Math.abs(s.speed)).toBeLessThan(0.05); expect(ctl.paddling).toBe(false);
  });
  it('a car still reverses as before (its own speed, the « R » shown)', () => {
    const car = { ...bike, reverseSpeed: 3, lean: false } as DriveSpec, ctl = new DriveControls(); let v = 0;
    for (let i = 0; i < 240; i++) { const inp = ctl.update(1 / 60, { fwd: 0, steer: 0, boost: false, brake: true }, v, car, true); const st = { x: 0, z: 0, yaw: 0, speed: v, steer: 0, accel: 0, odo: 0 }; driveStep(st, inp, car, 1 / 60, () => false); v = st.speed; }
    expect(v).toBeLessThan(-1); expect(ctl.showR).toBe(true);
  });
});
