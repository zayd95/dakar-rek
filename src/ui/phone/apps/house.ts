import type { Screen } from '../types';
import { btn, card, empty, esc, row, rows, section } from '../kit';
import { holdings, residenceLine } from '../selectors';
import { phoneHooks } from '../../phoneHooks';
import { HUB_NAMES } from '../../../world/content';

/**
 * Maison: the « Domicile principal » (the home the player lives in, src/economy/assets.ts currentHome) with its furniture and the way home, then
 * everything else the player holds (other homes, land, billboards, ventures, vehicles). Arranging the furniture and buying or letting open the ownership
 * module's own apps (Meubles, Biens).
 */
export const houseScreen: Screen = {
  title: 'Maison',
  mount(page, api) {
    const s = api.ctx.state, home = residenceLine(s), list = holdings(s), here = api.ctx.hub();
    const away = home.hub && here && home.hub !== here && !!phoneHooks.walkTo;
    page.innerHTML = `${section('Domicile principal', card(`<div class="hs-home"><i aria-hidden="true">🏠</i><span><b>${esc(home.name)}</b><small>${esc([home.where, home.how].filter(Boolean).join(' · '))}</small></span></div>
        <p class="hs-facts"><span>🛋️ ${home.furniture} meuble${home.furniture > 1 ? 's' : ''}</span>${home.hub ? `<span>📍 ${esc(HUB_NAMES[home.hub].split(' · ')[0])}${home.hub === here ? ' · tu y es' : ''}</span>` : ''}</p>
        <div class="pk-acts">${phoneHooks.openHome ? btn('Aménager', { act: 'furniture', icon: '🛋️', kind: 'primary' }) : ''}${away ? btn('Rentrer à pied', { act: 'walkhome', icon: '🚶' }) : ''}</div>`))}
      ${section('Ce que tu possèdes', list.length ? rows(list.map(h => row({ icon: h.icon, label: h.name, sub: h.sub }))) : empty('🔑', 'Rien d’autre pour l’instant. Les annonces sont dans « Biens ».'))}
      ${phoneHooks.openAssets ? section('', rows([row({ icon: '🔎', label: 'Biens et annonces', sub: 'Acheter, louer, mettre en location', app: 'biens' })])) : ''}`;
    page.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (a === 'furniture' && phoneHooks.openHome) api.launch(phoneHooks.openHome);
      else if (a === 'walkhome' && home.hub && phoneHooks.walkTo) { const h = home.hub; api.launch(() => phoneHooks.walkTo!(h)); }
    });
  },
};
