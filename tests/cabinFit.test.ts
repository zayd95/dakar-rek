import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { CAR_MODELS, vehicleSpec, type CarModelId } from '../src/actors/vehicleKit';
import { CABINS, CUSHION, FLOOR_GAP, KIT_SIDE, MIN_SCALE, ROOF_GAP, SITTERS, lookSitter, placeSitter, rowOf, scaleAt, type CabinRow, type SitterSize } from '../src/transport/cabinFit';
import { SIT_HIPS } from '../src/interact/seats';
import { VTC_LOOKS } from '../src/transport/vtcRules';
import { terangaSpec, rafetSpec, lamaneSpec, gaindeSpec } from '../src/transport/modelCars';
import { berlineSpec } from '../src/transport/premiumCars';
import { carSpec } from '../src/transport/car';
import { taxiSpec } from '../src/transport/taxi';
import { glbBody, kitBody, measureRow } from './helpers/cabinMeasure';

/** Each car the player drives (VehicleSpec id), the body the game draws for it, and the kit seat layout it is measured at. */
const BODIES: { id: string; body: () => Promise<THREE.Object3D> | THREE.Object3D; kind: 'sedan' | 'suv' | 'luxury' | 'taxi'; model?: CarModelId }[] = [
  { id: 'teranga', body: () => glbBody('teranga'), kind: 'sedan', model: 'teranga' },
  { id: 'rafet', body: () => glbBody('rafet'), kind: 'sedan', model: 'rafet' },
  { id: 'suv', body: () => glbBody('lamane'), kind: 'suv', model: 'lamane' },
  { id: 'gainde', body: () => glbBody('gainde'), kind: 'suv', model: 'gainde' },
  { id: 'car', body: () => glbBody('compacte'), kind: 'sedan' },
  { id: 'berline', body: () => kitBody('luxury', 3), kind: 'luxury' },
  { id: 'taxi', body: () => kitBody('taxi', 4), kind: 'taxi' },
];
const SPECS: Record<string, () => { seats: { id: string; y: number; clip?: string }[]; driver: { id: string; y: number; clip?: string } }> = {
  teranga: terangaSpec, rafet: rafetSpec, suv: lamaneSpec, gainde: gaindeSpec, car: carSpec, berline: berlineSpec, taxi: taxiSpec,
};
const seatsOf = (b: (typeof BODIES)[number]) => vehicleSpec(b.kind, { seed: 3, driver: false, passengers: false, ...(b.model ? { model: b.model } : {}) }).seats;

describe('cabin fit: the seat data are the bodies\' own (src/transport/cabinFit.ts CABINS)', () => {
  for (const b of BODIES) it(`${b.id}: roof over the head, floor under the shoes, as measured on the body the game draws`, async () => {
    const body = await b.body(), seats = seatsOf(b);
    for (const [row, id] of [['front', 'driver'], ['rear', 'rearR']] as const) {
      if (b.id === 'taxi' && row === 'rear') continue;                                    // nobody the game seats rides in a taxi's back
      const s = seats.find(x => x.id === id)!, m = measureRow(body, s.x, s.z, s.top + CUSHION), want = CABINS[b.id][row];
      expect(Math.abs(m.roof - want.roof), `${b.id} ${row} roof ${m.roof}`).toBeLessThan(0.012);
      const kit = b.id === 'berline' || b.id === 'taxi';                                   // no floor pan: the side's edge, less what stays out of sight
      expect(Math.abs(m.floor - (kit ? KIT_SIDE : 0) - want.floor), `${b.id} ${row} floor ${m.floor}`).toBeLessThan(0.012);
      if (row === 'front') expect(want.legroom).toBeLessThanOrEqual((m.ahead ?? 9) + 0.01);
    }
  }, 120000);
});

const BODY_KINDS: [string, SitterSize][] = [
  ['v4 (passers-by, VTC passengers)', SITTERS.v4], ['homme', SITTERS.meshy_m], ['femme', SITTERS.meshy_f],
  ...VTC_LOOKS.map((l, i): [string, SitterSize] => [`VTC passenger look ${i} (${l.style}${l.hat ? ', ' + l.hat : ''})`, lookSitter(l)]),
];
const fits = (row: CabinRow, p: { head: number; soles: number }) => p.head <= row.roof - ROOF_GAP + 1e-6 && p.soles >= row.floor + FLOOR_GAP - 0.012;

describe('cabin fit: nobody\'s head through the roof, nobody\'s shoes under the car', () => {
  it('a VTC passenger (any look) in the back of every car the ride can be done in', () => {
    for (const b of BODIES) {
      if (b.id === 'taxi') continue;
      const row = CABINS[b.id].rear, top = seatsOf(b).find(x => x.id === 'rearR')!.top;
      for (const [name, s] of BODY_KINDS) {
        const p = placeSitter(row, top, s);
        expect(fits(row, p), `${b.id} ${name}: ${JSON.stringify(p)}`).toBe(true);
        expect(p.scale, `${b.id} ${name}`).toBeGreaterThanOrEqual(MIN_SCALE);
        expect(s.knee * p.scale, `${b.id} ${name}: knees against the seat ahead`).toBeLessThanOrEqual(row.legroom + 0.02);
      }
    }
  });
  it('the player at the wheel of every car (and beside the taxi driver): v4, homme, femme, at the seat the spec gives', () => {
    for (const b of BODIES) {
      const spec = SPECS[b.id](), seat = b.id === 'taxi' ? spec.seats.find(x => x.id === 'front')! : spec.driver, row = rowOf(CABINS[b.id], seat.id);
      expect(seat.clip, `${b.id}: a car pose`).toBe(b.id === 'taxi' ? 'SitCar' : 'Drive');
      for (const [name, s] of BODY_KINDS.slice(0, 3)) {
        const p = scaleAt(row, seat.y - SIT_HIPS, s);
        expect(fits(row, p), `${b.id} ${name}: ${JSON.stringify(p)}`).toBe(true);
        expect(p.scale, `${b.id} ${name}`).toBeGreaterThanOrEqual(MIN_SCALE);
      }
    }
  });
  it('the looks\' sizes are the ones measured on the bodies in the Teranga\'s back (headwear over the hair, a robe\'s hem under the shoes)', () => {
    // vtc.fit() in the game, looks 0 to 5 (src/transport/vtcRules.ts VTC_LOOKS): the head over the hips, the lowest point under them
    const measured = [[0.836, 0.277], [0.892, 0.291], [0.833, 0.432], [0.854, 0.263], [0.836, 0.277], [0.892, 0.291]];
    VTC_LOOKS.forEach((l, i) => { const s = lookSitter(l); expect(Math.abs(s.up - measured[i][0]), `look ${i} up ${s.up}`).toBeLessThan(0.012); expect(Math.abs(s.down - measured[i][1]), `look ${i} down ${s.down}`).toBeLessThan(0.012); });
  });
  it('a body that fits as it is keeps its size and sits on the cushion; only a low roof makes it smaller, by as little as it takes', () => {
    const tall: CabinRow = { roof: 2.2, floor: 0.2, legroom: 1 };
    expect(placeSitter(tall, 0.7, SITTERS.v4)).toMatchObject({ scale: 1, hips: 0.7 + CUSHION });
    const low: CabinRow = { roof: 1.3, floor: 0.2, legroom: 1 }, p = placeSitter(low, 0.5, SITTERS.meshy_m);
    expect(p.scale).toBeLessThan(1);
    expect(p.head).toBeCloseTo(low.roof - ROOF_GAP, 3); expect(p.soles).toBeCloseTo(low.floor + FLOOR_GAP, 3);
  });
  it('the passenger seats of the cars are held in the car pose (SitCar), the driver\'s in Drive', () => {
    for (const id of ['teranga', 'rafet', 'suv', 'gainde', 'car', 'berline']) {
      const s = SPECS[id]();
      expect(s.driver.clip).toBe('Drive');
      expect(s.seats.every(x => x.clip === 'SitCar'), id).toBe(true);
    }
  });
  it('every authored body has its row measured (no car left on the old chair pose)', () => {
    for (const m of Object.keys(CAR_MODELS)) expect(CABINS[m === 'lamane' ? 'suv' : m], m).toBeTruthy();
  });
});
