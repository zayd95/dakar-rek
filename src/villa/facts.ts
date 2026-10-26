import type { GameState } from '../core/state';
import { holds, incomePerHour, netWorth } from '../economy/assets';
import { ownedVentures } from '../economy/business';
import { specOf } from '../economy/catalog';
import { VILLA_ID } from '../housing/villa';
import type { VillaGoalFacts } from './goal';

/** The villa's savings-goal facts (src/villa/goal.ts) read from the game state; null when the catalogue has no villa. */
export function villaFactsOf(s: GameState): VillaGoalFacts | null {
  const sp = specOf(VILLA_ID); if (!sp) return null;
  return { price: sp.price ?? 0, rent: sp.rent ?? 0, held: holds(s, VILLA_ID), income: incomePerHour(s), ventures: ownedVentures(s), cash: s.wallet + s.data.bank.savings, worth: netWorth(s) };
}
