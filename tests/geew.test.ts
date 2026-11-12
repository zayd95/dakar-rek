import { describe, it, expect } from 'vitest';
import {
  RING_R, PARAPET_R, PARAPET_H, TIERS, TIER_DEPTH, tierRadius, tierTop, WALL_R, WALL_H,
  ROOF_FRONT_R, ROOF_FRONT_Y, roofY, GATE_HALF, inGate, EYE, HEAD,
} from '../src/world/geew';

/** Height of the straight line from (r0, y0) to (r1, y1) at radius r (radial section through the arena). */
const lineAt = (r0: number, y0: number, r1: number, y1: number, r: number) => y0 + ((r - r0) / (r1 - r0)) * (y1 - y0);
const FASCIA_DROP = 0.5; // the painted fascia hangs this far below the roof's front edge

describe('géew: arena stands and roof', () => {
  it('tiers rise one above the other and stay inside the outer wall (one level, no upper tier)', () => {
    expect(TIERS).toBe(3);
    for (let t = 1; t < TIERS; t++) {
      expect(tierTop(t)).toBeGreaterThan(tierTop(t - 1));
      expect(tierRadius(t)).toBeGreaterThan(tierRadius(t - 1));
    }
    expect(tierRadius(0) - TIER_DEPTH / 2).toBeGreaterThan(PARAPET_R);
    expect(tierRadius(TIERS - 1) + TIER_DEPTH / 2).toBeLessThan(WALL_R - 0.25);
    expect(tierTop(TIERS - 1)).toBeLessThan(WALL_H);
  });

  it('every tier sees the near edge of the ring over the parapet and the heads below', () => {
    for (let t = 0; t < TIERS; t++) {
      const r0 = tierRadius(t), y0 = tierTop(t) + EYE;
      const target = [RING_R, 0.2] as const;
      expect(lineAt(r0, y0, target[0], target[1], PARAPET_R)).toBeGreaterThan(PARAPET_H);
      for (let u = 0; u < t; u++) {
        expect(lineAt(r0, y0, target[0], target[1], tierRadius(u))).toBeGreaterThan(tierTop(u) + HEAD);
      }
    }
  });

  it('the roof leaves headroom over every tier and does not hide the crowd from the ring', () => {
    for (let t = 0; t < TIERS; t++) {
      const back = tierRadius(t) + TIER_DEPTH / 2;
      expect(roofY(back) - (tierTop(t) + HEAD)).toBeGreaterThan(2);
      // from a wrestler's eye at the ring centre, the line to a spectator's head passes under the roof's front edge
      const y = lineAt(0, EYE, tierRadius(t), tierTop(t) + HEAD, ROOF_FRONT_R);
      expect(y).toBeLessThan(ROOF_FRONT_Y - FASCIA_DROP);
    }
  });

  it('the gate passage stays open through stands, wall and roof', () => {
    expect(inGate(Math.PI)).toBe(true);
    expect(inGate(0)).toBe(false);
    // half-width of the opening at the front of the first tier: room for the entrance procession (±1.4 m) and the arch (±4.6 m posts)
    expect((tierRadius(0) - TIER_DEPTH / 2) * Math.sin(GATE_HALF)).toBeGreaterThan(4.6);
  });
});
