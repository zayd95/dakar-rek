import { describe, expect, it } from 'vitest';
import { Ground, Spine, fillet, wrapAngle } from './network';
import { HYST, ROADS, ROAD_HALF, roadsOf } from './routes';

describe('fillet', () => {
  it('keeps the ends and rounds a corner into an arc that stays inside the corner', () => {
    const f = fillet([{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }], 30, 5);
    expect(f[0]).toEqual({ x: 0, z: 0 }); expect(f[f.length - 1]).toEqual({ x: 100, z: 100 });
    const arc = f.slice(1, -1);
    expect(arc.length).toBeGreaterThan(4);
    for (const p of arc) { expect(p.x).toBeLessThanOrEqual(100.0001); expect(p.z).toBeGreaterThanOrEqual(-0.0001); expect(Math.hypot(p.x - 70, p.z - 30)).toBeCloseTo(30, 4); }
  });
  it('turns the heading smoothly: no step above 20° between two segments', () => {
    const s = new Spine(fillet([{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 260, z: 200 }, { x: 100, z: 400 }], 120, 10));
    for (let i = 2; i < s.pts.length; i++) {
      const a = Math.atan2(s.pts[i - 1].x - s.pts[i - 2].x, s.pts[i - 1].z - s.pts[i - 2].z), b = Math.atan2(s.pts[i].x - s.pts[i - 1].x, s.pts[i].z - s.pts[i - 1].z);
      expect(Math.abs(wrapAngle(b - a))).toBeLessThan(0.35);
    }
  });
  it('a straight line is left alone', () => {
    expect(fillet([{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 100, z: 0 }], 30).length).toBe(3);
  });
});

describe('Spine', () => {
  const s = new Spine([{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: -100, z: 100 }]);
  it('measures the arc and gives position and heading', () => {
    expect(s.length).toBeCloseTo(200);
    expect(s.at(50)).toMatchObject({ x: 0, z: 50 }); expect(s.at(50).yaw).toBeCloseTo(0);
    expect(s.at(150).x).toBeCloseTo(-50); expect(s.at(150).yaw).toBeCloseTo(-Math.PI / 2);
    expect(s.at(-5).s).toBe(0); expect(s.at(999).s).toBeCloseTo(200);
  });
  it('projects a point with its side: left of the travel direction is positive', () => {
    const p = s.project(3, 40);                                   // heading south (+z): the left hand is east (+x)
    expect(p.s).toBeCloseTo(40); expect(p.d).toBeCloseTo(3);
    expect(s.project(-3, 40).d).toBeCloseTo(-3);
  });
  it('a hint gives the same answer as the whole search', () => {
    for (const [x, z] of [[1, 20], [-30, 98], [-90, 104], [5, 130]]) { const a = s.project(x, z), b = s.project(x, z, a.s); expect(b.s).toBeCloseTo(a.s); expect(b.d).toBeCloseTo(a.d); }
  });
});

describe('Ground', () => {
  const s = new Spine([{ x: 0, z: 0 }, { x: 0, z: 100 }]);
  const g = new Ground(s, 10, [{ a: { x: 0, z: 50 }, b: { x: 40, z: 50 }, half: 5 }]);
  it('is the road, the arms, and nothing else; a wide body needs more room', () => {
    expect(g.contains(8, 30)).toBe(true); expect(g.contains(11, 30)).toBe(false);
    expect(g.contains(8, 30, 3)).toBe(false);
    expect(g.contains(30, 50)).toBe(true); expect(g.contains(30, 58)).toBe(false);
  });
});

describe('the roads of the game', () => {
  for (const road of ROADS) describe(road.id, () => {
    const { def, spine } = road;
    it('has a believable length (the condensed scale: roughly 1 : 9 of the real alignment)', () => {
      expect(spine.length).toBeGreaterThan(900); expect(spine.length).toBeLessThan(1800);
    });
    it('leaves a and enters b facing the same way (the district swap is a translation only)', () => {
      const a = spine.at(0), b = spine.at(spine.length);
      expect(Math.abs(wrapAngle(a.yaw - def.aMouth.yaw))).toBeLessThan(0.01);
      expect(Math.abs(wrapAngle(b.yaw - def.bMouth.yaw))).toBeLessThan(0.01);
      expect(Math.abs(wrapAngle(a.yaw - b.yaw))).toBeLessThan(0.01);
    });
    it('starts at a\'s mouth and ends at b\'s once b\'s frame is applied', () => {
      expect(spine.pts[0].x).toBeCloseTo(def.aMouth.x); expect(spine.pts[0].z).toBeCloseTo(def.aMouth.z);
      const e = spine.at(spine.length);
      expect(e.x + road.dx).toBeCloseTo(def.bMouth.x); expect(e.z + road.dz).toBeCloseTo(def.bMouth.z);
    });
    it('swaps far enough from both districts to be out of sight (fog ends at 300 m) and with room for the hysteresis', () => {
      expect(road.swapS).toBeGreaterThan(330 + HYST); expect(spine.length - road.swapS).toBeGreaterThan(330 + HYST);
    });
    it('has bends gentle enough to drive (heading changes under 20° per segment)', () => {
      for (let i = 2; i < spine.pts.length; i++) {
        const a = Math.atan2(spine.pts[i - 1].x - spine.pts[i - 2].x, spine.pts[i - 1].z - spine.pts[i - 2].z), b = Math.atan2(spine.pts[i].x - spine.pts[i - 1].x, spine.pts[i].z - spine.pts[i - 1].z);
        expect(Math.abs(wrapAngle(b - a))).toBeLessThan(0.35);
      }
    });
    it('keeps its anchors in order along the road and its junctions on it', () => {
      for (let i = 1; i < road.anchorS.length; i++) expect(road.anchorS[i].s).toBeGreaterThan(road.anchorS[i - 1].s);
      for (const j of road.junctionS) { expect(road.ground.contains(j.x, j.z, ROAD_HALF)).toBe(true); for (const m of j.arms) expect(road.ground.contains((m.a.x + m.b.x) / 2, (m.a.z + m.b.z) / 2)).toBe(true); }
    });
    it('is drivable end to end: the centre line is ground at every metre', () => {
      for (let s = 0; s <= spine.length; s += 1) { const p = spine.at(s); expect(road.ground.contains(p.x, p.z, 2)).toBe(true); }
    });
  });
  it('a district knows its roads: no district is the only hub, Plateau has two (north and west), the Corniche one (east)', () => {
    expect(roadsOf('pikine').map(r => r.id).sort()).toEqual(['pikine-almadies', 'pikine-plateau']);
    expect(roadsOf('almadies').map(r => r.id)).toEqual(['pikine-almadies']);                       // and its border street to the Corniche (src/transport/hubLink.ts)
    expect(roadsOf('corniche').map(r => r.id)).toEqual(['corniche-plateau']);
    expect(roadsOf('plateau').map(r => r.id).sort()).toEqual(['corniche-plateau', 'pikine-plateau']);
  });
});
