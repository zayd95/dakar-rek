import { describe, expect, it } from 'vitest';
import { CineBout, NO_INPUT, TECHS, type CineInput } from '../src/lamb/cinematic';

const DT = 1 / 30;
const far = { player: 5, opponent: 5 };
type Pol = (b: CineBout) => Partial<CineInput>;

/** Steps until `stop` with the controls `pol` gives, the pair `apart` m apart standing. */
function run(b: CineBout, pol: Pol, stop: (b: CineBout) => boolean, apart = 1.4, edge = far, max = 6000) {
  for (let i = 0; i < max && !stop(b); i++) b.step(DT, { ...NO_INPUT, ...pol(b) }, apart, edge);
}
/** Into the empoignade by a counter-grip: wait for his tell, press late in it. */
function counterGrip(b: CineBout) {
  run(b, x => ({ press: x.tellK >= x.holdFrom() + 0.05 }), x => x.phase === 'empoignade');
}

describe('the cinematic bout (src/lamb/cinematic.ts)', () => {
  it('no clock rushes the player standing: he waits, then grabs late in the opponent\'s tell and holds the better grip', () => {
    const b = new CineBout({ level: 3, seed: 3 });
    run(b, () => ({}), x => x.t > 1.5, 3);                     // far apart: he circles, nothing happens
    expect(b.phase).toBe('debout');
    counterGrip(b);
    expect(b.start).toBe('contre'); expect(b.grip).toBeGreaterThan(0.3);
  });

  it('using his push against him opens the hip throw; a set-up throw on a tired man puts him down, and the fall is replayed', () => {
    const b = new CineBout({ level: 2, seed: 4 });
    b.stamina.opponent = 40;
    // pull while he pushes, rest otherwise; resist his attacks late in the tell; again from standing if an exchange parts them
    for (let tries = 0; tries < 8 && !(b.phase === 'empoignade' && b.open.hanche > 0.75); tries++) {
      if (b.phase !== 'empoignade') { run(b, () => ({}), x => x.phase === 'debout'); counterGrip(b); }
      run(b, x => x.aiPlan.act === 'attaque' ? { press: x.tellK > x.holdFrom() + 0.03 } : x.aiPlan.act === 'pousse' ? { hold: true, push: -1 } : {},
        x => x.phase !== 'empoignade' || x.open.hanche > 0.75);
    }
    expect(b.phase).toBe('empoignade'); expect(b.lit).toBe('hanche');
    run(b, () => ({ pick: 'hanche' }), x => x.phase === 'projection');
    run(b, x => ({ press: x.needle >= (x.z0 + x.z1) / 2 }), x => x.phase !== 'projection');
    expect(b.scene).toMatchObject({ kind: 'throw', by: 'player', result: 'fall', a: TECHS.hanche.a, b: TECHS.hanche.b });
    run(b, () => ({}), x => x.phase === 'replay' || x.phase === 'fin');
    expect(b.phase).toBe('replay');
    run(b, () => ({}), x => x.phase === 'fin');
    expect(b.winner).toBe('player');
  });

  it('a throw with no set-up on a fresh man fails: he resists or turns it round', () => {
    const b = new CineBout({ level: 3, seed: 9 });
    counterGrip(b);
    run(b, () => ({ pick: 'souleve' }), x => x.phase === 'projection');
    run(b, x => ({ press: x.needle >= (x.z0 + x.z1) / 2 }), x => x.phase !== 'projection');
    expect(b.scene?.result === 'fall').toBe(false);
  });

  it('a press too early in his attack is read: no second press counts, and he goes through', () => {
    const b = new CineBout({ level: 3, seed: 5 });
    counterGrip(b);
    run(b, () => ({}), x => x.aiPlan.act === 'attaque' || x.phase !== 'empoignade');
    expect(b.aiPlan.act).toBe('attaque');
    b.step(DT, { ...NO_INPUT, press: true }, 0.8, far);          // at once: too early
    expect(b.aiPlan.read).toBe(true);
    run(b, () => ({ press: true }), x => x.phase !== 'empoignade');
    expect(b.scene?.by).toBe('opponent');
  });

  it('mashing and spamming one move loses; doing nothing loses; three times out of the pit loses', () => {
    for (const seed of [1, 2, 3]) {
      const m = new CineBout({ level: 3, seed });
      let i = 0;
      run(m, () => ({ press: ++i % 6 === 0, hold: true, push: 1, pick: i % 30 === 0 ? 'hanche' : null }), x => x.phase === 'fin', 1.4, far, 20000);
      expect(m.winner).toBe('opponent');
      const p = new CineBout({ level: 3, seed });
      run(p, () => ({}), x => x.phase === 'fin', 1.4, far, 20000);
      expect(p.winner).toBe('opponent');
    }
    const c = new CineBout({ level: 2, seed: 1 });
    for (let k = 1; k <= 3; k++) {
      c.step(DT, NO_INPUT, 3, { player: -0.2, opponent: 5 });
      expect(c.sorties.player).toBe(k);
    }
    expect(c.phase).toBe('fin'); expect(c.winner).toBe('opponent');
  });

  it('his tells are long and readable at level 1, short at level 6', () => {
    const a = new CineBout({ level: 1 }), z = new CineBout({ level: 6 });
    expect(a.tellFor()).toBeGreaterThan(1.3); expect(z.tellFor()).toBeLessThan(0.8);
    expect((1 - a.holdFrom()) * a.tellFor()).toBeCloseTo(0.75, 2);
  });
});
