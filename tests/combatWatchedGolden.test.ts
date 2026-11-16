import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WatchedBout } from '../src/arena/bout';
import { boutSeed } from '../src/arena/program';
import { rosterOpponent } from '../src/lamb/opponents';
import { STYLES } from '../src/lamb/rules';

/**
 * Watched bouts stay what they were (docs/wrestling/COMBAT.md « Determinism »): the evening's bouts, sans frappe and avec
 * frappe, AI against AI, seeded and in fixed steps, are not the player's bout and never take the combat engine. Their
 * full traces were recorded at 87076f3f (before the combat package: `GOLDEN_WRITE=1 npx vitest run
 * tests/combatWatchedGolden.test.ts`) and must come out byte for byte the same.
 */
const FILE = new URL('./fixtures/watched-golden.json', import.meta.url);
const look = { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] };

function trace(b: WatchedBout): string[] {
  const out: string[] = [];
  for (let t = 0; t < 240 && !b.over; t += 0.25) {
    b.advance(0.25);
    const i = b.info() as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    out.push([b.time.toFixed(3), i.phase, i.dist, JSON.stringify(i.stamina), JSON.stringify(i.balance ?? null), JSON.stringify(i.clinch ?? null), JSON.stringify(i.lastStrike ?? null), JSON.stringify(i.lastThrow ?? null)].join(' '));
  }
  const r = b.result;
  out.push(JSON.stringify(r ? { winner: r.winner, outcome: r.outcome, seconds: r.seconds, score: r.score, stamina: r.stamina } : null));
  b.dispose();
  return out;
}
function bouts(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const day of [40, 41, 42]) {
    const seed = boutSeed('pikine', day);
    out[`frappe:${day}`] = trace(new WatchedBout({ x: 30, z: -30 }, look, seed, { frappe: { left: rosterOpponent('Babacar', day)!, right: rosterOpponent('Lamine', day)! } }));
    out[`frappe2:${day}`] = trace(new WatchedBout({ x: 0, z: 0 }, look, seed ^ 77, { frappe: { left: rosterOpponent('Daouda', day)!, right: rosterOpponent('Ousmane', day)! } }));
    out[`sans:${day}`] = trace(new WatchedBout({ x: 30, z: -30 }, look, seed, { style: STYLES.costaud, level: 3 }));
    out[`sansprelim:${day}`] = trace(new WatchedBout({ x: 0, z: 0 }, look, seed ^ 99, { style: STYLES.rapide, level: 2, round: 30 }));
  }
  return out;
}

describe('combat · watched bouts are untouched (golden traces from 87076f3f)', () => {
  it('twelve watched bouts, both disciplines, replay exactly as recorded before the combat package', () => {
    const now = bouts();
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GOLDEN_WRITE) { fs.mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(now)); }
    const before = JSON.parse(new TextDecoder().decode(fs.readFileSync(FILE))) as Record<string, string[]>;
    expect(Object.keys(now)).toEqual(Object.keys(before));
    for (const k of Object.keys(before)) expect(now[k], k).toEqual(before[k]);
    for (const k of Object.keys(before)) expect(before[k].length, k).toBeGreaterThan(8);
  });
});
