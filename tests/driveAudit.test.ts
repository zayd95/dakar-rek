import { describe, expect, it } from 'vitest';
import { carSpec } from '../src/transport/car';
import { berlineSpec } from '../src/transport/premiumCars';
import { gaindeSpec, lamaneSpec, rafetSpec, terangaSpec } from '../src/transport/modelCars';
import { motoSpec } from '../src/transport/moto';
import { audit, type Audit } from './helpers/driveAudit';

/** Every vehicle the player controls (all through src/transport/ownedModule.ts; the Tiak Tiak loaner rides as the Jakarta does: the same spec). */
const FLEET = [
  ['Jakarta', motoSpec, true], ['Teranga', terangaSpec, false], ['Rafet', rafetSpec, false], ['Berline moderne', carSpec, false],
  ['Berline neuve', berlineSpec, false], ['Gaïndé', gaindeSpec, false], ['Lamane Sport', lamaneSpec, false],
] as const;
const A = new Map<string, Audit>(FLEET.map(([name, spec, moto]) => [name, audit(spec().drive!, moto)]));

describe('the measured audit of every controllable vehicle (docs/DRIVING_FEEL.md)', () => {
  it('prints the table (VITE_AUDIT=1 npx vitest run tests/driveAudit.test.ts)', () => {
    if ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AUDIT) { console.log(JSON.stringify(Object.fromEntries(A), null, 1)); console.table(Object.fromEntries(A)); }
    expect(A.size).toBe(FLEET.length);
  });
});

const of = (n: string) => A.get(n)!, CARS = FLEET.filter(f => !f[2]).map(f => f[0]);

describe('driving is responsive (the owner: « faster and more enjoyable, more responsive »)', () => {
  it('pickup: every car is at 50 km/h in under 3 s and at its cruising speed in under 5 (it took 3.3–4 s and 4.8–5.7 s); the motorbike in under 2 and 3', () => {
    for (const c of CARS) { expect(of(c).to50, c).toBeLessThan(3); expect(of(c).toCruise, c).toBeLessThan(5); }
    expect(of('Jakarta').to50).toBeLessThan(2); expect(of('Jakarta').toCruise).toBeLessThan(3);
  });
  it('the practical cruise is 77–86 km/h for the cars (it was 68–76), 72 for the motorbike (63); the top stays about 200 km/h at most: the road streams 340 m ahead, six seconds at that speed', () => {
    for (const c of CARS) { expect(of(c).cruiseKmh, c).toBeGreaterThanOrEqual(77); expect(of(c).cruiseKmh, c).toBeLessThanOrEqual(86); expect(of(c).topKmh, c).toBeLessThanOrEqual(202); }
    expect(of('Jakarta').cruiseKmh).toBe(72);
  });
  it('brakes: from 100 km/h every vehicle stops in under 40 m (it took 47–54 m), from its cruising speed in under 25 m', () => {
    for (const [name] of FLEET) { expect(of(name).brake100, name).toBeLessThan(40); expect(of(name).brakeCruise, name).toBeLessThan(25); }
  });
  it('the wheel answers the thumb: full lock in about half a second at a standstill (0.75–0.95 s before), and still within about a second at the cruising speed (1.3–1.6 s before)', () => {
    for (const c of CARS) { expect(of(c).lock0, c).toBeLessThanOrEqual(0.55); expect(of(c).lockCruise, c).toBeLessThanOrEqual(1.05); expect(of(c).lockCruise, c).toBeGreaterThan(of(c).lock0 * 1.5); }   // calmer at speed, on purpose
    expect(of('Jakarta').lock0).toBeLessThanOrEqual(0.32);
  });
  it('low speed: the city cars turn round between the walls of a street (14 m, src/world/builder.ts ROAD) in one sweep, with room; every car backs 3 m in under 2 s', () => {
    for (const c of ['Teranga', 'Rafet', 'Berline moderne']) expect(of(c).uTurn, c).toBeLessThan(11.5);
    for (const c of CARS) { expect(of(c).uTurn, c).toBeLessThan(13.5); expect(of(c).back3, c).toBeLessThan(2); }
    expect(of('Jakarta').uTurn).toBeLessThan(6);
  });
  it('recovery: a wall met square on is backed away from in under 2 s by a car; a glancing touch leaves at least 85 % of the speed (it left 1 %)', () => {
    for (const c of CARS) expect(of(c).unwedge, c).toBeLessThan(2);
    for (const [name] of FLEET) expect(of(name).glanceKeep, name).toBeGreaterThan(0.85);
  });
});

describe('each vehicle keeps its own character (never one multiplier for all)', () => {
  it('the motorbike is the quickest off the line and the tightest, and the slowest at the top', () => {
    for (const c of CARS) { expect(of('Jakarta').to50, c).toBeLessThan(of(c).to50); expect(of('Jakarta').radiusLow).toBeLessThan(of(c).radiusLow * 0.65); expect(of('Jakarta').topKmh).toBeLessThan(of(c).topKmh); expect(of('Jakarta').lock0).toBeLessThan(of(c).lock0); }
  });
  it('the Rafet is the sporty one: the best pickup, brakes, grip and the most direct wheel of the cars', () => {
    for (const c of CARS.filter(c => c !== 'Rafet')) {
      expect(of('Rafet').to50, c).toBeLessThan(of(c).to50); expect(of('Rafet').to100, c).toBeLessThan(of(c).to100); expect(of('Rafet').brake100, c).toBeLessThan(of(c).brake100);
      expect(of('Rafet').lock0, c).toBeLessThan(of(c).lock0); expect(rafetSpec().drive!.grip!).toBeGreaterThan(FLEET.find(f => f[0] === c)![1]().drive!.grip!);
    }
  });
  it('the Teranga is the nimble one: the tightest circle of the cars', () => {
    for (const c of CARS.filter(c => c !== 'Teranga')) expect(of('Teranga').radiusLow, c).toBeLessThan(of(c).radiusLow);
  });
  it('the grand saloon has the highest top speed; the Lamane Sport is the heaviest: the slowest to launch, to stop and to turn, with the calmest wheel', () => {
    for (const c of CARS.filter(c => c !== 'Berline neuve')) expect(of('Berline neuve').topKmh, c).toBeGreaterThan(of(c).topKmh);
    for (const c of CARS.filter(c => c !== 'Lamane Sport')) {
      expect(of('Lamane Sport').to50, c).toBeGreaterThan(of(c).to50); expect(of('Lamane Sport').brake100, c).toBeGreaterThan(of(c).brake100);
      expect(of('Lamane Sport').radiusLow, c).toBeGreaterThan(of(c).radiusLow); expect(of('Lamane Sport').lock0, c).toBeGreaterThan(of(c).lock0);
    }
  });
  it('the gains are not one factor: the pickup, the brakes and the circle changed by different amounts from one vehicle to the next', () => {
    // 0 → 50 km/h before this tuning (measured the same way on the previous numbers: docs/DRIVING_FEEL.md)
    const before: Record<string, { to50: number; radiusLow: number }> = { Jakarta: { to50: 3, radiusLow: 3.2 }, Teranga: { to50: 3.6, radiusLow: 5.2 }, Rafet: { to50: 3.3, radiusLow: 5.3 }, 'Berline moderne': { to50: 3.8, radiusLow: 5.6 }, 'Berline neuve': { to50: 3.2, radiusLow: 6 }, 'Gaïndé': { to50: 3.4, radiusLow: 6.1 }, 'Lamane Sport': { to50: 4, radiusLow: 6.3 } };
    const gain = FLEET.map(([n]) => before[n].to50 / of(n).to50), circle = FLEET.map(([n]) => before[n].radiusLow / of(n).radiusLow);
    expect(Math.max(...gain) - Math.min(...gain)).toBeGreaterThan(0.15); expect(Math.max(...circle) - Math.min(...circle)).toBeGreaterThan(0.1);
    for (const g of gain) expect(g).toBeGreaterThan(1.3);                                    // and every one of them is clearly quicker
  });
});
