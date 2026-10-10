import * as THREE from 'three';
import { seatRadius, type Moment, type StandSeatDef } from '../arena/program';
import { SECTIONS, TUNNEL_MOUTH_R } from '../world/geew';
import { Crowd, type CrowdLook, type CrowdQuality, type CrowdSlot } from './crowd';
import type { ReactionKind } from './reactions';
import { standLook } from './looks';
import { bannerPlan, companionPlan } from './standPlan';

/**
 * The arena's stands on the reusable crowd (docs/CROWD.md): a drop-in for src/arena/crowd.ts StandCrowd (same
 * constructor, `group`, `taken`, `present`, `cheering`, `fill`, `react(share, seconds)`, `setNear`, `cull`, `update`,
 * `dispose`), plus the crowd's own `react(group, kind)` and `moment(m, sides)`, which turns the gala's moments into group
 * reactions: the supporters of the wrestler walking in rise and shout while the others applaud, the whole arena tenses
 * at a grab and leaps at a fall, the winner's side celebrates and the rest applaud.
 *
 * Groups follow the stands' sections (src/world/geew.ts SECTIONS, A–H between the aisles, the tunnel and the gate):
 * 'sec:A' … 'sec:H', one reaction unit each; 'left' — the supporters of BILL.left in sections B and C (the +x side, where
 * the left wrestler walks to), 'right' — those of BILL.right in F and G; 'ends' — the mixed sections by the wrestlers'
 * tunnel (A, H) and the public gate (D, E); 'tier0' – 'tier2'; 'ringside' (= tier0); 'all'. A wrestler's entrance
 * ripples out from the tunnel mouth.
 *
 * A làmb crowd's look (src/crowd/looks.ts, the same person on a seat every evening): wax boubous and dresses,
 * headwraps, caps and kufis, invented football shirts; on the two sides most supporters wear their écurie's colour
 * (Baobab green on B–C, Teranga red on F–G), one in six brought its flag, and a few at ringside hang its banner on the
 * parapet (invented slogans in Wolof and French, src/crowd/banners.ts); the end sections are mixed. Children sit on a
 * parent's lap here and there, and a few people stand at the barrier by the ring (src/crowd/standPlan.ts). During the
 * bout's grabs the crowd leans in.
 */
export type StandSide = 'left' | 'right';
export interface ArenaStandsOptions {
  quality?: CrowdQuality;
  /** Colours the supporters of each side wear more often. */
  colours?: { left: number; right: number };
  seed?: number;
  /** The look of a place's spectator, from the crowd's own (the arena dresses its honneur rows up): src/arena/tickets.ts. */
  look?: (seat: StandSeatDef, base: CrowdLook, r: () => number) => CrowdLook;
}

const TAU = Math.PI * 2;
/** The section (A–H) a place on the tiers is in, from its angle around the ring (atan2(x, z)); null in a gap. */
export function sectionOf(a: number): string | null {
  const x = ((a % TAU) + TAU) % TAU;
  for (const s of SECTIONS) if ((x >= s.a0 && x <= s.a1) || (x + TAU >= s.a0 && x + TAU <= s.a1)) return s.id;
  return null;
}
export const SECTION_SIDE: Record<string, StandSide | 'ends'> = { A: 'ends', B: 'left', C: 'left', D: 'ends', E: 'ends', F: 'right', G: 'right', H: 'ends' };
/** Which side a seat's supporters are on: B–C the left wrestler's, F–G the right one's, the end sections mixed. */
export function sideOf(a: number): StandSide | 'ends' {
  const sec = sectionOf(a);
  if (sec) return SECTION_SIDE[sec] ?? 'ends';
  const s = Math.sin(a);
  return s > 0.5 ? 'left' : s < -0.5 ? 'right' : 'ends';
}

/** The reactions of each moment of the gala: [group, kind, share, seconds]. `side`: the wrestler concerned. */
export function momentPlan(m: Moment, o: { side?: StandSide | null; winner?: StandSide | null } = {}): [string, ReactionKind, number, number][] {
  const other = (s: StandSide): StandSide => (s === 'left' ? 'right' : 'left');
  switch (m) {
    case 'entrance':
      return o.side
        ? [[o.side, 'shout', 0.75, 4], [other(o.side), 'applause', 0.4, 3], ['ends', 'applause', 0.6, 3]]
        : [['all', 'applause', 0.6, 3], ['all', 'standUp', 0.25, 3]];
    case 'clinch': return [['all', 'grab', 0.55, 2.2], ['all', 'shout', 0.1, 1.6]];
    case 'fall': return [['all', 'fall', 0.85, 3.5]];
    case 'decision': return [['all', 'standUp', 0.6, 3.5]];
    case 'result':
      return o.winner
        ? [[o.winner, 'celebrate', 0.92, 7], ['ends', 'applause', 0.7, 4], [other(o.winner), 'applause', 0.35, 3]]
        : [['all', 'applause', 0.7, 4]];
  }
}

const GREENS = [0x1a7a44, 0x1f9d55, 0x15633a], REDS = [0xc8322a, 0xd9322b, 0xa82820];
const N_QUALITY = (near: number): CrowdQuality => (near <= 0 ? 'low' : near <= 4 ? 'medium' : 'high');
/** Full bodies next to the seated player at most, per preset (the evening budget, docs/PERF_EVENING.md). */
export const STAND_NEAR: Record<CrowdQuality, number> = { low: 0, medium: 4, high: 6 };

export class ArenaStands {
  readonly crowd: Crowd;
  private seats: StandSeatDef[];
  /** Where the wrestlers come out of their tunnel (the entrance ripples from there). */
  private tunnel: { x: number; z: number } | null = null;

  /** `seats`: the places the crowd may take (in fill order); `nearCount`: full humanoids next to the player. */
  constructor(seats: StandSeatDef[], nearCount: number, o: ArenaStandsOptions = {}) {
    this.seats = seats;
    const s0 = seats[0];
    if (s0) {                                                   // the ring's centre, back from a seat along its angle
      const r = seatRadius(s0.tier), cx = s0.x - Math.sin(s0.a) * r, cz = s0.z - Math.cos(s0.a) * r;
      this.tunnel = { x: cx, z: cz + TUNNEL_MOUTH_R };
    }
    const col = o.colours ?? { left: GREENS[0], right: REDS[0] };
    const byId = new Map(seats.map(s => [s.id, s]));
    const tags = (a: number, tier: number, tribune?: string) => { const sec = sectionOf(a); return [sideOf(a), ...(sec ? [`sec:${sec}`] : []), `tier${tier}`, ...(tier === 0 ? ['ringside'] : []), ...(tribune ? [`tribune:${tribune}`] : [])]; };
    const centre = this.tunnel ? { x: this.tunnel.x, z: this.tunnel.z - TUNNEL_MOUTH_R } : { x: 0, z: 0 };
    // banners at ringside in the sides' sections, children on laps, people at the rail (pure plans, by seat id)
    const holders = bannerPlan(seats, seatRadius(0));
    const slots: CrowdSlot[] = seats.map(s => ({ id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, seated: true, tags: tags(s.a, s.tier, s.tribune), banner: holders.get(s.id) }));
    const children = new Set<string>();
    if (s0) for (const c of companionPlan(seats, centre.x, centre.z, holders)) {
      const a = Math.atan2(c.x - centre.x, c.z - centre.z);
      if (c.child) children.add(c.id);
      slots.push({ id: c.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw, seated: true, with: c.with, lap: c.kind === 'lap', upright: c.kind === 'rail',
        tags: c.kind === 'rail' ? [...tags(a, 0), 'rail'] : (slots.find(x => x.id === c.with)?.tags ?? tags(a, 1)) });
    }
    this.crowd = new Crowd(slots, {
      quality: o.quality ?? N_QUALITY(nearCount), near: Math.min(nearCount, STAND_NEAR[o.quality ?? N_QUALITY(nearCount)]), seed: o.seed ?? 23, name: 'arena-stands', nearRadius: 9, nearNeedsFocus: true,
      look: (slot, r) => {
        const side = slot.tags?.[0] === 'left' || slot.tags?.[0] === 'right' ? slot.tags[0] : 'ends';
        const look = standLook(slot.id, side, { child: children.has(slot.id) });
        if (slot.banner !== undefined) look.height = 1;                       // the banner hangs exactly over the parapet
        if (o.look) { const seat = byId.get(slot.id); if (seat) return o.look(seat, look, r); }   // a tier's dress (tickets)
        return look;
      },
    });
    this.crowd.group.name = 'arena_crowd';
    // one supporter in six brought the écurie's flag: it goes up with the arms
    let k = 0;
    for (const sl of slots) {
      const side = sl.tags?.[0];
      if (sl.with || (side !== 'left' && side !== 'right')) continue;
      if (((k++ * 2654435761) >>> 0) % 6 === 0) this.crowd.giveFlag(sl.id, side === 'left' ? col.left : col.right);
    }
  }

  get group(): THREE.Group { return this.crowd.group; }
  /** Seats the crowd holds right now (to mark them taken in the seat registry). */
  taken(): StandSeatDef[] { return this.seats.filter(s => this.crowd.has(s.id)); }
  get present() { return this.crowd.present; }
  /** People reacting now (standing, clapping, shouting…). */
  get cheering() { return this.crowd.reacting; }

  /** Show the first `n` places of the fill order, except `skip` (a seat the player or someone else holds). */
  fill(n: number, skip: (id: string) => boolean) { this.crowd.fill(n, skip); }

  /**
   * `react(share, seconds)`: StandCrowd's call — a share of the stands celebrates. `react(group, kind, o)`: the crowd's
   * group reaction. Returns how many people join in.
   */
  react(share: number, seconds: number): number;
  react(group: string, kind: ReactionKind, o?: { share?: number; seconds?: number; origin?: { x: number; z: number } }): number;
  react(a: number | string, b: number | ReactionKind, o: { share?: number; seconds?: number; origin?: { x: number; z: number } } = {}): number {
    if (typeof a === 'number') return this.crowd.react('all', 'celebrate', { share: a, seconds: b as number });
    return this.crowd.react(a, b as ReactionKind, o);
  }
  /** A moment of the gala: the right groups react the right way (momentPlan). */
  moment(m: Moment, o: { side?: StandSide | null; winner?: StandSide | null } = {}): number {
    // the grabs make the bout tense: people lean in on their knees until the fall, the decision or the result
    this.crowd.setTension(m === 'clinch' ? 0.3 : 0);
    let n = 0;
    const origin = m === 'entrance' && this.tunnel ? this.tunnel : undefined;
    for (const [g, kind, share, seconds] of momentPlan(m, o)) n += this.crowd.react(g, kind, { share, seconds, origin, speed: 22 });
    return n;
  }
  /** How loud the stands are (0–1), for the crowd's sound. */
  level(group = 'all') { return this.crowd.level(group); }

  /** Full humanoids on the crowd seats nearest to (x, z) (the player's seat), those in front first; null: none. */
  setNear(x: number, z: number | null, yaw = 0) {
    this.crowd.setFocus(x, z, z === null ? null : yaw);
    this.crowd.setClearView(z === null ? null : { x, z, yaw });               // nobody right beside or in front of the player
  }
  /** The camera of this frame (LOD distances; near bodies outside the view are skipped). */
  cull(cam: THREE.Camera) { this.crowd.setCamera(cam); }
  update(dt: number, animate: boolean) { this.crowd.update(dt, animate); }
  stats() { return this.crowd.stats(); }
  dispose() { this.crowd.dispose(); }
}
