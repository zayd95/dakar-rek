import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { priceTone, shortLine } from '../src/ui/primitives';

const css = (f: string) => new TextDecoder().decode(readFileSync(new URL(`../src/ui/${f}`, import.meta.url)));

describe('shared UI primitives', () => {
  it('tones a price by its sign: gains green, costs ink, marks neutral', () => {
    expect(priceTone('+1 500 F')).toBe('gain');
    expect(priceTone('−400 F')).toBe('cost');
    expect(priceTone('-300 F')).toBe('cost');
    expect(priceTone('✓')).toBe('');
    expect(priceTone('Payer')).toBe('');
  });
  it('keeps a greeting to its first sentence or two, cut at a sentence end', () => {
    expect(shortLine('Salaam aleekum ! Mamadou t’accueille. Mburu ak meew (pain et lait) ou un petit service ?')).toBe('Salaam aleekum ! Mamadou t’accueille.');
    expect(shortLine('Que veux-tu faire ?')).toBe('Que veux-tu faire ?');
    expect(shortLine('Pas de ponctuation du tout dans cette très longue ligne qui dépasse la limite fixée')).toMatch(/…$/);
  });
  it('the tokens define every state for both scenes, and no row state is a fixed colour (the white-on-white hover)', () => {
    const t = css('tokens.css');
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-ring', '--ui-btn-bg', '--ui-card-shadow']) expect(`${name} ${t.includes(name + ':')}`).toBe(`${name} true`);
    const night = t.slice(t.indexOf('body.theme-night'));
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-card-shadow']) expect(`night ${name} ${night.includes(name + ':')}`).toBe(`night ${name} true`);
    expect(css('style.css')).not.toMatch(/#modal \.item:hover\s*\{\s*background:\s*#fafafa/);
    expect(css('primitives.css')).not.toMatch(/(hover|active|selected)[^{]*\{[^}]*#[0-9a-f]{3,6}\b/i);
  });
});
