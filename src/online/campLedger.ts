import type { Francs, MoneyLimits, MoneyRefusal, Tag } from './protocol';
import { memoryLedger, rolled, todayOf, type LedgerAccount, type Today } from './ledgerRules';

/**
 * 1.0.1 Grand Camp: the entry fees of player-organized matches, held by the Teranga Money ledger (docs/release/GRAND-CAMP-RULES-1.0.1.md). Pure, like
 * src/online/ledgerRules.ts: the `ledger` Durable Object (server/social.ts) runs each of these inside one `transactionSync` on its SQLite tables;
 * vitest runs them on plain maps (`memoryCampLedger`). Everything is checked before anything is written, then written whole.
 *
 * - A pool per match id (its terms frozen by the first hold), a hold per (match, player): the fee taken at « Prêt » from the player's Teranga Money,
 *   funded exactly as a send is (the balance first; a part brought from the wallet in the same operation, `fund`, counted against fundDayMax).
 *   Idempotent by op id; one held fee per player at a time (another match: 'busy'); never below zero ('insufficient').
 * - A release returns a held fee whole (« Pas prêt », leaving, removed, the connection lost before kick-off). Nothing held: nothing happens.
 * - A settlement, once per match id: the winning team's players share the pool equally, or one player takes it, or every hold is returned (a draw, a
 *   cancel, a lobby closed, a match stopped). The payouts add up to exactly the holds collected (checked: a mismatch throws, so the transaction writes
 *   nothing). A settlement asked again changes nothing and answers the first one; a hold after it is refused ('closed').
 * - Payouts and refunds land on Teranga Money (the player withdraws them with « Retirer », as received money). Fees and payouts are not counted in the
 *   daily send / receive limits (the owner's rules list the only restrictions), nor checked against balanceMax: what the pool owes is always paid.
 * - Its own tables (camp_pools, camp_holds, camp_ops), never the `ops` history: the 1.0 clients parse that history strictly.
 */
export type CampDistRow = 'team' | 'single';
export interface CampPoolRow { match: string; fee: Francs; size: number; dist: CampDistRow; state: 'open' | 'settled' | 'refunded'; held: Francs; result: string | null; at: number; closed: number | null }
export interface CampHoldRow { match: string; tag: Tag; op: string; amount: Francs; fund: Francs; state: 'held' | 'released' | 'paid' | 'lost' | 'refunded'; at: number; closed: number | null }
export interface CampOpRow { id: string; match: string; tag: Tag; kind: 'hold' | 'release' | 'payout' | 'refund'; amount: Francs; fund: Francs; at: number }
export interface CampStore {
  account(tag: Tag): LedgerAccount | null;
  putAccount(a: LedgerAccount): void;
  pool(match: string): CampPoolRow | null;
  putPool(p: CampPoolRow): void;
  hold(match: string, tag: Tag): CampHoldRow | null;
  holds(match: string): CampHoldRow[];
  /** The player's fee held now, in any match (one at a time). */
  heldBy(tag: Tag): CampHoldRow | null;
  putHold(h: CampHoldRow): void;
  campOp(id: string): CampOpRow | null;
  putCampOp(o: CampOpRow): void;
}
export interface CampTermsRow { fee: Francs; size: number; dist: CampDistRow }
export type CampLedgerRefusal = MoneyRefusal | 'closed' | 'busy' | 'terms';
export type CampHoldResult =
  | { ok: true; duplicate: boolean; hold: CampHoldRow; balance: Francs; today: Today; pool: Francs }
  | { ok: false; reason: CampLedgerRefusal };
export interface CampReleaseResult { ok: true; duplicate: boolean; amount: Francs; op: string | null; balance: Francs | null; pool: Francs }
export type CampOutcomeRow = { kind: 'team'; winners: Tag[] } | { kind: 'single'; winner: Tag } | { kind: 'refund'; why: string };
export interface CampSettlement {
  match: string; kind: 'team' | 'single' | 'refund'; why?: string;
  /** The holds collected (the pool), and what each player got: sums to `total`. */
  total: Francs; payouts: { tag: Tag; amount: Francs; op: string }[];
  at: number;
}
export type CampSettleResult =
  | { ok: true; duplicate: boolean; settlement: CampSettlement; balances: { tag: Tag; balance: Francs; today: Today }[] }
  | { ok: false; reason: 'invalid' };

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const OP = /^[A-Za-z0-9:_-]{8,64}$/;
/** The op ids the ledger writes for a hold's release, a hold refunded at the end, a winner's payout (server-made, never a client's). */
export const campReleaseOp = (holdOp: string) => `r-${holdOp}`.slice(0, 64);
export const campRefundOp = (holdOp: string) => `f-${holdOp}`.slice(0, 64);
export const campPayoutOp = (match: string, tag: Tag) => `w-${match}-${tag}`;

/** The fee held at « Prêt ». */
export function campHold(store: CampStore, r: { match: string; tag: Tag; op: string; terms: CampTermsRow; fund: Francs }, now: number, limits: MoneyLimits): CampHoldResult {
  if (!OP.test(r.op) || !OP.test(r.match)) return { ok: false, reason: 'invalid' };
  const seen = store.campOp(r.op);
  if (seen) {
    if (seen.kind !== 'hold' || seen.tag !== r.tag || seen.match !== r.match) return { ok: false, reason: 'invalid' };
    const h = store.hold(r.match, r.tag);
    if (!h || h.op !== r.op || h.state !== 'held') return { ok: false, reason: 'closed' };      // this hold was returned or settled since: a new « Prêt » is a new op
    return answer(store, h, now, true);
  }
  const meRow = store.account(r.tag);
  if (!meRow) return { ok: false, reason: 'invalid' };
  const t = r.terms, amount = t.fee;
  if (!whole(amount) || amount <= 0) return { ok: false, reason: 'amount' };              // a free match never asks the ledger
  if (amount > limits.opMax) return { ok: false, reason: 'limit-op' };
  const pool = store.pool(r.match);
  if (pool && (pool.fee !== t.fee || pool.size !== t.size || pool.dist !== t.dist)) return { ok: false, reason: 'terms' };
  if (pool && pool.state !== 'open') return { ok: false, reason: 'closed' };
  const mine = store.heldBy(r.tag);
  if (mine) return mine.match === r.match ? answer(store, mine, now, true) : { ok: false, reason: 'busy' };
  if (!whole(r.fund) || r.fund < 0 || r.fund > amount) return { ok: false, reason: 'amount' };
  const me = rolled(meRow, now);
  if (r.fund > 0 && me.funded + r.fund > limits.fundDayMax) return { ok: false, reason: 'limit-fund' };
  if (me.balance + r.fund < amount) return { ok: false, reason: 'insufficient' };
  // every check passed: the debit (and the wallet part brought in), the pool, the hold, the journal
  me.balance = me.balance + r.fund - amount; me.funded += r.fund;
  store.putAccount(me);
  const p: CampPoolRow = pool ?? { match: r.match, fee: t.fee, size: t.size, dist: t.dist, state: 'open', held: 0, result: null, at: now, closed: null };
  p.held += amount; store.putPool(p);
  const h: CampHoldRow = { match: r.match, tag: r.tag, op: r.op, amount, fund: r.fund, state: 'held', at: now, closed: null };
  store.putHold(h);
  store.putCampOp({ id: r.op, match: r.match, tag: r.tag, kind: 'hold', amount, fund: r.fund, at: now });
  return { ok: true, duplicate: false, hold: h, balance: me.balance, today: todayOf(me, now), pool: p.held };
}
function answer(store: CampStore, h: CampHoldRow, now: number, duplicate: boolean): CampHoldResult {
  const me = rolled(store.account(h.tag)!, now);
  return { ok: true, duplicate, hold: h, balance: me.balance, today: todayOf(me, now), pool: store.pool(h.match)?.held ?? 0 };
}

/** The fee held for (match, player) given back whole; nothing held: nothing happens (`duplicate`). */
export function campRelease(store: CampStore, r: { match: string; tag: Tag }, now: number): CampReleaseResult {
  const h = store.hold(r.match, r.tag), acct = store.account(r.tag), pool = store.pool(r.match);
  if (!h || h.state !== 'held' || !acct || !pool || pool.state !== 'open') return { ok: true, duplicate: true, amount: 0, op: null, balance: acct ? rolled(acct, now).balance : null, pool: pool?.held ?? 0 };
  const me = rolled(acct, now);
  me.balance += h.amount; store.putAccount(me);
  pool.held -= h.amount; store.putPool(pool);
  store.putHold({ ...h, state: 'released', closed: now });
  const op = campReleaseOp(h.op);
  store.putCampOp({ id: op, match: r.match, tag: r.tag, kind: 'release', amount: h.amount, fund: 0, at: now });
  return { ok: true, duplicate: false, amount: h.amount, op, balance: me.balance, pool: pool.held };
}

/**
 * The match's money, once: a team's winners share the pool equally (a remainder, never with equal teams, goes a franc each to the first winners by
 * tag), one winner takes it, or every hold is returned. A pool that never held anything is closed (a late hold is then refused).
 */
export function campSettle(store: CampStore, r: { match: string; outcome: CampOutcomeRow; terms?: CampTermsRow }, now: number): CampSettleResult {
  if (!OP.test(r.match)) return { ok: false, reason: 'invalid' };
  const pool = store.pool(r.match), o = r.outcome;
  if (pool && pool.state !== 'open') return { ok: true, duplicate: true, settlement: JSON.parse(pool.result ?? 'null') as CampSettlement, balances: [] };
  if (!pool) {
    const settlement: CampSettlement = { match: r.match, kind: o.kind, ...(o.kind === 'refund' ? { why: o.why } : {}), total: 0, payouts: [], at: now };
    store.putPool({ match: r.match, fee: r.terms?.fee ?? 0, size: r.terms?.size ?? 0, dist: r.terms?.dist ?? 'team', state: o.kind === 'refund' ? 'refunded' : 'settled', held: 0, result: JSON.stringify(settlement), at: now, closed: now });
    return { ok: true, duplicate: false, settlement, balances: [] };
  }
  const held = store.holds(r.match).filter(h => h.state === 'held').sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const total = held.reduce((s, h) => s + h.amount, 0);
  if (total !== pool.held) throw new Error(`camp pool ${r.match} out of balance: ${total} held, ${pool.held} on the pool`);
  let pay: { tag: Tag; amount: number }[];
  const refund = o.kind === 'refund' || held.length === 0;
  if (refund) pay = held.map(h => ({ tag: h.tag, amount: h.amount }));
  else if (o.kind === 'single') {
    if (!held.some(h => h.tag === o.winner)) return { ok: false, reason: 'invalid' };
    pay = [{ tag: o.winner, amount: total }];
  } else {
    const winners = [...new Set(o.kind === 'team' ? o.winners : [])].filter(t => held.some(h => h.tag === t)).sort();
    if (!winners.length) return { ok: false, reason: 'invalid' };
    const share = Math.floor(total / winners.length), rest = total - share * winners.length;
    pay = winners.map((tag, i) => ({ tag, amount: share + (i < rest ? 1 : 0) }));
  }
  if (pay.reduce((s, p) => s + p.amount, 0) !== total || pay.some(p => !whole(p.amount) || p.amount < 0)) throw new Error(`camp payouts of ${r.match} do not add up to ${total}`);
  const payouts: CampSettlement['payouts'] = [], balances: { tag: Tag; balance: Francs; today: Today }[] = [];
  for (const p of pay) {
    const a = rolled(store.account(p.tag)!, now);
    a.balance += p.amount; store.putAccount(a);
    const hold = held.find(h => h.tag === p.tag)!;
    const op = refund ? campRefundOp(hold.op) : campPayoutOp(r.match, p.tag);
    store.putCampOp({ id: op, match: r.match, tag: p.tag, kind: refund ? 'refund' : 'payout', amount: p.amount, fund: 0, at: now });
    payouts.push({ tag: p.tag, amount: p.amount, op });
    balances.push({ tag: p.tag, balance: a.balance, today: todayOf(a, now) });
  }
  for (const h of held) store.putHold({ ...h, state: refund ? 'refunded' : pay.some(p => p.tag === h.tag) ? 'paid' : 'lost', closed: now });
  for (const h of held) if (!balances.some(b => b.tag === h.tag)) { const a = rolled(store.account(h.tag)!, now); balances.push({ tag: h.tag, balance: a.balance, today: todayOf(a, now) }); }
  const settlement: CampSettlement = { match: r.match, kind: refund ? 'refund' : o.kind as 'team' | 'single', ...(o.kind === 'refund' ? { why: o.why } : held.length === 0 ? { why: 'empty' } : {}), total, payouts, at: now };
  store.putPool({ ...pool, state: refund ? 'refunded' : 'settled', held: 0, result: JSON.stringify(settlement), closed: now });
  return { ok: true, duplicate: false, settlement, balances };
}

/** Plain maps sharing a memoryLedger's accounts, with a transaction that puts everything back when the closure throws (the tests' `transactionSync`). */
export function memoryCampLedger() {
  const base = memoryLedger();
  let pools = new Map<string, CampPoolRow>(), holds = new Map<string, CampHoldRow>(), ops = new Map<string, CampOpRow>();
  const copy = <T extends object>(v: T | undefined) => (v ? { ...v } : null);
  const camp = {
    pool: (m: string) => copy(pools.get(m)),
    putPool: (p: CampPoolRow) => { pools.set(p.match, { ...p }); },
    hold: (m: string, t: Tag) => copy(holds.get(`${m}|${t}`)),
    holds: (m: string) => [...holds.values()].filter(h => h.match === m).map(h => ({ ...h })),
    heldBy: (t: Tag) => copy([...holds.values()].find(h => h.tag === t && h.state === 'held')),
    putHold: (h: CampHoldRow) => { holds.set(`${h.match}|${h.tag}`, { ...h }); },
    campOp: (id: string) => copy(ops.get(id)),
    putCampOp: (o: CampOpRow) => { if (ops.has(o.id)) throw new Error('UNIQUE constraint failed: camp_ops.id'); ops.set(o.id, { ...o }); },
    pools: () => pools, allHolds: () => holds, campOps: () => ops,
    /** Both the ledger's maps and these: all or nothing. */
    tx<T>(fn: () => T): T {
      const saved = [new Map(pools), new Map(holds), new Map(ops)] as const;
      try { return base.transaction(fn); } catch (e) { [pools, holds, ops] = [saved[0], saved[1], saved[2]]; throw e; }
    },
  };
  return Object.assign(base, camp) as typeof base & typeof camp & CampStore;
}
