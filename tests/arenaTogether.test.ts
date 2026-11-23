import { describe, expect, it } from 'vitest';
import { arenaField, reference, resultCodes, resultOf, seatAt } from '../src/arena/together';
import { boutSeed, standSeats } from '../src/arena/program';
import { parseArena, ARENA_PHASES } from '../src/multiplayer/protocol';

const P = (name: typeof ARENA_PHASES[number]) => ARENA_PHASES.indexOf(name);

describe('friends at the arena', () => {
  it('follow the friend furthest on (the earliest in), forward only, past a small slack', () => {
    const friends = [{ id: 'b', p: P('entrance'), t: 6 }, { id: 'c', p: P('bout'), t: 12 }, { id: 'd', p: P('filling'), t: 2 }];
    expect(reference({ p: P('filling'), t: 1 }, friends)?.id).toBe('c');
    expect(reference({ p: P('bout'), t: 11 }, friends)).toBeNull();                    // within the slack: no jump
    expect(reference({ p: P('bout'), t: 9 }, friends)?.id).toBe('c');
    expect(reference({ p: P('result'), t: 0 }, friends)).toBeNull();                   // never backwards
    expect(reference({ p: 0, t: 0 }, friends)?.id).toBe('c');                          // not started yet: join the running show
    // only running shows lead (not before the doors, not after the gala); ties go to the smaller id
    expect(reference({ p: P('filling'), t: 0 }, [{ id: 'x', p: P('over'), t: 3 }, { id: 'y', p: P('idle'), t: 0 }])).toBeNull();
    expect(reference({ p: P('filling'), t: 0 }, [{ id: 'z', p: P('bout'), t: 5 }, { id: 'a', p: P('bout'), t: 5 }])?.id).toBe('a');
    expect(reference({ p: P('filling'), t: 0 }, [])).toBeNull();
  });
  it('a remote sitter holds the place on the tiers under them', () => {
    const seats = standSeats(0, 0, 'pikine:arena:stand');
    const s = seats[40];
    expect(seatAt(seats, s.x + 0.1, s.z - 0.1)?.id).toBe(s.id);
    expect(seatAt(seats, 0, 0)).toBeNull();                                            // in the ring: no place
  });
  it('results travel as codes and come back the same', () => {
    for (const r of [{ winner: 'left', outcome: 'projection' }, { winner: 'right', outcome: 'decision' }, { winner: null, outcome: 'egalite' }, { winner: null, outcome: 'abandon' }] as const) {
      const c = resultCodes(r); expect(resultOf(c.w, c.o)).toEqual(r);
    }
    expect(resultOf(1)).toBeNull(); expect(resultOf(1, 9)).toBeNull();
  });
  it('the presence field is sent only while a show runs and the player is there, and always passes the protocol', () => {
    const st = { day: 12, phase: 'bout', t: 41.26, result: null, here: true };
    expect(arenaField(st)).toEqual({ d: 12, p: P('bout'), t: 41 });
    expect(arenaField({ ...st, here: false })).toBeNull();
    expect(arenaField({ ...st, phase: 'over' })).toBeNull();
    expect(arenaField({ ...st, phase: 'idle' })).toBeNull();
    expect(arenaField(null)).toBeNull();
    const done = arenaField({ ...st, phase: 'result', t: 3.7, result: { winner: 'right', outcome: 'projection' } })!;
    expect(done).toEqual({ d: 12, p: P('result'), t: 3.5, w: 2, o: 0 });
    for (const f of [done, arenaField(st)!, arenaField({ ...st, t: 5000 })!]) expect(parseArena(f)).toEqual(f);
  });
  it('the evening\'s bout is seeded by hub and day: the same bout for everyone that evening', () => {
    expect(boutSeed('pikine', 12)).toBe(boutSeed('pikine', 12));
    expect(boutSeed('pikine', 12)).not.toBe(boutSeed('pikine', 13));
    expect(boutSeed('pikine', 12)).not.toBe(boutSeed('plateau', 12));
  });
});
