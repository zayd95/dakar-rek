import type { GameCtx, GameModule } from '../game/modules';
import type { Seat } from '../interact/seats';
import { ARENA_OUTCOMES, ARENA_PHASES, ARENA_PRELIMS, type ArenaPresence, type Peer } from '../multiplayer/protocol';
import { ARENA_CROWD, FOLLOW_SLACK, arenaShow, type ShowResult } from './module';
import { remoteMain } from './myGala';

/**
 * Friends at the arena: the stands and the bout shared over the presence protocol. Only positions, poses and one
 * optional field cross it. No money, record, reward or outcome roll ever does.
 *
 * - Seated together: a remote player on a place in the stands is drawn seated there, from the protocol's Sit pose and
 *   height. That place is taken on this device too, so the crowd's figure moves off it and the player cannot sit on
 *   them, and it is freed when they get up or leave. « Encourager » (main.ts) makes a seated player stand up for a
 *   moment with their arms up (Celebrate), and everyone sees it.
 * - One bout for the group: while a show runs and the player is inside the walls, presence carries
 *   `arena: { d, p, t, i?, m?, w?, o? }` (city day, phase, time, which preliminary, `m` = 1 when they are tonight's
 *   main event themselves — src/arena/myGala.ts — and the result once known).
 *   The preliminaries (src/arena/undercard.ts) are followed the same way, each one seeded by `prelimSeed`.
 *   The evening's bout is seeded by
 *   (hub, day) and played in fixed steps (src/arena/bout.ts), so every device plays the same bout. The friend furthest
 *   on (the earliest in) is the reference: the others jump to their phase and second (forward only), and take the
 *   result they saw if their own differs. This alignment is client-side for now; a server-authoritative show clock
 *   comes later (docs/ARENA_VISIT.md).
 * - Leaving is presence: a friend who leaves the arena or the game stops sending it, so their place is freed and nobody
 *   follows them any more.
 */

/**
 * A friend's show as seen here: phase index (ARENA_PHASES), during the preliminaries which one (`i`), time now
 * (estimated, within that preliminary), the main event's result codes once known.
 */
export interface FriendShow { id: string; p: number; t: number; i?: number; w?: number; o?: number }
const FILLING = ARENA_PHASES.indexOf('filling'), LEAVING = ARENA_PHASES.indexOf('leaving');
/** How close (m) a remote sitter must be to a place on the tiers to be on it. */
export const SEAT_SNAP = 0.35;

/**
 * The show to follow: the friend furthest on (phase, then which preliminary, then time: the earliest in; ties to the
 * smaller id), when that friend is ahead of this show by a phase or a preliminary, or by `slack` seconds or more at the
 * same point. Otherwise null (this device leads, or is close enough).
 */
export function reference(local: { p: number; t: number; i?: number }, friends: readonly FriendShow[], slack = FOLLOW_SLACK): FriendShow | null {
  let best: FriendShow | null = null;
  const later = (a: FriendShow, b: FriendShow) => a.p !== b.p ? a.p > b.p : (a.i ?? 0) !== (b.i ?? 0) ? (a.i ?? 0) > (b.i ?? 0) : a.t !== b.t ? a.t > b.t : a.id < b.id;
  for (const f of friends) {
    if (f.p < FILLING || f.p > LEAVING) continue;
    if (!best || later(f, best)) best = f;
  }
  if (!best) return null;
  if (best.p !== local.p) return best.p > local.p ? best : null;
  if ((best.i ?? 0) !== (local.i ?? 0)) return (best.i ?? 0) > (local.i ?? 0) ? best : null;
  return best.t - local.t >= slack ? best : null;
}

/** The place on the tiers someone at (x, z) is on (within `r`), or null. */
export function seatAt<S extends Pick<Seat, 'x' | 'z'>>(seats: readonly S[], x: number, z: number, r = SEAT_SNAP): S | null {
  let best: S | null = null, bd = r;
  for (const s of seats) { const d = Math.hypot(s.x - x, s.z - z); if (d <= bd) { bd = d; best = s; } }
  return best;
}

/** A show's result as protocol codes (w: 0 nobody, 1 the left wrestler, 2 the right one; o: index in ARENA_OUTCOMES). */
export function resultCodes(r: ShowResult): { w: number; o: number } {
  return { w: r.winner === 'left' ? 1 : r.winner === 'right' ? 2 : 0, o: Math.max(0, ARENA_OUTCOMES.indexOf(r.outcome)) };
}
/** Protocol codes back to a result (null when incomplete). */
export function resultOf(w?: number, o?: number): ShowResult | null {
  if (w === undefined || o === undefined || !ARENA_OUTCOMES[o]) return null;
  return { winner: w === 1 ? 'left' : w === 2 ? 'right' : null, outcome: ARENA_OUTCOMES[o] };
}

/** This device's `arena` presence field for a running show (null when there is nothing to share). */
export function arenaField(st: { day: number; phase: string; t: number; i?: number; result: ShowResult | null; here: boolean; main?: boolean } | null): ArenaPresence | null {
  if (!st || !st.here || !Number.isInteger(st.day) || st.day < 1 || st.day > 1_000_000) return null;
  const p = ARENA_PHASES.indexOf(st.phase as typeof ARENA_PHASES[number]);
  if (p < FILLING || p > LEAVING) return null;
  // half-second steps: a seated friend sends about two updates a second, not one per frame
  const a: ArenaPresence = { d: st.day, p, t: Math.min(900, Math.max(0, Math.floor(st.t * 2) / 2)) };
  if (st.phase === 'prelims' && st.i !== undefined && Number.isInteger(st.i) && st.i >= 0 && st.i < ARENA_PRELIMS) a.i = st.i;   // which preliminary
  if (st.main) a.m = 1;                                                     // tonight's main event is this player (src/arena/myGala.ts)
  return st.result ? { ...a, ...resultCodes(st.result) } : a;
}

/** What this device made of its friends, for the checks: who it follows, which places they hold. */
const view = { ref: null as string | null, follows: 0, held: {} as Record<string, string>, main: null as string | null };
let tick = 0;

/** Friends' shows of the same evening, inside the walls, with their time now (their last time + the time since). */
function friendShows(ctx: GameCtx, peers: readonly Peer[], day: number): FriendShow[] {
  const now = ctx.now(), out: FriendShow[] = [];
  for (const p of peers) {
    const a = p.arena;
    if (!a || a.d !== day || p.space !== 'street' || !arenaShow.inside(p.x, p.z)) continue;
    out.push({ id: p.id, p: a.p, t: a.t + Math.min(2, Math.max(0, (now - p.updatedAt) / 1000)), i: a.i, w: a.w, o: a.o });
  }
  return out;
}

/** Places on the tiers held by remote sitters (and those freed when they got up or left). */
function holdSeats(peers: readonly Peer[]) {
  const seats = arenaShow.seats(), want = new Map<string, string>();
  for (const p of peers) {
    if (p.space !== 'street' || (p.clip !== 'Sit' && p.clip !== 'Celebrate') || !arenaShow.inside(p.x, p.z)) continue;
    const s = seatAt(seats, p.x, p.z); if (s) want.set(s.id, `peer:${p.id}`);
  }
  view.held = {};
  for (const s of seats) {
    const w = want.get(s.id);
    // over the crowd's figure (it moves off at the next fill) or another friend's old place; never over the player or an NPC
    if (w && (!s.occupant || s.occupant === ARENA_CROWD || s.occupant.startsWith('peer:'))) { s.occupant = w; view.held[s.id] = w.slice(5); }
    else if (!w && s.occupant?.startsWith('peer:')) s.occupant = null;
  }
}

export const togetherModule: GameModule = {
  name: 'arenaTogether',
  hubLoaded() { view.ref = null; view.held = {}; tick = 0; },
  update(ctx, dt) {
    if (!arenaShow.seats().length) return;
    tick -= dt; if (tick > 0) return;
    tick = 0.25;
    const peers = ctx.peers();
    holdSeats(peers);
    const day = arenaShow.day(); if (day === null) { view.ref = null; return; }
    // a friend fighting tonight's main event: their name on the card, their own duel and result (src/arena/myGala.ts)
    const main = remoteMain(peers, day, p => p.space === 'street' && arenaShow.inside(p.x, p.z));
    arenaShow.setRemote(main ? { id: main.id, name: main.name, ...(main.rec ? { rec: main.rec } : {}) } : null);
    view.main = main?.id ?? null;
    const st = arenaShow.state();
    if (st?.main) { view.ref = null; return; }                                // on their own gala night, the player leads
    const local = st ? { p: ARENA_PHASES.indexOf(st.phase), t: st.t, i: st.i } : { p: 0, t: 0 };
    const ref = peers.length ? reference(local, friendShows(ctx, peers, day)) : null;
    view.ref = ref?.id ?? null;
    if (ref && arenaShow.follow(ARENA_PHASES[ref.p], ref.t, resultOf(ref.w, ref.o), ref.i)) view.follows++;
  },
  presence() { const a = arenaField(arenaShow.state()); return a ? { arena: a } : null; },
  debug: () => ({
    /** Friends at the arena: the friend followed (null: this device leads), jumps made, places held by friends. */
    together: () => ({ ref: view.ref, follows: view.follows, held: { ...view.held }, main: view.main, field: arenaField(arenaShow.state()) }),
  }),
};
