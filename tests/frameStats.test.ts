import { describe, expect, it, vi } from 'vitest';
import { AFTER_TRANSITION_MS, FrameStats, HITCH_MS, memoryProbe } from '../src/core/frameStats';

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

  // ── MOBILE-01: memory, district changes, what kills a game on a phone ──────────────────────────────────────────────────────────────────────────────────────
  it('files a district change with its load time, its longest block and the worst frame until two seconds after it', () => {
    const s = new FrameStats(false); s.setEnabled(true); let t = feed(s, 'Corniche · au volant', 40, 16, 0);
    s.beginTransition('Corniche', 'Almadies', 'route');
    t = feed(s, 'Corniche · au volant', 3, 16, t);
    s.endTransition(340.4, 85.2, t);
    t = feed(s, 'Almadies · au volant', 5, 210, t);                      // a hitch right after the swap
    t = feed(s, 'Almadies · au volant', 60, 16, t);                      // …then smooth, past the two seconds
    const late = t; t = feed(s, 'Almadies · au volant', 3, 400, t);      // a later hitch is not the district change's
    const lines = s.transitionLines();
    expect(lines[0]).toBe('Changements de quartier :');
    expect(lines[1]).toBe('- Corniche → Almadies (par la route) : 340 ms de chargement · plus long bloc 85 ms · pire image jusqu’à 2 s après 210 ms');
    expect(late).toBeGreaterThan(AFTER_TRANSITION_MS);
    expect(s.reportLines().join('\n')).toContain('Changements de quartier');
  });

  it('shows the last district change on the meter only while it is recent', () => {
    const s = new FrameStats(false); s.setEnabled(true);
    s.beginTransition('Pikine', 'Plateau', 'saut'); s.endTransition(900, 900, 10_000);
    expect(s.recentTransition(15_000)?.to).toBe('Plateau');
    expect(s.recentTransition(40_000)).toBeNull();
  });

  it('records nothing about district changes while the measure is off', () => {
    const s = new FrameStats(false);
    s.beginTransition('Pikine', 'Plateau', 'saut'); s.endTransition(900, 900, 0);
    expect(s.transitions).toEqual([]);
    expect(s.transitionLines()).toEqual([]);
  });

  it('reports the memory the renderer gives, says so when the browser gives no JS heap, and keeps the peak', () => {
    const s = new FrameStats(false); s.setEnabled(true);
    const info = { memory: { geometries: 800, textures: 120 }, programs: new Array(40) as unknown[] };
    s.probe = memoryProbe({ info });
    s.tick(0, 'x'); s.tick(5000, 'x');                                   // samples the peak
    info.memory.geometries = 500; info.memory.textures = 90;             // a district freed
    const text = s.memoryLines().join('\n');
    expect(text).toContain('Mémoire maintenant : 500 géométries · 90 textures · 40 programmes');
    expect(text).toContain('tas JS non communiqué par ce navigateur');
    expect(text).toContain('Mémoire au plus haut : 800 géométries · 120 textures · 40 programmes');
  });

  it('reports the JS heap where the browser has one (Chrome, Android)', () => {
    const had = Object.getOwnPropertyDescriptor(performance, 'memory');
    Object.defineProperty(performance, 'memory', { configurable: true, value: { usedJSHeapSize: 90 * 1048576, jsHeapSizeLimit: 2048 * 1048576 } });
    try {
      const m = memoryProbe({ info: { memory: { geometries: 1, textures: 2 } } })();
      expect(m).toMatchObject({ heapMB: 90, heapLimitMB: 2048, geometries: 1, textures: 2 });
      expect(m.programs).toBeUndefined();
    } finally { if (had) Object.defineProperty(performance, 'memory', had); else delete (performance as unknown as { memory?: unknown }).memory; }
  });

  it('carries the notes (a lost WebGL context, a hidden page) into the report, with the time', () => {
    const s = new FrameStats(false);
    s.note('contexte WebGL perdu', new Date('2026-11-08T10:15:30Z'));
    expect(s.reportLines()).toEqual(['- 10:15:30 UTC contexte WebGL perdu']);
    s.reset(); expect(s.reportLines()).toEqual([]);
  });

  it('starts on in a build made for the device playtest, unless the player switched it off; stays off in every other build', async () => {
    vi.resetModules(); vi.stubEnv('VITE_MEASURE_DEFAULT', '1');
    try {
      const on = await import('../src/core/frameStats');
      expect(new on.FrameStats().enabled).toBe(true);
      expect(new on.FrameStats(false).enabled).toBe(false);           // (tests and tools that ask for no stored choice)
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
    const off = await import('../src/core/frameStats');
    expect(new off.FrameStats().enabled).toBe(false);
  });
});
