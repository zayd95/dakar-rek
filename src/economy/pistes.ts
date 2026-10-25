import type { HubId } from '../core/types';

/**
 * « Mes pistes » (LD2.0-A1): a few honest leads drawn from the player's real situation — work done, cash, savings, what they own, who trusts them, where
 * they are. Pure and deterministic (unit-tested); the facts are gathered by src/economy/pistesModule.ts from the systems that own them, and a lead is only
 * built when its place or app really exists and its offer is really open: no invented loan, price, place or service.
 *
 *   – Every lead has a `key`: the facts it depends on. A lead the player dismissed (or followed) stays away while its key is the same; a meaningful change
 *     (a car bought, a business opened, a new bracket of savings) makes it a new lead.
 *   – Leads are suggestions, never steps: nothing is locked behind them, ignoring all of them changes nothing.
 *   – Order: what the player can do now first; at most a few are kept.
 */
export interface PlaceRef { id: string; hub: HubId; name: string }
export type PisteGo = { place: PlaceRef } | { app: string };
export interface Piste {
  id: string;
  icon: string;
  title: string;
  /** What is said (one or two short sentences). */
  line: string;
  /** Where « Y aller » leads: a real place (marked and guided to) or a phone app. */
  go: PisteGo;
  key: string;
  /** Can be offered once in the street after a piece of work (the phone always lists it). */
  afterWork: boolean;
}

export interface PisteFacts {
  hub: HubId;
  hour: number;
  wallet: number;
  savings: number;
  /** Tiak Tiak deliveries ever made, VTC rides ever driven. */
  deliveries: number; vtcTrips: number;
  /** Cars the player owns (financed included). */
  cars: number;
  /**
   * Pape Sarr's credit for his car, from src/economy/credit.ts `dealerOffer` with his real trust; null when Sarr Auto is not known to this build.
   * `refusal`: why he would say no today ('trust': he does not know the player well enough yet; anything else: a debt or a broken promise).
   */
  sarr: { place: PlaceRef; refusal: null | 'trust' | 'other' } | null;
  /** The savings account: the bank's counter (null when the service is not in this build), and whether the player opened one. */
  bank: { place: PlaceRef; opened: boolean } | null;
  /** Business units owned; the bana-bana table's price now and where it is bought (its place in the world, else the Affaires app). */
  ventures: number;
  bana: { price: number; place: PlaceRef | null } | null;
  /** Furniture at the principal home, the cheapest piece, the furniture shop. */
  furniture: number; cheapestFurniture: number; furnitureShop: PlaceRef | null;
  needs: { social: number; moral: number };
  /** The square of this district (to meet people), when it has one. */
  square: PlaceRef | null;
  /** Activities not practised lately (src/economy/polyvalence.ts), with where they are done. */
  variety: { label: string; where: string }[];
}

const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} F`;
/** Cash brackets for keys: a lead about money comes back only when the player has moved to another bracket. */
const bracket = (v: number) => (v < 10_000 ? 0 : v < 25_000 ? 1 : v < 50_000 ? 2 : v < 100_000 ? 3 : v < 300_000 ? 4 : v < 1_500_000 ? 5 : 6);

/** The leads that make sense now, best first (at most `max`). */
export function pistes(f: PisteFacts, max = 4): Piste[] {
  const out: Piste[] = [], cash = f.wallet + f.savings;
  // a car on credit: someone who works seriously and has no car; Pape Sarr decides (his real answer at Sarr Auto)
  if (f.sarr && f.cars === 0 && (f.deliveries >= 3 || f.vtcTrips > 0) && f.sarr.refusal !== 'other') {
    out.push({
      id: 'credit_sarr', icon: '🚗', title: 'Une voiture à crédit',
      line: f.sarr.refusal === 'trust'
        ? 'Tu travailles sérieusement. Pape Sarr fait crédit aux gens qu’il connaît : va te présenter à Sarr Auto, il te dira ce qu’il attend.'
        : 'Tu travailles sérieusement. Pape Sarr pourrait t’expliquer comment obtenir une voiture à crédit.',
      go: { place: f.sarr.place }, key: `cars0|${f.sarr.refusal ?? 'open'}`, afterWork: true,
    });
  }
  // the first business: what is in hand (pocket and savings) pays for the bana-bana table
  if (f.bana && f.ventures === 0 && cash >= f.bana.price) {
    out.push({
      id: 'first_business', icon: '🧺', title: 'Ta première affaire',
      line: `Avec ${fmt(cash)}, tu peux t’offrir une table de bana-bana (${fmt(f.bana.price)}) : elle rapporte pendant que tu travailles ailleurs.`,
      go: f.bana.place ? { place: f.bana.place } : { app: 'affaires' }, key: `v0|${f.bana.price}`, afterWork: true,
    });
  }
  // the savings account: money in the pocket and no account yet
  if (f.bank && !f.bank.opened && f.wallet >= 15_000) {
    out.push({
      id: 'bank_open', icon: '🏦', title: 'Mettre de côté',
      line: `Tu as ${fmt(f.wallet)} en poche. À la Banque Teranga, tu peux en mettre une partie de côté et te fixer un objectif.`,
      go: { place: f.bank.place }, key: 'open', afterWork: true,
    });
  } else if (f.bank && f.bank.opened && f.bana && f.ventures === 0 && cash < f.bana.price && cash >= f.bana.price * 0.5) {
    // close to the first business: how much is missing, and the account to save it in
    out.push({
      id: 'save_for_bana', icon: '🎯', title: 'Bientôt ta première affaire',
      line: `Encore ${fmt(f.bana.price - cash)} et la table de bana-bana est à toi. Ton épargne t’aide à ne pas le dépenser ailleurs.`,
      go: { place: f.bank.place }, key: `near|${bracket(cash)}`, afterWork: false,
    });
  }
  // a car and no ride yet: the VTC app
  if (f.cars > 0 && f.vtcTrips === 0) {
    out.push({ id: 'vtc_first', icon: '🚖', title: 'Gagner avec ta voiture', line: 'Avec ta voiture, tu peux faire des courses VTC : l’appli te propose des clients près de toi.', go: { app: 'vtc' }, key: 'vtc0', afterWork: false });
  }
  // a home to furnish
  if (f.furnitureShop && f.furniture < 2 && f.wallet >= Math.max(15_000, f.cheapestFurniture * 2)) {
    out.push({ id: 'furnish', icon: '🛋️', title: 'Arranger chez toi', line: `Chez toi, c’est encore vide. ${f.furnitureShop.name} a de quoi l’arranger, à partir de ${fmt(f.cheapestFurniture)}.`, go: { place: f.furnitureShop }, key: `f${f.furniture}`, afterWork: false });
  }
  // variety: an activity not practised lately (an optional pay bonus)
  if (f.deliveries >= 5 && f.variety.length) {
    const v = f.variety[0];
    out.push({ id: 'variety', icon: '🔀', title: 'Varier tes journées', line: `${v.label} : ${v.where}. Chaque activité différente de ces derniers jours ajoute 5 % à ta paie.`, go: { app: 'travailler' }, key: `poly|${v.label}`, afterWork: false });
  }
  // people: the player has not seen anyone for a while
  if (f.square && f.needs.social < 35) {
    out.push({ id: 'meet', icon: '🫖', title: 'Voir du monde', line: `Ça fait longtemps que tu n’as parlé à personne. Passe prendre un thé et des nouvelles : ${f.square.name}.`, go: { place: f.square }, key: `social|${f.hub}`, afterWork: false });
  }
  return out.slice(0, max);
}

/** What the player did with the leads (saved: SaveData.pistes). `off`: lead id → the key it was dismissed or followed with; `offered`: shown in the street. */
export interface PistesState { off: Record<string, string>; offered: Record<string, string>; lastMs: number }
export const newPistes = (): PistesState => ({ off: {}, offered: {}, lastMs: 0 });
/** The leads still open: not dismissed or followed with the same facts. */
export const openPistes = (list: Piste[], st: PistesState) => list.filter(p => st.off[p.id] !== p.key);
/** The lead to offer once in the street after a piece of work: open, `afterWork`, never offered with these facts, and none offered for `gapMs` of play. */
export function offerNow(list: Piste[], st: PistesState, playedMs: number, gapMs: number): Piste | null {
  if (st.lastMs > 0 && playedMs - st.lastMs < gapMs) return null;
  return openPistes(list, st).find(p => p.afterWork && st.offered[p.id] !== p.key) ?? null;
}

const KEY = /^[a-z0-9_]{1,32}$/;
/** Sanitises the saved state (malformed entries dropped). */
export function pistesOf(v: unknown, playedMs: number): PistesState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const rec = (x: unknown) => Object.fromEntries(Object.entries(x && typeof x === 'object' ? x as Record<string, unknown> : {}).filter(([k, val]) => KEY.test(k) && typeof val === 'string' && val.length <= 64).slice(0, 40)) as Record<string, string>;
  const last = typeof o.lastMs === 'number' && Number.isFinite(o.lastMs) ? Math.max(0, Math.min(playedMs, o.lastMs)) : 0;
  return { off: rec(o.off), offered: rec(o.offered), lastMs: last };
}
