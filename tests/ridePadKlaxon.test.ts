import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = text('../src/transport/ridePad.css');
const ts = text('../src/transport/ridePad.ts');

describe('the Klaxon button on the phone', () => {
  it('is hidden by default (screen space) and comes back with ?klaxon, the code and the pad wiring all still there', () => {
    expect(css).toMatch(/#ridepad \.rp-horn \{ display: none;/);
    expect(css).toMatch(/body\.klaxon #ridepad \.rp-horn \{ display: block; \}/);
    expect(ts).toContain("classList.add('klaxon')");
    expect(ts).toMatch(/hornB = mk\(top, 'rp-horn', 'Klaxon'\)/);          // still built…
    expect(ts).toContain('onHorn(by: Owner');                              // …and still wired to the horn
  });
  it('does not touch the other driving controls', () => {
    expect(css).toMatch(/#ridepad \.rp-rev \{ display: none; height: 46px;/);
    expect(css).toMatch(/#ridepad\.canrev \.rp-rev \{ display: block; \}/);
    for (const line of css.split('\n').filter(l => /\.rp-(gas|brake|view)\b/.test(l))) expect(line).not.toContain('display: none');   // gas, brake and « Vue » are never hidden
  });
});
