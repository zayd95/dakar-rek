import { describe, it, expect } from 'vitest';
import {
  FIRST_HOLDER, GALA_RUNG, ROSTER, SEASON_DAYS, START_PTS, TITLE_IDLE_DAYS, TITLE_RUNG, beltOf, cardOf, galaBlock, isFightDay, isTitleDay,
  ladderAt, mainEvent, nextTitleDay, opponentFor, placeOf, seasonOf, seasonStart, titleBout, wrestlerById,
} from '../src/career/roster';
import { RUNGS, boutPoints, purseOf, rankOf, type BoutEntry } from '../src/career/career';

const bout = (o: Partial<BoutEntry> = {}): BoutEntry => ({ at: 0, day: 3, mode: 'classe', opp: 'Pape', style: 'Rapide', level: 1, res: 'V', how: 'projection', purse: 0, pts: 0, ...o });

describe('roster: the city’s ladder of fictional wrestlers', () => {
  it('twelve named wrestlers: two écuries and independents, each with a style and a level', () => {
    expect(ROSTER).toHaveLength(12);
    expect(new Set(ROSTER.map(w => w.id)).size).toBe(12);
    expect(new Set(ROSTER.map(w => w.name)).size).toBe(12);
    const ecuries = new Set(ROSTER.map(w => w.ecurie));
    expect(ecuries).toEqual(new Set(['Baobab', 'Teranga', null]));
    for (const w of ROSTER) {
      expect(['costaud', 'rapide', 'defensif']).toContain(w.style);
      expect(w.level).toBeGreaterThanOrEqual(1); expect(w.level).toBeLessThanOrEqual(5);
    }
  });

  it('fight evenings are Friday to Sunday; the belt is at stake on Sundays; seasons are four weeks', () => {
    const fights = Array.from({ length: 14 }, (_, d) => d).filter(isFightDay);
    expect(fights).toEqual([4, 5, 6, 11, 12, 13]);
    expect([6, 13].every(isTitleDay)).toBe(true);
    expect(nextTitleDay(7)).toBe(13);
    expect(seasonOf(1)).toBe(0); expect(seasonOf(SEASON_DAYS)).toBe(0); expect(seasonOf(SEASON_DAYS + 1)).toBe(1);
    expect(seasonStart(seasonOf(40))).toBeLessThanOrEqual(40);
  });

  it('is deterministic: the same day gives the same table, belt and card everywhere', () => {
    const a = ladderAt(90), b = ladderAt(90);
    expect(a).toEqual(b);
    expect(cardOf(a, 90)).toEqual(cardOf(b, 90));
    // records move with the fight evenings
    const before = ladderAt(1), after = ladderAt(27);
    expect(before.table.every(s => s.v + s.d + s.n === 0)).toBe(true);
    expect(after.nights).toBeGreaterThan(0);
  });

  it('points stay on the ladder’s scale: a new season starts from the levels again', () => {
    const late = ladderAt(seasonStart(40));                // the first day of a season: nobody has fought yet
    for (const s of late.table) expect(s.pts).toBe(START_PTS[s.level]);
    const mid = ladderAt(seasonStart(40) + 26);
    expect(Math.max(...mid.table.map(s => s.pts))).toBeLessThan(2000);
    expect(mid.season).toBe(40);
  });

  it('the belt: defended on Sundays by its holder, it can change hands; the holder is never offered as an ordinary opponent', () => {
    const l0 = ladderAt(1);
    expect(l0.title.holder).toBe(FIRST_HOLDER);
    // on a Sunday the main event is the champion against the best challenger, and the card says the belt is at stake
    const sunday = 13, l = ladderAt(sunday), [a] = mainEvent(l, sunday);
    expect(a).toBe(l.title.holder);
    expect(cardOf(l, sunday).title).toBe(true);
    // Friday: the champion is kept for Sunday
    expect(mainEvent(ladderAt(11), 11)).not.toContain(ladderAt(11).title.holder);
    // over many weeks, the belt moves at least once (or is defended), and its holder is always a roster wrestler
    const later = ladderAt(400);
    expect(wrestlerById(later.title.holder!)).toBeTruthy();
    expect(later.title.defences + (later.title.holder !== FIRST_HOLDER ? 1 : 0)).toBeGreaterThan(0);
    expect(opponentFor(later, 10_000, 0).id).not.toBe(later.title.holder);
  });

  it('a watched gala: the live result is the one the city remembers', () => {
    const fri = 11, l = ladderAt(fri), [a, b] = mainEvent(l, fri);
    const won = (winner: string) => ladderAt(fri + 1, [], [{ day: fri, winner }]).table.find(s => s.id === winner)!;
    expect(won(a).v).toBe(l.table.find(s => s.id === a)!.v + 1);
    expect(won(b).v).toBe(l.table.find(s => s.id === b)!.v + 1);
  });

  it('the player’s bouts enter their opponents’ records', () => {
    const l = ladderAt(3, [bout({ day: 3, opp: 'Pape', res: 'V' }), bout({ day: 3, opp: 'Saliou', res: 'D' })]);
    expect(l.table.find(s => s.id === 'pape')!.d).toBe(1);
    expect(l.table.find(s => s.id === 'saliou')!.v).toBe(1);
    // friendlies and abandons do not count
    const f = ladderAt(3, [bout({ mode: 'amical' }), bout({ res: 'A' })]);
    expect(f.table.find(s => s.id === 'pape')!.d).toBe(0);
  });

  it('the ranked opponent is close to the player’s points, rotates, and never is the champion', () => {
    const l = ladderAt(2);
    const low = opponentFor(l, 0, 0);
    expect(low.level).toBeLessThanOrEqual(2);
    const seen = new Set([0, 1, 2].map(n => opponentFor(l, 0, n).id));
    expect(seen.size).toBe(3);
    expect(opponentFor(l, 700, 0).level).toBeGreaterThanOrEqual(4);
    expect(opponentFor(l, 700, 0, ['lamine', 'ousmane', 'daouda']).id).not.toMatch(/lamine|ousmane|daouda/);
    expect(placeOf(l, 10_000)).toBe(1);
    expect(placeOf(l, 0)).toBe(13);
  });

  it('title bout: a contender challenges the champion on Sunday; the player wins and must defend it', () => {
    const sun = 13, l = ladderAt(sun);
    expect(titleBout(l, 12, true)).toBeNull();                          // Saturday: no title
    expect(titleBout(l, sun, false)).toBeNull();                        // not a contender yet
    const t = titleBout(l, sun, true)!;
    expect(t.defence).toBe(false); expect(t.opp.id).toBe(l.title.holder);
    const win = bout({ day: sun, opp: t.opp.name, level: t.opp.level, kind: 'title' });
    const l2 = ladderAt(sun + 1, [win]);
    expect(l2.title.holder).toBe('player');
    expect(beltOf(l2, sun + 1)).toEqual({ held: true, defences: 0 });
    // next Sunday: a defence against the best challenger
    const d = titleBout(ladderAt(sun + 7, [win]), sun + 7, false)!;
    expect(d.defence).toBe(true);
    const def = bout({ day: sun + 7, opp: d.opp.name, level: d.opp.level, kind: 'title' });
    expect(beltOf(ladderAt(sun + 8, [win, def]), sun + 8)).toEqual({ held: true, defences: 1 });
    // a lost defence gives the belt to the challenger
    const lost = bout({ day: sun + 7, opp: d.opp.name, level: d.opp.level, kind: 'title', res: 'D' });
    expect(ladderAt(sun + 8, [win, lost]).title.holder).toBe(d.opp.id);
  });

  it('a belt left asleep longer than the rule allows is vacant, and the two best fight for it', () => {
    const sun = 13, win = bout({ day: sun, opp: wrestlerById(FIRST_HOLDER)!.name, level: 5, kind: 'title' });
    const lastSunday = sun + 7 * Math.floor(TITLE_IDLE_DAYS / 7);
    expect(beltOf(ladderAt(lastSunday, [win]), lastSunday).held).toBe(true);
    const vacated = lastSunday + 7, l = ladderAt(vacated, [win]);
    expect(beltOf(l, vacated).held).toBe(false);
    expect(cardOf(l, vacated).title).toBe(true);
    const next = ladderAt(vacated + 1, [win]).title.holder;              // the main event decided it (or it stays vacant on a draw)
    expect(next).not.toBe('player');
    expect(next === null || !!wrestlerById(next)).toBe(true);
  });

  it('rank: Champion means holding the belt, Roi des Arènes three defences; gala and title bouts pay and count more', () => {
    const many = Array.from({ length: 24 }, (_, i) => bout({ day: i, level: 5, pts: boutPoints('classe', 'V', 5, true) }));
    expect(rankOf(many, 20).label).toBe('Contender');
    expect(rankOf(many, 20, { held: true, defences: 0 }).label).toBe('Champion');
    expect(rankOf(many, 20, { held: true, defences: 3 }).label).toBe('Roi des Arènes');
    expect(rankOf(many, 20, { held: true, defences: 1 }).next?.missing).toMatch(/2 défenses du titre/);
    expect(rankOf(many, 20).next?.missing).toMatch(/gagner le titre/);
    expect(boutPoints('classe', 'V', 3, false, 'gala')).toBeGreaterThan(boutPoints('classe', 'V', 3));
    expect(boutPoints('classe', 'V', 3, false, 'title')).toBeGreaterThan(boutPoints('classe', 'V', 3, false, 'gala'));
    expect(boutPoints('classe', 'D', 3, false, 'title')).toBe(boutPoints('classe', 'D', 3));    // a defeat costs the same
    expect(purseOf('classe', 'V', 3, 3, 'gala')).toBe(2 * purseOf('classe', 'V', 3, 3));
    expect(purseOf('classe', 'V', 4, 5, 'title')).toBe(3 * purseOf('classe', 'V', 4, 5));
    expect(RUNGS[GALA_RUNG].id).toBe('reputes'); expect(RUNGS[TITLE_RUNG].id).toBe('contender');
  });

  it('gala places: fight evenings from 16 h, one gala bout an evening, rested, nothing else planned', () => {
    const ok = { day: 11, hour: 18, pending: false, energie: 80, foughtTonight: false };
    expect(galaBlock('gala', ok)).toBeNull();
    expect(galaBlock('gala', { ...ok, day: 9 })).toMatch(/vendredi/);
    expect(galaBlock('gala', { ...ok, hour: 12 })).toMatch(/16 h/);
    expect(galaBlock('gala', { ...ok, foughtTonight: true })).toMatch(/déjà combattu/);
    expect(galaBlock('gala', { ...ok, pending: true })).toMatch(/déjà prévu/);
    expect(galaBlock('gala', { ...ok, energie: 5 })).toMatch(/fatigué/);
    expect(galaBlock('title', ok)).toMatch(/dimanche/);
    expect(galaBlock('title', { ...ok, day: 13 })).toBeNull();
  });

  it('the card names the city’s own cast; weekday cards come from the middle of the table', () => {
    for (const d of [8, 9, 11, 12, 13]) {
      const c = cardOf(ladderAt(d), d);
      expect(wrestlerById(c.left.id)?.name).toBe(c.left.name);
      expect(wrestlerById(c.right.id)?.name).toBe(c.right.name);
      expect(c.left.id).not.toBe(c.right.id);
    }
    const tue = cardOf(ladderAt(8), 8), top = ladderAt(8).table.slice(0, 4).map(s => s.id);
    expect(top).not.toContain(tue.left.id);
  });
});
