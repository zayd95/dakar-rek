import type { GameState } from '../core/state';
import { fcfaText } from './format';
import { routeById } from './jobs';
import { goalItem, owns, priceOf } from './furniture';

/**
 * "Première ascension" — the next economic step shown in the suggestion chip:
 * first delivery → save up → first furniture (Ibou reacts) → the goal Ibou suggested. One step at a time.
 */
export interface Step { id: string; hint: string }

export function economyStep(s: GameState): Step | null {
  const a = s.data.jobs.active;
  if (a) {
    const r = routeById(a.routeId);
    if (r) return a.stage === 'pickup'
      ? { id: 'goal_pickup', hint: `Tiak Tiak : récupère le colis à ${r.from.name}.` }
      : { id: 'goal_deliver', hint: `Tiak Tiak : livre le colis à ${r.to.name}.` };
  }
  if ((s.data.counters.livraisons ?? 0) === 0) {
    const where = s.data.hub === 'plateau' ? 'la Gargote Chez Fatou (Plateau)' : 'la Gargote Mame Diarra (Pikine)';
    return { id: 'goal_tiak', hint: `Gagne ta vie : prends une livraison Tiak Tiak à ${where}.` };
  }
  // After the first piece of furniture, only the goal Ibou suggested stays on the chip (the rest is in the Carnet).
  const first = s.data.furniture.length === 0;
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
