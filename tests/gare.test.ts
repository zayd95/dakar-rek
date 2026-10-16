import { describe, expect, it } from 'vitest';
import { COMMUTE_FROM, COMMUTE_UNTIL, gareLevel } from '../src/game/gare';
import { PRAYER_TIMES, PRAYER_WINDOW } from '../src/venues/prayer';

describe('the Pikine gare through the day', () => {
  it('is busiest early in the morning and in the late afternoon, quiet at midday and at night', () => {
    expect(gareLevel(3)).toBe(0); expect(gareLevel(12)).toBe(0); expect(gareLevel(23)).toBe(0);
    expect(gareLevel(7.5)).toBe(1); expect(gareLevel(18)).toBe(1);
    expect(gareLevel(6)).toBeGreaterThan(0); expect(gareLevel(6)).toBeLessThan(1);
    for (let h = 0; h < 24; h += 0.25) { const l = gareLevel(h); expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1); }
  });
  it('sends people from the mosque to the cars only after the Fajar congregation has left', () => {
    expect(COMMUTE_FROM).toBe(PRAYER_TIMES[0].hour + PRAYER_WINDOW[1]);
    expect(COMMUTE_UNTIL).toBeGreaterThan(COMMUTE_FROM);
    expect(gareLevel(COMMUTE_FROM)).toBe(1);                                  // and the gare is already full then
  });
  it('fills up under the shelter when it rains, at any hour', () => {
    expect(gareLevel(12.5, 0)).toBe(0);
    expect(gareLevel(12.5, 1)).toBe(1);
    expect(gareLevel(12.5, 0.4)).toBeGreaterThan(0.4);
    expect(gareLevel(7.5, 0)).toBe(1);
  });
});
