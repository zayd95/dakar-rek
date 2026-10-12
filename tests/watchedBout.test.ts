import { describe, expect, it } from 'vitest';
import { WatchedBout } from '../src/arena/bout';
import { boutSeed } from '../src/arena/program';
import type { PilotView } from '../src/lamb/duel';

/**
 * The evening's watched bout in the game's default làmb (sans frappe), which the browser check plays at six steps a frame:
 * the pilot reads the duel through `pilotView` (no `info()` object per step) and the show hears of a phase change once.
 * The results below were recorded before that change (same seeds, same code otherwise): a bout seeded alike plays out alike.
 */
const look = { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] };

function play(day: number, frame = 0.1) {
  const b = new WatchedBout({ x: 30, z: -30 }, look as never, boutSeed('pikine', day), {});
  const phases: string[] = [];
  b.onMoment = p => { phases.push(`${b.time.toFixed(2)}:${p}`); };
  for (let t = 0; t < 300 && !b.over; t += frame) b.advance(frame);
  const r = b.result;
  const out = { over: b.over, time: b.time, phases, result: r ? { winner: r.winner, outcome: r.outcome, seconds: r.seconds, score: r.score, stamina: r.stamina } : null };
  b.dispose();
  return out;
}

const GOLDEN: Record<number, { time: number; phases: string[]; winner: string; outcome: string; seconds: number; stamina: { player: number; opponent: number }; guards: number; grabs: number }> = {
  40: { time: 8.266666666666666, phases: ['0.00:intro', '2.20:fight', '3.22:clinch', '5.83:fall', '8.25:result'], winner: 'player', outcome: 'projection', seconds: 3.633333333333127, stamina: { player: 57, opponent: 54 }, guards: 0, grabs: 1 },
  41: { time: 9.866666666666667, phases: ['0.00:intro', '2.20:fight', '3.55:clinch', '4.03:fight', '4.82:clinch', '7.43:fall', '9.85:result'], winner: 'player', outcome: 'projection', seconds: 5.233333333333036, stamina: { player: 42, opponent: 0 }, guards: 2, grabs: 2 },
  42: { time: 10.533333333333333, phases: ['0.00:intro', '2.20:fight', '3.23:clinch', '4.72:fight', '5.48:clinch', '8.10:fall', '10.52:result'], winner: 'player', outcome: 'projection', seconds: 5.899999999999665, stamina: { player: 34, opponent: 3 }, guards: 1, grabs: 2 },
  43: { time: 9.9, phases: ['0.00:intro', '2.20:fight', '4.85:clinch', '7.47:fall', '9.88:result'], winner: 'player', outcome: 'projection', seconds: 5.266666666666367, stamina: { player: 57, opponent: 47 }, guards: 1, grabs: 1 },
};

describe('the watched bout, sans frappe', () => {
  for (const day of [40, 41, 42, 43]) {
    it(`day ${day}: the same bout as before the pilot stopped building info() at every step`, () => {
      const a = play(day), g = GOLDEN[day];
      expect(a.over).toBe(true);
      expect(a.time).toBeCloseTo(g.time, 9);
      expect(a.phases).toEqual(g.phases);
      expect(a.result).toMatchObject({ winner: g.winner, outcome: g.outcome, stamina: g.stamina });
      expect(a.result!.seconds).toBeCloseTo(g.seconds, 9);
      expect(a.result!.score.player).toMatchObject({ guards: g.guards, grabs: g.grabs });
    });
  }

  it('the frame rate does not change the bout (fixed steps): 1/60 s frames and 0.1 s frames play the same one', () => {
    const slow = play(41, 0.1), fast = play(41, 1 / 60);
    expect(fast.phases.map(p => p.split(':')[1])).toEqual(slow.phases.map(p => p.split(':')[1]));
    expect(fast.result).toEqual(slow.result);
  });

  it('the show hears of each phase once, when it begins', () => {
    const a = play(42);
    const names = a.phases.map(p => p.split(':')[1]);
    expect(names).toEqual(['intro', 'fight', 'clinch', 'fight', 'clinch', 'fall', 'result']);
  });

  it('pilotView says what info() says, at every step of a bout', () => {
    const b = new WatchedBout({ x: 30, z: -30 }, look as never, boutSeed('pikine', 41), {});
    const v: PilotView = { phase: '', dist: 0, windup: false, open: null, stamina: { player: 0, opponent: 0 }, clinch: null };
    let clinch = 0, seen = 0;
    for (let t = 0; t < 300 && !b.over; t += 1 / 60) {
      b.advance(1 / 60);
      const i = b.info() as unknown as { phase: string; dist: number; windup: boolean; open: string | null; stamina: { player: number; opponent: number }; clinch: { losing: boolean; breakWindow: boolean } | null };
      b.duel.pilotView(v);
      expect(v.phase).toBe(i.phase); expect(v.dist).toBe(i.dist); expect(v.windup).toBe(i.windup); expect(v.open).toBe(i.open);
      expect(v.stamina).toEqual(i.stamina);
      expect(v.clinch === null).toBe(i.clinch === null);
      if (i.clinch && v.clinch) { clinch++; expect(v.clinch.losing).toBe(i.clinch.losing); expect(v.clinch.breakWindow).toBe(i.clinch.breakWindow); }
      seen++;
    }
    expect(seen).toBeGreaterThan(300);
    expect(clinch).toBeGreaterThan(30);                                                      // the empoignades were compared too
    b.dispose();
  });

  it('fighterXZ is where the two stand', () => {
    const b = new WatchedBout({ x: 30, z: -30 }, look as never, boutSeed('pikine', 41), {});
    for (let k = 0; k < 400; k++) b.advance(1 / 60);
    const p = b.duel.fighterXZ([0, 0, 0, 0]), pts = b.duel.fighterPoints();
    expect([p[0], p[1], p[2], p[3]]).toEqual([pts[1][0], pts[1][2], pts[4][0], pts[4][2]]);
    b.dispose();
  });
});
