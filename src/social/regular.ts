import type { GameState } from '../core/state';
import { PROFILES, type Perk } from './profiles';
import { greeting, isRegular } from './memory';
import type { Relations } from './relations';

/**
 * What a shopkeeper's own sheet shows once the player is a regular there (M1-C, first slice). Pure: it reads what the game already
 * keeps — the memory counters and the regular flag (src/social/memory.ts), the character's greeting and its neighbour price
 * (src/social/profiles.ts) — and invents nothing. Only the place the profile names as its own (`place`) is affected, so no other
 * character's menu changes.
 *  - `greeting`: a few words in the shopkeeper's voice, only for a regular (null otherwise: the sheet keeps its plain question);
 *  - `hide` + `was`: the neighbour price replaces the full price of the same good (same `counter`): the full-price row is hidden and
 *    the neighbour row shows the price it replaces, struck through. Without the perk's flags nothing changes.
 */
export interface ShopRegular {
  owner: string | null;
  greeting: string | null;
  /** Action ids not offered (the full price of a good the neighbour price replaces). */
  hide: ReadonlySet<string>;
  /** Action id → the price it replaces (to be shown struck through). */
  was: Readonly<Record<string, number>>;
}
const NONE: ShopRegular = { owner: null, greeting: null, hide: new Set(), was: {} };

const perkOpen = (p: Perk, s: GameState) => p.flags.length === 0 || p.flags.some(f => s.data.flags.includes(f));

export function shopRegular(placeId: string, s: GameState, r: Relations, hour: number): ShopRegular {
  const p = PROFILES.find(x => x.place && placeId.startsWith(x.place));
  if (!p) return NONE;
  const regular = isRegular(s, p.id);
  const line = regular ? greeting(p, { id: p.id, s, r, hour }).short ?? null : null;
  const hide = new Set<string>(), was: Record<string, number> = {};
  const perk = p.perk;
  if (perk && perk.cost !== undefined && perkOpen(perk, s)) {
    for (const sell of p.sells ?? []) {
      if (sell.counter && sell.counter === perk.counter && sell.cost !== undefined && sell.cost > perk.cost) { hide.add(sell.id); was[perk.id] = sell.cost; }
    }
  }
  return { owner: p.id, greeting: line, hide, was };
}
