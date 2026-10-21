import { describe, expect, it } from 'vitest';
import { clipLine, extractRoads, simplify, type OsmCollection } from './osmExtract';

const line = (id: string, highway: string, coords: number[][], name?: string) => ({ type: 'Feature' as const, id, properties: { highway, ...(name ? { name } : {}) }, geometry: { type: 'LineString', coordinates: coords } });

describe('simplify', () => {
  it('drops points within the tolerance of the line and keeps a corner', () => {
    const s = simplify([[-17.45, 14.7], [-17.4499, 14.70001], [-17.449, 14.7], [-17.449, 14.71]], 12);
    expect(s).toEqual([[-17.45, 14.7], [-17.449, 14.7], [-17.449, 14.71]]);
  });
  it('keeps the ends of a two-point line', () => { expect(simplify([[0, 0], [1, 1]], 12)).toEqual([[0, 0], [1, 1]]); });
});

describe('clipLine', () => {
  it('keeps what is inside the box, in as many pieces as the line enters it', () => {
    const b: [number, number, number, number] = [0, 0, 10, 10];
    expect(clipLine([[1, 1], [2, 2], [20, 20], [3, 3], [4, 4]], b)).toEqual([[[1, 1], [2, 2]], [[3, 3], [4, 4]]]);
    expect(clipLine([[50, 50], [60, 60]], b)).toEqual([]);
  });
});

describe('extractRoads', () => {
  const fc: OsmCollection = { type: 'FeatureCollection', features: [
    line('way/1', 'motorway', [[-17.43, 14.70], [-17.40, 14.72], [-17.39, 14.73]], 'Autoroute'),
    line('way/2', 'primary_link', [[-17.50, 14.74], [-17.49, 14.745]]),
    line('way/3', 'footway', [[-17.45, 14.70], [-17.4501, 14.7001]]),
    line('way/4', 'trunk', [[-10, 14.7], [-9.9, 14.7]], 'Hors carte'),
    { type: 'Feature', id: 'way/5', properties: { highway: 'primary' }, geometry: null },
  ] };
  const { layer, stats } = extractRoads(fc, { source: 'fixture' });
  it('keeps the main roads of the box, ranked, named and traceable to their OSM way', () => {
    expect(layer.roads.map(r => [r.id, r.rank, r.name])).toEqual([['w1', 'motorway', 'Autoroute'], ['w2', 'primary', '']]);
  });
  it('drops footpaths, ways outside the box and broken geometry, and counts them', () => {
    expect(stats).toMatchObject({ features: 5, kept: 2, dropped: { notRoad: 1, outside: 1, badGeometry: 1 } });
  });
  it('credits OpenStreetMap under the ODbL', () => {
    expect(layer.licence).toMatch(/ODbL/); expect(layer.licence).toMatch(/OpenStreetMap/); expect(layer.source).toBe('fixture');
  });
  it('rounds coordinates to about a metre', () => {
    for (const r of layer.roads) for (const p of r.pts) for (const c of p) expect(Math.abs(c * 1e5 - Math.round(c * 1e5))).toBeLessThan(1e-6);
  });
});
