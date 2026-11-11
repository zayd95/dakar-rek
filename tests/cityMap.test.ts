import { describe, expect, it } from 'vitest';
import { CITY_FIT_PAD, HUB_ANCHORS, HUB_SCALE, cityBounds, hubFootprint, hubToLngLat, inFootprint, linkLineFrom, lngLatToHub, mapLinks } from '../src/geo/anchors';
import { HUB_IDS, type HubId } from '../src/core/types';
import { HUB_NAMES } from '../src/world/content';
import { CITY_HUBS, EDGES, planTrip } from '../src/road/graph';
import { ROADS, type LngLat } from '../src/road/routes';
import { LINKS } from '../src/transport/hubLink';
import { declutter } from '../src/ui/minimapMath';

/**
 * The city view of the phone's map (src/ui/geoMap.ts draws what src/geo/anchors.ts says): the five districts stand apart, each where it lies, each with its name,
 * and the ways drawn between them are the ways the game has, no more and no fewer, none running across a district.
 */
const metres = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111320);
const box = (hub: HubId) => { const r = hubFootprint(hub); return { w: Math.min(...r.map(p => p[0])), e: Math.max(...r.map(p => p[0])), s: Math.min(...r.map(p => p[1])), n: Math.max(...r.map(p => p[1])) }; };
/** A line with a point at least every 40 real metres. */
const dense = (line: LngLat[]) => line.flatMap((p, i) => { if (!i) return [p]; const q = line[i - 1], n = Math.max(1, Math.ceil(metres(q, p) / 40)); return Array.from({ length: n }, (_, k) => [q[0] + ((p[0] - q[0]) * (k + 1)) / n, q[1] + ((p[1] - q[1]) * (k + 1)) / n] as LngLat); });

describe('the five districts on the city view', () => {
  it('every district of the game is on it, with its name, and nothing else is playable', () => {
    expect(Object.keys(HUB_ANCHORS).sort()).toEqual([...HUB_IDS].sort());
    expect(HUB_IDS).toHaveLength(5); expect(HUB_IDS).toContain('mermoz');
    expect(CITY_HUBS.filter(h => h.status === 'playable').map(h => h.id).sort()).toEqual([...HUB_IDS].sort());
    for (const id of HUB_IDS) { expect(HUB_ANCHORS[id].hub).toBe(id); expect(HUB_NAMES[id].split(' · ')[0].length).toBeGreaterThan(3); }
  });
  it('stand apart: no two rectangles touch, the nearest two are more than a kilometre apart', () => {
    for (const a of HUB_IDS) for (const b of HUB_IDS) {
      if (a >= b) continue;
      const A = box(a), B = box(b);
      // the gap between the two rectangles, east-west and north-south, in real metres (negative: they overlap on that axis)
      const gx = Math.max(B.w - A.e, A.w - B.e) * 111320 * Math.cos((A.s * Math.PI) / 180), gy = Math.max(B.s - A.n, A.s - B.n) * 111320;
      expect(Math.max(gx, gy), `${a} / ${b}`).toBeGreaterThan(1000);
    }
  });
  it('each is a square of its streets around its anchor, and its name stands on its own top edge, inside no other district', () => {
    for (const id of HUB_IDS) {
      const r = hubFootprint(id), half = HUB_ANCHORS[id].half;
      expect(r).toHaveLength(5); expect(r[0]).toEqual(r[4]);
      expect(metres(r[0], r[1])).toBeCloseTo(2 * half * HUB_SCALE, 0); expect(metres(r[1], r[2])).toBeCloseTo(2 * half * HUB_SCALE, 0);
      const label = hubToLngLat(id, 0, -half), at = lngLatToHub(id, label);
      expect(at.x).toBeCloseTo(0, 6); expect(at.z).toBeCloseTo(-half, 6);              // on the middle of its north edge
      for (const other of HUB_IDS) if (other !== id) { expect(inFootprint(other, label)).toBe(false); expect(inFootprint(other, HUB_ANCHORS[id].lngLat)).toBe(false); }
    }
  });
  it('lie as the real quarters do: the Plateau at the southern tip, the Corniche north-west of it, Mermoz north of the Corniche, the Almadies at the north-west point, Pikine far east', () => {
    const at = (h: HubId) => HUB_ANCHORS[h].lngLat;
    for (const h of HUB_IDS) if (h !== 'plateau') expect(at(h)[1], h).toBeGreaterThan(at('plateau')[1]);
    expect(at('corniche')[0]).toBeLessThan(at('plateau')[0]);
    expect(at('mermoz')[1]).toBeGreaterThan(at('corniche')[1]); expect(at('mermoz')[1]).toBeLessThan(at('almadies')[1]);
    for (const h of HUB_IDS) if (h !== 'almadies') expect(at(h)[0], h).toBeGreaterThan(at('almadies')[0]);
    for (const h of HUB_IDS) if (h !== 'pikine') expect(at(h)[0], h).toBeLessThan(at('pikine')[0]);
  });
  it('the view of the whole city holds every rectangle', () => {
    const [sw, ne] = cityBounds();
    for (const id of HUB_IDS) for (const p of hubFootprint(id)) { expect(p[0]).toBeGreaterThanOrEqual(sw[0]); expect(p[0]).toBeLessThanOrEqual(ne[0]); expect(p[1]).toBeGreaterThanOrEqual(sw[1]); expect(p[1]).toBeLessThanOrEqual(ne[1]); }
  });
  it('on a phone (the map is 358 × 422 px in portrait) the five names are all drawn when the map opens on the whole city: none covers another', () => {
    const [sw, ne] = cityBounds(), W = 358, H = 422, pad = CITY_FIT_PAD, lat = (sw[1] + ne[1]) / 2, mx = 111320 * Math.cos((lat * Math.PI) / 180), my = 111320;
    // metres per pixel of the fit (the tighter of the two axes), then each name's box: on the top edge of its rectangle, 3 px above it (src/ui/geoMap.ts labels)
    const mpp = Math.max(((ne[0] - sw[0]) * mx) / (W - pad.left - pad.right), ((ne[1] - sw[1]) * my) / (H - pad.top - pad.bottom));
    const boxes = HUB_IDS.map(id => {
      const p = hubToLngLat(id, 0, -HUB_ANCHORS[id].half), w = 34 + 7 * HUB_NAMES[id].split(' · ')[0].length;     // the pill: 12 px bold, its dot and padding (64 to 83 px measured in the game)
      return { x: ((p[0] - sw[0]) * mx) / mpp, y: ((ne[1] - p[1]) * my) / mpp - 13, w, h: 20, rank: 100 };
    });
    expect(declutter(boxes, 4)).toEqual([true, true, true, true, true]);
    // and each rectangle is big enough to see (a finger's nail) and smaller than the gap to its nearest neighbour
    expect((2 * 127 * HUB_SCALE) / mpp).toBeGreaterThan(18);
  });
});

describe('the ways between districts on the city view', () => {
  const links = mapLinks();
  it('are exactly the ways of the game: its four roads and the border street, as the road graph has them', () => {
    expect(links.map(l => l.id).sort()).toEqual(EDGES.map(e => e.id).sort());
    expect(links.filter(l => l.kind === 'corridor').map(l => l.id)).toEqual(ROADS.map(r => r.id));
    expect(links.filter(l => l.kind === 'corridor').map(l => [l.a, l.b].join('–')).sort()).toEqual(['corniche–mermoz', 'corniche–plateau', 'pikine–almadies', 'pikine–plateau']);
    expect(links.filter(l => l.kind === 'border').map(l => [l.a, l.b].join('–'))).toEqual(['almadies–corniche']);
    for (const l of links) { const e = EDGES.find(x => x.id === l.id)!; expect([l.a, l.b].sort()).toEqual([e.a, e.b].sort()); expect(l.road).toBe(e.road); }
    // every pair the game lets a driver cross is drawn, every pair drawn can be crossed
    for (const k of LINKS) expect(links.some(l => l.kind === 'border' && [l.a, l.b].includes(k.from) && [l.a, l.b].includes(k.to))).toBe(true);
  });
  it('each starts on the edge of the district it leaves and ends on the edge of the one it enters', () => {
    for (const l of links) {
      const a = lngLatToHub(l.a, l.line[0]), b = lngLatToHub(l.b, l.line[l.line.length - 1]);
      for (const p of [a, b]) { const edge = Math.max(Math.abs(p.x), Math.abs(p.z)); expect(edge, l.id).toBeGreaterThan(118); expect(edge, l.id).toBeLessThan(128); }
    }
  });
  it('none runs across a district: not the two it joins (it leaves by the edge and stays out), not a third on the way', () => {
    for (const l of links) for (const p of dense(l.line)) for (const h of HUB_IDS) expect(inFootprint(h, p, 12), `${l.id} inside ${h} at ${p.map(v => v.toFixed(4))}`).toBe(false);
  });
  it('a road is drawn at a believable real length, and the card’s « en vrai » is that length', () => {
    for (const l of links) {
      expect(l.realMetres).toBeGreaterThan(1500); expect(l.realMetres).toBeLessThan(16000);
      if (l.road) { const scale = l.road.def.condensed ?? 9; expect(l.realMetres / l.road.length).toBeGreaterThan(scale * 0.7); expect(l.realMetres / l.road.length).toBeLessThan(scale * 1.4); }
    }
  });
  it('a trip’s line follows them in the direction driven, through the districts in between', () => {
    const plan = planTrip('mermoz', 'almadies')!;
    expect(plan.hubs).toEqual(['mermoz', 'corniche', 'almadies']);
    let at: LngLat | null = null;
    for (const leg of plan.legs) {
      const link = links.find(k => k.id === leg.edge.id)!, line = linkLineFrom(link, leg.from);
      expect(inFootprint(leg.from, line[0], -8)).toBe(true); expect(inFootprint(leg.to, line[line.length - 1], -8)).toBe(true);   // from the district left to the district entered
      if (at) expect(metres(at, line[0])).toBeLessThan(2 * 127 * HUB_SCALE * 1.5);                                                  // the next leg starts in the district the last one ended in
      at = line[line.length - 1];
    }
  });
});

describe('names that do not cover each other', () => {
  const b = (x: number, y: number, rank: number, w = 60, h = 20) => ({ x, y, w, h, rank });
  it('keeps the one that matters more, whatever the order they come in', () => {
    expect(declutter([b(0, 0, 10), b(30, 5, 100)])).toEqual([false, true]);
    expect(declutter([b(30, 5, 100), b(0, 0, 10)])).toEqual([true, false]);
  });
  it('keeps both when they are apart, and the first of two equals', () => {
    expect(declutter([b(0, 0, 1), b(70, 0, 1)])).toEqual([true, true]);
    expect(declutter([b(0, 0, 1), b(0, 30, 1)])).toEqual([true, true]);
    expect(declutter([b(0, 0, 1), b(10, 0, 1)])).toEqual([true, false]);
  });
  it('a hidden label hides nothing: only those drawn take room', () => {
    // the middle one loses to the first; the third, which only touched the middle one, is drawn
    expect(declutter([b(0, 0, 3), b(50, 0, 2), b(100, 0, 1)])).toEqual([true, false, true]);
  });
  it('leaves `gap` pixels between two names', () => {
    expect(declutter([b(0, 0, 1), b(62, 0, 1)], 3)).toEqual([true, false]);
    expect(declutter([b(0, 0, 1), b(62, 0, 1)], 0)).toEqual([true, true]);
  });
});
