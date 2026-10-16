import { describe, it, expect } from 'vitest';
import { ARENA_OUTCOMES, ARENA_PHASES, ARENA_PRELIMS, REC_RUNGS, parseMove, recordTag } from '../src/multiplayer/protocol';
import { arenaField } from '../src/arena/together';
import { WEAR } from '../src/economy/catalog';
import { fanOf } from '../src/economy/wear';
import { RUNGS, publicRecord, type BoutEntry } from '../src/career/career';
import { standsOf, type Fighter, type Who } from '../src/arena/ceremony';
import { raisesFlag } from '../src/arena/supporterGear';
import { PLAYER_SIDE, myShowResult, playerCorner, playerMainBill, cheeredSide } from '../src/arena/myGala';

/**
 * Wave-5 candidate audit (f4b843b): what the merged client sends is what the protocol (and so the server, which runs the
 * same parseMove: server/worker.ts) accepts, field for field; and the stands' moments reach the supporters' flags by
 * the stand side of the wrestler concerned (the arena's react() after the merge takes the bill's side, `who`).
 */
const base = { type: 'move', x: 30, y: 0.1, z: -12, yaw: 0.4, speed: 0, space: 'street', clip: 'Idle' } as const;

describe('presence: every field the merged client builds passes parseMove unchanged', () => {
  it('an older client (no arena, fan or rec) is still accepted, and nothing is added to its move', () => {
    const m = parseMove({ ...base }, 'pikine')!;
    expect(m).not.toBeNull(); expect('arena' in m).toBe(false); expect('fan' in m).toBe(false);
    expect(parseMove({ ...base, speed: 3.2, clip: 'Walk' }, 'plateau')).not.toBeNull();
  });
  it('fan: every piece of the stall, as the supporters module sends it', () => {
    for (const sp of WEAR) {
      const fan = fanOf(sp)!;
      expect(parseMove({ ...base, fan }, 'pikine')?.fan).toEqual(fan);
    }
  });
  it('arena: every phase a show shares, each preliminary, the player\'s own night (m), every result, as together.ts builds it', () => {
    const shared = ARENA_PHASES.slice(ARENA_PHASES.indexOf('filling'), ARENA_PHASES.indexOf('leaving') + 1);
    const results = [null, ...(['left', 'right', null] as const).flatMap(w => ARENA_OUTCOMES.map(o => ({ winner: w, outcome: o })))];
    let n = 0;
    for (const phase of shared) for (const main of [false, true]) for (const result of results) for (const t of [0, 12.3, 899.9, 5000]) {
      const i = phase === 'prelims' ? (n++ % ARENA_PRELIMS) : undefined;
      const a = arenaField({ day: 12, phase, t, i, result, here: true, main })!;
      expect(a).not.toBeNull();
      expect(parseMove({ ...base, arena: a }, 'pikine')?.arena).toEqual(a);
    }
    // the player's own result, as their show sends it (myShowResult: their side is the left one)
    for (const w of ['player', 'opponent', null] as const) for (const o of ARENA_OUTCOMES) {
      const a = arenaField({ day: 3, phase: 'result', t: 2, result: myShowResult(w, o), here: true, main: true })!;
      expect(parseMove({ ...base, arena: a }, 'pikine')?.arena).toEqual(a);
    }
  });
  it('the player fighting in the ring, as main.ts publishes it (the street, a fighting stance, the ring\'s point)', () => {
    expect(parseMove({ ...base, x: 0.4, y: 0.2, z: 10.4, speed: 0, space: 'street', clip: 'Stance', arena: { d: 9, p: ARENA_PHASES.indexOf('bout'), t: 4, m: 1 } }, 'pikine')).not.toBeNull();
  });
  it('rec: every public record line the career can make is the one the server keeps', () => {
    expect(REC_RUNGS).toEqual(RUNGS.map(r => r.label));
    const bout = (res: BoutEntry['res']): BoutEntry => ({ at: 0, day: 1, mode: 'classe', opp: 'Gora', style: 'Costaud', level: 2, res, how: '', purse: 0, pts: 0 });
    for (const r of RUNGS) for (const ecurie of [null, 'Baobab']) for (const bouts of [[bout('V')], [bout('V'), bout('D'), bout('N')], Array.from({ length: 12000 }, () => bout('V'))]) {
      const line = publicRecord(bouts, r.label, ecurie)!;
      expect(recordTag(line)).toBe(line);
    }
  });
});

describe('the arena\'s moments reach the supporters\' flags by the stand side (react(m, who) after the merge)', () => {
  const babacar: Fighter = { id: 'babacar', name: 'Babacar', ecurie: 'Baobab' }, lamine: Fighter = { id: 'lamine', name: 'Lamine', ecurie: 'Teranga' };
  const flag = (e: 'baobab' | 'teranga') => ({ e, k: 'flag' as const });
  /** What a supporter's flag does when the show reacts for `who` of `bill` (module.ts react: standsOf, then the listeners). */
  const rises = (bill: { left: Fighter; right: Fighter }, who: Who, e: 'baobab' | 'teranga', m: 'entrance' | 'fall' | 'result') => raisesFlag(flag(e), m, standsOf(bill, who));
  it('a watched bout: the flag of the winner\'s écurie goes up, whichever side of the bill he is on', () => {
    for (const bill of [{ left: babacar, right: lamine }, { left: lamine, right: babacar }]) for (const who of ['left', 'right'] as const) {
      const e = bill[who].ecurie === 'Baobab' ? 'baobab' : 'teranga', other = e === 'baobab' ? 'teranga' : 'baobab';
      for (const m of ['entrance', 'fall', 'result'] as const) { expect(rises(bill, who, e, m)).toBe(true); expect(rises(bill, who, other, m)).toBe(false); }
    }
  });
  it('the player\'s own night: the side of their corner is the one their stands cheer (the fighter\'s corner and the bill agree)', () => {
    for (const ecurie of ['Baobab', null] as const) for (const opp of [babacar, lamine, { id: 'gora', name: 'Gora', ecurie: 'indépendant' }]) {
      const bill = playerMainBill({ name: 'Moussa', ecurie }, opp, false);
      const corner = playerCorner(bill);                                                        // what arenaFighter.corner() says
      const boutSide = corner === 'teranga' ? 'right' : 'left';                                // module.ts boutMoment
      expect(standsOf(bill, PLAYER_SIDE)).toBe(boutSide);                                     // go('result') → react(…, who)
      expect(raisesFlag(flag(corner), 'result', standsOf(bill, myShowResult('player', 'projection').winner!))).toBe(true);
    }
  });
  it('a friend\'s own night: no side is cheered here (the whole crowd applauds), so no flag is raised for a side', () => {
    expect(cheeredSide('friend', 'left')).toBeNull();
    expect(cheeredSide('clock', 'left')).toBe('left'); expect(cheeredSide('mine', 'right')).toBe('right');
  });
});
