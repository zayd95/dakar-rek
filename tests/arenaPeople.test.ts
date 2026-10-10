import { describe, it, expect } from 'vitest';
import {
  PEOPLE, PEOPLE_COUNT, PRESENT, STAND_VENDORS, campSpot, celebratePath, cornerSpot, cornerSpots, drummerSpots, entouragePath, peopleMoment, polar, walkArc,
} from '../src/arena/people';
import { ECURIES, VENDORS } from '../src/arena/exteriorRules';
import { RING_R, PARAPET_R, WALL_R, TUNNEL_MOUTH_R, inGate, inTunnel } from '../src/world/geew';
import { ARENA_FLOOR, PREP_SIDE, drummersStand, interiorSpots, mediaZone, prepCorner, prepCornerCentre, tunnel, type ArenaKit } from '../src/world/arenaModules';
import { Batch } from '../src/world/batch';
import { SHOW, type ShowPhase } from '../src/arena/program';
import type { ActivitySpec } from '../src/activity/types';

const C = { x: 100, z: -40 };
const r = (p: { x: number; z: number }) => Math.hypot(p.x - C.x, p.z - C.z);
const ang = (p: { x: number; z: number }) => Math.atan2(p.x - C.x, p.z - C.z);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** Distance from p to the segment ab. */
const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
};

// the structure around them, with its colliders (src/world/arenaModules.ts)
const cols: { x0: number; z0: number; x1: number; z1: number }[] = [];
const kit: ArenaKit = {
  plain: new Batch(), concrete: new Batch(), base: ARENA_FLOOR, lite: false,
  solid: (x, z, w, d) => cols.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 }),
  sign: () => {}, climb: () => {},
};
tunnel(kit, C.x, C.z); mediaZone(kit, C.x, C.z); const deck = drummersStand(kit, C.x, C.z);
/** Each écurie's corner, on the side PREP_SIDE gives it (src/world/arenaModules.ts: the one place that sets it). */
const SIDES = ECURIES.map(e => ({ side: PREP_SIDE[e.id], colour: e.colour }));
for (const e of SIDES) prepCorner(kit, C.x, C.z, e.side, e.colour);
const hit = (p: { x: number; z: number }) => cols.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);

describe('fight night people: who is there when', () => {
  it('the moment follows the show, else the street', () => {
    expect(peopleMoment('idle', 'quiet')).toBe('closed');
    expect(peopleMoment('idle', 'setup')).toBe('setup');
    expect(peopleMoment('idle', 'doors')).toBe('doors');
    expect(peopleMoment('over', 'after')).toBe('closed');
    for (const p of ['filling', 'entrance', 'bout', 'result', 'leaving'] as ShowPhase[]) expect(peopleMoment(p, 'doors')).toBe(p);
  });
  it('the officials are there from the set-up, the judges for the show, the referee until the duel brings its own', () => {
    expect(PRESENT.officials).toContain('setup'); expect(PRESENT.judges).toEqual(['filling', 'entrance', 'bout', 'result']);
    expect(PRESENT.referee).not.toContain('bout'); expect(PRESENT.referee).not.toContain('result');
    expect(PRESENT.warmup).toContain('doors'); expect(PRESENT.drummers).not.toContain('doors');            // two drummers warm up first
    expect(PRESENT.entourage).toEqual(['entrance', 'bout', 'result', 'leaving']);                          // they come in with their wrestler
    expect(PRESENT.camp).toContain('doors');                                                               // a helper readies each corner
    for (const list of Object.values(PRESENT)) expect(list).not.toContain('closed');                       // nobody on a quiet evening
  });
  it('more people with the graphics quality, never fewer, within the places the structure has', () => {
    for (const k of Object.keys(PEOPLE_COUNT.low) as (keyof typeof PEOPLE_COUNT.low)[]) {
      expect(PEOPLE_COUNT.low[k]).toBeLessThanOrEqual(PEOPLE_COUNT.medium[k]); expect(PEOPLE_COUNT.medium[k]).toBeLessThanOrEqual(PEOPLE_COUNT.high[k]);
    }
    const spots = interiorSpots(C.x, C.z), n = (role: string) => spots.filter(s => s.role === role).length;
    expect(PEOPLE_COUNT.high.judges).toBeLessThanOrEqual(PEOPLE.judges.angles.length);
    expect(PEOPLE_COUNT.high.officials).toBeLessThanOrEqual(n('official'));
    expect(PEOPLE_COUNT.high.press).toBeLessThanOrEqual(n('press')); expect(PEOPLE_COUNT.high.media).toBeLessThanOrEqual(n('media'));
    expect(PEOPLE_COUNT.high.drummers).toBeLessThanOrEqual(drummerSpots(C.x, C.z).length);
    expect(PEOPLE_COUNT.high.entourage).toBeLessThanOrEqual(4);
    // on medium, the judges' chair on the wrestlers' runner (angle 0) stays empty
    expect(PEOPLE.judges.angles.slice(0, PEOPLE_COUNT.medium.judges).some(a => inTunnel(a, 0.2))).toBe(false);
  });
});

describe('fight night people: where they stand', () => {
  it('the drummers play on their deck, their dancers on the sand in front, all facing the ring', () => {
    const spots = drummerSpots(C.x, C.z);
    const onDeck = spots.filter(s => s.clip === 'Talk');
    expect(onDeck).toHaveLength(deck.length);
    for (const s of onDeck) expect(deck.some(d => dist(d, s) < 1e-6 && Math.abs(d.y - s.y) < 1e-6)).toBe(true);
    expect(spots.slice(0, 2).every(s => s.clip === 'Talk')).toBe(true);                                  // the two who warm up drum
    for (const s of spots) {
      expect(Math.cos(s.yaw - Math.atan2(C.x - s.x, C.z - s.z))).toBeGreaterThan(0.9);
      expect(inTunnel(ang(s), 0.2)).toBe(false); expect(r(s)).toBeGreaterThan(RING_R + 3);
    }
    for (const s of spots.filter(s => s.clip !== 'Talk')) { expect(hit(s)).toBe(false); expect(s.y).toBe(ARENA_FLOOR); }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(dist(spots[i], spots[j])).toBeGreaterThan(0.7);
  });
  it('each entourage walks out of the tunnel to its own corner, round the deck and its dancers, clear of every prop', () => {
    const dancers = drummerSpots(C.x, C.z).filter(s => s.clip !== 'Talk');
    for (const { side } of SIDES) for (let k = 0; k < PEOPLE_COUNT.high.entourage; k++) {
      const path = entouragePath(C.x, C.z, side, k);
      expect(path).toHaveLength(5);
      expect(inTunnel(ang(path[0]), 0.12)).toBe(true); expect(r(path[0])).toBeGreaterThan(TUNNEL_MOUTH_R + 2); expect(r(path[0])).toBeLessThan(WALL_R);
      expect(path[4]).toEqual(cornerSpot(C.x, C.z, side, k));
      for (const p of path.slice(1)) { expect(r(p)).toBeGreaterThan(10.8); expect(r(p)).toBeLessThan(16.4); expect(Math.sign(p.x - C.x)).toBe(side); }
      for (let i = 0; i + 1 < path.length; i++) for (let t = 0; t <= 1; t += 0.05) {
        const p = { x: path[i].x + (path[i + 1].x - path[i].x) * t, z: path[i].z + (path[i + 1].z - path[i].z) * t };
        expect(hit(p), `side ${side} k ${k} leg ${i}`).toBe(false);
      }
      for (const d of dancers) for (let i = 1; i + 1 < path.length; i++) expect(segDist(d, path[i], path[i + 1])).toBeGreaterThan(1.0);
    }
  });
  it('each écurie\'s people stand in its corner, on the mat round its centre (where a fighting player waits), apart, facing the ring', () => {
    expect(new Set(SIDES.map(e => e.side))).toEqual(new Set([1, -1]));
    for (const { side } of SIDES) {
      const spots = cornerSpots(C.x, C.z, side), centre = prepCornerCentre(C.x, C.z, side);
      for (const p of spots) {
        expect(hit(p)).toBe(false); expect(Math.sign(p.x - C.x)).toBe(side);
        expect(dist(p, centre)).toBeLessThan(1.4); expect(dist(p, centre)).toBeGreaterThan(0.55);          // round the player, not on them
        expect(Math.cos(p.yaw - Math.atan2(C.x - p.x, C.z - p.z))).toBeGreaterThan(0.99);
      }
      for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) expect(dist(spots[a], spots[b])).toBeGreaterThan(0.6);
    }
  });
  it('in the corner nobody walks through another: those who arrive first go furthest', () => {
    for (const { side } of SIDES) {
      const ks = [0, 1, 2, 3];
      // the order they leave the tunnel (nearest the mouth first) and how far their spot is from the corner's open side
      const lead = (k: number) => r(entouragePath(C.x, C.z, side, k)[0]);
      const depth = (k: number) => dist(entouragePath(C.x, C.z, side, k)[3], cornerSpot(C.x, C.z, side, k));
      const front = ks.filter(k => k !== 3).sort((a, b) => lead(a) - lead(b));                         // the front row
      for (let i = 1; i < front.length; i++) expect(depth(front[i])).toBeLessThan(depth(front[i - 1]));
      // the corner helper's place is apart from all of them
      for (const k of ks) expect(dist(campSpot(C.x, C.z, side), cornerSpot(C.x, C.z, side, k))).toBeGreaterThan(0.6);
    }
  });
  it('the winner\'s people run onto the sand through the gap by the tunnel, not over the judges', () => {
    const judges = PEOPLE.judges.angles.map(a => polar(C.x, C.z, a, PEOPLE.judges.r));
    for (const { side } of SIDES) for (let k = 0; k < 4; k++) {
      const path = celebratePath(C.x, C.z, side, k), end = path[path.length - 1];
      expect(r(end)).toBeLessThan(RING_R - 4);
      for (const j of judges) for (let i = 0; i + 1 < path.length; i++) expect(segDist(j, path[i], path[i + 1])).toBeGreaterThan(1.0);
      expect(dist(path[0], entouragePath(C.x, C.z, side, k)[3])).toBeLessThan(1e-9);                    // out of the corner by its open side
      // running (4.5 m/s) they are there well before the result's end
      let len = dist(cornerSpot(C.x, C.z, side, k), path[0]);
      for (let i = 0; i + 1 < path.length; i++) len += dist(path[i], path[i + 1]);
      expect(len / 4.5).toBeLessThan(SHOW.result - 1.5);
    }
  });
  it('vendors walk to and fro along the walkway in front of the parapet, never into the gate or the tunnel', () => {
    for (const arc of PEOPLE.walk.arcs) {
      let s = { a: (arc[0] + arc[1]) / 2, dir: 1 as 1 | -1 }, flips = 0;
      for (let t = 0; t < 120; t += 0.1) {
        const n = walkArc(s.a, s.dir, arc, 0.1); if (n.dir !== s.dir) flips++; s = n;
        expect(s.a).toBeGreaterThanOrEqual(Math.min(...arc) - 1e-9); expect(s.a).toBeLessThanOrEqual(Math.max(...arc) + 1e-9);
        expect(inGate(s.a, 0.4)).toBe(false); expect(inTunnel(s.a, 0.5)).toBe(false);
        expect(hit(polar(C.x, C.z, s.a, PEOPLE.walk.r))).toBe(false);
      }
      expect(flips).toBeGreaterThanOrEqual(2);                                                           // they turn back at both ends
    }
    expect(PEOPLE.walk.r).toBeGreaterThan(16.4); expect(PEOPLE.walk.r).toBeLessThan(PARAPET_R);
    const p = polar(C.x, C.z, Math.PI / 2, 10); expect(p.x).toBeCloseTo(C.x + 10); expect(p.z).toBeCloseTo(C.z);
  });
  it('the vendors inside sell at the prices of the stalls outside', () => {
    const outside = new Map(VENDORS.flatMap(v => v.offers()).map((o: ActivitySpec) => [o.id, o.price]));
    for (const v of STAND_VENDORS) for (const o of v.offers(v.seller)) expect(o.price).toBe(outside.get(o.id));
  });
});
