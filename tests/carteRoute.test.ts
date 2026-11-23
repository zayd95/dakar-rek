import { describe, expect, it } from 'vitest';
import { remoteCardHtml } from '../src/ui/carteState';
import { planTrip, CITY_HUBS, isPlayable } from '../src/road/graph';

describe('the city map reads the road graph', () => {
  it('the card of a district says how to drive there, through the districts in between when it is not a direct road', () => {
    const direct = remoteCardHtml({ kind: 'hub', hub: 'plateau' }, 'pikine');
    expect(direct).toMatch(/Au volant · 1,4 km/); expect(direct).not.toMatch(/via/);
    const through = remoteCardHtml({ kind: 'hub', hub: 'plateau' }, 'almadies');
    expect(through).toMatch(/Au volant · 2,2 km · via Corniche/);
    const back = remoteCardHtml({ kind: 'hub', hub: 'pikine' }, 'corniche');
    expect(back).toMatch(/via Almadies/);                       // not through Pikine, not through the Plateau
  });
  it('a district you are in has no driving line, and the planned ones are not routable', () => {
    expect(remoteCardHtml({ kind: 'hub', hub: 'pikine' }, 'pikine')).not.toMatch(/Au volant/);
    for (const h of CITY_HUBS.filter(x => x.status === 'planned')) { expect(isPlayable(h.id)).toBe(false); expect(planTrip('pikine', h.id)).toBeNull(); expect(planTrip(h.id, 'pikine')).toBeNull(); }
  });
});
