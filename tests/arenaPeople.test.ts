import { describe, it, expect } from 'vitest';
import {
  DRUM_PROPS, PEOPLE, PEOPLE_COUNT, PRESENT, STAND_VENDORS, cornerSpot, drumSpots, entouragePath, peopleMoment, polar, walkArc,
} from '../src/arena/people';
import { VENDORS } from '../src/arena/exteriorRules';
import { RING_R, PARAPET_R, WALL_R, inGate } from '../src/world/geew';
import type { ShowPhase } from '../src/arena/program';
import type { ActivitySpec } from '../src/activity/types';

const C = { x: 100, z: -40 };
const r = (p: { x: number; z: number }) => Math.hypot(p.x - C.x, p.z - C.z);
const ang = (p: { x: number; z: number }) => Math.atan2(p.x - C.x, p.z - C.z);

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
    for (const list of Object.values(PRESENT)) expect(list).not.toContain('closed');                       // nobody on a quiet evening
  });
  it('more people with the graphics quality, never fewer', () => {
    for (const k of ['judges', 'officials', 'drummers', 'vendors', 'entourage'] as const) {
      expect(PEOPLE_COUNT.low[k]).toBeLessThanOrEqual(PEOPLE_COUNT.medium[k]); expect(PEOPLE_COUNT.medium[k]).toBeLessThanOrEqual(PEOPLE_COUNT.high[k]);
    }
    expect(PEOPLE_COUNT.high.judges).toBeLessThanOrEqual(PEOPLE.judges.angles.length);
    expect(PEOPLE_COUNT.high.officials).toBeLessThanOrEqual(PEOPLE.table.chairs.length);
    expect(PEOPLE_COUNT.high.drummers).toBeLessThanOrEqual(drumSpots(C.x, C.z).length);
  });
});

describe('fight night people: where they stand', () => {
  it('the drummers stand together between the ring and the barriers, clear of the gate and the tunnel', () => {
    const spots = drumSpots(C.x, C.z);
    expect(DRUM_PROPS).toBe(true);
    for (const s of spots) {
      expect(r(s)).toBeGreaterThan(RING_R + 3); expect(r(s)).toBeLessThan(16.4);
      expect(inGate(ang(s), 0.5)).toBe(false); expect(Math.abs(s.x - C.x)).toBeGreaterThan(2.5);            // the tunnel's passage is |x| < 2.3
      expect(Math.cos(s.yaw - Math.atan2(C.x - s.x, C.z - s.z))).toBeGreaterThan(0.9);                        // facing the ring
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(0.7);
  });
  it('each entourage walks in from the public gate round the ring side to its own corner, never across the sandbags', () => {
    for (const side of [1, -1] as const) for (let k = 0; k < PEOPLE_COUNT.high.entourage; k++) {
      const path = entouragePath(C.x, C.z, side, k);
      expect(path).toHaveLength(4);
      expect(inGate(ang(path[0]), 0.35)).toBe(true); expect(r(path[0])).toBeGreaterThan(WALL_R - 2.5);
      for (const p of path.slice(1)) { expect(r(p)).toBeGreaterThan(10.8); expect(r(p)).toBeLessThan(16.4); expect(Math.sign(p.x - C.x)).toBe(side); }
      const c = path[3]; expect(c).toEqual(cornerSpot(C.x, C.z, side, k));
    }
    // the people of a corner stand apart from each other
    const spots = [0, 1, 2, 3].map(k => cornerSpot(C.x, C.z, 1, k));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(0.6);
  });
  it('vendors walk to and fro along the walkway in front of the parapet, never into the gate or the tunnel', () => {
    for (const arc of PEOPLE.walk.arcs) {
      let s = { a: (arc[0] + arc[1]) / 2, dir: 1 as 1 | -1 }, flips = 0;
      for (let t = 0; t < 120; t += 0.1) {
        const n = walkArc(s.a, s.dir, arc, 0.1); if (n.dir !== s.dir) flips++; s = n;
        expect(s.a).toBeGreaterThanOrEqual(Math.min(...arc) - 1e-9); expect(s.a).toBeLessThanOrEqual(Math.max(...arc) + 1e-9);
        expect(inGate(s.a, 0.4)).toBe(false); expect(Math.abs(s.a)).toBeGreaterThan(0.5);
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
