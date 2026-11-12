import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVERY, kmhOf, speedOver, speedo } from '../src/transport/speedo';

const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = text('../src/transport/speedo.css'), own = text('../src/transport/ownedModule.ts'), pad = text('../src/transport/ridePad.css');

/** A stand-in for the two elements the speedometer makes (no DOM in the unit tests): what was written, and how often. */
function fakeDom() {
  const made: { tag: string; textContent: string; id: string; classes: Set<string>; attrs: Record<string, string>; sets: number }[] = [];
  const el = (tag: string) => {
    const e = { tag, id: '', classes: new Set<string>(), attrs: {} as Record<string, string>, sets: 0, _t: '',
      get textContent() { return this._t; }, set textContent(v: string) { this._t = v; this.sets++; },
      classList: { add: (c: string) => e.classes.add(c), remove: (c: string) => e.classes.delete(c) },
      setAttribute(k: string, v: string) { e.attrs[k] = v; }, append() { /* */ }, appendChild() { /* */ } };
    made.push(e); return e;
  };
  (globalThis as unknown as { document: unknown }).document = { createElement: el };
  return made;
}

describe('the compact speedometer', () => {
  it('reads the actual speed in whole km/h, from the metres really covered in the frame', () => {
    expect(kmhOf(0)).toBe(0); expect(kmhOf(10)).toBe(36); expect(kmhOf(-5)).toBe(18); expect(kmhOf(21.5)).toBe(77); expect(kmhOf(0.1)).toBe(0);
    expect(speedOver(0.5, 1 / 30)).toBeCloseTo(15); expect(speedOver(-0.5, 1 / 30)).toBeCloseTo(15); expect(speedOver(3, 0)).toBe(0);
  });
  it('is shown only while a vehicle is driven, by the vehicle that drives; the text is written when the whole number changes, never every frame', () => {
    const made = fakeDom(), parent = { appendChild() { /* */ } } as unknown as HTMLElement, me = {}, other = {};
    speedo.init(parent);
    const root = made[0], num = made[1];
    expect(root.id).toBe('speedo'); expect(root.classes.has('on')).toBe(false); expect(speedo.active).toBe(false); expect(speedo.text).toBe('');   // on foot: hidden
    const sets0 = num.sets;
    speedo.show(me, 0, 1 / 60);
    expect(root.classes.has('on')).toBe(true); expect(speedo.text).toBe('0 km/h');
    for (let i = 0; i < 120; i++) speedo.show(me, 10, 1 / 60);                         // two seconds at a steady 36 km/h
    expect(speedo.text).toBe('36 km/h'); expect(num.textContent).toBe('36'); expect(num.sets - sets0).toBe(2);                       // « 0 », then « 36 »: two writes for 121 frames
    let v = 10; const before = num.sets;
    for (let i = 0; i < 60; i++) { v += 7 / 60; speedo.show(me, v, 1 / 60); }           // a second of hard acceleration (25 km/h more): the figure changes at most 1 / EVERY times
    expect(num.sets - before).toBeLessThanOrEqual(Math.ceil(1 / EVERY) + 1); expect(num.sets - before).toBeGreaterThan(5);
    speedo.show(me, 0, 1 / 60); expect(speedo.text).toBe('0 km/h');                    // a stop is shown at once
    speedo.hide(other); expect(speedo.active).toBe(true);                                // only the vehicle that holds it can hide it
    speedo.hide(me); expect(root.classes.has('on')).toBe(false); expect(speedo.text).toBe('');
  });
  it('is small, legible and fixed in size on every phone: 60 px at 320 px wide, 66 at 390, 72 from 424 up (and by the height on a phone held on its side); the number in tabular figures, the unit under it', () => {
    const d = /--d: clamp\((\d+)px, min\((\d+)vw, (\d+)vh\), (\d+)px\)/.exec(css)!;
    const at = (w: number, h: number) => Math.max(+d[1], Math.min(+d[4], (w * +d[2]) / 100, (h * +d[3]) / 100));
    expect(at(320, 568)).toBe(60); expect(Math.round(at(390, 844))).toBe(66); expect(at(430, 932)).toBe(72); expect(at(1280, 720)).toBe(72);
    expect(Math.round(at(568, 320))).toBe(61); expect(at(844, 390)).toBe(72);            // a phone on its side: sized by its height
    expect(css).toContain('tabular-nums'); expect(css).toMatch(/contain: strict/); expect(css).toMatch(/#speedo \{ display: none;/); expect(css).toMatch(/#speedo\.on \{ display: flex; \}/);
    expect(css).toMatch(/pointer-events: none/);                                          // never in the way of a thumb
  });
  it('stands on the left edge above the steering pad with a gap, inside the safe areas, away from the pedals (right) and the minimap and phone button (top right)', () => {
    expect(css).toMatch(/left: calc\(14px \+ var\(--sa-l\)\)/);
    const withPad = /body\.ridepad #speedo \{ bottom: calc\((\d+)px \+ (\d+)px \+ clamp\((\d+)px, [\d.]+vh, (\d+)px\) \+ var\(--sa-b\)\); \}/.exec(css)!;
    const padGeom = /#steerpad \{[^}]*bottom: calc\((\d+)px \+ var\(--sa-b\)\);[^}]*height: (\d+)px;/.exec(pad)!;
    expect(+withPad[1]).toBe(+padGeom[1]); expect(+withPad[2]).toBe(+padGeom[2]);       // the pad's own bottom and height: the disc starts above its top edge
    expect(+withPad[3]).toBeGreaterThanOrEqual(12);                                       // and never closer than this to it
    expect(css).not.toMatch(/right:/); expect(css).not.toMatch(/\btop:/);
    // a phone on its side: beside the pad's right end (the pad is 216 px wide there), low enough to stay under the speech bubbles' line (76 px from the bottom)
    const side = /@media \(max-height: 500px\) and \(orientation: landscape\) \{\s*body\.ridepad #speedo \{ --d: (\d+)px; left: calc\(14px \+ (\d+)px \+ (\d+)px \+ var\(--sa-l\)\); bottom: calc\((\d+)px \+ var\(--sa-b\)\); \}/.exec(css)!;
    expect(+side[2]).toBe(216); expect(+side[3]).toBeGreaterThanOrEqual(10); expect(+side[4] + +side[1]).toBeLessThanOrEqual(76);
    expect(pad).toMatch(/#steerpad \{[^}]*width: min\(216px,/);
  });
  it('the driven vehicle feeds it what it really covered, hides it when nobody drives, and the speed is no longer written in the place chip (shown once)', () => {
    expect(own).toContain('speedo.show(this, speedOver(this.st.odo - odo0, dt), dt)');
    expect(own).toContain('speedo.hide(this)');
    expect(own).not.toMatch(/km\/h\$\{tag/);
  });
});
