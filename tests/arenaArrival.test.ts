import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CARD_SHARE, FAN_COLOURS, LOT_CAP, LOT_EMPTIES, MOTO_FEE, MOTO_FEE_COUNTER, SLOT_GAP, fansRide, gardienBias, inLot, lotCount, lotOrder, lotTaken, motoLot, paidTonight,
} from '../src/arena/arrivalRules';
import { ECURIES, drummerAt, gateOf, queueDistance, stallsOf } from '../src/arena/exteriorRules';
import { eveningGoal, goalText, type EveningInput } from '../src/arena/eveningCall';
import { WALL_R } from '../src/world/geew';
import { MOTO_GUARD, unknownPhrases } from '../src/i18n/lines';
import { glossed } from '../src/i18n/wolof';
import { buildVehicle } from '../src/actors/vehicleKit';
import { pickTarget } from '../src/interact/system';
import type { Target } from '../src/interact/types';
import { fansAtStop, fansOnSet, type LineFans } from '../src/transport/passengers';

const A = { cx: 30, cz: -30 };                    // the Pikine arena (world/builder.ts block 2,1)
const lot = motoLot(A), gate = gateOf(A);
const HALF_LEN = 1.05, HALF_W = 0.42;              // a Jakarta (src/transport/moto.ts)

describe('the guarded moto parking by the arena', () => {
  it('stands on the sand beside the gate: off the queue lane, the stalls, the drummers, the wall and the floodlight mast', () => {
    const corners = (s: { x: number; z: number }) => [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: s.x + a * HALF_W, z: s.z + b * HALF_LEN })));
    const mast = { x: A.cx + Math.sin((3 * Math.PI) / 4) * (WALL_R + 1.6), z: A.cz + Math.cos((3 * Math.PI) / 4) * (WALL_R + 1.6) };
    for (const s of lot.slots) {
      for (const c of corners(s)) {
        expect(Math.hypot(c.x - A.cx, c.z - A.cz), 'clear of the wall and its footing').toBeGreaterThan(WALL_R + 1.5);
        expect(c.x < A.cx + 23 && c.z > A.cz - 23 - 0.05, 'on the arena block, not in the street').toBe(true);
        expect(Math.hypot(c.x - mast.x, c.z - mast.z)).toBeGreaterThan(0.6);
        expect(inLot(lot, c.x, c.z)).toBe(true);
      }
      expect(queueDistance(gate, s.x, s.z)).toBeGreaterThan(8);
      for (const st of stallsOf(A)) expect(Math.hypot(st.x - s.x, st.z - s.z)).toBeGreaterThan(3);
      for (let k = 0; k < 3; k++) { const d = drummerAt(gate, k); expect(Math.hypot(d.x - s.x, d.z - s.z)).toBeGreaterThan(5); }
    }
    for (let i = 0; i < lot.slots.length; i++) for (let j = i + 1; j < lot.slots.length; j++) {
      const a = lot.slots[i], b = lot.slots[j];
      expect(Math.abs(a.x - b.x) >= SLOT_GAP - 1e-6 || Math.abs(a.z - b.z) >= 2 * HALF_LEN + 0.5).toBe(true);   // never two motos on each other
    }
  });
  it('the gardien keeps the place next to him, a short walk from the gate, with nothing behind it', () => {
    const r = lot.slots[lot.reserved];
    expect(Math.hypot(r.x - gate.x, r.z - gate.z)).toBeLessThan(16);
    expect(Math.hypot(r.x - lot.gardien.x, r.z - lot.gardien.z)).toBeLessThan(2.5);
    expect(Math.min(...lot.slots.map(s => Math.hypot(s.x - gate.x, s.z - gate.z)))).toBe(Math.hypot(r.x - gate.x, r.z - gate.z));
    expect(lot.slots.filter(s => s !== r && Math.abs(s.x - r.x) < 0.9 && s.z < r.z)).toEqual([]);         // backs out to the street freely
    expect(inLot(lot, lot.gardien.x, lot.gardien.z)).toBe(true);
  });
  it('fills as the doors open (a gala night fills it), never before the evening, and empties after the gala', () => {
    const cap = LOT_CAP.high;
    expect(lotCount({ street: 'quiet', size: 'gala', hour: 12, cap })).toBe(0);
    expect(lotCount({ street: 'setup', size: 'gala', hour: 16.5, cap })).toBeLessThanOrEqual(2);
    const doors = [17, 17.5, 18, 18.5, 19, 21].map(hour => lotCount({ street: 'doors', size: 'gala', hour, cap }));
    for (let i = 1; i < doors.length; i++) expect(doors[i]).toBeGreaterThanOrEqual(doors[i - 1]);
    expect(doors.at(-1)).toBe(cap);
    expect(lotCount({ street: 'doors', size: 'card', hour: 21, cap })).toBe(Math.round(cap * CARD_SHARE));
    const after = [0, 30, 75, 120, LOT_EMPTIES, LOT_EMPTIES + 60].map(t => lotCount({ street: 'after', size: 'gala', hour: 23, cap, after: { t, from: cap } }));
    expect(after[0]).toBe(cap);
    for (let i = 1; i < after.length; i++) expect(after[i]).toBeLessThanOrEqual(after[i - 1]);
    expect(after.at(-1)).toBe(0);
    for (const q of ['low', 'medium', 'high'] as const) expect(LOT_CAP[q]).toBeLessThan(lot.slots.length);
  });
  it('the other motos never take the reserved place, nor the player’s moto’s', () => {
    expect(lotOrder(lot)).not.toContain(lot.reserved);
    expect(lotOrder(lot)).toEqual(lotOrder(lot));                                                        // the same evening fills the same way
    const all = lotTaken(lot, 99, null);
    expect(all.length).toBe(lot.slots.length - 1);
    const mine = lot.slots[all[0]], some = lotTaken(lot, 99, mine);
    expect(some).not.toContain(all[0]);
    for (const i of some) expect(Math.hypot(lot.slots[i].x - mine.x, lot.slots[i].z - mine.z)).toBeGreaterThan(0.5);
    expect(lotTaken(lot, 3, null)).toEqual(all.slice(0, 3));
  });
  it('the fee is paid once per evening (the save counter holds the day)', () => {
    expect(MOTO_FEE).toBe(100);
    expect(paidTonight({}, 12)).toBe(false);
    expect(paidTonight({ [MOTO_FEE_COUNTER]: 12 }, 12)).toBe(true);
    expect(paidTonight({ [MOTO_FEE_COUNTER]: 11 }, 12)).toBe(false);
  });
  it('the gardien speaks lexicon Wolof with its gloss, the price before paying, and says goodbye', () => {
    unknownPhrases.clear();
    const g = (s: string) => glossed(s, true).replace(/[  ]/g, ' ');
    const hello = g(MOTO_GUARD.hello(MOTO_FEE)), paid = g(MOTO_GUARD.paid(MOTO_FEE)), again = g(MOTO_GUARD.again()), bye = g(MOTO_GUARD.bye());
    expect([...unknownPhrases]).toEqual([]);
    expect(hello).toBe('Le gardien : « Na nga def ? » (comment ça va ?) · Parking motos : 100 F la soirée, payés une fois.');
    expect(paid).toMatch(/^Le gardien : « 100 F, jërëjëf ! Amul solo\. » \(merci · pas de souci\)/);
    expect(again).toMatch(/« Dalal ak jàmm ! » \(bienvenue\)/);
    expect(bye).toBe('Le gardien : « Ñibbil ak jàmm ! Ba beneen yoon ! » (rentre bien · à la prochaine) · Il te fait signe de la main.');
  });
  it('facing the gardien while his fee is due, he has the focus, not the moto beside him; once paid, the moto first', () => {
    // the moto's target sits on its body's nearest edge (src/transport/ownedModule.ts), the gardien's on him
    const motoAt = (m: { x: number; z: number }, me: { x: number; z: number }): Target => ({
      id: 'moto:parked', name: 'Ta moto Jakarta', kind: 'vehicle', space: 'street', radius: 1.8, bias: -0.2, affordances: () => [],
      x: m.x + Math.max(-HALF_W, Math.min(HALF_W, me.x - m.x)), z: m.z + Math.max(-HALF_LEN, Math.min(HALF_LEN, me.z - m.z)),
    });
    const gardien = (due: boolean): Target => ({ id: 'gardien', name: 'Le gardien de motos', kind: 'person', space: 'street', x: lot.gardien.x, z: lot.gardien.z, radius: 2.6, bias: gardienBias(due), affordances: () => [] });
    const s = lot.slots[lot.reserved];
    // just off the moto (ridden in nose to the wall, short of its place), 1.3 m in front of him, facing him
    const me = { x: lot.gardien.x, z: lot.gardien.z - 1.3 }, moto = { x: s.x, z: s.z - 1.4 };
    for (const dz of [0, 0.4, 0.9]) {
      const m = { x: moto.x, z: moto.z + dz };
      expect(pickTarget([motoAt(m, me), gardien(true)], 'street', me.x, me.z, 0)?.id).toBe('gardien');
      expect(pickTarget([motoAt(m, me), gardien(false)], 'street', me.x, me.z, 0)?.id).toBe('moto:parked');   // without the rule
    }
    // after the gala, paid: beside the moto in its place, to ride away
    const by = { x: s.x - 1.0, z: s.z - 0.6 };
    expect(pickTarget([motoAt(s, by), gardien(false)], 'street', by.x, by.z, 0)?.id).toBe('moto:parked');
    // fee due but facing the moto right beside it: the moto
    const side = { x: s.x - HALF_W - 0.5, z: s.z };
    expect(pickTarget([motoAt(s, side), gardien(true)], 'street', side.x, side.z, Math.PI / 2)?.id).toBe('moto:parked');
  });
});

describe('getting there: the goal line names the moto, the car rapide carries fans', () => {
  const base: EveningInput = { hour: 17.5, galaDone: false, ticket: false, welcome: false, gate: { dist: 300, inside: false }, afterDone: false };
  it('far away with one’s own moto here: take the moto; riding: the guarded parking; else the car rapide or a walk', () => {
    expect(eveningGoal({ ...base, moto: 'parked' })).toEqual({ kind: 'arena', how: 'moto' });
    expect(eveningGoal({ ...base, moto: 'riding' })).toEqual({ kind: 'arena', how: 'park' });
    expect(eveningGoal({ ...base, gate: { dist: 40, inside: false }, moto: 'riding' })).toEqual({ kind: 'arena', how: 'park' });
    expect(eveningGoal({ ...base, moto: null })).toEqual({ kind: 'arena', how: 'ride' });
    expect(eveningGoal(base)).toEqual({ kind: 'arena', how: 'ride' });
    expect(eveningGoal({ ...base, gate: { dist: 40, inside: false }, moto: 'parked' })).toEqual({ kind: 'arena', how: 'walk' });
    expect(eveningGoal({ ...base, gate: { dist: 20, inside: false }, moto: 'parked' })).toEqual({ kind: 'ticket' });   // parked by the gate: the window
    expect(eveningGoal({ ...base, ticket: true, moto: 'parked' })).toEqual({ kind: 'arena', how: 'moto' });   // ticket in hand, still far
    expect(eveningGoal({ ...base, ticket: true, gate: { dist: 40, inside: false }, moto: 'parked' })).toEqual({ kind: 'enter' });
    expect(eveningGoal({ ...base, gate: { dist: 30, inside: true }, ticket: true, moto: 'parked' })).toEqual({ kind: 'seat' });
    expect(goalText({ kind: 'arena', how: 'moto' })).toMatch(/prends ta moto/);
    expect(goalText({ kind: 'arena', how: 'park' })).toMatch(/parking motos gardé.*100/);
  });
  it('fans ride while the arena is set up and its doors are open, in both écuries’ colours', () => {
    expect(fansRide('setup')).toBe(true); expect(fansRide('doors')).toBe(true);
    expect(fansRide('after')).toBe(false); expect(fansRide('quiet')).toBe(false);
    for (const e of ECURIES) expect(FAN_COLOURS).toContain(e.colour);
    expect(FAN_COLOURS.some(c => c < 0)).toBe(true);                                                     // a few in their own clothes
  });
  it('fans aboard ride to « Arène » and get off there, even if the street leaves its doors phase during the ride', () => {
    const F: LineFans = { colours: FAN_COLOURS, dest: 'arene' };
    // aboard from « Marché »: the line's fans get on at every stop but theirs
    let car = fansOnSet(null, F, 'marche');
    expect(car).toBe(F);
    expect(fansAtStop(car, F, 'rue10')).toEqual({ off: false, aboard: F });
    // the street turns (after the gala, a slow phone's clock): no more fans get on, those aboard ride on…
    car = fansOnSet(car, null, null);
    expect(car).toBe(F);
    const gare = fansAtStop(car, null, 'gare');
    expect(gare).toEqual({ off: false, aboard: F });
    // …and get off at their stop, the car goes on without them
    expect(fansAtStop(gare.aboard, null, 'arene')).toEqual({ off: true, aboard: null });
    expect(fansAtStop(F, F, 'arene')).toEqual({ off: true, aboard: null });
    // a car standing at « Arène » when the fans start riding does not take them there; one without fans lets none off
    expect(fansOnSet(null, F, 'arene')).toBeNull();
    expect(fansAtStop(null, null, 'arene')).toEqual({ off: false, aboard: null });
    expect(fansAtStop(null, F, 'marche')).toEqual({ off: false, aboard: F });
  });
  it('the car rapide kit dresses its seated passengers in the given shirts (another cached model, same seats)', () => {
    const seated = ['b00', 'b01', 'b10', 'b11', 'b12'];
    const plain = buildVehicle('carRapide', { seed: 4, seated, lod: 'near' }), fans = buildVehicle('carRapide', { seed: 4, seated, colours: [0x1a7a44, 0xc8322a], lod: 'near' });
    const body = (g: THREE.Object3D) => (g.getObjectByName('body') as THREE.Mesh).geometry;
    expect(body(fans.group)).not.toBe(body(plain.group));
    expect(body(fans.group).attributes.position.count).toBe(body(plain.group).attributes.position.count);
    expect(fans.spec.occupied).toEqual(plain.spec.occupied);
    const again = buildVehicle('carRapide', { seed: 4, seated, colours: [0x1a7a44, 0xc8322a], lod: 'near' });
    expect(body(again.group)).toBe(body(fans.group));                                                    // cached: one more variant, not one per car
  });
});
