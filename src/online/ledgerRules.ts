import type { AskItem, AskState, Francs, LedgerOp, MoneyLimits, MoneyRefusal, Tag } from './protocol';

/**
 * Teranga Money's ledger rules (docs/ld2/LD2_B_CONTRACT.md « The ledger »). Pure: they read and write plain rows through a `LedgerStore`, which is the
 * `ledger` Durable Object's SQLite tables (server/social.ts, inside one `transactionSync`) or plain maps in vitest (`memoryLedger`).
 *
 * Every operation is checked completely before anything is written (the op id not seen, the amount, the limits, the balances, the request), then
 * written whole: the debit, the credit, the request's new state and the op row. The store's transaction makes a failure half-way impossible to see.
 * An op id already in `ops` returns the stored operation (`duplicate: true`) and changes nothing; a refusal is never stored, so the device never
 * resends a refused id (it refunds what it had reserved instead). Inside Teranga Money nothing is created or lost: a `pay` moves what it debits; only
 * `fund` (the device's own game money, bounded per day) brings money in and `cashout` takes it out.
 */
export interface LedgerAccount { tag: Tag; balance: Francs; day: number; funded: Francs; sent: Francs; received: Francs }
export interface StoredOp { id: string; kind: LedgerOp['kind']; a: Tag; b: Tag | null; amount: Francs; fund: Francs; req: string | null; note: string | null; at: number }
export interface AskRow { id: string; payee: Tag; payer: Tag; amount: Francs; note: string | null; state: AskState; paidBy: string | null; at: number }
export interface Today { funded: Francs; sent: Francs; received: Francs }

export interface LedgerStore {
  account(tag: Tag): LedgerAccount | null;
  putAccount(a: LedgerAccount): void;
  op(id: string): StoredOp | null;
  putOp(op: StoredOp): void;
  ask(id: string): AskRow | null;
  putAsk(row: AskRow): void;
  /** Whether `blocker`'s account told the ledger it blocks `who` (money and requests from `who` are then refused, 'unavailable'). */
  blocks(blocker: Tag, who: Tag): boolean;
  putBlock(blocker: Tag, who: Tag, on: boolean): void;
}

export type MoneyRequest =
  | { kind: 'fund'; id: string; tag: Tag; amount: Francs }
  | { kind: 'cashout'; id: string; tag: Tag; amount: Francs }
  | { kind: 'pay'; id: string; tag: Tag; to: Tag; amount: Francs; fund: Francs; note?: string; req?: string };
export type LedgerResult =
  | { ok: true; duplicate: boolean; op: LedgerOp; balance: Francs; today: Today; ask?: AskRow; to?: { balance: Francs; today: Today } }
  | { ok: false; reason: MoneyRefusal };
export type AskResult = { ok: true; duplicate: boolean; ask: AskRow } | { ok: false; reason: MoneyRefusal | 'not-found' };

/** The server day: the UTC date, as a day number. The daily limits start again at its midnight. */
export const serverDay = (now: number) => Math.floor(now / 86_400_000);
/** The account as it stands on `now`'s server day (yesterday's counters reset; nothing written). */
export function rolled(a: LedgerAccount, now: number): LedgerAccount {
  const day = serverDay(now);
  return a.day === day ? { ...a } : { ...a, day, funded: 0, sent: 0, received: 0 };
}
export const todayOf = (a: LedgerAccount, now: number): Today => { const r = rolled(a, now); return { funded: r.funded, sent: r.sent, received: r.received }; };
export const newAccount = (tag: Tag, now: number): LedgerAccount => ({ tag, balance: 0, day: serverDay(now), funded: 0, sent: 0, received: 0 });

/** An op row as a player's history shows it. */
export function opView(o: StoredOp): LedgerOp {
  const base = { id: o.id, kind: o.kind, at: o.at, amount: o.amount, ...(o.note ? { note: o.note } : {}) };
  if (o.kind === 'fund') return { ...base, to: o.a };
  if (o.kind === 'cashout') return { ...base, from: o.a };
  return { ...base, from: o.a, to: o.b!, ...(o.fund > 0 ? { fund: o.fund } : {}), ...(o.req ? { req: o.req } : {}) };
}
/** A request row as the conversation item both accounts keep (same id; its state is the ledger's). */
export function askItem(r: AskRow): AskItem {
  return { id: r.id, k: 'ask', from: r.payee, at: r.at, amount: r.amount, state: r.state, ...(r.note ? { note: r.note } : {}), ...(r.paidBy ? { paidBy: r.paidBy } : {}) };
}

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const amountRefusal = (n: number, limits: MoneyLimits): MoneyRefusal | null => (!whole(n) || n <= 0 ? 'amount' : n > limits.opMax ? 'limit-op' : null);

/** The account row of a player who connected (created at their first connection: an account « exists » from then on). */
export function openAccount(store: LedgerStore, tag: Tag, now: number): LedgerAccount {
  const a = store.account(tag);
  if (a) return rolled(a, now);
  const fresh = newAccount(tag, now); store.putAccount(fresh); return fresh;
}

/** One money operation, whole or not at all (the caller runs it in one transaction). */
export function applyMoney(store: LedgerStore, r: MoneyRequest, now: number, limits: MoneyLimits): LedgerResult {
  const seen = store.op(r.id);
  if (seen) {
    if (seen.a !== r.tag) return { ok: false, reason: 'invalid' };            // another account's id: nothing is told about it
    const me = rolled(store.account(r.tag)!, now);
    const ask = seen.req ? store.ask(seen.req) ?? undefined : undefined;
    return { ok: true, duplicate: true, op: opView(seen), balance: me.balance, today: todayOf(me, now), ...(ask ? { ask } : {}) };
  }
  const meRow = store.account(r.tag);
  if (!meRow) return { ok: false, reason: 'invalid' };
  const me = rolled(meRow, now);
  const bad = amountRefusal(r.amount, limits); if (bad) return { ok: false, reason: bad };
  const op: StoredOp = { id: r.id, kind: r.kind, a: r.tag, b: null, amount: r.amount, fund: 0, req: null, note: null, at: now };
  if (r.kind === 'fund') {
    if (me.funded + r.amount > limits.fundDayMax) return { ok: false, reason: 'limit-fund' };
    if (me.balance + r.amount > limits.balanceMax) return { ok: false, reason: 'limit-balance' };
    me.balance += r.amount; me.funded += r.amount; op.fund = r.amount;
    store.putAccount(me); store.putOp(op);
    return { ok: true, duplicate: false, op: opView(op), balance: me.balance, today: todayOf(me, now) };
  }
  if (r.kind === 'cashout') {
    if (me.balance < r.amount) return { ok: false, reason: 'insufficient' };
    me.balance -= r.amount;
    store.putAccount(me); store.putOp(op);
    return { ok: true, duplicate: false, op: opView(op), balance: me.balance, today: todayOf(me, now) };
  }
  // pay: A → B, optionally with a top-up from A's wallet and a request
  if (r.to === r.tag) return { ok: false, reason: 'self' };
  const toRow = store.account(r.to);
  if (!toRow) return { ok: false, reason: 'unknown-recipient' };
  if (store.blocks(r.to, r.tag)) return { ok: false, reason: 'unavailable' };
  if (!whole(r.fund) || r.fund < 0 || r.fund > r.amount) return { ok: false, reason: 'amount' };
  const to = rolled(toRow, now);
  if (r.fund > 0 && me.funded + r.fund > limits.fundDayMax) return { ok: false, reason: 'limit-fund' };
  if (me.sent + r.amount > limits.sendDayMax) return { ok: false, reason: 'limit-send' };
  if (to.received + r.amount > limits.receiveDayMax) return { ok: false, reason: 'limit-receive' };
  if (me.balance + r.fund < r.amount) return { ok: false, reason: 'insufficient' };
  if (to.balance + r.amount > limits.balanceMax) return { ok: false, reason: 'limit-balance' };
  let ask: AskRow | undefined;
  if (r.req !== undefined) {
    const row = store.ask(r.req);
    if (!row || row.payer !== r.tag || row.payee !== r.to || row.amount !== r.amount) return { ok: false, reason: 'request-mismatch' };
    if (row.state !== 'open') return { ok: false, reason: 'request-closed' };
    ask = { ...row, state: 'paid', paidBy: r.id };
  }
  // every check passed: apply all of it
  me.balance = me.balance + r.fund - r.amount; me.funded += r.fund; me.sent += r.amount;
  to.balance += r.amount; to.received += r.amount;
  Object.assign(op, { b: r.to, fund: r.fund, req: r.req ?? null, note: r.note ?? null });
  store.putAccount(me); store.putAccount(to);
  if (ask) store.putAsk(ask);
  store.putOp(op);
  return { ok: true, duplicate: false, op: opView(op), balance: me.balance, today: todayOf(me, now), ...(ask ? { ask } : {}), to: { balance: to.balance, today: todayOf(to, now) } };
}

/** A money request from `payee` to `payer` (open until paid once, declined by the payer or cancelled by the payee). Idempotent by id. */
export function createAsk(store: LedgerStore, r: { id: string; payee: Tag; payer: Tag; amount: Francs; note?: string }, now: number, limits: MoneyLimits): AskResult {
  const seen = store.ask(r.id);
  if (seen) return seen.payee === r.payee ? { ok: true, duplicate: true, ask: seen } : { ok: false, reason: 'invalid' };
  if (!store.account(r.payee)) return { ok: false, reason: 'invalid' };
  const bad = amountRefusal(r.amount, limits); if (bad) return { ok: false, reason: bad };
  if (r.payer === r.payee) return { ok: false, reason: 'self' };
  if (!store.account(r.payer)) return { ok: false, reason: 'unknown-recipient' };
  if (store.blocks(r.payer, r.payee)) return { ok: false, reason: 'unavailable' };
  const ask: AskRow = { id: r.id, payee: r.payee, payer: r.payer, amount: r.amount, note: r.note ?? null, state: 'open', paidBy: null, at: now };
  store.putAsk(ask);
  return { ok: true, duplicate: false, ask };
}
/** The payer declines a request, or the payee cancels it. Only an open request closes; the same close again is a duplicate. */
export function closeAsk(store: LedgerStore, r: { ref: string; how: 'declined' | 'cancelled'; by: Tag }): AskResult {
  const row = store.ask(r.ref);
  if (!row || (row.payee !== r.by && row.payer !== r.by)) return { ok: false, reason: 'not-found' };
  if ((r.how === 'declined' && row.payer !== r.by) || (r.how === 'cancelled' && row.payee !== r.by)) return { ok: false, reason: 'invalid' };
  if (row.state === r.how) return { ok: true, duplicate: true, ask: row };
  if (row.state !== 'open') return { ok: false, reason: 'request-closed' };
  const ask: AskRow = { ...row, state: r.how };
  store.putAsk(ask);
  return { ok: true, duplicate: false, ask };
}

/** Plain maps with a transaction that puts everything back when the closure throws (the tests' stand-in for `transactionSync`). */
export function memoryLedger() {
  let accounts = new Map<Tag, LedgerAccount>(), ops = new Map<string, StoredOp>(), asks = new Map<string, AskRow>(), blocked = new Set<string>();
  const store: LedgerStore & { accounts: () => Map<Tag, LedgerAccount>; ops: () => Map<string, StoredOp>; asks: () => Map<string, AskRow>; transaction<T>(fn: () => T): T } = {
    account: t => (accounts.has(t) ? { ...accounts.get(t)! } : null),
    putAccount: a => { accounts.set(a.tag, { ...a }); },
    op: id => (ops.has(id) ? { ...ops.get(id)! } : null),
    putOp: o => { if (ops.has(o.id)) throw new Error('UNIQUE constraint failed: ops.id'); ops.set(o.id, { ...o }); },
    ask: id => (asks.has(id) ? { ...asks.get(id)! } : null),
    putAsk: r => { asks.set(r.id, { ...r }); },
    blocks: (a, b) => blocked.has(`${a}>${b}`),
    putBlock: (a, b, on) => { if (on) blocked.add(`${a}>${b}`); else blocked.delete(`${a}>${b}`); },
    accounts: () => accounts, ops: () => ops, asks: () => asks,
    transaction<T>(fn: () => T): T {
      const saved = [new Map(accounts), new Map(ops), new Map(asks), new Set(blocked)] as const;
      try { return fn(); } catch (e) { [accounts, ops, asks, blocked] = [saved[0], saved[1], saved[2], saved[3]]; throw e; }
    },
  };
  return store;
}
