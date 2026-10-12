import { describe, expect, it } from 'vitest';
import { PerfHost, type Quality } from './perfHost';

type Out = { phase: string; queue: number; leaving: number; gone: number; inside: number; day: number; hour: number; atStalls: number; vendors: { anchor: { x: number; z: number } }[]; gate: { x: number; z: number } };
type Posters = { lines: { over: boolean; when: string; tag: string } };

async function replay(q: Quality, rollAt = -1) {
  const toasts: string[] = [];
  const host = new PerfHost(q);
  await host.load({ x: 0, z: 0, yaw: 0 }, 19);
  host.ctx.toast = (s: string) => { toasts.push(s); };
  const out = host.debug<() => Out>('arenaOut'), posters = host.debug<() => Posters>('posters');
  host.day = 406;
  const g = out().gate;
  host.place(g.x + 7, g.z - 13, 0);
  let n = 0;
  const log: string[] = [];
  for (n = 0; n < 700 && !(out().phase === 'arrive' && out().queue >= 3); n++) host.frame(0.1);
  log.push(`arrive after ${n} frames ${JSON.stringify(out()).slice(0, 160)}`);
  host.ctx.state.data.counters.arena_gala_day = out().day;
  let leave = -1, gone2 = -1, maxLeaving = 0;
  for (n = 0; n < 400; n++) {
    if (n === rollAt) host.day = 407;                                       // the city's day turns over (24 real minutes) under the held hour
    host.frame(0.1);
    const a = out();
    if (leave < 0 && a.phase === 'outflow' && a.queue === 0 && a.leaving >= 2) leave = n;
    maxLeaving = Math.max(maxLeaving, a.leaving);
    if (gone2 < 0 && a.gone >= 2) gone2 = n;
  }
  const a = out();
  log.push(`leave at ${leave}, gone>=2 at ${gone2}, maxLeaving ${maxLeaving}, end ${JSON.stringify({ phase: a.phase, gone: a.gone, inside: a.inside, leaving: a.leaving, hour: a.hour })}`);
  const v = a.vendors[0];
  host.place(v.anchor.x, v.anchor.z - 0.8, 0);
  for (n = 0; n < 150 && !toasts.some(t => /Les derniers avant de rentrer/.test(t)); n++) host.frame(0.1);
  const last = toasts.some(t => /Les derniers avant de rentrer/.test(t));
  const p = posters();
  log.push(`last call ${last} (${n} frames) · posters over ${p.lines.over} ${p.lines.tag} · ${p.lines.when} · phase ${out().phase} hour ${out().hour}`);
  return { leave, gone2, maxLeaving, gone: a.gone, last, over: p.lines.over, when: p.lines.when, log };
}

/**
 * scripts/check-arena-outflow.mjs holds the hour at 19 h but not the city day (24 real minutes): when the day turns over
 * during the run, « the gala seen to the end » (arena_gala_day = day) no longer matches, the street goes back to the
 * arrivals and the fans, the vendors' last call and the crossed posters all vanish. That is the control below, not a
 * regression of fix/w5-outflow: the same replay gives the same numbers on 69b3650 and 8997718.
 */
describe('the end of a gala evening, phone and desktop', () => {
  for (const q of ['low', 'medium'] as const) {
    it(`${q}: the crowd leaves, the vendors call the last, the posters are over`, async () => {
      const r = await replay(q);
      expect(r.gone2, 'two fans gone within 300 frames').toBeGreaterThanOrEqual(0);
      expect(r.gone2).toBeLessThan(300);
      expect(r.last).toBe(true);
      expect(r.over).toBe(true);
    }, 300000);
  }
});

describe('control: the city day turning over mid-evening (the check holds the hour at 19 h, not the day)', () => {
  it('reproduces the browser failure signature', async () => {
    const r = await replay('low', 100);
    expect(r.gone, 'the evening restarted: nobody gone').toBe(0);
    expect(r.last).toBe(false);
    expect(r.over).toBe(false);
    expect(r.when).toMatch(/^Ce soir/);
  }, 300000);
});
