import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
// (node's own modules by a dynamic import: the project's typecheck has no node typings beyond fs)
const nodeModule = (name: string): Promise<any> => import(/* @vite-ignore */ name);   // eslint-disable-line @typescript-eslint/no-explicit-any
import { runEvening, type FrameTimes, type MomentName, type Quality } from './perfHost';

/**
 * The outflow's reading and its bursts (docs/PERF_EVENING.md « Wave 5: the outflow »): one process = one browser run, so every
 * cold cost is paid as the browser pays it. Run with PERF=1:
 *   PERF=1 PERF_Q=low PERF_DAY=4 PERF_SETTLE=55 PERF_FRAMES=360 PERF_OUT=run.json nice -n 19 npx vitest run tests/perf.outflow.test.ts
 * It plays the browser check's evening (frames of 0.1 s), and writes, per moment: the check's readings (the profiler's moving
 * average at the end of each window of 90 frames, summed over the sections), each window's sections, and every frame's update
 * (ms, the sections summed; `pre`: the OS preempted the process during it). The bench driver (scripts/perf-outflow.mjs)
 * interleaves two builds over several city days and prints mean, p90 and worst of the end-of-window reading, and the frames
 * over 4 / 8 ms. Without PERF it is a smoke test (a few frames).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PERF = !!env.PERF;
const Q = (env.PERF_Q ?? 'low') as Quality;
const DAY = Number(env.PERF_DAY ?? 4);
const FRAMES = Number(env.PERF_FRAMES ?? (PERF ? 111 : 30));
/** Frames of the 23:00 window (the others last as long as the browser check's: 20 to settle and 91 measured). */
const FRAMES_LAST = Number(env.PERF_FRAMES_LAST ?? (PERF ? 270 : 30));
const SETTLE = env.PERF_SETTLE ? Number(env.PERF_SETTLE) : undefined;
/** PERF_WARM: frames before the 17:30 window (240): the paced systems' phases against the window's end move with it. */
/** PERF_PROF=<moment prefix> writes a V8 CPU profile (100 µs samples) of that moment's frames to PERF_OUT + '.cpuprofile'. */
const PROF = env.PERF_PROF;
/** PERF_HEAP=<moment prefix> writes a V8 sampling heap profile (every allocation of that moment's frames, collected or not) to PERF_OUT + '.heapprofile'. */
const HEAP = env.PERF_HEAP;
/** PERF_FRAMEPROF=<moment prefix> is PERF_PROF with each frame run by a function named `frame_<n>`: tests/frameprof (scratch) tells the frames apart. */
const FRAMEPROF = env.PERF_FRAMEPROF;

/** `heap`: the JS heap in use (kB) at the end of the frame: a drop between two frames is a collection, a rise is what the frame allocated. */
interface Trace { upd: number[]; pre: boolean[]; cpu: number[]; heap: number[]; top: Record<string, number>[] }

describe('the outflow (node, as the browser reads it)', () => {
  it('plays the evening and records the 23:00 window', async () => {
    const traces: Record<string, Trace> = {};
    const v8 = await nodeModule('node:v8');
    if (env.PERF_TRACEGC) v8.setFlagsFromString('--trace-gc');                // V8 prints each collection (kind, ms) as it happens
    const inspector = await nodeModule('node:inspector');
    const session = PROF || HEAP || FRAMEPROF ? new inspector.Session() : null;
    session?.connect();
    const post = (m: string, p?: object) => new Promise<unknown>((res, rej) => session.post(m, p ?? {}, (e: unknown, r: unknown) => (e ? rej(e) : res(r))));
    if (session && (PROF || FRAMEPROF)) { await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 100 }); }
    if (session && HEAP) await post('HeapProfiler.enable');
    const rows = await runEvening(Q, {
      wrap: FRAMEPROF ? (moment: MomentName, n: number, run: () => void) => {
        if (!moment.startsWith(FRAMEPROF)) { run(); return; }
        (new Function('run', `return function frame_${n}() { run(); }`)(run) as () => void)();         // (a function of its own name: a profile can tell the frames apart)
      } : undefined,
      around: PROF || HEAP || FRAMEPROF ? (moment: MomentName, at: 'start' | 'end') => {
        if ((PROF && moment.startsWith(PROF)) || (FRAMEPROF && moment.startsWith(FRAMEPROF))) {
          if (at === 'start') session.post('Profiler.start');
          else session.post('Profiler.stop', (_e: unknown, r: unknown) => { if (env.PERF_OUT) writeFileSync(env.PERF_OUT + '.cpuprofile', JSON.stringify((r as { profile: unknown }).profile)); });
        }
        if (HEAP && moment.startsWith(HEAP)) {
          if (at === 'start') session.post('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
          else session.post('HeapProfiler.stopSampling', (_e: unknown, r: unknown) => { if (env.PERF_OUT) writeFileSync(env.PERF_OUT + '.heapprofile', JSON.stringify((r as { profile: unknown }).profile)); });
        }
      } : undefined,
      frames: FRAMES, framesLast: FRAMES_LAST, warm: PERF ? Number(env.PERF_WARM ?? 240) : 30, browser: true, day: DAY, settle: SETTLE,
      frame: (moment: MomentName, _n: number, t: FrameTimes, pre: boolean) => {
        const tr = (traces[moment] ??= { upd: [], pre: [], cpu: [], heap: [], top: [] });
        tr.heap.push(Math.round(v8.getHeapStatistics().used_heap_size / 1024));
        let u = 0; for (const [k, v] of Object.entries(t)) if (k !== 'cpu' && !k.startsWith('render prep')) u += v;
        tr.upd.push(u); tr.pre.push(pre); tr.cpu.push(t.cpu ?? 0);
        tr.top.push(Object.fromEntries(Object.entries(t).filter(([k, v]) => k !== 'cpu' && !k.startsWith('render prep') && v > 0.3).map(([k, v]) => [k, Math.round(v * 100) / 100])));
      },
    });
    if (env.PERF_OUT) {
      writeFileSync(env.PERF_OUT, JSON.stringify({
        q: Q, day: DAY, settle: SETTLE ?? null, frames: FRAMES,
        moments: rows.map(r => ({ moment: r.moment, windows: r.windows.map(w => ({ update: w.update, calls: w.calls, sections: w.sections })), mean: r.update, calls: r.calls, trace: traces[r.moment] })),
      }));
    }
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.update).toBeGreaterThan(0);
  }, 900000);
});
