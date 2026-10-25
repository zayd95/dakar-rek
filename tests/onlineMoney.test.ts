import { describe, expect, it } from 'vitest';
import { EXTRAS_KEY, EXTRAS_V2_KEY, EXTRAS_V3_KEY, EXTRAS_V4_KEY, EXTRA_FIELDS, EXTRA_FIELDS_V3, SAVE_KEY, loadSave, migrate, newSave, writeSave, type KV } from '../src/core/save';
import { GameState } from '../src/core/state';
import { ONLINE_LABELS, onlineKnown, pendingFor, quotePay, reserveOnline, settleOnline } from '../src/economy/money';
import { DEVICE_KEY, KEY_BACKUP, exportCode, importSave, readCode, undoImport } from '../src/core/saveTransfer';
import type { MoneyLimits } from '../src/online/protocol';

/**
 * LD2.0-B, the device's side of Teranga Money (src/economy/money.ts, docs/ld2/LD2_B_CONTRACT.md): the wallet part reserved and saved before anything is
 * sent, refunded or credited once by its id, kept through a reload and a rollback to an older client; and the device key carried by the save code.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const TAG = 'abcdefabcdef0123', OTHER = '0123456789abcdef', ID = '5d0f0d7a-1c2b-4e3f-8a9b-0c1d2e3f4a5b', ID2 = '6e1a1b8b-2d3c-4f40-9bac-1d2e3f4a5b6c';
const L: MoneyLimits = { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 };
const player = (wallet = 60_000) => { const s = new GameState(newSave(1000)); s.data.wallet = wallet; return s; };

describe('Teranga Money on the device', () => {
  it('a top-up: the wallet is debited, the pending entry written, the save written before anything is sent', () => {
    const s = player(), store = mem();
    let seenAtSave: { wallet: number; pending: number } | null = null;
    const save = () => { seenAtSave = { wallet: s.data.wallet, pending: s.data.online.pending.length }; return writeSave(store, s.data); };
    const r = reserveOnline(s, { id: ID, kind: 'fund', amount: 20_000, fund: 20_000, tag: TAG }, save, 5);
    expect(r.ok).toBe(true);
    expect(seenAtSave).toEqual({ wallet: 40_000, pending: 1 });
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: -20_000, label: 'Teranga Money · recharge' });
    expect(JSON.parse(store.getItem(SAVE_KEY)!).online.pending).toEqual([{ id: ID, kind: 'fund', amount: 20_000, fund: 20_000, at: 5, tag: TAG }]);
    expect(onlineKnown(s, ID)).toBe(true);
    expect(reserveOnline(s, { id: ID, kind: 'fund', amount: 20_000, fund: 20_000, tag: TAG }, save)).toEqual({ ok: false, why: 'duplicate' });
  });

  it('if the save cannot be written, nothing is debited and nothing is pending', () => {
    const s = player(); for (let i = 0; i < 100; i++) s.addMoney(1, 'x'); s.addMoney(-100, 'y');
    const before = JSON.stringify(s.data);
    expect(reserveOnline(s, { id: ID, kind: 'pay', amount: 5_000, fund: 3_000, to: OTHER, tag: TAG }, () => false)).toEqual({ ok: false, why: 'save' });
    expect(JSON.stringify(s.data)).toBe(before);
    expect(reserveOnline(s, { id: ID, kind: 'fund', amount: 70_000, fund: 70_000, tag: TAG }, () => true)).toEqual({ ok: false, why: 'insufficient' });
    expect(reserveOnline(s, { id: ID, kind: 'pay', amount: 5_000, fund: 6_000, to: OTHER, tag: TAG }, () => true)).toEqual({ ok: false, why: 'amount' });
    expect(reserveOnline(s, { id: ID, kind: 'fund', amount: 2.5, fund: 2.5, tag: TAG }, () => true)).toEqual({ ok: false, why: 'amount' });
  });

  it('refused: the reserved part comes back once; a second answer changes nothing', () => {
    const s = player();
    reserveOnline(s, { id: ID, kind: 'pay', amount: 5_000, fund: 3_000, to: OTHER, tag: TAG }, () => true);
    expect(s.data.wallet).toBe(57_000);
    expect(settleOnline(s, ID, { ok: false })).toBe('refunded');
    expect(s.data.wallet).toBe(60_000); expect(s.data.ledger.at(-1)).toMatchObject({ amount: 3_000, label: ONLINE_LABELS.refund });
    expect(settleOnline(s, ID, { ok: false })).toBe('none');
    expect(settleOnline(s, ID, { ok: true })).toBe('none');
    expect(s.data.wallet).toBe(60_000); expect(s.data.online.pending).toEqual([]); expect(s.data.online.refs).toEqual([ID]);
  });

  it('accepted: the entry is closed and the balance noted; a withdrawal credits the wallet once', () => {
    const s = player();
    reserveOnline(s, { id: ID, kind: 'fund', amount: 20_000, fund: 20_000, tag: TAG }, () => true);
    expect(settleOnline(s, ID, { ok: true, balance: 20_000 }, 77)).toBe('closed');
    expect(s.data.wallet).toBe(40_000); expect(s.data.online).toMatchObject({ balance: 20_000, at: 77, pending: [] });
    reserveOnline(s, { id: ID2, kind: 'cashout', amount: 8_000, fund: 0, tag: TAG }, () => true);
    expect(s.data.wallet).toBe(40_000);                                   // the server debits first: nothing moves before its answer
    expect(settleOnline(s, ID2, { ok: true, balance: 12_000 })).toBe('credited');
    expect(settleOnline(s, ID2, { ok: true, balance: 12_000 })).toBe('none');   // a duplicate answer never credits twice
    expect(s.data.wallet).toBe(48_000); expect(s.data.ledger.at(-1)).toMatchObject({ amount: 8_000, label: ONLINE_LABELS.cashout });
  });

  it('a pending operation survives a reload and is sent again by its own account only', () => {
    const s = player(), store = mem();
    reserveOnline(s, { id: ID, kind: 'pay', amount: 5_000, fund: 5_000, to: OTHER, note: 'Pour le taxi', req: ID2, tag: TAG }, () => writeSave(store, s.data));
    const back = new GameState(loadSave(store)!);
    expect(back.wallet).toBe(55_000);
    expect(pendingFor(back, TAG)).toEqual([{ id: ID, kind: 'pay', amount: 5_000, fund: 5_000, to: OTHER, note: 'Pour le taxi', req: ID2, at: expect.any(Number), tag: TAG }]);
    expect(pendingFor(back, OTHER)).toEqual([]);
  });

  it('a save without the field has nothing pending; a malformed one is cleaned', () => {
    expect(migrate({ ...newSave(1), online: undefined })!.online).toEqual({ tag: null, pending: [], refs: [], balance: null, at: 0 });
    const d = migrate({ ...newSave(1), online: { tag: 'NOPE', balance: -4, at: 9, refs: [ID, ID, 7, 'x'], pending: [
      { id: ID, kind: 'fund', amount: 100, fund: 3, tag: TAG }, { id: ID, kind: 'fund', amount: 100, tag: TAG }, { id: ID2, kind: 'pay', amount: 100, fund: 200, to: OTHER, tag: TAG },
      { id: 'bad', kind: 'fund', amount: 1, tag: TAG }, { id: ID2, kind: 'steal', amount: 1, tag: TAG }, { id: ID2, kind: 'pay', amount: 50, fund: 10, to: 'nobody', tag: TAG },
      { id: ID2, kind: 'cashout', amount: 50, fund: 10, tag: TAG, to: OTHER }] } })!;
    expect(d.online.tag).toBeNull(); expect(d.online.balance).toBe(0); expect(d.online.refs).toEqual([ID]);
    expect(d.online.pending).toEqual([{ id: ID, kind: 'fund', amount: 100, fund: 100, at: 0, tag: TAG }, { id: ID2, kind: 'cashout', amount: 50, fund: 0, at: 0, tag: TAG }]);
  });

  it('a rollback to the beta client (it rewrites the first two backups without `online`) keeps a reserved top-up', () => {
    const store = mem(), s = player();
    reserveOnline(s, { id: ID, kind: 'fund', amount: 20_000, fund: 20_000, tag: TAG }, () => writeSave(store, s.data));
    const old = JSON.parse(store.getItem(SAVE_KEY)!); delete old.online; delete old.bank; old.wallet += 1_000;
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const extras = JSON.stringify({ guestId: old.guestId, savedAt: Date.now() + 5, ...Object.fromEntries(EXTRA_FIELDS.map(k => [k, old[k]])) });
    store.setItem(EXTRAS_KEY, extras); store.setItem(EXTRAS_V2_KEY, extras);
    const back = loadSave(store)!;
    expect(back.wallet).toBe(41_000);                                     // the older client's wallet (still debited): nothing counted twice
    expect(back.online.pending.map(p => p.id)).toEqual([ID]);            // the top-up is sent again at the next connection
  });

  it('a rollback to the LD2.0-A client (it rewrites the third backup too, without `online`) keeps it from the fourth', () => {
    const store = mem(), s = player();
    reserveOnline(s, { id: ID, kind: 'fund', amount: 20_000, fund: 20_000, tag: TAG }, () => writeSave(store, s.data));
    expect(EXTRA_FIELDS_V3).toContain('online');
    const old = JSON.parse(store.getItem(SAVE_KEY)!); delete old.online; old.wallet += 500;
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const a = (fields: readonly string[]) => JSON.stringify({ guestId: old.guestId, savedAt: Date.now() + 5, ...Object.fromEntries(fields.map(k => [k, old[k]])) });
    store.setItem(EXTRAS_KEY, a(EXTRA_FIELDS)); store.setItem(EXTRAS_V2_KEY, a(EXTRA_FIELDS));
    store.setItem(EXTRAS_V3_KEY, a(EXTRA_FIELDS_V3.filter(k => k !== 'online')));
    expect(JSON.parse(store.getItem(EXTRAS_V4_KEY)!).online.pending).toHaveLength(1);
    const back = loadSave(store)!;
    expect(back.wallet).toBe(40_500); expect(back.online.pending.map(p => p.id)).toEqual([ID]);
    expect(back.bank).toEqual(s.data.bank);
  });

  it('the send quote: Teranga Money first, the rest from the wallet, or why not', () => {
    const o = { balance: 3_000, wallet: 10_000, limits: L, today: { funded: 0, sent: 0 }, online: true };
    expect(quotePay(5_000, o)).toEqual({ amount: 5_000, fromOnline: 3_000, fromWallet: 2_000 });
    expect(quotePay(2_000, o)).toEqual({ amount: 2_000, fromOnline: 2_000, fromWallet: 0 });
    expect(quotePay(20_000, o)).toMatchObject({ refusal: 'insufficient', text: expect.stringMatching(/^Solde insuffisant/) });
    expect(quotePay(300_000, { ...o, wallet: 1e9 })).toMatchObject({ refusal: 'limit-op', text: 'Au plus 250 000 F par opération.' });
    expect(quotePay(5_000, { ...o, today: { funded: 499_000, sent: 0 } })).toMatchObject({ refusal: 'limit-fund' });
    expect(quotePay(5_000, { ...o, today: { funded: 0, sent: 496_000 } })).toMatchObject({ refusal: 'limit-send' });
    expect(quotePay(5_000, { ...o, online: false })).toMatchObject({ refusal: 'offline', fromOnline: 3_000 });
    expect(quotePay(0, o)).toMatchObject({ refusal: 'amount' });
  });
});

describe('the save code carries the online account’s key', () => {
  const K1 = 'a'.repeat(32), K2 = 'b'.repeat(32);
  it('exported with the code, read back, installed only by the confirmed import, given back by « Revenir »', () => {
    const s = player(), code = exportCode(s.data, { name: 'Awa', look: 2 }, K2);
    const r = readCode(code);
    expect('data' in r && r.key).toBe(K2);
    const store = mem(); store.setItem(DEVICE_KEY, K1); writeSave(store, player(5).data);
    expect(store.getItem(DEVICE_KEY)).toBe(K1);                           // reading a code changes nothing
    expect(importSave(store, (r as { data: typeof s.data }).data, null, 1, K2)).toBe(true);
    expect([store.getItem(DEVICE_KEY), store.getItem(KEY_BACKUP)]).toEqual([K2, K1]);
    expect(undoImport(store)).toBe(true);
    expect([store.getItem(DEVICE_KEY), store.getItem(KEY_BACKUP)]).toEqual([K1, K2]);
    expect(undoImport(store)).toBe(true);
    expect(store.getItem(DEVICE_KEY)).toBe(K2);
  });
  it('an older code has no key: it imports, and the device keeps its own', () => {
    const s = player(), code = exportCode(s.data, null, null);
    const r = readCode(code);
    expect('data' in r && r.key).toBeNull();
    const store = mem(); store.setItem(DEVICE_KEY, K1);
    importSave(store, (r as { data: typeof s.data }).data, null, 1, null);
    expect(store.getItem(DEVICE_KEY)).toBe(K1);
    expect(readCode(exportCode(s.data, null, 'not-a-key'))).toMatchObject({ key: null });
  });
});
