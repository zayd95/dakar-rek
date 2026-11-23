import type { Bill } from './program';
import { cornerSides, type Who } from './ceremony';
import { PREP_SIDE } from '../world/arenaModules';
import { ARENA_OUTCOMES } from '../multiplayer/protocol';

/**
 * The player's own gala night (pure; tests/myGala.test.ts): when a gala place or the title bout makes them tonight's
 * main event (src/career), the bill names them, the ceremony is theirs, and friends in the stands see them through
 * their presence, never a simulated duel.
 *
 * The show itself is src/arena/module.ts; the ceremony's words are src/arena/ceremony.ts; the walk from the corner to the
 * ring and the duel are the fighter's path (src/arena/fighter.ts).
 */

/** The player is always the left side of their own main event's bill. */
export const PLAYER_SIDE: Who = 'left';

/** Tonight's bill when the player is the main event: them on the left, their named opponent on the right. */
export function playerMainBill(player: { name: string; ecurie: string | null }, opp: { id: string; name: string; ecurie: string | null }, title: boolean): Bill {
  return {
    left: { id: 'player', name: player.name, ecurie: player.ecurie ?? 'indépendant' },
    right: { id: opp.id, name: opp.name, ecurie: opp.ecurie ?? 'indépendant' },
    ...(title ? { title: true } : {}),
  };
}

/**
 * The écurie corner the player takes for their main event: the one the ceremony gives their side of the bill (their
 * écurie's, else the one their opponent leaves free), so the fighter's path, their people and the ceremony agree.
 */
export function playerCorner(bill: Bill): 'baobab' | 'teranga' {
  return cornerSides(bill)[PLAYER_SIDE] === PREP_SIDE.baobab ? 'baobab' : 'teranga';
}

/** The player's real result as the show's result (their side is the left one). */
export function myShowResult(winner: 'player' | 'opponent' | null, outcome: string): { winner: Who | null; outcome: (typeof ARENA_OUTCOMES)[number] } {
  const o = (ARENA_OUTCOMES as readonly string[]).includes(outcome) ? outcome as (typeof ARENA_OUTCOMES)[number] : 'egalite';
  return { winner: winner === 'player' ? PLAYER_SIDE : winner === 'opponent' ? 'right' : null, outcome: o };
}

/**
 * A friend who is tonight's main event, as the stands see them: the first peer (by id, so every device agrees) of this
 * evening, inside the walls, whose presence says so (`arena.m`). Null when none.
 */
export function remoteMain<P extends { id: string; name: string; arena?: { d: number; m?: number } }>(peers: readonly P[], day: number, inside: (p: P) => boolean): P | null {
  let best: P | null = null;
  for (const p of peers) if (p.arena?.m === 1 && p.arena.d === day && inside(p) && (!best || p.id < best.id)) best = p;
  return best;
}

/**
 * Who moves the main event on: the show's clock on an ordinary evening; on the player's own night, their walk to the
 * ring (the fighter's 'bout' cue) ends their entrance; on a friend's night, their presence moves this show to their
 * entrance, their bout and their result, never this device's clock (src/arena/together.ts follows them).
 */
export type MainDriver = 'clock' | 'mine' | 'friend';
export const mainDriver = (mine: boolean, remote: boolean): MainDriver => (mine ? 'mine' : remote ? 'friend' : 'clock');
/** The show goes on by itself from the stands' wait (the filling, the last preliminary) into the main entrance. */
export const entranceByClock = (d: MainDriver) => d !== 'friend';
/** The show goes on by itself from the entrance into the bout (when the ceremony's time is up). */
export const boutByClock = (d: MainDriver) => d === 'clock';
/**
 * « Je suis prêt » in their corner, on their own gala night, by the show's phase: before or during the preliminaries,
 * 'after-prelim' — the preliminary under way (or the first one, when the stands are still filling) is fought to its end,
 * then their entrance comes instead of the next one: the preliminaries still come first, no bout is cut off in the
 * middle; during their entrance, 'walk-out' — straight to it (the ceremony has named them); otherwise nothing.
 */
export function readyStep(phase: string): 'after-prelim' | 'walk-out' | 'none' {
  if (phase === 'idle' || phase === 'filling' || phase === 'prelims') return 'after-prelim';
  return phase === 'entrance' ? 'walk-out' : 'none';
}
/** After a preliminary's result: the next preliminary, their entrance (they said they are ready, or it was the last), or wait (a friend's night). */
export function afterPrelim(hasNext: boolean, ready: boolean, d: MainDriver): 'next' | 'entrance' | 'wait' {
  if (hasNext && !(ready && d === 'mine')) return 'next';
  return entranceByClock(d) ? 'entrance' : 'wait';
}
/** The player gave up their own bout before it started (their path back to idle in the entrance or the bout): no main event. */
export const mainCalledOff = (d: MainDriver, phase: string, fighterPhase: string) => d === 'mine' && (phase === 'entrance' || phase === 'bout') && fighterPhase === 'idle';

/** What the gala card says while a friend fights their own main event: their name only (their duel is theirs). */
export const remoteCard = (phase: string, name: string) => (phase === 'entrance' ? `Entrée de ${name}` : phase === 'bout' ? `Combat en cours : ${name}` : `${name}, combat de la soirée`);

/**
 * The player signs up for tonight's main event while this device's show already runs (seated first, then the gala
 * place at the arena's door): 'keep' — the filling or the preliminaries go on, their entrance comes after; 'entrance'
 * — the evening's entrance (or a bout already begun, never theirs) gives way to theirs, from its start; 'none' — the
 * main event is already over here (result, the crowd leaving): their bout is an ordinary one after the gala.
 */
export function takeOver(phase: string): 'keep' | 'entrance' | 'none' {
  if (phase === 'filling' || phase === 'prelims') return 'keep';
  if (phase === 'entrance' || phase === 'bout') return 'entrance';
  return 'none';
}

/**
 * The side the stands and the entourages cheer at the entrance and the result: on a friend's night nobody's side here
 * (their people and their corner are on their own device, and this device's card is not theirs), so the whole crowd
 * applauds; otherwise the bill's side.
 */
export const cheeredSide = <S extends string>(d: MainDriver, side: S | null): S | null => (d === 'friend' ? null : side);
