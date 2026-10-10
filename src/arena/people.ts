import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { TargetSource } from '../interact/types';
import type { ActivitySpec } from '../activity/types';
import { randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { Batch } from '../world/batch';
import * as P from '../activity/primitives';
import { tasteLine, waitLine } from '../i18n/lines';
import { Cast, type Role } from '../venues/cast';
import { WALL_R } from '../world/geew';
import { ARENA_PURCHASES, ECURIES } from './exteriorRules';
import type { Moment, Quality, ShowPhase, Street } from './program';

/**
 * The people of a fight night inside the Pikine arena: the referee and the officials at the ring side (judges on their
 * folding chairs, the officials' table and its announcer), the drummers' group, vendors walking the front of the stands
 * (they stop by you and sell café Touba, water, peanuts), and each wrestler's entourage — coach, helpers, the écurie's
 * flag — who walk in with their wrestler, wait in their corner during the bout and run to the ring when theirs wins.
 *
 * Built on the venues' Cast and roles (src/venues/cast.ts): every person is shown only in the moments of the evening
 * they belong to; the judges and officials sit on real seats of the shared registry that stay theirs between two shows
 * (no passer-by of src/social/ambientLife.ts, nor the player, sits at the ring side); walkers follow paths. They live outside the arena's `noLod` group, so the shared humanoid budget
 * (src/actors/crowdLod.ts) keeps the nearest as full bodies and swaps the far ones for cheap figures.
 *
 * Positions follow the arena layout: the builder's judges' chairs and officials' table (src/world/builder.ts), and the
 * interior lane's contract for the drummers' stand, the écuries' preparation corners and the wrestlers' tunnel
 * (lane/w3-arena-interior, src/world/arenaModules.ts, src/world/geew.ts). When the drummers' stand is built there, its
 * spots replace `drumSpots()` and the drums drawn here (`DRUM_PROPS`) go.
 */
const TAU = Math.PI * 2;
/** Layout of the people (metres and angles from the arena centre; angles as atan2(x, z), the public gate at π). */
export const PEOPLE = {
  /** The builder's judges' folding chairs at the sandbags, in the order they are taken. */
  judges: { r: 9.9, angles: [Math.PI / 2, (3 * Math.PI) / 2, 0, Math.PI / 4, -Math.PI / 4] },
  /** The builder's officials' table under its canopy (+x side) and its four chairs. */
  table: { dx: 13.2, dz: 2, chairs: [-1.2, -0.4, 0.4, 1.2] },
  /** The drummers' stand near the tunnel's mouth (interior lane). */
  drums: { a: 0.42, r: 14.2 },
  /** The écuries' preparation corners beside the tunnel: side +1 (+x) for the left wrestler, −1 for the right. */
  corner: { a: 0.78, r: 13.4 },
  /** The walkway in front of the parapet, the vendors' arcs: never through the public gate nor the tunnel. */
  walk: { r: 16.8, arcs: [[0.62, 2.5], [-0.62, -2.5]] as [number, number][] },
} as const;
/** Draw the sabar drums here until the interior lane's drummers' stand is built. */
export const DRUM_PROPS = true;
/** How many of each by graphics quality (the shared humanoid budget keeps the nearest as full bodies). */
export const PEOPLE_COUNT: Record<Quality, { judges: number; officials: number; drummers: number; vendors: number; entourage: number }> = {
  low: { judges: 2, officials: 2, drummers: 3, vendors: 1, entourage: 1 },
  medium: { judges: 3, officials: 3, drummers: 5, vendors: 2, entourage: 2 },
  high: { judges: 5, officials: 3, drummers: 6, vendors: 3, entourage: 4 },
};

/** The moment of the evening the people follow: the show's phase, else the street's state. */
export type PeopleMoment = 'closed' | 'setup' | 'doors' | Exclude<ShowPhase, 'idle' | 'over'>;
export function peopleMoment(phase: ShowPhase, street: Street): PeopleMoment {
  if (phase !== 'idle' && phase !== 'over') return phase;
  return street === 'doors' ? 'doors' : street === 'setup' ? 'setup' : 'closed';
}
/** Who is there at each moment (pure; tests/arena.test.ts). The duel brings its own referee for the bout and the result. */
export const PRESENT: Record<'officials' | 'announcer' | 'judges' | 'referee' | 'drummers' | 'warmup' | 'vendors' | 'entourage', readonly PeopleMoment[]> = {
  officials: ['setup', 'doors', 'filling', 'entrance', 'bout', 'result', 'leaving'],
  announcer: ['doors', 'filling', 'entrance', 'bout', 'result'],
  judges: ['filling', 'entrance', 'bout', 'result'],
  referee: ['filling', 'entrance'],
  drummers: ['filling', 'entrance', 'bout', 'result', 'leaving'],
  /** The first two drummers warm up while the doors are open. */
  warmup: ['doors', 'filling', 'entrance', 'bout', 'result', 'leaving'],
  vendors: ['doors', 'filling', 'entrance', 'bout', 'result'],
  entourage: ['entrance', 'bout', 'result', 'leaving'],
};
const at = (list: readonly PeopleMoment[]) => (m: string) => list.includes(m as PeopleMoment);

/** A point at angle `a` (atan2(x, z)) and radius `r` from the centre. */
export const polar = (cx: number, cz: number, a: number, r: number) => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
/** Where the drummers stand: a front row of four on the stand, then two behind; facing the ring. */
export function drumSpots(cx: number, cz: number): { x: number; z: number; yaw: number }[] {
  const { a, r } = PEOPLE.drums, tx = Math.cos(a), tz = -Math.sin(a), yaw = a + Math.PI;
  const row = (rr: number, offsets: number[]) => offsets.map(o => { const c = polar(cx, cz, a, rr); return { x: c.x + tx * o, z: c.z + tz * o, yaw }; });
  return [...row(r, [-1.275, -0.425, 0.425, 1.275]), ...row(r + 0.8, [-0.45, 0.45])];
}
/** The way an écurie's people walk in: from the public gate along the inside of the ring side to their corner. */
export function entouragePath(cx: number, cz: number, side: 1 | -1, k: number): { x: number; z: number }[] {
  const s = side, gz = cz - WALL_R;
  return [
    { x: cx + s * (1.4 + k * 0.55), z: gz + 0.8 - k * 0.6 },
    polar(cx, cz, s * 2.55, 11.8),
    polar(cx, cz, s * 1.57, 11.6),
    cornerSpot(cx, cz, side, k),
  ];
}
/** Where the k-th person of a side's entourage waits in its corner. */
export function cornerSpot(cx: number, cz: number, side: 1 | -1, k: number) {
  const { a, r } = PEOPLE.corner;
  return polar(cx, cz, side * a + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.75) / r, r - (k > 2 ? 0.7 : 0));
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
const DRUMMER = (r: () => number, lead: boolean): PersonLook => ({ ...randomLook(r), style: 'tee', top: lead ? 0xf4c20d : [0xd9322b, 0x1a9d54, 0xf2f2ec, 0x2f6fb3][Math.floor(r() * 4)], bottom: 0x2b2f3a, female: false, muscular: 0.4 });

interface Side { side: 1 | -1; colour: number; ids: string[]; started: boolean }
interface Walker { id: string; kind: VendorKind; arc: readonly [number, number]; a: number; dir: 1 | -1; pause: number; called: number }

/** The fight night's people of one arena (one per hub with an arena; driven by the arena evening). */
export class FightNightPeople {
  readonly group = new THREE.Group();
  readonly seats: Seat[] = [];
  private cast: Cast | null;
  private moment: PeopleMoment | '' = '';
  private sides: Side[];
  private walkers: Walker[] = [];
  private drumMesh: THREE.Mesh | null = null;
  private own: { dispose(): void }[] = [];
  private won: 1 | -1 | 0 = 0;
  private t = 0;
  /** When a vendor last called out (one call at a time, so the show's own lines stay readable). */
  private lastCall = -99;
  private readonly sourceName: string;

  constructor(private ctx: GameCtx, hub: HubWorld, private cx: number, private cz: number) {
    const q = ctx.quality(), N = PEOPLE_COUNT[q], R = rng(2026), id = `${hub.id}:arena`;
    this.group.name = 'arena_people';
    this.sourceName = `${id}:vendeurs`;
    const ground = (x: number, z: number) => 0.1 + hub.heightAt(x, z);
    const roles: Role[] = [];
    const stand = (rid: string, look: PersonLook, x: number, z: number, yaw: number, clip: Clip, when: (m: string) => boolean, phase?: number): Role =>
      ({ id: rid, look, x, z, y: ground(x, z), yaw, clip, when, ...(phase !== undefined ? { phase } : {}) });

    // ---------------------------------------------------------------- the officials: judges, the table, the announcer, the referee
    const B = 0.14, chairTop = B + 0.45;
    PEOPLE.judges.angles.slice(0, N.judges).forEach((a, i) => {
      const p = polar(cx, cz, a, PEOPLE.judges.r);
      const s: Seat = { id: `${id}:juge:${i}`, x: p.x, z: p.z, top: chairTop, yaw: a + Math.PI, kind: 'chair', space: 'street', occupant: null };
      ctx.seats.add(s); this.seats.push(s);
      roles.push({ id: `juge${i}`, look: OFFICIAL(R), seat: s, keep: true, when: at(PRESENT.judges) });
    });
    const tx = cx + PEOPLE.table.dx, tz = cz + PEOPLE.table.dz;
    PEOPLE.table.chairs.slice(0, N.officials).forEach((dx, i) => {
      const s: Seat = { id: `${id}:officiel:${i}`, x: tx + dx, z: tz + 0.8, top: chairTop, yaw: Math.PI, kind: 'chair', space: 'street', occupant: null };
      ctx.seats.add(s); this.seats.push(s);
      roles.push({ id: `officiel${i}`, look: OFFICIAL(R), seat: s, keep: true, when: at(PRESENT.officials) });
    });
    roles.push(stand('annonceur', { ...OFFICIAL(R), style: 'boubou', top: 0x6b3fa0 }, tx - 2.2, tz - 0.4, -Math.PI / 2, 'Talk', at(PRESENT.announcer)));
    roles.push(stand('arbitre', REFEREE, cx, cz + 2.4, Math.PI, 'Idle', at(PRESENT.referee)));

    // ---------------------------------------------------------------- the drummers' group (the lead dances in front)
    const spots = drumSpots(cx, cz).slice(0, N.drummers);
    spots.forEach((s, k) => {
      const lead = k === 0, front = lead ? polar(cx, cz, PEOPLE.drums.a, PEOPLE.drums.r - 1.3) : s;
      roles.push(stand(`batteur${k}`, DRUMMER(R, lead), front.x, front.z, s.yaw, lead ? 'Dance_A' : 'Talk', at(k < 2 ? PRESENT.warmup : PRESENT.drummers), R()));
    });
    if (DRUM_PROPS && spots.length > 1) {
      const b = new Batch(), tow = (s: { x: number; z: number; yaw: number }, d: number) => ({ x: s.x + Math.sin(s.yaw) * d, z: s.z + Math.cos(s.yaw) * d });
      for (const s of spots.slice(1)) {
        const p = tow(s, 0.38), g = ground(p.x, p.z) - 0.1;
        b.cyl(0.15, 0.1, 0.8, p.x, g, p.z, 0x7a4a24, 10);                    // a tall sabar, held against the hip
        b.cyl(0.165, 0.165, 0.035, p.x, g + 0.8, p.z, 0xe8dcc0, 10);          // its skin
        b.cyl(0.155, 0.155, 0.03, p.x, g + 0.55, p.z, 0xd9322b, 10);          // a painted band
      }
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.drumMesh = b.build(mat, true, true); this.own.push(mat);
      if (this.drumMesh) { this.drumMesh.visible = false; this.group.add(this.drumMesh); this.own.push(this.drumMesh.geometry); }
    }

    // ---------------------------------------------------------------- vendors walking the front of the stands
    const arcs = PEOPLE.walk.arcs;
    for (let k = 0; k < N.vendors; k++) {
      const kind = STAND_VENDORS[k % STAND_VENDORS.length], arc = arcs[k % arcs.length];
      const a = k < arcs.length ? (arc[0] + arc[1]) / 2 : arc[1], p = polar(cx, cz, a, PEOPLE.walk.r);
      const look: PersonLook = { ...randomLook(R), female: kind.female, style: kind.female ? 'dress' : 'tee', hat: kind.female ? 'headwrap' : undefined };
      roles.push(stand(`vendeur${k}`, look, p.x, p.z, a + Math.PI / 2, 'Walk', at(PRESENT.vendors)));
      this.walkers.push({ id: `vendeur${k}`, kind, arc, a, dir: k % 2 ? -1 : 1, pause: 0, called: -99 });
    }

    // ---------------------------------------------------------------- each wrestler's entourage (coach, helpers, the flag)
    this.sides = ([1, -1] as const).map((side, i) => {
      const colour = ECURIES[i].colour, ids: string[] = [];
      for (let k = 0; k < N.entourage; k++) {
        const p = entouragePath(cx, cz, side, k)[0];
        const look: PersonLook = k === 0
          ? { skin: 0x45291a, style: 'boubou', top: colour, accent: 0xf2f2ec, pattern: 'bazin', beard: 0x8a8580, hat: 'kufi', hatColor: 0xf2f2ec, shoes: 0x3a2a1e, heavy: 0.3 }
          : { ...randomLook(R), style: 'tee', top: colour, bottom: 0x1c1c1f, female: false, muscular: 0.5 };
        const rid = `${i ? 'teranga' : 'baobab'}${k}`; ids.push(rid);
        roles.push(stand(rid, look, p.x, p.z, 0, k === 0 ? 'Talk' : 'Idle', at(PRESENT.entourage)));
      }
      return { side, colour, ids, started: false };
    });

    this.cast = new Cast(roles, ctx.seats, this.group, id + ':people');
    // what they carry: a basin of water sachets or peanut cones on the head, a kettle of café Touba, a bucket, the flag
    this.walkers.forEach(w => this.cast?.attach(w.id, this.carried(w.kind.key)));
    for (const s of this.sides) s.ids.forEach((rid, k) => { if (k === 1) this.cast?.attach(rid, this.bucket()); if (k === 2) this.cast?.attach(rid, this.flag(s.colour)); });
    ctx.extra.add(this.group);

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
    const m = peopleMoment(phase, street);
    if (m !== this.moment) this.enter(m);
    if (this.drumMesh) this.drumMesh.visible = PRESENT.drummers.includes(m as PeopleMoment);
    // the entourages walk in behind their wrestler (left at 0.9 s, right at 3.9 s of the entrance)
    for (const s of this.sides) if (m === 'entrance' && !s.started && t >= (s.side > 0 ? 0.9 : 3.9)) {
      s.started = true;
      s.ids.forEach((rid, k) => { const path = entouragePath(this.cx, this.cz, s.side, k); cast.place(rid, path[0].x, path[0].z, 0); cast.walkTo(rid, path.slice(1), this.faceRing(path[3]), k === 0 ? 'Talk' : 'Idle', 2.6 * Math.max(1, showDt / Math.max(dt, 1e-6))); });
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
    cast.update(dt, this.ctx.camera.position, 75, this.ctx.space() === 'street', me);
  }

  /** A new moment of the evening: who is there, and where the entourages stand. */
  private enter(m: PeopleMoment) {
    const cast = this.cast!; const prev = this.moment; this.moment = m;
    cast.setMoment(m);
    if (m === 'filling' || m === 'closed' || m === 'doors' || m === 'setup') { this.won = 0; for (const s of this.sides) s.started = false; }
    // a jump straight into the bout (or the result): the entourages are already in their corners
    if ((m === 'bout' || m === 'result') && prev !== 'entrance' && prev !== 'bout') for (const s of this.sides) {
      s.started = true; s.ids.forEach((rid, k) => { const c = cornerSpot(this.cx, this.cz, s.side, k); cast.place(rid, c.x, c.z, this.faceRing(c)); });
    }
    if (m === 'leaving') for (const s of this.sides) s.ids.forEach((rid, k) => {
      const path = entouragePath(this.cx, this.cz, s.side, k).slice(0, 3).reverse();
      cast.walkTo(rid, path, Math.PI, 'Idle', 2.2);
    });
  }
  private faceRing(p: { x: number; z: number }) { return Math.atan2(this.cx - p.x, this.cz - p.z); }

  /** The crowd's moments: the entourages and the lead drummer cheer. */
  react(m: Moment) {
    const cast = this.cast; if (!cast) return;
    const secs = m === 'fall' || m === 'result' ? 4 : 2;
    for (const s of this.sides) s.ids.forEach(rid => { if (m !== 'clinch' || Math.random() < 0.5) cast.burst(rid, 'Celebrate', secs); });
    if (m !== 'clinch') cast.burst('batteur0', 'Celebrate', secs);
  }
  /** The bout is won: the winner's people run onto the sand to him and celebrate; the others stay in their corner. */
  result(winner: 'left' | 'right' | null) {
    const cast = this.cast; if (!cast) return;
    this.won = winner === 'left' ? 1 : winner === 'right' ? -1 : 0;
    const s = this.sides.find(x => x.side === this.won); if (!s) return;
    s.ids.forEach((rid, k) => {
      const to = { x: this.cx + s.side * (2.2 + (k % 2) * 0.8), z: this.cz - 0.8 + Math.floor(k / 2) * 0.9 };
      cast.walkTo(rid, [polar(this.cx, this.cz, s.side * 1.2, 10.4), to], this.faceRing(to), 'Celebrate', 3.2);
    });
  }

  debug() {
    const c = this.cast, w = (id: string) => c?.where(id) ?? null;
    const shown = (ids: string[]) => ids.filter(id => w(id)?.shown).length;
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const q = PEOPLE_COUNT[this.ctx.quality()];
    return {
      moment: this.moment, won: this.won,
      judges: shown(ids('juge', q.judges)), officials: shown(ids('officiel', q.officials)), announcer: !!w('annonceur')?.shown, referee: !!w('arbitre')?.shown,
      drummers: shown(ids('batteur', q.drummers)), drums: !!this.drumMesh?.visible, vendors: this.walkers.map(v => ({ id: v.id, ...w(v.id), a: Math.round(v.a * 100) / 100, pause: Math.max(0, Math.round(v.pause * 10) / 10) })),
      entourage: this.sides.map(s => ({ side: s.side, started: s.started, people: s.ids.map(id => ({ id, ...w(id), walking: !!c?.walking(id) })) })),
      seats: this.seats.map(s => ({ id: s.id, occupant: s.occupant })),
    };
  }

  dispose() {
    this.ctx.interactions.remove(this.sourceName);
    this.cast?.dispose(); this.cast = null;
    for (const s of this.seats) this.ctx.seats.remove(s.id);
    for (const o of this.own) o.dispose(); this.own = [];
    this.group.removeFromParent();
  }
}
