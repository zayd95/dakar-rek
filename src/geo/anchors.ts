import type { HubId } from '../core/types';
import { ROADS, type LngLat, type Road } from '../road/routes';
import { LINKS } from '../transport/hubLink';

/**
 * Geographic anchors: how a position of the game is a place of the real map, and back. The 3D world is not a survey of Dakar and does not pretend to be.
 *
 *  • Districts are condensed: a hub is 260 m across and stands for about 1.3 km of town (`HUB_SCALE` real metres per game metre). Each hub has one anchor, the real place its centre
 *    stands for. Its streets are not the real streets and its buildings do not stand where the real ones do: only the district as a whole is placed. North is up in both worlds.
 *  • The roads between districts (src/road/routes.ts) are condensed about 9 : 1 (`ROAD_SCALE`) and are placed along their real alignment: a position of the game on one is the nearest
 *    point of its centre line, mapped by arc length between the anchors (each a node of the game road paired with a real place), and its side offset.
 *
 * `gameToLngLat` and `lngLatToGame` are exact inverses inside a district (and on a road, along its centre line). The scale and the anchors are approximate by design:
 * see docs/map/PROVENANCE.md. Pure module: no browser, no three.js.
 */
export const HUB_SCALE = 5;
export const ROAD_SCALE = 9;
const M_PER_DEG = 111320;

export interface HubAnchor { hub: HubId; name: string; lngLat: LngLat; /** half the span of the districts's streets (game m): the rectangle drawn on the map */ half: number }

/** The real place each district's centre stands for (approximate, hand-placed). */
export const HUB_ANCHORS: Record<HubId, HubAnchor> = {
  plateau: { hub: 'plateau', name: 'Plateau', lngLat: [-17.4340, 14.6700], half: 127 },
  corniche: { hub: 'corniche', name: 'Corniche · Fann', lngLat: [-17.4600, 14.6880], half: 127 },
  almadies: { hub: 'almadies', name: 'Almadies · Ngor', lngLat: [-17.5130, 14.7450], half: 127 },
  pikine: { hub: 'pikine', name: 'Pikine', lngLat: [-17.3930, 14.7540], half: 127 },
  // its west edge is the VDN: the road from the Corniche comes up the VDN and turns east into the district (src/road/routes.ts corniche-mermoz), as it does in the game
  mermoz: { hub: 'mermoz', name: 'Mermoz · Sacré-Cœur', lngLat: [-17.4640, 14.7112], half: 127 },
};

const mPerDegLng = (lat: number) => M_PER_DEG * Math.cos((lat * Math.PI) / 180);

/** A point of a district (x east, z south, metres from its centre) as a longitude and latitude. */
export function hubToLngLat(hub: HubId, x: number, z: number): LngLat {
  const [lng, lat] = HUB_ANCHORS[hub].lngLat;
  return [lng + (x * HUB_SCALE) / mPerDegLng(lat), lat - (z * HUB_SCALE) / M_PER_DEG];
}

/** The point of a district that stands for a place of the map (may lie outside the district's streets). */
export function lngLatToHub(hub: HubId, ll: LngLat): { x: number; z: number } {
  const [lng, lat] = HUB_ANCHORS[hub].lngLat;
  return { x: ((ll[0] - lng) * mPerDegLng(lat)) / HUB_SCALE, z: ((lat - ll[1]) * M_PER_DEG) / HUB_SCALE };
}

/** A road's anchors with the two ends taken from the districts it joins (so the road starts and ends exactly where the district's map position says it does). */
export function roadAnchors(road: Road): { s: number; name: string; lngLat: LngLat }[] {
  const a = road.anchorS.map(p => ({ ...p }));
  a[0].lngLat = hubToLngLat(road.def.a, road.def.aMouth.x, road.def.aMouth.z);
  a[a.length - 1].lngLat = hubToLngLat(road.def.b, road.def.bMouth.x, road.def.bMouth.z);
  a[a.length - 1].s = road.length;
  return a;
}

const anchorCache = new Map<string, ReturnType<typeof roadAnchors>>();
const anchorsOf = (road: Road) => { let a = anchorCache.get(road.id); if (!a) { a = roadAnchors(road); anchorCache.set(road.id, a); } return a; };

/** The place a distance along a road stands for: linear between its anchors. `bearing`: the real heading (radians clockwise from north) of the road there. */
export function roadToLngLat(road: Road, s: number, side = 0): { lngLat: LngLat; bearing: number } {
  const a = anchorsOf(road);
  let i = 0; while (i < a.length - 2 && s > a[i + 1].s) i++;
  const p = a[i], q = a[i + 1], t = (s - p.s) / (q.s - p.s || 1);
  const ll: LngLat = [p.lngLat[0] + (q.lngLat[0] - p.lngLat[0]) * t, p.lngLat[1] + (q.lngLat[1] - p.lngLat[1]) * t];
  const lat = ll[1], dx = (q.lngLat[0] - p.lngLat[0]) * mPerDegLng(lat), dy = (q.lngLat[1] - p.lngLat[1]) * M_PER_DEG;
  const bearing = Math.atan2(dx, dy), L = Math.hypot(dx, dy) || 1;
  // `side` (game metres, positive on the left of the travel direction) becomes real metres perpendicular to the real alignment
  const lx = -dy / L, ly = dx / L, off = side * ROAD_SCALE;
  return { lngLat: [ll[0] + (lx * off) / mPerDegLng(lat), ll[1] + (ly * off) / M_PER_DEG], bearing };
}

/** The distance along a road of the point nearest to a place of the map, and the real distance (m) between them. */
export function lngLatToRoad(road: Road, ll: LngLat): { s: number; metres: number } {
  const a = anchorsOf(road), lat = ll[1];
  let best = { s: 0, metres: Infinity };
  for (let i = 0; i + 1 < a.length; i++) {
    const p = a[i], q = a[i + 1], ax = p.lngLat[0] * mPerDegLng(lat), ay = p.lngLat[1] * M_PER_DEG, bx = q.lngLat[0] * mPerDegLng(lat), by = q.lngLat[1] * M_PER_DEG;
    const px = ll[0] * mPerDegLng(lat), py = ll[1] * M_PER_DEG, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)), d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
    if (d < best.metres) best = { s: p.s + (q.s - p.s) * t, metres: d };
  }
  return best;
}

export interface Where { lngLat: LngLat; /** 'hub': inside a district's streets; 'road': on the way between two */ kind: 'hub' | 'road'; hub: HubId; road?: Road; s?: number; bearing: number }

/**
 * Where a position of the game is on the map. `hub` is the district whose frame (x, z) is in. On the streets of the district it is the district's own (condensed) mapping; outside them,
 * on a road leaving the district, it is the nearest point of the road.
 */
export function gameToLngLat(hub: HubId, x: number, z: number): Where {
  const inHub = Math.abs(x) <= HUB_ANCHORS[hub].half + 3 && Math.abs(z) <= HUB_ANCHORS[hub].half + 3;
  if (!inHub) {
    for (const road of ROADS) {
      if (!road.touches(hub)) continue;
      const off = road.offset(hub), px = x - off.x, pz = z - off.z;
      if (!road.ground.contains(px, pz, 0)) continue;
      const p = road.spine.project(px, pz), g = roadToLngLat(road, p.s, p.d);
      return { lngLat: g.lngLat, kind: 'road', hub, road, s: p.s, bearing: g.bearing };
    }
  }
  return { lngLat: hubToLngLat(hub, x, z), kind: 'hub', hub, bearing: 0 };
}

/** Which district (or road) a place of the map belongs to: the nearest district anchor within `maxM` real metres, else the nearest road. Null if the place is farther than that from all of them. */
export function lngLatToGame(ll: LngLat, maxM = 2500): { hub: HubId; x: number; z: number; road?: Road; s?: number } | null {
  let best: { hub: HubId; d: number } | null = null;
  for (const id of Object.keys(HUB_ANCHORS) as HubId[]) {
    const p = lngLatToHub(id, ll), d = Math.hypot(p.x, p.z) * HUB_SCALE;
    if (!best || d < best.d) best = { hub: id, d };
  }
  if (best && best.d <= maxM) { const p = lngLatToHub(best.hub, ll); return { hub: best.hub, x: p.x, z: p.z }; }
  let near: { road: Road; s: number; metres: number } | null = null;
  for (const road of ROADS) { const r = lngLatToRoad(road, ll); if (!near || r.metres < near.metres) near = { road, ...r }; }
  if (near && near.metres <= maxM) {
    const at = near.road.spine.at(near.s), hub = near.s < near.road.swapS ? near.road.def.a : near.road.def.b, off = near.road.offset(hub);
    return { hub, x: at.x + off.x, z: at.z + off.z, road: near.road, s: near.s };
  }
  return null;
}

// ------------------------------------------------------------------ the city view: what the map draws of the playable world (pure, so it is tested: tests/cityMap.test.ts)

const metresBetween = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * mPerDegLng((a[1] + b[1]) / 2), (a[1] - b[1]) * M_PER_DEG);

/** The rectangle a district covers on the map (its streets, `half` either side of its anchor): a closed ring, north-west corner first. */
export function hubFootprint(hub: HubId): LngLat[] {
  const h = HUB_ANCHORS[hub].half;
  return [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]].map(([x, z]) => hubToLngLat(hub, x, z));
}
/** Is a place of the map inside a district's rectangle (`pad` game metres smaller, so its own edge does not count)? */
export function inFootprint(hub: HubId, ll: LngLat, pad = 0): boolean {
  const p = lngLatToHub(hub, ll), h = HUB_ANCHORS[hub].half - pad;
  return Math.abs(p.x) < h && Math.abs(p.z) < h;
}
/** The box that holds every district: the city view opens on it, and « vue d’ensemble » comes back to it. [south-west, north-east]. */
export function cityBounds(): [LngLat, LngLat] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const id of Object.keys(HUB_ANCHORS) as HubId[]) for (const [lng, lat] of hubFootprint(id)) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  return [[w, s], [e, n]];
}

/**
 * Room (pixels) the map screen keeps clear around `cityBounds` when it shows the whole city, for a map `height` pixels high: the tabs and a district's name above its
 * rectangle (top), the credit line (bottom), half a name each side and the buttons (right). A landscape phone's map is low and its tabs are smaller: less is kept, so
 * the districts are not drawn so small that two names meet.
 */
export const cityFitPad = (height: number) => (height < 320 ? { top: 66, bottom: 34, left: 42, right: 46 } : { top: 92, bottom: 52, left: 42, right: 46 });

/**
 * Where a border street (src/transport/hubLink.ts: two districts laid end to end in the game) runs on the real map, between the two district edges it joins.
 * Almadies ↔ Corniche is the coast road: down past the Mamelles and along the Corniche Ouest, west of Mermoz (hand-placed, approximate, like the roads' anchors).
 */
const BORDER_VIA: Record<string, { name: string; lngLat: LngLat }[]> = {
  'almadies~corniche': [{ name: 'Les Mamelles', lngLat: [-17.5010, 14.7230] }, { name: 'Corniche Ouest', lngLat: [-17.4830, 14.7010] }],
};

/** A way between two districts as the city map draws it: every corridor of src/road/routes.ts and every border street of src/transport/hubLink.ts, and nothing else. */
export interface MapLink {
  /** The id of its edge in the road graph (src/road/graph.ts EDGES): a corridor's road id, or `border:a~b`. */
  id: string; kind: 'corridor' | 'border'; a: HubId; b: HubId;
  /** Its line on the map, from `a`'s edge to `b`'s. */
  line: LngLat[];
  /** The named places it passes, in order from `a` (the card of a road). */
  via: string[];
  /** Real metres along its line. */
  realMetres: number;
  road?: Road;
}
const lineMetres = (line: LngLat[]) => line.reduce((sum, p, i) => (i ? sum + metresBetween(line[i - 1], p) : 0), 0);
/** The centre line of a road on the map, every `step` game metres. */
export function roadLine(road: Road, step = 12): LngLat[] {
  const out: LngLat[] = [];
  for (let s = 0; s < road.length; s += step) out.push(roadToLngLat(road, s).lngLat);
  out.push(roadToLngLat(road, road.length).lngLat);
  return out;
}
let links: MapLink[] | null = null;
export function mapLinks(): readonly MapLink[] {
  if (links) return links;
  links = ROADS.map((r): MapLink => {
    const line = roadLine(r);
    return { id: r.id, kind: 'corridor', a: r.def.a, b: r.def.b, line, via: r.anchorS.slice(1, -1).map(x => x.name), realMetres: lineMetres(roadAnchors(r).map(x => x.lngLat)), road: r };
  });
  const seen = new Set<string>();
  for (const l of LINKS) {
    const [a, b] = [l.from, l.to].sort() as [HubId, HubId], key = `${a}~${b}`;
    if (seen.has(key)) continue; seen.add(key);
    const fwd = l.from === a ? l : LINKS.find(k => k.from === a && k.to === b) ?? l, via = BORDER_VIA[key] ?? [];
    // the street's own crossing points, each on its district's edge of the map
    const line: LngLat[] = [hubToLngLat(a, fwd.x, fwd.from === a ? fwd.at : fwd.arrive), ...via.map(v => v.lngLat), hubToLngLat(b, fwd.x, fwd.from === a ? fwd.arrive : fwd.at)];
    links.push({ id: `border:${key}`, kind: 'border', a, b, line, via: via.map(v => v.name), realMetres: lineMetres(line) });
  }
  return links;
}
/** The line of a link driven from `from` (one of its two districts): its points in travel order. */
export const linkLineFrom = (link: MapLink, from: HubId): LngLat[] => (from === link.a ? link.line : [...link.line].reverse());

/** The text of the map's footnote about scale (shown with the attribution). */
export const SCALE_NOTE = 'Quartiers et routes condensés : un quartier jouable représente environ 1,3 km de ville, les routes entre quartiers sont raccourcies d’environ 9 fois. Les positions sont approximatives.';
