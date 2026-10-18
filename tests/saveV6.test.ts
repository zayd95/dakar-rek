import { describe, expect, it } from 'vitest';
import {
  IMPORT_DONE_KEY, LEGACY_DONE_KEY, LEGACY_SAVE_KEY, SAVE_KEY, SCHEMA_VERSION, V5_SAVE_KEY, clearSave, loadSave, newSave, writeSave, type KV,
} from '../src/core/save';
import { clearSave as clearV5, loadSave as loadV5, newSave as newSaveV5, writeSave as writeV5 } from './fixtures/saveV5Client';
import { GameState } from '../src/core/state';
import { TOURS, abandonTour, acceptTour, completeStop, currentTour, depart, historyOf, trustOf, type Order } from '../src/economy/tour';
import type { SaveData } from '../src/core/types';

/**
 * The v6 save (docs/SAVES.md): the schema-5 client (tests/fixtures/saveV5Client.ts, a frozen copy of the build served before) and the
 * current client share ONE storage, as a rollback and a return do on a device. The v5 key is only ever read by the current client, so
 * an active tour (which only a v6 build understands) can never be cancelled or rewritten by the older build.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const tour = TOURS[0];
const BANK_FIRST: Order = [0, 1];
const [AGENCE, DAMES] = [tour.stops[0].id, tour.stops[1].id];

/** A v5 player with a bit of everything: money, a lived-in room, a classic delivery in hand, relationships, a wrestler, a fight record. */
function v5Player(): SaveData {
  const d = newSaveV5(1000) as SaveData;                              // what the schema-5 client writes (schemaVersion 5, no avatar)
  d.guestId = 'g-v5-player'; d.wallet = 41_250; d.playedMs = 3_600_000; d.hub = 'pikine';
  d.flags = ['met_ibou', 'reco_modou']; d.beats = { ibou_welcome: 'oui' }; d.rel = { 'ibou|player': 22, 'ablaye|player': 35 };
  d.counters = { livraisons: 9, shifts: 3, chats: 5, combats: 2, [`tiak_trust_${AGENCE}`]: 2 };
  d.inventory = { poisson: 3 };
  d.wrestler = { ngembColor: 'rouge', ngembPattern: 'uni', accessories: ['echarpe_baobab'] };
  d.ledger = [{ at: 5, label: 'Livraison', amount: 1200 }];
  d.jobs = { active: null, done: ['r-old-1', 'r-old-2'], seq: 4 };
  d.assets.list.push({ uid: 'a2', spec: 'radio', how: 'owned', since: 0, paid: 4000, condition: 90, upgrades: [], leased: false, home: 'a1', at: null });
  d.assets.seq = 2;
  return d;
}
/** The older client plays: it loads from its own key and saves into it. */
const olderClientPlays = (s: KV, change: (d: SaveData) => void) => { const d = loadV5(s)! as SaveData; change(d); writeV5(s, d); };
const written = (s: KV, d: SaveData) => { expect(writeSave(s, d)).toBe(true); };

describe('v5 → v6: a one-time migration that keeps everything and never touches the v5 key', () => {
  it('keeps the wallet, assets, jobs, relationships, wrestler, career and the rest, as schema 6', () => {
    const s = mem(); const v5 = v5Player(); writeV5(s, v5); const v5Bytes = s.getItem(V5_SAVE_KEY)!;
    const d = loadSave(s)!;
    expect(d.schemaVersion).toBe(6); expect(SCHEMA_VERSION).toBe(6);
    expect(d).toMatchObject({
      guestId: 'g-v5-player', wallet: 41_250, playedMs: 3_600_000, hub: 'pikine', flags: ['met_ibou', 'reco_modou'], beats: { ibou_welcome: 'oui' },
      rel: { 'ibou|player': 22, 'ablaye|player': 35 }, inventory: { poisson: 3 }, ledger: [{ at: 5, label: 'Livraison', amount: 1200 }],
      wrestler: { ngembColor: 'rouge', accessories: ['echarpe_baobab'] }, jobs: { active: null, done: ['r-old-1', 'r-old-2'], seq: 4 },
    });
    expect(d.counters.livraisons).toBe(9); expect(d.counters[`tiak_trust_${AGENCE}`]).toBe(2);
    expect(d.assets.list.map(a => a.spec)).toEqual(['chambre_pikine', 'radio']); expect(d.assets.home).toBe('a1');
    expect(d.career).toEqual(v5.career);
    // written at once under the new key; the v5 key and the v5 client's markers are never touched
    expect(JSON.parse(s.getItem(SAVE_KEY)!).wallet).toBe(41_250);
    expect(s.getItem(V5_SAVE_KEY)).toBe(v5Bytes); expect(s.getItem(LEGACY_DONE_KEY)).toBeNull(); expect(s.getItem(IMPORT_DONE_KEY)).toBeNull();
  });
  it('a classic delivery in hand comes along; the delivery is paid once', () => {
    const s = mem(); const v5 = v5Player();
    v5.jobs.active = { runId: 'r-live', routeId: 'pk_mame_boutique', hub: 'pikine', stage: 'deliver', pay: 1200, startedMs: 100, limitMs: 600_000 };
    writeV5(s, v5);
    const d = loadSave(s)!; expect(d.jobs.active).toMatchObject({ runId: 'r-live', routeId: 'pk_mame_boutique', pay: 1200, stage: 'deliver' });
  });
  it('v6 wins from then on, whatever the older client does to its own key; a second tab takes the same v6 save', () => {
    const s = mem(); writeV5(s, v5Player());
    const first = loadSave(s)!;
    olderClientPlays(s, d => { d.wallet = 1; });
    const again = loadSave(mem(s.m))!;
    expect(again.wallet).toBe(41_250); expect(again.guestId).toBe(first.guestId);
  });
  it('a v5 save from a tour-pilot build (a tour under the v5 key) is carried over, the tour intact', () => {
    const s = mem(); const v5 = v5Player(); const gs = new GameState(v5);
    acceptTour(gs, tour.id, BANK_FIRST);
    s.setItem(V5_SAVE_KEY, JSON.stringify(v5));
    const d = loadSave(s)!; expect(d.jobs.active?.tour).toMatchObject({ id: tour.id, order: [0, 1], leg: 0, departed: false });
  });
  it('the production chain: a v3 save reaches v6 through the v5 client or straight; v5 wins when both exist', () => {
    const v3 = JSON.stringify({ schemaVersion: 3, guestId: 'g-v3', wallet: 12345, playedMs: 99, hub: 'pikine', counters: {}, flags: ['met_ibou'] });
    const direct = mem(); direct.setItem(LEGACY_SAVE_KEY, v3);
    expect(loadSave(direct)!.wallet).toBe(12345); expect(direct.getItem(V5_SAVE_KEY)).toBeNull(); expect(direct.getItem(LEGACY_SAVE_KEY)).toBe(v3);
    const viaV5 = mem(); viaV5.setItem(LEGACY_SAVE_KEY, v3);
    olderClientPlays(viaV5, d => { d.wallet = 20_000; });                                          // the v5 client migrated it and played on
    expect(viaV5.getItem(LEGACY_DONE_KEY)).toBe('migrated');
    const d = loadSave(viaV5)!; expect(d.wallet).toBe(20_000); expect(d.guestId).toBe('g-v3');     // v6 takes the newer v5 progress, not the v3 bytes
    expect(viaV5.getItem(LEGACY_SAVE_KEY)).toBe(v3);
  });
});

describe('new → older v5 client → new, on the same storage, with a tour half done', () => {
  /** Plays the first stop of the tour on the current client and leaves the second one pending. */
  function halfTour(s: KV) {
    writeV5(s, v5Player());
    const gs = new GameState(loadSave(s)!);
    const job = acceptTour(gs, tour.id, BANK_FIRST)!;
    depart(gs); gs.tick(8000);
    const before = gs.wallet;
    const first = completeStop(gs, job.runId)!;
    written(s, gs.data);
    return { gs, job, first, before };
  }

  it('the active tour, the stop already paid, the trust and the wallet survive the rollback and the return', () => {
    const s = mem(); const { gs, job, first, before } = halfTour(s);
    expect(first.finished).toBe(false); expect(first.paid).toBeGreaterThan(0); expect(gs.wallet).toBe(before + first.paid);
    const v5Bytes = s.getItem(V5_SAVE_KEY)!, v6Bytes = s.getItem(SAVE_KEY)!;
    expect(JSON.parse(v6Bytes).jobs.active.tour).toMatchObject({ leg: 1, departed: true });

    // rollback: the older client opens ITS save (the state before the tour), plays, saves — in its own key
    const old = loadV5(s)!;
    expect(old.jobs.active).toBeNull(); expect(old.wallet).toBe(41_250);
    olderClientPlays(s, d => { d.wallet += 777; d.flags.push('played_on_v5'); });
    expect(s.getItem(SAVE_KEY)).toBe(v6Bytes);                                                  // v6 progress is never overwritten
    expect(s.getItem(V5_SAVE_KEY)).not.toBe(v5Bytes);                                           // the older client changed only its own key

    // return: the tour is exactly where it was left
    const back = loadSave(s)!;
    expect(back.wallet).toBe(gs.wallet); expect(back.flags).not.toContain('played_on_v5');
    expect(back.jobs.active).toEqual(gs.data.jobs.active);
    expect(back.counters).toEqual(gs.data.counters); expect(back.ledger).toEqual(gs.data.ledger);
    const gb = new GameState(back);
    expect(trustOf(gb, AGENCE)).toBe(trustOf(gs, AGENCE)); expect(historyOf(gb, AGENCE).ok).toBe(historyOf(gs, AGENCE).ok);
    expect(currentTour(gb)).toMatchObject({ index: 1, run: { leg: 1, departed: true } });

    // finish it: the second stop and the bonus are paid once; the first stop is not paid again
    const walletBack = gb.wallet;
    const second = completeStop(gb, job.runId)!;
    expect(second.finished).toBe(true); expect(second.bonus).toBeGreaterThan(0);
    expect(gb.wallet).toBe(walletBack + second.paid + second.bonus);
    expect(completeStop(gb, job.runId)).toBeNull();                                              // no second payment
    expect(gb.data.jobs.active).toBeNull(); expect(gb.data.jobs.done).toContain(job.runId);
    const paidLines = gb.data.ledger.filter(e => e.label.startsWith('Tournée'));
    expect(paidLines.length).toBe(3);                                                            // stop 1, stop 2, bonus — each once
    expect(gb.data.counters.tournees).toBe(1);
  });

  it('reload mid-tour is idempotent: no payment, no change, however many times', () => {
    const s = mem(); const { gs } = halfTour(s);
    const a = loadSave(s)!, b = loadSave(s)!;
    expect(a.wallet).toBe(gs.wallet); expect(b).toEqual(a);
    writeSave(s, a);
    const c = loadSave(s)!; expect({ ...c, savedAt: 0 }).toEqual({ ...a, savedAt: 0 });
  });

  it('several rollbacks and returns in a row never lose the tour; the older client keeps its own progress', () => {
    const s = mem(); const { gs, job } = halfTour(s);
    for (let i = 0; i < 3; i++) { olderClientPlays(s, d => { d.wallet += 10; }); const g = new GameState(loadSave(s)!); expect(g.wallet).toBe(gs.wallet); expect(g.data.jobs.active?.runId).toBe(job.runId); writeSave(s, g.data); }
    expect(loadV5(s)!.wallet).toBe(41_250 + 30);
  });

  it('abandoning on v6 after a rollback pays and penalises once (the delivered stop stays paid, trust −1 for the undelivered client)', () => {
    const s = mem(); const { gs } = halfTour(s);
    olderClientPlays(s, d => { d.wallet = 5; });
    const g = new GameState(loadSave(s)!); const wallet = g.wallet, trust = trustOf(g, DAMES);
    expect(abandonTour(g)).not.toBeNull();
    expect(g.wallet).toBe(wallet); expect(trustOf(g, DAMES)).toBe(trust - 1); expect(g.data.jobs.active).toBeNull();
    expect(gs.wallet).toBe(wallet);
  });

  it('the older client\'s New Game removes its own save only: v6 progress and the tour stay', () => {
    const s = mem(); const { gs } = halfTour(s); const v6Bytes = s.getItem(SAVE_KEY)!;
    clearV5(s);
    expect(s.getItem(SAVE_KEY)).toBe(v6Bytes); expect(s.getItem(V5_SAVE_KEY)).toBeNull();
    expect(loadSave(s)!.jobs.active).toEqual(gs.data.jobs.active);
  });
});

describe('New Game on v6', () => {
  it('forgets only the v6 save; neither the v5 nor the legacy save comes back, and both stay for an older client', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, JSON.stringify({ schemaVersion: 3, wallet: 7 })); writeV5(s, v5Player());
    const legacyBytes = s.getItem(LEGACY_SAVE_KEY), v5Bytes = s.getItem(V5_SAVE_KEY);
    const d = loadSave(s)!; d.wallet = 99; written(s, d);
    clearSave(s);
    expect(s.getItem(SAVE_KEY)).toBeNull(); expect(s.getItem(V5_SAVE_KEY)).toBe(v5Bytes); expect(s.getItem(LEGACY_SAVE_KEY)).toBe(legacyBytes);
    expect(s.getItem(IMPORT_DONE_KEY)).toBe('declined');
    expect(loadSave(s)).toBeNull();                                  // a reload before the first save is a new game
    expect(loadSave(s)).toBeNull();
    const fresh = newSave(); fresh.wallet = 3000; written(s, fresh);
    expect(loadSave(s)!.wallet).toBe(3000);                           // and it then plays on its own v6 save
    expect(loadV5(s)!.wallet).toBe(41_250);                           // an older client still has its save
  });
  it('a full storage at New Game cannot bring the old save back: the marker is retried once the v6 save is gone', () => {
    const m = new Map<string, string>(); const big = 'x'.repeat(60);
    let room = 200;                                                   // bytes the fake storage can still take
    const store: KV = {
      getItem: k => m.get(k) ?? null,
      setItem: (k, v) => { const had = m.get(k)?.length ?? 0; if (v.length - had > room) throw new Error('QuotaExceededError'); room -= v.length - had; m.set(k, v); },
      removeItem: k => { room += m.get(k)?.length ?? 0; m.delete(k); },
    };
    m.set(V5_SAVE_KEY, big); m.set(SAVE_KEY, 'y'.repeat(190)); room = 10;     // v6 is big, the device is full
    clearSave(store);
    expect(m.has(SAVE_KEY)).toBe(false); expect(m.get(IMPORT_DONE_KEY)).toBe('declined');
    expect(loadSave(store)).toBeNull(); expect(m.get(V5_SAVE_KEY)).toBe(big);
  });
  it('no storage: nothing to do', () => { expect(() => clearSave(null)).not.toThrow(); });
});

describe('corrupt, unreadable and newer saves', () => {
  it('an unreadable v6 save is never replaced by the v5 one (no silent rewind); the v5 bytes are untouched', () => {
    const s = mem(); writeV5(s, v5Player()); const v5Bytes = s.getItem(V5_SAVE_KEY); s.setItem(SAVE_KEY, '{oops');
    expect(loadSave(s)).toBeNull(); expect(s.getItem(SAVE_KEY)).toBe('{oops'); expect(s.getItem(V5_SAVE_KEY)).toBe(v5Bytes);
  });
  it('a v6 save written by a newer client is not read and not overwritten by the loader', () => {
    const s = mem(); const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, wallet: 1 }); s.setItem(SAVE_KEY, raw);
    expect(loadSave(s)).toBeNull(); expect(s.getItem(SAVE_KEY)).toBe(raw);
  });
  it('an unreadable v5 save (and no v6) is a new game: the legacy save is not resurrected, nothing is written', () => {
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, JSON.stringify({ schemaVersion: 3, wallet: 7 })); s.setItem(V5_SAVE_KEY, '{oops');
    expect(loadSave(s)).toBeNull(); expect(s.getItem(SAVE_KEY)).toBeNull(); expect(s.getItem(V5_SAVE_KEY)).toBe('{oops');
  });
  it('a tour this build cannot read is dropped without paying anything; the rest of the save is kept', () => {
    const s = mem(); const d = { ...newSave(), wallet: 555 } as SaveData;
    (d.jobs as unknown) = { active: { runId: 'r1', routeId: `tour:${tour.id}`, hub: 'pikine', stage: 'deliver', pay: 4500, startedMs: 5, limitMs: 0, tour: { id: tour.id, order: [0, 0] } }, done: [], seq: 1 };
    s.setItem(SAVE_KEY, JSON.stringify(d));
    const back = loadSave(s)!; expect(back.wallet).toBe(555); expect(back.jobs.active).toBeNull(); expect(back.ledger).toEqual([]);
  });
  it('full or blocked storage at the migration: the v5 save is still used in memory and left intact', () => {
    const m = new Map<string, string>(); const v5 = JSON.stringify(v5Player()); m.set(V5_SAVE_KEY, v5);
    const full: KV = { getItem: k => m.get(k) ?? null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: k => { m.delete(k); } };
    expect(loadSave(full)!.wallet).toBe(41_250); expect(m.has(SAVE_KEY)).toBe(false); expect(m.get(V5_SAVE_KEY)).toBe(v5);
  });
});

describe('the Meshy avatar lane: its save field is carried, never silently dropped (claude/lucid-cori-60vlgt adds `avatar`)', () => {
  const withAvatar = (schemaVersion: number, avatar: unknown) => JSON.stringify({ schemaVersion, guestId: 'g-avatar', wallet: 900, playedMs: 1000, hub: 'pikine', avatar });
  it('a legacy save (the key that lane wrote), a v5 save and a v6 save keep the chosen model through the migration', () => {
    for (const [key, v] of [[LEGACY_SAVE_KEY, 3], [V5_SAVE_KEY, 5], [SAVE_KEY, 6]] as const) {
      const s = mem(); s.setItem(key, withAvatar(v, 'femme'));
      const d = loadSave(s)!; expect(`${key} ${d.avatar}`).toBe(`${key} femme`); expect(d.guestId).toBe('g-avatar');
      expect(JSON.parse(s.getItem(SAVE_KEY)!).avatar).toBe('femme');                  // and the v6 key holds it from the first write
    }
  });
  it('a save without it (or with something unknown) gets the default model; the rest is untouched', () => {
    for (const a of [undefined, 'robot', 3, null]) { const s = mem(); s.setItem(LEGACY_SAVE_KEY, withAvatar(3, a)); const d = loadSave(s)!; expect(d.avatar).toBe('homme'); expect(d.wallet).toBe(900); }
  });
  it('the choice survives write → reload, the older client keeps ignoring it, and New Game resets it to the default', () => {
    const s = mem(); const d = newSave(); d.avatar = 'femme'; d.guestId = 'g-keep'; written(s, d);
    expect(loadSave(s)!.avatar).toBe('femme'); expect(loadSave(s)!.guestId).toBe('g-keep');
    clearSave(s); expect(loadSave(s)).toBeNull();
    const fresh = newSave(); expect(fresh.avatar).toBe('homme');
  });
});

