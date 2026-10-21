import { describe, expect, it } from 'vitest';
import { HUB_ANCHORS, HUB_SCALE, ROAD_SCALE, gameToLngLat, hubToLngLat, lngLatToGame, lngLatToHub, lngLatToRoad, roadAnchors, roadToLngLat } from './anchors';
import { ROADS } from '../road/routes';

const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111320);

describe('districts', () => {
  it('the centre of a district is its anchor', () => {
    for (const id of Object.keys(HUB_ANCHORS) as (keyof typeof HUB_ANCHORS)[]) expect(hubToLngLat(id, 0, 0)).toEqual(HUB_ANCHORS[id].lngLat);
  });
  it('is condensed by HUB_SCALE: 100 game metres east are 500 real metres east, and north is up (z south)', () => {
    const o = hubToLngLat('pikine', 0, 0), e = hubToLngLat('pikine', 100, 0), n = hubToLngLat('pikine', 0, -100);
    expect(metres(o, e)).toBeCloseTo(100 * HUB_SCALE, 0); expect(e[0]).toBeGreaterThan(o[0]); expect(e[1]).toBeCloseTo(o[1], 6);
    expect(metres(o, n)).toBeCloseTo(100 * HUB_SCALE, 0); expect(n[1]).toBeGreaterThan(o[1]);
  });
  it('round-trips', () => {
    for (const [x, z] of [[0, 0], [-120, 60], [99.5, -127], [3, 3]]) { const p = lngLatToHub('almadies', hubToLngLat('almadies', x, z)); expect(p.x).toBeCloseTo(x, 6); expect(p.z).toBeCloseTo(z, 6); }
  });
  it('keeps the real arrangement of the districts: Almadies is west of Pikine and Plateau is south of both', () => {
    const [p, a, pl] = [HUB_ANCHORS.pikine.lngLat, HUB_ANCHORS.almadies.lngLat, HUB_ANCHORS.plateau.lngLat];
    expect(a[0]).toBeLessThan(p[0]); expect(pl[1]).toBeLessThan(p[1]); expect(pl[1]).toBeLessThan(a[1]);
  });
});

describe('roads', () => {
  for (const road of ROADS) describe(road.id, () => {
    const an = roadAnchors(road);
    it('starts and ends where the districts it joins say (the mouths on their own maps)', () => {
      const s = roadToLngLat(road, 0).lngLat, e = roadToLngLat(road, road.length).lngLat;
      expect(metres(s, hubToLngLat(road.def.a, road.def.aMouth.x, road.def.aMouth.z))).toBeLessThan(1);
      expect(metres(e, hubToLngLat(road.def.b, road.def.bMouth.x, road.def.bMouth.z))).toBeLessThan(1);
    });
    it('passes through its anchors, in order, and its real length is about ROAD_SCALE times its game length', () => {
      let real = 0;
      for (let i = 1; i < an.length; i++) { real += metres(an[i].lngLat, an[i - 1].lngLat); expect(roadToLngLat(road, an[i].s).lngLat[0]).toBeCloseTo(an[i].lngLat[0], 8); }
      expect(real / road.length).toBeGreaterThan(ROAD_SCALE * 0.7); expect(real / road.length).toBeLessThan(ROAD_SCALE * 1.4);
    });
    it('round-trips along its centre line', () => {
      for (let s = 0; s <= road.length; s += road.length / 10) { const back = lngLatToRoad(road, roadToLngLat(road, s).lngLat); expect(back.s).toBeCloseTo(s, 0); expect(back.metres).toBeLessThan(0.5); }
    });
    it('puts the left of the road on the left of the map line', () => {
      const c = roadToLngLat(road, 300), l = roadToLngLat(road, 300, 5);
      const cross = Math.sin(c.bearing) * (l.lngLat[1] - c.lngLat[1]) - Math.cos(c.bearing) * (l.lngLat[0] - c.lngLat[0]);
      expect(cross).toBeGreaterThan(0);                                   // counter-clockwise of the heading: its left, seen with north up
    });
  });
  it('a position of the game on the Pikine → Almadies road is on the map, in Pikine\'s frame and in Almadies\'s', () => {
    const road = ROADS[0], at = road.spine.at(400), off = road.offset('almadies');
    const a = gameToLngLat('pikine', at.x, at.z), b = gameToLngLat('almadies', at.x + off.x, at.z + off.z);
    expect(a.kind).toBe('road'); expect(b.kind).toBe('road');
    expect(metres(a.lngLat, b.lngLat)).toBeLessThan(0.5);                // the same place of the map whichever district's frame it is read in
  });
  it('inside a district it is the district\'s own mapping', () => {
    const w = gameToLngLat('pikine', -50, 20); expect(w.kind).toBe('hub'); expect(w.lngLat).toEqual(hubToLngLat('pikine', -50, 20));
  });
  it('a place of the map is found back in the game: near a district, or along a road', () => {
    const g = lngLatToGame(hubToLngLat('pikine', 30, -40))!; expect(g.hub).toBe('pikine'); expect(g.x).toBeCloseTo(30, 4);
    const mid = roadToLngLat(ROADS[0], 750).lngLat, r = lngLatToGame(mid)!; expect(r.road?.id).toBe('pikine-almadies'); expect(r.s).toBeCloseTo(750, 0);
    expect(lngLatToGame([-17.0, 15.2])).toBeNull();
  });
});
