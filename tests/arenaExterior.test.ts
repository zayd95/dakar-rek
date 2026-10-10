import { describe, expect, it } from 'vitest';
import {
  ARENA_PURCHASES, DRUMS_NEAR, DRUMS_RANGE, ECURIES, FIGHT_FROM, MURMUR_RANGE, crossesQueue, drumVolume, drumsCentre, gateOf, isFightEvening, murmurVolume,
  exteriorPhase, nextFightEvening, outflowDestinations, queueDistance, stallFronts, stallsOf, vendorPlaces, weekday, WEEKDAY_FR,
} from '../src/arena/exteriorRules';
import { arenaExterior } from '../src/arena/exterior';
import { GALA, streetAt } from '../src/arena/program';
import { WALL_R } from '../src/world/geew';

describe('arena exterior: fight evenings', () => {
  it('city day 1 is Tuesday 6 October 2026, and the week turns', () => {
    expect(WEEKDAY_FR[weekday(1)]).toBe('mardi');
    expect(WEEKDAY_FR[weekday(4)]).toBe('vendredi');
    expect(WEEKDAY_FR[weekday(6)]).toBe('dimanche');
    expect(WEEKDAY_FR[weekday(7)]).toBe('lundi');
    expect(weekday(8)).toBe(weekday(1));
  });
  it('Friday to Sunday from 16 h, never on weekdays or before 16 h', () => {
    expect(isFightEvening(4, FIGHT_FROM)).toBe(true);         // Friday 16 h
    expect(isFightEvening(5, 21.5)).toBe(true);               // Saturday night
    expect(isFightEvening(6, 23.9)).toBe(true);               // Sunday late
    expect(isFightEvening(5, 15.9)).toBe(false);              // Saturday afternoon
    expect(isFightEvening(3, 20)).toBe(false);                // Thursday
    expect(isFightEvening(7, 20)).toBe(false);                // Monday
    expect(isFightEvening(11, 18)).toBe(true);                // the next Friday
  });
  it('the next fight evening', () => {
    expect(nextFightEvening(2, 10)).toEqual({ day: 4, hour: FIGHT_FROM });
    expect(nextFightEvening(4, 10)).toEqual({ day: 4, hour: FIGHT_FROM });
    expect(nextFightEvening(5, 19)).toEqual({ day: 5, hour: 19 });
    expect(nextFightEvening(6, 23.99)).toEqual({ day: 6, hour: 23 });
    expect(nextFightEvening(7, 1)).toEqual({ day: 11, hour: FIGHT_FROM });
  });
  it('the arena can schedule its own bouts on top of the rule', () => {
    expect(arenaExterior.isEventDay(2, 11)).toBe(false);
    arenaExterior.schedule((d, h) => d === 2 && h >= 10 && h < 12);
    expect(arenaExterior.isEventDay(2, 11)).toBe(true);
    expect(arenaExterior.isEventDay(2, 13)).toBe(false);
    expect(arenaExterior.isEventDay(5, 18)).toBe(true);
    arenaExterior.schedule(null);
    expect(arenaExterior.isEventDay(2, 11)).toBe(false);
  });
});

describe('arena exterior: gate, stalls, vendors', () => {
  const arena = { cx: 100, cz: 50 };
  it('the gate is on the −z side of the wall, the queue lane runs back to the street', () => {
    const g = gateOf(arena);
    expect(g.x).toBe(100); expect(g.z).toBeCloseTo(50 - WALL_R);
    expect(g.queue.z0).toBeLessThan(g.z); expect(g.queue.z1).toBeLessThan(g.queue.z0);
    expect(g.queue.half).toBeCloseTo(2.6);
  });
  it('the four stalls stand outside the wall, two on each side of the lane', () => {
    const s = stallsOf(arena), g = gateOf(arena);
    expect(s).toHaveLength(4);
    for (const p of s) { expect(Math.hypot(p.x - arena.cx, p.z - arena.cz)).toBeGreaterThan(WALL_R); expect(Math.abs(p.x - g.x)).toBeGreaterThan(g.queue.half + 3); }
  });
  it('vendors are places with prices: drinks, grilled food, écurie scarves and flags, water; each purchase counts', () => {
    const places = vendorPlaces('pikine', arena);
    expect(places.map(p => p.id)).toEqual(['pikine:arena-out:boissons', 'pikine:arena-out:grillades', 'pikine:arena-out:supporters', 'pikine:arena-out:eau']);
    const offers = places.flatMap(p => p.offers.stall);
    for (const o of offers) {
      expect(o.price).toBeGreaterThan(0);
      expect(o.steps.some(s => s.effects?.counters?.[ARENA_PURCHASES] === 1)).toBe(true);
    }
    const labels = offers.map(o => o.label);
    expect(labels).toEqual(expect.arrayContaining(['Bissap glacé', 'Café Touba', 'Cornet d’arachides grillées', 'Brochettes', 'Sachet d’eau fraîche']));
    for (const e of ECURIES) {
      const scarf = offers.find(o => o.id === 'echarpe_' + e.id)!;
      expect(scarf.steps.find(s => s.effects?.items)?.effects?.items).toEqual({ ['echarpe_' + e.id]: 1 });
    }
    // anchors stand on the street side of the stalls, away from the arena's own entry at the gate
    const g = gateOf(arena);
    for (const p of places) expect(Math.hypot(p.anchors[0].x - g.x, p.anchors[0].z - (g.z - 2.3))).toBeGreaterThan(7);
  });
});

describe('arena exterior: drums, murmur and the road in front of the gate', () => {
  const arena = { cx: 100, cz: 50 }, g = gateOf(arena);
  it('the drums are loud near them, fade with distance and are silent from 45 m', () => {
    expect(drumVolume(0, false, false)).toBe(1);
    expect(drumVolume(DRUMS_NEAR, false, false)).toBe(1);
    const a = drumVolume(15, false, false), b = drumVolume(30, false, false), c = drumVolume(44, false, false);
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThan(c); expect(c).toBeGreaterThan(0);
    expect(drumVolume(DRUMS_RANGE, false, false)).toBe(0);
    expect(drumVolume(80, false, false)).toBe(0);
  });
  it('silent inside an interior and with the sound off, wherever the player stands', () => {
    expect(drumVolume(2, true, false)).toBe(0);
    expect(drumVolume(2, false, true)).toBe(0);
    expect(murmurVolume(0, true, false)).toBe(0);
    expect(murmurVolume(0, false, true)).toBe(0);
  });
  it('the murmur is heard near the queue only, and less far than the drums', () => {
    expect(murmurVolume(0, false, false)).toBe(1);
    expect(murmurVolume(MURMUR_RANGE, false, false)).toBe(0);
    expect(MURMUR_RANGE).toBeLessThan(DRUMS_RANGE);
    expect(queueDistance(g, g.queue.x, (g.queue.z0 + g.queue.z1) / 2)).toBe(0);
    expect(queueDistance(g, g.queue.x + g.queue.half + 3, g.queue.z0)).toBeCloseTo(3);
    expect(queueDistance(g, g.queue.x, g.queue.z1 - 4)).toBeCloseTo(4);
  });
  it('the drummers stand beside the gate, outside the queue lane', () => {
    const c = drumsCentre(g);
    expect(queueDistance(g, c.x, c.z)).toBeGreaterThan(1);
    expect(Math.hypot(c.x - g.x, c.z - g.z)).toBeLessThan(8);
  });
  it('the street in front of the gate is closed to traffic, the others stay open', () => {
    const roadZ = g.z - 8.3;                                                // the road between the arena block and the écurie
    expect(crossesQueue(g, g.x - 30, roadZ, g.x + 30, roadZ)).toBe(true);
    expect(crossesQueue(g, g.x + 30, roadZ, g.x - 30, roadZ)).toBe(true);
    expect(crossesQueue(g, g.x + 30, roadZ - 60, g.x + 30, roadZ)).toBe(false);   // the side street
    expect(crossesQueue(g, g.x - 30, roadZ - 60, g.x + 30, roadZ - 60)).toBe(false); // the next street over
  });
});

describe('arena exterior: the end of the evening', () => {
  const g = gateOf({ cx: 100, cz: 50 });
  it('quiet, arriving, or the crowd pouring out once the gala is over (the arena\'s after-gala window)', () => {
    expect(exteriorPhase(false, false)).toBe('quiet');
    expect(exteriorPhase(true, false)).toBe('arrive');
    expect(exteriorPhase(true, true)).toBe('outflow');
    expect(exteriorPhase(false, true)).toBe('outflow');
    expect(streetAt(20, true)).toBe('after');                                   // the gala seen to the end at 20 h
    expect(streetAt(GALA.close + 0.5, false)).toBe('after');                    // closing time
    expect(streetAt(GALA.close + 1.2, false)).toBe('quiet');                    // past midnight: quiet again
  });
  it('the crowd heads for both street ends, the taxi corners and the stops nearby (not the far ones)', () => {
    const d = outflowDestinations(g, [{ x: g.x + 40, z: g.z - 30 }, { x: g.x + 400, z: g.z }]);
    expect(d).toHaveLength(5);
    expect(d.some(p => p.x === g.x + 40)).toBe(true);
    expect(d.some(p => p.x === g.x + 400)).toBe(false);
    for (const p of d.slice(0, 4)) expect(queueDistance(g, p.x, p.z)).toBeGreaterThan(10);   // away from the lane
  });
  it('the last customers stand on the street side of the four stalls', () => {
    const f = stallFronts({ cx: 100, cz: 50 }), s = stallsOf({ cx: 100, cz: 50 });
    f.forEach((p, i) => { expect(p.x).toBe(s[i].x); expect(p.z).toBeLessThan(s[i].z); });
  });
});
