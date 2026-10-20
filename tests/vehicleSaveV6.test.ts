import { describe, expect, it } from 'vitest';
import { V5_SAVE_KEY, loadSave, newSave, writeSave, type KV } from '../src/core/save';
import { newSave as newSaveV5, writeSave as writeV5 } from './fixtures/saveV5Client';
import { GameState } from '../src/core/state';
import { buyAsset, holding, valueOf } from '../src/economy/assets';
import { migrateLegacyVehicles, ownsVehicle, park, parked } from '../src/transport/owned';
import type { SaveData } from '../src/core/types';

/**
 * The vehicles lane and the v6 save (docs/SAVES.md « Fields that other lanes add »): the one field the vehicles add is `basis` on an asset (what a
 * retired vehicle's owner paid, so resale carries no windfall); the owned ids and where they are parked are plain assets and counters. None of it may
 * cost the Meshy avatar, the tour, or any other lane's field, in either direction of the v5 → v6 migration.
 */
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });

describe('vehicles in the v6 save', () => {
  it('a v6 save with the avatar, four owned vehicles, their parking spots and a worth basis comes back whole', () => {
    const s = mem(), d = newSave(0) as SaveData; d.avatar = 'femme'; d.wallet = 123_456;
    const g = new GameState(d); g.data.wallet = 1_000_000_000;
    for (const id of ['jakarta', 'compacte', 'berline', 'tout_terrain']) expect(buyAsset(g, id), id).toBeTruthy();
    g.data.assets.list.find(a => a.spec === 'compacte')!.basis = 2_800_000;
    park(g.data, { asset: 'jakarta', hub: 'pikine', x: 1.5, z: -2, yaw: 0.5 }); park(g.data, { asset: 'tout_terrain', hub: 'almadies', x: -86, z: -4.3, yaw: -1.571 });
    const wallet = g.data.wallet; expect(writeSave(s, g.data)).toBe(true);
    const back = loadSave(s)!, b = new GameState(back);
    expect(back.schemaVersion).toBe(6); expect(back.avatar).toBe('femme'); expect(back.wallet).toBe(wallet);
    for (const id of ['jakarta', 'compacte', 'berline', 'tout_terrain']) expect(ownsVehicle(b, id as 'jakarta'), id).toBe(true);
    expect(holding(b, 'compacte')!.basis).toBe(2_800_000);
    expect(parked(back, 'jakarta')).toMatchObject({ hub: 'pikine', x: 1.5, z: -2 }); expect(parked(back, 'tout_terrain')).toMatchObject({ hub: 'almadies', x: -86 });
  });

  it('a v5 save that owns the retired clando comes up as v6 with the same car, moved to the modern sedan, worth what it was paid; the rest of the save is untouched', () => {
    const s = mem(), v5 = newSaveV5(1000) as SaveData; v5.guestId = 'g-clando'; v5.wallet = 777_000; v5.flags = ['met_ibou']; v5.counters = { livraisons: 4, 'vehicle:clando:hub': 1, 'vehicle:clando:x': 115.7, 'vehicle:clando:z': 97, 'vehicle:clando:yaw': 0 };
    v5.assets.list.push({ uid: 'a77', spec: 'clando', how: 'owned', since: 9, paid: 2_800_000, condition: 80, upgrades: [], leased: false }); v5.assets.seq = 77;
    writeV5(s, v5); const v5Bytes = s.getItem(V5_SAVE_KEY);
    const d = loadSave(s)!;
    expect(d.schemaVersion).toBe(6); expect(d).toMatchObject({ guestId: 'g-clando', wallet: 777_000, flags: ['met_ibou'] }); expect(d.counters.livraisons).toBe(4);
    expect(d.assets.list.some(a => a.spec === 'clando')).toBe(true);                      // the loader keeps the id; the vehicle module moves it at start-up
    const g = new GameState(d); expect(migrateLegacyVehicles(g)).toBe(true);
    const a = holding(g, 'compacte')!;
    expect(a).toMatchObject({ uid: 'a77', paid: 2_800_000, basis: 2_800_000, condition: 80 }); expect(valueOf(a)).toBeLessThan(valueOf({ ...a, basis: undefined }));                // worth follows what was paid (2.8 M), not the new entry's price
    expect(parked(g.data, 'compacte')).toMatchObject({ hub: 'corniche', x: 115.7, z: 97 });                     // counter 1 = HUB_IDS[1]
    expect(g.data.counters['vehicle:clando:x']).toBeUndefined(); expect(g.wallet).toBe(777_000);
    expect(s.getItem(V5_SAVE_KEY)).toBe(v5Bytes);                                         // the v5 key is never rewritten
  });
});
