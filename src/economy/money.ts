import type { GameState } from '../core/state';
import type { BankTx, BankTxKind, OnlinePending } from '../core/types';
import { BANK_REFS_MAX, BANK_TX_MAX, MONEY_MAX, ONLINE_PENDING_MAX, ONLINE_REFS_MAX } from '../core/save';
import type { Francs, MoneyLimits } from '../online/protocol';
import type { PayQuote } from '../online/api';
import { refusalText } from '../online/accountRules';

/**
 * The player's money accounts (LD2.0-A contract, docs/MONEY.md). Pure rules on the game state, unit-tested.
 *
 *   – `wallet`: the cash the game has always had (SaveData.wallet). Everything that earns or spends goes through `GameState.addMoney`, which writes the
 *     wallet's own history (SaveData.ledger). Nothing here changes that.
 *   – `savings`: the Banque Teranga savings account (SaveData.bank). Money only enters or leaves it by `move` (wallet ↔ savings) or `postSavings`
 *     (interest paid by the bank). Its history is SaveData.bank.tx; its balance is SaveData.bank.savings, authoritative.
 *   – `online`: Teranga Money (LD2.0-B), the server-authoritative account for transfers between players. No local `move` accepts it (`unsupported`) and
 *     nothing local ever sets its balance: the device's side of it is below (« The device's side of Teranga Money »).
 *
 * Every operation is whole francs, all or nothing (it is checked completely before anything is applied), and never leaves an account below zero or above
 * MONEY_MAX. An operation may carry a `ref` (an idempotency key, e.g. the id of the confirmation the player tapped): a ref already applied is refused, so a
 * double tap, a replayed message or a resent request never moves the money twice.
 */
export type LocalAccount = 'wallet' | 'savings';
export type AccountId = LocalAccount | 'online';
export const ACCOUNT_NAMES: Record<AccountId, string> = { wallet: 'Portefeuille', savings: 'Épargne Teranga', online: 'Teranga Money' };

export type MoveRefusal = 'amount' | 'same' | 'unsupported' | 'insufficient' | 'duplicate' | 'overflow';
export type MoveResult = { ok: true; amount: number; tx: BankTx } | { ok: false; why: MoveRefusal; text: string };
const REFUSALS: Record<MoveRefusal, string> = {
  amount: 'Montant invalide', same: 'Même compte', unsupported: 'Compte pas encore disponible', insufficient: 'Solde insuffisant',
  duplicate: 'Opération déjà faite', overflow: 'Montant trop grand',
};
const refuse = (why: MoveRefusal): MoveResult => ({ ok: false, why, text: REFUSALS[why] });

/** Balance of an account on this device (null for `online`: only the server knows it). */
export function balanceOf(s: GameState, a: AccountId): number | null {
  return a === 'wallet' ? s.data.wallet : a === 'savings' ? s.data.bank.savings : null;
}
/** Cash the player has on this device: wallet + savings. */
export const cashTotal = (s: GameState) => s.data.wallet + s.data.bank.savings;
/** Whether an operation with this ref was already applied. */
export const applied = (s: GameState, ref: string) => s.data.bank.refs.includes(ref);

/**
 * Moves `amount` F between two local accounts, at once and entirely, or refuses with the reason. Wallet → savings is a deposit, savings → wallet a
 * withdrawal; the wallet side is written in the wallet's history with `label`, the savings side in the account's.
 */
export function move(s: GameState, from: AccountId, to: AccountId, amount: number, o: { ref?: string; label?: string } = {}): MoveResult {
  if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount <= 0) return refuse('amount');
  if (from === to) return refuse('same');
  if (from === 'online' || to === 'online') return refuse('unsupported');
  if (o.ref !== undefined && (!o.ref || o.ref.length > 64)) return refuse('amount');
  if (o.ref && applied(s, o.ref)) return refuse('duplicate');
  const have = balanceOf(s, from)!, there = balanceOf(s, to)!;
  if (have < amount) return refuse('insufficient');
  if (there + amount > MONEY_MAX) return refuse('overflow');
  const deposit = from === 'wallet';
  const label = o.label ?? (deposit ? 'Épargne Teranga · dépôt' : 'Épargne Teranga · retrait');
  // both sides are known to fit: the wallet change below applies exactly `amount` (addMoney clamps only below 0 or above MONEY_MAX)
  s.addMoney(deposit ? -amount : amount, label);
  const tx = postSavings(s, deposit ? 'deposit' : 'withdraw', deposit ? amount : -amount, label, o.ref);
  return { ok: true, amount, tx };
}

/**
 * Writes one movement on the savings account (deposit +, withdrawal −, interest +) and its history entry. Used by `move` and by the bank's interest
 * (src/economy/bank.ts); the caller has checked the amount. Opens the account on its first movement.
 */
export function postSavings(s: GameState, kind: BankTxKind, amount: number, label: string, ref?: string): BankTx {
  const b = s.data.bank, day = s.data.play.day;
  b.savings = Math.min(MONEY_MAX, Math.max(0, b.savings + Math.round(amount)));
  if (b.opened < 0) b.opened = day;
  b.seq += 1;
  const tx: BankTx = { id: `T${b.seq}`, at: Date.now(), day, kind, amount: Math.round(amount), balance: b.savings, label: label.slice(0, 80) };
  if (ref) { tx.ref = ref; b.refs.push(ref); if (b.refs.length > BANK_REFS_MAX) b.refs.splice(0, b.refs.length - BANK_REFS_MAX); }
  b.tx.push(tx);
  if (b.tx.length > BANK_TX_MAX) b.tx.splice(0, b.tx.length - BANK_TX_MAX);
  return tx;
}

/** The savings account agrees with its own history: its balance is the last movement's balance (or 0 with no history). Debug and tests. */
export function consistent(s: GameState): boolean {
  const b = s.data.bank, last = b.tx[b.tx.length - 1];
  return Number.isInteger(b.savings) && b.savings >= 0 && (last ? last.balance === b.savings : b.savings === 0);
}

// ------------------------------------------------------------------ the device's side of Teranga Money (LD2.0-B)
/**
 * docs/ld2/LD2_B_CONTRACT.md « The device's side of money ». The server holds Teranga Money; the device holds the wallet. Money crosses between them only
 * through these, each operation by its id (made when the player confirmed):
 *   – before a `fund`, a `pay` (its top-up part, if any) or a `cashout` is sent: `reserveOnline` debits the wallet part, writes the pending entry and
 *     writes the save at once; if the save cannot be written both are undone and nothing is sent;
 *   – the server's answer: `settleOnline`. Yes: the entry is closed (a withdrawal credits the wallet, once). No: the wallet part comes back, once;
 *   – no answer (closed socket, app closed): the entry stays, and the next connection sends the same id again (`pendingFor`). The server applies it
 *     or returns its first answer, so the device never has to guess. There is no « Annuler » on a pending operation in v1.
 * An id settled here joins `refs`: a second answer for it (a resend answered twice) never moves the wallet again.
 */
export const ONLINE_LABELS = { fund: 'Teranga Money · recharge', refund: 'Teranga Money · recharge annulée', cashout: 'Teranga Money · retrait' } as const;
export type ReserveRefusal = 'amount' | 'insufficient' | 'duplicate' | 'busy' | 'save';
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Whether this op id was already settled on this device (or is waiting for its answer). */
export const onlineKnown = (s: GameState, id: string) => s.data.online.refs.includes(id) || s.data.online.pending.some(p => p.id === id);

export function reserveOnline(s: GameState, op: Omit<OnlinePending, 'at'>, save: () => boolean, now = Date.now()): { ok: true; pending: OnlinePending } | { ok: false; why: ReserveRefusal } {
  const fund = op.kind === 'fund' ? op.amount : op.kind === 'cashout' ? 0 : op.fund;
  if (!whole(op.amount) || op.amount <= 0 || !whole(fund) || fund < 0 || fund > op.amount || (op.kind === 'fund' && op.fund !== op.amount)) return { ok: false, why: 'amount' };
  if (!op.id || op.id.length > 64 || onlineKnown(s, op.id)) return { ok: false, why: 'duplicate' };
  const o = s.data.online;
  if (o.pending.length >= ONLINE_PENDING_MAX) return { ok: false, why: 'busy' };
  if (s.data.wallet < fund) return { ok: false, why: 'insufficient' };
  const wallet = s.data.wallet, ledger = s.data.ledger.slice();
  const pending: OnlinePending = { ...op, fund, at: now };
  if (fund > 0) s.addMoney(-fund, ONLINE_LABELS.fund, now);
  o.pending.push(pending);
  if (!save()) {                                                      // nothing sent, nothing debited: exactly as before
    o.pending.splice(o.pending.indexOf(pending), 1);
    s.data.wallet = wallet; s.data.ledger.splice(0, s.data.ledger.length, ...ledger);
    return { ok: false, why: 'save' };
  }
  return { ok: true, pending };
}

/**
 * The server's answer for an op id. `ok`: its pending entry is closed; a withdrawal credits the wallet (« Teranga Money · retrait »). Refused: the wallet
 * part comes back (« Teranga Money · recharge annulée »). Either way the id joins the refs, so a second answer does nothing. The caller saves at once.
 * Returns what changed: 'credited' | 'closed' | 'refunded', or 'none' (an id this device does not wait for, or already settled).
 */
export function settleOnline(s: GameState, id: string, answer: { ok: boolean; balance?: number }, now = Date.now()): 'credited' | 'closed' | 'refunded' | 'none' {
  const o = s.data.online, i = o.pending.findIndex(p => p.id === id);
  if (answer.ok && whole(answer.balance) && answer.balance >= 0) noteBalance(s, answer.balance, now);
  if (i < 0 || o.refs.includes(id)) { if (i >= 0) o.pending.splice(i, 1); return 'none'; }
  const p = o.pending[i];
  o.pending.splice(i, 1);
  o.refs.push(id); if (o.refs.length > ONLINE_REFS_MAX) o.refs.splice(0, o.refs.length - ONLINE_REFS_MAX);
  if (answer.ok) {
    if (p.kind !== 'cashout') return 'closed';
    s.addMoney(p.amount, ONLINE_LABELS.cashout, now);
    return 'credited';
  }
  if (p.fund > 0) { s.addMoney(p.fund, ONLINE_LABELS.refund, now); return 'refunded'; }
  return 'closed';
}
/** The pending operations the connection of account `tag` sends again (oldest first). Another account's (a save brought from elsewhere) wait for theirs. */
export const pendingFor = (s: GameState, tag: string) => s.data.online.pending.filter(p => p.tag === tag);
/** The balance the server gave, and when: what Teranga Money shows offline (never computed here). */
export function noteBalance(s: GameState, balance: Francs, at = Date.now()) { s.data.online.balance = balance; s.data.online.at = at; }

/**
 * How a send of `amount` would be paid: Teranga Money first (its last known balance), the rest from the wallet in the same operation. With the refusal
 * and its sentence when it cannot be sent (the limits as the server gave them; the server checks again).
 */
export function quotePay(amount: Francs, o: { balance: Francs | null; wallet: Francs; limits: MoneyLimits | null; today: { funded: Francs; sent: Francs } | null; online: boolean }): PayQuote {
  const have = Math.max(0, o.balance ?? 0), n = whole(amount) ? amount : 0;
  const fromOnline = Math.min(have, Math.max(0, n)), fromWallet = Math.max(0, n - fromOnline);
  const q: PayQuote = { amount, fromOnline, fromWallet };
  const L = o.limits, refuse = (r: NonNullable<PayQuote['refusal']>) => ({ ...q, refusal: r, text: refusalText(r, L ?? { opMax: 0, fundDayMax: 0, sendDayMax: 0, receiveDayMax: 0, balanceMax: 0 }) });
  if (!whole(amount) || amount <= 0) return refuse('amount');
  if (!o.online || !L) return refuse('offline');
  if (amount > L.opMax) return refuse('limit-op');
  if (fromWallet > o.wallet) return refuse('insufficient');
  if (o.today && o.today.sent + amount > L.sendDayMax) return refuse('limit-send');
  if (o.today && fromWallet > 0 && o.today.funded + fromWallet > L.fundDayMax) return refuse('limit-fund');
  return q;
}
