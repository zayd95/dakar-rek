import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { CITY_ACTIONS } from '../src/world/cityContent';
import { placeSummary } from '../src/ui/placeSummary';
import type { Action } from '../src/world/types';

describe('directory action preview', () => {
  it('shows current job values and availability without changing the save', () => {
    const state = new GameState(); state.data.needs.energie = 0;
    const before = JSON.stringify(state.data);
    const text = placeSummary(CITY_ACTIONS.landing, state).replace(/\s/g, ' ');
    expect(text).toContain('Débarquer les caisses de poisson');
    expect(text).toContain('+3 200 F');
    expect(text).toContain('6 s');
    expect(text).toContain('énergie −26');
    expect(text).toContain('hygiène −12');
    expect(text).toContain('satiété −8');
    expect(text).toContain('indisponible : Repose-toi avant ce service');
    expect(JSON.stringify(state.data)).toBe(before);
  });

  it('shows current food cost, duration, effects and wallet availability', () => {
    const state = new GameState(); state.data.wallet = 499;
    expect(placeSummary(CITY_ACTIONS.juice, state).replace(/\s/g, ' '))
      .toContain('Jus de bouye frais · −500 F · 2 s · satiété +10 · énergie +5 · moral +7 · indisponible : Pas assez d’argent');
    state.data.wallet = 1000;
    expect(placeSummary(CITY_ACTIONS.juice, state)).not.toContain('indisponible : Pas assez d’argent');
  });

  it('describes current rest using its actual effect and duration', () => {
    expect(placeSummary(CITY_ACTIONS.square, new GameState()))
      .toContain('Se poser à l’ombre · gratuit · 4 s · énergie +10 · moral +6');
  });

  it('omits invisible actions before evaluating requirements or rewards', () => {
    const hidden: Action = { id: 'secret', label: 'Secret', gain: 9999, seconds: 7, visible: () => false, requires: () => { throw new Error('hidden requirement evaluated'); } };
    expect(placeSummary([hidden], new GameState())).toBe('Aucune activité visible actuellement');
  });

  it('uses the same explicit requirement priority as the action menu', () => {
    const action: Action = { id: 'locked', label: 'Service', cost: 400, seconds: 3, requires: () => 'Recommandation nécessaire' };
    const state = new GameState(); state.data.wallet = 0;
    expect(placeSummary([action], state)).toContain('indisponible : Recommandation nécessaire');
    expect(placeSummary([action], state)).not.toContain('Pas assez');
  });

  it('labels special flows as menus instead of inventing a duration', () => {
    expect(placeSummary(CITY_ACTIONS.style, new GameState()))
      .toContain('Voir les tenues de lutte · gratuit · menu dédié');
  });
});
