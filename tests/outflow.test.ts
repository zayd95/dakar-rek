import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WarmQueue } from '../src/game/warm';
import { ACTIVITIES, TRAFFIC_BY_HOUR, WALKERS_BY_HOUR } from '../src/social/ambientData';
import { curveAt, planDemand, ring, pair, prayerRows, type AmbientSpot, type PlanCache, type SeatLike } from '../src/social/ambient';
import { buildSpots, buildSpotsSteps } from '../src/social/ambientSpots';
import type { PlaceSpec } from '../src/activity/places';
import { CLIMB_HALF, aisleProfile, climbHeight, type Climb } from '../src/world/arenaModules';
import { buildVehicle, vehicleKey, type VehicleKind } from '../src/actors/vehicleKit';
import { CROWD_LOD, Crowd, type CrowdSlot } from '../src/crowd/crowd';
import { loadHumanoid } from './perfHost';

/**
 * The outflow's budgets and what makes them (docs/PERF_EVENING.md « Wave 5: the outflow »): the same answers as before from
 * cheaper code (the curves, the demand plan, the climbs), work done in steps (the warm-up queue, the spots' build), work
 * done ahead (the vehicles' models) and the bodies kept for the next person.
 */

describe('WarmQueue', () => {
  it('runs the jobs in the order they were added, at most `max` of them a call, and says how many are left', () => {
    const q = new WarmQueue(), ran: number[] = [];
    q.add(() => ran.push(1), () => ran.push(2));
    q.add(() => ran.push(3), () => ran.push(4), () => ran.push(5));
    expect(q.size).toBe(5);
    expect(q.run()).toBe(4); expect(ran).toEqual([1]);                      // (one by default)
    expect(q.run(2)).toBe(2); expect(ran).toEqual([1, 2, 3]);
    expect(q.run(10)).toBe(0); expect(ran).toEqual([1, 2, 3, 4, 5]);
    expect(q.run(3)).toBe(0);                                               // (nothing left: nothing happens)
  });

  it('starts no job once the milliseconds of the call have gone, but always the first', () => {
    const q = new WarmQueue(); let clock = 0; const ran: number[] = [];
    for (let k = 0; k < 6; k++) q.add(() => { ran.push(k); clock += 3; });     // (each job takes 3 ms on this clock)
    expect(q.run(10, 5, () => clock)).toBe(4);                              // 0 ms: first; 3 ms: second; 6 ms: past the 5
    expect(ran).toEqual([0, 1]);
    expect(q.run(10, 0, () => clock)).toBe(3);                              // (a budget of nothing: still the first)
    expect(ran).toEqual([0, 1, 2]);
    expect(q.run(1, 5, () => clock)).toBe(2);                               // (and `max` holds)
  });

  it('clear() drops what is left (a hub that unloads)', () => {
    const q = new WarmQueue(); let n = 0;
    q.add(() => n++, () => n++, () => n++);
    q.run(1); q.clear();
    expect(q.size).toBe(0); expect(q.run(5)).toBe(0); expect(n).toBe(1);
  });
});

/** The curve as it was first written (a map that unwraps the hours, a search): the allocation-free one answers alike. */
function firstCurveAt(pts: readonly (readonly [number, number])[], hour: number): number {
  let prev = -Infinity, wrap = 0;
  const hs = pts.map(([h]) => { if (h + wrap < prev) wrap += 24; prev = h + wrap; return prev; });
  let h = hour; if (h < hs[0] && h + 24 <= hs[hs.length - 1]) h += 24;
  if (h <= hs[0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (h <= hs[i]) { const v0 = pts[i - 1][1], v1 = pts[i][1]; return v0 + (v1 - v0) * (h - hs[i - 1]) / Math.max(hs[i] - hs[i - 1], 1e-6); }
  }
  return pts[pts.length - 1][1];
}

describe('curveAt without allocations', () => {
  it('gives the very values of the first implementation, for the game\'s curves and for curves that pass midnight', () => {
    const curves: (readonly (readonly [number, number])[])[] = [
      WALKERS_BY_HOUR, TRAFFIC_BY_HOUR, ...ACTIVITIES.flatMap(a => (a.curve ? [a.curve] : [])),
      [[20, 1], [23, 0.6], [1, 0.2]], [[22, 0], [2, 1], [5, 0.3]], [[10, 0], [12, 1]], [[0, 0.5], [12, 1], [24, 0.5]], [[5, 1]],
    ];
    let seed = 99; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    expect(curves.length).toBeGreaterThan(6);
    for (const c of curves) {
      for (let h = -1; h <= 25; h += 0.125) expect(curveAt(c, h), JSON.stringify(c) + ' at ' + h).toBe(firstCurveAt(c, h));
      for (let k = 0; k < 200; k++) { const h = r() * 24; expect(curveAt(c, h)).toBe(firstCurveAt(c, h)); }
    }
  });
});

describe('the demand plan with its cache', () => {
  const seat = (id: string, x: number, z: number): SeatLike => ({ id, x, z, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null });
  const seats = [...Array.from({ length: 6 }, (_, i) => seat('kiosk:' + i, i, 0)), ...Array.from({ length: 3 }, (_, i) => seat('bench:' + i, 50 + i, 0)), ...Array.from({ length: 4 }, (_, i) => seat('stop:' + i, 0, 20 + i))];
  const kind = (id: string) => seats.find(s => s.id === id)?.kind ?? null;
  const spot = (id: string, tags: string[], o: Partial<AmbientSpot> = {}): AmbientSpot => ({ id, tags, space: 'street', x: 0, z: 0, seats: [], stands: [], source: 'legacy', ...o });
  const spots = [
    spot('gargote', ['eat', 'kiosk'], { seats: seats.slice(0, 6).map(s => s.id), stands: [{ x: 0, z: 2, yaw: 0 }, { x: 1, z: 2, yaw: 0 }], hours: [7, 23] }),
    spot('dibi', ['dibi'], { seats: seats.slice(0, 6).map(s => s.id), stands: [{ x: 0, z: 2, yaw: 0 }], hours: [11, 2] }),
    spot('bench', ['bench'], { x: 50, seats: seats.slice(6, 9).map(s => s.id) }),
    spot('stop', ['stop'], { z: 20, seats: seats.slice(9).map(s => s.id), stands: ring(0, 20, 2, 8) }),
    spot('mosque', ['mosque'], { x: 10, rows: prayerRows(10, 0, 3, 6), stands: ring(10, 0, 3, 6) }),
    spot('prom', ['promenade'], { x: -40, route: [{ x: -40, z: -30 }, { x: -40, z: 30 }] }),
    spot('corner', ['corner'], { x: 30, stands: pair(30, 0, 0), prio: 1.6 }),
    spot('pitch', ['pitch'], { x: 20, z: 40, area: [0, 30, 40, 50] }),
  ];
  const rows = (cache: PlanCache | undefined, acts: typeof ACTIVITIES, hour: number, dow: number) =>
    planDemand(spots, acts, { hour, dow, scale: 1, px: 0, pz: 0, near: 70, far: 130, cap: 100, space: 'street', seatKind: kind }, cache).map(r => [r.spot.id, r.act.id, r.n, r.d]);

  it('is the very plan of the uncached call at every hour of every day, and with an evening\'s extra activities', () => {
    const cache: PlanCache = new WeakMap();
    const extra = [...ACTIVITIES, { ...ACTIVITIES[0], id: 'event-test', at: ['dibi'], hours: [[21, 3]] as [number, number][] }];
    let total = 0;
    for (const acts of [ACTIVITIES, extra]) for (let dow = 0; dow < 7; dow++) for (let h = 0; h < 24; h += 0.25) {
      const want = rows(undefined, acts, h, dow);
      expect(rows(cache, acts, h, dow), `day ${dow} at ${h}`).toEqual(want);
      expect(rows(cache, acts, h, dow)).toEqual(want);                       // (the second time the cache answers)
      total += want.length;
    }
    expect(total).toBeGreaterThan(500);
  });
});

describe('the spots built in steps', () => {
  const layout = { specials: [{ kind: 'mosque' as const, x: -30, z: -30 }, { kind: 'pitch' as const, x: 60, z: 0 }], sea: 'west' as const };
  const place = (id: string, type: string, x: number, z: number): PlaceSpec => ({ id, type, name: id, space: 'street', hours: [8, 23], anchors: [{ id: 'counter', kind: 'counter', x, z }], offers: {} } as PlaceSpec);
  const seat = (id: string, x: number, z: number): SeatLike => ({ id, x, z, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null });
  const inp = () => ({
    places: [place('dibi-a', 'dibi', 0, 0), place('dibi-b', 'dibi', 40, 0), place('gargote-a', 'gargote', -40, 10)],
    seats: [...Array.from({ length: 6 }, (_, i) => seat('a:' + i, -2 + i * 0.8, 3)), ...Array.from({ length: 4 }, (_, i) => seat('b:' + i, 38 + i * 0.8, 3))],
    interactables: [{ id: 'plateau:dibiterie:12', x: 80, z: 5 }, { id: 'plateau:kiosk:3', x: 90, z: -5 }],
    layout, colliders: [], people: [], arena: null,
  });
  const brief = (spots: AmbientSpot[]) => spots.map(s => [s.id, s.tags, +s.x.toFixed(3), +s.z.toFixed(3), s.seats, s.stands.length, s.rows?.length ?? 0]);

  it('yields several times and returns what buildSpots returns', () => {
    let steps = 0, last: AmbientSpot[] | null = null;
    const gen = buildSpotsSteps(inp());
    for (;;) { const r = gen.next(); if (r.done) { last = r.value; break; } steps++; }
    expect(steps).toBeGreaterThanOrEqual(5);                                  // (a place, a legacy place… each its own step: no frame takes them all)
    expect(brief(last!)).toEqual(brief(buildSpots(inp())));
    expect(last!.length).toBeGreaterThan(4);
  });
});

describe('climbHeight with its sine and cosine kept', () => {
  /** As it was written first: the angle's sine and cosine at every call, no reach. */
  const first = (c: Climb, x: number, z: number): number | null => {
    const dx = x - c.cx, dz = z - c.cz, u = dx * Math.sin(c.a) + dz * Math.cos(c.a), v = dx * Math.cos(c.a) - dz * Math.sin(c.a);
    if (Math.abs(v) > c.half) return null;
    let h: number | null = null;
    for (const [u0, u1, y] of c.steps) if (u >= u0 && u < u1) h = Math.max(h ?? 0, y - 0.1);
    return h;
  };
  it('answers as the first implementation did, on the aisles, beside them and far from the arena', () => {
    const climbs: Climb[] = [0, 0.7, 1.9, 3.3, 5.2].map(a => ({ cx: 30, cz: -30, a, half: CLIMB_HALF, steps: aisleProfile() }));
    let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    let on = 0;
    for (const c of climbs) {
      for (let k = 0; k < 3000; k++) {
        const u = r() * 30 - 2, v = (r() - 0.5) * 6, x = c.cx + Math.sin(c.a) * u + Math.cos(c.a) * v, z = c.cz + Math.cos(c.a) * u - Math.sin(c.a) * v;
        const want = first(c, x, z);
        expect(climbHeight(c, x, z), `aisle ${c.a.toFixed(2)} at ${u.toFixed(2)}, ${v.toFixed(2)}`).toBe(want);
        if (want !== null) on++;
      }
      for (const [x, z] of [[400, 400], [-300, 20], [c.cx, c.cz], [c.cx + 1e4, c.cz - 1e4]]) expect(climbHeight(c, x, z)).toBe(first(c, x, z));
    }
    expect(on).toBeGreaterThan(500);
  });
});

describe('the vehicles\' models made ahead', () => {
  const geometryOf = (g: THREE.Object3D) => { let geo: THREE.BufferGeometry | null = null; g.traverse(o => { if (!geo && (o as THREE.Mesh).isMesh) geo = (o as THREE.Mesh).geometry; }); return geo as THREE.BufferGeometry | null; };

  it('vehicleKey is the key of the geometry a build draws: two builds with the same key share one, with another key they do not', () => {
    for (const [kind, n] of [['taxi', 24], ['sedan', 40]] as [VehicleKind, number][]) {
      const byKey = new Map<string, THREE.BufferGeometry>();
      for (let seed = 1; seed <= n; seed++) {
        const opts = { seed, driver: true, passengers: false }, key = vehicleKey(kind, opts), geo = geometryOf(buildVehicle(kind, opts).group)!;
        expect(vehicleKey(kind, opts)).toBe(key);                              // (a key is a pure function of the seed)
        const known = byKey.get(key);
        if (known) expect(geo, `${kind} ${seed}`).toBe(known); else byKey.set(key, geo);
      }
      const geos = new Set(byKey.values());
      expect(byKey.size).toBeGreaterThan(1); expect(geos.size).toBe(byKey.size);   // (several models, none shared between keys)
      expect(byKey.size).toBeLessThan(n);                                         // (and seeds do share them: a pass over the seeds makes fewer builds than seeds)
    }
  });
});

describe('the bodies a crowd keeps for the next person', () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.3, 700);
  cam.position.set(0, 1.6, 0); cam.lookAt(0, 1.6, -10); cam.updateMatrixWorld();
  const slots: CrowdSlot[] = Array.from({ length: 24 }, (_, i) => ({ id: 'w' + i, x: -4 + (i % 8), y: 0, z: -4 - Math.floor(i / 8) * 1.2, yaw: 0, seated: false }));
  type Inside = { spare: { group: THREE.Object3D }[]; bodies: { h: { group: THREE.Object3D } }[] };

  it('makes spare bodies one a frame ahead, takes them when people come near, and gives them back when they walk away', async () => {
    await loadHumanoid();
    const c = new Crowd(slots, { quality: 'medium', seed: 4, name: 'spares', nearRadius: 12 }), inner = c as unknown as Inside;
    c.fill(24); c.setCamera(cam);
    expect(CROWD_LOD.medium.near).toBeGreaterThanOrEqual(3);
    const want = CROWD_LOD.medium.near + 1;
    const everSeen = new Set<unknown>();
    const see = () => { for (const b of inner.bodies) everSeen.add(b.h); for (const h of inner.spare) everSeen.add(h); };
    let frames = 0;
    for (; frames < 400 && inner.spare.length + inner.bodies.length < want; frames++) { c.update(0.05); see(); }
    expect(inner.spare.length + inner.bodies.length).toBe(want);              // (the bodies of the near circle and one more, made a frame apart)
    expect(frames).toBeGreaterThan(1);
    for (let k = 0; k < 20; k++) { c.update(0.1); see(); }
    const near = c.stats().near;
    expect(near).toBeGreaterThan(0);
    expect(inner.bodies.length).toBe(near);
    // everybody walks out of the near circle: the bodies go back to the spares (a few of them), nothing is cloned again later
    cam.position.set(0, 1.6, 80); cam.updateMatrixWorld(); c.setCamera(cam);
    for (let k = 0; k < 20; k++) { c.update(0.1); see(); }
    expect(c.stats().near).toBe(0);
    expect(inner.spare.length).toBeGreaterThan(0); expect(inner.spare.length).toBeLessThanOrEqual(CROWD_LOD.medium.near + 2);
    for (const h of inner.spare) expect(h.group.visible).toBe(false);
    cam.position.set(0, 1.6, 0); cam.updateMatrixWorld(); c.setCamera(cam);
    const before = everSeen.size;
    for (let k = 0; k < 20; k++) { c.update(0.1); see(); }
    expect(c.stats().near).toBeGreaterThan(0);
    for (const b of inner.bodies) expect(everSeen.has(b.h)).toBe(true);
    expect(everSeen.size).toBeLessThanOrEqual(before + 1);                    // (the same few bodies served: at most the next spare was made)
    c.dispose();
    expect(inner.spare.length).toBe(0);
  });
});
