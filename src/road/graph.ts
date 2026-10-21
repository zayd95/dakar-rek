import type { HubId } from '../core/types';
import { GRID, roadCentre } from '../transport/lines';
import { LINKS } from '../transport/hubLink';
import { HUB_ANCHORS } from '../geo/anchors';
import { ROADS, type LngLat, type Road } from './routes';

/**
 * The city's road network as data: districts are the nodes, the ways between them the edges, and routing runs over whatever is drivable. NOTHING here is Pikine-centric: a trip may start
 * in any district, cross several, and the same code drives every segment (a corridor between two districts, src/road/routes.ts, or a border street where two districts touch,
 * src/transport/hubLink.ts). A district that is only PLANNED is on the map and in the registry but has no edge, so no route ever goes through it and nobody is offered a way in.
 *
 * Adding a district later (Ouakam, Yoff, Parcelles Assainies, Mermoz / Sacré-Cœur): build its world (a HubId, its builder, its modules), flip its entry in `CITY_HUBS` to `playable`, then give
 * it roads (a `RouteDef` in routes.ts, or a link in hubLink.ts). The edges below are derived from those, the corridors, traffic, swap, vehicle carry, staging and the map follow by themselves.
 * See docs/map/NETWORK.md.
 */
export type CityHubId = HubId | 'ouakam' | 'yoff' | 'parcelles' | 'mermoz';

export interface CityHub {
  id: CityHubId; name: string;
  /** playable: its world exists and it is reachable by road; planned: on the map only, "à venir". */
  status: 'playable' | 'planned';
  /** The real place it stands for (approximate, hand-placed). */
  lngLat: LngLat;
  /** For a planned district: where it will sit in the network (the neighbours it is meant to join), not a promise of a road. */
  intends?: CityHubId[];
}

export const CITY_HUBS: readonly CityHub[] = [
  ...(Object.values(HUB_ANCHORS)).map((a): CityHub => ({ id: a.hub, name: a.name, status: 'playable', lngLat: a.lngLat })),
  { id: 'ouakam', name: 'Ouakam', status: 'planned', lngLat: [-17.4893, 14.7186], intends: ['almadies', 'corniche'] },
  { id: 'yoff', name: 'Yoff', status: 'planned', lngLat: [-17.4742, 14.7553], intends: ['almadies', 'parcelles'] },
  { id: 'parcelles', name: 'Parcelles Assainies', status: 'planned', lngLat: [-17.4420, 14.7595], intends: ['yoff', 'pikine'] },
  { id: 'mermoz', name: 'Mermoz · Sacré-Cœur', status: 'planned', lngLat: [-17.4685, 14.7108], intends: ['corniche', 'pikine'] },
];
export const hubInfo = (id: string): CityHub | undefined => CITY_HUBS.find(h => h.id === id);
export const isPlayable = (id: string): id is HubId => hubInfo(id)?.status === 'playable';

export interface Edge {
  id: string;
  kind: 'corridor' | 'border';
  a: HubId; b: HubId;
  /** Game metres to drive from one district's centre to the other's. */
  metres: number;
  /** The road itself (a corridor); a border street has none. */
  road?: Road;
}

/** A border street joins two districts that touch: from one centre to the other is two street-grid half-widths. */
const BORDER_M = 2 * roadCentre(GRID.nb);
const borders = (): Edge[] => {
  const out: Edge[] = [], seen = new Set<string>();
  for (const l of LINKS) { const key = [l.from, l.to].sort().join('~'); if (seen.has(key)) continue; seen.add(key); out.push({ id: `border:${key}`, kind: 'border', a: l.from, b: l.to, metres: BORDER_M }); }
  return out;
};
export const EDGES: readonly Edge[] = [
  ...ROADS.map((r): Edge => ({ id: r.id, kind: 'corridor', a: r.def.a, b: r.def.b, metres: r.length + 2 * 127, road: r })),
  ...borders(),
];

export const edgesOf = (hub: HubId): Edge[] => EDGES.filter(e => e.a === hub || e.b === hub);
export const edgeBetween = (a: HubId, b: HubId): Edge | undefined => EDGES.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));

export interface Leg { edge: Edge; from: HubId; to: HubId }
export interface TripPlan { from: HubId; to: HubId; hubs: HubId[]; legs: Leg[]; metres: number }

/** The shortest drivable way from one district to another (Dijkstra over the edges), null when there is none, the districts are the same, or one is not playable. */
export function planTrip(from: string, to: string): TripPlan | null {
  if (from === to || !isPlayable(from) || !isPlayable(to)) return null;
  const dist = new Map<HubId, number>([[from, 0]]), prev = new Map<HubId, Leg>(), todo = new Set<HubId>([from]), done = new Set<HubId>();
  while (todo.size) {
    let u: HubId | null = null; for (const h of todo) if (u === null || dist.get(h)! < dist.get(u)!) u = h;
    todo.delete(u!); done.add(u!);
    if (u === to) break;
    for (const e of edgesOf(u!)) {
      const v = e.a === u ? e.b : e.a; if (done.has(v)) continue;
      const nd = dist.get(u!)! + e.metres;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, { edge: e, from: u!, to: v }); todo.add(v); }
    }
  }
  if (!prev.has(to)) return null;
  const legs: Leg[] = []; for (let h: HubId = to; h !== from;) { const l = prev.get(h)!; legs.unshift(l); h = l.from; }
  return { from, to, hubs: [from, ...legs.map(l => l.to)], legs, metres: dist.get(to)! };
}

/** Whether every playable district can reach every other by road. */
export function connected(): boolean {
  const ids = CITY_HUBS.filter(h => h.status === 'playable').map(h => h.id as HubId);
  return ids.every(a => ids.every(b => a === b || planTrip(a, b) !== null));
}

/** The district-to-district offsets of the loaded frames along a trip: what the frame of the last district is, seen from the first (a pure translation per leg). */
export function frameOffset(plan: TripPlan): { x: number; z: number } {
  let x = 0, z = 0;
  for (const l of plan.legs) {
    if (l.edge.road) { const o = l.edge.road.offset(l.to), f = l.edge.road.offset(l.from); x += o.x - f.x; z += o.z - f.z; }
    else { const link = LINKS.find(k => k.from === l.from && k.to === l.to)!; z += link.arrive - link.at; }
  }
  return { x, z };
}
