import { describe, expect, it } from 'vitest';
import { LAMB2_DEFAULT, lamb2On, resolveLamb2 } from '../src/lamb/flag';

/**
 * The switch between the old làmb (sans frappe) and Làmb 2.0 (avec frappe): one default constant, the address and the
 * stored choice over it (docs/LAMB2.md « La bascule »).
 */
describe('làmb 2.0 · the switch', () => {
  it('is not flipped yet: the game’s default is the old làmb, sans frappe', () => {
    expect(LAMB2_DEFAULT).toBe(false);
    expect(resolveLamb2('', null)).toBe(false);
    expect(lamb2On()).toBe(false);                                         // no page here: the default
  });
  it('with the default as it is today: ?lamb2 (or the stored « 1 ») turns Làmb 2.0 on', () => {
    expect(resolveLamb2('?lamb2', null, false)).toBe(true);
    expect(resolveLamb2('?debug&lamb2&touch', null, false)).toBe(true);
    expect(resolveLamb2('', '1', false)).toBe(true);
    expect(resolveLamb2('?debug', '0', false)).toBe(false);
  });
  it('once flipped: Làmb 2.0 everywhere, and ?lamb1 (or the stored « 0 ») forces the old làmb', () => {
    expect(resolveLamb2('', null, true)).toBe(true);
    expect(resolveLamb2('?debug', null, true)).toBe(true);
    expect(resolveLamb2('?lamb1', null, true)).toBe(false);
    expect(resolveLamb2('?debug&lamb1', '1', true)).toBe(false);
    expect(resolveLamb2('', '0', true)).toBe(false);
  });
  it('the address wins over the stored choice, and ?lamb1 over ?lamb2', () => {
    expect(resolveLamb2('?lamb2', '0', false)).toBe(true);
    expect(resolveLamb2('?lamb1', '1', false)).toBe(false);
    expect(resolveLamb2('?lamb1&lamb2', null, true)).toBe(false);
    expect(resolveLamb2('', 'yes', false)).toBe(false);                   // only « 1 » and « 0 » are choices
  });
});
