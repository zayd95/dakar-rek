import { describe, expect, it } from 'vitest';
import { IMPORT_DONE_KEY, LEGACY_DONE_KEY, LEGACY_SAVE_KEY, SAVE_KEY, SCHEMA_VERSION, V5_SAVE_KEY, clearSave, loadSave, newSave, writeSave, type KV } from '../src/core/save';

/**
 * Release safety (docs/SAVES.md): schema v6 has its own storage key and the keys older clients write are only read, once, to
 * migrate. These tests play the part of the device's storage and of the production (v3) client that is served again.
 * The v5 → v6 step and the cross-version tour are in tests/saveV6.test.ts.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const V3 = () => JSON.stringify({
  schemaVersion: 3, guestId: 'g-v3', createdAt: 1000, savedAt: 2000, playedMs: 987654, hub: 'pikine', x: 12, z: -8, yaw: 1, wallet: 12345,
  needs: { faim: 42, energie: 55, moral: 61, social: 30, hygiene: 77 }, counters: { repas: 4 }, rel: { 'player|ibou': 35 }, flags: ['met_ibou'], beats: { intro: 'a' },
  wrestler: { ngembColor: 'rouge', ngembPattern: 'uni', accessories: [] }, ledger: [], furniture: ['miroir', 'tapis'], jobs: { active: null, done: ['j1'], seq: 1 },
});
/** what a v3 client does when it is served again: it reads and writes its own key only */
const olderClientPlays = (s: KV, wallet: number) => { const d = JSON.parse(s.getItem(LEGACY_SAVE_KEY)!); s.setItem(LEGACY_SAVE_KEY, JSON.stringify({ ...d, wallet, savedAt: Date.now() })); };

describe('v6 save key: one-time migration from the production (v3) key', () => {
  it('the keys are distinct', () => { expect(new Set([SAVE_KEY, V5_SAVE_KEY, LEGACY_SAVE_KEY]).size).toBe(3); expect(SAVE_KEY.startsWith(LEGACY_SAVE_KEY)).toBe(true); });

  it('an empty storage is a new game and nothing is written', () => {
    const s = mem(); expect(loadSave(s)).toBeNull(); expect(s.m.size).toBe(0);
  });

  it('a v3 save is migrated to v6 under the new key, nothing lost, and the original v3 bytes are untouched', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, V3()); const before = s.getItem(LEGACY_SAVE_KEY);
    const d = loadSave(s)!;
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d).toMatchObject({ guestId: 'g-v3', createdAt: 1000, playedMs: 987654, wallet: 12345, hub: 'pikine', flags: ['met_ibou'], beats: { intro: 'a' }, rel: { 'player|ibou': 35 } });
    expect(d.counters.repas).toBe(4); expect(d.jobs.done).toEqual(['j1']); expect(d.needs.faim).toBe(42);
    expect(JSON.stringify(d.assets)).toContain('miroir'); expect(JSON.stringify(d.assets)).toContain('tapis');
    expect(JSON.parse(s.getItem(SAVE_KEY)!).schemaVersion).toBe(SCHEMA_VERSION);   // written at once, not at the next autosave
    expect(s.getItem(LEGACY_DONE_KEY)).toBeNull();                                      // that marker is the v5 client's: this client does not write it
    expect(s.getItem(V5_SAVE_KEY)).toBeNull();                                          // …nor the v5 key
    expect(s.getItem(LEGACY_SAVE_KEY)).toBe(before);
  });

  it('a reload takes the v6 save; the legacy one is not read again', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, V3()); const first = loadSave(s)!;
    olderClientPlays(s, 1);                                   // the legacy key changes behind the v5 save
    const again = loadSave(s)!;
    expect(again.wallet).toBe(12345); expect(again.guestId).toBe(first.guestId);
  });

  it('migration does not need the first autosave: a second tab opened right after sees the same v6 save', () => {
    const shared = new Map<string, string>(); shared.set(LEGACY_SAVE_KEY, V3());
    const a = loadSave(mem(shared))!, b = loadSave(mem(shared))!;
    expect(b.guestId).toBe(a.guestId); expect(b.wallet).toBe(a.wallet);
    expect([...shared.keys()].sort()).toEqual([LEGACY_SAVE_KEY, SAVE_KEY].sort());
  });

  it('v6 progress survives a rollback to the production client and the return to v6', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, V3());
    const d = loadSave(s)!; d.wallet = 50000; d.flags.push('v5_progress'); writeSave(s, d);               // played on v6
    const v6Bytes = s.getItem(SAVE_KEY);
    olderClientPlays(s, 3000); olderClientPlays(s, 3100);                                               // rollback: the old client plays and saves, on its own key
    expect(s.getItem(SAVE_KEY)).toBe(v6Bytes);                                                            // it never touched v6
    const back = loadSave(s)!;                                                                            // back to v6
    expect(back.wallet).toBe(50000); expect(back.flags).toContain('v5_progress');
    expect(JSON.parse(s.getItem(LEGACY_SAVE_KEY)!).wallet).toBe(3100);                                   // and its own save is still there
  });

  it('New Game forgets the v6 save, keeps the legacy bytes, and never brings the legacy save back', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, V3()); const before = s.getItem(LEGACY_SAVE_KEY);
    const d = loadSave(s)!; d.wallet = 99; writeSave(s, d);
    clearSave(s);
    expect(s.getItem(SAVE_KEY)).toBeNull(); expect(s.getItem(LEGACY_SAVE_KEY)).toBe(before); expect(s.getItem(IMPORT_DONE_KEY)).toBe('declined');
    expect(loadSave(s)).toBeNull();                                                                      // a reload before the first save is a new game, not the old v3 save
    const fresh = newSave(); fresh.wallet = 3000; writeSave(s, fresh);
    expect(loadSave(s)!.wallet).toBe(3000);
  });

  it('New Game on a device that never had a legacy save is a plain new game', () => {
    const s = mem(); writeSave(s, newSave()); clearSave(s); expect(loadSave(s)).toBeNull();
  });

  it('an unreadable v6 save is not replaced by the legacy one', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, V3()); s.setItem(SAVE_KEY, '{oops');
    expect(loadSave(s)).toBeNull(); expect(s.getItem(SAVE_KEY)).toBe('{oops');
  });

  it('an unreadable or newer legacy save is not migrated, not marked, not touched', () => {
    for (const raw of ['{oops', JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, wallet: 1 })]) {
      const s = mem(); s.setItem(LEGACY_SAVE_KEY, raw);
      expect(loadSave(s)).toBeNull(); expect(s.getItem(SAVE_KEY)).toBeNull(); expect(s.getItem(IMPORT_DONE_KEY)).toBeNull(); expect(s.getItem(LEGACY_SAVE_KEY)).toBe(raw);
    }
  });

  it('a schema-5 test-build save under the legacy key migrates the same way', () => {
    const s = mem(); const v5 = { ...newSave(), wallet: 777, guestId: 'g-test' }; s.setItem(LEGACY_SAVE_KEY, JSON.stringify(v5));
    const d = loadSave(s)!; expect(d.wallet).toBe(777); expect(d.guestId).toBe('g-test'); expect(JSON.parse(s.getItem(SAVE_KEY)!).wallet).toBe(777);
  });

  it('full or blocked storage: the migrated save is still returned, the legacy one is intact, nothing throws', () => {
    const m = new Map<string, string>([[LEGACY_SAVE_KEY, V3()]]);
    const full: KV = { getItem: k => m.get(k) ?? null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: k => { m.delete(k); } };
    expect(loadSave(full)!.wallet).toBe(12345); expect(m.has(SAVE_KEY)).toBe(false); expect(m.get(LEGACY_SAVE_KEY)).toBe(V3());
    expect(writeSave(full, newSave())).toBe(false);
  });

  it('no storage at all is a new game', () => { expect(loadSave(null)).toBeNull(); });
});
