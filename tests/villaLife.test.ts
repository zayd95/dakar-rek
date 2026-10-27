import { describe, expect, it } from 'vitest';
import { BAYS, GATE, LOT, POOL, onLot } from '../src/housing/villa';
import { GATE_FREE, GATE_REACH, GATE_SECONDS, gateFor, gateWants, inOpening, insideWalls, stepGate, toPlan } from '../src/villa/gate';
import { BAYS_HUB, BAY_SLOW, freeBay, inYard, parkWhy } from '../src/villa/bays';
import {
  CLIMB_REACH, DECK_OUT, DECK_Y, EDGE_REACH, STEPS, STEP_RISE, STICK_DEAD, STROKE_LENGTH, STROKE_RATE, SWIM_AREA, SWIM_FULL, SWIM_GAINS, SWIM_PACE, SWIM_SECONDS, TURN_RATE, WATER_Y,
  atEdge, bodyBox, byWall, entryFor, exitPoint, footprint, freeDeck, holdIn, maySwim, nearestWall, poolDistance, stepSwimmer, stepsY, stepsZ, strokeRate, swimGains, swimPace,
  wantsStepsIn, wantsStepsOut, type Swimmer,
} from '../src/villa/swim';
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
  const swimmer = (x: number, z: number, yaw = 0, mode: Swimmer['mode'] = 'tread'): Swimmer => ({ x, z, yaw, vx: 0, vz: 0, lean: mode === 'swim' ? 1 : 0, mode });
  /** Swims `seconds` with the stick held toward (dx, dz) at `pace`, 60 steps a second; every footprint on the way. */
  const swimFor = (s: Swimmer, dx: number, dz: number, pace: number, seconds: number, each?: (s: Swimmer) => void) => {
    for (let i = 0; i < seconds * 60; i++) { stepSwimmer(s, dx, dz, pace, 1 / 60); each?.(s); }
    return s;
  };
  const inside = (b: { x0: number; x1: number; z0: number; z1: number }, a: { x0: number; x1: number; z0: number; z1: number }, eps = 1e-6) =>
    b.x0 >= a.x0 - eps && b.x1 <= a.x1 + eps && b.z0 >= a.z0 - eps && b.z1 <= a.z1 + eps;

  it('is offered at the edge, on the deck, to the villa\'s owner or renter in their own villa', () => {
    expect(poolDistance((POOL.x0 + POOL.x1) / 2, (POOL.z0 + POOL.z1) / 2)).toBe(0);
    expect(atEdge(0, POOL.z1 + 0.5)).toBe(true); expect(atEdge(0, POOL.z1 + EDGE_REACH + 0.2)).toBe(false); expect(atEdge(0, POOL.z1 - 0.5)).toBe(false);
    expect(atEdge(POOL.x0 - 1, POOL.z0 - 0.5)).toBe(true);
    expect(maySwim('owned', true)).toBe(true); expect(maySwim('rented', true)).toBe(true);
    expect(maySwim(null, true)).toBe(false); expect(maySwim('owned', false)).toBe(false);
  });

  it('swims in the basin beyond the steps: the steps are apartment.ts\'s, the water at the deck less 0.12 m', () => {
    expect(STEPS).toEqual({ x0: POOL.x0, x1: POOL.x0 + 1.2, z0: POOL.z0 + 0.5, z1: POOL.z1 - 0.5 });
    expect(SWIM_AREA).toEqual({ x0: STEPS.x1, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1 });
    expect(WATER_Y).toBeCloseTo(DECK_Y - 0.12, 6);
    // down the steps: the deck, a riser a tread, the pool's floor at its depth
    expect(stepsY(POOL.x0 - 0.5)).toBe(DECK_Y); expect(stepsY(POOL.x0 + 0.2)).toBeCloseTo(DECK_Y - STEP_RISE, 6);
    expect(stepsY(POOL.x0 + 1.0)).toBeCloseTo(DECK_Y - 3 * STEP_RISE, 6); expect(stepsY(POOL.x0 + 3)).toBeCloseTo(DECK_Y - POOL.depth, 6);
  });

  it('holds the whole body inside the walls, whichever way it heads, upright or level, wherever the stick sends it', () => {
    // the footprint grows from treading (the sculling hands) to swimming (the hands ahead in the glide, the feet behind)
    expect(footprint(1).ahead).toBeGreaterThan(1.2); expect(footprint(1).behind).toBeGreaterThan(0.9); expect(footprint(0).side).toBeGreaterThan(footprint(1).side);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, s = swimmer(0, -7.8, a, 'swim');
      swimFor(s, Math.sin(a), Math.cos(a), SWIM_FULL, 14, q => expect(inside(bodyBox(q.x, q.z, q.yaw, q.lean), SWIM_AREA), `heading ${a.toFixed(2)}`).toBe(true));
      // pressed against a wall it stops there (what goes into the wall is lost)
      expect(Math.hypot(s.vx, s.vz)).toBeLessThan(SWIM_FULL * 0.75);
    }
    // a footprint put across a wall is moved back in
    const s = swimmer(POOL.x1 + 0.4, POOL.z1 + 0.4, Math.PI / 4, 'swim'), held = holdIn(s);
    expect(held).toEqual({ x: 1, z: 1 }); expect(inside(bodyBox(s.x, s.z, s.yaw, s.lean), SWIM_AREA)).toBe(true);
  });

  it('reaches the four corners of the water', () => {
    const c = SWIM_AREA;
    for (const [cx, cz] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]]) {
      const s = swimmer(0, -7.8);
      for (let i = 0; i < 20 * 60; i++) stepSwimmer(s, cx - s.x, cz - s.z, SWIM_PACE, 1 / 60);
      expect(Math.abs(s.x - cx), `corner ${cx},${cz}`).toBeLessThan(1.5); expect(Math.abs(s.z - cz), `corner ${cx},${cz}`).toBeLessThan(1.5);
    }
  });

  it('swims at about a metre a second, a little faster pushed to the rim; turns smoothly to face where it goes; drifts to a stop and treads water', () => {
    expect(swimPace(0.05)).toBe(0); expect(swimPace(STICK_DEAD + 0.01)).toBeGreaterThan(0.5); expect(swimPace(0.75)).toBeCloseTo(SWIM_PACE, 6);
    expect(swimPace(1)).toBeCloseTo(SWIM_FULL, 6); expect(SWIM_PACE).toBeGreaterThanOrEqual(0.9); expect(SWIM_PACE).toBeLessThanOrEqual(1.1);
    expect(SWIM_FULL).toBeGreaterThan(SWIM_PACE); expect(SWIM_FULL).toBeLessThan(1.6);
    expect(swimPace(1, true)).toBe(SWIM_PACE); expect(swimPace(1, true, true)).toBe(SWIM_FULL); expect(swimPace(0, true)).toBe(0);
    for (let i = 0; i <= 20; i++) { const p = i / 20; expect(swimPace(Math.min(1, p + 0.05))).toBeGreaterThanOrEqual(swimPace(p)); }   // more push, never slower
    // along the pool, the stick held east: about SWIM_PACE, facing east, level in the stroke
    const s = swimmer(SWIM_AREA.x0 + 2, -7.8, 0);
    let maxTurn = 0, lastYaw = s.yaw;
    swimFor(s, 1, 0, SWIM_PACE, 3, q => { maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(q.yaw - lastYaw), Math.cos(q.yaw - lastYaw)))); lastYaw = q.yaw; });
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(0.9 * SWIM_PACE); expect(Math.hypot(s.vx, s.vz)).toBeLessThan(1.05 * SWIM_PACE);
    expect(Math.abs(s.yaw - Math.PI / 2)).toBeLessThan(0.02); expect(s.mode).toBe('swim'); expect(s.lean).toBeGreaterThan(0.95);
    expect(maxTurn).toBeLessThanOrEqual(TURN_RATE / 60 + 1e-9);                        // never a snap: TURN_RATE at most
    // the stick at rest: still going a moment, then a stop, upright, treading
    const x0 = s.x;
    swimFor(s, 0, 0, 0, 0.5); expect(s.x - x0).toBeGreaterThan(0.2); expect(s.mode).toBe('swim');
    swimFor(s, 0, 0, 0, 4); expect(Math.hypot(s.vx, s.vz)).toBeLessThan(0.02); expect(s.mode).toBe('tread'); expect(s.lean).toBeLessThan(0.02);
    // the stroke's pace follows the speed
    expect(strokeRate(SWIM_FULL)).toBeGreaterThan(strokeRate(SWIM_PACE)); expect(strokeRate(SWIM_PACE)).toBeCloseTo(SWIM_PACE / STROKE_LENGTH, 6);
    expect(strokeRate(0)).toBe(STROKE_RATE.min);
  });

  it('goes in down the steps or over any other edge, and out over any wall within reach or up the steps', () => {
    // down the steps: on foot at their head, pushing toward the water (not along the deck, not from elsewhere)
    expect(wantsStepsIn(POOL.x0 - 0.35, -7.8, 1, 0.2)).toBe(true);
    expect(wantsStepsIn(POOL.x0 - 0.35, -7.8, 0, 1)).toBe(false); expect(wantsStepsIn(POOL.x0 - 0.35, -7.8, -1, 0)).toBe(false);
    expect(wantsStepsIn(POOL.x0 - 0.35, POOL.z0 + 0.2, 1, 0)).toBe(false); expect(wantsStepsIn(0, POOL.z1 + 0.4, 0, -1)).toBe(false);
    expect(entryFor(POOL.x0 - 0.4, -7.8)).toEqual({ steps: true });
    // « Se baigner » elsewhere: the nearest wall, from the deck's edge into the water, facing the water, the treading body clear of the wall
    const e = entryFor(-1, -5.6);
    if (e.steps) throw new Error('not the steps');
    expect(e.side).toBe('s'); expect(e.edge.z).toBeGreaterThan(POOL.z1); expect(e.water.z).toBeLessThan(POOL.z1); expect(Math.cos(e.yaw)).toBeLessThan(-0.99);
    expect(inside(bodyBox(e.water.x, e.water.z, e.yaw, 0), SWIM_AREA)).toBe(true);
    const n = entryFor(POOL.x0 - 0.5, POOL.z0 - 0.3); if (n.steps) throw new Error('not the steps');      // a corner by the steps: the long side
    expect(n.side).toBe('n'); expect(n.water.x).toBeGreaterThan(SWIM_AREA.x0);
    const ea = entryFor(POOL.x1 + 0.6, -7.8); if (ea.steps) throw new Error('not the steps');
    expect(ea.side).toBe('e'); expect(Math.sin(ea.yaw)).toBeLessThan(-0.99);
    // out: the nearest wall (the steps' end is not one), facing it; the deck out of the water, clear of furniture
    expect(nearestWall(0, POOL.z1 - 0.6)).toEqual({ side: 's', d: expect.closeTo(0.6, 6) });
    expect(nearestWall(POOL.x1 - 0.7, -7.8).side).toBe('e');
    const w = byWall('n', 0, -9, -0.4); expect(w.z).toBeCloseTo(POOL.z0 + 0.4, 6); expect(Math.cos(w.yaw)).toBeCloseTo(-1, 6);
    const x = exitPoint(0, POOL.z1 - 0.3);
    expect(x.z).toBeCloseTo(POOL.z1 + DECK_OUT, 6); expect(poolDistance(x.x, x.z)).toBeGreaterThan(0.3); expect(atEdge(x.x, x.z)).toBe(true);
    expect(freeDeck('s', 0, -6.4, [])).toEqual({ x: 0, z: POOL.z1 + DECK_OUT });
    const lounger = { x0: -0.4, x1: 0.4, z0: POOL.z1 + 0.2, z1: POOL.z1 + 1.5 }, f = freeDeck('s', 0, -6.4, [lounger])!;
    expect(f.x < lounger.x0 - 0.3 || f.x > lounger.x1 + 0.3).toBe(true); expect(f.z).toBeGreaterThan(POOL.z1);
    expect(CLIMB_REACH).toBeGreaterThan(footprint(0).side);                             // the treading body against a wall can always climb out there
    // up the steps: by them, heading west, the stick pushing west
    expect(wantsStepsOut({ x: SWIM_AREA.x0 + 1.3, z: -7.8, yaw: -Math.PI / 2 }, -1, 0)).toBe(true);
    expect(wantsStepsOut({ x: SWIM_AREA.x0 + 1.3, z: -7.8, yaw: Math.PI / 2 }, -1, 0)).toBe(false);
    expect(wantsStepsOut({ x: SWIM_AREA.x0 + 1.3, z: -7.8, yaw: -Math.PI / 2 }, 0, 1)).toBe(false);
    expect(wantsStepsOut({ x: 2, z: -7.8, yaw: -Math.PI / 2 }, -1, 0)).toBe(false);
    // swimming west by the steps, the stick held: the body stops short of the steps, where wantsStepsOut takes it out
    const s = swimmer(0, -7.8, -Math.PI / 2, 'swim'); swimFor(s, -1, 0, SWIM_PACE, 8);
    expect(wantsStepsOut(s, -1, 0)).toBe(true); expect(stepsZ(POOL.z0)).toBeGreaterThan(STEPS.z0);
  });

  it('gains hygiene and moral in proportion to the time in the water, at most a full swim\'s', () => {
    expect(swimGains(SWIM_SECONDS)).toEqual({ hygiene: SWIM_GAINS.hygiene, moral: SWIM_GAINS.moral, energie: SWIM_GAINS.energie });
    expect(swimGains(SWIM_SECONDS * 3)).toEqual(swimGains(SWIM_SECONDS));
    expect(swimGains(1).hygiene).toBe(Math.round(SWIM_GAINS.hygiene / 4));
    expect(swimGains(SWIM_SECONDS / 2).moral).toBe(Math.round(SWIM_GAINS.moral / 2));
    expect(SWIM_GAINS).toEqual({ hygiene: 22, moral: 15, energie: -4 });
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
