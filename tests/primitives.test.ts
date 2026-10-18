import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { priceTone } from '../src/ui/primitives';
import { GLYPHS } from '../src/ui/glyphs';
import { SHOP_COPY } from '../src/ui/shopCopy';
import { CITY_ACTIONS } from '../src/world/cityContent';
import { objectiveMarks, isObjectiveAction } from '../src/social/objectiveMarks';
import type { Beat } from '../src/social/beats';
import type { Step } from '../src/economy/progress';

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
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-ring', '--ui-star', '--ui-btn-bg', '--ui-card-shadow']) expect(`${name} ${t.includes(name + ':')}`).toBe(`${name} true`);
    const night = t.slice(t.indexOf('body.theme-night'));
    for (const name of ['--ui-hover', '--ui-press', '--ui-selected', '--ui-star', '--ui-card-shadow']) expect(`night ${name} ${night.includes(name + ':')}`).toBe(`night ${name} true`);
    expect(css('style.css')).not.toMatch(/#modal \.item:hover\s*\{\s*background:\s*#fafafa/);
    expect(css('primitives.css')).not.toMatch(/(hover|active|selected)[^{]*\{[^}]*#[0-9a-f]{3,6}\b/i);
  });
  it('the star is derived from the objective, never from an action name', () => {
    const step = (id: string) => ({ id } as unknown as Step);
    const jobs = { id: 'tiak', special: 'jobs' }, shop = { id: 'pain-lait' }, mama = { id: 'boutique-salut' };
    const none = objectiveMarks(null);
    for (const a of [jobs, shop, mama]) expect(`${a.id} ${isObjectiveAction(a, none)}`).toBe(`${a.id} false`);
    const tiak = objectiveMarks(step('goal_tiak'));
    expect(isObjectiveAction(jobs, tiak)).toBe(true);
    expect(isObjectiveAction(shop, tiak)).toBe(false);
    expect(isObjectiveAction(mama, tiak)).toBe(false);
    expect(isObjectiveAction(jobs, objectiveMarks(step('goal_buy')))).toBe(false);
    expect(isObjectiveAction({ id: 'x', special: 'shop' }, objectiveMarks(step('goal_buy')))).toBe(true);
    expect(isObjectiveAction(jobs, objectiveMarks(step('goal_unknown')))).toBe(false);
    const beat = objectiveMarks({ id: 'b', npc: 'mamadou' } as unknown as Beat);
    expect(beat.npcs.has('mamadou')).toBe(true);
    expect(beat.npcs.has('ibou')).toBe(false);
    expect(isObjectiveAction(jobs, beat)).toBe(false);
  });
});
