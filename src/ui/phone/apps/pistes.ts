import type { Screen } from '../types';
import { btn, card, empty, esc, note } from '../kit';
import { phoneHooks } from '../../phoneHooks';

/**
 * « Mes pistes » (src/economy/pistesModule.ts): a few leads from the player's real situation, each with « Y aller » (the place is marked, or the app opens)
 * and « Pas maintenant » (it stays away until the situation changes). Short cards; nothing here is required to play.
 */
export const pistesScreen: Screen = {
  title: 'Mes pistes',
  mount(page, api) {
    const list = phoneHooks.pistes?.() ?? [];
    page.innerHTML = (list.length
      ? list.map(p => card(`<div class="pi-c"><i class="pi-ic" aria-hidden="true">${esc(p.icon)}</i><div class="pi-tx"><b>${esc(p.title)}</b><p>${esc(p.line)}</p></div></div>
          <div class="pi-acts">${btn('Y aller', { act: 'go', arg: p.id, kind: 'primary', inline: true })}${btn('Pas maintenant', { act: 'drop', arg: p.id, kind: 'quiet', inline: true })}</div>`, 'pi')).join('')
      : empty('🧭', 'Pas de nouvelle piste pour l’instant. Travaille, sors, rencontre du monde : d’autres viendront.'))
      + note('Des idées, jamais des obligations : tu choisis ta vie à Dakar.');
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
      const id = b.dataset.arg ?? '';
      if (b.dataset.act === 'go') api.launch(() => { phoneHooks.followPiste?.(id); });
      else if (b.dataset.act === 'drop') { phoneHooks.dropPiste?.(id); api.rerender(); }
    });
  },
};
