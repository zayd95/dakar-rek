import { describe, expect, it } from 'vitest';
import { PRELIM, undercardFor } from '../src/arena/undercard';
import { WatchedBout } from '../src/arena/bout';
import { FRIENDLY_MORE, STYLE_MAP, localOpponent, localPair, rosterOpponent, stylesOn } from '../src/lamb/opponents';
import { STAND_STYLES, STYLE6_IDS } from '../src/lamb/stand';
import { CLINCH_STYLES } from '../src/lamb/clinch';
import { STYLES } from '../src/lamb/rules';
import { ROSTER } from '../src/career/roster';

/**
 * Làmb 2.0 on the evening's preliminaries (src/arena/undercard.ts, wave 5): with ?lamb2 each preliminary is fought avec
 * frappe, AI against AI, the pair being WatchedBout's frappe bill. The young wrestlers are generic local ones, each with
 * a style of the six drawn from the preliminary's seed (`prelimSeed`), so everyone in the stands watches the same bout.
 */
const cards = () => {
  const out = [];
  for (const hub of ['pikine', 'plateau']) for (let day = 30; day < 60; day++) out.push(...undercardFor(hub, day, 'gala'));
  return out;
};
function play(p: ReturnType<typeof undercardFor>[number]) {
  const frappe = localPair(p.seed, p.left, p.right, p.style, p.level);
  const b = new WatchedBout({ x: 0, z: 0 }, p.look, p.seed, { style: { ...STYLES[p.style], name: p.right.name }, level: p.level, round: PRELIM.round, frappe });
  for (let i = 0; i < 60 * 60 && !b.over; i++) b.advance(1 / 60);
  const r = b.result, i = b.info() as Record<string, unknown>;
  b.dispose();
  return { frappe: b.frappe, discipline: i.discipline, time: b.time, winner: r?.winner ?? null, outcome: r?.outcome ?? null, score: r?.score ?? null };
}

describe('làmb 2.0 · the preliminaries avec frappe', () => {
  it('each young wrestler gets a style of the six from the preliminary’s seed: the same pair every time', () => {
    for (const p of cards().slice(0, 40)) {
      const a = localPair(p.seed, p.left, p.right, p.style, p.level), b = localPair(p.seed, p.left, p.right, p.style, p.level);
      expect(b).toEqual(a);
      expect(STYLE6_IDS).toContain(a.left.style); expect(STYLE6_IDS).toContain(a.right.style);
      // the right one stands on his card style (the duel's colours, his ngemb), the left one is any of the six
      expect(stylesOn(p.style)).toContain(a.right.style);
      expect(a.right.wrestler.style).toBe(p.style);
      expect(a.left.level).toBe(p.level); expect(a.right.level).toBe(p.level);
    }
  });
  it('over the evenings, every one of the six styles turns up on both sides of the card it can', () => {
    const left = new Set<string>(), right = new Set<string>();
    for (const p of cards()) { const x = localPair(p.seed, p.left, p.right, p.style, p.level); left.add(x.left.style); right.add(x.right.style); }
    expect([...left].sort()).toEqual([...STYLE6_IDS].sort());
    expect([...right].sort()).toEqual([...STYLE6_IDS].sort());
  });
  it('a local wrestler is not a roster one: no écurie, no record, his style’s AI and attribute shape', () => {
    const o = localOpponent({ name: 'Pape', from: 'Thiaroye' }, 'frappeur', 1);
    expect(o.wrestler.id).toBe('local:Pape:Thiaroye');
    expect(ROSTER.some(w => w.id === o.wrestler.id)).toBe(false);
    expect(o.record).toBeNull(); expect(o.wrestler.ecurie).toBeNull();
    expect(o.stand).toBe(STAND_STYLES.frappeur); expect(o.clinch).toBe(CLINCH_STYLES.frappeur);
    expect(o.line).toBe('Pape (Thiaroye), bon frappeur');
  });
  it('fought avec frappe, AI against AI: the same seed plays the same bout to the same result, twice', () => {
    const p = cards()[3];
    const a = play(p), b = play(p);
    expect(a.frappe).toBe(true); expect(a.discipline).toBe('avec_frappe');
    expect(a.outcome).not.toBeNull();
    expect(b).toEqual(a);
  });
  it('different preliminaries give different bouts', () => {
    const ps = cards().slice(0, 6).map(play);
    expect(new Set(ps.map(x => `${x.time}|${x.winner}|${x.outcome}`)).size).toBeGreaterThan(1);
  });
  it('every preliminary of sixty evenings ends by a fall or the referee within its 30-s round (with the intro and the fall)', () => {
    const all = cards().map(play);
    expect(all.length).toBeGreaterThan(100);
    for (const x of all) {
      expect(['projection', 'decision', 'egalite']).toContain(x.outcome);
      expect(x.time).toBeLessThanOrEqual(PRELIM.round + 8);
    }
    expect(all.filter(x => x.outcome === 'projection').length / all.length).toBeGreaterThanOrEqual(0.85);
  });
});

describe('làmb 2.0 · the friendly bouts avec frappe reach every style', () => {
  it('Ousmane, Malick and Daouda add the three other styles to Gora, Pape and Saliou', () => {
    const names = ['Gora', 'Pape', 'Saliou', ...FRIENDLY_MORE.map(f => f.name)];
    expect(names).toEqual(['Gora', 'Pape', 'Saliou', 'Ousmane', 'Malick', 'Daouda']);
    const styles = names.map(n => rosterOpponent(n, 40)!.style);
    expect([...styles].sort()).toEqual([...STYLE6_IDS].sort());
    for (const f of FRIENDLY_MORE) { expect(f.hint.length).toBeGreaterThan(20); expect(STYLE_MAP[rosterOpponent(f.name, 40)!.style].word).toBeTruthy(); }
  });
});
