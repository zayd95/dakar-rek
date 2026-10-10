import { describe, it, expect } from 'vitest';
import {
  ATTRS, RUNGS, boutPoints, careerOf, dimensions, fighterAttributes, famePoints, purseOf, rankOf, recordLine, regularity, summary,
  type BoutEntry,
} from '../src/career/career';
import { migrate, newSave } from '../src/core/save';
import { posterText, crowdLine, NEWS_DAYS } from '../src/career/world';

describe('career: a fight night in the world', () => {
  const b = (o: Partial<BoutEntry> = {}): BoutEntry => ({ at: 1, day: 10, mode: 'classe', opp: 'Gora', style: 'Costaud', level: 1, res: 'V', how: 'projection', purse: 8250, pts: 22, ...o });
  it('the poster carries the player’s recent result, then the gala’s bill, and the next fight evening', () => {
    const win = posterText(b(), 'HabibDkr', 11, 12);
    expect(win.tag).toBe('VAINQUEUR'); expect(win.title).toBe('HabibDkr'); expect(win.line).toMatch(/Gora/);
    expect(posterText(b({ res: 'D' }), 'HabibDkr', 11, 12).title).toBe('Gora');
    expect(posterText(b(), 'HabibDkr', 10 + NEWS_DAYS + 1, 12).tag).toBe('GALA');
    expect(posterText(b({ res: 'A' }), 'HabibDkr', 10, 12).tag).toBe('GALA');
    expect(posterText(null, 'X', 3, 10).foot).toMatch(/Prochain gala/);
  });
  it('people outside talk about the result', () => {
    expect(crowdLine(b())).toMatch(/battu Gora/);
    expect(crowdLine(b({ res: 'D' }))).toMatch(/revanche/);
  });
});

const bout = (o: Partial<BoutEntry> = {}): BoutEntry => ({ at: 0, day: 1, mode: 'classe', opp: 'Gora', style: 'Costaud', level: 1, res: 'V', how: 'projection', purse: 0, pts: 0, ...o });
const fmt = (n: number) => `${n} F`;

describe('career: no classes, progression read from what the player did', () => {
  it('fighter attributes start at 20, grow with practice and never reach 100', () => {
    const fresh = fighterAttributes({});
    expect(ATTRS.every(a => fresh[a.id] === 20)).toBe(true);
    const trained = fighterAttributes({ lutte: 10, entr_frappe: 8, forme: 40, lamb_skill: 5, combats: 6, victoires: 4 });
    expect(trained.force).toBeGreaterThan(20); expect(trained.frappe).toBeGreaterThan(20); expect(trained.endurance).toBeGreaterThan(20);
    const extreme = fighterAttributes({ lutte: 1e6, entr_frappe: 1e6, forme: 1e6, lamb_skill: 1e6, combats: 1e6, victoires: 1e6, entr_force: 1e6, entr_saisies: 1e6, entrees: 1e6 });
    expect(Object.values(extreme).every(v => v <= 100)).toBe(true);
    // running in Dakar builds endurance; the punching bag builds frappe
    expect(fighterAttributes({ forme: 30 }).endurance).toBeGreaterThan(fighterAttributes({}).endurance);
    expect(fighterAttributes({ entr_frappe: 10 }).frappe).toBeGreaterThan(fighterAttributes({ entr_force: 10 }).frappe);
  });

  it('ladder points: wins against better opponents count more; a defeat costs a little, never a career', () => {
    expect(boutPoints('classe', 'V', 3)).toBeGreaterThan(boutPoints('classe', 'V', 1));
    expect(boutPoints('classe', 'V', 1, true)).toBeGreaterThan(boutPoints('classe', 'V', 1));
    expect(boutPoints('classe', 'D', 5)).toBeGreaterThan(boutPoints('classe', 'D', 1));   // losing to a stronger one costs less
    expect(boutPoints('classe', 'D', 1)).toBeLessThan(0);
    expect(boutPoints('amical', 'V', 1)).toBeLessThan(boutPoints('classe', 'V', 1));
    expect(rankOf([bout({ res: 'D', pts: -5 })], 1).score).toBe(0 + 3);                      // never below zero (+ regularity)
  });

  it('rungs: petits combats → undercards → combats classés, with what is missing', () => {
    expect(rankOf([], 1).label).toBe('Petits combats');
    expect(rankOf([], 1).next?.label).toBe('Undercards');
    const wins = (k: number, level = 1) => Array.from({ length: k }, (_, i) => bout({ day: i, pts: boutPoints('classe', 'V', level, true), level }));
    expect(rankOf(wins(3), 3).label).toBe('Undercards');
    expect(rankOf(wins(5, 2), 5).label).toBe('Combats classés');
    const r = rankOf(wins(5, 2), 5);
    expect(r.next?.label).toBe('Adversaires réputés');
    expect(r.next?.missing).toMatch(/victoire|niveau 3|pts/);
    // Champion needs a title bout: never by points alone
    const huge = Array.from({ length: 60 }, (_, i) => bout({ day: i, level: 5, pts: boutPoints('classe', 'V', 5, true) }));
    expect(rankOf(huge, 60).label).toBe('Contender');
    expect(rankOf(huge, 60, 1).rung).toBeGreaterThanOrEqual(RUNGS.findIndex(x => x.id === 'champion'));
  });

  it('regularity counts recent fight days only', () => {
    expect(regularity([bout({ day: 10 }), bout({ day: 11 }), bout({ day: 11 }), bout({ day: 2 })], 12)).toBe(2);
    expect(regularity([bout({ day: 10, res: 'A' })], 12)).toBe(0);
  });

  it('purse: ranked bouts only; a win pays more, a defeat less, an abandon nothing; higher rungs pay more', () => {
    expect(purseOf('amical', 'V', 0, 1)).toBe(0);
    expect(purseOf('classe', 'A', 0, 1)).toBe(0);
    expect(purseOf('classe', 'V', 0, 1)).toBeGreaterThan(purseOf('classe', 'N', 0, 1));
    expect(purseOf('classe', 'N', 0, 1)).toBeGreaterThan(purseOf('classe', 'D', 0, 1));
    expect(purseOf('classe', 'D', 0, 1)).toBeGreaterThan(0);
    expect(purseOf('classe', 'V', 2, 1)).toBeGreaterThan(purseOf('classe', 'V', 0, 1));
    expect(purseOf('classe', 'V', 0, 1) % 250).toBe(0);
  });

  it('record: totals, rivalry, biggest purse, streak, one shareable line', () => {
    const bouts = [bout({ opp: 'Gora', res: 'D', purse: 3000 }), bout({ opp: 'Pape', res: 'V', purse: 8250 }), bout({ opp: 'Gora', res: 'V', purse: 8250 }),
      bout({ opp: 'Saliou', res: 'A', mode: 'amical' }), bout({ opp: 'Pape', res: 'V', mode: 'amical' })];
    const s = summary(bouts);
    expect([s.bouts, s.v, s.d, s.n, s.ab]).toEqual([4, 3, 1, 0, 1]);
    expect(s.ranked).toEqual({ v: 2, d: 1, n: 0 });
    expect(s.rival?.name).toBe('Gora');
    expect(s.bestPurse).toBe(8250);
    expect(s.streak).toEqual({ res: 'V', count: 3 });
    expect(recordLine(bouts, 'Undercards', fmt)).toBe('4 combats · 3 V · 1 D · Undercards · rivalité avec Gora · plus gros cachet 8250 F');
    expect(recordLine([], 'Petits combats', fmt)).toBe('Pas encore de combat');
  });

  it('reputation grows with ranked wins and entrances', () => {
    expect(famePoints([bout()])).toBeGreaterThan(famePoints([bout({ mode: 'amical' })]));
    expect(famePoints([], 2)).toBe(6);
  });

  it('four dimensions, each 0–100 with a word and a reason; a rich non-fighter is rich, a fighter can be poor', () => {
    const base = { counters: {}, relations: [], ventures: 0, bouts: [], rung: 0 };
    const rich = dimensions({ ...base, netWorth: 250_000_000 }, fmt);
    const poorFighter = dimensions({ ...base, netWorth: 3000, bouts: Array.from({ length: 12 }, () => bout({ level: 3 })), counters: { forme: 80, lutte: 20 } }, fmt);
    const by = (d: ReturnType<typeof dimensions>, id: string) => d.find(x => x.id === id)!;
    expect(rich.map(d => d.label)).toEqual(['Forme', 'Richesse', 'Réputation', 'Influence']);
    expect(by(rich, 'richesse').score).toBeGreaterThan(80);
    expect(by(rich, 'reputation').score).toBe(0);
    expect(by(poorFighter, 'richesse').score).toBeLessThan(5);
    expect(by(poorFighter, 'reputation').score).toBeGreaterThan(40);
    expect(by(poorFighter, 'forme').score).toBeGreaterThan(by(rich, 'forme').score);
    for (const d of [...rich, ...poorFighter]) { expect(d.score).toBeGreaterThanOrEqual(0); expect(d.score).toBeLessThanOrEqual(100); expect(d.level).toBeTruthy(); }
  });

  it('the record persists in the save and survives malformed data', () => {
    const s = newSave();
    expect(s.career).toEqual({ bouts: [], best: 0 });
    s.career.bouts.push(bout({ purse: 8250 })); s.career.best = 1;
    const back = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(back.career.bouts).toHaveLength(1);
    expect(back.career.bouts[0].purse).toBe(8250);
    expect(back.career.best).toBe(1);
    // a save from before the career field starts with an empty record
    const old = JSON.parse(JSON.stringify(s)); delete old.career;
    expect(migrate(old)!.career).toEqual({ bouts: [], best: 0 });
    expect(careerOf({ bouts: [{ res: 'X' }, null, 3, bout()], best: 99 }).bouts).toHaveLength(1);
    expect(careerOf({ best: 99 }).best).toBe(RUNGS.length - 1);
  });
});
