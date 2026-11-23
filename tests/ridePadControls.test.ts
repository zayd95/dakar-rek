import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { terangaSpec, rafetSpec, lamaneSpec, gaindeSpec } from '../src/transport/modelCars';
import { berlineSpec } from '../src/transport/premiumCars';
import { BOOST_AT, FULL_AT, STEER_REACH, gasPressure, rockerSteer } from '../src/transport/ridePad';
import { DriveControls } from '../src/transport/controls';
import type { DriveSpec } from '../src/transport/spec';

const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = text('../src/transport/ridePad.css'), own = text('../src/transport/ownedModule.ts'), hud = text('../src/ui/hud.ts');
const SPEC: DriveSpec = { maxSpeed: 19, boostSpeed: 29, reverseSpeed: 3, accel: 4, brake: 7.5, turnRadius: 5.6, steer: 2.8, grip: 9.5, halfWidth: 0.9, halfLength: 2.3 };

describe('the steering rocker and the pedals', () => {
  it('steers by how far the thumb slides, like a joystick: nothing while it rests, the wheel follows the finger, full lock at the end of the stroke', () => {
    expect(rockerSteer(0)).toBe(0); expect(rockerSteer(0.05)).toBe(0); expect(rockerSteer(-0.05)).toBe(0);   // resting: no wheel
    expect(rockerSteer(1)).toBe(1); expect(rockerSteer(-1)).toBe(-1); expect(rockerSteer(-1.4)).toBe(-1);
    expect(rockerSteer(0.5)).toBeGreaterThan(0.3); expect(rockerSteer(0.5)).toBeLessThan(0.55);
    let prev = 0; for (let u = 0.1; u <= 1; u += 0.1) { const v = rockerSteer(u); expect(v).toBeGreaterThan(prev); prev = v; }   // always a little more
    expect(rockerSteer(-0.4)).toBeCloseTo(-rockerSteer(0.4));
    expect(STEER_REACH).toBeLessThan(89);                                                  // a stroke well inside the pad's half width
  });
  it('gives throttle by the toe: a gentle 0.35 at the top edge, full from the middle of the pedal down (where, held, the boosted range opens)', () => {
    expect(gasPressure(0)).toBeCloseTo(0.35); expect(gasPressure(1)).toBe(1); expect(gasPressure(2)).toBe(1); expect(gasPressure(-1)).toBeCloseTo(0.35);
    expect(gasPressure(0.3)).toBeLessThan(BOOST_AT); expect(gasPressure(0.2)).toBeLessThan(gasPressure(0.3));                                      // the upper part of the pedal: controlled, no boost
    expect(gasPressure(FULL_AT)).toBeGreaterThanOrEqual(BOOST_AT);                        // the thumb on the middle of the pedal is full throttle, not half
    expect(gasPressure(0.75)).toBeGreaterThanOrEqual(BOOST_AT);
    let prev = 0; for (let f = 0; f <= 1; f += 0.05) { const g = gasPressure(f); expect(g).toBeGreaterThanOrEqual(prev); prev = g; }
  });
  it('a thumb on the middle of the pedal reaches the full cruising speed, and the boosted range goes well past it (a car up to about 200 km/h)', () => {
    const c = new DriveControls(), full = c.update(0.016, { fwd: gasPressure(0.55), steer: 0, boost: false, brake: false }, 0, SPEC, true).target ?? 0;
    expect(full).toBeCloseTo(SPEC.maxSpeed);
    const best = Math.max(...[terangaSpec(), rafetSpec(), lamaneSpec(), gaindeSpec(), berlineSpec()].map(s => (s.drive!.boostSpeed ?? 0) * 3.6));
    expect(best).toBeGreaterThan(190); expect(best).toBeLessThanOrEqual(205);
    for (const s of [terangaSpec(), rafetSpec(), lamaneSpec(), gaindeSpec(), berlineSpec()]) expect((s.drive!.boostSpeed ?? 0) * 3.6).toBeGreaterThan(150);
  });
  it('a gas pedal alone sets a car off and a heavier toe goes faster; lifting it coasts to a stop', () => {
    const c = new DriveControls(), at = (fwd: number) => c.update(0.016, { fwd, steer: 0, boost: false, brake: false }, 0, SPEC, true).target ?? 0;
    expect(at(0.35)).toBeGreaterThan(2); expect(at(0.7)).toBeGreaterThan(at(0.35)); expect(at(1)).toBeCloseTo(19);
    expect(at(0)).toBe(0);
  });
  it('the driven vehicle takes its steering and throttle from the pad, never from the joystick', () => {
    expect(own).toContain('ridePad.tick(this, dt)');
    expect(text('../src/transport/ridePad.ts')).not.toContain('rp-lbl');   // no words on the pedals
    expect(own).toMatch(/fwd: ridePad\.gasAmount, steer: ridePad\.steer, boost: ridePad\.boostOn, brake: ridePad\.brake/);
    expect(own).not.toContain('ctx.input.joy');
    expect(hud).toContain("!document.body.classList.contains('ridepad')");              // no joystick under the left thumb while driving
    expect(hud).toContain('#steerpad');                                                   // and a thumb on the rocker does not turn the camera
  });
  it('is drawn as a rocker with a knob and as upright pedals: the joystick is hidden while driving, the gas green and tall, the brake red and a little shorter', () => {
    expect(css).toMatch(/body\.ridepad #steerpad \{ display: block; \}/);
    expect(css).toMatch(/body\.ridepad #joy \{ display: none !important; \}/);
    expect(css).toContain('.sp-k');
    const gas = /#ridepad \.rp-gas \{ width: (\d+)px; height: (\d+)px; border-radius: ([^;]+);/.exec(css)!, brake = /#ridepad \.rp-brake \{ width: (\d+)px; height: (\d+)px; border-radius: ([^;]+);/.exec(css)!;
    expect(Number(gas[2])).toBeGreaterThan(Number(gas[1]) * 1.5);                         // taller than wide
    expect(Number(brake[2])).toBeGreaterThan(Number(brake[1]) * 1.3);                     // upright too
    expect(Number(brake[2])).toBeLessThan(Number(gas[2]));                                // a little shorter than the accelerator
    expect(gas[3]).not.toContain('999px'); expect(brake[3]).not.toContain('999px');       // no longer round buttons
    expect(css).toContain('repeating-linear-gradient');                                   // the ribbed rubber
    expect(css).toMatch(/#16a34a/); expect(css).toMatch(/#dc2626/);                       // green and red
  });
});
