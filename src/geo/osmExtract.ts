import type { LngLat } from '../road/routes';
import type { RoadLayer, RoadLine } from './dakarData';

/**
 * The extraction of Dakar's roads from OpenStreetMap data (the pure part: scripts/geo/extract-osm.ts reads the file, writes the layer and the provenance record).
 *
 * Input: a GeoJSON FeatureCollection of highway ways, as written by `osmium export` from a Geofabrik extract (or by Overpass with `out geom` converted by osmtogeojson). Output: the
 * `RoadLayer` the city map draws (src/geo/dakarData.ts) with only the main roads, clipped to Dakar's box, each simplified to a tolerance that is invisible at the map's zoom. The point
 * is to keep the client's data small: the whole of Senegal and the Gambia is about 600 MB of PBF and never ships; the roads of Dakar's peninsula that matter here are a few tens of KB.
 */
export interface OsmFeature { type: 'Feature'; id?: string | number; properties?: Record<string, unknown> | null; geometry: { type: string; coordinates: unknown } | null }
export interface OsmCollection { type: 'FeatureCollection'; features: OsmFeature[] }

/** [west, south, east, north] */
export type Bbox = [number, number, number, number];
/** The box of the map: the Cap-Vert peninsula from the Almadies to Rufisque. */
export const DAKAR_BBOX: Bbox = [-17.60, 14.58, -17.20, 14.84];

const RANK: Record<string, RoadLine['rank']> = { motorway: 'motorway', motorway_link: 'motorway', trunk: 'trunk', trunk_link: 'trunk', primary: 'primary', primary_link: 'primary' };

/** Douglas–Peucker on lng/lat, with the tolerance in metres (at Dakar's latitude). */
export function simplify(pts: LngLat[], toleranceM: number): LngLat[] {
  if (pts.length < 3) return pts;
  const k = Math.cos((pts[0][1] * Math.PI) / 180), P = pts.map(p => [p[0] * 111320 * k, p[1] * 111320] as const);
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; let worst = -1, wi = -1;
    const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L; if (d > worst) { worst = d; wi = i; } }
    if (worst > toleranceM) { keep[wi] = true; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A polyline cut to a box: the pieces of it that lie inside (a road that leaves and comes back gives two). */
export function clipLine(pts: LngLat[], [w, s, e, n]: Bbox): LngLat[][] {
  const inside = (p: LngLat) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n;
  const out: LngLat[][] = []; let cur: LngLat[] = [];
  // a vertex-wise clip is enough for ways of a few tens of metres a segment: the box is only there to drop the rest of the country
  for (const p of pts) { if (inside(p)) cur.push(p); else if (cur.length) { out.push(cur); cur = []; } }
  if (cur.length) out.push(cur);
  return out.filter(l => l.length >= 2);
}

export interface ExtractStats { features: number; kept: number; dropped: { notRoad: number; outside: number; badGeometry: number }; pointsIn: number; pointsOut: number }

/** Builds the road layer from the collection. Every way keeps its OSM id in `id` ("w123"), so the layer can be traced back to its source. */
export function extractRoads(fc: OsmCollection, opts: { bbox?: Bbox; toleranceM?: number; source: string }): { layer: RoadLayer; stats: ExtractStats } {
  const bbox = opts.bbox ?? DAKAR_BBOX, tol = opts.toleranceM ?? 12;
  const stats: ExtractStats = { features: fc.features.length, kept: 0, dropped: { notRoad: 0, outside: 0, badGeometry: 0 }, pointsIn: 0, pointsOut: 0 };
  const roads: RoadLine[] = [];
  for (const f of fc.features) {
    const hw = String(f.properties?.highway ?? ''), rank = RANK[hw];
    if (!rank) { stats.dropped.notRoad++; continue; }
    const g = f.geometry;
    const lines: unknown[] = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? (g.coordinates as unknown[]) : [];
    if (!lines.length) { stats.dropped.badGeometry++; continue; }
    const id = String(f.id ?? f.properties?.['@id'] ?? f.properties?.id ?? '').replace(/^way\//, 'w') || `f${roads.length}`;
    let n = 0;
    for (const raw of lines) {
      const pts = (raw as number[][]).filter(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map(c => [c[0], c[1]] as LngLat);
      stats.pointsIn += pts.length;
      for (const piece of clipLine(pts, bbox)) {
        const s = simplify(piece, tol).map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5] as LngLat);
        if (s.length < 2) continue;
        stats.pointsOut += s.length;
        roads.push({ id: n++ ? `${id}.${n}` : id, name: String(f.properties?.name ?? f.properties?.ref ?? ''), rank, pts: s });
      }
    }
    if (n) stats.kept++; else stats.dropped.outside++;
  }
  return { layer: { source: opts.source, licence: 'ODbL 1.0 · © OpenStreetMap contributors', roads }, stats };
}
