import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { priceTone } from '../src/ui/primitives';
import { GLYPHS } from '../src/ui/glyphs';
import { SHOP_COPY } from '../src/ui/shopCopy';
import { CITY_ACTIONS } from '../src/world/cityContent';

const css = (f: string) => new TextDecoder().decode(readFileSync(new URL(`../src/ui/${f}`, import.meta.url)));

describe('shared UI primitives', () => {
  it('tones a price by its sign: gains green, costs ink, marks neutral', () => {
    expect(priceTone('+1 500 F')).toBe('gain');
    expect(priceTone('−400 F')).toBe('cost');
    expect(priceTone('-300 F')).toBe('cost');
    expect(priceTone('✓')).toBe('');
    expect(priceTone('Payer')).toBe('');
  });
  it('the boutique copy covers every action of the boutique, with a known line icon', () => {
    const ids = CITY_ACTIONS.boutique.map(a => a.id);
    for (const id of ids) expect(`${id} ${id in SHOP_COPY || id === 'tiak'}`).toBe(`${id} true`);
    for (const [id, c] of Object.entries(SHOP_COPY)) expect(`${id} ${!c.glyph || GLYPHS.includes(c.glyph)}`).toBe(`${id} true`);
  });
  it('the tokens define every state for both scenes, and no row state is a fixed colour (the white-on-white hover)', () => {
    const t = css('tokens.css');
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-ring', '--ui-outline', '--ui-btn-bg', '--ui-card-shadow']) expect(`${name} ${t.includes(name + ':')}`).toBe(`${name} true`);
    const night = t.slice(t.indexOf('body.theme-night'));
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-outline', '--ui-card-shadow']) expect(`night ${name} ${night.includes(name + ':')}`).toBe(`night ${name} true`);
    expect(css('style.css')).not.toMatch(/#modal \.item:hover\s*\{\s*background:\s*#fafafa/);
    expect(css('primitives.css')).not.toMatch(/(hover|active|selected)[^{]*\{[^}]*#[0-9a-f]{3,6}\b/i);
  });
});
