import { describe, expect, it } from 'vitest';
import { CALM_AFTER, CRAWL_FOR, DriveFeel, FAST, FAST_FOR, SMOOTH_AFTER, VERY_FAST, VERY_FAST_FOR, type DriveEvent, type DriveSnap } from '../src/transport/driveFeel';

const snap = (speed: number): DriveSnap => ({ hub: 'pikine', x: 0, z: 0, yaw: 0, speed, top: 19, kind: 'car' });
/** Slows (or speeds up) from `from` to `to` over `seconds`, a step of 0.1 s at a time. */
function ramp(f: DriveFeel, from: number, to: number, seconds: number) {
  const got: DriveEvent[] = []; const off = f.on(e => got.push(e)); const n = Math.round(seconds / 0.1);
  for (let i = 1; i <= n; i++) f.report(snap(from + ((to - from) * i) / n), 0.1);
  off(); return got;
}
/** Runs `seconds` at `speed` in steps of 0.1 s; returns the events seen. */
function run(f: DriveFeel, speed: number, seconds: number, horn = false) {
  const got: DriveEvent[] = []; const off = f.on(e => got.push(e));
  for (let t = 0; t < seconds - 1e-9; t += 0.1) f.report(snap(speed), 0.1, horn);
  off(); return got;
}

describe('how the player drives, as the city sees it', () => {
  it('says « fast » once, after a stretch above the line, and not for a burst', () => {
    const f = new DriveFeel();
    expect(run(f, FAST + 1, FAST_FOR - 0.5).map(e => e.kind)).toEqual([]);
    expect(ramp(f, FAST + 1, 8, 3).map(e => e.kind)).toEqual([]);                      // the burst is over
    expect(run(f, FAST + 1, FAST_FOR + 0.3).map(e => e.kind)).toEqual(['fast']);
    expect(run(f, FAST + 1, 5).map(e => e.kind)).toEqual([]);                            // still fast: said once
  });
  it('says it again only after the speed has come back down for a while', () => {
    const f = new DriveFeel();
    run(f, FAST + 2, FAST_FOR + 0.5);
    ramp(f, FAST + 2, 6, 4); run(f, 6, CALM_AFTER + 0.5);
    expect(run(f, FAST + 2, FAST_FOR + 0.5).map(e => e.kind)).toEqual(['fast']);
  });
  it('very fast goes first and covers fast', () => {
    const f = new DriveFeel();
    const k = run(f, VERY_FAST + 2, VERY_FAST_FOR + 1.5).map(e => e.kind);
    expect(k).toEqual(['veryFast']);
  });
  it('a hard brake from a real speed is one event, a gentle slowing is none', () => {
    const f = new DriveFeel();
    run(f, 14, 1);
    const got: DriveEvent[] = []; f.on(e => got.push(e));
    f.report(snap(9), 0.1);                                                              // 5 m/s in 0.1 s: 50 m/s²
    expect(got.map(e => e.kind)).toContain('hardBrake');
    const g = new DriveFeel(); run(g, 14, 1); const calm = ramp(g, 14, 8, 3); expect(calm.map(e => e.kind)).not.toContain('hardBrake');
  });
  it('a crawl is moving slowly for a long while; standing still is not one', () => {
    const f = new DriveFeel();
    expect(run(f, 2, CRAWL_FOR + 0.5).map(e => e.kind)).toEqual(['crawl']);
    expect(run(new DriveFeel(), 0, 30).map(e => e.kind)).toEqual([]);
  });
  it('a long calm drive is smooth, once in a while, and a crash resets it', () => {
    const f = new DriveFeel();
    expect(run(f, 10, SMOOTH_AFTER + 1).map(e => e.kind)).toEqual(['smooth']);
    const g = new DriveFeel(); run(g, 10, SMOOTH_AFTER - 3); g.crash(0.8, 9); expect(run(g, 10, 6).map(e => e.kind)).toEqual([]);
  });
  it('tells the horn once per press, tallies, and forgets everything when nobody drives', () => {
    const f = new DriveFeel();
    expect(run(f, 5, 1, true).map(e => e.kind)).toEqual(['honk']);
    expect(f.tally.honk).toBe(1);
    f.idle(); expect(f.snap).toBeNull(); expect(f.tally.honk).toBe(0);
  });
  it('a crash carries its strength, clamped', () => {
    const f = new DriveFeel(), got: DriveEvent[] = []; f.on(e => got.push(e));
    f.crash(3, 12); f.bump(2);
    expect(got.map(e => [e.kind, e.strength])).toEqual([['crash', 1], ['bump', 0.25]]);
  });
});

describe('a hard brake is one event per braking', () => {
  it('a long full brake from speed counts once, a second one after the car has eased', () => {
    const f = new DriveFeel(); run(f, 20, 1);
    const got: DriveEvent[] = []; f.on(e => got.push(e));
    let v = 20; for (let i = 0; i < 25; i++) { v = Math.max(0, v - 0.8); f.report(snap(v), 0.1); }   // 8 m/s² for 2.5 s: stopped
    expect(got.filter(e => e.kind === 'hardBrake').length).toBe(1);
    run(f, 0, 1.2);                                                                                    // eased: the next braking can count
    for (let i = 0; i < 45; i++) { v = Math.min(20, v + 0.5); f.report(snap(v), 0.1); }
    for (let i = 0; i < 25; i++) { v = Math.max(0, v - 0.8); f.report(snap(v), 0.1); }
    expect(got.filter(e => e.kind === 'hardBrake').length).toBe(2);
  });
});
