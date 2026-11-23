import { describe, expect, it } from 'vitest';
import { GALA_DAY, PerfHost } from './perfHost';
import { posters } from '../src/arena/posters';

/**
 * A poster's picture is drawn in three steps, one a frame, and not while the player sits inside the arena's walls (no poster
 * is in sight from there): a result printed during the bout is drawn once they are out, not in the middle of it.
 */
type ArenaDbg = { info(): { centre: { x: number; z: number }; day: number } | null; freeSeat(x: number, z: number): { id: string } | null; day(d: number | null): void };

describe('the fight posters’ texture', () => {
  it('is redrawn in steps when a result comes in, and not from the tiers', async () => {
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
    const arena = host.debug<ArenaDbg>('arena');
    arena.day(GALA_DAY);
    // every canvas the page makes from now on, and what is drawn on it (the stub document has no real canvas)
    const g = globalThis as unknown as { document: { createElement(t: string): unknown } };
    const make = g.document.createElement.bind(g.document), all: { ops: number; el: Record<string, unknown> }[] = [];
    const canvases = { get length() { return all.filter(c => c.el.width === 360 && c.el.height === 504).length; } };
    g.document.createElement = (tag: string) => {
      const el = make(tag) as Record<string, unknown>;
      if (tag !== 'canvas') return el;
      const rec = { ops: 0, el }; all.push(rec);
      const real = (el.getContext as (k: string) => Record<string, unknown>)('2d');
      const ctx2d = new Proxy(real, { get: (t, m) => { const v = t[m as string]; return typeof v === 'function' && m !== 'measureText' ? (...a: unknown[]) => { rec.ops++; return (v as (...x: unknown[]) => unknown)(...a); } : v; }, set: () => true });
      return new Proxy(el, { get: (t, k) => (k === 'getContext' ? () => ctx2d : t[k as string]), set: (t, k, v) => { t[k as string] = v; return true; } });
    };
    const poster = () => all.filter(c => c.el.width === 360 && c.el.height === 504);
    try {
      const dt = 0.1, day = arena.info()!.day;
      for (let k = 0; k < 40; k++) host.frame(dt);
      const quiet = canvases.length;
      for (let k = 0; k < 30; k++) host.frame(dt);
      expect(canvases.length, 'nothing changed: nothing redrawn').toBe(quiet);

      // a result comes in: one new picture, drawn over a few frames (at least three of them draw)
      posters.setResult(day, 'Babacar bat Lamine, victoire par chute');
      const perFrame: number[] = [];
      for (let k = 0; k < 25; k++) { const before = poster().reduce((t, c) => t + c.ops, 0); host.frame(dt); perFrame.push(poster().reduce((t, c) => t + c.ops, 0) - before); }
      expect(canvases.length - quiet, 'one canvas for the new picture').toBe(1);
      const drawing = perFrame.filter(n => n > 0);
      expect(drawing.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...drawing)).toBeLessThan(poster()[poster().length - 1].ops * 0.7);      // no frame draws most of it

      // on the tiers: a new result waits
      host.hour = 19;
      const a0 = arena.info()!;
      host.ctx.state.data.counters.arena_ticket_day = a0.day;
      host.sit(host.seat(arena.freeSeat(a0.centre.x + 9, a0.centre.z - 14)!.id));
      for (let k = 0; k < 10; k++) host.frame(dt);
      const seated = canvases.length;
      posters.setResult(day, 'Gora bat Pape, victoire aux points');
      for (let k = 0; k < 60; k++) host.frame(dt);
      expect(canvases.length, 'six seconds on the tiers: not drawn').toBe(seated);

      // out in the street: drawn within a second or two
      host.stand(); host.place(6, -66.3, 1.0);
      for (let k = 0; k < 25; k++) host.frame(dt);
      expect(canvases.length - seated, 'drawn once out').toBe(1);
    } finally { g.document.createElement = make; }
  }, 120000);
});
