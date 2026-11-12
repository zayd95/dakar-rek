import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { recordBout } from '../src/career/module';
import { boutPoints, purseOf } from '../src/career/career';
import { RECORD_KEYS, RECORD_KEYS_AF, recordIncrements } from '../src/lamb/rules';
import type { GameCtx, LambEvent } from '../src/game/modules';

/**
 * « Combat classé » avec frappe (Làmb 2.0, ?lamb2): it counts on the career's ladder exactly like a ranked bout sans
 * frappe — the same BoutEntry (mode 'classe'), the same points and purse from src/career/career.ts — and in its own
 * record (lamb_af_classe_*), as the friendlies do.
 */
function ctxOf() {
  const state = new GameState();
  const ctx = { state, day: () => 40, hour: () => 18, hud: { moment: () => {} }, save: () => {}, setPublicRecord: () => {}, toast: () => {} } as unknown as GameCtx;
  return { ctx, state };
}
type Bout = Extract<LambEvent, { kind: 'bout' }>;
const ranked = (o: Partial<Bout> = {}): Bout => ({
  kind: 'bout', mode: 'classe', outcome: 'projection', winner: 'player', opponent: { name: 'Gora', style: 'costaud', label: 'Costaud' }, level: 2, ...o,
});

describe('làmb 2.0 · « Combat classé » avec frappe on the career ladder', () => {
  for (const [label, o] of [
    ['a win by projection', {}],
    ['a defeat', { outcome: 'decision', winner: 'opponent' }],
    ['a draw', { outcome: 'egalite', winner: null }],
    ['an abandon', { outcome: 'abandon', winner: null }],
  ] as [string, Partial<Bout>][]) {
    it(`${label}: the same entry, points and purse as sans frappe`, () => {
      const a = ctxOf(), b = ctxOf();
      recordBout(a.ctx, ranked({ ...o, discipline: 'sans_frappe' }));
      recordBout(b.ctx, ranked({ ...o, discipline: 'avec_frappe' }));
      const ea = a.state.data.career!.bouts, eb = b.state.data.career!.bouts;
      expect(eb).toEqual(ea);
      expect(eb).toHaveLength(1);
      expect(eb[0].mode).toBe('classe');
      expect(b.state.data.wallet).toBe(a.state.data.wallet);
      expect(b.state.data.wallet - new GameState().data.wallet).toBe(eb[0].purse);   // the purse paid, the same
      const res = eb[0].res;
      expect(eb[0].pts).toBe(boutPoints('classe', res, 2, o.outcome === undefined));
      expect(eb[0].purse).toBe(purseOf('classe', res, 0, 2));
      expect(Object.keys(eb[0])).not.toContain('discipline');            // no new field on the ladder's entries
    });
  }
  it('its own record: lamb_af_classe_*, with the global combats and victoires; the sans-frappe record does not move', () => {
    const result = { mode: 'classe' as const, outcome: 'projection' as const, winner: 'player' as const };
    const af = recordIncrements(result as Parameters<typeof recordIncrements>[0], 'avec_frappe');
    expect(af).toEqual({ combats: 1, victoires: 1, [RECORD_KEYS_AF.classe.v]: 1 });
    expect(Object.keys(af)).not.toContain(RECORD_KEYS.classe.v);
    expect(recordIncrements({ ...result, outcome: 'abandon', winner: null } as Parameters<typeof recordIncrements>[0], 'avec_frappe')).toEqual({ [RECORD_KEYS_AF.classe.ab]: 1, lamb_abandons: 1 });
  });
});
