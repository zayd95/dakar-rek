import { describe, expect, it } from 'vitest';
import { isNightHour, nightFor } from '../src/ui/theme';

describe('day / night appearance', () => {
  it('auto follows the city hour: dark from 19 h to 6 h, light in between', () => {
    for (const h of [19, 20.5, 23.99, 0, 3, 5.99]) expect(isNightHour(h), String(h)).toBe(true);
    for (const h of [6, 8, 12, 17.5, 18.99]) expect(isNightHour(h), String(h)).toBe(false);
    expect(isNightHour(24 + 21)).toBe(true);        // an hour past 24 wraps
  });
  it('a fixed choice ignores the hour', () => {
    expect(nightFor('night', 12)).toBe(true);
    expect(nightFor('day', 23)).toBe(false);
    expect(nightFor('auto', 23)).toBe(true);
    expect(nightFor('auto', 12)).toBe(false);
  });
});
