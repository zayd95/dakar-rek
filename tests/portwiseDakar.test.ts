import { describe, expect, it } from 'vitest';
import { portCranePose, portTruckPose } from '../src/game/portwiseDakar';

describe('optional Portwise-inspired Dakar harbour', () => {
  it('keeps crane motion bounded with an exact 16-second loop', () => {
    for (let t = 0; t < 64; t += 0.2) {
      const p = portCranePose(t);
      expect(p.x).toBeGreaterThanOrEqual(-7);
      expect(p.x).toBeLessThanOrEqual(22);
      expect(p.y).toBeGreaterThanOrEqual(3);
      expect(p.y).toBeLessThanOrEqual(16);
      expect(portCranePose(t + 16).x).toBeCloseTo(p.x, 7);
      expect(portCranePose(t + 16).y).toBeCloseTo(p.y, 7);
    }
  });

  it('only attaches a container while the crane is lifting or travelling', () => {
    expect(portCranePose(0).carrying).toBe(false);
    expect(portCranePose(3).carrying).toBe(true);
    expect(portCranePose(5.5).carrying).toBe(true);
    expect(portCranePose(8).carrying).toBe(true);
    expect(portCranePose(10).carrying).toBe(false);
  });

  it('runs two deterministic looped lorries without positions outside the terminal', () => {
    const first = portTruckPose(0);
    expect(first.x).toBe(148);
    expect(first.z).toBe(23);
    let sawMovement = false;
    for (let t = 0; t < 120; t += 0.5) {
      const p = portTruckPose(t);
      const other = portTruckPose(t, 17);
      for (const v of [p, other]) {
        expect(Number.isFinite(v.yaw)).toBe(true);
        expect(v.x).toBeGreaterThanOrEqual(148);
        expect(v.x).toBeLessThanOrEqual(183);
        expect(v.z).toBeGreaterThanOrEqual(-28);
        expect(v.z).toBeLessThanOrEqual(23);
      }
      if (Math.hypot(p.x - first.x, p.z - first.z) > 1) sawMovement = true;
    }
    expect(sawMovement).toBe(true);
  });
});
