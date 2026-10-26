import type { GameState } from '../core/state';

/**
 * M2 « Ma première affaire » (docs/districts/M2-PLATEAU-MEDINA.md): the rules of a trade between Diallo & Frères (the Médina wholesaler) and the
 * Comptoir Sall (the Plateau buyer). Pure, unit-tested (tests/trade.test.ts). The module (src/districts/trade.ts) stands the traders in the world and
 * calls these.
 *
 * The contract with Living Dakar 2.0 (docs/districts/CONTRACT.md):
 * - money only through `GameState.addMoney` (one ledger line each, the lot's number in every label); no other wallet, no `move`;
 * - one lot in hand at a time. Its facts are in the existing `counters` (prefix `pl_`); its goods are counted in the existing `inventory` (`pl_<good>`);
 * - the sale is applied only from a stage that can sell, and the stage changes in the same synchronous step as the credit (the caller saves right after):
 *   a retry, a double tap or a reload never pays twice; moving between hubs makes no stock and no money.
 */
export type GoodId = 'the' | 'riz' | 'mangue';
export interface Good {
  id: GoodId; name: string; unit: string; units: string; icon: string;
  /** Wholesale price paid at Diallo's, and what the Comptoir pays, per unit. */
  buy: number; sell: number;
  /** Units the player can carry by hand (0: needs a vehicle or the porters). */
  hand: number;
  /** In-game days after which the goods are spoiled (0: never). */
  perish: number;
  /** Units the Comptoir buys per in-game day. */
  demand: number;
}
export const GOODS: Record<GoodId, Good> = {
  the: { id: 'the', name: 'Thé vert', unit: 'carton de 20 paquets', units: 'cartons', icon: '🍵', buy: 3000, sell: 3700, hand: 3, perish: 0, demand: 10 },
  riz: { id: 'riz', name: 'Riz brisé', unit: 'sac de 25 kg', units: 'sacs', icon: '🌾', buy: 9000, sell: 10200, hand: 0, perish: 0, demand: 8 },
  mangue: { id: 'mangue', name: 'Mangues', unit: 'cagette', units: 'cagettes', icon: '🥭', buy: 2500, sell: 3400, hand: 1, perish: 2, demand: 8 },
};
export const GOOD_IDS: readonly GoodId[] = ['the', 'riz', 'mangue'];

/** The porters' pousse-pousse: its fee for one lot, how many units it takes, how fast it goes (m/s). */
export const PORTER = { fee: 1500, max: 6, speed: 1.15 };
/** Units a vehicle's load can hold: a car (boot and back seat), a vehicle with a bed (pickup, utility). */
export const CAPACITY = { car: 4, bed: 10 };
/** Most units in one lot (whatever the transport). */
export const MAX_LOT = 10;
/** Diallo buys a lot back that has left his forecourt at this share of what it cost. */
export const BUYBACK = 0.7;
/** Spoiled goods fetch this share of their price at the Comptoir. */
export const SPOILED = 0.3;
/** After this many trades sold, Diallo knows the player: better terms on rice. */
export const TRUST = { trades: 3, discount: { riz: 0.05 } as Partial<Record<GoodId, number>> };

/** The save keys (existing `counters`, prefix `pl_`; docs/districts/M2-PLATEAU-MEDINA.md § Save). */
export const PL = {
  seq: 'pl_lot_seq', good: 'pl_lot_good', qty: 'pl_lot_qty', cost: 'pl_lot_cost', fee: 'pl_lot_fee', stage: 'pl_lot_stage', day: 'pl_lot_day',
  mode: 'pl_lot_mode', eta: 'pl_lot_eta',
  trades: 'pl_trades', rev: 'pl_rev_total', profit: 'pl_profit_total', units: 'pl_units_total',
  soldDay: 'pl_sold_day', sold: (g: GoodId) => `pl_sold_${g}`,
  met: 'pl_diallo_met', seen: 'pl_diallo_seen_day', trusted: 'pl_diallo_trust',
  last: { seq: 'pl_last_seq', rev: 'pl_last_rev', cost: 'pl_last_cost', fee: 'pl_last_fee', profit: 'pl_last_profit' },
} as const;
/** A lot's stage: bought (still on Diallo's forecourt), carried (by hand or in a vehicle), with the porters (on the way, then waiting at the Comptoir). */
export const STAGE = { none: 0, bought: 1, carried: 2, porter: 3 } as const;
export type Mode = 'hand' | 'vehicle' | 'porter';
const MODES: Mode[] = ['hand', 'vehicle', 'porter'];
export const itemOf = (g: GoodId) => `pl_${g}`;                  // (inventory ids are [a-z0-9_]: src/core/save.ts)

export interface Lot { seq: number; good: GoodId; qty: number; cost: number; fee: number; stage: number; day: number; mode: Mode | null; eta: number }

const c = (s: GameState, k: string) => s.data.counters[k] ?? 0;
const set = (s: GameState, k: string, v: number) => { if (v) s.data.counters[k] = v; else delete s.data.counters[k]; };
const inv = (s: GameState) => s.data.inventory;
const setGoods = (s: GameState, g: GoodId, n: number) => { const k = itemOf(g); if (n > 0) inv(s)[k] = n; else delete inv(s)[k]; };
export const fr = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

/** The lot in hand (null: none). */
export function lotOf(s: GameState): Lot | null {
  const stage = c(s, PL.stage); if (!stage) return null;
  const good = GOOD_IDS[c(s, PL.good)] ?? 'the', m = c(s, PL.mode);
  return { seq: c(s, PL.seq), good, qty: c(s, PL.qty), cost: c(s, PL.cost), fee: c(s, PL.fee), stage, day: c(s, PL.day), mode: m ? MODES[m - 1] : null, eta: c(s, PL.eta) };
}
function writeLot(s: GameState, l: Lot | null) {
  if (!l) { for (const k of [PL.good, PL.qty, PL.cost, PL.fee, PL.stage, PL.day, PL.mode, PL.eta]) set(s, k, 0); return; }
  set(s, PL.good, GOOD_IDS.indexOf(l.good)); set(s, PL.qty, l.qty); set(s, PL.cost, l.cost); set(s, PL.fee, l.fee); set(s, PL.stage, l.stage);
  set(s, PL.day, l.day); set(s, PL.mode, l.mode ? MODES.indexOf(l.mode) + 1 : 0); set(s, PL.eta, l.eta);   // (tea is good 0: no key)
}

export const trusted = (s: GameState) => c(s, PL.trades) >= TRUST.trades;
/** Diallo's price per unit now (better terms once he knows the player). */
export const priceOf = (s: GameState, g: GoodId) => Math.round(GOODS[g].buy * (1 - (trusted(s) ? TRUST.discount[g] ?? 0 : 0)));
export const spoiled = (l: Lot, day: number) => GOODS[l.good].perish > 0 && day - l.day >= GOODS[l.good].perish;

// ------------------------------------------------------------------ at Diallo's
export function whyNotBuy(s: GameState, g: GoodId, qty: number): string | null {
  if (lotOf(s)) return 'Tu as déjà un lot en main : vends-le d’abord';
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LOT) return `De 1 à ${MAX_LOT} ${GOODS[g].units}`;
  if (!s.canAfford(priceOf(s, g) * qty)) return 'Pas assez d’argent sur toi';
  return null;
}
/** Buy `qty` units of `g` with the player's own money: one debit, the lot numbered, the goods counted. */
export function buy(s: GameState, g: GoodId, qty: number, day: number): { ok: true; lot: Lot } | { ok: false; why: string } {
  const why = whyNotBuy(s, g, qty); if (why) return { ok: false, why };
  const seq = c(s, PL.seq) + 1, cost = priceOf(s, g) * qty;
  s.addMoney(-cost, `Médina · achat ${GOODS[g].name.toLowerCase()} ×${qty} · lot ${seq}`);
  set(s, PL.seq, seq);
  const lot: Lot = { seq, good: g, qty, cost, fee: 0, stage: STAGE.bought, day, mode: null, eta: 0 };
  writeLot(s, lot); setGoods(s, g, qty);
  return { ok: true, lot };
}
/** Before the lot leaves the forecourt: Diallo takes it back and refunds it fully. */
export function cancel(s: GameState): { ok: true; refund: number } | { ok: false; why: string } {
  const l = lotOf(s);
  if (!l) return { ok: false, why: 'Pas de lot' };
  if (l.stage !== STAGE.bought) return { ok: false, why: 'Le lot est parti : Diallo peut te le reprendre à 70 %' };
  s.addMoney(l.cost, `Médina · achat annulé · lot ${l.seq}`);
  writeLot(s, null); setGoods(s, l.good, 0);
  return { ok: true, refund: l.cost };
}
/** What each way of carrying the lot allows (`cap`: the units the player's vehicle holds, 0 when there is none at the bay). */
export function whyNotLoad(s: GameState, mode: Mode, cap = 0): string | null {
  const l = lotOf(s); if (!l) return 'Pas de lot';
  if (l.stage !== STAGE.bought) return 'Le lot est déjà parti';
  const G = GOODS[l.good];
  if (mode === 'hand') return G.hand === 0 ? `Trop lourd à porter : un véhicule ou le pousse-pousse` : l.qty > G.hand ? `À la main, ${G.hand} ${G.hand > 1 ? G.units : G.unit} au plus` : null;
  if (mode === 'vehicle') return cap <= 0 ? 'Gare ton véhicule dans la baie de chargement' : l.qty > cap ? `Ton véhicule en prend ${cap} au plus` : null;
  if (l.qty > PORTER.max) return `Le pousse-pousse en prend ${PORTER.max} au plus`;
  if (!s.canAfford(PORTER.fee)) return 'Pas assez d’argent pour le pousse-pousse';
  return null;
}
/** The lot leaves the forecourt: carried (by hand, in the vehicle) or with the porters, who pay nothing but the fee and reach the Comptoir at `eta` (played ms). */
export function load(s: GameState, mode: Mode, o: { cap?: number; playedMs?: number; metres?: number } = {}): { ok: true; lot: Lot } | { ok: false; why: string } {
  const why = whyNotLoad(s, mode, o.cap ?? 0); if (why) return { ok: false, why };
  const l = lotOf(s)!;
  if (mode === 'porter') {
    s.addMoney(-PORTER.fee, `Pousse-pousse · lot ${l.seq}`);
    l.fee = PORTER.fee; l.stage = STAGE.porter; l.eta = Math.round((o.playedMs ?? 0) + ((o.metres ?? 200) / PORTER.speed) * 1000);
  } else l.stage = STAGE.carried;
  l.mode = mode;
  writeLot(s, l);
  return { ok: true, lot: l };
}
/** After the lot has left: Diallo buys it back at 70 % of what it cost (the fee is not refunded). */
export function buyBack(s: GameState): { ok: true; paid: number; lost: number } | { ok: false; why: string } {
  const l = lotOf(s); if (!l) return { ok: false, why: 'Pas de lot' };
  if (l.stage === STAGE.bought) return { ok: false, why: 'Le lot n’est pas parti : annule-le' };
  if (l.stage === STAGE.porter) return { ok: false, why: 'Le lot est avec le pousse-pousse, au Comptoir' };
  const paid = Math.round(l.cost * BUYBACK);
  s.addMoney(paid, `Médina · lot ${l.seq} repris par Diallo`);
  writeLot(s, null); setGoods(s, l.good, 0);
  return { ok: true, paid, lost: l.cost + l.fee - paid };
}

// ------------------------------------------------------------------ at the Comptoir
/** Units of `g` the Comptoir still buys today. */
export function demandLeft(s: GameState, g: GoodId, day: number): number {
  return GOODS[g].demand - (c(s, PL.soldDay) === day + 1 ? c(s, PL.sold(g)) : 0);
}
/** Whether the lot can be sold at the Comptoir now (`there`: the goods are at its arcade — the player on foot with them, their vehicle at the bay, or the porters arrived). */
export function whyNotSell(s: GameState, day: number, there: boolean, playedMs = 0): string | null {
  const l = lotOf(s); if (!l) return 'Pas de lot à vendre';
  if (l.stage === STAGE.bought) return 'Le lot est encore chez Diallo';
  if (l.stage === STAGE.porter && playedMs < l.eta) return 'Le pousse-pousse n’est pas encore arrivé';
  if (l.stage === STAGE.carried && !there) return l.mode === 'vehicle' ? 'Gare ton véhicule dans la baie du Comptoir' : 'Apporte la marchandise au comptoir';
  if (demandLeft(s, l.good, day) <= 0) return `Sall a assez de ${GOODS[l.good].name.toLowerCase()} pour aujourd’hui : reviens demain`;
  return null;
}
export interface SaleResult { seq: number; good: GoodId; units: number; revenue: number; cost: number; fee: number; profit: number; spoiled: boolean; left: number }
/** What a sale would pay now (the units the Comptoir takes today, their share of the lot's cost and fee). */
export function quote(s: GameState, day: number): SaleResult | null {
  const l = lotOf(s); if (!l) return null;
  const units = Math.max(0, Math.min(l.qty, demandLeft(s, l.good, day))), sp = spoiled(l, day);
  const revenue = Math.round(units * GOODS[l.good].sell * (sp ? SPOILED : 1));
  const cost = Math.round(l.cost * units / l.qty), fee = Math.round(l.fee * units / l.qty);
  return { seq: l.seq, good: l.good, units, revenue, cost, fee, profit: revenue - cost - fee, spoiled: sp, left: l.qty - units };
}
/**
 * Sell to the Comptoir: the units it takes today are paid once (one credit, the lot's number in the label); what it cannot take today stays in hand at
 * its share of the cost. The lot's stage and the credit change together; the caller saves at once.
 */
export function sell(s: GameState, day: number, there: boolean, playedMs = 0): { ok: true; r: SaleResult } | { ok: false; why: string } {
  const why = whyNotSell(s, day, there, playedMs); if (why) return { ok: false, why };
  const l = lotOf(s)!, r = quote(s, day)!;
  if (r.units <= 0) return { ok: false, why: 'Rien à vendre aujourd’hui' };
  s.addMoney(r.revenue, `Plateau · vente ${GOODS[l.good].name.toLowerCase()} ×${r.units} · lot ${l.seq}`);
  if (c(s, PL.soldDay) !== day + 1) { for (const g of GOOD_IDS) set(s, PL.sold(g), 0); set(s, PL.soldDay, day + 1); }
  set(s, PL.sold(l.good), c(s, PL.sold(l.good)) + r.units);
  set(s, PL.rev, c(s, PL.rev) + r.revenue); set(s, PL.profit, c(s, PL.profit) + r.profit); set(s, PL.units, c(s, PL.units) + r.units);
  for (const [k, v] of [[PL.last.seq, l.seq], [PL.last.rev, r.revenue], [PL.last.cost, r.cost], [PL.last.fee, r.fee], [PL.last.profit, r.profit]] as const) s.data.counters[k] = v;
  if (r.left > 0) { l.qty = r.left; l.cost -= r.cost; l.fee -= r.fee; writeLot(s, l); setGoods(s, l.good, r.left); }
  else { writeLot(s, null); setGoods(s, l.good, 0); set(s, PL.trades, c(s, PL.trades) + 1); }
  return { ok: true, r };
}

/** The sum of a lot's ledger lines (every line that names it): what the player's money did for that lot. Tests and the debug sheet. */
export const ledgerOf = (s: GameState, seq: number) => s.data.ledger.filter(e => new RegExp(`· lot ${seq}( |$)`).test(e.label)).reduce((t, e) => t + e.amount, 0);
