import { describe, expect, it } from 'vitest';
import { LambDuel } from '../src/lamb/duel';
import { STYLES } from '../src/lamb/rules';
import type { Input } from '../src/core/input';

/**
 * The checks' set-up hold (duelHold, scripts/check-lamb2.mjs steps 4–5) without a browser: with the opponent, the
 * round's clock and the referee held still, a position set up in the empoignade plays out alike on every run — his grip
 * wears the player's balance away, then a throw on a wrestler who slips, with the grip, takes him down.
 */
const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
const DT = 1 / 60;

function bout(seed: number) {
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const duel = new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'amical', style: { ...STYLES.costaud, name: 'Gora' }, level: 3, ring: 7.6, discipline: 'avec_frappe', seed });
  const walkIn = () => {
    const p = duel.fighterPoints(), me = { x: p[1][0], z: p[1][2] }, ai = { x: p[4][0], z: p[4][2] };
    const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1, ax = duel.axes();
    steer.x = (dx / len) * ax.right.x + (dz / len) * ax.right.z; steer.y = (dx / len) * ax.fwd.x + (dz / len) * ax.fwd.z;
  };
  const info = () => duel.info() as unknown as Info;
  /** Runs until `cond` (or `max` seconds), steering in while standing and pressing Saisir once in reach. */
  const run = (cond: (i: Info) => boolean, max = 30, act?: (i: Info) => void) => {
    for (let t = 0; t < max; t += DT) {
      const i = info();
      if (cond(i)) return i;
      steer.x = 0; steer.y = 0;
      if (act) act(i);
      duel.update(DT);
    }
    return info();
  };
  const grab = (i: Info) => { if (i.phase === 'fight') { if (i.dist > 1.4) walkIn(); else duel.pressGrab(); } };
  return { duel, info, run, grab };
}

describe('làmb 2.0 · the checks’ set-up hold (opponent, clock and referee held still)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: his grip wears the player away, then the player's throw takes him down — no move, counter, bell or separation of theirs`, () => {
      const { duel, info, run, grab } = bout(seed);
      run(i => i.phase === 'fight');
      duel.debugHold(true);
      expect(info().held).toBe(true);
      const t0 = info().timeLeft as number;
      // the empoignade, taken by the player: a held opponent strikes nobody and grabs nobody
      const c = run(i => i.phase !== 'fight', 30, grab);
      expect(c.phase).toBe('clinch');
      expect(c.clinch.by).toBe('player');
      expect(c.score.opponent.hits ?? 0).toBe(0);
      // step 4: his grip clearly on the player — the balance slips away, only by the grip (he makes no move)
      duel.debugSet('opponent', { balance: 90 }); duel.debugSet('player', { grip: -85, balance: 50 });
      let moved = false;
      const sv = run(i => i.phase !== 'clinch' || i.clinch.posture.player !== 'stable', 20, i => { if (i.clinch?.move?.opponent) moved = true; duel.debugSet('player', { grip: -85 }); });
      expect(sv.phase).toBe('clinch');
      expect(sv.clinch.posture.player).toBe('glisse');
      expect(sv.balance.player).toBeLessThan(50);
      expect(moved).toBe(false);
      // and the words say so (not his move's: he makes none)
      const said = () => (duel as unknown as { said: string }).said;
      run(() => /glisses|tomber/.test(said()), 3, () => duel.debugSet('player', { grip: -85 }));
      expect(said()).toMatch(/glisses|tomber/);
      // longer than the referee's patience: still held together, and the clock has not moved
      const late = run(() => false, 10, () => duel.debugSet('player', { grip: 0, balance: 80 }));
      expect(late.phase).toBe('clinch');
      expect(late.timeLeft).toBe(t0);
      // step 5: a throw on a wrestler who slips, with the grip — he goes down (no counter from a held opponent)
      duel.debugSet('opponent', { balance: 28, grip: -40 }); duel.debugSet('player', { stamina: 100 });
      duel.pressStrike('big');
      let attempt = false;
      const end = run(i => i.phase === 'fall' || i.phase === 'result', 5, i => { if (i.clinch?.attempt?.by === 'player') attempt = true; });
      expect(attempt).toBe(true);
      expect(end.phase).toBe('fall');
      expect(end.outcome).toBe('projection');
      expect(end.winner).toBe('player');
      expect(end.lastThrow).toEqual({ by: 'player', result: 'fall' });
      expect(end.timeLeft).toBe(t0);
    });
  }
  it('let go, the opponent fights again and the clock runs', () => {
    const { duel, info, run } = bout(9);
    run(i => i.phase === 'fight');
    duel.debugHold(true);
    const t0 = info().timeLeft as number;
    run(() => false, 3);
    expect(info().timeLeft).toBe(t0);
    duel.debugHold(false);
    expect(info().held).toBeUndefined();
    run(() => false, 3);
    expect(info().timeLeft).toBeLessThan(t0);
  });
  it('the clock can be given a whole round back (a long check’s earlier steps do not eat the later ones’ time)', () => {
    const { duel, info, run } = bout(10);
    run(i => i.phase === 'fight');
    run(() => false, 5);
    expect(info().timeLeft).toBeLessThan(90);
    duel.debugClock(90);
    expect(info().timeLeft).toBe(90);
  });
});
