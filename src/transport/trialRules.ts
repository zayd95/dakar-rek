import { perks } from '../economy/streak';

/**
 * What a dealer's free trial allows (pure, unit-tested). Every trial lets the player walk round the car, open its door, sit in it, look at the dashboard and
 * start the engine where it stands (« essai à l'arrêt »: the salesperson keeps the handbrake on). Taking it out on the road is another thing, and each
 * dealer says when he lets it go:
 *   – to a customer who can pay for it there and then (the money is in the wallet: the test drive before signing);
 *   – Pape Sarr (Sarr Auto), to someone he trusts (his errands, src/transport/sarrAuto.ts), or to a regular worker (3 days in a row, src/economy/streak.ts);
 *   – Moussa Ndiaye (Ndiaye Auto), to a regular worker (3 days in a row);
 *   – Prestige Auto, to a regular worker of 5 days in a row: a supervised loop in the Almadies (his words, and a call to bring it back).
 * A road test keeps to its district: near a way out of it the car is slowed to a stop and the salesperson says why (never an invisible wall).
 */
export type Dealer = 'sarr' | 'ndiaye' | 'prestige';
export interface RoadTest {
  /** The car may leave its bay for the street. */
  ok: boolean;
  /** Supervised: the salesperson asks for it back after a short loop. */
  supervised: boolean;
  /** What the salesperson says (why, or how to get one). */
  line: string;
}
/** Pape Sarr lets a car go on the road from this trust (the first level at which he talks credit, src/economy/config.ts). */
export const SARR_ROAD_TRUST = 20;
/** A supervised Prestige test drive lasts about this long (game seconds) before he calls it back. */
export const SUPERVISED_S = 150;

export function roadTest(o: { dealer: Dealer; price: number; wallet: number; trust?: number; run: number }): RoadTest {
  const p = perks(o.run), can = o.wallet >= o.price;
  if (o.dealer === 'prestige') {
    if (can) return { ok: true, supervised: true, line: 'Vous pouvez vous l’offrir : faites un petit tour aux Almadies avec, sans engagement.' };
    if (p.prestigeTest) return { ok: true, supervised: true, line: 'Moussa Ndiaye, de Ndiaye Auto, m’a parlé de vous : un travailleur sérieux. Un petit tour encadré aux Almadies, et vous me la ramenez.' };
    return { ok: false, supervised: false, line: 'Ici l’essai se fait à l’arrêt : asseyez-vous, démarrez-la. Sur la route, c’est pour qui peut la payer, ou pour un travailleur régulier (5 jours d’affilée).' };
  }
  if (o.dealer === 'sarr') {
    if (can) return { ok: true, supervised: false, line: 'Tu peux la payer : va faire un tour avec, dans le quartier.' };
    if ((o.trust ?? 0) >= SARR_ROAD_TRUST) return { ok: true, supervised: false, line: 'Je te connais maintenant : prends-la, fais un tour dans le quartier.' };
    if (p.cityTest) return { ok: true, supervised: false, line: 'Tu travailles tous les jours, ça se voit : va l’essayer dans le quartier.' };
    return { ok: false, supervised: false, line: 'Essai à l’arrêt pour l’instant : assieds-toi, démarre-la. Pour la route, rends-moi quelques services, ou travaille 3 jours d’affilée.' };
  }
  if (can) return { ok: true, supervised: false, line: 'Vous pouvez la payer : faites un tour dans le quartier avec.' };
  if (p.cityTest) return { ok: true, supervised: false, line: 'Un travailleur régulier : allez l’essayer dans le quartier.' };
  return { ok: false, supervised: false, line: 'Essai à l’arrêt : asseyez-vous, démarrez-la. Sur la route : quand vous pourrez la payer, ou après 3 jours de travail d’affilée.' };
}
