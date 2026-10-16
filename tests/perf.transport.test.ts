import { describe, expect, it } from 'vitest';
import { PerfHost, GALA_DAY, type Quality } from './perfHost';
import { kitBuildStats } from '../src/actors/vehicleKit';
import { Vehicle, LineVehicle } from '../src/transport/vehicle';
import { StopPeople } from '../src/transport/stops';
import { Apprentice } from '../src/actors/apprenti';
import { Humanoid } from '../src/actors/humanoid';
import { AnimationMixer } from 'three';

/**
 * The car rapides of Ligne 23 on a gala evening, in node (docs/PERF_EVENING.md, « The transport hitch »): the browser
 * check's 17:30 moment, with `module:transport` timed frame by frame instead of as the profiler's moving average, over
 * thousands of frames. A mean hides what a player feels: a car pulling in at the « Arène » stop sets the passengers of the
 * cars (fans aboard in their écurie's shirts), the open cabin takes another model, and when that was a builder pass over
 * the whole car rapide (8 to 40 ms) the profiler's average read 3 ms for a hitch of 40.
 *
 * `PERF=1 nice -n 19 npx vitest run tests/perf.transport.test.ts` prints, per preset (`PERF_Q=low,medium,high`, over
 * `PERF_FRAMES` frames, 1/30 s each): the mean, the median, the slowest frames, the frames over 2, 4 and 16 ms, what the
 * profiler's moving average (92 % old, 8 % new, as src/main.ts) would have read at the end of a 90-frame window, and the
 * frames that stand out with what they spent on. Without PERF it is a short check that no cabin is built while people
 * get on and off.
 *
 * `PERF=1 PERF_AT=50 PERF_Q=low npx vitest run tests/perf.transport.test.ts -t window` is the browser check's own window:
 * a fresh process (caches cold, like a fresh page), the Friday gala at 17:30 in front of the gate, a car pulling in at a
 * stop 50 frames into the 90 the profiler averages. Run it once per process and offset (the caches stay warm after).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PERF = !!env.PERF;
const PRESETS = (env.PERF_Q ?? 'low,medium,high').split(',') as Quality[];
const FRAMES = Number(env.PERF_FRAMES ?? 9000);
const DT = 1 / 30;

const acc: Record<string, number> = {};
type Fn = (this: unknown, ...a: unknown[]) => unknown;
/** Adds the time of `proto[name]` to acc[label] until the returned function is called. */
function timed(proto: object, name: string, label: string) {
  const p = proto as Record<string, Fn>, orig = p[name];
  p[name] = function (this: unknown, ...a: unknown[]) { const t = performance.now(); try { return orig.apply(this, a); } finally { acc[label] = (acc[label] ?? 0) + performance.now() - t; } };
  return () => { p[name] = orig; };
}

/** The process's CPU time (ms): a frame whose wall time is far above its CPU time was preempted by another process, not slow. */
const cpuNow = () => { const p = (globalThis as { process?: { cpuUsage(): { user: number; system: number } } }).process; if (!p) return performance.now(); const u = p.cpuUsage(); return (u.user + u.system) / 1000; };
const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const f2 = (x: number) => x.toFixed(2);

async function evening(preset: Quality) {
  const host = new PerfHost(preset);
  await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
  host.debug<{ day(d: number | null): void }>('arena').day(GALA_DAY);
  return host;
}

describe('the transport module on a gala evening (node)', () => {
  it('builds no cabin while the cars take other passengers at every stop', async () => {
    const host = await evening('low');
    const transport = host.debug<{ warp(sec: number): void }>('transport');
    for (let k = 0; k < 40; k++) host.frame(DT);
    // the passengers change at every stop the cars pull in at: the line clock runs on 9 s a frame, so a stop every few frames
    let setCalls = 0, passesInSet = 0, joins = 0;
    const orig = Vehicle.prototype.setPassengers;
    Vehicle.prototype.setPassengers = function (this: Vehicle, ...a: Parameters<Vehicle['setPassengers']>) {
      const before = kitBuildStats();
      try { return orig.apply(this, a); } finally { const after = kitBuildStats(); setCalls++; passesInSet += after.passes - before.passes; joins += after.joins - before.joins; }
    };
    try {
      for (let k = 0; k < 160; k++) { transport.warp(9); host.frame(DT); }
    } finally { Vehicle.prototype.setPassengers = orig; }
    expect(setCalls).toBeGreaterThan(20);                                           // the cars did take people on and off (and the fans)
    expect(joins).toBeGreaterThanOrEqual(2);                                       // at least a few new variants of the passengers…
    expect(passesInSet).toBe(0);                                                   // …and not one builder pass over a whole car rapide for any of them
  }, 120000);

  it.runIf(PERF && !!env.PERF_AT)('reads the browser check\'s 90-frame window with a car pulling in', async () => {
    const at = Number(env.PERF_AT), preset = PRESETS[0];
    const unwrap = [timed(Vehicle.prototype, 'setPassengers', 'setPassengers'), timed(LineVehicle.prototype, 'update', 'LineVehicle.update'), timed(StopPeople.prototype, 'update', 'StopPeople.update')];
    try {
      const host = await evening(preset);
      const transport = host.debug<{ warp(sec: number): void; nextAt(line: string, stop: number): number | null }>('transport');
      for (let k = 0; k < 40; k++) host.frame(DT);
      const wait = () => Math.min(...[0, 1, 2, 3].map(i => transport.nextAt('23s', i) || 1e9));    // (0: a car stands at that stop now)
      for (let k = 0; k < 900 && [0, 1, 2, 3].some(i => transport.nextAt('23s', i) === 0); k++) host.frame(DT);
      transport.warp(Math.max(0, wait() - at * DT - 0.02));                         // the line clock jumps to just before the soonest stop: no stop is crossed on the way
      const ms: number[] = [], spent: string[] = [];
      for (let k = 0; k < 90; k++) {
        for (const key of Object.keys(acc)) acc[key] = 0;
        const times: Record<string, number> = {};
        host.frame(DT, times);
        ms.push(times['module:transport'] ?? 0);
        spent.push(Object.entries(acc).filter(([, v]) => v > 0.2).map(([k2, v]) => `${k2} ${f2(v)}`).join(', '));
      }
      let reading = ms[0];                                                           // (the profiler starts from the first sample, then 92 % old, 8 % new)
      for (const v of ms) reading = reading * 0.92 + v * 0.08;
      const worst = ms.indexOf(Math.max(...ms));
      console.log(`${preset}, a car pulls in ${at} frames into the window: profiler reading ${f2(reading)} ms, mean ${f2(ms.reduce((a, b) => a + b, 0) / ms.length)}, slowest frame ${f2(ms[worst])} ms (#${worst}: ${spent[worst]})`);
      expect(reading).toBeGreaterThan(0);
    } finally { for (const u of unwrap) u(); }
  }, 300000);

  it.runIf(PERF)('times module:transport frame by frame', async () => {
    const unwrap = [
      timed(Vehicle.prototype, 'setPassengers', 'setPassengers'), timed(LineVehicle.prototype, 'update', 'LineVehicle.update'), timed(StopPeople.prototype, 'update', 'StopPeople.update'),
      timed(Apprentice.prototype, 'update', 'apprentice'), timed(Vehicle.prototype, 'animate', 'wheels'), timed(Humanoid.prototype, 'play', 'humanoid.play'), timed(AnimationMixer.prototype, 'update', 'mixer.update'),
    ];
    try {
      for (const preset of PRESETS) {
        const host = await evening(preset);
        const rows: { f: number; ms: number; cpu: number; wall: number; sub: Record<string, number> }[] = [];
        for (let f = 0; f < FRAMES; f++) {
          const times: Record<string, number> = {};
          for (const k of Object.keys(acc)) acc[k] = 0;
          const t0 = performance.now(), c0 = cpuNow();
          host.frame(DT, times);
          const c1 = cpuNow() - c0, t1 = performance.now();
          rows.push({ f, ms: times['module:transport'] ?? 0, cpu: c1, wall: t1 - t0, sub: { ...acc } });
        }
        const ms = rows.map(r => r.ms), sorted = [...ms].sort((a, b) => a - b);
        const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
        // the main loop's profiler (src/main.ts profMark): read after 110 frames, then every 10 frames of the run
        const reads: number[] = []; let e = ms[0];
        ms.forEach((v, i) => { e = e * 0.92 + v * 0.08; if (i >= 110 && i % 10 === 0) reads.push(e); });
        reads.sort((a, b) => a - b);
        const over = (t: number) => ms.filter(x => x > t).length;
        console.log(`${preset} ${FRAMES} frames: mean ${f2(mean)} ms, median ${f2(q(sorted, 0.5))}, p99 ${f2(q(sorted, 0.99))}, max ${f2(sorted[sorted.length - 1])}; over 2 ms ${over(2)}, over 4 ms ${over(4)}, over 16 ms ${over(16)}; profiler reading median ${f2(q(reads, 0.5))}, p90 ${f2(q(reads, 0.9))}, max ${f2(reads[reads.length - 1])}; kit ${JSON.stringify(kitBuildStats())}`);
        for (const r of rows.filter(x => x.ms > 1.5)) console.log(`   frame ${r.f}: ${f2(r.ms)} ms (frame wall ${f2(r.wall)} / cpu ${f2(r.cpu)}; ${Object.entries(r.sub).filter(([, v]) => v > 0.2).map(([k, v]) => `${k} ${f2(v)}`).join(', ')})`);
        expect(mean).toBeGreaterThan(0);
      }
    } finally { for (const u of unwrap) u(); }
  }, 1800000);
});
