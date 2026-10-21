import type { HubId } from '../core/types';
import { ROADS, type LngLat, type Road } from '../road/routes';

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

/** The text of the map's footnote about scale (shown with the attribution). */
export const SCALE_NOTE = 'Quartiers et routes condensés : un quartier jouable représente environ 1,3 km de ville, les routes entre quartiers sont raccourcies d’environ 9 fois. Les positions sont approximatives.';
