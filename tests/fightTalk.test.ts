import { describe, expect, it } from 'vitest';
import { GALA_NEWS, bringsItUp, fightTalk, galaResultOf, recordGalaResult, type TalkInput } from '../src/social/fightTalk';
import { find, glossed } from '../src/i18n/wolof';
import { BILL } from '../src/arena/program';
import { AFTER_GALA_ACTS } from '../src/social/ambientData';
import { activityLevel } from '../src/social/ambient';

const plain = (s: string | null) => (s === null ? null : glossed(s, true).replace(/[  ]/g, ' '));
const base: TalkInput = { day: 10, hour: 14, pikine: true, tonight: null, gala: null, mine: null, name: 'Awa', seed: 's' };
const at = (o: Partial<TalkInput>) => fightTalk({ ...base, ...o });
const seeds = Array.from({ length: 40 }, (_, k) => `p${k}`);
const all = (o: Partial<TalkInput>) => seeds.map(seed => plain(at({ ...o, seed })));

describe('fight talk', () => {
  it('on a day without a bout and without a recent result, nobody talks about it', () => {
    for (const h of [8, 14, 20, 23]) expect(all({ hour: h })).toEqual(seeds.map(() => null));
  });

  it('before a gala people anticipate it, anywhere in the city; a weekday card only in Pikine', () => {
    const g = all({ tonight: 'gala', hour: 15, pikine: false });
    expect(g.every(l => l && /gala|arène/.test(l) && (l.includes(BILL.left.name) || l.includes(BILL.left.ecurie)))).toBe(true);
    expect(all({ tonight: 'card', hour: 15, pikine: true }).every(l => l && /combat de quartier|arène/.test(l))).toBe(true);
    expect(all({ tonight: 'card', hour: 15, pikine: false })).toEqual(seeds.map(() => null));
    expect(at({ tonight: 'gala', hour: 6 })).toBeNull();                       // too early
    expect(at({ tonight: 'gala', hour: 21 })).toBeNull();                      // the bout is on: no « ce soir il y a gala »
  });

  it('after the gala, its real result that evening and the next day — then nothing', () => {
    const c: Record<string, number> = {};
    recordGalaResult(c, 10, 'right', 'projection');
    const g = galaResultOf(c)!;
    expect(g).toMatchObject({ day: 10, how: 'projection', winner: { name: BILL.right.name }, loser: { name: BILL.left.name } });
    const tonight = all({ gala: g, hour: 23 }), tomorrow = all({ gala: g, day: 11, hour: 9 });
    for (const l of tonight) { expect(l).toMatch(new RegExp(`${BILL.right.name}|${BILL.right.ecurie}`)); expect(l).toMatch(/ce soir/i); }
    for (const l of tomorrow) expect(l).toMatch(/hier soir/i);
    expect(tonight.some(l => l!.includes(`${BILL.right.name} a mis ${BILL.left.name} au sol`))).toBe(true);
    expect(all({ gala: g, day: 12, hour: 9 })).toEqual(seeds.map(() => null));
    // the result wins over tomorrow's anticipation
    expect(all({ gala: g, day: 11, hour: 15, tonight: 'gala' }).every(l => /hier soir/i.test(l!))).toBe(true);
  });

  it('a decision and a draw are told as they were, never as a fall', () => {
    const c: Record<string, number> = {};
    recordGalaResult(c, 10, 'left', 'decision');
    for (const l of all({ gala: galaResultOf(c), hour: 23 })) { expect(l).not.toMatch(/au sol|tomber/); expect(l).toMatch(/points|arbitre/); }
    recordGalaResult(c, 10, null, 'egalite');
    const d = galaResultOf(c)!;
    expect(d.winner).toBeNull();
    for (const l of all({ gala: d, hour: 23 })) { expect(l).toMatch(/nul|dos à dos/); expect(l).not.toMatch(/a mis|l’emporté|a gagné/); }
    recordGalaResult(c, 10, 'left', 'abandon');
    expect(galaResultOf(c)!.how).toBe('draw');
  });

  it('the player’s own bout comes first, that evening and the next day', () => {
    const c: Record<string, number> = {};
    recordGalaResult(c, 10, 'left', 'projection');
    const g = galaResultOf(c);
    for (const l of all({ gala: g, mine: { day: 10, opp: 'Moussa', res: 'V' }, hour: 23 })) expect(l).toMatch(/Moussa/);
    for (const l of all({ mine: { day: 10, opp: 'Moussa', res: 'D' }, day: 11, hour: 10 })) expect(l).toMatch(/Moussa.*(eu|battras)|revanche/);
    for (const l of all({ mine: { day: 10, opp: 'Moussa', res: 'N' }, hour: 23 })) expect(l).toMatch(/nul/i);
    // an abandon is not news; three days later neither
    expect(all({ mine: { day: 10, opp: 'Moussa', res: 'A' }, hour: 23 })).toEqual(seeds.map(() => null));
    expect(all({ mine: { day: 10, opp: 'Moussa', res: 'V' }, day: 13 })).toEqual(seeds.map(() => null));
  });

  it('speaks French with everyday Wolof from the lexicon, with the game’s typography', () => {
    const c: Record<string, number> = {};
    recordGalaResult(c, 10, 'left', 'projection');
    const lines = [
      ...all({ tonight: 'gala', hour: 15 }), ...all({ tonight: 'card', hour: 15 }), ...all({ gala: galaResultOf(c), hour: 23 }),
      ...all({ mine: { day: 10, opp: 'Moussa', res: 'V' }, hour: 23 }), ...all({ mine: { day: 10, opp: 'Moussa', res: 'D' }, hour: 23 }),
    ] as string[];
    for (const p of ['Waaw kay', 'Rafet na', 'Ndank ndank', 'Bul tiit', 'Daan na', 'Lu bees ?']) expect(find(p)).not.toBeNull();
    expect(lines.some(l => l.includes('Daan na'))).toBe(true);
    const raw = lines.map(l => l);
    for (const l of [...seeds.map(seed => at({ tonight: 'gala', hour: 15, seed })), ...seeds.map(seed => at({ gala: galaResultOf(c), hour: 23, seed }))] as string[]) {
      const t = glossed(l, true);
      expect(/ [?!:;»]/.test(t)).toBe(false);                                   // no-break spaces only
      expect(/« /.test(t)).toBe(false);
    }
    expect(raw.every(l => l.startsWith('Awa'))).toBe(true);
  });

  it('about half of the people bring it up, always the same for the same exchange', () => {
    const n = Array.from({ length: 2000 }, (_, k) => bringsItUp(`x${k}`)).filter(Boolean).length;
    expect(n / 2000).toBeGreaterThan(0.45); expect(n / 2000).toBeLessThan(0.65);
    expect(bringsItUp('same')).toBe(bringsItUp('same'));
  });

  it('the gala result is kept in the save’s counters', () => {
    const c: Record<string, number> = {};
    expect(galaResultOf(c)).toBeNull();
    recordGalaResult(c, 7.6, 'left', 'projection');
    expect(c[GALA_NEWS.day]).toBe(7);
    expect(galaResultOf({ ...c })!.winner!.name).toBe(BILL.left.name);
  });
});

describe('the Dibi after the gala', () => {
  it('keeps a queue at the grill and more tables until about 1 h', () => {
    const ids = AFTER_GALA_ACTS.map(a => a.id);
    expect(ids).toEqual(['dibi-apres-combat', 'file-grill']);
    for (const a of AFTER_GALA_ACTS) {
      expect(a.at).toEqual(['dibi']);
      expect(activityLevel(a, 23.5, 4)).toBeGreaterThan(0.5);
      expect(activityLevel(a, 0.75, 5)).toBeGreaterThan(0.2);
      expect(activityLevel(a, 1.5, 5)).toBe(0);
      expect(activityLevel(a, 20, 4)).toBe(0);
    }
  });
});
