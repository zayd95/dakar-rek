import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import {
  CAR_CAP, CAR_FEE, CAR_FEE_COUNTER, CAR_GAP, CAR_LOOKS, CAR_PLACES, KERB, carCount, carLot, carOrder, carPaidTonight, carTaken, inCarLot,
} from '../src/arena/carParkRules';
import { CARD_SHARE, LOT_EMPTIES, inLot, motoLot } from '../src/arena/arrivalRules';
import { gateOf, queueDistance, stallsOf } from '../src/arena/exteriorRules';
import { eveningGoal, goalText, type EveningInput } from '../src/arena/eveningCall';
import { tonightPage, type TonightInput } from '../src/arena/tonight';
import { LINES, GRID, loopNodes, roadCentre } from '../src/transport/lines';
import { PARK_OFFSET } from '../src/game/parkedVehicles';
import { WALL_R } from '../src/world/geew';
import { CAR_GUARD, unknownPhrases } from '../src/i18n/lines';
import { glossed } from '../src/i18n/wolof';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';

stubCanvas();
const A = { cx: 30, cz: -30 };                    // the Pikine arena (world/builder.ts block 2,1)
const lot = carLot(A), gate = gateOf(A);
const HALF_LEN = 2.45, HALF_W = 0.97;              // the biggest look, an SUV (4.85 × 1.94 m)
const ROAD = GRID.road / 2;
/** Distance from a point to a segment. */
const toSeg = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const corners = (s: { x: number; z: number }) => [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: s.x + a * HALF_W, z: s.z + b * HALF_LEN })));

let hubP: Promise<HubWorld> | null = null;
const pikine = () => (hubP ??= import('../src/world/builder').then(m => m.buildHub('pikine', true)));

describe('the guarded car places by the arena', () => {
  it('stand in the kerb lane of the side street east of the arena: off the queue lane, the 23s route and the junctions', () => {
    expect(KERB).toBe(PARK_OFFSET);
    expect(lot.slots.length).toBe(CAR_PLACES);
    const route = loopNodes(LINES.find(l => l.id === '23s')!);
    const street = A.cx + 30;
    expect(street).toBe(roadCentre(3));
    for (const s of lot.slots) {
      expect(s.x).toBeCloseTo(street - PARK_OFFSET, 6);                                          // the kerb lane on the arena's side
      expect(s.yaw).toBe(0);                                                                     // driving on the right, heading north
      for (const c of corners(s)) {
        expect(inCarLot(lot, c.x, c.z)).toBe(true);
        expect(Math.hypot(c.x - A.cx, c.z - A.cz), 'clear of the wall').toBeGreaterThan(WALL_R + 2);
        for (let k = 0; k <= GRID.nb; k++) expect(Math.abs(c.z - roadCentre(k)), 'clear of the junctions').toBeGreaterThan(ROAD + 1.5);
        expect(c.x).toBeGreaterThan(A.cx + 23);                                                   // in the street, not on the sand
      }
      expect(queueDistance(gate, s.x, s.z), 'far from the queue lane').toBeGreaterThan(20);
      for (let i = 0; i < route.length; i++) expect(toSeg(s, route[i], route[(i + 1) % route.length]), 'off Ligne 23’s evening route').toBeGreaterThan(ROAD + 3);
      for (const st of stallsOf(A)) expect(Math.hypot(st.x - s.x, st.z - s.z)).toBeGreaterThan(10);
      expect(inLot(motoLot(A), s.x, s.z)).toBe(false);
    }
    for (let i = 1; i < lot.slots.length; i++) expect(lot.slots[i].z - lot.slots[i - 1].z).toBe(CAR_GAP);
    expect(CAR_GAP).toBeGreaterThan(2 * HALF_LEN + 1);                                            // never two cars on each other
    // the moto parking and the car places do not overlap
    const m = motoLot(A).area, c = lot.area;
    expect(m.x1 < c.x0 || m.z1 < c.z0 || c.x1 < m.x0 || c.z1 < m.z0).toBe(true);
  });
  it('the gardien keeps the place nearest the gate, nothing behind it and the one in front free to pull out', () => {
    const r = lot.slots[lot.reserved], a = lot.slots[lot.ahead];
    expect(Math.min(...lot.slots.map(s => Math.hypot(s.x - gate.x, s.z - gate.z)))).toBe(Math.hypot(r.x - gate.x, r.z - gate.z));
    expect(Math.hypot(r.x - gate.x, r.z - gate.z)).toBeLessThan(30);                             // a short walk to the gate
    expect(lot.slots.filter(s => s.z < r.z)).toEqual([]);                                        // drives in from the corner
    expect(a.z - r.z).toBe(CAR_GAP);
    const tail = { x: r.x, z: r.z - HALF_LEN };
    expect(Math.hypot(lot.gardien.x - tail.x, lot.gardien.z - tail.z)).toBeLessThan(3.5);         // he stands behind it, on the pavement
    expect(lot.gardien.x).toBeLessThan(r.x - HALF_W - 0.4);
    expect(inCarLot(lot, lot.gardien.x, lot.gardien.z)).toBe(true);
    expect(inCarLot(lot, lot.sign.x, lot.sign.z)).toBe(false);
    expect(carOrder(lot)).not.toContain(lot.reserved);
    expect(carOrder(lot)).not.toContain(lot.ahead);
    expect(carOrder(lot)).toEqual(carOrder(lot));                                                 // the same evening fills the same way
  });
  it('in the real Pikine: the places, the gardien and his sign stand clear of every wall, tree and building', async () => {
    const h = await pikine(), hit = (x: number, z: number, r: number) => h.colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);
    expect(h.arena).toMatchObject(A);
    for (const s of lot.slots) for (const c of corners(s)) expect(hit(c.x, c.z, 0.2), `place ${s.z}`).toBe(false);
    expect(hit(lot.gardien.x, lot.gardien.z, 0.4)).toBe(false);
    expect(hit(lot.sign.x, lot.sign.z, 0.2)).toBe(false);
    // the driver steps out on the pavement side of the kept place, clear too
    const r = lot.slots[lot.reserved];
    expect(hit(r.x - (0.89 + 0.7), r.z, 0.3)).toBe(false);
  }, 30000);
  it('the city’s evening cars leave his stretch of kerb to him', async () => {
    const h = await pikine();
    const { ArenaStreets } = await import('../src/city/arena');
    const ctx = { extra: new THREE.Group(), camera: new THREE.PerspectiveCamera(), quality: () => 'high', hour: () => 18, day: () => 4 } as unknown as GameCtx;
    const s = new ArenaStreets(ctx, h, gateOf(h.arena!), 'high');
    const spots = (s as unknown as { parked: { x: number; z: number }[] }).parked;
    expect(spots.length).toBeGreaterThan(12);                                                     // still the gala's dozen and more
    expect(spots.filter(p => inCarLot(lot, p.x, p.z))).toEqual([]);
    expect(spots.some(p => Math.abs(p.x - (A.cx + 30 + PARK_OFFSET)) < 0.01)).toBe(true);        // the far kerb keeps its cars
  }, 30000);
  it('fill as the doors open (a gala night fills them), fewer on a weekday card, and empty after the gala', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      expect(CAR_CAP[q]).toBeLessThanOrEqual(lot.slots.length - 2);
      expect(CAR_LOOKS[q]).toBeLessThanOrEqual(3);
      expect(2 * CAR_LOOKS[q]).toBeLessThanOrEqual(6);                                           // draw calls: a body and a glass per look
    }
    const cap = CAR_CAP.high;
    expect(carCount({ street: 'quiet', size: 'gala', hour: 12, cap })).toBe(0);
    const doors = [17, 18, 19, 21].map(hour => carCount({ street: 'doors', size: 'gala', hour, cap }));
    for (let i = 1; i < doors.length; i++) expect(doors[i]).toBeGreaterThanOrEqual(doors[i - 1]);
    expect(doors.at(-1)).toBe(cap);
    expect(carCount({ street: 'doors', size: 'card', hour: 21, cap })).toBe(Math.max(1, Math.round(cap * CARD_SHARE)));
    expect(carCount({ street: 'doors', size: 'card', hour: 21, cap })).toBeLessThan(cap);
    expect(carCount({ street: 'after', size: 'gala', hour: 23, cap, after: { t: LOT_EMPTIES, from: cap } })).toBe(0);
  });
  it('the other cars never take the kept places, nor the place the player’s own car stands on', () => {
    const all = carTaken(lot, 99, null);
    expect(all.length).toBe(lot.slots.length - 2);
    const mine = lot.slots[all[0]], some = carTaken(lot, 99, mine);
    expect(some).not.toContain(all[0]);
    expect(some.length).toBe(all.length - 1);                                                    // only that place: no car pops away beside it
    const between = { x: mine.x, z: mine.z + CAR_GAP / 2 };                                      // left across two places
    expect(carTaken(lot, 99, between).every(i => Math.abs(lot.slots[i].z - between.z) > CAR_GAP * 0.8)).toBe(true);
    expect(carTaken(lot, 2, null)).toEqual(all.slice(0, 2));
  });
  it('the fee is 200 F, paid once per evening (the save counter holds the day)', () => {
    expect(CAR_FEE).toBe(200);
    expect(CAR_FEE_COUNTER).not.toBe('arena_moto_day');
    expect(carPaidTonight({}, 12)).toBe(false);
    expect(carPaidTonight({ [CAR_FEE_COUNTER]: 12 }, 12)).toBe(true);
    expect(carPaidTonight({ [CAR_FEE_COUNTER]: 11 }, 12)).toBe(false);
    expect(carPaidTonight({ arena_moto_day: 12 }, 12)).toBe(false);                               // the moto's fee is not the car's
  });
  it('the gardien speaks lexicon Wolof with its gloss, names the price before paying, and says goodbye', () => {
    unknownPhrases.clear();
    const g = (s: string) => glossed(s, true).replace(/[\u00a0\u202f]/g, ' ');
    const hello = g(CAR_GUARD.hello(CAR_FEE)), paid = g(CAR_GUARD.paid(CAR_FEE)), again = g(CAR_GUARD.again()), bye = g(CAR_GUARD.bye());
    expect([...unknownPhrases]).toEqual([]);
    expect(hello).toBe('Le gardien du parking : « Jàmm nga am ? » (tout va bien ?) · Parking voitures : 200 F la soirée, payés une fois.');
    expect(paid).toMatch(/^Le gardien du parking : « 200 F, jërëjëf ! Bul tiit\. » \(merci · n’aie pas peur\) · Il range ta voiture/);
    expect(again).toMatch(/« Dalal ak jàmm ! » \(bienvenue\) · Ta place t’attend/);
    expect(bye).toBe('Le gardien du parking : « Ñibbil ak jàmm ! Ba ci kanam ! » (rentre bien · à plus tard) · Il te fait signe de passer.');
  });
});

describe('getting there by car: the goal line and « Ce soir »', () => {
  const base: EveningInput = { hour: 17.5, galaDone: false, ticket: false, welcome: false, gate: { dist: 300, inside: false }, afterDone: false };
  it('far away with one’s own car here: take the car; at the wheel: the guarded car places; both here: the nearer one', () => {
    expect(eveningGoal({ ...base, car: 'parked' })).toEqual({ kind: 'arena', how: 'car' });
    expect(eveningGoal({ ...base, car: 'riding' })).toEqual({ kind: 'arena', how: 'carpark' });
    expect(eveningGoal({ ...base, gate: { dist: 40, inside: false }, ticket: true, car: 'riding' })).toEqual({ kind: 'arena', how: 'carpark' });
    expect(eveningGoal({ ...base, car: 'parked', moto: 'parked' })).toEqual({ kind: 'arena', how: 'moto' });
    expect(eveningGoal({ ...base, car: 'parked', moto: 'parked', nearer: 'moto' })).toEqual({ kind: 'arena', how: 'moto' });
    expect(eveningGoal({ ...base, car: 'parked', moto: 'parked', nearer: 'car' })).toEqual({ kind: 'arena', how: 'car' });
    expect(eveningGoal({ ...base, car: null, moto: 'parked', nearer: 'car' })).toEqual({ kind: 'arena', how: 'moto' });
    expect(eveningGoal({ ...base, car: 'riding', moto: 'parked' })).toEqual({ kind: 'arena', how: 'carpark' });
    expect(eveningGoal({ ...base, car: null })).toEqual({ kind: 'arena', how: 'ride' });
    expect(eveningGoal({ ...base, gate: { dist: 40, inside: false }, car: 'parked' })).toEqual({ kind: 'arena', how: 'walk' });   // parked near: on foot
    expect(eveningGoal({ ...base, gate: { dist: 20, inside: false }, car: 'parked' })).toEqual({ kind: 'ticket' });
    expect(eveningGoal({ ...base, gate: { dist: 30, inside: true }, ticket: true, car: 'parked' })).toEqual({ kind: 'seat' });
    expect(eveningGoal({ ...base, hour: 12, car: 'parked' })).toBeNull();                       // not before the evening
    expect(goalText({ kind: 'arena', how: 'car' })).toMatch(/prends ta voiture, parking gardé/);
    expect(goalText({ kind: 'arena', how: 'carpark' })).toMatch(/parking voitures gardé.*200\sF/);
  });
  it('« Ce soir » names the guarded car places and their price when the car is the way to go', () => {
    const page: TonightInput = {
      day: 11, hour: 17, size: 'gala',
      bill: { left: { name: 'Babacar', ecurie: 'Baobab' }, right: { name: 'Lamine', ecurie: 'Teranga' } },
      tomorrow: { left: { name: 'Ousmane', ecurie: 'Baobab' }, right: { name: 'Daouda', ecurie: 'Teranga' }, size: 'gala' },
      ticket: false, galaDone: false, fighter: null, hub: 'Pikine', gate: { dist: 212, inside: false }, ride: null,
      vehicles: [{ key: 'car', label: 'Ta voiture', dist: 34 }], after: null, weather: null, road: [],
    };
    const go = (o: Partial<TonightInput>) => tonightPage({ ...page, ...o }).find(s => s.title === 'Y aller')!.rows.find(r => /voiture/.test(r.label))!;
    expect(go({})).toMatchObject({ label: 'Ta voiture', go: 'car' });
    expect(go({}).detail).toMatch(/^Garée à 30 m · parking gardé à l’arène, 200\sF$/);
    expect(go({ gate: { dist: 60, inside: false } }).detail).toBe('Garée à 30 m');                // near: just where it is
    expect(go({ vehicles: [{ key: 'car', label: 'Ta voiture', dist: null, riding: true }] })).toMatchObject({ label: 'Ta voiture : tu es dessus' });
    expect(go({ vehicles: [{ key: 'car', label: 'Ta voiture', dist: null, riding: true }] }).detail).toMatch(/Parking voitures gardé.*200\sF la soirée/);
  });
});
