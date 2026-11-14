import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DuelFx, FX, clinchFraming, contactShift, kickShape, mixFraming, pairHalfWidth, plan, rowOf, type Framing } from '../src/lamb/fx';
import { fovFor } from '../src/core/view';
import { LambDuel } from '../src/lamb/duel';
import { STYLES } from '../src/lamb/rules';
import type { Input } from '../src/core/input';

/**
 * « Le choc » (src/lamb/fx.ts, docs/wrestling/WRESTLING-PLAN.md §5): the plan of each contact (stop, push, sound, buzz),
 * the stop's and the push's course in real time, the empoignade's close-up on a phone's screen (heads under the Prise,
 * feet over the buttons), the bodies chest to chest — and none of it in a bout without a DOM.
 */
const FIGHT_PORTRAIT: Framing = { dist: 8.5 + 1.1 * 1.1, height: 3.4, look: 0.9 };     // the duel's side camera, 1.1 m apart
const FIGHT_LANDSCAPE: Framing = { dist: 6.5 + 0.6 * 1.1, height: 3.0, look: 1.1 };

describe('« Le choc » · the plan of each contact', () => {
  it('a quick hit stops the bout, a big one longer, a stagger or a throw longest; a guarded big strike briefly', () => {
    const s = (e: Parameters<typeof plan>[0]) => plan(e).stop;
    expect(s('quick')).toBeGreaterThan(0);
    expect(s('big')).toBeGreaterThan(s('quick'));
    expect(s('stagger')).toBeGreaterThan(s('big'));
    expect(s('throw')).toBeGreaterThanOrEqual(s('stagger'));
    expect(s('counter')).toBeGreaterThan(s('big'));
    expect(s('guarded')).toBeGreaterThan(0); expect(s('guarded')).toBeLessThan(s('quick'));
    for (const e of ['grip', 'fall', 'read'] as const) expect(s(e)).toBe(0);
    for (const e of ['quick', 'big', 'stagger', 'guarded', 'throw', 'counter'] as const) expect(s(e)).toBeLessThanOrEqual(0.15);   // weight, never a pause
  });
  it('the camera is pushed on a clean hit, harder on a big one or a stagger, hardest when a body lands; calm (≤ 8 %)', () => {
    expect(plan('quick').kick).toBeGreaterThan(0);
    expect(plan('big').kick).toBeGreaterThan(plan('quick').kick);
    expect(plan('stagger').kick).toBeGreaterThanOrEqual(plan('big').kick);
    expect(plan('fall').kick).toBeGreaterThanOrEqual(plan('stagger').kick);
    for (const e of ['quick', 'big', 'stagger', 'fall'] as const) expect(plan(e).kick).toBeLessThanOrEqual(0.08);
    for (const e of ['guarded', 'throw', 'grip', 'read'] as const) expect(plan(e).kick).toBe(0);
  });
  it('a thud when a body lands, a slap when the empoignade starts', () => {
    expect(plan('fall').sound).toBe('thud');
    expect(plan('grip').sound).toBe('slap');
    expect(plan('quick').sound).toBeNull();
  });
  it('the phone buzzes on a clean hit taken, on the player’s own fall, on a counter landed — not on what the player lands', () => {
    expect(plan('quick', { taken: true }).buzz).toBe(30);
    expect(plan('big', { taken: true }).buzz).toBe(40);
    expect(plan('stagger', { taken: true }).buzz).toBe(50);
    expect(plan('fall', { taken: true }).buzz).toEqual([40, 30, 60]);
    expect(plan('counter', { mine: true }).buzz).toBe(25);
    expect(plan('read', { mine: true }).buzz).toBe(25);
    for (const e of ['quick', 'big', 'stagger', 'fall', 'throw', 'guarded'] as const) expect(plan(e, { mine: true }).buzz).toBeNull();
    expect(plan('counter', { taken: true }).buzz).toBeNull();
    expect(plan('guarded', { taken: true }).buzz).toBeNull();
  });
});

describe('« Le choc » · the stop and the push in real time', () => {
  it('the longest stop wins, never summed; it holds whole frames, at least two even on a slow device', () => {
    const fx = new DuelFx();
    fx.hit('quick'); fx.hit('stagger'); fx.hit('quick');
    expect(fx.stops).toBe(3);
    let frames = 0; while (fx.holds(1 / 60)) frames++;
    expect(frames).toBe(Math.ceil(FX.stop.stagger! * 60 - 1e-9));          // 0.13 s at 60 fps: 8 frames, not 0.25 s
    fx.hit('quick'); frames = 0; while (fx.holds(0.1)) frames++;
    expect(frames).toBe(FX.stopFrames);                                    // 10 fps: two frames, never swallowed by one
    fx.hit('quick'); frames = 0; while (fx.holds(1 / 30)) frames++;
    expect(frames).toBe(2);                                                // 30 fps: 0.06 s is two frames
    expect(fx.holding).toBe(false);
    expect(fx.lastStop).toBe(FX.stop.quick);
  });
  it('the push goes in over 0.05 s and back over 0.25 s; a smaller one never restarts a bigger one', () => {
    expect(kickShape(0)).toBe(0); expect(kickShape(FX.kickIn)).toBeCloseTo(1, 6); expect(kickShape(FX.kickIn + FX.kickOut)).toBe(0); expect(kickShape(-1)).toBe(0);
    for (let t = FX.kickIn; t < FX.kickIn + FX.kickOut; t += 0.02) expect(kickShape(t + 0.02)).toBeLessThanOrEqual(kickShape(t) + 1e-9);
    const fx = new DuelFx();
    fx.hit('big'); fx.tick(FX.kickIn, false, false);
    expect(fx.kick).toBeCloseTo(FX.kick.big!, 6);
    fx.hit('quick');                                                       // smaller: the big push goes on
    expect(fx.kick).toBeCloseTo(FX.kick.big!, 6);
    fx.tick(0.1, false, false); const k = fx.kick; fx.hit('stagger'); fx.tick(FX.kickIn, false, false);
    expect(fx.kick).toBeGreaterThan(k);                                    // bigger: it starts again
    fx.tick(1, false, false); expect(fx.kick).toBe(0);
  });
  it('the close-up eases in over 0.4 s and the bodies close over 0.15 s, and both ease back', () => {
    const fx = new DuelFx();
    fx.tick(0.1, true, true); expect(fx.close).toBeGreaterThan(0); expect(fx.close).toBeLessThan(1);
    fx.tick(FX.contact.ease, true, true); expect(fx.contact).toBe(1); expect(fx.close).toBeLessThan(1);
    fx.tick(FX.clinch.ease, true, true); expect(fx.close).toBe(1);
    fx.tick(FX.clinch.ease, false, false); expect(fx.close).toBe(0); expect(fx.contact).toBe(0);
  });
  it('counts what was felt: thuds, slaps, buzzes asked of the phone', () => {
    const fx = new DuelFx();
    fx.hit('grip'); fx.hit('fall', { taken: true }); fx.hit('quick', { taken: true }); fx.hit('quick', { mine: true });
    expect([fx.slaps, fx.thuds, fx.buzzes]).toEqual([1, 1, 2]);
    expect(fx.lastBuzz).toBe(30);
  });
});

describe('« Le choc » · the empoignade’s close-up on a phone', () => {
  it('rowOf is the game camera’s own projection of the pair’s plane', () => {
    for (const [w, h] of [[390, 844], [844, 390]] as const) {
      const fov = fovFor(w, h), cam = new THREE.PerspectiveCamera(fov, w / h, 0.3, 700), f: Framing = { dist: 6.2, height: 3.1, look: 1.4 };
      cam.position.set(0, f.height, -f.dist); cam.lookAt(0, f.look, 0); cam.updateMatrixWorld();
      for (const y of [0.2, 1, 1.9]) {
        const v = new THREE.Vector3(0.36, y, 0).project(cam);
        expect(rowOf(f, y, fov, h)).toBeCloseTo(((1 - v.y) / 2) * h, 3);
      }
    }
  });
  it('390 × 844: 70 % of the fight’s distance, 0.4 m lower, the heads ≥ 12 px under the Prise (its bottom at 373), the feet over the buttons', () => {
    const fov = fovFor(390, 844), f = clinchFraming(FIGHT_PORTRAIT, { fovY: fov, h: 844, top: 373 + FX.clinch.gap, bottom: 690, head: 1.9, feet: 0.2 });
    expect(f.dist).toBeCloseTo(FIGHT_PORTRAIT.dist * FX.clinch.dist, 6);
    expect(f.height).toBeCloseTo(FIGHT_PORTRAIT.height - FX.clinch.lower, 6);
    const head = rowOf(f, 1.9, fov, 844), feet = rowOf(f, 0.2, fov, 844);
    expect(head).toBeGreaterThanOrEqual(373 + 12 + FX.clinch.spare - 0.01); expect(head).toBeLessThan(373 + 12 + FX.clinch.spare + 1);
    expect(feet).toBeLessThanOrEqual(690);
    // about 1 / 0.7 = 1.4 × as tall as in the fight's framing
    expect(feet - head).toBeGreaterThan(1.35 * (rowOf(FIGHT_PORTRAIT, 0.2, fov, 844) - rowOf(FIGHT_PORTRAIT, 1.9, fov, 844)));
  });
  it('360 × 640: the screen is short — pulled back until the feet clear the buttons, the heads still under the Prise', () => {
    const fov = fovFor(360, 640), top = 373 + FX.clinch.gap, bottom = 486;
    const f = clinchFraming(FIGHT_PORTRAIT, { fovY: fov, h: 640, top, bottom, head: 1.9, feet: 0.2 });
    expect(f.dist).toBeGreaterThan(FIGHT_PORTRAIT.dist * FX.clinch.dist);
    expect(f.dist).toBeLessThanOrEqual(FIGHT_PORTRAIT.dist * FX.clinch.farthest + 1e-9);
    expect(rowOf(f, 1.9, fov, 640)).toBeGreaterThanOrEqual(top - 0.01);
    expect(rowOf(f, 0.2, fov, 640)).toBeLessThanOrEqual(bottom);
  });
  it('a screen too short for both: the heads stay under the HUD, the feet give, never farther than 1.25 × the fight', () => {
    const fov = fovFor(360, 640), f = clinchFraming(FIGHT_PORTRAIT, { fovY: fov, h: 640, top: 440, bottom: 470, head: 1.9, feet: 0.2 });
    expect(f.dist).toBeCloseTo(FIGHT_PORTRAIT.dist * FX.clinch.farthest, 6);
    expect(rowOf(f, 1.9, fov, 640)).toBeGreaterThanOrEqual(440 - 0.01);
  });
  it('844 × 390 and 667 × 375: closer and lower too, the heads under the Prise column', () => {
    for (const [w, h, top] of [[844, 390, 212], [667, 375, 212]] as const) {
      const fov = fovFor(w, h), f = clinchFraming(FIGHT_LANDSCAPE, { fovY: fov, h, top, bottom: h - 6, head: 1.9, feet: 0.2 });
      expect(f.dist).toBeCloseTo(FIGHT_LANDSCAPE.dist * FX.clinch.dist, 6);
      expect(rowOf(f, 1.9, fov, h)).toBeGreaterThanOrEqual(top - 0.01);
      expect(rowOf(f, 0.2, fov, h)).toBeLessThanOrEqual(h - 6);
    }
  });
  it('nothing over the pair: the look point stays the fight’s; the blend goes from one framing to the other', () => {
    const fov = fovFor(390, 844), f = clinchFraming(FIGHT_PORTRAIT, { fovY: fov, h: 844, top: 0, bottom: 844, head: 1.9, feet: 0.2 });
    expect(f.look).toBe(FIGHT_PORTRAIT.look);
    expect(mixFraming(FIGHT_PORTRAIT, f, 0)).toEqual(FIGHT_PORTRAIT);
    expect(mixFraming(FIGHT_PORTRAIT, f, 1).dist).toBeCloseTo(f.dist, 9);
  });
  it('the HUD and controls that count are those over the pair: a button at the side of a landscape screen does not', () => {
    // 667 × 375 in landscape: « Projeter » spans x 439–499, right of the pair (centre 333)
    const half = pairHalfWidth(FIGHT_LANDSCAPE, fovFor(667, 375), 667, 375);
    expect(333 + half).toBeLessThan(439);
    // 360 × 640 in portrait: « Pivoter » (x 198–258) is over the pair's right side
    expect(180 + pairHalfWidth(FIGHT_PORTRAIT, fovFor(360, 640), 360, 640)).toBeGreaterThan(198);
  });
  it('chest to chest: each body moves half the way to 0.72 m between centres, never apart', () => {
    expect(contactShift(1.12)).toBeCloseTo(0.2, 9);
    expect(contactShift(0.72)).toBe(0);
    expect(contactShift(0.5)).toBe(0);
  });
});

describe('« Le choc » · only in the player’s own bout', () => {
  it('a duel without a DOM (headless tests, a watched bout’s simulation) has no feel at all', () => {
    const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
    for (const discipline of ['sans_frappe', 'avec_frappe'] as const) {
      const d = new LambDuel({ origin: { x: 0, z: 0 }, look: { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] }, input, crowdSize: 0, mode: 'amical', style: STYLES.costaud, level: 1, discipline, seed: 3 });
      for (let i = 0; i < 400 && d.phase !== 'result'; i++) { d.pressGrab(); d.update(1 / 30); }
      expect('fx' in d.info()).toBe(false);
      expect(d.update(1 / 30).kick).toBeUndefined();
      d.dispose();
    }
  });
});
