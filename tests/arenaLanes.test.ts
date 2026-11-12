import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import { gatePlaza, inPlaza } from '../src/arena/exteriorRules';
import { roadCentre } from '../src/transport/lines';
import { hits } from '../src/transport/drive';

/**
 * Nothing unseen on the streets round the arena (Pikine). A driver still met « invisible » walls beside the arena after the gate's pedestrian zone got its
 * bollards: scripts/probe-arena-lanes.mjs drove the drive's own collision test along every lane round the block and found them — the car rapides of a line
 * that does not run, hidden but still solid: Ligne 23's evening route `23s` by day, both cars where they were made, in the middle of the junction at the
 * arena's north-west corner (0, 0), closing the street north of the arena and every turn there; and Ligne 23's day cars on the arena's evenings, frozen
 * where the evening found them (its « Arène » stop on the arena's west road). A hidden car is never solid (src/transport/module.ts lineFootprints).
 */
stubCanvas();
const hub = (await import('../src/world/builder')).buildHub('pikine', true) as HubWorld;
const { transport, lineFootprints } = await import('../src/transport/module');
const { carSpec } = await import('../src/transport/car');
const { motoSpec } = await import('../src/transport/moto');
const a = hub.arena!, plaza = gatePlaza(a);

/** A context good enough for the transport module's lines (no humanoid in node: the stops' people and the apprentices stay out). */
const ctxAt = (hour: number) => ({
  quality: () => 'low', hour: () => hour, day: () => 3, now: () => 0, extra: new THREE.Group(), camera: new THREE.PerspectiveCamera(), inside: () => null,
  player: { pos: new THREE.Vector3(), body: () => null, facing: () => 0, seated: () => null }, mode: () => 'play', setMode() {}, follow: { snapBehind() {} }, state: { data: { counters: {} } }, seats: { add() {}, remove() {}, get: () => null, occupy() {}, release() {} },
  places: { all: () => [], add() {}, remove() {} }, toast() {},
}) as unknown as GameCtx;
type Foot = { x: number; z: number; yaw: number; hl: number; hw: number };
const inFoot = (o: Foot, x: number, z: number, r: number) => { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw); return Math.abs(dx * c - dz * s) < o.hw + r && Math.abs(dx * s + dz * c) < o.hl + r; };

describe('the car rapides drive mode collides with', () => {
  it('are a running line\'s only: a line that does not run has its cars hidden, and a hidden car is never solid', () => {
    const car = (x: number, z: number) => ({ pose: { x, z, yaw: 0 } }), spec = { length: 6.3, width: 2.1 };
    const out = lineFootprints([{ on: false, spec, vehicles: [car(0, 0), car(0, 0)] }, { on: true, spec, vehicles: [car(-3.6, -35)] }], []);
    expect(out).toEqual([{ x: -3.6, z: -35, yaw: 0, hl: 3.15, hw: 1.05 }]);
  });
  it('on the real Pikine lines, by day and on an arena evening: every solid car rapide is a drawn one, none in the junction at the arena\'s corner', () => {
    for (const hour of [11, 20]) {
      const ctx = ctxAt(hour);
      transport.hubLoaded(ctx, hub);
      transport.update(ctx, 0.1);                                                          // the running line's cars to their place on the timetable
      const lines = (transport.debug(ctx) as { transport: { lines: () => { id: string; on: boolean; vehicles: { id: string; x: number; z: number }[] }[] } }).transport.lines();
      const running = lines.filter(l => l.on), parked = lines.filter(l => !l.on);
      expect(running.map(l => l.id)).toEqual(hour < 16 ? ['23'] : ['23s']);
      expect(parked.map(l => l.id)).toEqual(hour < 16 ? ['23s'] : ['23']);
      const out: Foot[] = []; transport.obstacles(out, 'sedan');
      const shown = new Set<string>(); ctx.extra.traverse(o => { if (o.name.startsWith('vehicle:') && o.visible) shown.add(o.name.slice(8)); });
      // as many solid cars as drawn ones, each at a running car's place
      expect(out.length).toBe(running.flatMap(l => l.vehicles).length);
      expect(running.flatMap(l => l.vehicles).every(v => shown.has(v.id))).toBe(true);
      expect(parked.flatMap(l => l.vehicles).some(v => shown.has(v.id))).toBe(false);
      for (const f of out) expect(running.flatMap(l => l.vehicles).some(v => Math.hypot(v.x - f.x, v.z - f.z) < 1e-6)).toBe(true);
      for (const v of parked.flatMap(l => l.vehicles)) expect(out.some(f => inFoot(f, v.x, v.z, 0))).toBe(false);
    }
    // by day, the evening route's hidden cars stood in the middle of the junction at the arena's north-west corner, across both lanes of the street north of it
    const ctx = ctxAt(11); transport.hubLoaded(ctx, hub); transport.update(ctx, 0.1);
    const hidden = (transport.debug(ctx) as { transport: { lines: () => { id: string; vehicles: { x: number; z: number }[] }[] } }).transport.lines().find(l => l.id === '23s')!.vehicles;
    expect(hidden.every(v => Math.hypot(v.x - roadCentre(2), v.z - roadCentre(2)) < 1)).toBe(true);
    const out: Foot[] = []; transport.obstacles(out, 'sedan');
    expect(out.some(f => inFoot(f, roadCentre(2), roadCentre(2), 2.5))).toBe(false);
  });
});

describe('the streets round the arena', () => {
  /** The drive's own test against the hub's colliders and the solid car rapides, for a vehicle on a lane of a street, every 0.5 m. */
  const sweep = (drive: ReturnType<typeof carSpec>['drive'], lanes: number[], foot: Foot[]) => {
    const blocked = (x: number, z: number, r: number) => hub.colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) || foot.some(o => inFoot(o, x, z, r));
    const out: string[] = [];
    // the arena block (2,1) and the streets on its four sides, from junction to junction and through them: x = 0, x = 60, z = −60, z = 0
    const X = [roadCentre(2), roadCentre(3)], Z = [roadCentre(1), roadCentre(2)];
    for (const sx of X) for (const lat of lanes) for (let z = roadCentre(0) + 8; z <= roadCentre(2) + 8; z += 0.5) for (const yaw of [0, Math.PI]) {
      const x = sx + (yaw ? lat : -lat);
      if (hits(drive!, x, z, yaw, blocked)) out.push(`x=${sx} lane ${lat} (${x}, ${z}) ${yaw ? 'south' : 'north'}`);
    }
    for (const sz of Z) for (const lat of lanes) for (let x = roadCentre(2) - 8; x <= roadCentre(3) + 8; x += 0.5) for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
      const z = sz + (yaw > 0 ? lat : -lat);
      if (inPlaza(plaza, x, z, 3)) continue;                                              // the gate's zone: a car stops at its bollards (tests/gatePlaza.test.ts)
      if (hits(drive!, x, z, yaw, blocked)) out.push(`z=${sz} lane ${lat} (${x}, ${z}) ${yaw > 0 ? 'east' : 'west'}`);
    }
    return out;
  };
  it('a car keeps its lane round the whole block, by day and on an arena evening, with nothing unseen on it', () => {
    for (const hour of [11, 20]) {
      transport.hubLoaded(ctxAt(hour), hub);
      const foot: Foot[] = []; transport.obstacles(foot, 'sedan');
      // the running cars are drawn and drive on: what a driver meets is behind one of them; here the lanes are taken empty of them
      expect(sweep(carSpec().drive, [2.1], foot.filter(f => f.hl > 3 && f.hw > 1 ? false : true)).slice(0, 5)).toEqual([]);
      expect(sweep(motoSpec().drive, [2.1, 3.6], foot.filter(f => f.hl > 3 && f.hw > 1 ? false : true)).slice(0, 5)).toEqual([]);
    }
  });
});
