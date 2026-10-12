import { describe, expect, it, vi } from 'vitest';
import { GALA_DAY, PerfHost } from './perfHost';
import { STAND_VENDORS } from '../src/arena/people';

/** A vendor walking the stands builds what he sells the first time someone is in reach, not at every frame they stay there. */
type ArenaDbg = { info(): { centre: { x: number; z: number }; day: number; people: { vendors: { id: string; x?: number; z?: number; shown?: boolean }[] } } | null; day(d: number | null): void; freeSeat(x: number, z: number): { id: string } | null };

describe('the stands’ vendors', () => {
  it('build their offers once while the player stays in reach', async () => {
    const spies = STAND_VENDORS.map(v => vi.spyOn(v, 'offers'));
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 19);
    const arena = host.debug<ArenaDbg>('arena');
    arena.day(GALA_DAY);
    const a = arena.info()!;
    host.ctx.state.data.counters.arena_ticket_day = a.day;
    host.sit(host.seat(arena.freeSeat(a.centre.x + 9, a.centre.z - 14)!.id));
    for (let k = 0; k < 60; k++) host.frame(0.1);
    // stand right beside a vendor who is shown (he walks his arc; stay with him for three seconds)
    let near = 0, calls = 0;
    for (let k = 0; k < 40; k++) {
      const v = arena.info()!.people.vendors.find(x => x.shown && x.x !== undefined);
      if (!v) { host.frame(0.1); continue; }
      host.stand();
      host.place(v.x!, v.z!, 0);
      host.frame(0.1); near++;
    }
    calls = spies.reduce((t, s) => t + s.mock.calls.length, 0);
    expect(near, 'a vendor was in reach').toBeGreaterThan(20);
    expect(calls, 'built once per vendor kind at most, not 20 or 30 times').toBeLessThanOrEqual(STAND_VENDORS.length);
    vi.restoreAllMocks();
  }, 120000);
});
