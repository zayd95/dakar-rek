import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { BAYS, ENTRANCE, ENTRY_WALK, FRONT_DOOR, GATE, LOT, WALL_H, onLot } from '../src/housing/villa';
import { ENTRANCE_FREE, ENTRANCE_REACH, ENTRANCE_SECONDS, GATE_REACH, entranceAngle, entranceWants, gateFor, inSwing, stepEntrance } from '../src/villa/gate';
import { PORTAL, slideGate, swingEntrance, type EntranceRig } from '../src/world/villaCompound';
import { buildHub } from '../src/world/builder';
import { dressHub } from '../src/game/streetDress';
import { placeParked, PARKED_COUNT } from '../src/game/parkedVehicles';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * LD2.0-D round 2, lane R2-E (the owner's review: « a main door different from the car garage door and easy access without going behind the car »): the
 * villa's main entrance for people (src/world/villaCompound.ts `buildEntrance`), its door's rule (src/villa/gate.ts `entranceWants`), the path to the front
 * door kept clear (ENTRY_WALK), and the car gate made telescopic so that, open, it stows clear of the entrance.
 */
stubCanvas();
const ex = (ENTRANCE.x0 + ENTRANCE.x1) / 2;
const hubs: Partial<Record<'full' | 'lite', HubWorld>> = {};
const build = (q: 'full' | 'lite') => (hubs[q] ??= buildHub('almadies', q === 'lite'));
const compound = (h: HubWorld) => h.group.getObjectByName('villa-compound')!;
const door = (h: HubWorld) => compound(h).userData.entrance as { shut: Collider; open: Collider };
const hits = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
/** A plan rectangle in the hub. */
const P = (x0: number, z0: number, x1: number, z1: number) => { const a = onLot(x0, z0), b = onLot(x1, z1); return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; };
/** The game's own collision (src/main.ts pushOut): out of every box by the body's radius. */
function pushOut(x: number, z: number, r: number, cols: Collider[]): [number, number] {
  for (const c of cols) {
    const cx = Math.min(c.x1, Math.max(c.x0, x)), cz = Math.min(c.z1, Math.max(c.z0, z));
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
    else { const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z, m = Math.min(l, rr, t, b); if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r; }
  }
  return [x, z];
}
/** A walker (radius 0.5, as outdoors) heading straight for each point in turn, 5 cm a step, held out of the boxes: his trail (plan coordinates). */
function walk(points: { x: number; z: number }[], cols: Collider[]) {
  let p = onLot(points[0].x, points[0].z); const trail = [{ x: points[0].x, z: points[0].z }];
  for (const q of points.slice(1)) {
    const t = onLot(q.x, q.z);
    for (let i = 0; i < 1500; i++) {
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz); if (d < 0.02) break;
      const s = Math.min(0.05, d), [nx, nz] = pushOut(p.x + (dx / d) * s, p.z + (dz / d) * s, 0.5, cols);
      p = { x: nx, z: nz }; trail.push({ x: nx - LOT.cx, z: nz - LOT.cz });
    }
  }
  return trail;
}

describe('the main entrance\'s door: the gate\'s rule, for people on foot', () => {
  const at = (px: number, pz: number, o: Partial<{ driving: boolean; allowed: boolean; open: number }> = {}) => entranceWants({ px, pz, driving: !!o.driving, allowed: o.allowed ?? true }, o.open ?? 0);
  it('opens for the villa\'s people (the gate\'s: owner, renter, accepted guest) walking up from the street, before they reach it', () => {
    expect(gateFor('owned', false) && gateFor('rented', false) && gateFor(null, true)).toBe(true);
    expect(at(ex, ENTRANCE.z + ENTRANCE_REACH.street - 0.2)).toBe(true);
    expect(at(ex + 2, ENTRANCE.z + 1)).toBe(true);                                          // coming along the pavement
    expect(at(ex, ENTRANCE.z + ENTRANCE_REACH.street + 0.3)).toBe(false);
  });
  it('stays shut to the others, even standing against it; does nothing for someone at the wheel', () => {
    for (const dz of [0.6, 1.5, 3, 4.5]) expect(at(ex, ENTRANCE.z + dz, { allowed: false })).toBe(false);
    expect(at(ex, ENTRANCE.z + 0.55, { allowed: false })).toBe(false);
    expect(at(ex, ENTRANCE.z + 2, { driving: true })).toBe(false);                         // the cars have the gate
    expect(at(ex + 6, ENTRANCE.z + 3, { driving: true })).toBe(false);
  });
  it('lets anyone inside the walls out (nobody is shut in), and shuts behind those who walk on to the house', () => {
    expect(at(ex, ENTRANCE.z - 2, { allowed: false })).toBe(true);
    expect(at(ex, ENTRANCE.z - ENTRANCE_REACH.yard + 0.2, { allowed: false })).toBe(true);
    expect(at(ex, ENTRANCE.z - ENTRANCE_REACH.yard - 0.4, { allowed: true, open: 1 })).toBe(false);   // on the path to the house: shut behind
    expect(at(FRONT_DOOR.x, FRONT_DOOR.z + 1, { allowed: true, open: 1 })).toBe(false);     // at the front door, even its owner: shut
  });
  it('never shuts on someone in its swing, either side of the wall, once it is moving', () => {
    expect(inSwing(ex, ENTRANCE.z)).toBe(true); expect(inSwing(ex, ENTRANCE.z - 1.6)).toBe(true); expect(inSwing(ex, ENTRANCE.z + 0.6)).toBe(true);
    expect(inSwing(ex, ENTRANCE.z + 3)).toBe(false); expect(inSwing(ex + 3, ENTRANCE.z)).toBe(false);
    expect(at(ex, ENTRANCE.z + 0.6, { allowed: false, open: 0.4 })).toBe(true);
    expect(at(ex - 0.4, ENTRANCE.z - 1.5, { allowed: false, open: 0.9 })).toBe(true);
    expect(at(ex, ENTRANCE.z + 0.6, { allowed: false, open: 0 })).toBe(false);             // shut, a stranger in front of it opens nothing
  });
  it('swings in ENTRANCE_SECONDS each way, a quarter turn, quick off the latch; the way is free past ENTRANCE_FREE', () => {
    let k = 0; for (let i = 0; i < 30; i++) k = stepEntrance(k, true, ENTRANCE_SECONDS / 30);
    expect(k).toBeCloseTo(1, 6);
    expect(stepEntrance(0.5, false, ENTRANCE_SECONDS / 2)).toBe(0); expect(stepEntrance(0, false, 1)).toBe(0);
    expect(entranceAngle(0)).toBe(0); expect(entranceAngle(1)).toBeCloseTo(Math.PI / 2, 9);
    expect(entranceAngle(ENTRANCE_FREE)).toBeGreaterThan((80 * Math.PI) / 180);
    for (let x = 0; x < 1; x += 0.05) expect(entranceAngle(x + 0.05)).toBeGreaterThan(entranceAngle(x));
    // a walker jogging (4.2 m/s) from where it starts to open reaches its box only once the way is free
    expect((ENTRANCE_REACH.street - 0.5 - 0.05) / 4.2).toBeGreaterThan(ENTRANCE_FREE * ENTRANCE_SECONDS);
    expect((ENTRANCE_REACH.yard - 0.5 - 0.3) / 4.2).toBeGreaterThan(ENTRANCE_FREE * ENTRANCE_SECONDS);
    expect(ENTRANCE_REACH.street).toBeLessThan(GATE_REACH.street + 0.01 + 1);
  });
});

describe('the main entrance in the street wall', () => {
  it('breaks the wall at ENTRANCE, in line with the front door; the opening shut by the door\'s own box, the portal\'s pillars solid', () => {
    for (const q of ['full', 'lite'] as const) {
      const h = build(q), d = door(h);
      expect(ENTRANCE.x0 < FRONT_DOOR.x && ENTRANCE.x1 > FRONT_DOOR.x).toBe(true);
      expect(h.colliders).toContain(d.shut); expect(h.colliders).not.toContain(d.open);
      const others = h.colliders.filter(c => c !== d.shut);
      // nothing else stands in the opening, through the wall's thickness
      expect(others.filter(c => hits(c, P(ENTRANCE.x0 + 0.01, ENTRANCE.z - 0.6, ENTRANCE.x1 - 0.01, ENTRANCE.z + 0.4))).map(c => JSON.stringify(c))).toEqual([]);
      // the shut door spans the opening, as high as the wall at least
      expect(d.shut).toMatchObject(P(ENTRANCE.x0, ENTRANCE.z - 0.3, ENTRANCE.x1, ENTRANCE.z - 0.05));
      expect(d.shut.h).toBeGreaterThanOrEqual(WALL_H);
      // the pillars either side, higher than the wall
      for (const x of [ENTRANCE.x0 - PORTAL.pillar / 2, ENTRANCE.x1 + PORTAL.pillar / 2]) {
        const p = onLot(x, ENTRANCE.z - 0.2);
        expect(others.some(c => c.h >= PORTAL.top - 0.01 && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1), `pillar at ${x}`).toBe(true);
      }
      expect(PORTAL.top).toBeGreaterThan(WALL_H + 0.5);
    }
  });

  it('keeps the walk to the front door (ENTRY_WALK) clear: no palm, bed, bay, wall or bollard\'s box on it but the door itself', () => {
    for (const q of ['full', 'lite'] as const) {
      const h = build(q), d = door(h), others = h.colliders.filter(c => c !== d.shut && c !== d.open);
      const garden = P(ENTRY_WALK.x0, ENTRY_WALK.z0 + 0.01, ENTRY_WALK.x1, ENTRY_WALK.z1 - 0.5);      // the garden's part, to the portal's inner face
      expect(others.filter(c => hits(c, garden)).map(c => JSON.stringify(c)), q).toEqual([]);
      for (const b of BAYS) expect(b.x - 1.3 > ENTRY_WALK.x1 + 1).toBe(true);
      // the palms' trunks stand off it, by more than a body's width
      for (const c of others.filter(c => c.h === 3)) expect(hits(c, P(ENTRY_WALK.x0 - 0.5, ENTRY_WALK.z0, ENTRY_WALK.x1 + 0.5, ENTRY_WALK.z1))).toBe(false);
    }
  });

  it('a walker goes from the street through the open door straight to the front door, without touching a bay; the shut door keeps him out', () => {
    const h = build('full'), d = door(h);
    const open = [...h.colliders.filter(c => c !== d.shut), d.open], shut = h.colliders;
    const anchor = { x: FRONT_DOOR.x, z: FRONT_DOOR.z + 1 };                              // where « Entrer chez toi » is (src/economy/estate.ts VILLA_GATES)
    const route = [{ x: ex + 0.15, z: ENTRANCE.z + 1.8 }, { x: ex + 0.15, z: ENTRANCE.z - 2.5 }, anchor];
    const t = walk(route, open), end = t.at(-1)!;
    expect(Math.hypot(end.x - anchor.x, end.z - anchor.z)).toBeLessThan(0.1);
    const bays = BAYS.map(b => ({ x0: b.x - 1.3, x1: b.x + 1.3, z0: b.z - 2.7, z1: b.z + 2.7 }));
    for (const p of t) for (const b of bays) expect(p.x + 0.5 < b.x0 || p.x - 0.5 > b.x1 || p.z + 0.5 < b.z0 || p.z - 0.5 > b.z1).toBe(true);
    // straight: never more than 0.6 m off the walk's middle line, never held back long
    for (const p of t) if (p.z < ENTRANCE.z) expect(p.x > ENTRY_WALK.x0 - 0.01 && p.x < ENTRY_WALK.x1 + 0.01, JSON.stringify(p)).toBe(true);
    const len = t.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - t[i].x, p.z - t[i].z), 0);
    expect(len).toBeLessThan(Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z) + Math.hypot(anchor.x - route[1].x, anchor.z - route[1].z) + 0.2);
    // the door shut: he stays on the pavement
    const u = walk(route, shut);
    expect(Math.min(...u.map(p => p.z))).toBeGreaterThan(ENTRANCE.z + 0.4);
  });

  it('turns its leaf about the pivot, its long side into the garden; its open box is the leaf\'s, clear of the way through', () => {
    const h = build('full'), d = door(h), g = compound(h);
    const leaf = g.getObjectByName('villa-entrance-door') as THREE.Mesh;
    const rig: Pick<EntranceRig, 'mesh'> = { mesh: leaf };
    swingEntrance(rig.mesh, 1); leaf.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(leaf);
    expect(box.min.z).toBeLessThan(onLot(0, ENTRANCE.z - 1.2).z);                          // into the garden
    expect(box.max.z).toBeLessThan(onLot(0, ENTRANCE.z + 0.15).z);                         // the short side barely out
    expect(box.min.x).toBeGreaterThan(d.open.x0 - 0.05); expect(box.max.x).toBeLessThan(d.open.x1 + 0.05);
    expect(box.min.z).toBeGreaterThan(d.open.z0 - 0.05); expect(box.max.z).toBeLessThan(d.open.z1 + 0.05);
    // the way through beside it: wider than a body (1 m) by a margin
    const pillarE = onLot(ENTRANCE.x1, 0).x;
    expect(pillarE - d.open.x1).toBeGreaterThan(1.2);
    swingEntrance(rig.mesh, 0); leaf.updateMatrixWorld(true);
    const shutBox = new THREE.Box3().setFromObject(leaf);
    expect(shutBox.min.x).toBeGreaterThan(onLot(ENTRANCE.x0, 0).x - 0.01); expect(shutBox.max.x).toBeLessThan(onLot(ENTRANCE.x1, 0).x + 0.01);
    expect(shutBox.max.y).toBeGreaterThan(2.6);
  });

  it('costs two draw calls (its travertine with the path, its door); the compound stays within its 25', () => {
    for (const q of ['full', 'lite'] as const) {
      const g = compound(build(q));
      expect((g.getObjectByName('villa-entrance') as THREE.Mesh).isMesh).toBe(true);
      expect((g.getObjectByName('villa-entrance-door') as THREE.Mesh).isMesh).toBe(true);
      let draws = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) draws++; });
      expect(draws).toBeLessThanOrEqual(25);
    }
  });

  it('the car gate, telescopic, stows open between the entrance and the gate: its opening free, the entrance never crossed', () => {
    const h = build('full'), g = compound(h), gate = g.getObjectByName('villa-gate') as THREE.Mesh, travel = g.userData.gateTravel as number;
    const pos = gate.geometry.attributes.position as THREE.BufferAttribute, before = Float32Array.from(pos.array as Float32Array);
    const xs = () => { const out: number[] = []; for (let i = 0; i < pos.count; i++) out.push(pos.getX(i) + gate.position.x); return out; };
    slideGate(gate, travel, 1);
    const open = xs();
    expect(Math.min(...open)).toBeGreaterThan(onLot(ENTRANCE.x1 + PORTAL.pillar, 0).x + 0.1);      // clear of the portal's east pillar
    expect(Math.max(...open)).toBeLessThan(onLot(GATE.x0, 0).x + 0.02);                              // the opening free
    slideGate(gate, travel, 0.5);
    const mid = xs(); expect(Math.min(...mid)).toBeGreaterThan(onLot(ENTRANCE.x1 + PORTAL.pillar, 0).x);
    slideGate(gate, travel, 0);
    expect(Array.from(pos.array as Float32Array)).toEqual(Array.from(before));
    expect(gate.position.x).toBeCloseTo(0, 9);
    // its box: as before, the opening's whole width while shut, through both panels
    const col = g.userData.gate as Collider;
    expect(col.x1 - col.x0).toBeCloseTo(GATE.x1 - GATE.x0, 5);
  });
});

describe('the street before the main entrance', () => {
  it('is kept open: no stall, cantine or parked car across the way in, at every quality', () => {
    for (const lite of [true, false]) for (const q of ['low', 'medium', 'high'] as const) {
      const hub = buildHub('almadies', lite), open = hub.keepClear?.find(k => k.why === 'villa_entrance');
      expect(open, `${q} ${lite}`).toBeDefined();
      expect(open!.x0).toBeLessThan(onLot(ENTRANCE.x0, 0).x); expect(open!.x1).toBeGreaterThan(onLot(ENTRANCE.x1, 0).x);
      expect(open!.z0).toBeCloseTo(onLot(0, ENTRANCE.z).z, 5); expect(open!.z1).toBeGreaterThan(-4.65 + 1);   // past the parked cars' line
      const before = hub.colliders.length, r = dressHub(hub, q);
      for (const c of hub.colliders.slice(before)) expect(!hits(c, open!), `${q} ${lite}: ${JSON.stringify(c)}`).toBe(true);
      expect(r.items.length).toBeGreaterThan(0);
      if (q === 'medium') {
        const cars = placeParked(hub, PARKED_COUNT.medium);
        for (const c of cars.children) { const b = new THREE.Box3().setFromObject(c); expect(b.max.x <= open!.x0 || b.min.x >= open!.x1 || b.max.z <= open!.z0 || b.min.z >= open!.z1, `${lite} car ${JSON.stringify(b)}`).toBe(true); }
      }
    }
  }, 60_000);
});
