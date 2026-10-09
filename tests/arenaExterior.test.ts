import { describe, expect, it } from 'vitest';
import { ARENA_PURCHASES, ECURIES, FIGHT_FROM, gateOf, isFightEvening, nextFightEvening, stallsOf, vendorPlaces, weekday, WEEKDAY_FR } from '../src/arena/exteriorRules';
import { arenaExterior } from '../src/arena/exterior';
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
