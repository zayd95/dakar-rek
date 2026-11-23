import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import type { AssetState } from '../src/core/types';
import { LEGACY_VEHICLES, migrateLegacyVehicles, ownsVehicle, park, parked, type VehicleAsset } from '../src/transport/owned';
import { buyAsset, holding, saleValue, sellAsset, valueOf } from '../src/economy/assets';
import { SAVE_KEY, loadSave } from '../src/core/save';
import { specOf } from '../src/economy/catalog';

/** A save from before the modern sedan: the old « Voiture d'occasion » (`clando`) owned, parked in the Corniche. */
function oldOwner(): GameState {
  const s = new GameState(newSave(0));
  s.data.wallet = 500_000;
  const a: AssetState = { uid: 'a7', spec: 'clando', how: 'owned', since: 1234, paid: 2_800_000, condition: 80, upgrades: [], leased: false };
  s.data.assets.list.push(a);
  park(s.data, { asset: 'clando' as VehicleAsset, hub: 'corniche', x: -30.5, z: 64.3, yaw: 1.5708 });
  s.data.ledger.push({ at: 1000, label: 'Achat : Voiture d’occasion', amount: -2_800_000 });
  // what a real save is: JSON on disk
  return new GameState(JSON.parse(JSON.stringify(s.data)));
}

describe('retiring the old clando: nobody loses their car', () => {
  it('the old car is gone from the catalogue (no new purchase, nothing to show at the dealer) and cannot be bought', () => {
    expect(specOf('clando')).toBeUndefined();
    const s = new GameState(newSave(0)); s.data.wallet = 50_000_000;
    expect(buyAsset(s, 'clando')).toBeFalsy(); expect(s.wallet).toBe(50_000_000);
    expect(LEGACY_VEHICLES).toEqual({ clando: 'compacte' });
  });

  it('an owner keeps the same asset: uid, what they paid, condition, since; under the new id', () => {
    const s = oldOwner(), before = JSON.stringify(s.data.assets.list.find(a => a.uid === 'a7'));
    expect(migrateLegacyVehicles(s)).toBe(true);
    const a = holding(s, 'compacte')!;
    expect(a).toMatchObject({ uid: 'a7', how: 'owned', since: 1234, paid: 2_800_000, condition: 80, upgrades: [], leased: false });
    const { basis, ...rest } = a;
    expect(basis).toBe(2_800_000); expect(JSON.stringify({ ...rest, spec: 'clando' })).toBe(before);   // nothing but the id changed (and the worth basis recorded)
    expect(holding(s, 'clando' as string)).toBeUndefined(); expect(s.data.assets.list.filter(x => x.uid === 'a7')).toHaveLength(1); expect(s.data.assets.list).toHaveLength(2);   // the starter room and the car
    expect(ownsVehicle(s, 'compacte')).toBe(true);
  });

  it('its parking spot moves with it, the old counters go; the wallet and the ledger are untouched', () => {
    const s = oldOwner(), ledger = JSON.stringify(s.data.ledger);
    migrateLegacyVehicles(s);
    expect(parked(s.data, 'compacte')).toEqual({ asset: 'compacte', hub: 'corniche', x: -30.5, z: 64.3, yaw: 1.571 });
    expect(Object.keys(s.data.counters).filter(k => k.startsWith('vehicle:clando:'))).toEqual([]);
    expect(s.wallet).toBe(500_000); expect(JSON.stringify(s.data.ledger)).toBe(ledger);
  });

  it('is idempotent, and does nothing for a save without the old car', () => {
    const s = oldOwner(); migrateLegacyVehicles(s);
    const once = JSON.stringify(s.data);
    expect(migrateLegacyVehicles(s)).toBe(false); expect(JSON.stringify(s.data)).toBe(once);
    const fresh = new GameState(newSave(0)), f0 = JSON.stringify(fresh.data);
    expect(migrateLegacyVehicles(fresh)).toBe(false); expect(JSON.stringify(fresh.data)).toBe(f0);
  });

  it('never merges: a save somehow holding both keeps the old one untouched', () => {
    const s = oldOwner();
    s.data.assets.list.push({ uid: 'a8', spec: 'compacte', how: 'owned', since: 9, paid: 1, condition: 100, upgrades: [], leased: false });
    expect(migrateLegacyVehicles(s)).toBe(false);
    expect(s.data.assets.list.map(a => a.spec).filter(x => /clando|compacte/.test(x)).sort()).toEqual(['clando', 'compacte']);
  });

  it('after the move the car is an ordinary asset: it has a value, it can be sold, and its parking spot is forgotten when sold', () => {
    const s = oldOwner(); migrateLegacyVehicles(s);
    expect(valueOf(holding(s, 'compacte')!)).toBeGreaterThan(0);
    const got = sellAsset(s, 'a7');
    expect(got).toBeGreaterThan(0); expect(holding(s, 'compacte')).toBeUndefined(); expect(s.wallet).toBe(500_000 + got);
  });

  it('its worth stays what its owner paid, not the new entry\'s provisional price: no windfall in resale or net worth', () => {
    const s = oldOwner(); migrateLegacyVehicles(s);
    const a = holding(s, 'compacte')!, price = specOf('compacte')!.price!;
    expect(a.basis).toBe(2_800_000);
    const fresh = new GameState(newSave(0)); fresh.data.wallet = 50_000_000; buyAsset(fresh, 'compacte');
    const f = holding(fresh, 'compacte')!; f.condition = 80;
    expect(valueOf(a) / valueOf(f)).toBeCloseTo(2_800_000 / price, 3);                              // same condition: worth in proportion to what was paid
    expect(valueOf(a)).toBeLessThanOrEqual(2_800_000); expect(saleValue(a)).toBeLessThan(2_800_000);   // never more than the purchase
    expect(valueOf({ ...a, basis: undefined })).toBeGreaterThan(valueOf(a));                         // (without the basis it would have been a windfall)
  });

  it('a new buyer\'s car has no basis: it follows the catalogue price, as every other asset does', () => {
    const fresh = new GameState(newSave(0)); fresh.data.wallet = 50_000_000; buyAsset(fresh, 'compacte');
    expect(holding(fresh, 'compacte')!.basis).toBeUndefined();
  });

  it('the basis survives the save loader (a real save is read back through it)', () => {
    const s = oldOwner(); migrateLegacyVehicles(s);
    const store = { getItem: (k: string) => k === SAVE_KEY ? JSON.stringify(s.data) : null, setItem: () => {}, removeItem: () => {} };
    const loaded = loadSave(store)!, a = loaded.assets.list.find(x => x.uid === 'a7')!;
    expect(a).toMatchObject({ spec: 'compacte', paid: 2_800_000, basis: 2_800_000, condition: 80 });
  });
});
