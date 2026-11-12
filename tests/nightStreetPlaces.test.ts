import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { NIGHT_PLACES, counterOf, placeOf } from '../src/districts/nightStreet';
import { FRONT_Z, NIGHT_VENUES, WALK_Z0 } from '../src/world/nightStreet';
import { isOpen } from '../src/activity/places';
import type { HubWorld } from '../src/world/types';

/**
 * The night street's counters (src/districts/nightStreet.ts): four places of the shared registry with their own hours and menus; a counter stands on the promenade in reach of its venue's door,
 * clear of every solid, and what each one serves is the ordinary `order` activity (pay once, prepared, sit, eat or drink, the needs at the last bite).
 */
stubCanvas();
let hub: HubWorld | null = null;
const build = async () => (hub ??= (await import('../src/world/builder')).buildHub('almadies', true));

describe('the night street\'s counters', () => {
  it('are four places of their own: a restaurant, a restaurant, a café and a night lounge, each open at its own hours', () => {
    expect(NIGHT_PLACES.map(p => p.kind)).toEqual(['binta', 'comptoir', 'phare', 'lounge']);
    expect(NIGHT_PLACES.map(p => p.type)).toEqual(['restaurant', 'restaurant', 'cafe', 'bar']);
    const by = (id: string) => NIGHT_PLACES.find(p => p.id === id)!;
    expect(isOpen(by('phare').hours, 8)).toBe(true); expect(isOpen(by('binta').hours, 8)).toBe(false);         // the café opens before the grill
    expect(isOpen(by('binta').hours, 13)).toBe(true); expect(isOpen(by('lounge').hours, 13)).toBe(false);      // a lunch, not a lounge
    expect(isOpen(by('lounge').hours, 23)).toBe(true); expect(isOpen(by('lounge').hours, 2)).toBe(true); expect(isOpen(by('lounge').hours, 4)).toBe(false);
    expect(isOpen(by('phare').hours, 23)).toBe(false);                                                         // the café has closed by night, the lounge has not
  });

  it('serve ordinary prices and no alcohol (that is Le Patio\'s bar), one order each: the prices are the activity\'s', () => {
    for (const p of NIGHT_PLACES) {
      const place = placeOf(p), offers = place.offers.counter;
      expect(offers.length).toBe(p.items.length); expect(offers.length).toBeGreaterThanOrEqual(3);
      expect(new Set(p.items.map(i => i.id)).size).toBe(p.items.length);
      for (const [n, spec] of offers.entries()) {
        const i = p.items[n];
        expect(i.price).toBeGreaterThanOrEqual(300); expect(i.price).toBeLessThanOrEqual(3500);
        expect(spec.price, `${p.id}:${i.id}`).toBe(i.price);                                                  // the price the runner charges once, at the start
        expect(spec.steps.map(s => s.primitive)).toEqual(['wait', 'sit', i.drink ? 'drink' : 'eat']);
        expect(`${i.label} ${i.detail ?? ''}`).not.toMatch(/bière|whisky|vin\b|rhum|vodka/i);
      }
    }
  });

  it('keep each counter on the promenade in front of its venue, clear of every solid, with a café chair within reach', async () => {
    const h = await build();
    for (const p of NIGHT_PLACES) {
      const at = counterOf(p), v = NIGHT_VENUES.find(n => n.kind === p.kind)!;
      expect(at.x).toBe(v.cx); expect(at.z).toBeGreaterThan(FRONT_Z); expect(at.z).toBeLessThan(WALK_Z0);
      expect(h.colliders.filter(c => c.h >= 0.45 && at.x > c.x0 - 0.3 && at.x < c.x1 + 0.3 && at.z > c.z0 - 0.3 && at.z < c.z1 + 0.3), p.id).toEqual([]);
      const chairs = h.seats.filter(s => s.id.startsWith('night:seat:') && Math.hypot(s.x - at.x, s.z - at.z) < 14);
      expect(chairs.length, `${p.id}: chairs near its counter`).toBeGreaterThanOrEqual(2);
    }
  });
});
