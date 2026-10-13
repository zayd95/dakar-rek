import { describe, it, expect } from 'vitest';
import { fovFor, horizontalFov } from '../src/core/view';

describe('camera field of view per screen shape', () => {
  it('keeps 66° in portrait and 58° on desktop screens', () => {
    expect(fovFor(390, 844)).toBe(66);
    expect(fovFor(1280, 800)).toBe(58);
    expect(fovFor(1920, 1080)).toBe(58);
  });
  it('a phone held in landscape keeps a horizontal angle near 90° rather than ~100°', () => {
    const fov = fovFor(844, 390);
    expect(fov).toBeGreaterThanOrEqual(50);
    expect(fov).toBeLessThan(58);
    const h = horizontalFov(fov, 844 / 390);
    expect(h).toBeGreaterThan(85);
    expect(h).toBeLessThan(93);
    expect(horizontalFov(58, 844 / 390)).toBeGreaterThan(99);   // what it was
  });
  it('never returns nonsense for an empty size', () => {
    expect(fovFor(0, 0)).toBe(66);
  });
});
