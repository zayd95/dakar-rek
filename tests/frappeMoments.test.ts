import { describe, expect, it } from 'vitest';
import { frappePlan } from '../src/arena/frappeMoments';
import { WatchedBout } from '../src/arena/bout';
import { boutSeed } from '../src/arena/program';
import { rosterOpponent } from '../src/lamb/opponents';
import { LambDuel, type DuelMoment } from '../src/lamb/duel';
import { PARTNER } from '../src/lamb/rules';
import type { Input } from '../src/core/input';

/**
 * Làmb 2.0: the arena answers the moments of a bout avec frappe — the player's own main event and the watched one, one
 * plan (src/arena/frappeMoments.ts) — and the duel tells those moments as they happen (LambDuel.onMoment).
 */
describe('làmb 2.0 · the stands and the announcer at a bout avec frappe', () => {
  it('a clean strike: the striker’s side answers, louder for a big one; the announcer says nothing', () => {
    const big = frappePlan('strike', 'left', { kind: 'big' }), quick = frappePlan('strike', 'right', { kind: 'quick' });
    expect(big.react).toEqual([['left', 'shout', 0.45, 1.8]]); expect(big.cheer).toBeGreaterThan(0); expect(big.say).toBeNull();
    expect(quick.react).toEqual([['right', 'applause', 0.12, 1.1]]); expect(quick.cheer).toBe(0);
    expect(frappePlan('strike', null, { kind: 'big' }).react).toEqual([]);
  });
  it('a knockdown is not the fall: the striker’s side stands up, the announcer says he is still up — no split', () => {
    const p = frappePlan('stagger', 'right', { kind: 'big', name: 'Gora' });
    expect(p.react).toEqual([['right', 'standUp', 0.55, 2.5], ['ends', 'shout', 0.3, 1.6]]);
    expect(p.split).toBeNull(); expect(p.moment).toBeNull();
    expect(p.say).toBe('🎤 L’annonceur : Gora vacille ! Il n’est pas tombé : le combat continue.');
    expect(frappePlan('stagger', 'right', { name: 'Gora', announce: false }).say).toBeNull();
  });
  it('the fall that ends it splits the stands (the winner’s side); a decision brings them up', () => {
    const fall = frappePlan('fall', 'left', { outcome: 'projection' });
    expect(fall.split).toBe('left'); expect(fall.moment).toBeNull(); expect(fall.say).toBeNull();
    expect(frappePlan('fall', 'left', { outcome: 'decision' })).toMatchObject({ split: null, moment: 'decision' });
    expect(frappePlan('fall', null, { outcome: 'egalite' })).toMatchObject({ split: null, moment: 'decision' });
  });
  it('the referee raises the winner’s arm: the announcer gives the result; then the stands’ result plan for his side', () => {
    expect(frappePlan('arm', 'left', { outcome: 'projection', name: 'Awa' }).say).toMatch(/^🎤 L’annonceur : l’arbitre lève le bras… Awa l’emporte par projection !/);
    expect(frappePlan('arm', 'right', { outcome: 'decision', name: 'Gora' }).say).toMatch(/Gora l’emporte à la décision de l’arbitre/);
    expect(frappePlan('arm', 'left', { outcome: 'projection', name: 'Awa', announce: false }).say).toBeNull();
    expect(frappePlan('arm', null, { outcome: 'egalite' }).say).toBeNull();
    expect(frappePlan('result', 'right')).toMatchObject({ moment: 'result', side: 'right' });
  });
});

describe('làmb 2.0 · the duel tells its moments as they happen', () => {
  const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
  it('a bout avec frappe: clean strikes, knockdowns by who landed them, then the fall, the referee’s arm for the winner, the result', () => {
    let checked = 0;
    for (const day of [40, 41, 42, 43]) {
      const b = new WatchedBout({ x: 0, z: 0 }, look, boutSeed('pikine', day), { frappe: { left: rosterOpponent('Babacar', day)!, right: rosterOpponent('Lamine', day)! } });
      const seen: [DuelMoment, string | null, string | undefined][] = [];
      b.duel.onMoment = (m, who, o) => seen.push([m, who, o?.kind]);
      for (let i = 0; i < 60 * 60 && !b.over; i++) b.advance(1 / 60);
      const r = b.result!, i = b.info() as Record<string, unknown> & { score: { player: { hits?: number; staggers?: number }; opponent: { hits?: number; staggers?: number } } };
      const count = (m: DuelMoment, who: string) => seen.filter(s => s[0] === m && s[1] === who).length;
      // every clean strike and every knockdown, told once, by who landed it, with its kind
      for (const who of ['player', 'opponent'] as const) {
        expect(count('strike', who) + count('stagger', who)).toBe((i.score[who].hits ?? 0));
        expect(count('stagger', who)).toBe(i.score[who].staggers ?? 0);
      }
      expect(seen.filter(s => s[0] === 'strike' || s[0] === 'stagger').every(s => s[2] === 'quick' || s[2] === 'big')).toBe(true);
      // then the end, in order: the fall, the arm (a winner only), the result
      const tail = seen.filter(s => s[0] === 'fall' || s[0] === 'arm' || s[0] === 'result').map(s => s[0]);
      expect(tail).toEqual(r.winner ? ['fall', 'arm', 'result'] : ['fall', 'result']);
      if (r.winner) expect(seen.find(s => s[0] === 'arm')![1]).toBe(r.winner);
      checked++;
      b.dispose();
    }
    expect(checked).toBe(4);
  });
  it('the écurie’s lesson and drills tell no moment (no stands there)', () => {
    const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
    for (const drill of [undefined, 'frappe'] as const) {
      const d = new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5, discipline: 'avec_frappe', drill });
      const seen: string[] = [];
      d.onMoment = m => seen.push(m);
      if (drill) d.debugDrillAnswer(true);
      for (let k = 0; k < 60 * 30; k++) { if (!drill && k % 30 === 0) d.pressStrike('quick'); d.update(1 / 60); }
      expect(seen).toEqual([]);
    }
  });
});
