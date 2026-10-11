import type { GameState } from '../core/state';
import { fcfaText } from './format';
import { pickupFrags, routeById } from './jobs';
import type { HubId } from '../core/types';
import { furnitureCount, goalItem, owns, priceOf } from './furniture';

/**
 * "Première ascension" — the next economic step shown in the suggestion chip:
 * first delivery → save up → first furniture (Ibou reacts) → the goal Ibou suggested. One step at a time.
 */
export interface Step { id: string; hint: string }

/**
 * The hub a step is about (the HUD's goal line shows a step only there, src/social/beats.ts suggestionHere): a
 * delivery's own hub, the Quincaillerie's (Pikine) for a purchase; null for a step that holds anywhere (saving up,
 * finding paid work in the hub one is in).
 */
export function stepHub(st: Step, s: GameState): HubId | null {
  if (st.id === 'goal_pickup' || st.id === 'goal_deliver') { const a = s.data.jobs.active; return (a && routeById(a.routeId)?.hub) || a?.hub || null; }
  if (st.id === 'goal_buy') return 'pikine';
  return null;
}

export function economyStep(s: GameState): Step | null {
  const a = s.data.jobs.active;
  if (a) {
    const r = routeById(a.routeId);
    if (r) return a.stage === 'pickup'
      ? { id: 'goal_pickup', hint: `Tiak Tiak : récupère le colis à ${r.from.name}.` }
      : { id: 'goal_deliver', hint: `Tiak Tiak : livre le colis à ${r.to.name}.` };
  }
  if ((s.data.counters.livraisons ?? 0) === 0) {
    // the neighbourhood the player is in: its own Tiak Tiak pick-up, else its own paid services (never another hub's)
    if (!pickupFrags(s.data.hub).length) return { id: 'goal_work', hint: 'Gagne ta vie : « Petits boulots » (téléphone › Travail) liste les services payés de ce quartier.' };
    const where = s.data.hub === 'plateau' ? 'la Gargote Chez Fatou (Plateau)' : 'la Gargote Mame Diarra (Pikine)';
    return { id: 'goal_tiak', hint: `Gagne ta vie : prends une livraison Tiak Tiak à ${where}.` };
  }
  // After the first piece of furniture, only the goal Ibou suggested stays on the chip (the rest is in the Carnet).
  const first = furnitureCount(s) === 0;
  if (!first && !('ibou_meuble' in s.data.beats)) return null;
  const item = goalItem(s);
  if (!item || (!first && !s.data.flags.includes('objectif:' + item.id))) return null;
  if (owns(s, item.id)) return null;
  const price = priceOf(item.id), missing = price - s.data.wallet;
  return missing > 0
    ? { id: 'goal_save', hint: `Mets de côté pour : ${item.name} (${fcfaText(price)}). Encore ${fcfaText(missing)} — livraisons Tiak Tiak.` }
    : { id: 'goal_buy', hint: `Tu peux t’offrir : ${item.name} (${fcfaText(price)}) à la Quincaillerie, près de la Maïga du marché (Pikine).` };
}

/** Longer view for the Carnet / home screen: always the next furniture goal, if any. */
export function homeGoalLine(s: GameState): string {
  const item = goalItem(s);
  if (!item) return 'Ta chambre est entièrement meublée.';
  const price = priceOf(item.id), missing = price - s.data.wallet;
  return `Prochain objectif : ${item.name} (${fcfaText(price)})${missing > 0 ? ` · encore ${fcfaText(missing)}` : ' · tu as de quoi l’acheter'}.`;
}
