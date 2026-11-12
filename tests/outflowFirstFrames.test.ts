import { describe, expect, it } from 'vitest';
import { PerfHost } from './perfHost';

/**
 * The frames just after a hub loads (docs/PERF_EVENING.md « Wave 5: the outflow »): the street's walkers and traffic are thinned to the
 * hour's share and the other systems' people rationed (full bodies, figures) from the first frame drawn, not four frames later (the
 * ambient life's first build) or a second after that: all of them drawn in full was five hundred draw calls, against the medium
 * preset's 300 (check-night, « a street at night stays in the medium budget », Plateau at 21:30).
 */
describe('the first frames of a hub', () => {
  it('Plateau at night, medium: the frame is inside the budget from the first frame on', async () => {
    const host = new PerfHost('medium');
    await host.load({ x: -2, z: 40, yaw: 0 }, 21.5, 'plateau');
    host.hour = 21.5; host.place(-2, 40, 0);
    const calls: number[] = [];
    for (let k = 1; k <= 40; k++) { host.frame(0.1); calls.push(host.calls().calls); }
    expect(Math.max(...calls), `draw calls by frame: ${calls.join(' ')}`).toBeLessThanOrEqual(300);
    expect(calls[0]).toBeLessThanOrEqual(150);                               // (the walkers and the rest were 120 and 220 calls of the first three frames)
  }, 120000);

  it('the same on the phone preset', async () => {
    const host = new PerfHost('low');
    await host.load({ x: -2, z: 40, yaw: 0 }, 21.5, 'plateau');
    host.hour = 21.5; host.place(-2, 40, 0);
    const calls: number[] = [];
    for (let k = 1; k <= 30; k++) { host.frame(0.1); calls.push(host.calls().calls); }
    expect(Math.max(...calls), `draw calls by frame: ${calls.join(' ')}`).toBeLessThanOrEqual(180);
  }, 120000);
});
