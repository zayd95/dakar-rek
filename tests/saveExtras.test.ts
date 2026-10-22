import { describe, expect, it } from 'vitest';
import { EXTRAS_KEY, SAVE_KEY, clearSave, loadSave, migrate, newSave, restoredExtras, writeSave, type KV } from '../src/core/save';
import type { SaveData } from '../src/core/types';

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
