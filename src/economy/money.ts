import type { GameState } from '../core/state';
import type { BankTx, BankTxKind } from '../core/types';
import { BANK_REFS_MAX, BANK_TX_MAX, MONEY_MAX } from '../core/save';

/**
 * The player's money accounts (LD2.0-A contract, docs/MONEY.md). Pure rules on the game state, unit-tested.
 *
 *   – `wallet`: the cash the game has always had (SaveData.wallet). Everything that earns or spends goes through `GameState.addMoney`, which writes the
 *     wallet's own history (SaveData.ledger). Nothing here changes that.
 *   – `savings`: the Banque Teranga savings account (SaveData.bank). Money only enters or leaves it by `move` (wallet ↔ savings) or `postSavings`
 *     (interest paid by the bank). Its history is SaveData.bank.tx; its balance is SaveData.bank.savings, authoritative.
 *   – `online`: LD2.0-B's server-authoritative account for transfers between players. It is named here so the types and callers do not change when it
 *     arrives; no local operation accepts it (`unsupported`), and nothing local may ever set its balance.
 *
 * Every operation is whole francs, all or nothing (it is checked completely before anything is applied), and never leaves an account below zero or above
 * MONEY_MAX. An operation may carry a `ref` (an idempotency key, e.g. the id of the confirmation the player tapped): a ref already applied is refused, so a
 * double tap, a replayed message or a resent request never moves the money twice.
 */
export type LocalAccount = 'wallet' | 'savings';
export type AccountId = LocalAccount | 'online';
export const ACCOUNT_NAMES: Record<AccountId, string> = { wallet: 'Portefeuille', savings: 'Épargne Teranga', online: 'Compte en ligne' };

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
