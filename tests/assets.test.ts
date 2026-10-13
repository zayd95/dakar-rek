import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, SCHEMA_VERSION, STARTER_HOME } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import {
  ASSET_SPECS, BILLBOARDS, BUSINESSES, FURNITURE_SPECS, HOMES, LAND, STARTER_FURNITURE, VEHICLES, AIRCRAFT, furnitureSpec, homeSpec, specOf, type FurnitureType,
} from '../src/economy/catalog';
import {
  HOUR_MS, DAY_MS, accrue, assetsValue, buyAsset, cannotBuy, cannotLet, cannotRent, chargesPerHour, comfortOf, currentHome, endLease, furnitureIn, holding,
  incomeOf, incomePerHour, moveIn, netWorth, normalize, rentAdSpace, rentAsset, repairAsset, repairCost, saleValue, sellAsset, setLeased, setOwnAd, setPlacement,
  takeNotices, upgradeAsset, valueOf, adRunning,
} from '../src/economy/assets';
import { buyVenture, ownedOf } from '../src/economy/business';
import { buyFurniture, cannotBuy as cannotBuyPiece, deliverFurniture, ownedFurnitureIds } from '../src/economy/furniture';
import { autoPlace, footprint, layoutOf, openPlan, toHome, whyNot, type Placed } from '../src/economy/placement';
import { fromCategory, multiplier, polyvalence, practise } from '../src/economy/polyvalence';
import { applyEffects, totals } from '../src/activity/effects';
import { Inventory } from '../src/activity/inventory';

const fresh = (wallet = 3000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const play = (s: GameState, ms: number) => { s.data.playedMs += ms; };
const back = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);

describe('catalogue', () => {
  it('ids are unique and every entry has a kind, a name and a line', () => {
    const ids = ASSET_SPECS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ASSET_SPECS) { expect(s.name.length).toBeGreaterThan(2); expect(s.what.length).toBeGreaterThan(5); }
    expect(specOf(STARTER_HOME)?.kind).toBe('home');
  });
  it('homes climb room → apartment → house → villa → luxury residence, up to billions', () => {
    expect(HOMES.map(h => h.home.level)).toEqual(['room', 'apartment', 'house', 'villa', 'residence']);
    const priced = HOMES.slice(1);
    for (let i = 1; i < priced.length; i++) { expect(priced[i].price!).toBeGreaterThan(priced[i - 1].price! * 3); expect(priced[i].rent!).toBeGreaterThan(priced[i - 1].rent!); }
    expect(HOMES.at(-1)!.price!).toBeGreaterThanOrEqual(1e9);
    expect(HOMES.find(h => h.home.level === 'villa')!.price!).toBeGreaterThanOrEqual(1e8);
    for (const h of HOMES) expect(h.home.door).toMatch(/:home:/);
  });
  it('land, billboard, ventures; the drivable vehicles are for sale, the others and aircraft say when they come', () => {
    expect(LAND.length).toBe(2); expect(BILLBOARDS.length).toBe(1); expect(BUSINESSES.length).toBe(7);
    for (const s of [...LAND, ...BILLBOARDS]) { expect(s.price).toBeGreaterThan(0); expect(s.income).toBeGreaterThan(0); }
    const drivable = ['jakarta', 'clando'];
    for (const s of [...VEHICLES, ...AIRCRAFT].filter(x => !drivable.includes(x.id))) { expect(s.soon).toBeTruthy(); expect(cannotBuy(fresh(1e12), s.id)).toBe(s.soon); }
    for (const id of drivable) { expect(specOf(id)?.soon).toBeUndefined(); expect(cannotBuy(fresh(1e12), id)).toBeNull(); }
    expect(specOf('jakarta')?.price).toBe(150_000); expect(specOf('clando')?.price).toBe(2_800_000);
  });
  it('furniture: every type in basic, better and premium, footprints and seats that fit', () => {
    const types = new Set(FURNITURE_SPECS.map(f => f.type));
    for (const t of types) {
      if (t === 'mattress') continue;
      const grades = new Set(FURNITURE_SPECS.filter(f => f.type === t).map(f => f.grade));
      expect([...grades].sort(), t).toEqual(['basic', 'better', 'premium']);
    }
    for (const t of ['chair', 'sofa', 'bed', 'table', 'tv', 'radio', 'desk', 'kitchen'] as FurnitureType[]) expect(types.has(t)).toBe(true);
    for (const f of FURNITURE_SPECS) {
      expect(f.w).toBeGreaterThan(0); expect(f.d).toBeGreaterThan(0); expect(f.price).toBeGreaterThan(0);
      for (const s of f.seats ?? []) { expect(Math.abs(s.x)).toBeLessThanOrEqual(f.w / 2); expect(Math.abs(s.z)).toBeLessThanOrEqual(f.d / 2); }
      if (f.type === 'bed') { expect(f.sleep).toBeGreaterThan(40); expect(f.seats?.[0].kind).toBe('bed'); }
    }
    const beds = FURNITURE_SPECS.filter(f => f.type === 'bed').sort((a, b) => a.price! - b.price!);
    expect(beds.map(b => b.sleep)).toEqual([...beds.map(b => b.sleep!)].sort((a, b) => a - b));   // better beds rest better
    for (const id of STARTER_FURNITURE) expect(furnitureSpec(id)?.unique).toBe(true);
  });
  it('the first purchases come quickly: furniture from 1 800 F, a starter wallet buys one, a delivery or two buys the radio', () => {
    const cheapest = Math.min(...FURNITURE_SPECS.map(f => f.price!));
    expect(cheapest).toBeLessThanOrEqual(newSave().wallet);
    expect(furnitureSpec('radio')!.price!).toBeLessThanOrEqual(newSave().wallet + 2 * 1200);
    expect(FURNITURE_SPECS.filter(f => f.price! <= 10_000).length).toBeGreaterThanOrEqual(8);
  });
});

describe('placement', () => {
  const room = layoutOf(homeSpec(STARTER_HOME)!), appart = layoutOf(homeSpec('appart_jamm')!);
  it('a quarter turn swaps width and depth; points rotate like three.js', () => {
    expect(footprint({ w: 2, d: 0.5 }, { x: 0, z: 0, rot: 1 })).toEqual({ x0: -0.25, z0: -1, x1: 0.25, z1: 1 });
    const [x, z] = toHome({ x: 1, z: 1, rot: 1 }, 0, 0.5);                     // the front of a piece turned a quarter faces +x
    expect(x).toBeCloseTo(1.5); expect(z).toBeCloseTo(1);
  });
  it('walls, built-ins, passages and other pieces are refused; rugs only avoid rugs', () => {
    const sofa = furnitureSpec('canape_wax')!, rug = furnitureSpec('tapis_tisse')!, table = furnitureSpec('table_basse')!;
    expect(whyNot(appart, sofa, { x: 3.5, z: 0, rot: 0 }, [])).toBe('Contre le mur');
    expect(whyNot(appart, sofa, { x: -2.9, z: -2.6, rot: 0 }, [])).toBe('Gêné par un meuble de la maison');   // the kitchen counter
    expect(whyNot(appart, sofa, { x: appart.doorX, z: 2.8, rot: 0 }, [])).toBe('Laisse le passage libre');      // the door
    expect(whyNot(appart, sofa, { x: 0, z: 0, rot: 0 }, [])).toBeNull();
    const placed: Placed[] = [{ spec: sofa, at: { x: 0, z: 0, rot: 0 } }];
    expect(whyNot(appart, table, { x: 0.3, z: 0.1, rot: 0 }, placed)).toBe('Gêné par un autre meuble');
    expect(whyNot(appart, rug, { x: 0, z: 0.5, rot: 0 }, placed)).toBeNull();                                  // a rug under the sofa
    expect(whyNot(appart, rug, { x: appart.doorX, z: 2.5, rot: 0 }, [])).toBeNull();                          // and by the door
    expect(whyNot(appart, rug, { x: 0.3, z: 0.5, rot: 0 }, [...placed, { spec: rug, at: { x: 0, z: 0.5, rot: 0 } }])).toBe('Gêné par un autre meuble');
  });
  it('the starter pieces keep their usual spots in the starter room', () => {
    for (const id of ['radio', 'miroir', 'tapis', 'chaises', 'tele']) expect(autoPlace(room, furnitureSpec(id)!, [])).toEqual(room.defaults[id]);
  });
  it('a new piece goes against a wall, facing the room; a full room says so', () => {
    const at = autoPlace(appart, furnitureSpec('canape_wax')!, [])!;
    expect(at.rot).toBe(0); expect(at.z).toBeCloseTo(-appart.d / 2 + furnitureSpec('canape_wax')!.d / 2, 1);
    const tiny = { ...openPlan('apartment', 2.4, 2.6), blocks: [], clear: [] }, bed = furnitureSpec('lit_king')!;
    const first = autoPlace(tiny, bed, []);
    expect(first).not.toBeNull();
    expect(autoPlace(tiny, bed, [{ spec: bed, at: first! }])).toBeNull();
  });
});

describe('homes: buy, rent, move in — the furniture follows', () => {
  it('a new game lives in the starter room, lent by the family', () => {
    const s = fresh();
    expect(currentHome(s).spec).toBe(STARTER_HOME); expect(currentHome(s).how).toBe('given');
    expect(cannotBuy(s, STARTER_HOME)).toBe('Pas à vendre');
  });
  it('furniture is delivered to the home and set up; a starter piece is never charged twice', () => {
    const s = fresh(10_000);
    const p = deliverFurniture(s, 'radio')!;
    expect(p.home).toBe(currentHome(s).uid); expect(p.at).toEqual(layoutOf(homeSpec(STARTER_HOME)!).defaults.radio);
    expect(s.wallet).toBe(6000);
    expect(buyFurniture(s, 'radio')).toBe(false); expect(cannotBuyPiece(s, 'radio')).toBe('Déjà chez toi'); expect(s.wallet).toBe(6000);
    expect(buyFurniture(s, 'chaise_plastique')).toBe(true); expect(buyFurniture(s, 'chaise_plastique')).toBe(true);   // several chairs
    expect(ownedFurnitureIds(s)).toEqual(['radio', 'chaise_plastique', 'chaise_plastique']);
    expect(s.data.activities.known).toContain('commerce');
  });
  it('rent the apartment: no money up front, rent each in-game hour; move in and the furniture follows and is set up', () => {
    const s = fresh(50_000);
    deliverFurniture(s, 'radio'); deliverFurniture(s, 'banquette');
    const w = s.wallet;
    expect(cannotRent(s, 'appart_jamm')).toBeNull();
    const a = rentAsset(s, 'appart_jamm')!;
    expect(a.how).toBe('rented'); expect(s.wallet).toBe(w);
    expect(moveIn(s, a.uid)).toBe(true);
    expect(currentHome(s).spec).toBe('appart_jamm');
    const pieces = furnitureIn(s, a.uid);
    expect(pieces.length).toBe(ownedFurnitureIds(s).length);
    for (const f of pieces) expect(f.at).not.toBeNull();
    play(s, HOUR_MS);
    expect(accrue(s)).toBe(-250);                                               // 6 000 F a day = 250 F an hour
    expect(s.data.ledger.at(-1)).toMatchObject({ label: 'Loyer · Appartement F2 · Résidence Jàmm', amount: -250 });
    expect(chargesPerHour(s)).toBe(250);
  });
  it('rent the apartment needs one day of rent in hand; buying it while renting turns the lease into ownership', () => {
    const s = fresh(1000);
    expect(cannotRent(s, 'appart_jamm')).toMatch(/un jour de loyer/);
    s.data.wallet = 20_000_000;
    const a = rentAsset(s, 'appart_jamm')!;
    expect(buyAsset(s, 'appart_jamm')!.uid).toBe(a.uid);
    expect(holding(s, 'appart_jamm')!.how).toBe('owned'); expect(s.wallet).toBe(5_000_000);
    expect(cannotBuy(s, 'appart_jamm')).toBe('Déjà à toi');
  });
  it('ending a lease or selling a home: the furniture comes back to where the player lives, stored or set up', () => {
    const s = fresh(1e9);
    const a = rentAsset(s, 'appart_jamm')!; moveIn(s, a.uid);
    deliverFurniture(s, 'lit_bois'); deliverFurniture(s, 'tele_plate');
    expect(endLease(s, a.uid)).toBe(true);
    expect(currentHome(s).spec).toBe(STARTER_HOME);
    expect(furnitureIn(s, currentHome(s).uid).map(f => f.spec)).toEqual(['lit_bois', 'tele_plate']);   // kept, never lost
    const h = buyAsset(s, 'maison_cite')!; moveIn(s, h.uid);
    expect(furnitureIn(s, h.uid).every(f => f.at)).toBe(true);
    const w = s.wallet, got = sellAsset(s, h.uid);
    expect(got).toBe(Math.round(90_000_000 * ECONOMY.property.saleShare)); expect(s.wallet).toBe(w + got);
    expect(currentHome(s).spec).toBe(STARTER_HOME); expect(furnitureIn(s, currentHome(s).uid).length).toBe(2);
  });
  it('comfort upgrades: the starter room takes a mosquito net (+8 energy a night)', () => {
    const s = fresh(10_000), room = currentHome(s);
    expect(upgradeAsset(s, room.uid, 'moustiquaire')).toBe(true);
    expect(comfortOf(room)).toBe(8); expect(s.wallet).toBe(4000);
    expect(upgradeAsset(s, room.uid, 'moustiquaire')).toBe(false);
  });
  it('unpaid rent piles up; after three days of it the landlord takes the keys back, the furniture is kept', () => {
    const s = fresh(6000);
    const a = rentAsset(s, 'appart_jamm')!; moveIn(s, a.uid); deliverFurniture(s, 'chaise_plastique');
    s.data.wallet = 0;
    for (let h = 0; h < 24 * 3 + 1 && holding(s, 'appart_jamm'); h++) { play(s, HOUR_MS); accrue(s); }
    expect(holding(s, 'appart_jamm')).toBeUndefined();
    expect(takeNotices().some(n => /reprend|repris/.test(n))).toBe(true);
    expect(currentHome(s).spec).toBe(STARTER_HOME); expect(ownedFurnitureIds(s)).toEqual(['chaise_plastique']);
    expect(s.data.assets.arrears).toBe(0);
  });
});

describe('land and billboard: buy, let, upgrade, ad space', () => {
  it('a plot lets for its rent per in-game hour; the wall upgrade raises it; selling pays most of its value', () => {
    const s = fresh(10_000_000);
    const p = buyAsset(s, 'parcelle_150')!;
    expect(s.wallet).toBe(7_000_000); expect(incomeOf(s, p)).toBe(0);
    expect(setLeased(s, p.uid, true)).toBe(true);
    expect(incomeOf(s, p)).toBe(4500);
    play(s, HOUR_MS); expect(accrue(s)).toBe(4500);
    expect(upgradeAsset(s, p.uid, 'mur')).toBe(true);
    expect(incomeOf(s, p)).toBe(4500 * 1.25);
    expect(valueOf(p)).toBe(3_900_000); expect(saleValue(p)).toBe(3_510_000);
  });
  it('a billboard wears in the sun: less rent, less value, until repaired', () => {
    const s = fresh(10_000_000);
    const b = buyAsset(s, 'panneau_jamm')!; setLeased(s, b.uid, true);
    for (let d = 0; d < 10; d++) { play(s, DAY_MS); accrue(s); }
    expect(b.condition).toBeCloseTo(100 - 3 * 10 * (24 / ECONOMY.business.maxCatchUpHours), 5);
    expect(incomeOf(s, b)).toBeLessThan(12_000);
    const cost = repairCost(b);
    expect(cost).toBeGreaterThan(0);
    expect(repairAsset(s, b.uid)).toBe(true); expect(b.condition).toBe(100); expect(incomeOf(s, b)).toBe(12_000);
  });
  it('the player’s own ad (own billboard or rented space) boosts the ventures by 10 %', () => {
    const s = fresh(1e9); practise(s, 'livraison'); buyVenture(s, 'bana');
    const base = incomePerHour(s);
    expect(adRunning(s)).toBe(false);
    expect(rentAdSpace(s)).toBe(true); expect(adRunning(s)).toBe(true);
    expect(incomePerHour(s)).toBe(Math.round(base * 1.1));
    play(s, DAY_MS + 1); expect(adRunning(s)).toBe(false);
    const b = buyAsset(s, 'panneau_jamm')!; setLeased(s, b.uid, true);
    expect(setOwnAd(s, b.uid, true)).toBe(true); expect(b.leased).toBe(false); expect(adRunning(s)).toBe(true);
  });
  it('only what the player owns can be let; the home they live in cannot', () => {
    const s = fresh(1e9);
    const a = rentAsset(s, 'appart_jamm')!;
    expect(cannotLet(s, a.uid)).toMatch(/à toi/);
    const h = buyAsset(s, 'maison_cite')!; moveIn(s, h.uid);
    expect(cannotLet(s, h.uid)).toMatch(/habites/);
    moveIn(s, s.data.assets.list.find(x => x.spec === STARTER_HOME)!.uid);
    expect(setLeased(s, h.uid, true)).toBe(true);
    expect(incomeOf(s, h)).toBe(Math.round((30_000 / 24) * ECONOMY.property.letShare));
  });
});

describe('income, charges and net worth', () => {
  it('ventures, lets and rents settle together each in-game hour of play; nothing offline', () => {
    const s = fresh(1e9); practise(s, 'livraison');
    buyVenture(s, 'bana');
    const p = buyAsset(s, 'parcelle_300')!; setLeased(s, p.uid, true);
    rentAsset(s, 'appart_jamm');
    const lines = s.data.ledger.length, w = s.wallet;
    play(s, HOUR_MS);
    const net = accrue(s);
    expect(net).toBe(Math.floor(400 * multiplier(s)) + 10_500 - 250);
    expect(s.data.ledger.length).toBe(lines + 2);                               // one line in, one line out
    expect(s.wallet).toBe(w + net);
    expect(accrue(s)).toBe(0);
    const b = back(s); expect(accrue(b)).toBe(0); expect(b.wallet).toBe(s.wallet);
  });
  it('net worth counts cash and the value of everything owned (not what is rented)', () => {
    const s = fresh(100_000_000);
    buyAsset(s, 'parcelle_150'); rentAsset(s, 'appart_jamm'); deliverFurniture(s, 'lit_bois');
    expect(assetsValue(s)).toBe(3_000_000 + 120_000 * ECONOMY.property.furnitureResale);
    expect(netWorth(s)).toBe(s.wallet + assetsValue(s));
  });
});

describe('save v5: assets and inventory', () => {
  it('a v4 save (affaires lane) migrates: ventures, furniture, inventory, activity names', () => {
    const v4 = { schemaVersion: 4, playedMs: 600_000, wallet: 5000, counters: { livraisons: 2, 'inv:poisson': 4, 'inv:x y': 2 }, furniture: ['radio', 'matelas'],
      business: { owned: { bana: 2, kiosque: 1 }, clockMs: 600_000, payMs: 590_000, carry: 7.5, earned: 1234 }, activities: { known: ['livraison', 'services'], last: { services: 500_000, spirituel: 1 } } };
    const m = migrate(v4)!;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.inventory).toEqual({ poisson: 4 }); expect(Object.keys(m.counters).some(k => k.startsWith('inv:'))).toBe(false);
    expect(m.activities).toEqual({ known: ['livraison', 'service'], last: { service: 500_000 } });
    const s = new GameState(m);
    expect(ownedOf(s, 'bana')).toBe(2); expect(ownedOf(s, 'kiosque')).toBe(1);
    expect(m.assets).toMatchObject({ clockMs: 600_000, payMs: 590_000, carryIn: 7.5, earned: 1234 });
    expect(furnitureIn(s, currentHome(s).uid).every(f => f.at === null)).toBe(true);      // stored until the game sets them up
    normalize(s);
    expect(furnitureIn(s, currentHome(s).uid).find(f => f.spec === 'radio')!.at).toEqual(layoutOf(homeSpec(STARTER_HOME)!).defaults.radio);
    expect(s.data.assets.list.filter(a => a.spec === 'bana').map(a => a.paid)).toEqual([50_000, 57_500]);  // the price each unit cost
    expect(new Inventory(s).list()).toEqual([{ id: 'poisson', count: 4 }]);
  });
  it('round-trips, and sanitises broken asset data (no crash, the starter room always there)', () => {
    const s = fresh(1e9);
    buyAsset(s, 'parcelle_150'); rentAsset(s, 'appart_jamm'); deliverFurniture(s, 'lit_bois');
    const f = furnitureIn(s, currentHome(s).uid)[0]; setPlacement(s, f.uid, { x: 1, z: -1, rot: 3 });
    expect(back(s).data.assets).toEqual(s.data.assets);
    const bad = migrate({ schemaVersion: 5, playedMs: 1000, assets: { list: [{ uid: 'a3', spec: 'lit_bois', home: 'a9', at: { x: 1, z: 1, rot: 1 } }, { uid: 'zz', spec: 'x' }, { uid: 'a4', spec: 'BAD!' }, { uid: 'a5', spec: 'parcelle_150', how: 'stolen', condition: 500, leased: 'yes' }], home: 'a77', seq: -4, clockMs: 9e9, carryIn: -3 } })!;
    expect(bad.assets.list.map(a => a.spec)).toEqual([STARTER_HOME, 'parcelle_150']);
    expect(bad.assets.list[1]).toMatchObject({ how: 'owned', condition: 100, leased: false });
    expect(bad.assets.home).toBe(bad.assets.list[0].uid); expect(bad.assets.clockMs).toBe(1000); expect(bad.assets.carryIn).toBe(0);
    expect(bad.assets.seq).toBeGreaterThanOrEqual(5);
    expect(migrate({ schemaVersion: 6 })).toBeNull();
  });
  it('a purchase saved then reloaded is kept once (no double payment, no lost purchase)', () => {
    const s = fresh(20_000);
    deliverFurniture(s, 'radio');
    const r = back(s);
    expect(r.wallet).toBe(16_000); expect(ownedFurnitureIds(r)).toEqual(['radio']);
    expect(buyFurniture(r, 'radio')).toBe(false); expect(r.wallet).toBe(16_000);
  });
});

describe('activities: polyvalence and religious practice', () => {
  it('work pay is scaled by polyvalence; the category counts before the pay', () => {
    const s = fresh(0); practise(s, 'livraison'); practise(s, 'peche');
    const hooks = { category: (c: string) => { const a = fromCategory(c as never); if (a) practise(s, a); }, pay: (m: number, c: string | null) => (fromCategory(c as never) ? Math.round(m * multiplier(s)) : m) };
    expect(applyEffects(s, { money: 1000, category: 'service' }, 'Bureau', hooks)).toEqual(['+1 400 F']);   // 3 activities → ×1,4
    expect(totals(0, [{ effects: { money: 1000, category: 'service' } }], (m, c) => hooks.pay(m, c))).toEqual({ cost: 0, gain: 1400 });
  });
  it('prayer and leisure never count for polyvalence, even from an old save', () => {
    expect(fromCategory('spirituel')).toBeNull(); expect(fromCategory('loisir')).toBeNull(); expect(fromCategory('transport')).toBeNull();
    const s = fresh(); const before = polyvalence(s);
    applyEffects(s, { category: 'spirituel', money: 500 }, 'Prière', { category: c => { const a = fromCategory(c); if (a) practise(s, a); } });
    expect(polyvalence(s)).toBe(before); expect(s.data.activities.known).toEqual([]);
    const old = migrate({ schemaVersion: 4, activities: { known: ['spirituel', 'social'], last: { spirituel: 0, social: 0 } } })!;
    expect(old.activities).toEqual({ known: ['social'], last: { social: 0 } });
  });
});
