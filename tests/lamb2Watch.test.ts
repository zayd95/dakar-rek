import { describe, expect, it } from 'vitest';
import { WatchedBout } from '../src/arena/bout';
import { boutSeed } from '../src/arena/program';
import { rosterOpponent } from '../src/lamb/opponents';

/**
 * The evening's watched bout avec frappe (Làmb 2.0): two roster wrestlers, AI against AI, seeded by the evening
 * (boutSeed) and played in fixed steps — every device in the stands must see the same bout and the same result.
 */
const look = { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] };
function play(seed: number, day = 40) {
  const left = rosterOpponent('Babacar', day)!, right = rosterOpponent('Lamine', day)!;
  const b = new WatchedBout({ x: 30, z: -30 }, look, seed, { left, right });
  const trace: string[] = [];
  let last = '';
  for (let t = 0; t < 240 && !b.over; t += 0.5) {
    b.advance(0.5);
    const i = b.info() as Record<string, unknown> & { phase: string; lastStrike?: { by: string; kind: string; result: string } | null; clinch?: { last?: { result: string } | null } | null; lastThrow?: { result: string } | null };
    const k = [i.phase, i.lastStrike ? `${i.lastStrike.by}:${i.lastStrike.kind}:${i.lastStrike.result}` : '', i.clinch?.last?.result ?? '', i.lastThrow?.result ?? ''].join('|');
    if (k !== last) { trace.push(`${b.time.toFixed(2)} ${k}`); last = k; }
  }
  const r = b.result;
  b.dispose();
  return { over: b.over, time: b.time, trace, result: r ? { winner: r.winner, outcome: r.outcome, seconds: r.seconds, score: r.score, stamina: r.stamina } : null };
}

describe('làmb 2.0 · the evening’s bout avec frappe, AI against AI', () => {
  it('the same seed plays the same bout to the same result, twice', () => {
    const seed = boutSeed('pikine', 40);
    const a = play(seed), b = play(seed);
    expect(a.over).toBe(true);
    expect(a.result).not.toBeNull();
    expect(b).toEqual(a);
  });
  it('it is fought avec frappe: strikes are thrown and the bout ends by the fall or the referee', () => {
    const a = play(boutSeed('pikine', 41));
    expect(a.trace.some(l => /\|player:|\|opponent:/.test(l))).toBe(true);                 // strikes on both sides or one
    expect(['projection', 'decision', 'egalite']).toContain(a.result!.outcome);
  });
  it('different days give different bouts', () => {
    const runs = [40, 41, 42, 43].map(d => play(boutSeed('pikine', d)));
    const keys = new Set(runs.map(r => JSON.stringify([r.time, r.result, r.trace.slice(0, 12)])));
    expect(keys.size).toBeGreaterThan(1);
  });
});
