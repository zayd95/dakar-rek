import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { HUB_IDS } from '../src/core/types';
import { buyAsset, holding, sellAsset, setCondition } from '../src/economy/assets';
import { specOf } from '../src/economy/catalog';
import { FALLBACK_HUB, VEHICLE_ASSETS, counterOfHub, forgetIfSold, hubOfCounter, migrateOwned, ownsVehicle, paintSeed, park, parked, rehomeOnRoad, setPaintSeed, type VehicleAsset } from '../src/transport/owned';
import { ALL_VEHICLES, OWNED_VEHICLES, VEHICLE_LABELS } from '../src/transport/fleet';
import { RING_COOLDOWN_S, RING_RANGE, VEHICLE_ICON, WhereNotes, cannotRing, vehicleEntries, vehicleEntry, vehicleMarkId, vehicleOfMark } from '../src/transport/whereabouts';

const rich = () => { const s = new GameState(newSave(0)); s.data.wallet = 500_000_000; return s; };
const inPikine = (x: number, z: number) => Math.abs(x) <= 100 && Math.abs(z) <= 100;

describe('one list of the vehicles a player can have', () => {
  it('every catalogue id has its module, and every module its id (the lent motorbike included)', () => {
    expect(ALL_VEHICLES.map(m => m.def.asset).sort()).toEqual([...VEHICLE_ASSETS].sort());
    expect(new Set(VEHICLE_ASSETS).size).toBe(VEHICLE_ASSETS.length);
    expect(OWNED_VEHICLES.map(m => m.def.asset).sort()).toEqual(VEHICLE_ASSETS.filter(a => a !== 'tiak').sort());
    expect(VEHICLE_LABELS.map(v => v.asset).sort()).toEqual(VEHICLE_ASSETS.filter(a => a !== 'tiak').sort());
  });
  it('every bought model is a vehicle of the catalogue, and has its pictogram', () => {
    for (const a of VEHICLE_ASSETS) { if (a !== 'tiak') expect(specOf(a)?.kind, a).toBe('vehicle'); expect(VEHICLE_ICON[a], a).toBeTruthy(); }
  });
});

describe('a vehicle left on a road between two districts follows the frame when the road is crossed', () => {
  it('covers every model: teranga, rafet and gainde too', () => {
    const s = rich();
    for (const a of VEHICLE_ASSETS) park(s.data, { asset: a, hub: 'pikine', x: 180, z: 12, yaw: 0.5 });       // out on the road, past the streets
    const moved = rehomeOnRoad(s.data, 'pikine', 'almadies', -400, 30, inPikine);
    expect(moved.sort()).toEqual([...VEHICLE_ASSETS].sort());
    for (const a of VEHICLE_ASSETS) expect(parked(s.data, a), a).toEqual({ asset: a, hub: 'almadies', x: -220, z: 42, yaw: 0.5 });
  });
  it('leaves alone what stands in the district, and what is in another one', () => {
    const s = rich();
    park(s.data, { asset: 'teranga', hub: 'pikine', x: 20, z: -30, yaw: 0 });
    park(s.data, { asset: 'rafet', hub: 'plateau', x: 180, z: 12, yaw: 0 });
    expect(rehomeOnRoad(s.data, 'pikine', 'almadies', -400, 30, inPikine)).toEqual([]);
    expect(parked(s.data, 'teranga')).toMatchObject({ hub: 'pikine', x: 20, z: -30 });
    expect(parked(s.data, 'rafet')).toMatchObject({ hub: 'plateau', x: 180, z: 12 });
    expect(parked(s.data, 'gainde')).toBeNull();                              // never a record made up for a vehicle that has none
  });
});

describe('sold while it stood in another district, then bought again', () => {
  it('the old parking spot and paint are forgotten: the new one is delivered at the dealer’s kerb', () => {
    const s = rich();
    const first = buyAsset(s, 'compacte')!; expect(first).toBeTruthy();
    park(s.data, { asset: 'compacte', hub: 'almadies', x: 41.2, z: -77, yaw: 1 }); setPaintSeed(s.data, 'compacte', 9);
    expect(forgetIfSold(s, 'compacte')).toBe(false);                          // still the player's: the record stays
    expect(parked(s.data, 'compacte')).toMatchObject({ hub: 'almadies', x: 41.2 });
    expect(sellAsset(s, first.uid)).toBeGreaterThan(0);
    expect(ownsVehicle(s, 'compacte')).toBe(false);
    expect(forgetIfSold(s, 'compacte')).toBe(true);                           // what the module does on the sale, wherever the car stood (src/transport/ownedModule.ts sync)
    expect(parked(s.data, 'compacte')).toBeNull(); expect(paintSeed(s.data, 'compacte')).toBeNull();
    expect(Object.keys(s.data.counters).filter(k => k.startsWith('vehicle:compacte:'))).toEqual([]);
    const again = buyAsset(s, 'compacte')!; expect(again).toBeTruthy(); expect(again.uid).not.toBe(first.uid);
    expect(parked(s.data, 'compacte')).toBeNull();                            // no record: sync() delivers it at the kerb
    expect(s.data.assets.list.filter(a => a.spec === 'compacte')).toHaveLength(1);   // one car, not two
    expect(forgetIfSold(s, 'compacte')).toBe(false);
  });
  it('the lent motorbike is never « sold »', () => {
    const s = rich(); park(s.data, { asset: 'tiak', hub: 'plateau', x: 1, z: 2, yaw: 0 });
    expect(forgetIfSold(s, 'tiak')).toBe(false); expect(parked(s.data, 'tiak')).toBeTruthy();
  });
});

describe('the district of a stored record: one fallback', () => {
  it('a missing or unknown hub counter reads as the district every game starts in, everywhere', () => {
    expect(FALLBACK_HUB).toBe('pikine');
    for (const bad of [undefined, null, NaN, -1, 99, 'pikine', 2.6e9]) expect(hubOfCounter(bad), String(bad)).toBe('pikine');
    HUB_IDS.forEach((h, i) => { expect(hubOfCounter(i)).toBe(h); expect(counterOfHub(h)).toBe(i); });
    expect(counterOfHub('nowhere' as never)).toBe(HUB_IDS.indexOf('pikine'));
    const s = rich(); s.data.counters['vehicle:jakarta:x'] = 3; s.data.counters['vehicle:jakarta:z'] = 4;       // no hub counter at all
    expect(parked(s.data, 'jakarta')).toMatchObject({ hub: 'pikine', x: 3, z: 4, yaw: 0 });
    s.data.counters['vehicle:jakarta:hub'] = 42;
    expect(parked(s.data, 'jakarta')!.hub).toBe('pikine');
    park(s.data, { asset: 'jakarta', hub: 'nowhere' as never, x: 3, z: 4, yaw: 0 });
    expect(parked(s.data, 'jakarta')!.hub).toBe('pikine');                    // written and read back alike
  });
  it('the oldest motorbike saves (a flag and its own counters) land the same way', () => {
    const s = rich(); s.data.flags.push('asset:vehicle:moto_jakarta');
    s.data.counters['asset:moto_jakarta:x'] = -12; s.data.counters['asset:moto_jakarta:z'] = 8;
    expect(migrateOwned(s)).toBe(true);
    expect(parked(s.data, 'jakarta')).toMatchObject({ hub: 'pikine', x: -12, z: 8 });
  });
});

describe('« Mes véhicules »: where each vehicle really is', () => {
  const none = () => null;
  it('lists only what the player has, at the saved position, in whatever district', () => {
    const s = rich();
    expect(vehicleEntries(s, 'pikine', none)).toEqual([]);                    // nothing bought, and no lent motorbike standing here
    buyAsset(s, 'jakarta'); park(s.data, { asset: 'jakarta', hub: 'almadies', x: 10, z: -20, yaw: 2 });
    const list = vehicleEntries(s, 'pikine', none);
    expect(list).toEqual([{ asset: 'jakarta', id: 'vehicle:jakarta', lent: false, status: 'parked', hub: 'almadies', x: 10, z: -20, yaw: 2 }]);
  });
  it('the one being driven is where the player is; one that will not start is « en panne » where it stands', () => {
    const s = rich(); buyAsset(s, 'teranga'); park(s.data, { asset: 'teranga', hub: 'pikine', x: 5, z: 5, yaw: 0 });
    expect(vehicleEntry(s, 'teranga', 'pikine', { x: 30, z: 40, yaw: 1, driving: true })).toMatchObject({ status: 'driven', hub: 'pikine', x: 30, z: 40 });
    expect(vehicleEntry(s, 'teranga', 'pikine', { x: 5, z: 5, yaw: 0, driving: false })).toMatchObject({ status: 'parked', x: 5, z: 5 });
    setCondition(holding(s, 'teranga')!, 0);
    expect(vehicleEntry(s, 'teranga', 'plateau', null)).toMatchObject({ status: 'broken', hub: 'pikine', x: 5, z: 5 });
  });
  it('bought from « Biens » and not collected yet: no position is made up', () => {
    const s = rich(); buyAsset(s, 'berline');
    expect(vehicleEntry(s, 'berline', 'pikine', null)).toMatchObject({ status: 'unknown', hub: null });
  });
  it('the lent motorbike is only the one standing in the loaded district, never its record in another one', () => {
    const s = rich(); park(s.data, { asset: 'tiak', hub: 'plateau', x: 12, z: -3, yaw: 0 });
    expect(vehicleEntry(s, 'tiak', 'pikine', null)).toBeNull();
    expect(vehicleEntry(s, 'tiak', 'pikine', { x: 4, z: 6, yaw: 0, driving: false })).toMatchObject({ lent: true, status: 'parked', hub: 'pikine', x: 4, z: 6 });
  });
  it('another player’s vehicle has no entry: only the save’s own assets are read', () => {
    const s = rich();
    for (const a of VEHICLE_ASSETS) if (a !== 'tiak') expect(vehicleEntry(s, a, 'pikine', { x: 1, z: 1, yaw: 0, driving: false }), a).toBeNull();
  });
  it('a marker id names a vehicle, or nothing', () => {
    expect(vehicleOfMark(vehicleMarkId('gainde'))).toBe('gainde');
    for (const id of ['vehicle:clando', 'teranga:dealer:pikine', 'vehicle:', '', null, undefined]) expect(vehicleOfMark(id as string)).toBeNull();
  });
});

describe('« Faire sonner »', () => {
  const car = { asset: 'jakarta' as VehicleAsset, id: 'vehicle:jakarta', lent: false, status: 'parked' as const, hub: 'pikine' as const, x: 0, z: 0, yaw: 0 };
  it('only close by, in the same district, on foot, and not again at once', () => {
    expect(cannotRing(car, 'pikine', { x: 20, z: 0 }, true, 99)).toBeNull();
    expect(cannotRing(car, 'pikine', { x: RING_RANGE + 1, z: 0 }, true, 99)).toMatch(/Trop loin/);
    expect(cannotRing(car, 'almadies', { x: 1, z: 0 }, true, 99)).toMatch(/autre quartier/);      // same coordinates, another district: never
    expect(cannotRing(car, 'pikine', { x: 1, z: 0 }, false, 99)).toBeTruthy();
    expect(cannotRing(car, 'pikine', { x: 1, z: 0 }, true, RING_COOLDOWN_S - 0.1)).toBeTruthy();
    expect(cannotRing({ ...car, status: 'driven' }, 'pikine', { x: 0, z: 0 }, true, 99)).toBeTruthy();
    expect(cannotRing({ ...car, status: 'unknown', hub: null }, 'pikine', { x: 0, z: 0 }, true, 99)).toBeTruthy();
  });
});

describe('the place a vehicle was left near, remembered on the device', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  const e = { asset: 'jakarta' as VehicleAsset, id: 'vehicle:jakarta', lent: false, status: 'parked' as const, hub: 'almadies' as const, x: 10, z: -20, yaw: 0 };
  it('comes back after a reload, for the same record only', () => {
    const store = mem(); new WhereNotes(store).set(e, 'près du Phare');
    const again = new WhereNotes(store);
    expect(again.get(e)).toBe('près du Phare');
    expect(again.get({ ...e, x: 10.004 })).toBe('près du Phare');             // the record is rounded to the centimetre
    expect(again.get({ ...e, x: 30 })).toBe('');                              // moved since: nothing is claimed
    expect(again.get({ ...e, hub: 'pikine' })).toBe('');
  });
  it('works without storage, and survives a broken one', () => {
    const n = new WhereNotes(null); n.set(e, 'près du Phare'); expect(n.get(e)).toBe('près du Phare');
    expect(new WhereNotes({ getItem: () => '{not json', setItem: () => { throw new Error('full'); } }).get(e)).toBe('');
  });
});
