import type { GameState } from '../core/state';
import type { BanaResult, BanaState } from '../core/types';
import { ECONOMY } from './config';
import { HOUR_MS, ownedOf, perHourOf } from './business';
import { fcfaText } from './format';
import { practise } from './polyvalence';
import { rng } from '../core/rng';
import { seedHash } from '../i18n/wolof';

/**
 * The player's own bana-bana table (LD2.0-A), in Pikine's market street beside the Maïga du marché (src/economy/banaModule.ts builds it). Pure logic,
 * unit-tested (tests/bana.test.ts). It sits ON TOP of the venture « Table de bana-bana » (src/economy/business.ts), never beside it:
 * - the table is the player's as soon as they own one bana unit, bought through the one venture purchase (`buyVenture(s, 'bana')`) wherever it is offered;
 *   several units are still one table (the others are the family's) and the venture's hourly income is untouched (« la famille tient la table »);
 * - « Tenir la table »: goods bought from the market's wholesaler at their cost (≤ 3 kinds, a few dozen units: no inventory platform), then the customers
 *   served one tap each, each sale at its price. The till is paid into the wallet ONCE, when the table is closed (one ledger line), and the session's result
 *   is exactly sales − cost of the goods sold = profit;
 * - customers come from the clientèle, which grows with PLAYED time only (one every `everyHours` in-game hours, up to `max`): serving uses it up, so
 *   reopening the table again and again brings nobody new, and nothing grows offline or with the device clock.
 * Numbers: ECONOMY.bana (src/economy/config.ts).
 */
export const BANA = ECONOMY.bana;
export const GOODS = BANA.goods;
export type Good = typeof GOODS[number];
export const goodById = (id: string): Good | undefined => GOODS.find(g => g.id === id);
/** The table's place id in Pikine (the walking marker, « Y aller »). */
export const BANA_PLACE = 'pikine:bana';
export const BANA_NAME = 'Table de bana-bana';
/** Story flag set once the table is the player's: the neighbour's one line reads it (src/social/profiles.ts, Modou's « news » walk-up). */
export const BANA_FLAG = 'bana_table';
/** The walk-up counter that says Modou has said his line (src/social/walkup.ts wuKey.once('modou', 'bana')). */
export const ACK_COUNTER = 'wu_modou_bana';
const EVERY_MS = BANA.clientele.everyHours * HOUR_MS;

export const ownsTable = (s: GameState) => ownedOf(s, 'bana') > 0;
const st = (s: GameState): BanaState => s.data.bana;

/**
 * Bring the table up to date (called before every read and action): set it up the first time a bana unit is owned (its first customers, the flag),
 * count the customers that came over the played time since the last count, start a new day's tally, note the neighbour's line. Idempotent.
 */
export function sync(s: GameState): BanaState {
  const b = st(s), now = s.data.playedMs, C = BANA.clientele;
  if (b.clientMs > now) b.clientMs = now;                                 // never count time that was not played
  if (ownsTable(s) && b.since < 0) {
    b.since = Math.round(now); b.clients = Math.max(b.clients, C.start); b.clientMs = now;
    if (!s.data.flags.includes(BANA_FLAG)) s.data.flags.push(BANA_FLAG);
  }
  if (!ownsTable(s) || b.clients >= C.max) b.clientMs = now;              // no table, or a full clientèle: nothing builds up
  else {
    const k = Math.floor((now - b.clientMs) / EVERY_MS);
    if (k > 0) { b.clients = Math.min(C.max, b.clients + k); b.clientMs = b.clients >= C.max ? now : b.clientMs + k * EVERY_MS; }
  }
  if (b.day !== s.data.play.day) { b.day = s.data.play.day; b.today = 0; }
  if (!b.ack && (s.data.counters[ACK_COUNTER] ?? 0) > 0) b.ack = true;
  return b;
}

/** Played ms until the next customer comes (Infinity: no table, or the clientèle is full). */
export function nextClientIn(s: GameState): number {
  const b = sync(s);
  return !ownsTable(s) || b.clients >= BANA.clientele.max ? Infinity : Math.max(0, b.clientMs + EVERY_MS - s.data.playedMs);
}
export const stockOf = (s: GameState, id: string) => st(s).stock[id] ?? 0;
export const stockUnits = (s: GameState) => GOODS.reduce((t, g) => t + stockOf(s, g.id), 0);
/** What the goods on the table cost (at the wholesaler's price). */
export const stockValue = (s: GameState) => GOODS.reduce((t, g) => t + stockOf(s, g.id) * g.cost, 0);

// ------------------------------------------------------------------ stock
/** Units of a lot the wholesaler would sell now (a lot, or what fits on the table). */
export const lotOf = (s: GameState, id: string) => { const g = goodById(id); return g ? Math.max(0, Math.min(g.lot, g.max - stockOf(s, id))) : 0; };
export function whyNotRestock(s: GameState, id: string): string | null {
  const g = goodById(id);
  if (!g) return 'Inconnu';
  if (!ownsTable(s)) return 'Ce n’est pas (encore) ta table';
  if (st(s).open) return 'Ferme d’abord la table';
  const n = lotOf(s, id);
  if (n <= 0) return `Plus de place sur la table (${g.max} au plus)`;
  if (!s.canAfford(n * g.cost)) return 'Pas assez d’argent';
  return null;
}
/** Buy a lot of `id` from the market's wholesaler at its cost: one ledger line. Null when it cannot be bought now. */
export function restock(s: GameState, id: string): { units: number; cost: number } | null {
  sync(s);
  if (whyNotRestock(s, id)) return null;
  const g = goodById(id)!, units = lotOf(s, id), cost = units * g.cost;
  s.addMoney(-cost, `Marchandise · bana-bana : ${unitsText(g, units)}`);
  st(s).stock[id] = stockOf(s, id) + units;
  return { units, cost };
}

// ------------------------------------------------------------------ the session
export function whyNotOpen(s: GameState): string | null {
  const b = sync(s);
  if (!ownsTable(s)) return 'Ce n’est pas (encore) ta table';
  if (b.open) return null;
  if (stockUnits(s) <= 0) return 'Pas de marchandise : achètes-en d’abord';
  if (b.clients <= 0) return `Personne pour l’instant : les clients reviennent pendant que tu joues (1 par heure en ville)`;
  return null;
}
/** Open the table (or keep the session already open). */
export function openSession(s: GameState): BanaState['open'] {
  if (whyNotOpen(s)) return null;
  const b = st(s);
  if (!b.open) b.open = { id: ++b.seq, startedMs: s.data.playedMs, sales: 0, cost: 0, served: 0, sold: {} };
  return b.open;
}

const NAMES = ['Awa', 'Aminata', 'Cheikh', 'Mariama', 'Pape', 'Seynabou', 'Abdou', 'Rokhaya', 'Saliou', 'Dieynaba', 'Malick', 'Astou', 'Bamba', 'Coura', 'Alioune', 'Yacine'];
const WEIGHT: Record<string, number> = { arachides: 5, recharge: 3, mouchoirs: 3 };
export interface Customer { name: string; female: boolean; seed: number; good: Good; qty: number; amount: number; cost: number; line: string }
/**
 * The customer at the table now, or null (no session, nobody left, nothing left to sell). The same one until served: drawn from the guest, the session
 * and how many were served (a reload shows the same person). They only ask for what is on the table, never more than what is left.
 */
export function customer(s: GameState): Customer | null {
  const b = sync(s), o = b.open;
  if (!o || b.clients <= 0) return null;
  const goods = GOODS.filter(g => stockOf(s, g.id) > 0);
  if (!goods.length) return null;
  const seed = seedHash(`${s.data.guestId}:${o.id}:${o.served}`), R = rng(seed);
  const total = goods.reduce((t, g) => t + (WEIGHT[g.id] ?? 1), 0);
  let r = R() * total, good = goods[0];
  for (const g of goods) { r -= WEIGHT[g.id] ?? 1; if (r < 0) { good = g; break; } }
  const [lo, hi] = good.qty, want = lo + Math.floor(R() * (hi - lo + 1)), qty = Math.max(1, Math.min(want, stockOf(s, good.id)));
  const i = Math.floor(R() * NAMES.length), name = NAMES[i], female = [0, 1, 3, 5, 7, 9, 11, 13, 15].includes(i);
  const what = qty > 1 ? `${qty} ${good.plural}` : good.one;
  const line = [`${what}, s’il te plaît.`, `Donne-moi ${what}.`, `${what}. Jërëjëf !`][Math.floor(R() * 3)];
  return { name, female, seed, good, qty, amount: qty * good.price, cost: qty * good.cost, line: line.charAt(0).toUpperCase() + line.slice(1) };
}
/** Serve the customer at the table: the goods leave the stock, the price goes in the till (paid at closing). */
export function serve(s: GameState): Customer | null {
  const c = customer(s); if (!c) return null;
  const b = st(s), o = b.open!;
  b.stock[c.good.id] = stockOf(s, c.good.id) - c.qty;
  if (b.stock[c.good.id] <= 0) delete b.stock[c.good.id];
  o.sales += c.amount; o.cost += c.cost; o.served++; o.sold[c.good.id] = (o.sold[c.good.id] ?? 0) + c.qty;
  b.clients--;                                                            // (a full clientèle had its clock on now: the next one comes an hour after)
  return c;
}
/**
 * Close the table: the till (the session's sales) is paid into the wallet once, in one ledger line; the result is sales − cost of the goods sold.
 * Null when no session is open (a second close pays nothing).
 */
export function closeSession(s: GameState, at = Date.now()): BanaResult | null {
  const b = sync(s), o = b.open; if (!o) return null;
  b.open = null;
  if (o.sales > 0) s.addMoney(o.sales, `Recette · ${BANA_NAME} (${o.served} client${o.served > 1 ? 's' : ''})`, at);
  const r: BanaResult = { id: o.id, day: s.data.play.day, at, sales: o.sales, cost: o.cost, profit: o.sales - o.cost, served: o.served, sold: { ...o.sold } };
  if (o.served > 0) {
    b.last = r; b.today += r.profit; b.total += r.profit; b.sessions++;
    practise(s, 'commerce'); s.count('bana_clients', o.served);
  }
  return r;
}

// ------------------------------------------------------------------ what the phone and the sheets show
/** « 8 cornets d’arachides · 3 cartes de recharge » ('' when empty). */
export const unitsText = (g: Good, n: number) => `${n} ${n > 1 ? g.plural : g.one.replace(/^une? /, '')}`;
export const stockLine = (s: GameState) => GOODS.filter(g => stockOf(s, g.id) > 0).map(g => unitsText(g, stockOf(s, g.id))).join(' · ');
/** « 3 clients attendent », « 1 client attend », « personne n’attend ». */
export const waitingText = (n: number) => (n <= 0 ? 'personne n’attend' : n === 1 ? '1 client attend' : `${n} clients attendent`);
/** « Recette 3 200 F − marchandise 2 100 F = bénéfice 1 100 F ». */
export const resultLine = (r: Pick<BanaResult, 'sales' | 'cost' | 'profit'>) => `Recette ${fcfaText(r.sales)} − marchandise ${fcfaText(r.cost)} = bénéfice ${fcfaText(r.profit)}`;
export interface TableCard {
  owned: boolean; units: number; family: number; perHour: number;
  stock: { id: string; name: string; icon: string; n: number; max: number }[]; stockValue: number;
  clients: number; max: number; nextInMs: number;
  open: { sales: number; cost: number; served: number } | null;
  last: BanaResult | null; today: number; total: number; sessions: number; ack: boolean;
}
/** Everything the Affaires app and the table's sheet show about the table (one read). */
export function tableCard(s: GameState): TableCard {
  const b = sync(s), units = ownedOf(s, 'bana');
  return {
    owned: units > 0, units, family: Math.max(0, units - 1), perHour: perHourOf('bana'),
    stock: GOODS.map(g => ({ id: g.id, name: g.name, icon: g.icon, n: stockOf(s, g.id), max: g.max })), stockValue: stockValue(s),
    clients: b.clients, max: BANA.clientele.max, nextInMs: nextClientIn(s),
    open: b.open ? { sales: b.open.sales, cost: b.open.cost, served: b.open.served } : null,
    last: b.last, today: b.today, total: b.total, sessions: b.sessions, ack: b.ack,
  };
}
