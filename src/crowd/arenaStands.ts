import * as THREE from 'three';
import type { Moment, StandSeatDef } from '../arena/program';
import { Crowd, defaultLook, type CrowdQuality, type CrowdSlot } from './crowd';
import type { ReactionKind } from './reactions';

/**
 * The arena's stands on the reusable crowd (docs/CROWD.md): a drop-in for src/arena/crowd.ts StandCrowd (same
 * constructor, `group`, `taken`, `present`, `cheering`, `fill`, `react(share, seconds)`, `setNear`, `cull`, `update`,
 * `dispose`), plus the crowd's own `react(group, kind)` and `moment(m, sides)`, which turns the gala's moments into group
 * reactions: the supporters of the wrestler walking in rise and shout while the others applaud, the whole arena tenses
 * at a grab and leaps at a fall, the winner's side celebrates and the rest applaud.
 *
 * Groups: 'all'; 'left' and 'right' — the supporters of BILL.left (seats on the +x half, the side the left wrestler
 * walks to) and BILL.right (−x half); 'ends' — the seats facing the gate and above it, mixed; 'tier0' – 'tier2';
 * 'ringside' (= tier0). Supporters wear their écurie's colour more often (Baobab green, Teranga red).
 */
export type StandSide = 'left' | 'right';
export interface ArenaStandsOptions {
  quality?: CrowdQuality;
  /** Colours the supporters of each side wear more often. */
  colours?: { left: number; right: number };
  seed?: number;
}

/** Which side a seat's supporters are on, from its angle around the ring (atan2(x, z), the gate at π). */
export function sideOf(a: number): StandSide | 'ends' {
  const s = Math.sin(a);
  return s > 0.3 ? 'left' : s < -0.3 ? 'right' : 'ends';
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

export class ArenaStands {
  readonly crowd: Crowd;
  private seats: StandSeatDef[];

  /** `seats`: the places the crowd may take (in fill order); `nearCount`: full humanoids next to the player. */
  constructor(seats: StandSeatDef[], nearCount: number, o: ArenaStandsOptions = {}) {
    this.seats = seats;
    const col = o.colours ?? { left: GREENS[0], right: REDS[0] };
    const slots: CrowdSlot[] = seats.map(s => {
      const side = sideOf(s.a);
      return { id: s.id, x: s.x, y: s.top, z: s.z, yaw: s.yaw, seated: true, tags: [side, `tier${s.tier}`, ...(s.tier === 0 ? ['ringside'] : [])] };
    });
    this.crowd = new Crowd(slots, {
      quality: o.quality ?? N_QUALITY(nearCount), near: nearCount, seed: o.seed ?? 23, name: 'arena-stands', nearRadius: 9,
      look: (slot, r) => {
        const side = slot.tags?.[0];
        const look = defaultLook(r);
        if ((side === 'left' || side === 'right') && look.style !== 'dress' && r() < 0.45) {
          const c = side === 'left' ? (r() < 0.6 ? col.left : GREENS[1 + Math.floor(r() * 2)]) : (r() < 0.6 ? col.right : REDS[1 + Math.floor(r() * 2)]);
          look.shirt = c; if (look.style === 'boubou') look.legs = c;
        }
        return look;
      },
    });
    this.crowd.group.name = 'arena_crowd';
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
    let n = 0;
    for (const [g, kind, share, seconds] of momentPlan(m, o)) n += this.crowd.react(g, kind, { share, seconds });
    return n;
  }
  /** How loud the stands are (0–1), for the crowd's sound. */
  level(group = 'all') { return this.crowd.level(group); }

  /** Full humanoids on the crowd seats nearest to (x, z) (the player's seat), those in front first; null: none. */
  setNear(x: number, z: number | null, yaw = 0) { this.crowd.setFocus(x, z, z === null ? null : yaw); }
  /** The camera of this frame (LOD distances; near bodies outside the view are skipped). */
  cull(cam: THREE.Camera) { this.crowd.setCamera(cam); }
  update(dt: number, animate: boolean) { this.crowd.update(dt, animate); }
  stats() { return this.crowd.stats(); }
  dispose() { this.crowd.dispose(); }
}
