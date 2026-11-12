import { describe, expect, it } from 'vitest';
import {
  PRELIM, PRELIM_COUNT, PRELIM_FILL_END, PRELIM_FROM, PRELIM_NAMES, PRELIM_TYPICAL, prelimFill, prelimName, prelimSeed, timeline, undercardFor,
} from '../src/arena/undercard';
import { SHOW, SHOW_PHASES, boutSeed } from '../src/arena/program';
import { STYLES } from '../src/lamb/rules';
import { arenaField, reference } from '../src/arena/together';
import { parseArena, ARENA_PHASES } from '../src/multiplayer/protocol';

const P = (name: typeof ARENA_PHASES[number]) => ARENA_PHASES.indexOf(name);

describe('the preliminaries of a fight evening', () => {
  it('come between the stands filling and the main event\'s entrance', () => {
    expect(SHOW_PHASES.indexOf('prelims')).toBe(SHOW_PHASES.indexOf('filling') + 1);
    expect(SHOW_PHASES.indexOf('entrance')).toBe(SHOW_PHASES.indexOf('prelims') + 1);
  });
  it('two to four on a gala night, one or two on a weekday card, the same card on every device', () => {
    const seen = { gala: new Set<number>(), card: new Set<number>() };
    for (let day = 1; day < 120; day++) for (const size of ['gala', 'card'] as const) {
      const u = undercardFor('pikine', day, size);
      const [lo, hi] = PRELIM_COUNT[size];
      expect(u.length).toBeGreaterThanOrEqual(lo); expect(u.length).toBeLessThanOrEqual(hi);
      seen[size].add(u.length);
      expect(undercardFor('pikine', day, size)).toEqual(u);                                    // deterministic
    }
    expect([...seen.gala].sort()).toEqual([2, 3, 4]);
    expect([...seen.card].sort()).toEqual([1, 2]);
  });
  it('each one seeded by the evening\'s seed + 1 + i, never the main event\'s own', () => {
    for (let day = 1; day < 40; day++) {
      const u = undercardFor('pikine', day, 'gala');
      u.forEach((p, i) => { expect(p.i).toBe(i); expect(p.seed).toBe(prelimSeed('pikine', day, i)); expect(p.seed).toBe((boutSeed('pikine', day) + 1 + i) >>> 0); });
      expect(u.map(p => p.seed)).not.toContain(boutSeed('pikine', day));
      expect(new Set(u.map(p => p.seed)).size).toBe(u.length);
    }
    expect(prelimSeed('pikine', 12, 0)).not.toBe(prelimSeed('plateau', 12, 0));
  });
  it('young wrestlers with generic local names, each once in the evening, the main event\'s names kept out', () => {
    for (let day = 1; day < 60; day++) {
      const u = undercardFor('pikine', day, 'gala', ['Modou Faye', 'Pape']);
      const names = u.flatMap(p => [p.left.name, p.right.name]);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) { expect(PRELIM_NAMES).toContain(n); expect(['Modou', 'Pape']).not.toContain(n); }
      for (const p of u) {
        expect(PRELIM_FROM).toContain(p.left.from); expect(PRELIM_FROM).toContain(p.right.from);
        expect(STYLES[p.style]).toBeTruthy(); expect([1, 2]).toContain(p.level);
        expect(p.look.ngembColor).not.toBe(STYLES[p.style].ngemb);                             // two different ngembs in the ring
      }
    }
    expect(prelimName({ name: 'Modou', from: 'Thiaroye' })).toBe('Modou (Thiaroye)');
  });
  it('the stands fill during the preliminaries and are nearly full for the main entrance', () => {
    const n = 3, start = 0.42;
    let last = 0;
    for (let done = 0; done < n; done++) for (let f = 0; f <= 1; f += 0.25) {
      const v = prelimFill(start, done, n, f);
      expect(v).toBeGreaterThanOrEqual(last); last = v;
    }
    expect(prelimFill(start, 0, n, 0)).toBeCloseTo(start);
    expect(prelimFill(start, n - 1, n, 1)).toBeCloseTo(PRELIM_FILL_END);
    expect(prelimFill(start, n, n, 5)).toBeCloseTo(PRELIM_FILL_END);                           // never over
    expect(prelimFill(0.98, 0, n, 0)).toBe(0.98);                                               // already full: unchanged
  });
  it('the timeline at 1×: the first preliminary within a minute of sitting down, the main event after them', () => {
    // a gala night with three preliminaries, one ended early by a fall, the others at time-out
    const t = timeline({ filling: SHOW.filling, entrance: SHOW.entrance, result: SHOW.result, leaving: SHOW.leaving, prelimBouts: [PRELIM.intro + PRELIM.round, 18, PRELIM.intro + PRELIM.round], main: 60 });
    expect(t.toFirstPrelim).toBeLessThan(60); expect(t.toFirstBout).toBeLessThan(60);
    expect(t.toFirstBout).toBe(SHOW.filling + PRELIM.walk);
    for (const p of t.prelims) expect(p).toBeLessThanOrEqual(PRELIM_TYPICAL + 0.01);
    expect(t.toEntrance).toBeCloseTo(SHOW.filling + t.prelims.reduce((a, b) => a + b, 0));
    expect(t.total).toBeGreaterThan(t.toMainBout);
  });
});

describe('friends follow the preliminaries like the main bout', () => {
  it('the friend furthest on is the reference: a later preliminary beats a later time in an earlier one', () => {
    const friends = [{ id: 'b', p: P('prelims'), i: 0, t: 30 }, { id: 'c', p: P('prelims'), i: 1, t: 2 }];
    expect(reference({ p: P('prelims'), i: 0, t: 31 }, friends)?.id).toBe('c');              // ahead by a preliminary
    expect(reference({ p: P('prelims'), i: 1, t: 1 }, friends)).toBeNull();                    // within the slack
    expect(reference({ p: P('prelims'), i: 1, t: 0 }, [{ id: 'c', p: P('prelims'), i: 1, t: 4 }])?.id).toBe('c');
    expect(reference({ p: P('prelims'), i: 2, t: 0 }, friends)).toBeNull();                    // never backwards
    expect(reference({ p: P('filling'), t: 1 }, friends)?.id).toBe('c');
    expect(reference({ p: P('entrance'), t: 0 }, friends)).toBeNull();
  });
  it('the presence field names the preliminary, only during the preliminaries, and passes the protocol', () => {
    const st = { day: 12, phase: 'prelims', t: 14.3, i: 2, result: null, here: true };
    const f = arenaField(st)!;
    expect(f).toEqual({ d: 12, p: P('prelims'), t: 14, i: 2 });
    expect(parseArena(f)).toEqual(f);
    expect(arenaField({ ...st, phase: 'bout' })).not.toHaveProperty('i');
  });
});
