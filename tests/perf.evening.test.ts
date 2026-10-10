import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';

/**
 * The crowd lane's update cost on a Pikine gala evening (docs/PERF_EVENING.md), in node with the real hub (blank canvas):
 * the stands (full, with the gala's moments), the street crowd and the arrivals, at 17:30, 19:00 and 23:00, per preset.
 * Run with PERF=1 (the numbers are printed); without it only a quick budget smoke runs.
 */
stubCanvas();
const PERF = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PERF;
const FRAMES = PERF ? 1800 : 240;
type Q = 'low' | 'medium' | 'high';

function ctxAt(q: Q, hour: number, at: { x: number; z: number }) {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 700);
  camera.position.set(at.x, 4, at.z - 6); camera.lookAt(at.x, 1, at.z + 10); camera.updateMatrixWorld();
  const ctx = {
    quality: () => q, hour: () => hour, day: () => 4, player: { pos: { x: at.x, y: 0, z: at.z } }, camera, extra: new THREE.Group(),
    places: { all: () => [] }, mode: () => 'play', inside: () => null, state: { data: { counters: {} } },
  };
  return ctx as unknown as GameCtx;
}
const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, p95: s[Math.floor(s.length * 0.95)] }; };

describe('the crowd lane on a gala evening', () => {
  it('stays within its update budget (ms per frame on this machine)', async () => {
    const { buildHub } = await import('../src/world/builder');
    const { StreetLife } = await import('../src/crowd/street');
    const { ArenaStands } = await import('../src/crowd/arenaStands');
    const { DENSITY, fillOrder, standSeats } = await import('../src/arena/program');
    const hub = buildHub('pikine', true), a = hub.arena!;
    const out: Record<string, unknown>[] = [];
    for (const q of ['low', 'medium', 'high'] as const) {
      for (const [moment, hour, at] of [['17:30', 17.5, { x: 18, z: -66.3 }], ['19:00', 19, { x: 36, z: -46 }], ['23:00', 23, { x: 6, z: -66.3 }]] as const) {
        const ctx = ctxAt(q, hour, at);
        const street = new StreetLife(ctx, hub, null);
        const seats = standSeats(a.cx, a.cz, 'perf:stand'), order = fillOrder(seats.length, 7).map(i => seats[i]);
        const cap = Math.round(seats.length * DENSITY[q].crowdShare);
        const stands = moment === '19:00' ? new ArenaStands(order.slice(0, cap), DENSITY[q].near, { quality: q }) : null;
        if (stands) { stands.fill(cap, () => false); const s = order[cap]; stands.setNear(s.x, s.z, s.yaw); }
        if (moment === '23:00') street.leaveNow(30);
        const tS: number[] = [], tC: number[] = [];
        const moments = ['entrance', 'clinch', 'clinch', 'fall', 'result'] as const;
        for (let k = 0; k < FRAMES + 300; k++) {
          let t = performance.now();
          street.update(1 / 60);
          if (k >= 300) tS.push(performance.now() - t);
          if (stands) {
            if (k % 300 === 0) stands.moment(moments[(k / 300) % moments.length], { side: 'left', winner: 'left' });
            t = performance.now();
            stands.cull(ctx.camera); stands.update(1 / 60, true);
            if (k >= 300) tC.push(performance.now() - t);
          }
        }
        const s = stats(tS), c = tC.length ? stats(tC) : { avg: 0, p95: 0 };
        out.push({ q, moment, street: +s.avg.toFixed(3), streetP95: +s.p95.toFixed(3), stands: +c.avg.toFixed(3), standsP95: +c.p95.toFixed(3), present: street.info().crowd.present + (stands?.present ?? 0), drawCalls: street.info().drawCalls + (stands?.stats() ? stands.crowd.drawCalls() : 0) });
        street.dispose(); stands?.dispose();
      }
    }
    if (PERF) console.log(JSON.stringify(out, null, 1));
    // the crowd lane's share of a frame: a fraction of a millisecond here (a mid-range phone is 3–4× slower)
    for (const r of out) expect((r.street as number) + (r.stands as number)).toBeLessThan(PERF ? 1.2 : 3);
  }, 120000);
});
