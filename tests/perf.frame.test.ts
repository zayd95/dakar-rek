import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runEvening, type MomentResult, type Quality } from './perfHost';

/**
 * The whole frame's update on a Pikine gala evening, in node (docs/PERF_EVENING.md « In node »): every module and the
 * main loop's systems at 17:30 (arrivals at the gate), 19:00 (seated on the tiers, the bout) and 23:00 (the outflow),
 * with the draw calls a frame would issue per group. Run with PERF=1 for the numbers (PERF_Q=low,medium to choose the
 * presets, PERF_FRAMES per moment, PERF_OUT=file.json to save them); without it, a short smoke on the low preset.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PERF = !!env.PERF;
const PRESETS = (env.PERF_Q ?? (PERF ? 'low,medium,high' : 'low')).split(',') as Quality[];
const FRAMES = Number(env.PERF_FRAMES ?? (PERF ? 600 : 30));

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
function print(r: MomentResult) {
  const top = Object.entries(r.sections).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${round(v)}`).join(', ');
  const groups = Object.entries(r.by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`${r.q} ${r.moment}: update ${round(r.update)} ms (cpu ${round(r.cpu)}), ${round(r.calls, 1)} calls (+ shadow pass ${round(r.shadow, 1)}), ${r.frames} frames, arena ${r.arena?.phase}/${r.arena?.street}\n   by system: ${top}\n   by group: ${groups}`);
}

describe('the frame on a gala evening (node)', () => {
  it('runs every module through the three moments', async () => {
    const all: MomentResult[] = [];
    for (const q of PRESETS) {
      const rows = await runEvening(q, { frames: FRAMES, warm: PERF ? 240 : 30 });
      for (const r of rows) { all.push(r); if (PERF) print(r); }
    }
    if (env.PERF_OUT) writeFileSync(env.PERF_OUT, JSON.stringify({ when: new Date().toISOString(), frames: FRAMES, rows: all }, null, 1));
    expect(all.length).toBe(PRESETS.length * 3);
    for (const r of all) { expect(r.update).toBeGreaterThan(0); expect(r.calls).toBeGreaterThan(10); }
  }, 600000);
});
