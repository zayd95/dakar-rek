import { describe, it, expect } from 'vitest';
import {
  LEVEL_WORDS, ROSTER, cardOf, fightsTonight, isFightDay, ladderAt, mainEvent, resultOn, rosterLook, undercard, wrestlerCard,
} from '../src/career/roster';
import { portraitSvg } from '../src/career/portrait';
import { careerOf, type BoutEntry } from '../src/career/career';
import { followedLine } from '../src/arena/program';
import { tonightPage, type TonightInput } from '../src/arena/tonight';
import { NGEMB_COLORS } from '../src/lamb/look';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const bout = (o: Partial<BoutEntry> = {}): BoutEntry => ({ at: 0, day: 12, mode: 'classe', opp: 'Pape', style: 'Rapide', level: 1, res: 'V', how: 'projection', purse: 0, pts: 0, ...o });

describe('Lutteurs: the season as the city saw it', () => {
  it('every bout of the season is in the log, and each record is exactly its bouts', () => {
    const l = ladderAt(26, [bout({ day: 12, opp: 'Pape', res: 'V' }), bout({ day: 13, opp: 'Saliou', res: 'N' })]);
    for (const s of l.table) {
      const mine = l.log.filter(b => b.a === s.id || b.b === s.id).map(b => (b.a === s.id ? b.r : b.r === 'L' ? 'R' : b.r === 'R' ? 'L' : 'N'));
      expect([mine.filter(r => r === 'L').length, mine.filter(r => r === 'R').length, mine.filter(r => r === 'N').length]).toEqual([s.v, s.d, s.n]);
    }
    expect(l.log.some(b => b.b === 'player' && b.a === 'pape' && b.r === 'R')).toBe(true);   // the player beat Pape: a defeat for him
    expect(l.log.filter(b => b.main).every(b => isFightDay(b.day))).toBe(true);
  });

  it('a card: who he is, his season, the belt, his last results (newest first, five at most)', () => {
    const l = ladderAt(27, [bout({ day: 12, opp: 'Pape', res: 'V' })]);
    const holder = l.title.holder!, c = wrestlerCard(l, holder, 'HabibDkr')!;
    expect(c.belt).toMatch(/^Champion/);
    expect(c.place).toBe(l.table.findIndex(s => s.id === holder) + 1);
    const pape = wrestlerCard(l, 'pape', 'HabibDkr')!;
    expect(pape).toMatchObject({ name: 'Pape', ecurie: 'Indépendant', style: 'Rapide', level: LEVEL_WORDS[1], belt: null });
    expect(pape.last.length).toBeLessThanOrEqual(5);
    expect(pape.last.map(r => r.day)).toEqual([...pape.last.map(r => r.day)].sort((a, b) => b - a));
    expect(wrestlerCard(ladderAt(13, [bout({ day: 12, opp: 'Pape', res: 'V' })]), 'pape', 'HabibDkr')!.last[0]).toMatchObject({ vs: 'HabibDkr', res: 'D', day: 12 });
    expect(wrestlerCard(l, 'nobody')).toBeNull();
    expect(wrestlerCard(ladderAt(1), 'gora')!.last).toEqual([]);              // a new season: no result yet
  });

  it('his look: écurie colours, independents by style, accessories by level; the same every time', () => {
    expect(rosterLook('babacar')).toEqual({ skin: 0x5b3420, look: { ngembColor: 'vert', ngembPattern: 'bordure', accessories: ['bras_d', 'taille'] } });
    expect(rosterLook('lamine')!.look).toMatchObject({ ngembColor: 'ocre', ngembPattern: 'uni' });
    expect(rosterLook('gora')!.look).toMatchObject({ ngembColor: 'rouge', ngembPattern: 'rayures', accessories: [] });
    expect(rosterLook('saliou')!.look.ngembPattern).toBe('damier');
    expect(rosterLook('assane')!.look.accessories).toEqual(['bras_d']);
    for (const w of ROSTER) expect(rosterLook(w.id)).toEqual(rosterLook(w.id));
    expect(rosterLook('player')).toBeNull();
  });

  it('his portrait is drawn from that look', () => {
    const g = rosterLook('gora')!, svg = portraitSvg('gora', g.skin, g.look, 'Portrait de Gora');
    expect(svg).toContain(hex(NGEMB_COLORS.find(c => c.id === 'rouge')!.hex));
    expect(svg).toContain(hex(g.skin));
    expect(svg).toContain('<pattern id="ng-gora"');
    expect(svg).toContain('aria-label="Portrait de Gora"');
    const b = rosterLook('babacar')!, sb = portraitSvg('babacar', b.skin, b.look);
    expect(sb).not.toContain('<pattern');                                     // a plain ngemb with its border strip
    expect((sb.match(/<rect x="(47|20)"/g) ?? []).length).toBe(2);            // two placeholder accessories
  });
});

describe('Lutteurs: following one', () => {
  it('when he fights tonight: the evening’s main event only (the arena’s preliminaries are young local wrestlers)', () => {
    const fri = 11, l = ladderAt(fri), c = cardOf(l, fri);
    expect(fightsTonight(l, fri, c.left.id)).toEqual({ vs: c.right.name });
    expect(fightsTonight(l, fri, c.right.id)).toEqual({ vs: c.left.name });
    const [a] = undercard(l, fri, mainEvent(l, fri))[0];
    expect(fightsTonight(l, fri, a)).toBeNull();                              // the city's other bouts are not announced
    const tue = 8, lt = ladderAt(tue), ct = cardOf(lt, tue);
    expect(fightsTonight(lt, tue, ct.left.id)).toEqual({ vs: ct.right.name });   // a weekday card too
    expect(followedLine({ name: 'Gora', vs: 'Pape' })).toBe('Ton lutteur Gora combat ce soir contre Pape');
  });
  it('his result once the night is played (the next day’s ladder)', () => {
    const fri = 11, l = ladderAt(fri), c = cardOf(l, fri), next = ladderAt(fri + 1);
    const r = resultOn(next, fri, c.left.id)!;
    expect(r.vs).toBe(c.right.name);
    const other = resultOn(next, fri, c.right.id)!;
    expect({ V: 'D', D: 'V', N: 'N' }[r.res]).toBe(other.res);
    expect(resultOn(l, fri, c.left.id)).toBeNull();                          // not played yet
  });
  it('« Ce soir » says so; the save keeps one followed wrestler', () => {
    const base: TonightInput = {
      day: 11, hour: 15, size: 'gala', bill: { left: { name: 'Babacar', ecurie: 'Baobab' }, right: { name: 'Lamine', ecurie: 'Teranga' } },
      tomorrow: { left: { name: 'Ousmane', ecurie: 'Baobab' }, right: { name: 'Daouda', ecurie: 'Teranga' }, size: 'gala' },
      ticket: false, galaDone: false, fighter: null, hub: 'Pikine', gate: null, ride: null, vehicles: [], after: null, weather: null, road: [],
    };
    const rows = tonightPage({ ...base, followed: { name: 'Gora', vs: 'Pape' } })[0].rows;
    expect(rows[0]).toMatchObject({ icon: '⭐', label: 'Ton lutteur Gora combat ce soir contre Pape', detail: 'Le combat principal de la soirée' });
    expect(tonightPage(base)[0].rows.some(r => r.icon === '⭐')).toBe(false);
    expect(careerOf({ bouts: [], best: 0, fav: 'gora' }).fav).toBe('gora');
    expect(careerOf({ bouts: [], best: 0, fav: '<b>' }).fav).toBeUndefined();
    expect(careerOf({ bouts: [], best: 0 })).toEqual({ bouts: [], best: 0, galas: [] });
  });
});
