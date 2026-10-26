import { describe, expect, it } from 'vitest';
import { BAYS, GATE, LOT, POOL, onLot } from '../src/housing/villa';
import { GATE_FREE, GATE_REACH, GATE_SECONDS, gateFor, gateWants, inOpening, insideWalls, stepGate, toPlan } from '../src/villa/gate';
import { BAYS_HUB, BAY_SLOW, freeBay, inYard, parkWhy } from '../src/villa/bays';
import { EDGE_REACH, LOOP, SWIM_GAINS, SWIM_LEAN, SWIM_SECONDS, WATER_Y, atEdge, bodyOrigin, exitPoint, maySwim, nearestOnLoop, poolDistance, swimGains, swimPose } from '../src/villa/swim';
import { BUFFET, RECEPTION, RECEPTION_ANCHORS, cityHours, guestSpots, receptionLeft, receptionOn, receptionWhy } from '../src/villa/reception';
import { VILLA_PLACE, daysFor, villaGoalLine, villaPath, villaPlausible, type VillaGoalFacts } from '../src/villa/goal';
import { pistes, type PisteFacts } from '../src/economy/pistes';

/** LD2.0-D lane V-E: the villa's life — the gate's rule, the bays, the swim, the reception, the savings goal (pure rules). */
const gx = (GATE.x0 + GATE.x1) / 2;

describe('the gate', () => {
  it('opens for the villa\'s people only: its owner, its renter, a guest whose invitation was accepted', () => {
    expect(gateFor('owned', false)).toBe(true); expect(gateFor('rented', false)).toBe(true); expect(gateFor(null, true)).toBe(true);
    expect(gateFor(null, false)).toBe(false);
  });
  it('slides open as they come near from the street, on foot or at the wheel (sooner), never for the others', () => {
    const at = (dz: number, o: Partial<{ driving: boolean; allowed: boolean; dx: number }> = {}) => gateWants({ px: gx + (o.dx ?? 0), pz: GATE.z + dz, driving: !!o.driving, allowed: o.allowed ?? true }, 0);
    expect(at(GATE_REACH.street - 0.2)).toBe(true);
    expect(at(GATE_REACH.street + 0.3)).toBe(false);
    expect(at(GATE_REACH.street + 1, { driving: true })).toBe(true);
    expect(at(GATE_REACH.streetDriving + 0.5, { driving: true })).toBe(false);
    for (const dz of [0.6, 2, 5]) { expect(at(dz, { allowed: false })).toBe(false); expect(at(dz, { allowed: false, driving: true })).toBe(false); }
    // a stranger standing right against the shut gate opens nothing
    expect(gateWants({ px: gx, pz: GATE.z + 0.45, driving: false, allowed: false }, 0)).toBe(false);
  });
  it('lets anyone inside the walls out (nobody is shut in), and shuts behind those who walk on to the house', () => {
    const inside = (dz: number, driving = false) => gateWants({ px: gx, pz: GATE.z - dz, driving, allowed: false }, 0);
    expect(insideWalls(gx, GATE.z - 2)).toBe(true); expect(insideWalls(gx, GATE.z + 1)).toBe(false);
    expect(inside(GATE_REACH.yard - 0.2)).toBe(true);
    expect(inside(GATE_REACH.yard + 0.5)).toBe(false);                                     // walking on to the front door: shut behind
    expect(inside(GATE_REACH.yardDriving - 0.3, true)).toBe(true);                        // a car in the yard needs it open sooner
    expect(gateWants({ px: -3, pz: 5, driving: false, allowed: true }, 1)).toBe(false);   // at the front door, even its owner: shut
  });
  it('never shuts on someone in its opening, once it is moving', () => {
    expect(inOpening(gx, GATE.z)).toBe(true); expect(inOpening(gx, GATE.z + 3)).toBe(false);
    expect(gateWants({ px: gx, pz: GATE.z - 0.2, driving: false, allowed: false }, 0.4)).toBe(true);
    expect(gateWants({ px: gx + 1, pz: GATE.z + 0.8, driving: true, allowed: true }, 0.9)).toBe(true);
  });
  it('slides in GATE_SECONDS each way, and frees the way only when (nearly) fully open', () => {
    let k = 0; for (let i = 0; i < 60; i++) k = stepGate(k, true, GATE_SECONDS / 60);
    expect(k).toBeCloseTo(1, 6);
    expect(stepGate(0.5, false, GATE_SECONDS / 2)).toBe(0);
    expect(stepGate(0, false, 1)).toBe(0); expect(stepGate(1, true, 1)).toBe(1);
    expect(GATE_FREE).toBeGreaterThan(0.9); expect(GATE_FREE).toBeLessThan(1);
  });
  it('reads the hub in the lot\'s plan coordinates', () => {
    const p = onLot(gx, GATE.z); expect(toPlan(p.x, p.z)).toEqual({ x: gx, z: GATE.z });
    expect(toPlan(LOT.cx, LOT.cz)).toEqual({ x: 0, z: 0 });
  });
});

describe('the bays', () => {
  it('are the contract\'s, in the hub, the cars facing the house', () => {
    expect(BAYS_HUB.map(b => [b.x, b.z, b.yaw])).toEqual(BAYS.map(b => [LOT.cx + b.x, LOT.cz + b.z, Math.PI]));
    for (const b of BAYS_HUB) expect(inYard(b.x, b.z)).toBe(true);
    expect(inYard(LOT.cx + gx, LOT.cz + GATE.z + 2)).toBe(false);                        // the pavement is not the yard
    expect(inYard(LOT.cx, LOT.cz - 8)).toBe(false);                                      // nor the back garden
  });
  it('the vehicle goes to the free bay nearest to it; a bay is taken only by another of the player\'s own vehicles', () => {
    const [b1, b2] = BAYS_HUB;
    expect(freeBay(b1.x - 0.5, b1.z + 2, [])).toEqual(b1);
    expect(freeBay(b2.x + 0.3, b2.z, [])).toEqual(b2);
    expect(freeBay(b1.x, b1.z, [{ x: b1.x + 0.3, z: b1.z - 0.2 }])).toEqual(b2);         // his moto in bay 1: bay 2
    expect(freeBay(b1.x, b1.z, [{ x: b1.x, z: b1.z }, { x: b2.x, z: b2.z }])).toBeNull();
    expect(freeBay(b1.x, b1.z, [{ x: b1.x + 5, z: b1.z + 9 }])).toEqual(b1);              // parked in the street: takes nothing
  });
  it('« Garer à la villa »: for its owner or renter, at the wheel of their own vehicle, in the yard, nearly stopped', () => {
    const bay = BAYS_HUB[0];
    expect(parkWhy({ hold: 'owned', own: true, inYard: true, speed: 0.5, bay })).toBeNull();
    expect(parkWhy({ hold: 'rented', own: true, inYard: true, speed: 0, bay })).toBeNull();
    expect(parkWhy({ hold: null, own: true, inYard: true, speed: 0, bay })).toBeUndefined();          // not his villa: not offered
    expect(parkWhy({ hold: 'owned', own: false, inYard: true, speed: 0, bay })).toBeUndefined();      // a dealer's car on trial: not offered
    expect(parkWhy({ hold: 'owned', own: true, inYard: false, speed: 0, bay })).toBeUndefined();      // in the street: not offered
    expect(parkWhy({ hold: 'owned', own: true, inYard: true, speed: BAY_SLOW + 1, bay })).toBe('Ralentis d’abord');
    expect(parkWhy({ hold: 'owned', own: true, inYard: true, speed: 0, bay: null })).toBe('Les deux places sont prises');
  });
});

describe('the swim', () => {
  it('is offered at the edge, on the deck, to the villa\'s owner or renter in their own villa', () => {
    expect(poolDistance((POOL.x0 + POOL.x1) / 2, (POOL.z0 + POOL.z1) / 2)).toBe(0);
    expect(atEdge(0, POOL.z1 + 0.5)).toBe(true); expect(atEdge(0, POOL.z1 + EDGE_REACH + 0.2)).toBe(false); expect(atEdge(0, POOL.z1 - 0.5)).toBe(false);
    expect(atEdge(POOL.x0 - 1, POOL.z0 - 0.5)).toBe(true);
    expect(maySwim('owned', true)).toBe(true); expect(maySwim('rented', true)).toBe(true);
    expect(maySwim(null, true)).toBe(false); expect(maySwim('owned', false)).toBe(false);
  });
  it('goes round a closed loop inside the pool, a metre from its walls, heading along it', () => {
    for (let s = 0; s < LOOP; s += 0.25) {
      const p = swimPose(s), q = swimPose(s + 0.05);
      expect(p.x).toBeGreaterThan(POOL.x0 + 0.9); expect(p.x).toBeLessThan(POOL.x1 - 0.9);
      expect(p.z).toBeGreaterThan(POOL.z0 + 0.9); expect(p.z).toBeLessThan(POOL.z1 - 0.9);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(0.06);                       // continuous
      const head = Math.atan2(q.x - p.x, q.z - p.z);
      expect(Math.abs(Math.atan2(Math.sin(head - p.yaw), Math.cos(head - p.yaw)))).toBeLessThan(0.15);
    }
    const a = swimPose(0), b = swimPose(LOOP);
    expect(b.x).toBeCloseTo(a.x, 6); expect(b.z).toBeCloseTo(a.z, 6);
    const n = nearestOnLoop(0, POOL.z1 + 0.5), p = swimPose(n);
    expect(Math.abs(p.z - (POOL.z1 - 1.05))).toBeLessThan(0.05);                        // from the near edge, the near straight
  });
  it('holds the swimmer in the water up to the shoulders, leaning into the stroke', () => {
    const o = bodyOrigin(0, -7.8, Math.PI / 2);
    expect(o.y + Math.cos(SWIM_LEAN) * 1.36).toBeCloseTo(WATER_Y, 6);                      // the shoulders at the water line
    expect(o.y).toBeLessThan(WATER_Y - 0.3); expect(o.y).toBeGreaterThan(-POOL.depth);   // feet under water, off the bottom
    expect(o.x).toBeLessThan(0);                                                          // trailing behind the chest
    expect(SWIM_LEAN).toBeGreaterThan(0.9); expect(SWIM_LEAN).toBeLessThan(1.4);
  });
  it('climbs out at the nearest edge, on the deck; hygiene and moral up in proportion to the time in the water', () => {
    const e = exitPoint(0, POOL.z1 - 0.3);
    expect(e.z).toBeGreaterThan(POOL.z1); expect(poolDistance(e.x, e.z)).toBeGreaterThan(0.3); expect(atEdge(e.x, e.z)).toBe(true);
    const w = exitPoint(POOL.x0 + 0.4, -7.8); expect(w.x).toBeLessThan(POOL.x0);
    expect(swimGains(SWIM_SECONDS)).toEqual({ hygiene: SWIM_GAINS.hygiene, moral: SWIM_GAINS.moral, energie: SWIM_GAINS.energie });
    expect(swimGains(SWIM_SECONDS * 3)).toEqual(swimGains(SWIM_SECONDS));
    expect(swimGains(1).hygiene).toBe(Math.round(SWIM_GAINS.hygiene / 4));
    expect(swimGains(SWIM_SECONDS / 2).moral).toBe(Math.round(SWIM_GAINS.moral / 2));
    expect(SWIM_SECONDS).toBeGreaterThanOrEqual(18); expect(SWIM_SECONDS).toBeLessThanOrEqual(25);
  });
});

describe('the small reception', () => {
  const f = (o: Partial<Parameters<typeof receptionWhy>[0]> = {}) => receptionWhy({ hold: 'owned', own: true, wallet: 1_000_000, day: 12, lastDay: undefined, running: false, ...o });
  it('is the villa\'s, at its price (150 000 F), once a city day', () => {
    expect(RECEPTION.price).toBe(150_000); expect(RECEPTION.guests).toBe(8); expect(RECEPTION.hours).toBe(2);
    expect([...RECEPTION.menu]).toEqual(['ceebu jën', 'bissap', 'thiakry']);
    expect(f()).toBeNull(); expect(f({ hold: 'rented' })).toBeNull();
    expect(f({ hold: null })).toBeUndefined(); expect(f({ own: false })).toBeUndefined();
    expect(f({ lastDay: 12 })).toBe('Une réception par jour · reviens demain'); expect(f({ lastDay: 11 })).toBeNull();
    expect(f({ wallet: 149_999 })).toBe('Pas assez d’argent');
    expect(f({ running: true })).toBe('La réception bat son plein');
  });
  it('lasts two city hours and ends by itself, across midnight too', () => {
    const at = cityHours(12, 23.2);
    expect(receptionOn(at, at + 0.1)).toBe(true); expect(receptionOn(at, at + 1.99)).toBe(true);
    expect(receptionOn(at, at + 2)).toBe(false); expect(receptionOn(at, cityHours(13, 0.5))).toBe(true); expect(receptionOn(at, cityHours(13, 1.3))).toBe(false);
    expect(receptionLeft(at, at + 0.5)).toBeCloseTo(1.5, 6);
    expect(receptionOn(undefined, at)).toBe(false); expect(receptionOn(-1, at)).toBe(false);
  });
  it('about eight guests on the terrace (or in the salon of the open-plan house): two groups chatting face to face, two dancing', () => {
    for (const where of ['terrasse', 'salon'] as const) {
      const g = guestSpots(where);
      expect(g).toHaveLength(RECEPTION.guests);
      expect(g.filter(p => p.mood === 'chat')).toHaveLength(6); expect(g.filter(p => p.mood === 'dance')).toHaveLength(2);
      expect(new Set(g.map(p => p.id)).size).toBe(8);
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) expect(Math.hypot(g[i].x - g[j].x, g[i].z - g[j].z)).toBeGreaterThan(0.6);
      if (where === 'terrasse') for (const p of g) { expect(p.z).toBeLessThan(-5.2); expect(poolDistance(p.x, p.z)).toBeGreaterThan(0.6); }   // on the deck, never in the pool
      const B = BUFFET[where]; for (const p of g) expect(Math.hypot(p.x - B.x, p.z - B.z)).toBeGreaterThan(1.2);
    }
    expect(RECEPTION_ANCHORS.terrasse.z).toBeLessThan(-5); expect(poolDistance(RECEPTION_ANCHORS.terrasse.x, RECEPTION_ANCHORS.terrasse.z)).toBeGreaterThan(1);
  });
});

describe('the way to the villa for every player', () => {
  const f = (o: Partial<VillaGoalFacts> = {}): VillaGoalFacts => ({ price: 400_000_000, rent: 120_000, held: false, income: 0, ventures: {}, cash: 0, worth: 0, ...o });
  it('is a plausible next step once the player owns a restaurant or an immeuble, or earns or is worth enough; never once held', () => {
    expect(villaPlausible(f())).toBe(false);
    expect(villaPlausible(f({ ventures: { boutique: 2, car_rapide: 1 }, income: 80_000 }))).toBe(false);
    expect(villaPlausible(f({ ventures: { restaurant: 1 } }))).toBe(true);
    expect(villaPlausible(f({ ventures: { immeuble: 1 } }))).toBe(true);
    expect(villaPlausible(f({ income: 250_000 }))).toBe(true);
    expect(villaPlausible(f({ worth: 45_000_000 }))).toBe(true);
    expect(villaPlausible(f({ ventures: { restaurant: 1 }, held: true }))).toBe(false);
  });
  it('says the price, what is missing and how long at the player\'s pace', () => {
    expect(daysFor(240_000_000, 1_000_000)).toBe(10); expect(daysFor(1, 1)).toBe(1); expect(daysFor(5, 0)).toBeNull();
    const line = villaGoalLine(f({ income: 1_000_000, cash: 160_000_000, ventures: { immeuble: 1 } }));
    expect(line).toMatch(/400\s000\s000 F/); expect(line).toMatch(/120\s000 F/); expect(line).toMatch(/240\s000\s000 F/); expect(line).toMatch(/10 jours de ville/); expect(line).toMatch(/Banque Teranga/);
    expect(villaGoalLine(f({ cash: 400_000_000 }))).toMatch(/de quoi/);
  });
  it('the sheet: the next rung of the ladder, then the savings', () => {
    expect(villaPath(f({ held: true }))).toEqual([]);
    expect(villaPath(f())[0]).toMatch(/bana-bana/);
    expect(villaPath(f({ ventures: { car_rapide: 1 } }))[0]).toMatch(/restaurant/);
    const p = villaPath(f({ ventures: { restaurant: 1 }, income: 245_000, cash: 10_000_000 }));
    expect(p[0]).toMatch(/Il te manque 390\s000\s000 F/); expect(p.at(-1)).toMatch(/120\s000 F par jour/);
  });
  it('appears in « Mes pistes » as a savings goal leading to the villa\'s gate, only when plausible', () => {
    const base: PisteFacts = {
      hub: 'pikine', hour: 11, wallet: 3000, savings: 0, deliveries: 0, vtcTrips: 0, cars: 1, sarr: null, bank: null, ventures: 4, bana: null,
      furniture: 5, cheapestFurniture: 2500, furnitureShop: null, needs: { social: 60, moral: 70 }, square: null, variety: [],
    };
    expect(pistes(base).map(p => p.id)).not.toContain('villa_goal');
    expect(pistes({ ...base, villa: f() }).map(p => p.id)).not.toContain('villa_goal');
    const p = pistes({ ...base, villa: f({ ventures: { restaurant: 1 }, income: 300_000, cash: 50_000_000 }) }).find(x => x.id === 'villa_goal')!;
    expect(p).toMatchObject({ icon: '🏡', afterWork: false, go: { place: VILLA_PLACE } });
    expect(VILLA_PLACE.id).toBe('almadies:city:villa');
    // the key moves with the savings: dismissed, it comes back once the player is a tenth closer
    const q = pistes({ ...base, villa: f({ ventures: { restaurant: 1 }, income: 300_000, cash: 95_000_000 }) }).find(x => x.id === 'villa_goal')!;
    expect(q.key).not.toBe(p.key);
    expect(pistes({ ...base, villa: f({ ventures: { restaurant: 1 }, held: true }) }).map(x => x.id)).not.toContain('villa_goal');
  });
});
