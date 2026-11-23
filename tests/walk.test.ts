import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { HUB_IDS, type HubId } from '../src/core/types';
import { travelLeg } from '../src/world/content';
import { applyWalk, walkCard, walkMinutes, walkTargets, waysOut, wayToward } from '../src/world/walk';
import { restSpot, setRestSpot, tiredReason } from '../src/game/rest';
import { CITY_ACTIONS } from '../src/world/cityContent';

/**
 * « Aller à pied » (Habib, 11 Oct; docs/UI_V2_PLAN.md §0 A): free, unlimited, no energy condition; and where to rest,
 * named (§4.2 hole 3).
 */
describe('on foot between neighbourhoods', () => {
  it('free at 0 F and 0 % energy, again and again the same day: nothing paid, nothing counted, energy stays at 0', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 0; s.data.needs.energie = 0; s.data.hub = 'almadies';
    const counters = JSON.stringify(s.data.counters), ledger = s.data.ledger.length;
    for (const [a, b] of [['almadies', 'pikine'], ['pikine', 'almadies'], ['almadies', 'pikine']] as const) expect(applyWalk(s, a, b)).toBe(walkMinutes(a, b));
    expect(s.wallet).toBe(0); expect(s.data.needs.energie).toBe(0);
    expect(s.data.ledger.length).toBe(ledger); expect(JSON.stringify(s.data.counters)).toBe(counters);
  });
  it('a walk takes about three times the car rapide, in steps of 5 min, and says where and how long', () => {
    for (const a of HUB_IDS) for (const b of HUB_IDS) if (a !== b) {
      const m = walkMinutes(a, b);
      expect(m % 5).toBe(0); expect(Math.abs(m - travelLeg(a, b).minutes * 3)).toBeLessThanOrEqual(2.5);
      expect(walkMinutes(b, a)).toBe(m);
    }
    expect(walkCard('pikine', 105)).toBe('🚶 À pied vers Pikine · ≈ 105 min');
    expect(walkTargets('plateau').map(t => t.hub)).toEqual(['corniche', 'mermoz', 'pikine', 'almadies']);   // nearest first
  });
  it('every neighbourhood has ways out on foot, none into the sea; each trip leaves by the side facing the other one', () => {
    const sea: Record<HubId, 'west' | 'north' | null> = { plateau: null, corniche: 'west', almadies: 'north', pikine: null, mermoz: null };
    for (const h of HUB_IDS) {
      const ways = waysOut(sea[h], 128);
      expect(ways.length).toBe(sea[h] ? 3 : 4);
      expect(ways.some(w => w.side === sea[h])).toBe(false);
      for (const t of HUB_IDS) if (t !== h) expect(wayToward(ways, h, t)).not.toBeNull();
    }
    expect(wayToward(waysOut(null, 128), 'plateau', 'pikine')?.side).toBe('east');
    expect(wayToward(waysOut(null, 128), 'pikine', 'plateau')?.side).toBe('west');
    expect(wayToward(waysOut('north', 128), 'almadies', 'pikine')?.side).toBe('east');          // not into the sea
    expect(wayToward(waysOut('west', 128), 'corniche', 'almadies')?.side).toBe('north');
    const arrive = wayToward(waysOut(null, 128), 'pikine', 'almadies')!;                        // from the Almadies into Pikine
    expect(arrive.side).toBe('west'); expect(Math.hypot(arrive.x, arrive.z)).toBe(128);
  });
});

describe('where to rest, named', () => {
  const spots = [
    { name: 'Jus & Go', actions: CITY_ACTIONS.juice },
    { name: 'Place des voisins · Ngor', actions: CITY_ACTIONS.square },
  ];
  it('the free rest of the hub, or the bed in the hub the player lives in', () => {
    expect(restSpot(spots, null)).toBe('Place des voisins · Ngor : « Se poser à l’ombre »');
    expect(restSpot(spots, 'Ma chambre')).toBe('Ma chambre : « Dormir »');
    expect(restSpot([{ name: 'Jus & Go', actions: CITY_ACTIONS.juice }], null)).toBeNull();      // paid only: no free rest named
  });
  it('the tired refusal of paid work says where', () => {
    setRestSpot('Place des voisins · Ngor : « Se poser à l’ombre »');
    expect(tiredReason()).toBe('Repose-toi avant ce service · Place des voisins · Ngor : « Se poser à l’ombre »');
    setRestSpot(null);
    expect(tiredReason()).toBe('Repose-toi avant ce service');
  });
});
