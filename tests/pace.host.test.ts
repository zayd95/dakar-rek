import { describe, expect, it, vi } from 'vitest';
import { GALA_DAY, PerfHost } from './perfHost';
import { StreetLife } from '../src/crowd/street';
import { ArenaArrivals } from '../src/crowd/arrivals';
import { LineVehicle } from '../src/transport/vehicle';
import { ArenaStands } from '../src/crowd/arenaStands';
import { FightNightPeople } from '../src/arena/people';
import { HIDDEN_EVERY } from '../src/game/pace';

/**
 * The street outside the arena's walls goes on at 4 Hz with the time gone by while the player sits on the tiers (whole
 * frame on the perf host, as the browser check plays it: frames of 0.1 s), and at every frame again outside.
 */
type ArenaDbg = { info(): { phase: string; centre: { x: number; z: number }; day: number } | null; freeSeat(x: number, z: number): { id: string } | null; day(d: number | null): void };
type OutDbg = { arenaOut(): { drawn: number; present: number; active?: boolean } };

describe('the street while the player sits inside the walls', () => {
  it('is updated every third 0.1 s frame with all the time gone by, and every frame outside', async () => {
    const street = vi.spyOn(StreetLife.prototype, 'update'), arrivals = vi.spyOn(ArenaArrivals.prototype, 'update'), cars = vi.spyOn(LineVehicle.prototype, 'update');
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
    const arena = host.debug<ArenaDbg>('arena');
    arena.day(GALA_DAY);
    const dt = 0.1, sum = (spy: typeof street | typeof arrivals) => spy.mock.calls.reduce((t, c) => t + (c[0] as number), 0);
    for (let k = 0; k < 80; k++) host.frame(dt);

    // outside, in front of the gate: every frame, as always
    street.mockClear(); arrivals.mockClear(); cars.mockClear();
    for (let k = 0; k < 40; k++) host.frame(dt);
    expect(street.mock.calls.length).toBe(40);
    expect(arrivals.mock.calls.length).toBe(40);
    expect(sum(street)).toBeCloseTo(4, 6);
    const carsOutside = cars.mock.calls.length;
    expect(carsOutside).toBeGreaterThan(0);

    // seated on the tiers (the camera inside the walls): a third of the calls, the same time
    host.hour = 19;
    const a0 = arena.info()!;
    host.ctx.state.data.counters.arena_ticket_day = a0.day;
    host.sit(host.seat(arena.freeSeat(a0.centre.x + 9, a0.centre.z - 14)!.id));
    for (let k = 0; k < 10; k++) host.frame(dt);                          // (the camera gets to the seat; the interval it is owed settles)
    street.mockClear(); arrivals.mockClear(); cars.mockClear();
    for (let k = 0; k < 60; k++) host.frame(dt);
    expect(street.mock.calls.length).toBe(20);
    expect(arrivals.mock.calls.length).toBe(20);
    expect(sum(street)).toBeGreaterThan(6 - 2 * dt - 1e-9);   // 6 s gone by (less what the next call is still owed)
    expect(sum(street)).toBeLessThanOrEqual(6 + 2 * dt + 1e-9);
    for (const c of street.mock.calls) expect(c[0] as number).toBeGreaterThanOrEqual(HIDDEN_EVERY - 1e-9);
    expect(cars.mock.calls.length / 60).toBeLessThan(carsOutside / 40 / 2);   // the car rapide line follows at 4 Hz too (per frame)

    // up from the seat and out of the walls: every frame again, at once
    host.stand();
    host.place(6, -66.3, 1.0);
    for (let k = 0; k < 30; k++) host.frame(dt);
    street.mockClear();
    for (let k = 0; k < 20; k++) host.frame(dt);
    expect(street.mock.calls.length).toBe(20);
    vi.restoreAllMocks();
  }, 120000);
});

describe('the arena’s own show and stands, and the fans in the street', () => {
  it('seen from the street (not near a gate) they follow at 4 Hz, near a gate or on the tiers at every frame; the fans outside are not drawn from the tiers', async () => {
    const stands = vi.spyOn(ArenaStands.prototype, 'update'), people = vi.spyOn(FightNightPeople.prototype, 'update');
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
    const arena = host.debug<ArenaDbg>('arena'), out = host.debug<OutDbg['arenaOut']>('arenaOut');
    arena.day(GALA_DAY);
    const dt = 0.1, sum = (spy: typeof stands | typeof people) => spy.mock.calls.reduce((t, c) => t + (c[0] as number), 0);
    for (let k = 0; k < 120; k++) host.frame(dt);
    const a = arena.info()!, C = a.centre;
    expect(out().drawn, 'the fans queueing at the gate are drawn').toBeGreaterThan(0);

    // 45 m from the middle, to the north: the walls hide the show and the stands
    host.place(C.x, C.z + 45, 0);
    for (let k = 0; k < 10; k++) host.frame(dt);
    stands.mockClear(); people.mockClear();
    for (let k = 0; k < 60; k++) host.frame(dt);
    expect(stands.mock.calls.length).toBe(20); expect(people.mock.calls.length).toBe(20);
    expect(sum(stands)).toBeGreaterThan(6 - 2 * dt); expect(sum(stands)).toBeLessThanOrEqual(6 + 2 * dt);
    expect(sum(people)).toBeGreaterThan(6 - 2 * dt); expect(sum(people)).toBeLessThanOrEqual(6 + 2 * dt);

    // in front of the public gate: the show can be seen through it, every frame
    host.place(C.x, C.z - 21.7 - 5, Math.PI);
    for (let k = 0; k < 10; k++) host.frame(dt);
    stands.mockClear(); people.mockClear();
    for (let k = 0; k < 30; k++) host.frame(dt);
    expect(stands.mock.calls.length).toBe(30); expect(people.mock.calls.length).toBe(30);

    // on the tiers at the gala: every frame, and the street outside is drawn by nobody
    host.hour = 19;
    host.ctx.state.data.counters.arena_ticket_day = a.day;
    host.place(18, -66.3, 0.75);
    for (let k = 0; k < 20; k++) host.frame(dt);
    expect(out().drawn, 'still drawn from the gate at 19 h').toBeGreaterThan(0);
    host.sit(host.seat(arena.freeSeat(C.x + 9, C.z - 14)!.id));
    for (let k = 0; k < 40; k++) host.frame(dt);
    stands.mockClear();
    for (let k = 0; k < 30; k++) host.frame(dt);
    expect(stands.mock.calls.length).toBe(30);
    expect(out().drawn, 'the fans of the street are not drawn from inside the walls').toBe(0);
    vi.restoreAllMocks();
  }, 120000);
});

