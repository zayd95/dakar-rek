import { describe, expect, it } from 'vitest';
import { FrameStats, HITCH_MS } from '../src/core/frameStats';

/** Feeds `n` frames of `ms` each, starting at `t0`; returns the time after the last one. */
const feed = (s: FrameStats, key: string, n: number, ms: number, t0: number, calls = 0, tris = 0) => { let t = t0; for (let i = 0; i < n; i++) { t += ms; s.tick(t, key, calls, tris); } return t; };

describe('Mesure de fluidité (src/core/frameStats.ts)', () => {
  it('is off by default and costs nothing to ask', () => {
    const s = new FrameStats(false);
    expect(s.enabled).toBe(false);
    expect(s.lines()).toEqual([]);
    expect(s.reportLines()).toEqual([]);
  });

  it('files frames under the place, with the average, the 95th percentile and the worst frame', () => {
    const s = new FrameStats(false); let t = 1000;
    s.tick(t, 'Pikine · à pied');                                   // the first frame has no predecessor: it only starts the clock
    t = feed(s, 'Pikine · à pied', 95, 16, t);
    t = feed(s, 'Pikine · à pied', 5, 80, t);
    const [line] = s.lines();
    expect(line).toMatch(/^Pikine · à pied : /);
    expect(line).toMatch(/pire 80 ms/);
    expect(line).toMatch(/5 à-coups/);
    const b = [...(s as unknown as { buckets: Map<string, never> }).buckets.values()][0];
    expect(s.percentile(b, 0.5)).toBeLessThanOrEqual(17);
    expect(s.percentile(b, 0.99)).toBeGreaterThanOrEqual(80);
  });

  it('keeps places apart, the busiest first, and leaves out the ones too short to say anything', () => {
    const s = new FrameStats(false); let t = 0;
    t = feed(s, 'Almadies · à pied', 200, 20, t);
    t = feed(s, 'Almadies · au volant', 60, 33, t);
    t = feed(s, 'Plateau · à pied', 10, 16, t);
    const l = s.lines();
    expect(l.map(x => x.split(' : ')[0])).toEqual(['Almadies · à pied', 'Almadies · au volant']);
  });

  it('does not count a hidden tab or a pause as a frame', () => {
    const s = new FrameStats(false); let t = 0;
    t = feed(s, 'Corniche · à pied', 40, 16, t);
    s.tick(t + 60_000, 'Corniche · à pied');                        // the tab came back a minute later
    const b = [...(s as unknown as { buckets: Map<string, { frames: number; worst: number }> }).buckets.values()][0];
    expect(b.frames).toBe(39);                               // the first frame only starts the clock
    expect(b.worst).toBeLessThan(HITCH_MS);
  });

  it('reports the heaviest frame’s draw calls and triangles, and names the GPU in the report', () => {
    const s = new FrameStats(false); s.gpu = 'Apple GPU'; let t = 0;
    t = feed(s, 'Mermoz · au volant', 20, 16, t, 90, 150_000);
    t = feed(s, 'Mermoz · au volant', 20, 16, t, 139, 310_000);
    expect(s.lines()[0]).toMatch(/jusqu’à 139 appels et 310 k triangles/);
    expect(s.reportLines()[0]).toBe('Fluidité mesurée sur cet appareil (Apple GPU) :');
  });

  it('shows the current place for the on-screen meter once it has a few frames', () => {
    const s = new FrameStats(false); let t = 0;
    expect(s.current()).toBeNull();
    t = feed(s, 'Ngor · à pied', 3, 16, t); expect(s.current()).toBeNull();
    t = feed(s, 'Ngor · à pied', 30, 16, t);
    const c = s.current()!;
    expect(c.key).toBe('Ngor · à pied');
    expect(c.fps).toBeGreaterThanOrEqual(58); expect(c.fps).toBeLessThanOrEqual(64);
  });

  it('forgets everything on reset', () => {
    const s = new FrameStats(false);
    feed(s, 'x', 50, 16, 0); s.reset();
    expect(s.lines()).toEqual([]);
  });
});
