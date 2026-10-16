import { describe, it, expect } from 'vitest';
import {
  DIM_DAYS_MAX, boutCard, boutRecap, deltaText, dimMoves, galaRecap, nextSteps, recordDay, scoresOf, sinceLabel, sinceYesterday, stepsCrossed,
  type DimScores, type GaugeMove, type NextFacts,
} from '../src/career/progress';
import { GALA_RUNG, TITLE_RUNG } from '../src/career/roster';
import { careerOf, levelIndex, type Dim } from '../src/career/career';

const dim = (id: Dim['id'], score: number, level = '', label = id[0].toUpperCase() + id.slice(1)): Dim => ({ id, label, score, level, note: '' });
const fmt = (n: number) => `${n} F`;

describe('progress: « depuis hier » from real saved values', () => {
  it('keeps the last scores seen each day, a few days back', () => {
    let h = recordDay([], 10, [10, 20, 30, 40]);
    h = recordDay(h, 10, [11, 20, 30, 40]);                                   // later the same day: replaced
    expect(h).toEqual([{ day: 10, s: [11, 20, 30, 40] }]);
    h = recordDay(h, 11, [12, 20, 36, 40]);
    expect(h.map(x => x.day)).toEqual([10, 11]);
    for (let d = 12; d < 30; d++) h = recordDay(h, d, [0, 0, 0, 0]);
    expect(h).toHaveLength(DIM_DAYS_MAX);
    expect(h[h.length - 1].day).toBe(29);
    expect(recordDay([{ day: 40, s: [1, 1, 1, 1] }], 35, [2, 2, 2, 2]).map(x => x.day)).toEqual([35]);   // a clock that went back
  });
  it('compares with the end of the last day played before today, and says which day', () => {
    const now: DimScores = [12, 20, 36, 41];
    expect(sinceYesterday([], 11, now)).toBeNull();                           // a new life: nothing to compare with
    expect(sinceYesterday([{ day: 11, s: [1, 1, 1, 1] }], 11, now)).toBeNull(); // only today so far
    expect(sinceYesterday([{ day: 10, s: [11, 20, 30, 42] }, { day: 11, s: now }], 11, now)).toEqual({ since: 'depuis hier', d: [1, 0, 6, -1] });
    expect(sinceLabel(13, 11)).toBe('depuis vendredi');                      // city day 0 is a Monday: 11 is a Friday
    expect(sinceLabel(20, 2)).toBe('depuis le jour 2');
    expect(deltaText(6, 'depuis hier')).toBe('+6 depuis hier');
    expect(deltaText(-2, 'depuis hier')).toBe('−2 depuis hier');
    expect(deltaText(0, 'depuis hier')).toBe('');
  });
});

describe('progress: a new word on a gauge, once', () => {
  it('a word per fifth of the gauge', () => {
    expect([0, 19, 20, 39, 40, 79, 80, 100].map(s => levelIndex(s))).toEqual([0, 0, 1, 1, 2, 3, 4, 4]);
  });
  it('the first look only remembers; a word above the best reached is celebrated once; falling back and up is not new', () => {
    const first = stepsCrossed(undefined, [45, 10, 25, 5]);
    expect(first).toEqual({ up: [], best: [2, 0, 1, 0] });
    const up = stepsCrossed(first.best, [45, 10, 41, 5]);
    expect(up.up).toEqual(['reputation']); expect(up.best).toEqual([2, 0, 2, 0]);
    expect(stepsCrossed(up.best, [45, 10, 41, 5]).up).toEqual([]);           // the same word: nothing again
    const fell = stepsCrossed(up.best, [15, 10, 41, 5]);                       // Forme falls a word
    expect(fell.up).toEqual([]); expect(fell.best[0]).toBe(2);
    expect(stepsCrossed(fell.best, [45, 10, 41, 5]).up).toEqual([]);          // and comes back: not celebrated twice
    expect(stepsCrossed(fell.best, [62, 10, 41, 5]).up).toEqual(['forme']);   // a word never reached before
  });
});

describe('progress: the recaps', () => {
  const before = [dim('forme', 30), dim('richesse', 22), dim('reputation', 18, 'Inconnu'), dim('influence', 10)];
  const after = [dim('forme', 30), dim('richesse', 24), dim('reputation', 26, 'Connu du quartier'), dim('influence', 15)];
  it('what moved, with the new word when one was reached', () => {
    const m = dimMoves(before, after, ['reputation']);
    expect(m.map(x => [x.id, x.delta, x.word ?? null])).toEqual([['richesse', 2, null], ['reputation', 8, 'Connu du quartier'], ['influence', 5, null]]);
    expect(dimMoves(before, before)).toEqual([]);
    expect(scoresOf(after)).toEqual([30, 24, 26, 15]);
  });
  it('after a bout: the result, the purse, the rank and the city place, what moved and why', () => {
    const r = boutRecap({
      res: 'V', opp: 'Gora', how: 'par chute', purse: 8250, pts: 28,
      rungBefore: { rung: 0, label: 'Petits combats' }, rungAfter: { rung: 1, label: 'Undercards' },
      place: { before: 13, after: 11, of: 13 }, belt: null, moves: dimMoves(before, after, ['reputation']),
    }, fmt);
    expect(r.title).toBe('Victoire contre Gora');
    expect(r.lines).toEqual([
      'Cachet +8250 F',
      'Nouveau palier : Undercards · 11e de la ville (était 13e)',
      'Richesse +2 · le cachet',
      'Reputation : Connu du quartier !',
      'Influence +5 · ton nouveau rang',
    ]);
    const d = boutRecap({ res: 'D', opp: 'Lamine', how: '', purse: 3000, pts: -4, rungBefore: { rung: 2, label: 'Combats classés' }, rungAfter: { rung: 2, label: 'Combats classés' }, belt: 'lost', moves: [] }, fmt);
    expect(d.title).toBe('Défaite contre Lamine');
    expect(d.lines).toEqual(['Lamine te prend la ceinture', 'Cachet +3000 F', 'Classement −4 pts · Combats classés']);
  });
  it('after a watched gala: the result, the belt, the winner’s new place', () => {
    const g = galaRecap({ winner: { name: 'Lamine', ecurie: 'Teranga' }, loser: { name: 'Babacar', ecurie: 'Baobab' }, draw: null, place: { before: 2, after: 1 }, belt: { kind: 'won', holder: 'Lamine', defences: 0 } });
    expect(g.lines).toEqual(['Lamine (Teranga) bat Babacar (Baobab)', 'Lamine prend la ceinture !', 'Lamine passe 1er du classement de la ville']);
    const kept = galaRecap({ winner: { name: 'Babacar', ecurie: 'Baobab' }, loser: { name: 'Ousmane', ecurie: 'Baobab' }, draw: null, place: { before: 1, after: 1 }, belt: { kind: 'defended', holder: 'Babacar', defences: 3 } });
    expect(kept.lines).toEqual(['Babacar (Baobab) bat Ousmane (Baobab)', 'Babacar garde la ceinture (3 défenses)']);
    expect(galaRecap({ winner: null, loser: null, draw: { a: 'Gora', b: 'Pape' } }).lines).toEqual(['Gora et Pape : match nul']);
  });
});

describe('progress: the fighter’s after-bout card', () => {
  const g = (id: GaugeMove['id'], label: string, before: number, after: number, word: string, up = false): GaugeMove => ({ id, label, before, after, word, up });
  it('a gala win: the result, the palmarès, the place in the city and the new rung, Réputation and Influence, the purse, what next', () => {
    const c = boutCard({
      res: 'V', opp: 'Gora', how: 'par chute', purse: 8250, pts: 28, kind: 'gala', discipline: 'avec_frappe',
      rungBefore: { rung: 0, label: 'Petits combats' }, rungAfter: { rung: 1, label: 'Undercards' }, place: { before: 13, after: 11, of: 14 }, belt: null,
      record: { v: 4, d: 1, n: 0, ab: 0 }, score: 71,
      gauges: [g('forme', 'Forme', 30, 30, 'En forme'), g('richesse', 'Richesse', 22, 24, 'Modeste'), g('reputation', 'Réputation', 18, 26, 'Connu du quartier', true), g('influence', 'Influence', 10, 15, 'Discret')],
      next: ['Prochain palier : Combats classés · il manque 79 pts · 2 victoires classées'],
    }, fmt);
    expect(c.title).toBe('Victoire'); expect(c.icon).toBe('🏆');
    expect(c.sub).toBe('Gala · contre Gora · par chute · avec frappe');
    expect(c.rows).toEqual([
      { k: 'Palmarès', v: '4 V · 1 D · 0 N', d: '+1 V', tone: 'up' },
      { k: 'Classement', v: '11e sur 14', d: '+28 pts', tone: 'up', note: 'Nouveau palier : Undercards ! · était 13e' },
      { k: 'Réputation', v: 'Connu du quartier !', d: '+8', tone: 'up', note: 'Nouveau mot' },
      { k: 'Influence', v: 'Discret', d: '+5', tone: 'up' },
      { k: 'Cachet', v: '+8250 F', d: 'Richesse +2', tone: 'up' },
    ]);
    expect(c.next).toEqual(['Prochain palier : Combats classés · il manque 79 pts · 2 victoires classées']);
  });
  it('a defeat: the record, the points lost, a gauge that did not move says so, the belt taken; an abandon counts apart', () => {
    const c = boutCard({
      res: 'D', opp: 'Lamine', how: '', purse: 0, pts: -4, kind: 'title',
      rungBefore: { rung: 5, label: 'Champion' }, rungAfter: { rung: 4, label: 'Contender' }, place: { before: 1, after: 1, of: 13 }, belt: 'lost',
      record: { v: 12, d: 3, n: 1, ab: 1 }, score: 540,
      gauges: [g('reputation', 'Réputation', 70, 70, 'Célèbre'), g('influence', 'Influence', 50, 48, 'Écouté'), g('forme', 'Forme', 60, 61, 'En forme')],
      next: [],
    }, fmt);
    expect(c.title).toBe('Défaite'); expect(c.icon).toBe('🤼'); expect(c.sub).toBe('Combat pour le titre · contre Lamine');
    expect(c.rows).toEqual([
      { k: 'Palmarès', v: '12 V · 3 D · 1 N · 1 abandon', d: '+1 D', tone: 'down' },
      { k: 'Classement', v: '1er sur 13', d: '−4 pts', tone: 'down', note: 'Recul : Contender' },
      { k: 'Réputation', v: 'Célèbre', d: '=', tone: '' },
      { k: 'Influence', v: 'Écouté', d: '−2', tone: 'down' },
      { k: 'Forme', v: 'En forme', d: '+1', tone: 'up' },
      { k: 'Ceinture', v: 'Prise par Lamine', tone: 'down' },
    ]);
    const a = boutCard({ res: 'A', opp: 'Pape', how: '', purse: 0, pts: -1, rungBefore: { rung: 0, label: 'Petits combats' }, rungAfter: { rung: 0, label: 'Petits combats' },
      belt: null, record: { v: 0, d: 0, n: 0, ab: 1 }, score: 2, gauges: [], next: [] }, fmt);
    expect(a.title).toBe('Abandon');
    expect(a.rows.slice(0, 2)).toEqual([{ k: 'Palmarès', v: '0 V · 0 D · 0 N · 1 abandon', d: '+1 abandon', tone: '' }, { k: 'Classement', v: '2 pts', d: '−1 pts', tone: 'down', note: 'Petits combats' }]);
  });
  it('what next: the revenge, the gala place on the evening the rules open it, the title, the belt, else the next rung', () => {
    // city day 0 is a Monday: 3 Thursday, 4 Friday, 5 Saturday, 6 Sunday
    const at = (o: Partial<NextFacts>) => nextSteps({ day: 0, res: 'V', opp: 'Gora', rung: 0, next: { label: 'Undercards', missing: '32 pts' }, belt: { held: false }, galaTonight: false, titleTonight: false, ...o });
    expect(at({})).toEqual(['Prochain palier : Undercards · il manque 32 pts']);
    expect(at({ next: { label: 'Undercards', missing: 'au prochain combat' } })).toEqual(['Prochain palier : Undercards, au prochain combat']);
    expect(at({ res: 'D', opp: 'Lamine' })).toEqual(['Revanche à prendre contre Lamine', 'Prochain palier : Undercards · il manque 32 pts']);
    const gala = { rung: GALA_RUNG, next: { label: 'Contender', missing: '4 victoires classées' } };
    expect(at({ ...gala, day: 3 })[0]).toBe('Place au gala : demain soir, dès 16 h');
    expect(at({ ...gala, day: 0 })[0]).toBe('Place au gala : vendredi soir, dès 16 h');
    expect(at({ ...gala, day: 4, galaTonight: true })[0]).toBe('Place au gala : ce soir, dès 16 h');           // an ordinary bout tonight: the gala is still open
    expect(at({ ...gala, day: 4 })[0]).toBe('Place au gala : demain soir, dès 16 h');                         // fought at tonight's gala
    expect(at({ ...gala, day: 6 })[0]).toBe('Place au gala : vendredi soir, dès 16 h');
    expect(at({ ...gala, day: 3 })[1]).toBe('Prochain palier : Contender · il manque 4 victoires classées');
    expect(at({ ...gala, day: 3, res: 'D', opp: 'Lamine' })).toEqual(['Revanche à prendre contre Lamine', 'Place au gala : demain soir, dès 16 h']);   // two lines at most
    expect(at({ rung: TITLE_RUNG, day: 5 })[0]).toBe('Combat pour le titre : demain soir, au gala du dimanche');
    expect(at({ rung: TITLE_RUNG, day: 6, titleTonight: true })[0]).toBe('Combat pour le titre : ce soir, au gala du dimanche');
    expect(at({ rung: TITLE_RUNG + 1, day: 6, belt: { held: true } })[0]).toBe('Défendre la ceinture : dimanche soir, au gala du dimanche');   // just defended: next Sunday
    expect(at({ rung: TITLE_RUNG + 1, day: 2, belt: { held: true }, next: null })).toEqual(['Défendre la ceinture : dimanche soir, au gala du dimanche']);
  });
});

describe('progress: saved with the career, cleaned on load', () => {
  it('keeps valid days and best words, drops the rest', () => {
    const c = careerOf({ bouts: [], best: 0, dims: [{ day: 3, s: [10, 200, -5, 'x'] }, { day: 4, s: [1, 2] }, null], dimBest: [1, 9, 0, 2] });
    expect(c.dims).toEqual([{ day: 3, s: [10, 100, 0, 0] }]);
    expect(c.dimBest).toEqual([1, 4, 0, 2]);
    expect(careerOf({ bouts: [], best: 0 })).toEqual({ bouts: [], best: 0, galas: [] });   // nothing added to an old save
  });
});
