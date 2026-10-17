/**
 * Minimap and full map: the pure parts (projection and rotation, zoom by speed, place kinds and naming, the road path,
 * the night tint). No DOM, no Three.js: tests/minimap.test.ts. The drawing is src/ui/minimap.ts and src/ui/fullmap.ts.
 *
 * World axes: x east, z south (the sea is at -x on the Corniche and at -z in the Almadies). The camera looks along
 * (sin yaw, cos yaw); its right is (-cos yaw, sin yaw). On the map, up is where the camera looks.
 */

export interface Pt { x: number; z: number }
export interface Edge { ax: number; az: number; bx: number; bz: number }

/** Player walking speed in the game (m/s): the full map's walking times (Habib's figure). */
export const WALK_SPEED = 2.0;

/** A world offset (dx, dz) seen from a camera of heading `yaw`: u to the right, v ahead. */
export function rotate(dx: number, dz: number, yaw: number): { u: number; v: number } {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { u: -dx * c + dz * s, v: dx * s + dz * c };
}

/** World point to minimap pixels: the player (px, pz) at the centre (cx, cy), `scale` pixels per metre, up = ahead. */
export function project(x: number, z: number, px: number, pz: number, yaw: number, scale: number, cx: number, cy: number): { x: number; y: number } {
  const { u, v } = rotate(x - px, z - pz, yaw);
  return { x: cx + u * scale, y: cy - v * scale };
}

/** Inverse of `project` (a tap on the rotated map back to the world). */
export function unproject(sx: number, sy: number, px: number, pz: number, yaw: number, scale: number, cx: number, cy: number): Pt {
  const u = (sx - cx) / scale, v = (cy - sy) / scale, s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: px + -u * c + v * s, z: pz + u * s + v * c };
}

/** Where north is on the ring, as an angle from « up » (clockwise, radians): the N marker moves with the heading. */
export const northAngle = (yaw: number) => Math.atan2(-Math.sin(yaw), -Math.cos(yaw));

/** Visible radius (m) of the minimap by speed (m/s): in when walking, out when running, far out when driving. */
export function zoomRadius(speed: number): number {
  const pts: [number, number][] = [[0, 52], [2.4, 56], [5.5, 84], [9, 115], [14, 140]];
  if (speed <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (speed <= pts[i][0]) { const [s0, r0] = pts[i - 1], [s1, r1] = pts[i]; return r0 + (r1 - r0) * (speed - s0) / (s1 - s0); }
  }
  return pts[pts.length - 1][1];
}
/** One smoothing step toward the target radius (zooming out is still quicker than zooming in: no blind spot at speed). */
export const approach = (cur: number, target: number, dt: number) => cur + (target - cur) * Math.min(1, dt * (target > cur ? 4 : 3.2));

/** A point outside the circle of radius R (pixels from the centre) pulled onto the ring, with its direction. */
export function onRing(u: number, v: number, R: number): { x: number; y: number; angle: number; outside: boolean } {
  const d = Math.hypot(u, v), angle = Math.atan2(u, v);       // from up, clockwise
  if (d <= R) return { x: u, y: -v, angle, outside: false };
  return { x: (u / d) * R, y: -(v / d) * R, angle, outside: true };
}

/** 0 by day, 1 at night, with dusk and dawn in between (city hour). */
export function nightness(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 20 || h < 5.5) return 1;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18) return (h - 18) / 2;
  return 1 - (h - 5.5) / 1.5;
}

// ------------------------------------------------------------------ places

export type PlaceKind = 'food' | 'shop' | 'transport' | 'arena' | 'mosque' | 'home' | 'work' | 'spot';
export const KIND_LABEL: Record<PlaceKind, string> = {
  food: 'Manger', shop: 'Boutiques', transport: 'Transport', arena: 'Arène', mosque: 'Mosquée', home: 'Logement', work: 'Travail', spot: 'Lieux',
};
export const KIND_COLOR: Record<PlaceKind, string> = {
  food: '#ff9f1c', shop: '#3fb6ff', transport: '#ffd23f', arena: '#ef476f', mosque: '#2dc98a', home: '#b388ff', work: '#9be15d', spot: '#cfd8dc',
};
export const KIND_ORDER: PlaceKind[] = ['food', 'shop', 'transport', 'arena', 'mosque', 'home', 'work', 'spot'];

/** Kind of a place from its id and name (ids look like `plateau:gargote:12`, `pikine:city:bank`). */
export function placeKind(id: string, name = ''): PlaceKind {
  const s = (id + ' ' + name).toLowerCase();
  if (/:station\b/.test(id)) return 'transport';
  if (/mosque|prière|priere/.test(s)) return 'mosque';
  if (/:arena\b|:ecurie\b|écurie|city:club|\barène\b/.test(s) && !/:arena:/.test(id)) return 'arena';
  if (/:home:|city:(villa|residence|jamm|maison|parcelles)/.test(id)) return 'home';
  if (/gargote|dibiterie|restaurant|maiga|cafe|juice|café/.test(s)) return 'food';
  if (/city:bank|:port\b|garage|soumbedioune|débarquement/.test(s)) return 'work';
  if (/boutique|salon|shop|meubles|mall-|craft|atelier|market|marché|étal|showroom|:mall\b|réparation/.test(s)) return 'shop';
  return 'spot';
}

export interface MapPlace { id: string; name: string; x: number; z: number; kind: PlaceKind; what: string[] }

/** Drops the sub-anchors of one place (an arena's rows, a villa listed twice 3 m apart): same kind within `r` metres. */
export function dedupePlaces<T extends { x: number; z: number; kind: PlaceKind }>(list: T[], r = 8): T[] {
  const out: T[] = [];
  for (const p of list) if (!out.some(q => q.kind === p.kind && Math.hypot(q.x - p.x, q.z - p.z) < r)) out.push(p);
  return out;
}

const ARTICLES: [RegExp, string][] = [
  [/^caf[ée](?!\p{L})/iu, 'du '], [/^banque(?!\p{L})/iu, 'de la '], [/^gargote(?!\p{L})/iu, 'de la '], [/^dibiterie(?!\p{L})/iu, 'de la '], [/^place(?!\p{L})/iu, 'de la '], [/^grand-place(?!\p{L})/iu, 'de la '],
  [/^marché(?!\p{L})/iu, 'du '], [/^étal(?!\p{L})/iu, 'de l’'], [/^salle(?!\p{L})/iu, 'de la '], [/^atelier(?!\p{L})/iu, 'de l’'], [/^ateliers(?!\p{L})/iu, 'des '], [/^restaurant(?!\p{L})/iu, 'du '],
  [/^maïga(?!\p{L})/iu, 'du '], [/^port(?!\p{L})/iu, 'du '], [/^boutique(?!\p{L})/iu, 'de la '], [/^quincaillerie(?!\p{L})/iu, 'de la '], [/^garage(?!\p{L})/iu, 'du '], [/^salon(?!\p{L})/iu, 'du '],
  [/^écurie(?!\p{L})/iu, 'de l’'], [/^arène(?!\p{L})/iu, 'de l’'], [/^entrée(?!\p{L})/iu, 'de l’'], [/^résidence(?!\p{L})/iu, 'de la '], [/^maison(?!\p{L})/iu, 'de la '], [/^villa(?!\p{L})/iu, 'de la '],
  [/^appartement(?!\p{L})/iu, 'de l’'], [/^panneau(?!\p{L})/iu, 'du '], [/^parcelles(?!\p{L})/iu, 'des '],
];
/** « Banque Teranga · Plateau » → « la Banque Teranga ». Names have no article of their own: it is chosen here. */
export function shortName(name: string): string {
  const n = name.split(' · ')[0].trim();
  if (/^car rapide/i.test(n)) return 'la gare des cars rapides';
  if (/^ma chambre/i.test(n)) return 'ma chambre';
  return n;
}
/** « près de l’Étal de Sandaga », « près du Café Touba », « près de la gare des cars rapides ». */
export function nearPhrase(name: string): string {
  const n = shortName(name);
  if (n === 'ma chambre') return 'près de chez toi';
  if (n.startsWith('la gare')) return 'près de ' + n;
  for (const [re, art] of ARTICLES) if (re.test(n)) return 'près ' + art + n;
  return /^[aeiouyàâéèêëîïôöûüh]/i.test(n) ? 'près d’' + n : 'près de ' + n;
}

/** Nearest place (any kind) within `maxD` metres, with its distance. */
export function nearestPlace<T extends Pt>(list: readonly T[], x: number, z: number, maxD = 60): { place: T; d: number } | null {
  let best: T | null = null, bd = maxD;
  for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return best ? { place: best, d: bd } : null;
}

/** Quarters named in place names (« Café Touba · Sandaga »): the district shown when one is near. */
const QUARTERS = ['Sandaga', 'Médina', 'Fann', 'Ngor', 'Yoff', 'Parcelles', 'Plateau', 'Almadies', 'Pikine', 'Mamelles', 'Soumbédioune', 'Guédiawaye'];
/**
 * What the minimap prints under itself: the neighbourhood (the hub's name, or the quarter in the name of the place right
 * here) and the nearest named place, as the street is not named in the data (« près du Café Touba »; the place's own
 * name when the player is within 14 m of it).
 */
export function whereLabel(hubName: string, list: readonly { name: string; x: number; z: number }[], x: number, z: number): { district: string; street: string } {
  const hub = hubName.split(' · ');
  const n = nearestPlace(list, x, z, 70);
  let district = hub[0];
  if (n) {
    const q = n.place.name.split(' · ')[1];
    if (q && (hub.includes(q) || QUARTERS.includes(q))) district = q;
  }
  if (!n) return { district, street: 'Dans la rue' };
  const short = shortName(n.place.name);
  return { district, street: n.d < 14 ? short.charAt(0).toUpperCase() + short.slice(1) : nearPhrase(n.place.name) };
}

// ------------------------------------------------------------------ road path

interface GNode { x: number; z: number; adj: { to: number; d: number }[] }
const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/** The nearest point of the road network (the centre lines of `edges`) to a world point. */
export function snapToRoad(edges: readonly Edge[], x: number, z: number): { p: Pt; edge: number } | null {
  let best: { p: Pt; edge: number } | null = null, bd = Infinity;
  edges.forEach((e, i) => {
    const dx = e.bx - e.ax, dz = e.bz - e.az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / l2)) : 0;
    const px = e.ax + dx * t, pz = e.az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = { p: { x: px, z: pz }, edge: i }; }
  });
  return best;
}

/**
 * Walking route from a to b along the roads (shortest path on the hub's road grid), as a polyline starting at a and
 * ending at b. Falls back to the straight line when there are no roads. `length` is the polyline's length in metres.
 */
export function routePath(edges: readonly Edge[], a: Pt, b: Pt): { points: Pt[]; length: number } {
  const len = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
  const straight = () => { const pts = [a, b]; return { points: pts, length: len(pts) }; };
  const sa = snapToRoad(edges, a.x, a.z), sb = snapToRoad(edges, b.x, b.z);
  if (!sa || !sb) return straight();
  // graph: the network's junctions plus the two snapped points, which split their edges
  const nodes: GNode[] = [], index = new Map<string, number>();
  const node = (x: number, z: number) => { const k = key(x, z); let i = index.get(k); if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push({ x, z, adj: [] }); } return i; };
  const link = (i: number, j: number) => { if (i === j) return; const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z); nodes[i].adj.push({ to: j, d }); nodes[j].adj.push({ to: i, d }); };
  edges.forEach((e, k) => {
    const cuts = [node(e.ax, e.az)];
    const extra: { t: number; i: number }[] = [];
    for (const s of [sa, sb]) if (s.edge === k) {
      const dx = e.bx - e.ax, dz = e.bz - e.az, l2 = dx * dx + dz * dz;
      extra.push({ t: l2 ? ((s.p.x - e.ax) * dx + (s.p.z - e.az) * dz) / l2 : 0, i: node(s.p.x, s.p.z) });
    }
    extra.sort((p, q) => p.t - q.t);
    for (const x of extra) cuts.push(x.i);
    cuts.push(node(e.bx, e.bz));
    for (let i = 1; i < cuts.length; i++) link(cuts[i - 1], cuts[i]);
  });
  const from = node(sa.p.x, sa.p.z), to = node(sb.p.x, sb.p.z);
  // Dijkstra (a few dozen nodes)
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === to) break;
    done[u] = true;
    for (const { to: v, d } of nodes[u].adj) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  if (dist[to] === Infinity) return straight();
  const mid: Pt[] = [];
  for (let i = to; i >= 0; i = prev[i]) mid.unshift({ x: nodes[i].x, z: nodes[i].z });
  const pts = [a, ...mid, b];
  // drop repeated points
  const clean = pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
  if (clean.length < 2) return straight();
  return { points: clean, length: len(clean) };
}

/** « ≈ 25 s », « ≈ 2 min » on foot at `WALK_SPEED`. */
export function walkTime(meters: number): string {
  const s = meters / WALK_SPEED;
  return s < 60 ? `≈ ${Math.max(5, Math.round(s / 5) * 5)} s` : `≈ ${Math.round(s / 60)} min`;
}
export const distText = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : `${Math.round(m / 5) * 5 || 5} m`);
