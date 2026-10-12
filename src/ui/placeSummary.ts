import type { GameState } from '../core/state';
import type { Needs } from '../core/types';
import type { Action } from '../world/types';

const needLabels: Record<keyof Needs, string> = {
  faim: 'satiété', energie: 'énergie', moral: 'moral', social: 'social', hygiene: 'hygiène',
};

const money = (value: number) => value.toLocaleString('fr-FR') + ' F';

/**
 * Read-only preview of the actions already exposed by a place. This function
 * never starts an action or changes the save. Positive `faim` means satiation.
 */
export function placeSummary(actions: readonly Action[], state: GameState): string {
  const visible = actions.filter(action => !action.visible || action.visible(state));
  if (!visible.length) return 'Aucune activité visible actuellement';

  return visible.map(action => {
    const parts = [action.label];
    if (action.cost) parts.push('−' + money(action.cost));
    if (action.gain) parts.push('+' + money(action.gain));
    if (!action.cost && !action.gain) parts.push('gratuit');
    parts.push(action.special ? 'menu dédié' : `${action.seconds} s`);

    for (const key of Object.keys(needLabels) as (keyof Needs)[]) {
      const delta = action.needs?.[key];
      if (delta) parts.push(`${needLabels[key]} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
    }

    const unavailable = action.requires?.(state)
      ?? (action.cost && !state.canAfford(action.cost) ? 'Pas assez d’argent' : null);
    if (unavailable) parts.push('indisponible : ' + unavailable);
    return parts.join(' · ');
  }).join(' ; ');
}
