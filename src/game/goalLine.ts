import type { Needs } from '../core/types';
import { fcfaText } from '../economy/format';

/**
 * The HUD's goal line, here and now (pure; tests/goalLine.test.ts): what main.ts shows under the wallet, in this order —
 *   1. the walking marker the player chose (« Les coins du quartier », « Y aller »);
 *   2. the fighter's own evening (src/arena/eveningCall.ts: entrance, corner, ring, the way out);
 *   3. a critical need, met in this hub with what the player can afford (`needGoal`);
 *   4. tonight's gala (eveningCall: the ticket, the gate, a seat, the way out, after the gala);
 *   5. the lead that makes sense in this hub at this hour (src/social/beats.ts suggestionHere).
 * Nothing else: a lead about another hub stays in the Carnet, and Tonton Ibou's welcome only leads in the first moments
 * of a new game (src/social/beats.ts welcomeEarly).
 */
export type GoalKind = 'walking' | 'fighter' | 'need' | 'evening' | 'local';
export function pickGoal(g: Partial<Record<GoalKind, string | null>>): { kind: GoalKind; text: string } | null {
  for (const kind of ['walking', 'fighter', 'need', 'evening', 'local'] as const) { const t = g[kind]; if (t) return { kind, text: t }; }
  return null;
}

/** Energy under this: running stops at 12 (src/game/stride.ts) and every paid service needs more — rest first. */
export const TIRED = 15;
/** Hunger under this (and money for a meal here): eat. */
export const HUNGRY = 12;

/** A place of this hub with what it offers (the hub's own interactables, as main.ts has them). */
export interface GoalSpot {
  id: string; name: string; x: number; z: number;
  actions: readonly { label: string; cost?: number; needs?: Partial<Needs>; special?: string }[];
}
interface Found { spot: GoalSpot; label: string; cost: number; d: number }
function nearest(spots: readonly GoalSpot[], here: { x: number; z: number }, ok: (a: GoalSpot['actions'][number]) => boolean): Found | null {
  let best: Found | null = null;
  for (const s of spots) for (const a of s.actions) {
    if (a.special || !ok(a)) continue;
    const d = Math.hypot(s.x - here.x, s.z - here.z);
    if (!best || d < best.d) best = { spot: s, label: a.label, cost: a.cost ?? 0, d };
  }
  return best;
}
const target = (s: GoalSpot) => ({ name: s.name, x: s.x, z: s.z });

/**
 * A critical need, met here (null: none critical, or nothing in this hub the player can do about it now). Tired:
 * home to sleep when the player's home is in this hub, else the nearest free rest (« Se poser à l'ombre »), else the
 * nearest energy they can pay for. Hungry: the nearest meal or snack they can pay for. Walking never needs energy.
 */
export function needGoal(o: { needs: Needs; wallet: number; here: { x: number; z: number }; spots: readonly GoalSpot[]; home: GoalSpot | null }):
  { text: string; target: { name: string; x: number; z: number } } | null {
  if (o.needs.energie < TIRED) {
    if (o.home) return { text: `Fatigué : rentre dormir chez toi — ${o.home.name}`, target: target(o.home) };
    const rest = nearest(o.spots, o.here, a => (a.needs?.energie ?? 0) > 0 && !(a.cost ?? 0));
    if (rest) return { text: `Fatigué : ${rest.label} — ${rest.spot.name}`, target: target(rest.spot) };
    const buy = nearest(o.spots, o.here, a => (a.needs?.energie ?? 0) > 0 && (a.cost ?? 0) <= o.wallet);
    if (buy) return { text: `Fatigué : ${buy.label} (${fcfaText(buy.cost)}) — ${buy.spot.name}`, target: target(buy.spot) };
  }
  if (o.needs.faim < HUNGRY) {
    const food = nearest(o.spots, o.here, a => (a.needs?.faim ?? 0) > 0 && (a.cost ?? 0) <= o.wallet);
    if (food) return { text: `Faim : ${food.label}${food.cost ? ` (${fcfaText(food.cost)})` : ''} — ${food.spot.name}`, target: target(food.spot) };
  }
  return null;
}
