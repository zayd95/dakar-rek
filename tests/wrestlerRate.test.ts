import { describe, expect, it } from 'vitest';
import { loadHumanoid } from './perfHost';

/** The wrestlers on the sand are animated at every frame whatever the camera's distance (src/actors/humanoid.ts Wrestler). */
describe('Wrestler: full rate', () => {
  it('is full rate when made and after a reset; an ordinary body is not', async () => {
    await loadHumanoid();
    const { Humanoid, Wrestler } = await import('../src/actors/humanoid');
    const w = new Wrestler(0x4e2e1c);
    expect(w.fullRate).toBe(true);
    w.reset();
    expect(w.fullRate).toBe(true);
    expect(new Humanoid().fullRate).toBe(false);
  });
});
