import { describe, expect, it } from 'vitest';
import { JOB, jobOf } from '../src/ui/jobMarks';

describe('job markers (src/ui/jobMarks.ts): a VTC ride and a delivery never look alike', () => {
  it('a target says its job; others have none', () => {
    expect(jobOf({ name: 'x', x: 0, z: 0, job: 'vtc' })).toBe('vtc');
    expect(jobOf({ name: 'x', x: 0, z: 0, job: 'delivery' })).toBe('delivery');
    expect(jobOf({ name: 'x', x: 0, z: 0 })).toBeNull(); expect(jobOf(null)).toBeNull(); expect(jobOf({ job: 'other' })).toBeNull();
  });
  it('green for the VTC, orange for the deliveries, neither the sun-yellow of the other pins; each its own pictogram', () => {
    const hue = (hex: number) => { const r = (hex >> 16) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; return d === 0 ? 0 : mx === r ? (60 * ((g - b) / d) + 360) % 360 : mx === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240; };
    expect(hue(JOB.vtc.hex)).toBeGreaterThan(100); expect(hue(JOB.vtc.hex)).toBeLessThan(160);                // green
    expect(hue(JOB.delivery.hex)).toBeGreaterThan(15); expect(hue(JOB.delivery.hex)).toBeLessThan(40);        // orange
    expect(Math.abs(hue(JOB.delivery.hex) - hue(0xffc83d))).toBeGreaterThan(10);                               // not the pins' sun
    expect(JOB.vtc.icon).not.toBe(JOB.delivery.icon);
  });
});
