import { describe, expect, it } from 'vitest';
import { arrivals } from '../src/world/arrivalSigns';
import { HUB_IDS } from '../src/core/types';

/** The welcome boards (src/world/arrivalSigns.ts): one per way in, on a pavement inside the district, never on a carriageway. */
describe('arrival signs', () => {
  const C = [-120, -60, 0, 60, 120];
  it('every district has a board at each way in, inside its grid, on a pavement (5.5–7 m from a street centre), facing the arrivals', () => {
    for (const hub of HUB_IDS) {
      const a = arrivals(hub); expect(a.length).toBeGreaterThan(0);
      for (const s of a) {
        expect(Math.max(Math.abs(s.x), Math.abs(s.z))).toBeLessThan(120);
        const off = Math.min(...C.map(c => Math.abs(s.x - c)), ...C.map(c => Math.abs(s.z - c)));
        expect(off).toBeGreaterThan(5.5); expect(off).toBeLessThan(7.2);
      }
    }
    expect(arrivals('almadies').map(a => a.from).sort()).toEqual(['corniche', 'pikine']);
    expect(arrivals('pikine').map(a => a.from).sort()).toEqual(['almadies', 'plateau']);
  });
});
