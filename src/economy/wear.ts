import type { GameState } from '../core/state';
import type { FanPresence } from '../multiplayer/protocol';
import { WEAR, wearSpec, type WearSpec } from './catalog';
import { addOwned, holds } from './assets';

/**
 * A supporter's colours (spec 10 Oct, « rester dans l'arène avec d'autres joueurs »: who supports whom): scarves, caps,
 * small flags and tees in an écurie's colours, bought at the arena's stall « Couleurs du Géew » (src/arena/exteriorRules.ts),
 * owned like any good (listed in « Biens », sold back there) and worn one at a time. What is worn is a counter of the save
 * (no schema change); src/arena/supporters.ts draws it on the player and tells the others (presence `fan`). Cosmetic:
 * no stat, no money, no reward comes from wearing it.
 */
export const WORN_COUNTER = 'supporter_porte';

/** What the player wears now (null: nothing, or a piece no longer owned). */
export function worn(s: GameState): WearSpec | null {
  const sp = WEAR[(s.data.counters[WORN_COUNTER] ?? 0) - 1];
  return sp && holds(s, sp.id) ? sp : null;
}
/** Wear an owned piece (null: take it off). False when the piece is not the player's. */
export function setWorn(s: GameState, id: string | null): boolean {
  if (id === null) { s.data.counters[WORN_COUNTER] = 0; return true; }
  const i = WEAR.findIndex(w => w.id === id);
  if (i < 0 || !holds(s, id)) return false;
  s.data.counters[WORN_COUNTER] = i + 1;
  return true;
}
/** Why a piece cannot be bought (one of each), or null. The price itself is checked and paid by the stall's offer. */
export const cannotTakeGear = (s: GameState, id: string): string | null => (!wearSpec(id) ? 'Inconnu' : holds(s, id) ? 'Déjà à toi' : null);
/** A piece just paid at the stall: it becomes the player's (« Biens ») and they put it on. */
export function takeGear(s: GameState, id: string): WearSpec | null {
  const sp = wearSpec(id); if (!sp || cannotTakeGear(s, id)) return null;
  addOwned(s, id, sp.price ?? 0);
  setWorn(s, id);
  return sp;
}
/** The presence field for a worn piece (null: nothing worn). */
export const fanOf = (sp: WearSpec | null): FanPresence | null => (sp ? { e: sp.ecurie, k: sp.item } : null);
