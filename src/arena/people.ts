import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { HubWorld } from '../world/types';
import { SIT_HIPS, type Seat } from '../interact/seats';
import type { TargetSource } from '../interact/types';
import type { ActivitySpec } from '../activity/types';
import { randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { Batch } from '../world/batch';
import * as P from '../activity/primitives';
import { tasteLine, waitLine } from '../i18n/lines';
import { Cast, type Role } from '../venues/cast';
import { ARENA_FLOOR, PREP_SIDE, WALKWAY_R, interiorSpots } from '../world/arenaModules';
import { WALL_R } from '../world/geew';
import { arenaFighter, type FighterCue } from './fighter';
import { ARENA_PURCHASES, ECURIES } from './exteriorRules';
import type { Moment, Quality, ShowPhase, Street } from './program';

/**
 * Every person inside the walls of the Pikine arena on a fight night: the officials at their table and the announcer,
 * the judges on their folding chairs at the sandbags, the referee in the ring, the drummers' group on its deck by the
 * wrestlers' tunnel with its dancers, the press at their table and the cameramen, vendors walking the front of the stands
 * (they stop by you and sell café Touba, bissap, water, peanuts), a helper in each écurie's preparation corner, and each
 * wrestler's entourage — the flag, the coach, helpers — who walk out of the tunnel behind their wrestler, wait in their
 * corner during the bout and run onto the sand when theirs wins.
 *
 * Built on the venues' Cast and roles (src/venues/cast.ts): every person is shown only in the moments of the evening
 * they belong to; the officials, judges and press sit on real seats of the shared registry that stay theirs between two
 * shows (no passer-by of src/social/ambientLife.ts, nor the player, sits at the ring side); walkers follow paths. They
 * live outside the arena's `noLod` group, so the shared humanoid budget (src/actors/crowdLod.ts) keeps the nearest as
 * full bodies and swaps the far ones for cheap figures.
 *
 * Positions come from the structure the builder draws (src/world/arenaModules.ts `interiorSpots`, `prepCorner`): the
 * drummers' deck, the officials' table, the press table and its cameras, the écuries' corners (on the side `PREP_SIDE`
 * gives each), the walkway in front of the stands, the tunnel. When the player fights tonight (src/arena/fighter.ts), their
 * écurie's people wait in its corner and gather round them there (`arenaFighter.onCue`).
 */
const TAU = Math.PI * 2;
/** Layout of the people (metres and angles from the arena centre; angles as atan2(x, z), the public gate at π, the tunnel at 0). */
export const PEOPLE = {
  /** The builder's judges' folding chairs at the sandbags, in the order they are taken (the one on the runner last). */
  judges: { r: 9.9, angles: [Math.PI / 2, (3 * Math.PI) / 2, Math.PI / 4, -Math.PI / 4, 0] },
  /** The drummers' group's dancers, on the sand in front of the deck. */
  dancers: { a: [0.36, 0.48], r: 12.3 },
  /** The walkway in front of the parapet, the vendors' arcs: never through the public gate nor the tunnel. */
  walk: { r: WALKWAY_R, arcs: [[0.62, 2.5], [-0.62, -2.5]] as [number, number][] },
  /**
   * The entourages' way between the tunnel and their corner: out past the end of the tunnel's railings, round in front of
   * the drummers' deck and its dancers, into the corner by its open side (the one facing the tunnel); onto the sand
   * through the gap in the boards by the tunnel.
   */
  way: { out: { x: 1.0, z: 11.0 }, round: { a: 0.6, r: 11.5 }, side: { a: 0.64, r: 13.2 }, gap: { x: 1.3, z: 9.6 } },
} as const;
/**
 * Their weight in the shared humanoid budget (src/social/ambientLife.ts): the people in the spotlight (the entourage
 * walking in, the winner's people, a vendor by the player, the player's own corner) count at their distance; the others
 * as if 2.4 times farther, so from the tiers they are cheap figures and only the ones close by get a full body. The
 * arena's own draw calls stay within the visit's budget (scripts/check-arena-visit.mjs).
 */
export const LOD_PRIO = { spotlight: 1, background: 2.4 } as const;
/** Inside the walls they can be seen from inside, or from the street through the two gates (camera within these metres). */
export const SEEN_FROM_GATE = 14;
export function seenFrom(cx: number, cz: number, cam: { x: number; z: number }): boolean {
  return Math.hypot(cam.x - cx, cam.z - cz) < WALL_R + 0.5 || Math.hypot(cam.x - cx, cam.z - (cz - WALL_R)) < SEEN_FROM_GATE
    || Math.hypot(cam.x - cx, cam.z - (cz + WALL_R)) < SEEN_FROM_GATE;
}
/** How many of each by graphics quality (the shared humanoid budget keeps the nearest as full bodies). */
export const PEOPLE_COUNT: Record<Quality, { judges: number; officials: number; drummers: number; vendors: number; entourage: number; camp: number; press: number; media: number }> = {
  low: { judges: 2, officials: 2, drummers: 3, vendors: 1, entourage: 1, camp: 1, press: 1, media: 0 },
  medium: { judges: 3, officials: 3, drummers: 5, vendors: 2, entourage: 2, camp: 1, press: 2, media: 1 },
  high: { judges: 5, officials: 3, drummers: 6, vendors: 3, entourage: 4, camp: 1, press: 2, media: 2 },
};

/** The moment of the evening the people follow: the show's phase, else the street's state. */
export type PeopleMoment = 'closed' | 'setup' | 'doors' | Exclude<ShowPhase, 'idle' | 'over'>;
export function peopleMoment(phase: ShowPhase, street: Street): PeopleMoment {
  if (phase !== 'idle' && phase !== 'over') return phase;
  return street === 'doors' ? 'doors' : street === 'setup' ? 'setup' : 'closed';
}
type Who = 'officials' | 'announcer' | 'judges' | 'referee' | 'drummers' | 'warmup' | 'vendors' | 'press' | 'camp' | 'entourage';
/** Who is there at each moment (pure; tests/arenaPeople.test.ts). The duel brings its own referee for the bout and the result. */
export const PRESENT: Record<Who, readonly PeopleMoment[]> = {
  officials: ['setup', 'doors', 'filling', 'entrance', 'bout', 'result', 'leaving'],
  announcer: ['doors', 'filling', 'entrance', 'bout', 'result'],
  judges: ['filling', 'entrance', 'bout', 'result'],
  referee: ['filling', 'entrance'],
  drummers: ['filling', 'entrance', 'bout', 'result', 'leaving'],
  /** The first two drummers warm up while the doors are open. */
  warmup: ['doors', 'filling', 'entrance', 'bout', 'result', 'leaving'],
  vendors: ['doors', 'filling', 'entrance', 'bout', 'result'],
  /** The press and the cameramen, for the gala. */
  press: ['doors', 'filling', 'entrance', 'bout', 'result'],
  /** One helper of each écurie prepares its corner (water, buckets) from the doors. */
  camp: ['doors', 'filling', 'entrance', 'bout', 'result', 'leaving'],
  /** They come in with their wrestler. */
  entourage: ['entrance', 'bout', 'result', 'leaving'],
};
/** The Cast's moment is `moment|écurie of the player fighting tonight` (empty when nobody fights). */
const momentOf = (key: string) => key.split('|')[0] as PeopleMoment;
const fighterOf = (key: string) => key.split('|')[1] ?? '';
const at = (list: readonly PeopleMoment[]) => (key: string) => list.includes(momentOf(key));

/** A point at angle `a` (atan2(x, z)) and radius `r` from the centre. */
export const polar = (cx: number, cz: number, a: number, r: number) => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
const facing = (cx: number, cz: number, p: { x: number; z: number }) => Math.atan2(cx - p.x, cz - p.z);

export interface Spot { x: number; y: number; z: number; yaw: number; clip: Clip }
/**
 * The drummers' group in the order they come: the two middle drummers of the deck (they warm up at doors-open), the
 * lead dancer on the sand, the two outer drummers, a second dancer.
 */
export function drummerSpots(cx: number, cz: number): Spot[] {
  const deck = interiorSpots(cx, cz).filter(s => s.role === 'drummer');
  const drum = (k: number): Spot => ({ x: deck[k].x, y: deck[k].y, z: deck[k].z, yaw: deck[k].yaw, clip: 'Talk' });
  const dancer = (a: number, clip: Clip): Spot => { const p = polar(cx, cz, a, PEOPLE.dancers.r); return { ...p, y: ARENA_FLOOR, yaw: facing(cx, cz, p), clip }; };
  return [drum(1), drum(2), dancer(PEOPLE.dancers.a[0], 'Dance_A'), drum(0), drum(3), dancer(PEOPLE.dancers.a[1], 'Dance_B')];
}
export type Ecurie = 'baobab' | 'teranga';
/** An écurie's preparation corner (src/world/arenaModules.ts `prepCorner`): its mat at angle side · 0.78, radius 13.6. */
export const CORNER = { a: 0.78, r: 13.6 } as const;
/**
 * Where an écurie's people stand in its corner, on the mat between the front rail and the bench, facing the ring: a front
 * row of three (the coach in the middle, then either side), a back row of two by the buckets, either side of the mat's
 * centre (where a fighting player stands). Mirrored for the two sides.
 */
export function cornerSpots(cx: number, cz: number, side: 1 | -1): { x: number; z: number; yaw: number }[] {
  return ([[0, 12.95], [-0.78, 12.95], [0.78, 12.95], [-0.6, 13.6], [0.6, 13.6]] as const).map(([o, r]) => {
    const p = polar(cx, cz, side * (CORNER.a + o / r), r);
    return { ...p, yaw: facing(cx, cz, p) };
  });
}
/** Where the k-th of a side's entourage waits in its corner (k 0 the coach, 1 a helper, 2 the flag, 3 a helper). */
export const cornerSpot = (cx: number, cz: number, side: 1 | -1, k: number) => cornerSpots(cx, cz, side)[k];
/** Where each écurie's corner helper stands, by the buckets at the back of the corner. */
export const campSpot = (cx: number, cz: number, side: 1 | -1) => cornerSpots(cx, cz, side)[4];
/** Their place in the file walking out of the tunnel: the flag first, then the coach, the helpers (so nobody crosses another in the corner). */
const FILE = [1, 2, 0, 3];
/**
 * The way an écurie's people walk in: from the tunnel, behind their wrestler, out past the railings, round in front of
 * the drummers' deck, into their corner by its open side.
 */
export function entouragePath(cx: number, cz: number, side: 1 | -1, k: number): { x: number; z: number }[] {
  const s = side, w = PEOPLE.way, q = FILE[k] ?? k;
  return [
    { x: cx + s * (q % 2 ? 1.0 : 0.5), z: cz + 19.1 + q * 0.75 },
    { x: cx + s * w.out.x, z: cz + w.out.z },
    polar(cx, cz, s * w.round.a, w.round.r),
    polar(cx, cz, s * w.side.a, w.side.r),
    cornerSpot(cx, cz, side, k),
  ];
}
/** The winner's people from their corner onto the sand, through the gap in the boards by the tunnel. */
export function celebratePath(cx: number, cz: number, side: 1 | -1, k: number): { x: number; z: number }[] {
  const s = side, w = PEOPLE.way;
  return [
    polar(cx, cz, s * w.side.a, w.side.r),
    polar(cx, cz, s * w.round.a, w.round.r),
    { x: cx + s * w.out.x, z: cz + w.out.z },
    { x: cx + s * w.gap.x, z: cz + w.gap.z },
    { x: cx + s * (2.2 + (k % 2) * 0.8), z: cz - 0.8 + Math.floor(k / 2) * 0.9 },
  ];
}

// ------------------------------------------------------------------ vendors walking the stands
interface VendorKind { key: string; seller: string; female: boolean; call: string; offers: (seller: string) => ActivitySpec[] }
/** What the vendors inside sell (the same prices as the stalls outside, src/arena/exteriorRules.ts). */
export const STAND_VENDORS: readonly VendorKind[] = [
  { key: 'touba', seller: 'Sokhna', female: true, call: '« Café Touba ! Café Touba chaud ! »', offers: s => [
    P.order({ id: 'touba', label: 'Café Touba', detail: 'Épicé au djar, servi dans un gobelet', price: 150, prep: 1, eat: 2, drink: true, seat: false, needs: { energie: 8, moral: 2 }, line: waitLine(s) }),
    P.order({ id: 'bissap', label: 'Bissap glacé', detail: 'Un sachet frais pour le combat', price: 300, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 4, faim: 2 }, line: waitLine(s) }),
  ] },
  { key: 'eau', seller: 'Binta', female: true, call: '« Eau fraîche ! Sachets d’eau ! »', offers: () => [
    P.order({ id: 'eau', label: 'Sachet d’eau fraîche', price: 50, prep: 0.5, eat: 1.5, drink: true, seat: false, needs: { moral: 1, energie: 2 } }),
  ] },
  { key: 'arachides', seller: 'Abdou', female: false, call: '« Arachides grillées ! Encore chaudes ! »', offers: () => [
    P.order({ id: 'arachides', label: 'Cornet d’arachides grillées', detail: 'Encore chaudes', price: 200, prep: 1, eat: 3, seat: false, needs: { faim: 10, moral: 2 }, eatLine: tasteLine }),
  ] },
];
const counted = (a: ActivitySpec): ActivitySpec => {
  const step = [...a.steps].reverse().find(s => s.effects);
  if (step) step.effects = { ...step.effects, counters: { ...step.effects!.counters, [ARENA_PURCHASES]: 1 } };
  return a;
};
/** A vendor's back-and-forth along an arc of the walkway: angular position after `dt` (returns the new angle and direction). */
export function walkArc(a: number, dir: 1 | -1, arc: readonly [number, number], dt: number, speed = 1.0, r: number = PEOPLE.walk.r): { a: number; dir: 1 | -1 } {
  const lo = Math.min(arc[0], arc[1]), hi = Math.max(arc[0], arc[1]);
  let n = a + dir * (speed * dt) / r, d = dir;
  if (n > hi) { n = hi - (n - hi); d = -1; } else if (n < lo) { n = lo + (lo - n); d = 1; }
  return { a: THREE.MathUtils.clamp(n, lo, hi), dir: d };
}

// ------------------------------------------------------------------ looks
const REFEREE: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xf2f2ec, bottom: 0x1c1c1f, shoes: 0x1c1c1f };
const OFFICIAL = (r: () => number): PersonLook => ({ skin: [0x3b2216, 0x4e2e1c, 0x5b3420][Math.floor(r() * 3)], style: 'boubou', top: [0xf2f2ec, 0x9cc8e8, 0x27407a][Math.floor(r() * 3)], hat: r() < 0.5 ? 'kufi' : undefined, hatColor: 0xf2f2ec, beard: r() < 0.5 ? 0x1a1414 : undefined, shoes: 0x3a2a1e, heavy: 0.3 });
const DRUMMER = (r: () => number, dancer: boolean): PersonLook => ({ ...randomLook(r), style: dancer ? 'tee' : 'boubou', pattern: dancer ? 'uni' : 'wax', top: dancer ? 0xf4c20d : [0xd9322b, 0x1a9d54, 0xf2f2ec, 0x2f6fb3][Math.floor(r() * 4)], bottom: 0x2b2f3a, female: false, muscular: 0.4 });
const PRESS = (r: () => number, dark: number): PersonLook => ({ ...randomLook(r), style: 'tee', top: dark, pattern: 'uni' });

interface Side { ecurie: Ecurie; side: 1 | -1; colour: number; ids: string[]; camp: string[]; started: boolean }
interface Walker { id: string; kind: VendorKind; arc: readonly [number, number]; a: number; dir: 1 | -1; pause: number; called: number }

/** The fight night of the current hub (the arena interior's debug reads who is inside). */
export const fightNight: { current: FightNightPeople | null } = { current: null };

/** The fight night's people of one arena (one per hub with an arena; driven by the arena evening). */
export class FightNightPeople {
  readonly group = new THREE.Group();
  readonly seats: Seat[] = [];
  /** Debug: force the people of a fight night in (true: as if the doors were open) or out (false); null follows the evening. */
  force: boolean | null = null;
  private cast: Cast | null;
  private moment: PeopleMoment | '' = '';
  private sides: Side[];
  private walkers: Walker[] = [];
  private roles: { id: string; who: string }[] = [];
  private own: { dispose(): void }[] = [];
  private won: Ecurie | null = null;
  /** The écurie of the player fighting tonight while their path is on (src/arena/fighter.ts), else null. */
  private fighter: Ecurie | null = null;
  private key = '';
  private offCue: () => void;
  private t = 0;
  /** When a vendor last called out (one call at a time, so the show's own lines stay readable). */
  private lastCall = -99;
  /** When the people's weights in the shared budget were last set. */
  private weighT = 0;
  private readonly sourceName: string;

  constructor(private ctx: GameCtx, hub: HubWorld, private cx: number, private cz: number) {
    const q = ctx.quality(), N = PEOPLE_COUNT[q], R = rng(2026), id = `${hub.id}:arena`, F = ARENA_FLOOR;
    this.group.name = 'arena_people';
    this.sourceName = `${id}:vendeurs`;
    const roles: Role[] = [];
    const add = (r: Role, who: string) => { roles.push(r); this.roles.push({ id: r.id, who }); };
    const stand = (rid: string, look: PersonLook, x: number, z: number, yaw: number, clip: Clip, when: (m: string) => boolean, y = F, phase?: number): Role =>
      ({ id: rid, look, x, z, y, yaw, clip, when, ...(phase !== undefined ? { phase } : {}) });
    /** A chair of the structure, as a seat of the registry kept for the role who sits there (`originY`: the sitter's origin). */
    const chair = (sid: string, x: number, z: number, originY: number, yaw: number): Seat => {
      const s: Seat = { id: sid, x, z, top: originY + SIT_HIPS, yaw, kind: 'chair', space: 'street', occupant: null };
      ctx.seats.add(s); this.seats.push(s); return s;
    };
    const spots = interiorSpots(cx, cz);

    // ---------------------------------------------------------------- the officials: judges, the table, the announcer, the referee
    PEOPLE.judges.angles.slice(0, N.judges).forEach((a, i) => {
      const p = polar(cx, cz, a, PEOPLE.judges.r);
      add({ id: `juge${i}`, look: OFFICIAL(R), seat: chair(`${id}:juge:${i}`, p.x, p.z, F + 0.45 - SIT_HIPS, a + Math.PI), keep: true, when: at(PRESENT.judges) }, 'judge');
    });
    const table = spots.filter(s => s.role === 'official');
    table.slice(0, N.officials).forEach((s, i) => {
      add({ id: `officiel${i}`, look: OFFICIAL(R), seat: chair(`${id}:officiel:${i}`, s.x, s.z, s.y, s.yaw), keep: true, when: at(PRESENT.officials) }, 'official');
    });
    add(stand('annonceur', { ...OFFICIAL(R), style: 'boubou', top: 0x6b3fa0 }, table[0].x - 1.0, table[0].z - 1.2, -Math.PI / 2, 'Talk', at(PRESENT.announcer)), 'announcer');
    add(stand('arbitre', REFEREE, cx, cz + 2.4, Math.PI, 'Idle', at(PRESENT.referee)), 'referee');

    // ---------------------------------------------------------------- the drummers' group on its deck, its dancers on the sand
    drummerSpots(cx, cz).slice(0, N.drummers).forEach((s, k) => {
      const dancer = s.clip !== 'Talk';
      add(stand(`batteur${k}`, DRUMMER(R, dancer), s.x, s.z, s.yaw, s.clip, at(k < 2 ? PRESENT.warmup : PRESENT.drummers), s.y, R()), dancer ? 'dancer' : 'drummer');
    });

    // ---------------------------------------------------------------- the press at their table, the cameramen behind the cameras
    spots.filter(s => s.role === 'press').slice(0, N.press).forEach((s, i) => {
      add({ id: `presse${i}`, look: PRESS(R, 0x2b2f36), seat: chair(`${id}:presse:${i}`, s.x, s.z, s.y, s.yaw), keep: true, when: at(PRESENT.press) }, 'press');
    });
    spots.filter(s => s.role === 'media').slice(0, N.media).forEach((s, i) => {
      add(stand(`camera${i}`, PRESS(R, 0x1c1c1e), s.x, s.z, s.yaw, 'Idle', at(PRESENT.press)), 'media');
    });

    // ---------------------------------------------------------------- vendors walking the front of the stands
    const arcs = PEOPLE.walk.arcs;
    for (let k = 0; k < N.vendors; k++) {
      const kind = STAND_VENDORS[k % STAND_VENDORS.length], arc = arcs[k % arcs.length];
      const a = k < arcs.length ? (arc[0] + arc[1]) / 2 : arc[1], p = polar(cx, cz, a, PEOPLE.walk.r);
      const look: PersonLook = { ...randomLook(R), female: kind.female, style: kind.female ? 'dress' : 'tee', hat: kind.female ? 'headwrap' : undefined };
      add(stand(`vendeur${k}`, look, p.x, p.z, a + Math.PI / 2, 'Walk', at(PRESENT.vendors)), 'vendor');
      this.walkers.push({ id: `vendeur${k}`, kind, arc, a, dir: k % 2 ? -1 : 1, pause: 0, called: -99 });
    }

    // ---------------------------------------------------------------- each écurie: a helper in its corner, its wrestler's entourage
    this.sides = ECURIES.map(({ id: ecurie, colour }) => {
      const side = PREP_SIDE[ecurie], ids: string[] = [], camp: string[] = [];
      /** There for the gala's moments, and all along the player's path when they fight for this écurie tonight. */
      const withFighter = (list: readonly PeopleMoment[]) => (key: string) => at(list)(key) || fighterOf(key) === ecurie;
      const helper = (): PersonLook => ({ ...randomLook(R), style: 'tee', top: colour, pattern: 'uni', bottom: 0x1c1c1f, female: false, muscular: 0.5 });
      for (let k = 0; k < N.camp; k++) {
        const c = campSpot(cx, cz, side);
        add(stand(`${ecurie}_camp${k}`, helper(), c.x, c.z, c.yaw, 'Stance', withFighter(PRESENT.camp)), 'camp'); camp.push(`${ecurie}_camp${k}`);
      }
      for (let k = 0; k < N.entourage; k++) {
        const p = entouragePath(cx, cz, side, k)[0];
        const look: PersonLook = k === 0
          ? { skin: 0x45291a, style: 'boubou', top: colour, accent: 0xf2f2ec, pattern: 'bazin', beard: 0x8a8580, hat: 'kufi', hatColor: 0xf2f2ec, shoes: 0x3a2a1e, heavy: 0.3 }
          : helper();
        const rid = `${ecurie}${k}`; ids.push(rid);
        add(stand(rid, look, p.x, p.z, Math.PI, k === 0 ? 'Talk' : 'Idle', withFighter(PRESENT.entourage)), 'entourage');
      }
      return { ecurie, side, colour, ids, camp, started: false };
    });

    this.cast = new Cast(roles, ctx.seats, this.group, id + ':people');
    // what they carry: a kettle of café Touba, a basin of water sachets or peanut cones on the head, a bucket, the flag
    this.walkers.forEach(w => this.cast?.attach(w.id, this.carried(w.kind.key)));
    for (const s of this.sides) s.ids.forEach((rid, k) => { if (k === 1) this.cast?.attach(rid, this.bucket()); if (k === 2) this.cast?.attach(rid, this.flag(s.colour)); });
    ctx.extra.add(this.group);
    fightNight.current = this;
    this.offCue = arenaFighter.onCue(c => this.cue(c));

    // ---------------------------------------------------------------- buying from a vendor who stops by you (seated or not)
    const source: TargetSource = {
      name: this.sourceName,
      collect: (space, x, z, out) => {
        if (space !== 'street' || !this.cast) return;
        for (const w of this.walkers) {
          const p = this.cast.where(w.id); if (!p?.shown) continue;
          if (Math.abs(p.x - x) > 3.2 || Math.abs(p.z - z) > 3.2) continue;
          const specs = w.kind.offers(w.kind.seller).map(counted);
          out.push({ id: `${id}:${w.id}`, name: `${w.kind.seller} · ${w.kind.female ? 'vendeuse' : 'vendeur'}`, kind: 'person', space, x: p.x, z: p.z, y: 2.1, radius: 3.2, bias: -3.5,
            affordances: () => specs.map(s => ({ id: s.id, verb: s.primitive, label: s.label, icon: s.icon, detail: s.detail, cost: s.price,
              disabled: ctx.activities.blocked(s), run: () => { w.pause = Math.max(w.pause, 6); ctx.activities.start(s, { place: 'Arène de Pikine' }); } })) });
        }
      },
    };
    ctx.interactions.add(source);
  }

  private carried(key: string): THREE.Object3D {
    const b = new Batch();
    if (key === 'touba') {                                                      // a kettle and a stack of cups, held in front
      b.cyl(0.09, 0.11, 0.24, 0.12, 0.86, 0.28, 0x9aa0a6, 10); b.cyl(0.02, 0.02, 0.1, 0.22, 1.02, 0.28, 0x9aa0a6, 6, [0, 0, -0.9]);
      for (let n = 0; n < 5; n++) b.cyl(0.035, 0.03, 0.06, -0.14, 0.86 + n * 0.035, 0.26, 0xf2f2ec, 8);
    } else {                                                                    // a basin on the head: water sachets or peanut cones
      b.cyl(0.33, 0.27, 0.12, 0, 1.76, 0, key === 'eau' ? 0x2a6fb3 : 0xd9b44a, 14);
      for (let n = 0; n < 9; n++) {
        const a = (n / 9) * TAU, r = n === 0 ? 0 : 0.17;
        if (key === 'eau') b.box(0.1, 0.05, 0.14, Math.sin(a) * r, 1.86, Math.cos(a) * r, 0xeef6fa, a);
        else b.cyl(0.0, 0.05, 0.12, Math.sin(a) * r, 1.86, Math.cos(a) * r, 0xc9a06a, 6);
      }
    }
    return this.mesh(b);
  }
  private bucket(): THREE.Object3D { const b = new Batch(); b.cyl(0.14, 0.11, 0.26, -0.3, 0.42, 0.05, 0x2a6fb3, 10); b.box(0.02, 0.2, 0.02, -0.3, 0.68, 0.05, 0x8a8f96); return this.mesh(b); }
  private flag(colour: number): THREE.Object3D {
    const b = new Batch(); b.box(0.035, 2.3, 0.035, 0.32, 0.75, 0.08, 0x555555); b.box(0.8, 0.5, 0.02, 0.73, 2.5, 0.08, colour); b.box(0.8, 0.07, 0.025, 0.73, 2.5, 0.08, 0xf2f2ec);
    return this.mesh(b);
  }
  private mesh(b: Batch): THREE.Object3D {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), m = b.build(mat, false, true)!;
    this.own.push(mat, m.geometry); return m;
  }

  /** Every frame, with the arena evening's state. `showDt` is the show's own time step (the checks may fast-forward it). */
  update(dt: number, phase: ShowPhase, t: number, street: Street, showDt = dt) {
    const cast = this.cast; if (!cast) return;
    this.t += dt;
    if (this.fighter && !arenaFighter.pending()) this.fighter = null;                 // the bout was given up (no cue)
    const m0 = peopleMoment(phase, street);
    const m: PeopleMoment = this.force === null ? m0 : this.force ? (m0 === 'closed' || m0 === 'setup' ? 'doors' : m0) : 'closed';
    if (m !== this.moment) this.enter(m);
    else if (this.keyNow() !== this.key) { this.key = this.keyNow(); cast.setMoment(this.key); }
    // the entourages walk out of the tunnel behind their wrestler (Baobab's, the left one, at 0.9 s; Teranga's at 3.9 s)
    const pace = Math.max(1, showDt / Math.max(dt, 1e-6));
    for (const s of this.sides) if (m === 'entrance' && !s.started && t >= (s.ecurie === 'baobab' ? 0.9 : 3.9)) {
      s.started = true;
      s.ids.forEach((rid, k) => {
        const path = entouragePath(this.cx, this.cz, s.side, k), end = path[path.length - 1];
        cast.place(rid, path[0].x, path[0].z, Math.PI); cast.walkTo(rid, path.slice(1), facing(this.cx, this.cz, end), k === 0 ? 'Talk' : 'Idle', 2.6 * pace);
      });
    }
    // vendors: back and forth along their arc, a stop by the player, a call now and then
    const me = this.ctx.player.pos;
    for (const w of this.walkers) {
      const p = cast.where(w.id); if (!p?.shown) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < 3.0 && w.pause <= 0 && this.ctx.activities.current === null && this.t - w.called > 25) w.pause = 7;
      if (d < 9 && this.t - w.called > 40 && this.t - this.lastCall > 20 && m !== 'entrance' && m !== 'result') {
        w.called = this.lastCall = this.t; this.ctx.toast(`${w.kind.seller} : ${w.kind.call}`);
      }
      if (w.pause > 0) {
        w.pause -= dt; cast.setClip(w.id, 'Talk');
        cast.place(w.id, p.x, p.z, Math.atan2(me.x - p.x, me.z - p.z));
        continue;
      }
      const n = walkArc(w.a, w.dir, w.arc, dt); w.a = n.a; w.dir = n.dir;
      const q = polar(this.cx, this.cz, w.a, PEOPLE.walk.r);
      cast.setClip(w.id, 'Walk'); cast.place(w.id, q.x, q.z, w.a + (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    if ((this.weighT -= dt) <= 0) { this.weighT = 0.5; this.weigh(m); }
    // behind the walls nobody inside can be seen from the street (except through the gates): not drawn at all
    const cam = this.ctx.camera.position;
    cast.update(dt, cam, 75, this.ctx.space() === 'street' && seenFrom(this.cx, this.cz, cam), me);
  }

  /** Who is in the spotlight (a full body as long as the budget allows) and who is in the background (a figure sooner). */
  private weigh(m: PeopleMoment) {
    const cast = this.cast!, me = this.ctx.player.pos;
    for (const r of this.roles) {
      let on = false;
      if (r.who === 'vendor') { const w = cast.where(r.id); on = !!w && Math.hypot(w.x - me.x, w.z - me.z) < 8; }
      else if (r.who === 'entourage' || r.who === 'griot' || r.who === 'camp') {
        const s = this.sides.find(x => r.id.startsWith(x.ecurie));
        on = !!s && (this.fighter === s.ecurie || (r.who !== 'camp' && (m === 'entrance' || (m === 'result' && this.won === s.ecurie))));
      }
      cast.setLodPrio(r.id, on ? LOD_PRIO.spotlight : LOD_PRIO.background);
    }
  }

  /** A new moment of the evening: who is there, and where the entourages stand. */
  private enter(m: PeopleMoment) {
    const cast = this.cast!; const prev = this.moment; this.moment = m;
    this.key = this.keyNow(); cast.setMoment(this.key);
    if (m === 'filling' || m === 'closed' || m === 'doors' || m === 'setup') { this.won = null; for (const s of this.sides) s.started = false; }
    // a jump straight into the bout (or the result): the entourages are already in their corners
    if ((m === 'bout' || m === 'result') && prev !== 'entrance' && prev !== 'bout') for (const s of this.sides) {
      s.started = true; s.ids.forEach((rid, k) => { const c = cornerSpot(this.cx, this.cz, s.side, k); cast.place(rid, c.x, c.z, c.yaw); });
    }
    // the gala is over: back into the tunnel, the way they came
    if (m === 'leaving') for (const s of this.sides) s.ids.forEach((rid, k) => {
      const path = entouragePath(this.cx, this.cz, s.side, k).slice(0, 4).reverse();
      cast.walkTo(rid, path, 0, 'Idle', 2.6);
    });
  }

  private keyNow() { return `${this.moment}|${this.fighter ?? ''}`; }

  /**
   * The player's path when they fight tonight (src/arena/fighter.ts): from the tunnel on, their écurie's people wait in
   * its corner; when the player reaches it they gather round, facing them; they cheer as the player walks out and after
   * the bout; they go once the player is back outside.
   */
  private cue(c: FighterCue) {
    const cast = this.cast; if (!cast) return;
    const e = arenaFighter.corner(), s = this.sides.find(x => x.ecurie === e);
    if (c === 'called' || c === 'exit' || !s) { this.fighter = null; return; }
    this.fighter = s.ecurie;
    const me = this.ctx.player.pos;
    if (c === 'tunnel' || c === 'prep') {
      [...s.ids, ...s.camp].forEach((rid, k) => {
        const p = k < s.ids.length ? cornerSpot(this.cx, this.cz, s.side, k) : campSpot(this.cx, this.cz, s.side);
        cast.place(rid, p.x, p.z, c === 'prep' ? Math.atan2(me.x - p.x, me.z - p.z) : p.yaw);
        if (c === 'prep' && k === 0) cast.setClip(rid, 'Talk');
      });
      s.started = true;
    }
    if (c === 'walk-out' || c === 'result') {
      for (const rid of [...s.ids, ...s.camp]) {
        const w = cast.where(rid); if (w) cast.place(rid, w.x, w.z, facing(this.cx, this.cz, w));
        cast.burst(rid, 'Celebrate', c === 'result' ? 4 : 3);
      }
    }
  }

  /** The crowd's moments: the entourages, the corner helpers and the dancers cheer. */
  react(m: Moment) {
    const cast = this.cast; if (!cast) return;
    const secs = m === 'fall' || m === 'result' ? 4 : 2;
    for (const s of this.sides) s.ids.forEach(rid => { if (!cast.walking(rid) && (m !== 'clinch' || Math.random() < 0.5)) cast.burst(rid, 'Celebrate', secs); });
    if (m !== 'clinch') for (const r of this.roles) if (r.who === 'dancer' || r.who === 'camp') cast.burst(r.id, 'Celebrate', secs);
  }
  /** The bout is won: the winner's people run onto the sand to him and celebrate; the others stay in their corner. */
  result(winner: 'left' | 'right' | null) {
    const cast = this.cast; if (!cast) return;
    this.won = winner === 'left' ? 'baobab' : winner === 'right' ? 'teranga' : null;          // the bill: Baobab left, Teranga right
    const s = this.sides.find(x => x.ecurie === this.won); if (!s) return;
    s.ids.forEach((rid, k) => {
      const path = celebratePath(this.cx, this.cz, s.side, k), to = path[path.length - 1];
      cast.walkTo(rid, path, facing(this.cx, this.cz, to), 'Celebrate', 4.5);                 // running: there well within the result's 7 s
    });
  }

  /** Who is inside the walls now, by role (present, and drawn near the camera). */
  inside() {
    const c = this.cast, by: Record<string, number> = {}, drawnBy: Record<string, number> = {};
    let present = 0, drawn = 0;
    for (const r of this.roles) {
      const w = c?.where(r.id); if (!w?.shown) continue;
      present++; by[r.who] = (by[r.who] ?? 0) + 1;
      if (w.drawn) { drawn++; drawnBy[r.who] = (drawnBy[r.who] ?? 0) + 1; }
    }
    return { moment: this.moment, shown: present > 0, people: present, drawn, by, drawnBy, total: this.roles.length };
  }

  debug() {
    const c = this.cast, w = (id: string) => c?.where(id) ?? null;
    const n = (who: string) => this.roles.filter(r => r.who === who && w(r.id)?.shown).length;
    return {
      moment: this.moment, won: this.won,
      judges: n('judge'), officials: n('official'), announcer: !!w('annonceur')?.shown, referee: !!w('arbitre')?.shown,
      drummers: n('drummer') + n('dancer'), press: n('press') + n('media'), camp: n('camp'),
      vendors: this.walkers.map(v => ({ id: v.id, ...w(v.id), a: Math.round(v.a * 100) / 100, pause: Math.max(0, Math.round(v.pause * 10) / 10) })),
      fighter: this.fighter,
      entourage: this.sides.map(s => ({ ecurie: s.ecurie, side: s.side, started: s.started, people: s.ids.map(id => ({ id, ...w(id), walking: !!c?.walking(id) })) })),
      seats: this.seats.map(s => ({ id: s.id, occupant: s.occupant })),
    };
  }

  dispose() {
    this.offCue();
    if (fightNight.current === this) fightNight.current = null;
    this.ctx.interactions.remove(this.sourceName);
    this.cast?.dispose(); this.cast = null;
    for (const s of this.seats) this.ctx.seats.remove(s.id);
    for (const o of this.own) o.dispose(); this.own = [];
    this.group.removeFromParent();
  }
}
