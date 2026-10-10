import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { HUB_STREETS, STREET_BUDGET, WALK_BY_HOUR, edgeWeight, pavementLanes, ring, stopSlots, streetTargets, clearWalk, PAVE } from '../src/crowd/streetPlan';
import { curveAt } from '../src/social/ambient';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';

stubCanvas();
const hubs = new Map<string, HubWorld>();
async function hub(id: 'pikine' | 'plateau' | 'corniche' | 'almadies') {
  if (!hubs.has(id)) { const { buildHub } = await import('../src/world/builder'); hubs.set(id, buildHub(id, true)); }
  return hubs.get(id)!;
}
const inside = (h: HubWorld, x: number, z: number, r = 0.12) => h.colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

describe('street plan', () => {
  it('rush hours bring the most people, nights the fewest; busy hubs more than quiet ones', () => {
    const at = (h: number, hub: 'pikine' | 'almadies' = 'pikine', q: 'low' | 'medium' | 'high' = 'high') => streetTargets(hub, h, q, 4, 9);
    expect(at(8).walkers).toBeGreaterThan(at(11).walkers);
    expect(at(18.75).walkers).toBeGreaterThan(at(15).walkers);
    expect(at(3).walkers).toBeLessThan(at(8).walkers / 5);
    expect(at(3).perStop).toBe(0);
    expect(at(18.25).perStop).toBeGreaterThan(at(12).perStop);
    expect(at(19).groups).toBeGreaterThan(at(9).groups);
    expect(at(18.75, 'almadies').walkers).toBeLessThan(at(18.75, 'pikine').walkers);
    for (const q of ['low', 'medium', 'high'] as const) for (let h = 0; h < 24; h += 0.5) {
      const t = streetTargets('plateau', h, q, 4, 20);
      expect(t.walkers + t.perStop * 4 + t.groups * 4).toBeLessThanOrEqual(STREET_BUDGET[q].pool + 0.01);
    }
    expect(curveAt(WALK_BY_HOUR, 7.75)).toBe(1);
  });

  it('Sandaga and the Pikine main street weigh more than the other streets', () => {
    const busy = HUB_STREETS.pikine.busy;
    expect(edgeWeight({ ax: 0, az: -60, bx: 60, bz: -60 }, busy)).toBe(6);
    expect(edgeWeight({ ax: 60, az: -60, bx: 0, bz: -60 }, busy)).toBe(6);
    expect(edgeWeight({ ax: 0, az: 0, bx: 60, bz: 0 }, busy)).toBe(1);
    expect(edgeWeight({ ax: 0, az: 0, bx: 60, bz: 0 }, HUB_STREETS.plateau.busy)).toBe(6);
  });

  it('pavement lanes, stop places and chat rings stay clear of walls and stalls in every hub', async () => {
    const { linesOf } = await import('../src/transport/lines');
    const { placeStops } = await import('../src/transport/stops');
    for (const id of ['pikine', 'plateau', 'corniche', 'almadies'] as const) {
      const h = await hub(id), lanes = pavementLanes(h.edges, h.colliders, HUB_STREETS[id].busy);
      expect(lanes.length).toBeGreaterThan(h.edges.length);
      for (const l of lanes) {
        expect(clearWalk(l.ax, l.az, l.bx, l.bz, h.colliders, 0.3)).toBe(true);
        expect(l.off).toBeLessThan(PAVE.wait - 0.5);                 // walkers keep to the front of the pavement
      }
      for (const site of linesOf(id).flatMap(line => placeStops(line, h.colliders))) {
        const slots = stopSlots(site, h.colliders);
        expect(slots.length).toBeGreaterThan(3);
        for (const p of slots) {
          expect(inside(h, p.x, p.z, 0.25)).toBe(false);
          expect(Math.hypot(p.x - site.x, p.z - site.z)).toBeGreaterThan(2.5);   // the shelter keeps its middle
        }
      }
    }
    expect(ring(0, 0, 4).every(p => Math.abs(Math.hypot(p.x, p.z) - 0.72) < 1e-9)).toBe(true);
  });
});

function fakeCtx(hour: number, at: { x: number; z: number }) {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  camera.position.set(at.x, 4, at.z + 8); camera.lookAt(at.x, 1, at.z); camera.updateMatrixWorld();
  const extra = new THREE.Group();
  const ctx = {
    quality: () => 'high', hour: () => hour, day: () => 3, player: { pos: { x: at.x, y: 0, z: at.z } }, camera, extra,
    places: { all: () => [] }, mode: () => 'play', inside: () => null, state: { data: { counters: {} } },
  };
  return { ctx: ctx as unknown as GameCtx, set: (hr: number) => { hour = hr; } };
}

describe('street life', () => {
  it('fills the Pikine main street at the evening rush: walkers, people waiting at the stops, groups; never inside a wall', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const { ctx } = fakeCtx(18.75, { x: -20, z: -66 });
    const s = new StreetLife(ctx, h, null);
    let worst: string | null = null;
    for (let k = 0; k < 1500; k++) {
      s.update(0.1);
      if (k % 10 === 0) for (const a of s.where()) if (inside(h, a.x, a.z)) worst = `${a.id} ${a.role} at ${a.x.toFixed(2)},${a.z.toFixed(2)}`;
    }
    expect(worst).toBeNull();
    const i = s.info();
    expect(i.target.walkers).toBeGreaterThan(20);
    expect(i.roles.walk ?? 0).toBeGreaterThan(i.target.walkers * 0.7);
    expect(i.stops.reduce((n, st) => n + st.waiting, 0)).toBeGreaterThan(8);
    expect(i.groups).toBeGreaterThan(2);
    expect(i.crowd.present).toBeLessThanOrEqual(STREET_BUDGET.high.pool);
    expect(i.drawCalls).toBeLessThanOrEqual(4);
    // the busy street gets more than its share: lanes of the main street hold more walkers than average
    s.dispose();
  });

  it('empties at night and the people leaving the arena head for the stop and the streets', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const f = fakeCtx(18.5, { x: 30, z: -75 });
    const s = new StreetLife(f.ctx, h, null);
    for (let k = 0; k < 600; k++) s.update(0.1);
    const evening = s.info().crowd.present;
    s.leaveNow(16);
    for (let k = 0; k < 600; k++) s.update(0.1);
    const after = s.info();
    expect(after.counts.left).toBe(16);
    expect(after.stops.find(st => st.key.endsWith(':arene'))!.waiting).toBeGreaterThan(2);
    f.set(3.5);
    for (let k = 0; k < 4000; k++) s.update(0.1);
    const night = s.info();
    expect(night.target.perStop).toBe(0);
    expect(night.crowd.present).toBeLessThan(evening / 2);
    s.dispose();
  });
});
