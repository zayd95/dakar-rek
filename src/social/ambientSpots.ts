/**
 * Ambient city life — where people can be (docs/NPC_LIFE.md). Builds the hub's spots for the scheduler (ambient.ts) from:
 *  1. the Places registry (any PlaceSpec any lane registers: its type gives the tags, its anchors and nearby seats the
 *     places to stand and sit, its hours the opening times);
 *  2. the legacy content of the hub builders (gargotes, Maïga, cafés, dibiteries, Sandaga, stations, squares,
 *     Soumbédioune, the Ngor port, the gym, the écurie, the arena, banks, mall and shops) — skipped when a registered place
 *     of the same family sits there, so a venue lane taking a place over replaces it here too;
 *  3. landmarks (mosque forecourt, football pitch), the sea front (Corniche promenade, Ngor beach) and street corners;
 *  4. every remaining seat of the Seats registry (benches anywhere, interior chairs).
 * It also derives seats for street furniture the builders draw without registering (kiosk benches, the Maïga bench,
 * dibiterie chairs, station and gym benches) so players and ambient people share them. Pure: no Three.js.
 */
import type { Collider } from '../world/types';
import type { PlaceSpec } from '../activity/places';
import { BLK, HALF, NB, PITCH, ROAD, type SpecialKind } from '../world/builder';
import { WALL_R } from '../world/geew';
import { LANE, kioskDir } from './routines';
import { PLACE_TAGS, LEGACY_TAGS } from './ambientData';
import { pair, prayerRows, ring, type AmbientSpot, type Pt, type SeatLike, type StandSlot } from './ambient';

export interface SpotInputs {
  places: readonly PlaceSpec[];
  /** Every seat of the Seats registry (all spaces). */
  seats: readonly SeatLike[];
  interactables: readonly { id: string; x: number; z: number }[];
  layout: { specials: readonly { kind: SpecialKind; x: number; z: number }[]; sea: 'west' | 'north' | null };
  colliders: readonly Collider[];
  /** Builder-placed people (vendors, cooks…): nobody stands on them. */
  people: readonly Pt[];
  arena: { cx: number; cz: number } | null;
  /** Car rapide doors (legacy stations): waiting people board there. */
  doors?: readonly Pt[];
  /** Low quality: the builders drew fewer pirogues. */
  lite?: boolean;
}

const PI = Math.PI;
const G = 0.12;                                       // block ground / sidewalk top (world/builder.ts)
const roadC = (k: number) => -HALF + ROAD / 2 + k * PITCH;
const blockMin = (i: number) => -HALF + ROAD + i * PITCH;
/** Interaction anchors keep this much room: an ambient person never stands where the player acts. */
export const ANCHOR_ROOM = 1.8;

const inside = (cols: readonly Collider[], x: number, z: number, m = 0.3) =>
  cols.some(c => c.h > 0.3 && x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m);

/** Street furniture seats the builders draw but do not register yet (ids `<hub-ish anchor id>:amb:…`). */
export function furnitureSeats(interactables: SpotInputs['interactables'], layout: SpotInputs['layout'], existing: readonly SeatLike[]): SeatLike[] {
  const out: SeatLike[] = [];
  const add = (s: Omit<SeatLike, 'occupant' | 'space'>) => {
    if ([...existing, ...out].some(e => e.space === 'street' && Math.hypot(e.x - s.x, e.z - s.z) < 0.35)) return;
    out.push({ ...s, space: 'street', occupant: null });
  };
  for (const a of interactables) {
    const kiosk = /:(gargote|cafe|restaurant):/.test(a.id), maiga = a.id.includes(':maiga:');
    if (kiosk || maiga) {
      const dir = kioskDir(a.z), face = dir > 0 ? 0 : PI;
      if (kiosk) for (let n = 0; n < 3; n++) for (const side of [-1, 1]) add({ id: `${a.id}:amb:bench${n}${side > 0 ? 'r' : 'l'}`, x: a.x - 4 + 4 * n + side * 0.4, z: a.z + dir * 1.2, top: G + 0.45, yaw: face, kind: 'bench' });
      else for (const side of [-1, 1]) add({ id: `${a.id}:amb:bench${side > 0 ? 'r' : 'l'}`, x: a.x + 1.6 + side * 0.4, z: a.z - dir * 1.1, top: G + 0.45, yaw: face, kind: 'bench' });
    } else if (a.id.includes(':dibiterie:')) {
      const { cx, cz, dir } = dibiFrame(a);
      const at = (t: number) => cz + dir * t;
      for (const [tx, tz] of [[cx - 1.2, at(-0.3)], [cx + 1.4, at(1.5)]]) for (const sx of [-1, 1])
        add({ id: `${a.id}:amb:chair${tx > cx ? 1 : 0}${sx > 0 ? 'r' : 'l'}`, x: tx + sx * 0.8, z: tz, top: G + 0.49, yaw: sx < 0 ? PI / 2 : -PI / 2, kind: 'chair' });
      for (const dz of [-1, 0, 1]) add({ id: `${a.id}:amb:bench${dz + 1}`, x: cx - 5.5 + 0.6, z: cz + dz * 1.05, top: G + 0.45, yaw: PI / 2, kind: 'bench' });
    } else if (/:station$/.test(a.id)) {
      const cx = a.x + 3, cz = a.z - 3.2;
      for (const dx of [-3, -1, 1, 3]) add({ id: `${a.id}:amb:bench${dx + 3}`, x: cx + 6 + dx, z: cz + 4.45, top: G + 0.52, yaw: PI, kind: 'bench' });
    } else if (/:gym$/.test(a.id)) {
      const cx = a.x, cz = a.z - 2;
      for (const dx of [-2, 0, 2]) add({ id: `${a.id}:amb:bench${dx + 2}`, x: cx + dx, z: cz + 5, top: G + 0.52, yaw: PI, kind: 'bench' });
    }
  }
  void layout;
  return out;
}

/** Dibiterie room frame from its interactable (cx, cz + dir × 0.6): which half of the block it opens from. */
export function dibiFrame(a: Pt) {
  const local = (((a.z - blockMin(0)) % PITCH) + PITCH) % PITCH;
  const dir = local > BLK / 2 ? 1 : -1;
  return { cx: a.x, cz: a.z - dir * 0.6, dir };
}

/** Build every spot of the hub. Seats are assigned to one spot only (first come: places, legacy, then the rest). */
export function buildSpots(inp: SpotInputs): AmbientSpot[] {
  const spots: AmbientSpot[] = [];
  const cols = inp.colliders;
  const taken = new Set<string>();
  const anchors: Pt[] = [...inp.interactables, ...inp.places.flatMap(p => p.space === 'street' ? p.anchors : [])];
  const seatOf = new Map(inp.seats.map(s => [s.id, s]));
  /** A standing slot in the street is usable: not in a solid object, not on a placed person, not on an anchor. */
  const okStand = (s: StandSlot, room = ANCHOR_ROOM) => !inside(cols, s.x, s.z) && !inp.people.some(p => Math.hypot(p.x - s.x, p.z - s.z) < 0.8)
    && !anchors.some(a => Math.hypot(a.x - s.x, a.z - s.z) < room);
  const stands = (list: StandSlot[]) => list.filter(s => okStand(s));
  const claim = (pred: (s: SeatLike) => boolean) => {
    const ids: string[] = [];
    for (const s of inp.seats) if (!taken.has(s.id) && s.kind !== 'vehicle' && pred(s)) { taken.add(s.id); ids.push(s.id); }
    return ids;
  };
  const push = (s: Omit<AmbientSpot, 'stands' | 'seats'> & { stands?: StandSlot[]; seats?: string[] }) => {
    const spot: AmbientSpot = { stands: [], seats: [], ...s };
    if (spot.seats.length || spot.stands.length || spot.rows?.length || spot.route || spot.area) spots.push(spot);
  };

  // 1. registered places
  const placeTagged: { tags: readonly string[]; pts: Pt[] }[] = [];
  for (const p of inp.places) {
    const tags = PLACE_TAGS[p.type] ?? ['place'];
    if (!tags.length || !p.anchors.length) continue;
    const street = p.space === 'street';
    const cx = p.anchors.reduce((v, a) => v + a.x, 0) / p.anchors.length, cz = p.anchors.reduce((v, a) => v + a.z, 0) / p.anchors.length;
    const seats = claim(s => s.space === p.space && (!street || p.anchors.some(a => Math.hypot(a.x - s.x, a.z - s.z) < 7)));
    let st: StandSlot[] = p.anchors.flatMap(a => ring(a.x, a.z, 2.1, 6, 0.3));
    st = street ? stands(st) : st.filter(s => !p.anchors.some(a => Math.hypot(a.x - s.x, a.z - s.z) < ANCHOR_ROOM));
    let rows: StandSlot[] | undefined;
    if (p.type === 'mosque') {
      const hall = p.anchors.find(a => a.id === 'hall') ?? p.anchors[0];
      rows = prayerRows(hall.x, hall.z, 3, 6).filter(s => !street || (!inside(cols, s.x, s.z) && Math.hypot(s.x - hall.x, s.z - hall.z) >= 1));
    }
    push({ id: `place:${p.id}`, tags, space: p.space, x: cx, z: cz, seats, stands: st, rows, hours: p.hours, place: p.id, source: 'place' });
    placeTagged.push({ tags, pts: p.anchors });
  }
  /** A legacy place is replaced by a registered place of the same family next to it. */
  const superseded = (x: number, z: number, tags: readonly string[], r = 14) =>
    placeTagged.some(p => p.tags.some(t => tags.includes(t)) && p.pts.some(a => Math.hypot(a.x - x, a.z - z) < r));

  // 2. legacy places of the hub builders
  for (const a of inp.interactables) {
    const rule = LEGACY_TAGS.find(r => a.id.includes(r.has));
    if (!rule || a.id.startsWith('npc:') || a.id.includes(':home:') || superseded(a.x, a.z, rule.tags)) continue;
    const base = { space: 'street', hours: rule.hours, source: 'legacy' as const };
    const id = `legacy:${a.id}`;
    if (/:(gargote|cafe|restaurant|maiga):/.test(a.id)) {
      const dir = kioskDir(a.z), toCounter = dir > 0 ? PI : 0;
      const seats = claim(s => s.space === 'street' && s.id.startsWith(a.id + ':amb:'));
      const props: Record<string, { x: number; y: number; z: number }> = {}, from: Record<string, Pt> = {};
      for (const sid of seats) {
        const s = seatOf.get(sid)!;
        if (!a.id.includes(':maiga:')) props[sid] = { x: s.x, y: G + 0.66, z: s.z + dir * 0.8 };
        from[sid] = { x: s.x, z: s.z - dir * 0.6 };                    // the low table is in front: sit down from behind
      }
      push({ ...base, id, tags: rule.tags, x: a.x, z: a.z + dir * 1.2, seats, seatProps: props, seatApproach: from, stands: stands([-3.3, -2.1].map(dx => ({ x: a.x + dx, z: a.z - dir * 0.35, yaw: toCounter }))) });
    } else if (a.id.includes(':dibiterie:')) {
      const { cx, cz, dir } = dibiFrame(a);
      const kz = cz - dir * 2.35, seats = claim(s => s.space === 'street' && s.id.startsWith(a.id + ':amb:'));
      const props: Record<string, { x: number; y: number; z: number }> = {}, from: Record<string, Pt> = {};
      for (const sid of seats) {
        const s = seatOf.get(sid)!;
        if (s.kind !== 'chair') continue;
        props[sid] = { x: s.x + (s.yaw > 0 ? 0.45 : -0.45), y: G + 0.78, z: s.z };
        from[sid] = { x: s.x - Math.sin(s.yaw) * 0.15, z: s.z + dir * 0.65 };   // beside the chair, not through the table
      }
      push({ ...base, id, tags: rule.tags, x: cx, z: cz, seats, seatProps: props, seatApproach: from, stands: stands([1.6, 3.0].map(dx => ({ x: cx + dx, z: kz + dir * 1.05, yaw: dir > 0 ? PI : 0 })).filter(s => okStand(s, 1.2))) });
    } else if (a.id.endsWith(':market')) {
      const bx = a.x - 21, bz = a.z - 11.5, vend: StandSlot[] = [], buy: StandSlot[] = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const sx = bx + 8 + c * 13, sz = bz + 7 + r * 9;
        if ((r + c) % 2 === 0) vend.push({ x: sx + 0.8, z: sz - 1.85, yaw: 0 });
        buy.push({ x: sx - 1.2, z: sz + 2.0, yaw: PI }, { x: sx + 1.3, z: sz + 2.0, yaw: PI });
      }
      push({ ...base, id: id + ':stalls', tags: ['stall'], x: bx + 21, z: bz + 20, stands: stands(vend), weight: vend.length });
      push({ ...base, id, tags: rule.tags, x: bx + 21, z: bz + 20, stands: stands(buy), weight: 2.4 });
    } else if (/:station$/.test(a.id)) {
      const cx = a.x + 3, cz = a.z - 3.2;
      const seats = claim(s => s.space === 'street' && s.id.startsWith(a.id + ':amb:'));
      const q: StandSlot[] = []; for (let k = 0; k < 8; k++) q.push({ x: cx + 1.2 + k * 1.35, z: cz + 2.9 + (k % 2) * 0.35, yaw: PI + (k % 3 - 1) * 0.35 });
      const door = inp.doors?.slice().sort((p, r) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(r.x - cx, r.z - cz))[0];
      push({ ...base, id, tags: rule.tags, x: cx + 5, z: cz + 3.5, seats, stands: stands(q), boardAt: door && Math.hypot(door.x - cx, door.z - cz) < 15 ? door : undefined, weight: 1.2 });
    } else if (a.id.endsWith(':city:square')) {
      const cx = a.x - 10.5, cz = a.z - 3;
      push({ ...base, id: id + ':attaya', tags: ['attaya'], x: cx + 11, z: cz - 1, stands: stands(ring(cx + 11, cz - 1, 2.15, 8, PI / 8)) });
      push({ ...base, id: id + ':dames', tags: ['dames'], x: cx - 11, z: cz - 1, stands: stands(ring(cx - 11, cz - 1, 1.75, 6, 0)) });
      const seats = claim(s => s.space === 'street' && Math.abs(s.x - cx) < 21 && Math.abs(s.z - cz) < 21);
      push({ ...base, id, tags: ['square', 'bench'], x: cx, z: cz, seats, stands: stands([...pair(cx - 4.5, cz + 7.5, 0.4), ...pair(cx + 4.5, cz - 7.5, 2.1)]), prio: 1.1 });
    } else if (a.id.endsWith(':city:soumbedioune')) {
      const cz = a.z - 6, st: StandSlot[] = [];
      for (let k = 0; k < (inp.lite ? 4 : 7); k++) {
        const x = -147 + (k % 2) * 6, z = cz - 18 + k * 5.5;
        st.push({ x: x + 2.4, z: z - 2.2, yaw: -PI / 2 }, { x: x + 2.4, z: z + 2.4, yaw: -PI / 2 });
      }
      for (let k = 0; k < 4; k++) st.push({ x: -139 + k * 1.3, z: cz - 18.1, yaw: PI });
      push({ ...base, id, tags: rule.tags, x: -140, z: cz - 4, stands: stands(st), weight: 1.4 });
    } else if (a.id.endsWith(':city:fish-market')) {
      const cx = a.x + 8, cz = a.z - 8.5, st: StandSlot[] = [];
      for (let k = 0; k < 3; k++) { const x = cx - 17 + k * 8; st.push({ x: x - 1.4, z: cz + 4.5, yaw: PI }, { x: x + 1.2, z: cz + 4.6, yaw: PI }, { x: x + 0.1, z: cz + 5.4, yaw: PI }); }
      push({ ...base, id, tags: rule.tags, x: cx - 9, z: cz + 4.5, stands: stands(st), weight: 1.3 });
    } else if (a.id.endsWith(':city:craft')) {
      const cx = a.x, cz = a.z + 9, st: StandSlot[] = [];
      for (let k = 0; k < 3; k++) { const x = cx - 14 + k * 12; st.push({ x: x - 1.5, z: cz - 17.2, yaw: PI }, { x: x + 0.4, z: cz - 17.6, yaw: PI }); }
      push({ ...base, id, tags: rule.tags, x: cx, z: cz - 16, stands: stands(st) });
    } else if (/:port$/.test(a.id)) {
      const cx = a.x, bz = a.z - 4, st: StandSlot[] = [];   // pirogues lie between bz − 13 and bz − 23
      for (let k = 0; k < 5; k++) st.push({ x: cx - 17 + k * 8 + 1.6, z: bz - 17.5, yaw: -PI / 2 + 0.3 }, { x: cx - 17 + k * 8 - 1.6, z: bz - 18.2, yaw: PI / 2 - 0.3 });
      push({ ...base, id, tags: rule.tags, x: cx, z: bz - 18, stands: stands(st), weight: 1.3 });
    } else if (/:gym$/.test(a.id)) {
      const cx = a.x, cz = a.z - 2, st: StandSlot[] = [];
      for (let k = 0; k < 3; k++) st.push({ x: cx - 8 + k * 8, z: cz - 2.4, yaw: PI });
      st.push(...ring(cx - 5, cz + 1.2, 1.6, 4, PI / 4), ...ring(cx + 5, cz + 1.2, 1.6, 4, PI / 4));
      const seats = claim(s => s.space === 'street' && s.id.startsWith(a.id + ':amb:'));
      push({ ...base, id, tags: rule.tags, x: cx, z: cz, seats, stands: stands(st) });
    } else if (/:ecurie$/.test(a.id)) {
      push({ ...base, id, tags: rule.tags, x: a.x, z: a.z - 2, stands: stands([...pair(a.x + 0.5, a.z - 5.2, PI / 2), ...pair(a.x - 1.8, a.z - 6.9, 0.6), ...pair(a.x + 2.6, a.z + 0.4, -0.5)]) });
    } else if (/:arena$/.test(a.id) && inp.arena) {
      const { cx, cz } = inp.arena, st: StandSlot[] = [];
      for (let k = 0; k < 7; k++) for (const sx of [-0.6, 0.6]) st.push({ x: cx + sx, z: cz - WALL_R - 4.3 - k * 1.45, yaw: 0 });
      push({ ...base, id, tags: rule.tags, x: cx, z: cz - WALL_R - 8, stands: stands(st) });
    } else if (a.id.endsWith(':city:bank')) {
      const cx = a.x, cz = a.z - 1.5;
      const seats = claim(s => s.space === 'street' && Math.abs(s.x - cx) < 16 && Math.abs(s.z - (cz - 5)) < 10);
      push({ ...base, id, tags: rule.tags, x: cx, z: cz - 6, seats, stands: stands([-2.6, -1.3, 0, 1.3, 2.6].map(dx => ({ x: cx + dx, z: cz - 6.1 + (dx === 0 ? 0.9 : 0), yaw: PI }))) });
    } else if (a.id.includes(':city:mall-juice')) {
      push({ ...base, id, tags: rule.tags, x: a.x, z: a.z - 1.5, stands: stands([{ x: a.x - 2.1, z: a.z - 1.6, yaw: PI + 0.3 }, { x: a.x + 2.1, z: a.z - 1.6, yaw: PI - 0.3 }]) });
    } else if (a.id.includes(':city:mall-')) {
      const sx = a.x, cz = a.z + 6.3;
      push({ ...base, id, tags: rule.tags, x: sx, z: cz - 12, stands: stands([0, 1, 2].map(k => ({ x: sx - 1.2 + k * 1.4, z: cz - 13.7, yaw: PI }))) });
    } else if (/:city:(boutique|salon-tech)$/.test(a.id)) {
      const sx = a.x, cz = a.z + 4.3;
      push({ ...base, id, tags: rule.tags, x: sx, z: cz - 10, stands: stands([0, 1, 2].map(k => ({ x: sx + 0.2 + k * 1.4, z: cz - 11.5, yaw: PI }))) });
    }
  }

  // 3. landmarks and the sea front
  for (const sp of inp.layout.specials) {
    if (sp.kind === 'mosque' && !superseded(sp.x, sp.z, ['mosque'], 30)) {
      const rows = prayerRows(sp.x, sp.z - 16.2, 4, 8).filter(s => !inside(cols, s.x, s.z, 0.25));
      push({ id: `special:mosque:${sp.x},${sp.z}`, tags: ['mosque'], space: 'street', x: sp.x, z: sp.z - 15, rows, stands: stands(ring(sp.x, sp.z - 13.2, 3.4, 8, PI / 8)), source: 'special' });
    }
    if (sp.kind === 'pitch') push({ id: `special:pitch:${sp.x},${sp.z}`, tags: ['pitch'], space: 'street', x: sp.x, z: sp.z, area: [sp.x - 17, sp.z - 12, sp.x + 17, sp.z + 12], source: 'special' });
  }
  const seg = (from: number, to: number) => { const out: [number, number][] = []; for (let a = from; a < to - 20; a += 60) out.push([a, Math.min(to, a + 60)]); return out; };
  if (inp.layout.sea === 'west') {
    const PX = -HALF - 4.6;
    for (const [z0, z1] of seg(-120, 120)) push({ id: `sea:promenade:${z0}`, tags: ['promenade'], space: 'street', x: PX, z: (z0 + z1) / 2, route: [{ x: PX - 0.6, z: z0 }, { x: PX - 0.6, z: z1 }], source: 'sea' });
  }
  if (inp.layout.sea === 'north') {
    const Z = -HALF - 14;                                                             // beyond the Ngor pirogues
    for (const [x0, x1] of [[-120, -62], [-58, 18], [42, 120]] as const) {
      const mx = (x0 + x1) / 2;
      push({ id: `sea:beach:${x0}`, tags: ['beachwalk'], space: 'street', x: mx, z: Z, route: [{ x: x0, z: Z }, { x: x1, z: Z }], stands: ring(mx - 8, Z - 9, 1.4, 4, 0.4).concat(ring(mx + 9, Z - 7, 1.3, 3, 1.1)), source: 'sea' });
    }
  }

  // 4. remaining seats: each bench is a place to sit; each interior with chairs is one spot
  const byGroup = new Map<string, SeatLike[]>();
  for (const s of inp.seats) {
    if (taken.has(s.id) || s.kind === 'vehicle' || s.kind === 'bed' || s.space === 'home') continue;
    const key = s.space === 'street' ? s.id.replace(/:[^:]*$/, '') : s.space;
    const list = byGroup.get(key) ?? []; list.push(s); byGroup.set(key, list);
  }
  for (const [key, list] of byGroup) {
    const space = list[0].space, street = space === 'street';
    const rule = street ? null : LEGACY_TAGS.find(r => space.includes(r.has));
    const tags = street ? ['bench'] : rule?.tags ?? ['indoor'];
    for (const s of list) taken.add(s.id);
    push({ id: `${street ? 'seats' : 'interior'}:${key}`, tags, space, x: list.reduce((v, s) => v + s.x, 0) / list.length, z: list.reduce((v, s) => v + s.z, 0) / list.length,
      seats: list.map(s => s.id), hours: rule?.hours, source: street ? 'seats' : 'interior', prio: street ? 1.3 : 1 });
  }

  // 5. street corners: a few pairs chatting on the sidewalk corners, away from the other spots
  for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if ((a * 7 + b * 3 + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0)) % 6 !== 0) continue;
    const x = roadC(a) + sx * (LANE + 1.1), z = roadC(b) + sz * (LANE + 1.1);
    if (Math.abs(x) > HALF || Math.abs(z) > HALF || spots.some(s => s.space === 'street' && Math.hypot(s.x - x, s.z - z) < 12)) continue;
    const slots = stands(pair(x, z, Math.atan2(sx, -sz)));
    if (slots.length === 2) push({ id: `corner:${a},${b},${sx},${sz}`, tags: ['corner'], space: 'street', x, z, stands: slots, source: 'corner', prio: 1.6 });
  }
  return spots;
}
