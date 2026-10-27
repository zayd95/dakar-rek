import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { ALLEY_RECT, STRIP_KEEP_CLEAR, STRIP_VENUES } from '../src/world/hospitalityStrip';

/**
 * Almadies hospitality strip (src/world/hospitalityStrip.ts): the six venues, the car parks and the alley are built from solids the player and the cars meet; what the M4 evening
 * needs stays reachable: the Terrasse's door and visitor bay, a way into each car park, the alley between the coast road and La Vague's gate.
 */
const solidsIn = (cs: { x0: number; z0: number; x1: number; z1: number; h: number }[], x0: number, z0: number, x1: number, z1: number) =>
  cs.filter(c => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1);

describe('Almadies hospitality strip', () => {
  stubCanvas();
  it('has six distinct venues and each keeps its own architecture', () => {
    expect(STRIP_VENUES[0].concat(STRIP_VENUES[1]).sort()).toEqual(['binta', 'comptoir', 'lounge', 'patio', 'phare', 'terrasse']);
  });

  it('leaves the Terrasse door, its visitor bay and the way from the road clear', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    expect(solidsIn(hub.colliders, -33.6, -112, -26.4, -105.3)).toEqual([]);                    // the bay (7.2 × 5 m at z −109.5) and the strip of ground to the door
    expect(solidsIn(hub.colliders, -33.6, -127, -26.4, -112.2)).toEqual([]);                    // the road's edge to the bay: bollards stop either side of it
  });

  it('opens a way into each car park from the south road, and an aisle across it', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    for (const bx of [-113, -53]) {
      const gx = bx + 23;                                                                         // the middle of the opening (src: gap0..gap1 = bx + 19..27)
      expect(solidsIn(hub.colliders, gx - 3, -85.5, gx + 3, -66)).toEqual([]);                    // from the south edge up to the aisle (row B has no bays there)
      expect(solidsIn(hub.colliders, bx + 4, -85.5, bx + 42, -83.5)).toEqual([]);                  // the aisle between the two rows
    }
  });

  it('keeps the alley to La Vague\'s gate clear for the queue and the doorway', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    expect(solidsIn(hub.colliders, -37.4, -135, -34.6, -127.8)).toEqual([]);                    // the 2.8 m way between the ropes, to the gate (z −135)
    expect(hub.keepClear?.some(r => r.why === 'almadies_alley')).toBe(true);
    expect(STRIP_KEEP_CLEAR.length).toBe(5);
    expect(ALLEY_RECT.z0).toBeLessThan(-135);
  });

  it('is deterministic: built twice, the same solids', async () => {
    const { buildHub } = await import('../src/world/builder');
    const a = buildHub('almadies', true), b = buildHub('almadies', true);
    expect(JSON.stringify(a.colliders)).toBe(JSON.stringify(b.colliders));
  });
});
