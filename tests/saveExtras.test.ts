import { describe, expect, it } from 'vitest';
import { EXTRAS_KEY, EXTRAS_V5_KEY, SAVE_KEY, clearSave, loadSave, migrate, newSave, restoredExtras, writeSave, type KV } from '../src/core/save';
import type { SaveData } from '../src/core/types';
import { GameState } from '../src/core/state';
import { furnish, offer, signLease } from '../src/economy/monthly';
import * as v10 from './fixtures/save10Client';

/**
 * Debts and older clients (docs/SAVES.md): an older v6 client rebuilds the save from the fields it knows and drops the debts, the VTC record, the
 * player's days and the streak. This client keeps them a second time (EXTRAS_KEY) and takes back whatever a save written by an older client lacks.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const withDebt = (): SaveData => {
  const d = newSave(1000); d.guestId = 'g-1'; d.wallet = 50_000;
  d.loans = { list: [{ id: 'L1', lender: 'sarr', kind: 'vehicle', label: 'Teranga', asset: 'a7', spec: 'teranga', principal: 2_800_000, paid: 120_000, installment: 25_000, every: 3, openedDay: 4, checkedDay: 9, missed: 0, status: 'open' }], seq: 1 };
  d.vtc = { active: null, done: ['V1', 'V2'], seq: 2, trips: 2, earned: 7000 };
  d.play = { day: 12, city: 88 }; d.streak = { run: 3, best: 4, last: 12, lastMs: 0, total: 9, grace: 1, seen: [2, 3] };
  return d;
};
/** What a PR #61-era v6 client does: it rebuilds the save from the fields it knows (no loans, vtc, play, streak) and writes it under the same key. */
const olderClientSaves = (s: KV, wallet: number) => {
  const d = JSON.parse(s.getItem(SAVE_KEY)!) as Record<string, unknown>;
  for (const k of ['loans', 'vtc', 'play', 'streak']) delete d[k];
  s.setItem(SAVE_KEY, JSON.stringify({ ...d, wallet, savedAt: Date.now() }));
};

describe('save extras: debts survive an older client', () => {
  it('every save keeps the extras a second time, with the guest id', () => {
    const s = mem(); writeSave(s, withDebt());
    const b = JSON.parse(s.getItem(EXTRAS_KEY)!);
    expect(b.guestId).toBe('g-1'); expect(b.loans.list[0]).toMatchObject({ id: 'L1', paid: 120_000 }); expect(b.streak.run).toBe(3);
  });

  it('a save rewritten by an older client gets its debts, rides, days and streak back; what that client changed is kept', () => {
    const s = mem(); writeSave(s, withDebt());
    olderClientSaves(s, 61_000);
    const d = loadSave(s)!;
    expect(d.wallet).toBe(61_000);
    expect(d.loans.list).toHaveLength(1); expect(d.loans.list[0]).toMatchObject({ id: 'L1', principal: 2_800_000, paid: 120_000, status: 'open' });
    expect(d.vtc).toMatchObject({ active: null, done: ['V1', 'V2'], trips: 2, earned: 7000 });
    expect(d.play).toEqual({ day: 12, city: 88 }); expect(d.streak).toMatchObject({ run: 3, best: 4, seen: [2, 3] });
    expect(restoredExtras.sort()).toEqual(['loans', 'play', 'streak', 'vtc']);
  });

  it('a ride that was in hand is not resumed after an older client (the rides already paid stay paid)', () => {
    const s = mem(), d0 = withDebt();
    d0.vtc.active = { id: 'V3', from: 'pikine', to: 'plateau', pickup: { x: 1, z: 2, name: 'A' }, dropoff: { x: 3, z: 4, name: 'B' }, fare: 3000, stage: 'aboard', passenger: { name: 'Awa', seed: 2 }, acceptedMs: 0 };
    writeSave(s, d0); olderClientSaves(s, 1);
    expect(loadSave(s)!.vtc).toMatchObject({ active: null, done: ['V1', 'V2'] });
  });

  it('a client that knew the debts but not the fare share (PR #63) keeps the loan; its share of the fares comes back from the backup', () => {
    const s = mem(), d0 = withDebt(); d0.loans.list[0].clock = 'play'; d0.loans.list[0].share = true; writeSave(s, d0);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!); delete raw.play; delete raw.streak;
    raw.loans.list[0] = { ...raw.loans.list[0], paid: 130_000 }; delete raw.loans.list[0].clock; delete raw.loans.list[0].share;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    const d = loadSave(s)!;
    expect(d.loans.list[0]).toMatchObject({ id: 'L1', paid: 130_000, share: true });      // what that client paid is kept
    expect(d.loans.list[0].clock).toBeUndefined();                                         // its due dates: moved onto the player's days by the credit clock
    expect(d.streak.run).toBe(3);
  });

  it('a save this client wrote is never touched by the backup', () => {
    const s = mem(), d0 = withDebt(); writeSave(s, d0);
    const b = JSON.parse(s.getItem(EXTRAS_KEY)!); b.loans.list[0].paid = 999_999; s.setItem(EXTRAS_KEY, JSON.stringify(b));
    expect(loadSave(s)!.loans.list[0].paid).toBe(120_000); expect(restoredExtras).toEqual([]);
  });

  it('another guest\'s backup is never applied; a New Game removes it', () => {
    const s = mem(); writeSave(s, withDebt());
    const other = JSON.parse(s.getItem(SAVE_KEY)!); other.guestId = 'g-2'; delete other.loans; s.setItem(SAVE_KEY, JSON.stringify(other));
    expect(loadSave(s)!.loans.list).toEqual([]);
    clearSave(s); expect(s.getItem(EXTRAS_KEY)).toBeNull();
  });

  it('a backup without debts does not wipe what the save has', () => {
    const s = mem(), d = migrate({ ...withDebt(), loans: undefined })!; writeSave(s, d);
    olderClientSaves(s, 5);
    expect(loadSave(s)!.loans.list).toEqual([]);
  });
});

/**
 * 1.0.1's monthly contracts and the 1.0 client (review finding 3): 1.0 rebuilds `assets` without `lease`, `owed` and `settled` when it writes the save (a rollback,
 * or a 1.0 tab left open). The 1.0 client here is its real save.ts, frozen (tests/fixtures/save10Client.ts), on the same storage.
 */
describe('save extras: the monthly lease and its debts survive the 1.0 client', () => {
  const T0 = Date.UTC(2026, 10, 13, 12);
  /** 1.0.1: the F2 signed, furnished and let furnished, with arrears on the contract, 40 000 F left by an older contract, and settlement keys. */
  const withLease = () => {
    const s = new GameState(newSave(1000)); s.data.guestId = 'g-5'; s.data.wallet = 1_000_000;
    const a = signLease(s, 'appart_jamm', T0)!; furnish(s, a.uid); expect(offer(s, a.uid, 'furnished', T0)).toBe(true);
    a.lease!.debt = 25_000; a.lease!.k = 3; s.data.assets.owed = 40_000;
    s.data.assets.settled = [...s.data.assets.settled!, `rent:${a.uid}:1`, `rent:${a.uid}:2`, `rent:${a.uid}:3`];
    return { s, uid: a.uid, lease: structuredClone(a.lease!) };
  };
  /** The 1.0 client opens the save, does `change` with it, and writes it back (its own writer, its own extras keys). */
  const with10 = (store: KV, change: (d: SaveData) => void = () => {}) => { const d = v10.loadSave(store)!; change(d); v10.writeSave(store, d); return d; };

  it('1.0 really drops them: its save has no contract, no debt left by a contract, no settlement keys', () => {
    const store = mem(), { s, uid } = withLease(); writeSave(store, s.data);
    const d = with10(store), raw = JSON.parse(store.getItem(SAVE_KEY)!);
    expect(d.assets.list.find(a => a.uid === uid)).toMatchObject({ how: 'rented' }); expect(d.assets.list.find(a => a.uid === uid)!.lease).toBeUndefined();
    expect(raw.assets.owed).toBeUndefined(); expect(raw.assets.settled).toBeUndefined();
    expect(raw.assets.list.find((a: { uid: string }) => a.uid === uid).lease).toBeUndefined();
  });
  it('back on 1.0.1 the contract comes back as it stood (arrears, months settled, the let, the pack), the debt and the keys too; what 1.0 did with the wallet stays', () => {
    const store = mem(), { s, uid, lease } = withLease(); writeSave(store, s.data);
    with10(store, d => { d.wallet -= 6_000; });                                   // a city day of rent by 1.0's per-day rule
    const d = loadSave(store)!, f2 = d.assets.list.find(a => a.uid === uid)!;
    expect(f2.lease).toEqual(lease); expect(f2.lease!.pack).toHaveLength(lease.pack!.length);
    expect(f2.rate).toBeUndefined();
    expect(d.assets.owed).toBe(40_000);
    expect(d.assets.settled).toEqual(s.data.assets.settled);
    expect(d.wallet).toBe(s.data.wallet - 6_000);
    expect(restoredExtras).toEqual(['monthly']);
    writeSave(store, d); expect(JSON.parse(store.getItem(SAVE_KEY)!).assets.settled).toEqual(s.data.assets.settled);   // and 1.0.1 writes them again
    expect(loadSave(store)!.assets.list.find(a => a.uid === uid)!.lease).toEqual(lease); expect(restoredExtras).toEqual([]);
  });
  it('moved into the F2 with 1.0 (it was on offer): the contract comes back with the player living there, no tenant', () => {
    const store = mem(), { s, uid, lease } = withLease(); writeSave(store, s.data);
    with10(store, d => { d.assets.home = uid; });
    const f2 = loadSave(store)!.assets.list.find(a => a.uid === uid)!;
    expect(f2.lease).toEqual({ ...lease, mode: 'live' });
  });
  it('a pack piece sold with 1.0 leaves the pack; the rest stays', () => {
    const store = mem(), { s, uid, lease } = withLease(); writeSave(store, s.data);
    const sold = lease.pack![0];
    with10(store, d => { d.assets.list = d.assets.list.filter(a => a.uid !== sold); });
    expect(loadSave(store)!.assets.list.find(a => a.uid === uid)!.lease!.pack).toEqual(lease.pack!.slice(1));
  });
  it('handed back (or taken back) with 1.0: no contract to restore, and its arrears are owed with the rest', () => {
    const store = mem(), { s, uid } = withLease(); writeSave(store, s.data);
    with10(store, d => { d.assets.list = d.assets.list.filter(a => a.uid !== uid); for (const a of d.assets.list) if (a.home === uid) { a.home = d.assets.home ?? undefined; a.at = null; } });
    const d = loadSave(store)!;
    expect(d.assets.list.some(a => a.uid === uid)).toBe(false);
    expect(d.assets.owed).toBe(40_000 + 25_000);
    expect(restoredExtras).toEqual(['monthly']);
  });
  it('a save 1.0.1 wrote itself is never touched by the backup, even one written while the backup could not be', () => {
    const store = mem(), { s, uid } = withLease(); writeSave(store, s.data);
    const after = structuredClone(s.data); after.assets.list = after.assets.list.filter(a => a.uid !== uid); after.assets.owed = 0;   // the contract ended and the debt paid, in 1.0.1
    const full: KV = { ...store, setItem: (k, v) => { if (k === EXTRAS_V5_KEY) throw new Error('full'); store.setItem(k, v); } };
    writeSave(full, after);                                                        // the save is written, the backup is not: it still has the contract
    const d = loadSave(store)!;
    expect(d.assets.list.some(a => a.uid === uid)).toBe(false); expect(d.assets.owed ?? 0).toBe(0); expect(restoredExtras).toEqual([]);
  });
  it('another guest\'s backup is never applied; a New Game removes it', () => {
    const store = mem(), { s, uid } = withLease(); writeSave(store, s.data);
    with10(store, d => { d.guestId = 'g-6'; });
    const d = loadSave(store)!;
    expect(d.assets.list.find(a => a.uid === uid)!.lease).toBeUndefined(); expect(d.assets.owed).toBeUndefined();
    clearSave(store); expect(store.getItem(EXTRAS_V5_KEY)).toBeNull();
  });
});
