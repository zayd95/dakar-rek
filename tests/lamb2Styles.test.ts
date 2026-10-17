import { describe, expect, it } from 'vitest';
import { rng } from '../src/core/rng';
import { STAND_STYLES, STYLE6_IDS, URGE, decide, rangeOf, react, standState, urgeOf, type Attributes, type StandStyle, type Style6 } from '../src/lamb/stand';
import { CLINCH, CLINCH_STYLES, URGE_CLINCH, clinchDecide, clinchUrge, holdTick, holder, wantsThrow, type ClinchStyle } from '../src/lamb/clinch';
import { ROSTER_STYLE6, STYLE_MAP, identityLine, rosterAttributes, rosterOpponent, style6Of } from '../src/lamb/opponents';
import { ROSTER } from '../src/career/roster';
import { WATCHED_ROUND, WatchedBout } from '../src/arena/bout';
import { boutSeed } from '../src/arena/program';

/**
 * The six styles of the spec (10 Oct. §12) avec frappe — Puissant (« costaud »: puts on pressure), Technique (looks for
 * the counters), Rapide (uses movement), Défensif (wears the other out), Bon frappeur (creates openings), Grand lutteur
 * de saisie (closes the distance fast). Each is one data entry: its stand-up AI, its empoignade preferences and throw
 * appetite, its attribute shape. Every test here measures a style against the five others.
 */
const SIX = STYLE6_IDS;
const stand = (s: Style6) => STAND_STYLES[s];
const clinch = (s: Style6) => CLINCH_STYLES[s];
/** The style that scores highest on `f`, and checks no other ties it. */
function top(f: (s: Style6) => number): Style6 {
  const sorted = [...SIX].sort((a, b) => f(b) - f(a));
  expect(f(sorted[0])).toBeGreaterThan(f(sorted[1]));
  return sorted[0];
}
const bottom = (f: (s: Style6) => number) => top(s => -f(s));
/** Share of `n` seeded draws for which `fn` is true. */
function rate(seed: number, n: number, fn: (r: () => number) => boolean) {
  const r = rng(seed); let x = 0;
  for (let i = 0; i < n; i++) if (fn(r)) x++;
  return x / n;
}
const sumOf = (a: Attributes) => Object.values(a).reduce((x, y) => x + y, 0);
const fresh = (s: Style6) => standState(stand(s).attrs, 100);
/** How often a style takes hold / strikes / guards at a distance, against a fresh opponent (level 1, 2000 draws). */
const standRate = (s: Style6, dist: number, what: 'grab' | 'strike' | 'big' | 'guard', urge = 0) =>
  rate(11, 2000, r => { const d = decide({ me: fresh(s), them: fresh('costaud'), dist, grabRange: 1.5 }, stand(s), 1, r, urge); return what === 'strike' ? !!d.strike : what === 'big' ? d.strike === 'big' : d[what]; });
/** How a style answers a big strike coming (2000 draws). */
const reactRate = (s: Style6, what: 'guard' | 'back' | 'counter') => rate(12, 2000, r => react('big', fresh(s), stand(s), 1, r()) === what);
const hold = (s: Style6, balance = 80, stamina = 100) => ({ ...holder({ stamina, balance, attrs: stand(s).attrs }) });

describe('làmb 2.0 · six styles: each one data entry, all of them complete', () => {
  it('the six of the spec, each with a stand-up AI, empoignade preferences, a throw appetite, an attribute shape and its word', () => {
    expect([...SIX]).toEqual(['costaud', 'technique', 'rapide', 'defensif', 'frappeur', 'saisie']);
    for (const s of SIX) {
      const st: StandStyle = stand(s), cl: ClinchStyle = clinch(s), m = STYLE_MAP[s];
      expect(m.stand).toBe(st); expect(m.clinch).toBe(cl);
      expect(m.word.length).toBeGreaterThan(3);
      expect(Object.keys(st.attrs).sort()).toEqual(['defense', 'endurance', 'equilibre', 'explosivite', 'force', 'frappe', 'sangfroid', 'technique']);
      for (const v of Object.values(st.attrs)) { expect(v).toBeGreaterThanOrEqual(30); expect(v).toBeLessThanOrEqual(85); }
      expect(cl.throwChance).toBeGreaterThan(0); expect(st.grab).toBeGreaterThan(0);
    }
    expect(new Set(SIX.map(s => STYLE_MAP[s].word)).size).toBe(6);
  });
  it('no style is a stat that wins: none has every attribute at least another’s, totals stay close', () => {
    for (const a of SIX) for (const b of SIX) if (a !== b) {
      const A = stand(a).attrs, B = stand(b).attrs;
      expect((Object.keys(A) as (keyof Attributes)[]).every(x => A[x] >= B[x])).toBe(false);
    }
    const sums = SIX.map(s => sumOf(stand(s).attrs));
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(80);
  });
});

describe('làmb 2.0 · Puissant (« costaud »): puts on pressure', () => {
  it('the strongest, close in, with the push and the heavy strike', () => {
    expect(top(s => stand(s).attrs.force - stand(s).attrs.technique)).toBe('costaud');
    expect([...SIX].sort((a, b) => stand(a).range - stand(b).range).slice(0, 2)).toEqual(['saisie', 'costaud']);
    expect(top(s => clinch(s).prefer.push / (clinch(s).prefer.push + clinch(s).prefer.pull + clinch(s).prefer.pivot))).toBe('costaud');
    expect(standRate('costaud', 1.6, 'big')).toBeGreaterThan(standRate('technique', 1.6, 'big'));
    expect(standRate('costaud', 1.6, 'big')).toBeGreaterThan(standRate('rapide', 1.6, 'big'));
  });
  it('walks forward where a mover or a defender keeps away', () => {
    const v = (s: Style6) => decide({ me: fresh(s), them: fresh('costaud'), dist: 1.6, grabRange: 1.5 }, stand(s), 1, () => 0.99).move;
    expect(v('costaud')).toBe(1); expect(v('defensif')).toBe(0);
  });
});

describe('làmb 2.0 · Technique: looks for the counters', () => {
  it('the best technique and composure, answers a big strike with a strike first more than anyone', () => {
    expect(top(s => stand(s).attrs.technique)).toBe('technique');
    expect(top(s => stand(s).react.counter)).toBe('technique');
    expect(top(s => reactRate(s, 'counter'))).toBe('technique');
  });
  it('reads the other’s move in the empoignade and answers it best', () => {
    expect(top(s => clinch(s).read)).toBe('technique');
    const answered = (s: Style6) => rate(13, 2000, r => { const me = hold(s), them = hold('costaud'); them.move = { kind: 'push', t: 0 }; return clinchDecide(me, them, 0, clinch(s), 1, 100, r) === 'pull'; });
    expect(top(answered)).toBe('technique');
  });
});

describe('làmb 2.0 · Rapide: uses movement', () => {
  it('the most explosive, steps back from a strike more than anyone, thinks fastest in the empoignade', () => {
    expect(top(s => stand(s).attrs.explosivite)).toBe('rapide');
    expect(top(s => reactRate(s, 'back'))).toBe('rapide');
    expect(bottom(s => clinch(s).think[0] + clinch(s).think[1])).toBe('rapide');
  });
  it('quick strikes rather than heavy ones', () => {
    expect(stand('rapide').quick).toBeGreaterThan(stand('rapide').big * 3);
  });
});

describe('làmb 2.0 · Défensif: wears the other out', () => {
  it('the best defence and endurance among the guards, keeps the longest distance, guards most', () => {
    expect(top(s => stand(s).attrs.defense)).toBe('defensif');
    expect(top(s => stand(s).range)).toBe('defensif');
    expect(top(s => standRate(s, 2.0, 'guard'))).toBe('defensif');
    expect(stand('defensif').attrs.endurance).toBeGreaterThanOrEqual(Math.max(...SIX.map(s => stand(s).attrs.endurance)));
  });
  it('a wrestler spent in the empoignade can no longer hold his balance: the one who tired first goes down', () => {
    const tired = hold('rapide', 80, 3), fresh2 = hold('defensif', 80, 60);
    for (let i = 0; i < 300; i++) { holdTick(tired, 0.01, 0); holdTick(fresh2, 0.01, 0); }
    expect(tired.balance).toBeLessThan(60);
    expect(fresh2.balance).toBeGreaterThanOrEqual(80);
    expect(CLINCH.spent).toBeGreaterThan(0);
  });
});

describe('làmb 2.0 · Bon frappeur: creates openings', () => {
  it('the best strike, strikes most at striking distance, the heaviest strikes', () => {
    expect(top(s => stand(s).attrs.frappe)).toBe('frappeur');
    expect(top(s => standRate(s, 1.7, 'strike'))).toBe('frappeur');
    expect(top(s => stand(s).big)).toBe('frappeur');
  });
  it('wants out of the empoignade (breaks free most when it goes against him) to strike again', () => {
    expect(top(s => clinch(s).breakFree)).toBe('frappeur');
    const breaks = (s: Style6) => rate(14, 2000, r => clinchDecide(hold(s), hold('costaud'), -60, clinch(s), 1, 100, r) === 'break');
    expect(top(breaks)).toBe('frappeur');
  });
});

describe('làmb 2.0 · Grand lutteur de saisie: closes the distance fast', () => {
  it('the shortest distance, takes hold most, never steps back', () => {
    expect(bottom(s => stand(s).range)).toBe('saisie');
    expect(top(s => stand(s).grab)).toBe('saisie');
    expect(top(s => standRate(s, 1.7, 'grab'))).toBe('saisie');
    expect(bottom(s => stand(s).react.back)).toBe('saisie');
  });
  it('at home in the empoignade: the most throws, never lets go; a wrestler’s body (force, balance, technique) over his strike', () => {
    expect(top(s => clinch(s).throwChance)).toBe('saisie');
    expect(bottom(s => clinch(s).breakFree)).toBe('saisie');
    const throws = (s: Style6) => rate(15, 2000, r => wantsThrow(hold(s), hold('costaud', 45), 25, clinch(s), 1, r));
    expect(top(throws)).toBe('saisie');
    expect(top(s => stand(s).attrs.force + stand(s).attrs.equilibre + stand(s).attrs.technique - stand(s).attrs.frappe)).toBe('saisie');
    expect(bottom(s => stand(s).attrs.frappe)).toBe('saisie');
  });
});

describe('làmb 2.0 · the referee presses a bout that goes nowhere', () => {
  it('standing: from URGE.after seconds without an empoignade, fully by URGE.full — closer, more grabs', () => {
    expect(urgeOf(0)).toBe(0); expect(urgeOf(URGE.after)).toBe(0); expect(urgeOf(URGE.full)).toBe(1); expect(urgeOf(99)).toBe(1);
    for (const s of SIX) {
      expect(rangeOf(stand(s), 1)).toBeLessThanOrEqual(Math.max(1.2, stand(s).range));
      expect(standRate(s, 1.7, 'grab', 1)).toBeGreaterThan(standRate(s, 1.7, 'grab', 0));
    }
  });
  it('in the empoignade: after URGE_CLINCH.after seconds a weaker position will do for a throw', () => {
    expect(clinchUrge(0)).toBe(0); expect(clinchUrge(URGE_CLINCH.full)).toBe(1);
    const at = (urge: number) => rate(16, 2000, r => wantsThrow(hold('technique'), hold('costaud', 80), 0, clinch('technique'), 1, r, urge));
    expect(at(0)).toBe(0);
    expect(at(1)).toBeGreaterThan(0);
  });
});

describe('làmb 2.0 · the roster on the six styles', () => {
  it('twelve wrestlers, two of each style, each a refinement of his career style', () => {
    expect(Object.keys(ROSTER_STYLE6).sort()).toEqual(ROSTER.map(w => w.id).sort());
    for (const s of SIX) expect(ROSTER.filter(w => style6Of(w) === s)).toHaveLength(2);
    for (const w of ROSTER) expect(STYLE_MAP[style6Of(w)].base).toBe(w.style);
  });
  it('fights as himself: his style’s AI and attribute shape, and says it in one line', () => {
    const o = rosterOpponent('Ousmane', 40)!;
    expect(o.style).toBe('technique'); expect(o.stand).toBe(STAND_STYLES.technique); expect(o.clinch).toBe(CLINCH_STYLES.technique);
    expect(o.attrs).toEqual(rosterAttributes({ style: 'technique', level: o.level }));
    expect(o.line).toMatch(/^Ousmane, technicien de l’écurie Baobab, \d+-\d+/);
    expect(rosterOpponent('Malick', 40)!.line).toMatch(/^Malick, bon frappeur de l’écurie Baobab/);
    expect(identityLine({ name: 'Pathé', style: 'saisie', ecurie: 'Baobab' })).toBe('Pathé, grand lutteur de saisie de l’écurie Baobab');
    for (const s of SIX) expect(rosterAttributes({ style: s, level: 3 })).toEqual(stand(s).attrs);
  });
});

describe('làmb 2.0 · every pairing of the roster, AI against AI, ends by a fall or the referee within 40 s', () => {
  const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
  const bouts: { a: string; b: string; day: number; time: number; outcome: string | null; winner: string | null }[] = [];
  for (const day of [40, 41, 52]) for (const A of ROSTER) for (const B of ROSTER) if (A !== B) {
    const w = new WatchedBout({ x: 0, z: 0 }, look, boutSeed('pikine', day), { frappe: { left: rosterOpponent(A.name, day)!, right: rosterOpponent(B.name, day)! } });
    for (let i = 0; i < 60 * 60 && !w.over; i++) w.advance(1 / 60);
    bouts.push({ a: A.name, b: B.name, day, time: w.time, outcome: w.result?.outcome ?? null, winner: w.result?.winner ?? null });
    w.dispose();
  }
  it('all 396 bouts (132 pairings × 3 evenings) are over within 40 s, by a fall or the referee’s decision', () => {
    expect(bouts).toHaveLength(396);
    const late = bouts.filter(b => !(b.time <= 40)).map(b => `${b.a} v ${b.b} d${b.day}: ${b.time.toFixed(1)} s`);
    expect(late).toEqual([]);
    for (const b of bouts) expect(['projection', 'decision', 'egalite']).toContain(b.outcome);
    expect(WATCHED_ROUND + 3.5 + 3.4 + THROW_TAIL).toBeLessThanOrEqual(40);
  });
  it('the fall is the rule: nine bouts in ten end by a projection, and both sides win some', () => {
    const falls = bouts.filter(b => b.outcome === 'projection').length;
    expect(falls / bouts.length).toBeGreaterThanOrEqual(0.9);
    expect(bouts.some(b => b.winner === 'player')).toBe(true);
    expect(bouts.some(b => b.winner === 'opponent')).toBe(true);
  });
  it('matchups make strategies: every style wins some and loses some', () => {
    for (const s of SIX) {
      const names = ROSTER.filter(w => style6Of(w) === s).map(w => w.name);
      const won = bouts.filter(b => (names.includes(b.a) && b.winner === 'player') || (names.includes(b.b) && b.winner === 'opponent')).length;
      const lost = bouts.filter(b => (names.includes(b.a) && b.winner === 'opponent') || (names.includes(b.b) && b.winner === 'player')).length;
      expect(won).toBeGreaterThan(0); expect(lost).toBeGreaterThan(0);
    }
  });
});
/** A throw already launched at the bell lands first (its windup). */
const THROW_TAIL = 0.6;
