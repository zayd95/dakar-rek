import type { Canopy, Collider, KeepClear } from '../types';
import type { Seat } from '../../interact/seats';
import type { PersonLook } from '../../actors/humanoid';
import type { HubWorld } from '../types';
import { drawPalm } from '../villaCompound';
import { linesOf, stopOnLeg } from '../../transport/lines';
import { GROUND, HALF, siteDraw, type DistrictKit, type PlanSeat, type Rect, type Site } from './contract';
import { bench, planter, siteRng } from './parts';

/**
 * LD2.0-E round 3 « Life on the ground » (docs/ld2/LD2_E.md decision 8): « some streets feel too empty, the open sandy areas need more landscaping and street activity ».
 * What the district leaves between its buildings is planted and furnished, in the hub's own batches (no mesh of its own), after the sites are drawn:
 *
 *   the port's plaza    a paved approach to the pier, a round plaza, palm avenues, flowerbeds, lawns hedged in, benches to the sea, a fish stall and a tea stall with their sellers
 *   the gare's garden   the open ground south and east of the station: palms, beds, benches facing the cars, a tea stall with stools
 *   the square's ring   palms and beds round the meeting square, an ice-cream cart and a corn grill with their sellers
 *   the three avenues   palms on the kerb every ~15 m along the Route des Almadies, the Avenue du Littoral and the Rue du Mall, never at a junction, a bus stop or an opening
 *
 * Everything stands where nothing else does: a spot is taken only if it is clear of every collider the hub has by then, every keep-clear rectangle, every site and its walk-in
 * openings, every stop of the bus line, the footprints of the modules that build after the hub (the dealership, the mall, the station's own, the square's), and of what this
 * module has put down. The pavement's walking lanes (src/crowd/streetPlan.ts `pavementLanes`) stay as they are: a kerb palm stands 6.55 m from the road's centre line, its
 * foot 0.4 m across, past the outermost lane (5.95 + a body's 0.32). No random number is drawn (the street stays the same on every client). `STREETSCAPE.on = false` draws none of it.
 */
export const STREETSCAPE = { on: true };

/** What is on the ground when this module draws. */
export interface StreetGround { colliders: readonly Collider[]; keepClear: readonly KeepClear[]; sites: readonly Site[]; /** The sites' walk-in openings, in the hub (src/world/almadies/district.ts). */ openings: readonly Rect[] }
export interface Streetscape {
  colliders: Collider[]; canopies: Canopy[]; seats: Seat[]; people: HubWorld['people'];
  /** What was put down, by kind (the checks and the doc). */
  counts: Record<string, number>;
  /** Everything solid it drew, with what it is (the in-game check reads it). */
  placed: { kind: string; x: number; z: number }[];
}

const WORLD: Site = { id: 'streetscape', kind: 'villa', variant: 0, block: [0, 0], lots: [0], rect: { x0: -HALF - 3, z0: -HALF - 3 - 11 - 250, x1: HALF + 3, z1: 11 }, facing: 'south', mirror: false, storeys: 1, palette: 'sand', number: '', gate: 'centre' };
/** Road centres (x for the roads that run north–south, z for the east–west), the pavement 5…7 m from each, and the blocks between. */
const ROADS = [-120, -60, 0, 60, 120];
const KERB_OFF = 6.55;
/** The ground's top: the paved blocks (the port's, the gare's: `specialAt`) at 0.14, the others' sand at 0.13; what is laid on it lies above. */
const PAVED = 0.14, SAND = 0.13;
/** Where the modules that build after the hub stand (src/world/prestige.ts, src/world/city.ts, the gare in src/world/builder.ts): left to them. */
const DEAD: Rect[] = [
  { x0: -113, z0: 3, x1: -67, z1: 57 },        // Prestige Auto's parcel and its forecourt
  { x0: 8, z0: 8, x1: 52, z1: 52 },            // the mall (its pavements are the avenues')
  { x0: -48, z0: 12, x1: -13, z1: 42 },        // the gare: its pave, the cars, the shelter, the stalls
  // the meeting square (src/world/city.ts): the west and east clusters (benches, the checkers table, the shade, the stools and their people), the centre's tree and disc, two trees, the sign
  { x0: 75.5, z0: 18.5, x1: 82.5, z1: 41.5 }, { x0: 97, z0: 18.5, x1: 104.5, z1: 41.5 }, { x0: 82, z0: 22, x1: 98, z1: 38 }, { x0: 103.5, z0: 12, x1: 108.5, z1: 17 }, { x0: 71, z0: 41.5, x1: 77, z1: 48.5 }, { x0: 78, z0: 47.5, x1: 102, z1: 52 },
  ...[15, 29, 43].map(x => ({ x0: x - 3.2, z0: -86.6, x1: x + 3.2, z1: -81.4 })),   // the port's three market stalls (canopy, counter, posts), src/world/builder.ts `port`
];
const PORT = { x0: 8, z0: -103, x1: 52, z1: -68 };

const FISHER: PersonLook = { skin: 0x633a24, style: 'tee', top: 0x236da0, bottom: 0x31404d, hat: 'kufi', hatColor: 0xf4c443, shoes: 0x242b27, muscular: 0.4 };
const VENDOR: PersonLook = { skin: 0x78452b, style: 'dress', top: 0xd66532, bottom: 0xd66532, female: true, pattern: 'wax', accent: 0xeee1b0, hat: 'headwrap', hatColor: 0xe8b734 };
const TEAMAN: PersonLook = { ...FISHER, top: 0xeef2f6, bottom: 0x2b2f36, hat: null, muscular: 0.2 };
const SELLER2: PersonLook = { ...VENDOR, top: 0x2f8f6e, bottom: 0x2f8f6e, accent: 0xf4d35e, hatColor: 0xc23b2a };

const inside = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const gap = (c: Rect, x: number, z: number) => Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));

export function buildStreetscape(kit: DistrictKit, ground: StreetGround): Streetscape {
  const d = siteDraw(kit, WORLD), lite = kit.lite, rng = siteRng(d, 'streetscape');
  const out: Streetscape = { colliders: [], canopies: [], seats: [], people: [], counts: {}, placed: [] };
  const taken: { x: number; z: number; r: number }[] = [];
  const stops = linesOf('almadies').flatMap(l => l.stops.map(s => stopOnLeg(l, s)));
  const sitesR = ground.sites.map(s => s.rect);
  const count = (k: string) => { out.counts[k] = (out.counts[k] ?? 0) + 1; };
  /** Is the ground at (x, z) free for something `r` wide (its solid foot), `kerb`: on the pavement (a kerb item may stand within the roads' bands)? */
  let base = PAVED;
  const free = (x: number, z: number, r: number, kerb = false) => {
    const no = (why: string) => { (STREETSCAPE as { why?: string[] }).why?.push(`${why} @ ${x.toFixed(1)},${z.toFixed(1)}`); return false; };
    const m = kerb ? 0.05 : 0.25;                                                                  // a kerb item stands 0.4 m off the block's edge: the fence's own colliders are that near
    if (Math.abs(x) > HALF - 1.2 || Math.abs(z) > HALF - 1.2) return no('edge');
    if (!kerb && ROADS.some(c => Math.abs(x - c) < 7.4 || Math.abs(z - c) < 7.4)) return no('road');
    if (DEAD.some(r0 => inside(r0, x, z, r))) return no('dead');
    if (sitesR.some(r0 => inside(r0, x, z, kerb ? 0 : r + 0.3))) return no('site');
    if (ground.colliders.some(c => gap(c, x, z) < r + m) || out.colliders.some(c => gap(c, x, z) < r + m)) return no('collider');
    if (ground.keepClear.some(k => inside(k, x, z, r + 0.4)) || ground.openings.some(k => inside(k, x, z, r + 0.6))) return no('keepClear');
    if (kerb && stops.some(s => Math.hypot(s.x - x, s.z - z) < 9)) return no('stop');
    return taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + r) ? no('taken') : true;
  };
  /** A thing is down: its colliders (what the draw made solid since the last one) are the hub's, its place is taken. */
  const take = (kind: string, x: number, z: number, r: number) => { out.colliders.push(...d.colliders.splice(0)); taken.push({ x, z, r }); out.placed.push({ kind, x, z }); count(kind); };
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) => { d.solid(x0, z0, x1, z1, h); };
  const seatsOf = (list: PlanSeat[]) => list.forEach(s => out.seats.push({ id: `street:seat:${out.seats.length}`, x: s.x, z: s.z, top: s.top, yaw: s.yaw, kind: s.kind, space: 'street', occupant: null }));
  const person = (x: number, z: number, yaw: number, clip: 'Idle' | 'Talk', look: PersonLook) => out.people.push({ x, z, yaw, clip, look });

  /** A slim palm for the kerb and the beds: two drums of trunk and a crown of fronds, about 100 triangles; its foot is solid 0.4 m across. */
  const slimPalm = (x: number, z: number, sc: number, turn: number) => {
    const h = 5.6 * sc, top = GROUND + h, n = lite ? 5 : 7;
    d.cyl(d.trunks, 0.15 * sc, 0.2 * sc, h * 0.55, x, GROUND, z, d.c.bark, 5); d.cyl(d.trunks, 0.1 * sc, 0.15 * sc, h * 0.47, x + 0.06, GROUND + h * 0.55, z, d.c.bark2, 5);
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2, len = 3.0 * sc, r = len * 0.45;
      d.box(d.leaves, 0.62 * sc, 0.08 * sc, len, x + 0.1 + Math.sin(a) * r, top - 0.3 * sc - (k % 2) * 0.22, z + Math.cos(a) * r, k % 2 ? d.c.frond2 : d.c.frond, a);
    }
    d.canopies.push({ x: x + 0.1, z, r: 2.7 * sc, y0: top - 0.8 * sc, y1: top + 0.3 * sc });
    solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 3);
  };
  /** The compound's own palm (taller, ten fronds, its uplight at night) for the plazas. */
  const palm = (kind: string, x: number, z: number, sc: number, full = false) => {
    if (!free(x, z, 0.5)) return false;
    const turn = rng() * 6.28;
    if (full) drawPalm(d, x, z, sc, turn); else slimPalm(x, z, sc, turn);
    take(kind, x, z, 1.0); return true;
  };
  /** A flowerbed: a stone kerb, hedge blobs and flowering ones (`planter`), solid at the kerb's height. */
  const bed = (x: number, z: number, w: number, dd: number, bloom = d.c.bloom) => {
    if (![[-w / 2, -dd / 2], [w / 2, -dd / 2], [-w / 2, dd / 2], [w / 2, dd / 2], [0, 0]].every(([ox, oz]) => free(x + ox, z + oz, 0.4))) return false;
    planter(d, x, z, w, dd, { h: 0.45, hedge: d.c.hedge2, bloom }); solid(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, 0.6);
    take('bed', x, z, Math.max(w, dd) / 2 + 0.3); return true;
  };
  /** A bench (parts.ts `bench`): its seats go to the registry. */
  const seat = (x: number, z: number, yaw: number, o: { len?: number; n?: number } = {}) => {
    const len = o.len ?? 2.0;
    if (!free(x, z, len / 2 + 0.1)) return false;
    seatsOf(bench(d, x, z, yaw, { len, n: o.n ?? 3 })); take('bench', x, z, len / 2 + 0.4); return true;
  };
  /** A stall: a counter facing `yaw` on a stone base, four posts and a striped awning over it, goods on the counter; the seller stands behind it. */
  const stall = (x: number, z: number, yaw: number, awn: [number, number], goods: number, look: PersonLook) => {
    if (!free(x, z, 1.6)) return false;
    const at = (a: number, b: number) => [x + Math.sin(yaw) * a + Math.cos(yaw) * b, z + Math.cos(yaw) * a - Math.sin(yaw) * b] as const;       // a toward the customers, b to the right
    const c = at(0.3, 0); d.box(d.plain, 2.2, 0.9, 0.8, c[0], GROUND, c[1], d.p.wood, yaw); d.box(d.plain, 2.3, 0.06, 0.9, c[0], GROUND + 0.9, c[1], 0xe9e2d0, yaw);
    for (const sa of [-0.2, 1.0]) for (const sb of [-1.05, 1.05]) { const p = at(sa, sb); d.box(d.plain, 0.07, 2.3, 0.07, p[0], GROUND, p[1], d.p.frame, yaw); }
    for (let k = 0; k < 4; k++) { const p = at(0.4, -0.9 + k * 0.6); d.box(d.plain, 0.62, 0.05, 1.6, p[0], GROUND + 2.3 + k * 0.012, p[1], awn[k % 2], yaw + 0.0); }
    for (let k = 0; k < goods; k++) { const p = at(0.3, -0.8 + (k / Math.max(1, goods - 1)) * 1.6); d.blob(d.leaves, 0.17, p[0], GROUND + 1.08, p[1], k % 2 ? 0xf0a63b : 0x6aa84f, 0.9, 0); }
    solid(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 1.0);
    const s = at(-0.7, 0); person(s[0], s[1], yaw, 'Idle', look);
    take('stall', x, z, 2.0); return true;
  };
  const crate = (x: number, z: number, n: number) => { if (!free(x, z, 0.5)) return; for (let k = 0; k < n; k++) d.box(d.plain, 0.55, 0.3, 0.4, x + (k % 2) * 0.1, GROUND + k * 0.3, z, k % 2 ? 0xb98a5a : 0xa4783f, k * 0.4); solid(x - 0.35, z - 0.3, x + 0.35, z + 0.3, 0.3 * n); take('crate', x, z, 0.8); };
  const paved = (x0: number, z0: number, x1: number, z1: number, col: number, y = base + 0.004) => d.flat(d.pave, x1 - x0, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2, col);
  const lawn = (x0: number, z0: number, x1: number, z1: number) => {
    if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].every(([x, z]) => free(x, z, 0.3))) return false;
    paved(x0, z0, x1, z1, d.c.lawn, base + 0.012);
    const hw = 0.28;
    for (const [a, b, c, e] of [[x0, z0, x1, z0 + hw], [x0, z1 - hw, x1, z1], [x0, z0, x0 + hw, z1], [x1 - hw, z0, x1, z1]]) d.box(d.leaves, c - a, 0.55, e - b, (a + c) / 2, GROUND, (b + e) / 2, d.c.hedge);
    take('lawn', (x0 + x1) / 2, (z0 + z1) / 2, 0.2); return true;
  };

  // ------------------------------------------------------------------------------------------------ the port's plaza
  {
    const cx = 30, P = PORT, STONE = 0xf0e6cd, EDGE = 0xb0623a, INLAY = 0xd9884f;
    paved(cx - 4.5, P.z0, cx + 4.5, P.z1, STONE); paved(cx - 4.5, P.z0, cx - 4.1, P.z1, EDGE); paved(cx + 4.1, P.z0, cx + 4.5, P.z1, EDGE);        // the approach to the pier, with its edging
    paved(P.x0 + 1, P.z0 + 1.5, P.x1 - 1, P.z0 + 4.5, STONE); paved(P.x0 + 1, P.z0 + 4.2, P.x1 - 1, P.z0 + 4.5, EDGE);                          // the sea-front walk
    const PZ = -73.5;                                                                                                                         // the round plaza's centre: south of the market stalls
    d.cyl(d.pave, 6.4, 6.4, 0.016, cx, base + 0.002, PZ, EDGE, lite ? 14 : 24); d.cyl(d.pave, 5.5, 5.5, 0.02, cx, base + 0.004, PZ, STONE, lite ? 14 : 24); d.cyl(d.pave, 2.4, 2.4, 0.024, cx, base + 0.006, PZ, INLAY, lite ? 12 : 20);
    // palm avenues either side of the approach, and the sea-front's
    for (const x of [cx - 10.5, cx + 10.5]) for (let z = -96; z <= -70; z += 8.5) palm('palm', x, z, 1.0 + rng() * 0.2, true);
    for (const x of [P.x0 + 4, P.x0 + 14, P.x1 - 14, P.x1 - 4]) palm('palm', x, P.z0 - 2.6, 1.05 + rng() * 0.15, true);
    // the lawns, hedged in, between the sea-front walk and the market stalls; the beds at the road end of the approach and by the pier's foot
    lawn(P.x0 + 2, -96.5, cx - 13, -90); lawn(cx + 13, -96.5, P.x1 - 2, -90);
    for (const [x, z] of [[cx - 7, -69.2], [cx + 7, -69.2]]) bed(x, z, 5, 1.3, rng() < 0.5 ? d.c.bloom : d.c.bloom2);
    for (const [x, z] of [[cx - 6, -95], [cx + 6, -95]]) bed(x, z, 4.4, 1.2);
    // benches: to the sea along the walk, to the pier along the approach, round the plaza
    for (const x of [16, 24, 36, 44]) seat(x, P.z0 + 1.1, Math.PI, { len: 2.2, n: 3 });
    for (const z of [-96, -79]) { seat(cx - 5.3, z, Math.PI / 2, { len: 2.0, n: 2 }); seat(cx + 5.3, z, -Math.PI / 2, { len: 2.0, n: 2 }); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; seat(cx + Math.sin(a) * 7.7, PZ + Math.cos(a) * 7.7, a + Math.PI, { len: 1.8, n: 2 }); }
    // the market's own three stalls (src/world/builder.ts) have their sellers behind the counters; a fishmonger's and a tea stall at either end of the plaza, fish crates and two fishermen at the pier's foot
    person(15, -86.9, 0, 'Talk', VENDOR); person(29, -86.9, 0, 'Idle', TEAMAN); person(43, -86.9, 0, 'Talk', SELLER2);
    stall(14, -73.8, 0, [0x2b86b0, 0xf4f1e8], 5, VENDOR); stall(46, -73.8, 0, [0xc2663a, 0xf4f1e8], 4, TEAMAN);
    crate(21, -100.4, 3); crate(39, -100.4, 3);
    person(cx - 3.2, P.z0 + 0.4, Math.PI / 2, 'Talk', FISHER); person(cx - 1.9, P.z0 + 0.4, -Math.PI / 2, 'Talk', SELLER2);
  }

  // ------------------------------------------------------------------------------------------------ the gare's garden (the open ground round the station)
  {
    const G = { x0: -52, z0: 43, x1: -8, z1: 51 };
    paved(G.x0 + 2, 45.2, G.x1 - 2, 48.4, 0xdccfae); paved(G.x0 + 2, 45.2, G.x1 - 2, 45.5, 0xbfa87c);
    for (let x = G.x0 + 5; x <= G.x1 - 4; x += 8.2) palm('palm', x, 49.8, 1.0 + rng() * 0.2);
    for (const x of [-44, -35, -19, -12]) seat(x, 44.4, Math.PI, { len: 2.2, n: 3 });
    for (const x of [-46, -16]) bed(x, 51.3, 5, 1.3);
    bed(-10.6, 20, 1.3, 6); bed(-10.6, 33, 1.3, 6); bed(-50.4, 20, 1.3, 7);
    for (const z of [14, 40]) palm('palm', -10.2, z, 1.1); palm('palm', -50.6, 14, 1.0);
    stall(-27, 44.9, Math.PI, [0x7a5434, 0xf4f1e8], 4, TEAMAN);
    for (const dx of [-1.2, 0, 1.2]) { const x = -27 + dx, z = 42.6; if (free(x, z, 0.3)) { const s = { x, z, yaw: 0, kind: 'stool' as const, top: 0.45 + GROUND }; d.box(d.plain, 0.34, 0.45, 0.34, x, GROUND, z, d.p.wood); out.seats.push({ id: `street:seat:${out.seats.length}`, x: s.x, z: s.z, top: s.top, yaw: Math.PI, kind: s.kind, space: 'street', occupant: null }); take('stool', x, z, 0.5); } }
  }

  // ------------------------------------------------------------------------------------------------ the square (the meeting place's sand: gardens round its centre)
  {
    base = SAND;
    const STONE = 0xf0e6cd, EDGE = 0xb0623a;
    paved(88.4, 9.5, 91.6, 22, STONE); paved(88.4, 38, 91.6, 50.5, STONE);                                                      // the paths from the road to the centre's disc, north and south
    for (const x of [88.2, 91.8]) { paved(x - 0.1, 9.5, x + 0.1, 22, EDGE); paved(x - 0.1, 38, x + 0.1, 50.5, EDGE); }
    lawn(76, 11.4, 87, 16.4); lawn(93, 11.4, 101.5, 16.4); lawn(78.5, 43, 87, 47); lawn(93, 43, 104, 47);                         // four lawns, hedged in, either side of the paths
    for (const [x, z] of [[85.5, 19.4], [93.8, 19.4], [85.5, 40.6], [93.8, 40.6]]) bed(x, z, 4.6, 1.3, rng() < 0.5 ? d.c.bloom : d.c.bloom2);
    for (const x of [70.6, 109.4]) for (let z = 18; z <= 44; z += 8.7) palm('palm', x, z, 1.0 + rng() * 0.2);
    for (const x of [82.2, 97.8]) for (const z of [13.8, 45]) palm('palm', x, z, 1.1 + rng() * 0.15, true);
    stall(71.2, 10.6, 0, [0xd94a8c, 0xf4f1e8], 4, SELLER2); stall(108.8, 49.4, Math.PI, [0x2f8f6e, 0xf4f1e8], 3, TEAMAN);
    for (const [x, z] of [[78, 9.8], [102, 9.8]]) seat(x, z, 0, { len: 2.2, n: 3 });
  }

  // ------------------------------------------------------------------------------------------------ the three avenues
  {
    // the busy avenues every 11 m, the cross streets every 20 m: both pavements, never at a junction (10 m), a stop, a gate or an opening
    const roads: { axis: 'x' | 'z'; c: number; sides: number[]; step: number }[] = [
      { axis: 'z', c: -120, sides: [1], step: 11 }, { axis: 'x', c: 0, sides: [-1, 1], step: 11 }, { axis: 'z', c: 60, sides: [-1, 1], step: 11 },
      { axis: 'z', c: -60, sides: [-1, 1], step: 20 }, { axis: 'x', c: -60, sides: [-1, 1], step: 20 }, { axis: 'x', c: 60, sides: [-1, 1], step: 20 },
    ];
    for (const r of roads) for (const s of r.sides) {
      for (let t = -110 + (s > 0 ? r.step / 2 : 0); t <= 110; t += r.step) {
        if (ROADS.some(j => Math.abs(t - j) < 10)) continue;
        const x = r.axis === 'z' ? t : r.c + s * KERB_OFF, z = r.axis === 'z' ? r.c + s * KERB_OFF : t;
        if (free(x, z, 0.2, true)) { slimPalm(x, z, 0.95 + rng() * 0.25, rng() * 6.28); take('kerb palm', x, z, r.step * 0.4); }
      }
    }
  }
  out.canopies.push(...d.canopies);
  return out;
}
