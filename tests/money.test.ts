import { describe, expect, it } from 'vitest';
import { EXTRAS_KEY, EXTRAS_V2_KEY, EXTRAS_V3_KEY, EXTRA_FIELDS, MONEY_MAX, SAVE_KEY, loadSave, migrate, newSave, writeSave, type KV } from '../src/core/save';
import { GameState } from '../src/core/state';
import { applied, balanceOf, cashTotal, consistent, move, postSavings } from '../src/economy/money';
import { rng } from '../src/core/rng';

/**
 * LD2.0-A money contract (src/economy/money.ts, docs/MONEY.md): wallet and savings, moved at once and entirely or not at all, never twice for one ref,
 * and the savings kept by the save and its third extras backup through a rollback to a client that does not know them.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const player = (wallet = 60_000) => { const s = new GameState(newSave(1000)); s.data.wallet = wallet; s.data.play.day = 4; return s; };

describe('money accounts', () => {
  it('a deposit moves the whole amount from the wallet to the savings, each side in its own history', () => {
    const s = player();
    const r = move(s, 'wallet', 'savings', 25_000, { ref: 'dep-1' });
    expect(r.ok).toBe(true);
    expect(s.data.wallet).toBe(35_000); expect(s.data.bank.savings).toBe(25_000); expect(cashTotal(s)).toBe(60_000);
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: -25_000, label: 'Épargne Teranga · dépôt' });
    expect(s.data.bank.tx.at(-1)).toMatchObject({ kind: 'deposit', amount: 25_000, balance: 25_000, day: 4, ref: 'dep-1' });
    expect(s.data.bank.opened).toBe(4);
    expect(consistent(s)).toBe(true);
  });

  it('a withdrawal gives it back; nothing is created or lost', () => {
    const s = player();
    move(s, 'wallet', 'savings', 40_000);
    const r = move(s, 'savings', 'wallet', 15_000);
    expect(r.ok && r.tx.kind).toBe('withdraw');
    expect([s.data.wallet, s.data.bank.savings]).toEqual([35_000, 25_000]);
    expect(s.data.bank.tx.at(-1)).toMatchObject({ amount: -15_000, balance: 25_000 });
  });

  it('refuses without applying anything: an overdraft, a wrong amount, the same account, the online account', () => {
    const s = player(10_000), before = JSON.stringify(s.data);
    for (const [from, to, n, why] of [
      ['wallet', 'savings', 10_001, 'insufficient'], ['savings', 'wallet', 1, 'insufficient'], ['wallet', 'savings', 0, 'amount'], ['wallet', 'savings', -5, 'amount'],
      ['wallet', 'savings', 2.5, 'amount'], ['wallet', 'savings', Number.NaN, 'amount'], ['wallet', 'wallet', 100, 'same'],
      ['wallet', 'online', 100, 'unsupported'], ['online', 'wallet', 100, 'unsupported'],
    ] as const) {
      const r = move(s, from, to, n);
      expect(r.ok ? 'ok' : r.why, `${from}→${to} ${n}`).toBe(why);
    }
    expect(JSON.stringify(s.data)).toBe(before);
    expect(balanceOf(s, 'online')).toBeNull();
  });

  it('one ref is applied once: a double tap or a replay never moves the money twice', () => {
    const s = player();
    expect(move(s, 'wallet', 'savings', 5_000, { ref: 'confirm-7' }).ok).toBe(true);
    const r = move(s, 'wallet', 'savings', 5_000, { ref: 'confirm-7' });
    expect(r.ok ? 'ok' : r.why).toBe('duplicate');
    expect(s.data.bank.savings).toBe(5_000); expect(s.data.wallet).toBe(55_000);
    expect(applied(s, 'confirm-7')).toBe(true);
  });

  it('never above the exact-money limit', () => {
    const s = player(MONEY_MAX);
    s.data.bank.savings = MONEY_MAX - 10; postSavings(s, 'deposit', 0, 'set');
    const r = move(s, 'wallet', 'savings', 11);
    expect(r.ok ? 'ok' : r.why).toBe('overflow');
  });

  it('a thousand random operations keep wallet + savings exact and the account agreeing with its history', () => {
    const s = player(500_000), R = rng(42);
    for (let i = 0; i < 1000; i++) {
      const dep = R() < 0.5, n = 1 + Math.floor(R() * 90_000);
      move(s, dep ? 'wallet' : 'savings', dep ? 'savings' : 'wallet', n, R() < 0.2 ? { ref: `r${Math.floor(R() * 50)}` } : {});
      expect(cashTotal(s)).toBe(500_000);
      expect(s.data.wallet).toBeGreaterThanOrEqual(0); expect(s.data.bank.savings).toBeGreaterThanOrEqual(0);
    }
    expect(consistent(s)).toBe(true);
    expect(s.data.bank.tx.length).toBeLessThanOrEqual(200);
  });
});

describe('the savings in the save', () => {
  it('a save without the field (every save before LD2.0) has an empty account; a malformed one is cleaned', () => {
    const d = migrate({ ...newSave(1), bank: undefined })!;
    expect(d.bank).toEqual({ opened: -1, savings: 0, tx: [], seq: 0, goal: null, refs: [], interestDay: -1, milestones: [] });
    const bad = migrate({ ...newSave(1), bank: { savings: -50, tx: [{ id: 'x' }, { id: 'T3', kind: 'deposit', amount: 10, balance: 10, label: 'ok' }], goal: { amount: 0 }, refs: [1, 'a'], seq: 1 } })!;
    expect(bad.bank.savings).toBe(0); expect(bad.bank.tx.map(t => t.id)).toEqual(['T3']); expect(bad.bank.seq).toBe(3);
    expect(bad.bank.goal).toBeNull(); expect(bad.bank.refs).toEqual(['a']);
  });

  it('survives a reload exactly', () => {
    const store = mem(), s = player();
    move(s, 'wallet', 'savings', 12_345, { ref: 'r1' }); s.data.bank.goal = { amount: 50_000, label: 'Bana-bana' };
    writeSave(store, s.data);
    const back = loadSave(store)!;
    expect(back.bank).toEqual(s.data.bank); expect(back.wallet).toBe(s.data.wallet);
  });

  it('a rollback to a client that does not know the savings (it saves without them, and rewrites the first two backups) never loses them', () => {
    const store = mem(), s = player();
    move(s, 'wallet', 'savings', 30_000);
    writeSave(store, s.data);
    // the PR #65 client: rebuilds the save from the fields it knows, adds 1 000 F of work, and writes its two backups without `bank`
    const old = JSON.parse(store.getItem(SAVE_KEY)!); delete old.bank; old.wallet += 1_000;
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const extras = JSON.stringify({ guestId: old.guestId, savedAt: Date.now() + 5, ...Object.fromEntries(EXTRA_FIELDS.map(k => [k, old[k]])) });
    store.setItem(EXTRAS_KEY, extras); store.setItem(EXTRAS_V2_KEY, extras);
    // back on this client: the savings come back from the third backup, the wallet is the older client's (nothing counted twice)
    const back = loadSave(store)!;
    expect(back.bank.savings).toBe(30_000); expect(back.wallet).toBe(31_000);
    expect(back.bank.tx).toEqual(s.data.bank.tx);
  });

  it('another game on the device (another guest) never takes this one’s savings', () => {
    const store = mem(), s = player();
    move(s, 'wallet', 'savings', 9_000); writeSave(store, s.data);
    const other = newSave(2); other.guestId = 'someone-else';
    const raw = JSON.parse(JSON.stringify(other)); delete raw.bank;
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(JSON.parse(store.getItem(EXTRAS_V3_KEY)!).bank.savings).toBe(9_000);
    expect(loadSave(store)!.bank.savings).toBe(0);
  });
});
