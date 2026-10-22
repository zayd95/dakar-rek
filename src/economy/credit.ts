import type { GameState } from '../core/state';
import type { LoanState } from '../core/types';
import { ECONOMY } from './config';

/**
 * Credit between people (pure rules, unit-tested): a car bought from Pape Sarr with a down payment and the rest in installments, a repair Modou lets the
 * player pay later. Game money only, no bank, no interest: what is owed is the price minus what was put down. Trust decides; a refusal is a refusal.
 *
 *   – Credit never puts money in the wallet: the down payment leaves it, the car arrives, the debt is recorded against that car's asset uid.
 *   – One open car credit at a time, one garage debt at a time, both capped; a financed car cannot be sold before it is paid off (src/economy/assets.ts).
 *   – A missed installment is remembered (trust falls, the next request is refused while it lasts); nothing is ever taken back: no repossession.
 *   – The numbers live in ECONOMY.credit (src/economy/config.ts).
 */
export const C = ECONOMY.credit;

export type Lender = LoanState['lender'];
export interface Offer {
  verdict: 'accept' | 'counter' | 'refuse';
  /** What he says (one line, his voice). */
  line: string;
  down: number; installments: number; installment: number; every: number;
  /** What would be owed after the down payment. */
  principal: number;
}
const round = (v: number, step: number) => Math.ceil(v / step) * step;

/** Open debts of one lender (or all). */
export const openLoans = (loans: readonly LoanState[], lender?: Lender) => loans.filter(l => l.status === 'open' && (!lender || l.lender === lender));
/** A lender's memory: due dates ever missed with him. */
export const missedWith = (loans: readonly LoanState[], lender: Lender) => loans.filter(l => l.lender === lender).reduce((n, l) => n + l.missed, 0);

/**
 * Pape Sarr's answer to « Tu me fais crédit ? » for a car at `price`: refused (he does not know the player, a debt is open, the car is above what he
 * finances, the player let him down before), or terms by trust — the more he trusts, the smaller the down payment and the longer the schedule. A counter-offer
 * is the same terms when the wallet cannot cover the down payment yet (he says how much to bring).
 */
export function dealerOffer(o: { trust: number; price: number; wallet: number; loans: readonly LoanState[] }): Offer {
  const D = C.dealer, none = { down: 0, installments: 0, installment: 0, every: D.every, principal: 0 };
  if (openLoans(o.loans, 'sarr').length) return { verdict: 'refuse', line: 'Termine d’abord le crédit que tu as chez moi. Après, on verra.', ...none };
  if (missedWith(o.loans, 'sarr') >= D.missedLimit) return { verdict: 'refuse', line: 'Tu m’as fait attendre trop souvent. Ici, maintenant, c’est comptant.', ...none };
  if (openLoans(o.loans).some(l => l.missed > 0 && l.paid < dueBy(l, l.checkedDay))) return { verdict: 'refuse', line: 'On me dit que tu as une dette en retard. Règle-la, puis reviens me voir.', ...none };
  if (o.price > D.maxPrice) return { verdict: 'refuse', line: 'Je fais crédit pour une citadine, pas pour une voiture de ministre.', ...none };
  const tier = D.tiers.find(t => o.trust >= t.trust);
  if (!tier) return { verdict: 'refuse', line: 'Je ne te connais pas encore assez. Rends-moi quelques services d’abord, on en reparle.', ...none };
  const down = 'down' in tier ? tier.down : round(o.price * tier.share, 5000);
  const principal = o.price - down, installment = Math.min(principal, D.installment);
  const terms = { down, installments: Math.ceil(principal / installment), installment, every: D.every, principal };
  if (o.wallet < down) return { verdict: 'counter', line: `Apporte-moi ${fmt(down)} d’avance et elle est à toi. Le reste, tu me le rends petit à petit.`, ...terms };
  return { verdict: 'accept', line: tier.trust >= D.tiers[0].trust ? 'Ta parole me suffit. Une petite avance, et tu me rembourses avec tes courses.' : 'D’accord. Une avance maintenant, le reste en plusieurs fois.', ...terms };
}

/** Owed by the end of city day `day` under the schedule (whole installments, never more than the principal). */
export function dueBy(l: LoanState, day: number): number {
  const n = Math.max(0, Math.floor((day - l.openedDay) / l.every));
  return Math.min(l.principal, n * l.installment);
}
/** How far behind a debt may fall before a due date counts as missed (its lender's grace, in installments). */
export const graceOf = (l: LoanState) => (l.lender === 'sarr' ? C.dealer.grace : C.garage.grace) * l.installment;
/**
 * Where a debt stands on the player's day `day`: what is behind the schedule (due on an earlier day and not repaid), the part of it beyond the lender's
 * grace (`late`: that is a missed promise), what is left, what was repaid (and its share of the whole), and the next installment to pay (amount, day): an
 * installment that falls due today is today's, not late — the whole of its day is there to pay it.
 */
export function standing(l: LoanState, day: number) {
  const left = l.principal - l.paid, behind = Math.max(0, dueBy(l, day - 1) - l.paid), late = Math.max(0, behind - graceOf(l)), owed = Math.max(0, dueBy(l, day) - l.paid);
  const done = { paid: l.paid, pct: l.principal ? Math.floor((l.paid / l.principal) * 100) : 100 };
  if (owed > behind) return { late, behind, left, next: Math.min(left, owed), nextDay: day, ...done };
  const k = Math.floor((day - l.openedDay) / l.every) + 1, nextDay = l.openedDay + k * l.every;
  return { late, behind, left, next: Math.min(left, Math.max(0, dueBy(l, nextDay) - l.paid)), nextDay, ...done };
}

/** Opens a debt (the caller has taken the down payment): the schedule starts on the player's day `day`, the first installment is due `every` days later. */
export function openLoan(list: LoanState[], seq: number, o: { lender: Lender; kind: LoanState['kind']; label: string; principal: number; installment: number; every: number; day: number; asset?: string; spec?: string }): LoanState {
  const l: LoanState = { id: `L${seq}`, lender: o.lender, kind: o.kind, label: o.label, principal: Math.round(o.principal), paid: 0, installment: Math.max(1, Math.round(o.installment)), every: o.every, openedDay: o.day, checkedDay: o.day, missed: 0, status: 'open', clock: 'play' };
  if (o.asset) l.asset = o.asset; if (o.spec) l.spec = o.spec;
  if (o.kind === 'vehicle') l.share = true;
  list.push(l);
  return l;
}
/**
 * A debt signed before the player's days (its days were city days, which ran on while the player was away: dozens of « missed » dates for a night's sleep)
 * moves onto the player's days now, as it stands: what was repaid stays repaid, the schedule restarts from today as if every installment so far had been
 * met, the dates already counted missed stay (the lender remembers). Pape Sarr's car credits take his present terms (a smaller installment, every day).
 * Returns true when it moved.
 */
export function onPlayClock(l: LoanState, day: number): boolean {
  if (l.clock === 'play') return false;
  if (l.lender === 'sarr' && l.kind === 'vehicle') { l.installment = Math.min(l.principal, C.dealer.installment); l.every = C.dealer.every; if (l.share === undefined) l.share = true; }
  l.openedDay = day - Math.floor(l.paid / l.installment) * l.every; l.checkedDay = day; l.clock = 'play';
  return true;
}
/** The part of a VTC fare that goes to Pape Sarr while his car credit runs (rounded down to 500 F, never more than is left). 0 when turned off. */
export function fareShare(l: LoanState | undefined, fare: number): number {
  if (!l || l.status !== 'open' || l.kind !== 'vehicle' || l.share === false) return 0;
  return Math.min(l.principal - l.paid, Math.floor((fare * C.dealer.fareShare) / 500) * 500);
}

/** Repays up to `amount` (never more than what is left); closes the debt when it is all repaid. Returns what was taken. */
export function repay(l: LoanState, amount: number, day: number): number {
  if (l.status !== 'open') return 0;
  const take = Math.max(0, Math.min(Math.round(amount), l.principal - l.paid));
  l.paid += take;
  if (l.paid >= l.principal) { l.status = 'closed'; l.closedDay = day; }
  return take;
}

/**
 * The days that are over since the debt was last looked at: each due date whose day ended with less repaid than the schedule asked is one more missed date
 * (on its own day an installment can still be paid on time). Returns how many were missed now (the lender's trust falls by that many steps; the caller says so).
 * Idempotent for the same day.
 */
export function settle(l: LoanState, day: number): number {
  const over = day - 1;                                                                // the last city day that has ended
  if (l.status !== 'open' || over <= l.checkedDay) { if (l.status !== 'open') l.checkedDay = Math.max(l.checkedDay, over); return 0; }
  let missed = 0;
  for (let d = l.checkedDay + 1; d <= over; d++) if ((d - l.openedDay) % l.every === 0 && d > l.openedDay && l.paid < dueBy(l, d) - graceOf(l)) missed++;
  l.missed += missed; l.checkedDay = over;
  return missed;
}

// ------------------------------------------------------------------------------------------------ the garage: Modou lets a trusted customer pay later
export interface GarageDeal { id: 'full' | 'part' | 'trust'; label: string; pay: number; debt: number; line: string }
/**
 * What Modou proposes when the player asks to talk about the bill (« Discuter »): always the full price; to someone he knows, a part now and the rest
 * later (more later the more he trusts them); to a trusted, reliable customer, a discount on top; nothing on credit to someone with a garage debt
 * still open, a bad record, or a bill above what he can carry. The repair itself is unchanged (Lamine does it, one payment at the end).
 */
export function garageDeals(o: { cost: number; trust: number; trusted: boolean; loans: readonly LoanState[] }): { deals: GarageDeal[]; line: string } {
  const G = C.garage, full: GarageDeal = { id: 'full', label: 'Payer tout', pay: o.cost, debt: 0, line: '' };
  if (o.cost <= 0) return { deals: [full], line: 'C’est rien, ça : c’est offert.' };
  if (openLoans(o.loans, 'modou').length) return { deals: [full], line: 'Tu me dois déjà de l’argent. Règle d’abord, puis on parle d’arrangement.' };
  if (missedWith(o.loans, 'modou') >= G.missedLimit) return { deals: [full], line: 'La dernière fois, j’ai attendu. Ici c’est comptant maintenant.' };
  if (o.trust < G.trustToArrange && !o.trusted) return { deals: [full], line: 'Je ne te connais pas encore assez pour te faire crédit. Mais Lamine travaille bien, et le prix est juste.' };
  const reliable = missedWith(o.loans, 'modou') === 0 && o.loans.some(l => l.lender === 'modou' && l.status === 'closed');
  const share = o.trusted || o.trust >= G.trustedLevel ? G.partTrusted : G.partKnown;
  const pay = Math.max(G.minNow, round(o.cost * share, 500)), debt = Math.min(G.maxDebt, o.cost - pay);
  const deals: GarageDeal[] = [full];
  if (pay + debt === o.cost && debt > 0) deals.push({ id: 'part', label: `${fmt(pay)} maintenant, ${fmt(debt)} plus tard`, pay, debt, line: 'Paie une partie maintenant, le reste quand tu peux. Je te fais confiance.' });
  if ((o.trusted || o.trust >= G.trustedLevel) && reliable) {
    const price = round(o.cost * (1 - G.discount), 500);
    deals.push({ id: 'trust', label: `Prix d’ami : ${fmt(price)}`, pay: price, debt: 0, line: 'Pour toi, prix d’ami. Tu as toujours été réglo avec moi.' });
  }
  return { deals, line: deals.length > 1 ? (deals.some(d => d.id === 'trust') ? 'Tu es de la maison. Choisis ce qui t’arrange.' : 'On peut s’arranger.') : 'Pour ce montant, je ne peux pas faire crédit. Désolé.' };
}

const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} F`;

// ------------------------------------------------------------------------------------------------ the state's side
export function nextLoanSeq(s: GameState): number { s.data.loans.seq += 1; return s.data.loans.seq; }
/** The open debt on a vehicle (asset uid), if any: it cannot be sold before it is paid off. */
export const loanOnAsset = (s: GameState, uid: string) => s.data.loans.list.find(l => l.status === 'open' && l.asset === uid) ?? null;
