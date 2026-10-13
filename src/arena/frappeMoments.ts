import type { StandSide } from '../crowd/arenaStands';
import type { ReactionKind } from '../crowd/reactions';
import { ARENA } from '../i18n/lines';

/**
 * Làmb 2.0 (?lamb2): how the arena answers the moments of a bout avec frappe — the player's own main event (the
 * fighter's evening, LambDuel.onMoment through GameModule.lamb) and the watched one (its duel's onMoment): one plan for
 * both, applied by src/arena/module.ts with the stands' own calls (react, moment) and its fall reaction (fallSplit).
 * Pure (tests/frappeMoments.test.ts).
 *
 * - A clean strike: the striker's side answers — a shout for a big one, a few hands for a quick one.
 * - A knockdown (a strike takes the balance: he staggers, « vacille ») is not the fall: the striker's side stands up,
 *   the ends shout, the announcer says he is still up and the bout goes on.
 * - The fall that ends it: the stands split (the winner's side celebrates, the others hold their heads); a decision
 *   brings the stands up.
 * - The referee raises the winner's arm: the announcer gives the result. Then the stands' result plan.
 */
export type FrappeMoment = 'strike' | 'stagger' | 'fall' | 'arm' | 'result';

export interface FrappePlan {
  /** The moment this plan answers. */
  m: FrappeMoment;
  /** Groups that react, how, which share, how long (ArenaStands.react). */
  react: [StandSide | 'ends' | 'all', ReactionKind, number, number][];
  /** The fall that ends it: the winner's side for the stands' split (the arena's fallReaction). */
  split: StandSide | null;
  /** One of the gala's own moments for the stands (ArenaStands.moment): the decision, the result. */
  moment: 'decision' | 'result' | null;
  /** The announcer's line (null: he says nothing). */
  say: string | null;
  /** How loud the crowd's sound is (0: none). */
  cheer: number;
  /** The side concerned (for the result: the winner's supporters). */
  side: StandSide | null;
}

/**
 * `side`: the stands' side of the wrestler concerned — who landed the strike, who made the other stagger, who won.
 * `name`: whom the announcer names (the one who staggers; the winner). `announce`: false keeps him quiet (the watched
 * main event's result is announced by the show itself).
 */
export function frappePlan(m: FrappeMoment, side: StandSide | null,
  o: { kind?: 'quick' | 'big'; outcome?: string; name?: string | null; announce?: boolean } = {}): FrappePlan {
  const plan: FrappePlan = { m, react: [], split: null, moment: null, say: null, cheer: 0, side };
  const announce = o.announce !== false && !!o.name;
  switch (m) {
    case 'strike':
      if (!side) return plan;
      if (o.kind === 'big') { plan.react.push([side, 'shout', 0.45, 1.8]); plan.cheer = 0.08; }
      else plan.react.push([side, 'applause', 0.12, 1.1]);
      return plan;
    case 'stagger':
      if (side) plan.react.push([side, 'standUp', 0.55, 2.5], ['ends', 'shout', 0.3, 1.6]);
      plan.cheer = 0.12;
      if (announce) plan.say = ARENA.knockdown(o.name!);
      return plan;
    case 'fall':
      if (o.outcome === 'projection' && side) plan.split = side;
      else plan.moment = 'decision';
      return plan;
    case 'arm':
      if (announce && (o.outcome === 'projection' || o.outcome === 'decision')) plan.say = `🎤 L’annonceur : l’arbitre lève le bras… ${ARENA.result(o.name!, o.outcome)}`;
      return plan;
    case 'result':
      plan.moment = 'result';
      return plan;
  }
}
