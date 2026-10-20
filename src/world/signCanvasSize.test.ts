import { describe, expect, it } from 'vitest';
import { signCanvasSize } from './batch';

describe('shopfront sign canvas proportions', () => {
  it('keeps ordinary signs square-pixel instead of stretching the font', () => {
    const size = signCanvasSize(6, 1.5);
    expect(size.width / size.height).toBeCloseTo(4, 1);
  });

  it('keeps long, narrow shop boards proportional and bounded on mobile', () => {
    const size = signCanvasSize(16.5, 0.8); // Boutique Diallo
    expect(Math.abs(size.width / size.height - 16.5 / 0.8)).toBeLessThan(0.2);
    expect(size.width).toBeLessThanOrEqual(1536);
    expect(size.height).toBeLessThanOrEqual(96);
  });

  it('avoids distorting small roadside signs', () => {
    const size = signCanvasSize(2.6, 0.7);
    expect(Math.abs(size.width / size.height - 2.6 / 0.7)).toBeLessThan(0.1);
  });
});
