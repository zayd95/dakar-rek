import type { Screen } from '../types';
import { badge, btn, card, esc, more, row, rows, section } from '../kit';
import { missionNow, streakView } from '../selectors';
import { phoneHooks } from '../../phoneHooks';
import { fcfa } from '../../hud';
import { ownsVehicle } from '../../../transport/owned';
import { tableCard, waitingText } from '../../../economy/bana';
import { ladderView } from '../../../economy/pouce';

/**
 * Travailler: the job in hand first (a VTC passenger, a Tiak Tiak parcel: what, where, the pay, « Suivre »), then the ways to earn — VTC rides with the
 * player's own car, Tiak Tiak deliveries and the paid services of the district, the ventures, the arena — each one row that opens its module's own app.
 * One line says whether today already counts for the streak; where a delivery can be taken is a detail shown on a tap.
 * 1.0.1: « Coups de pouce » (src/economy/pouce.ts): the next step and what it pays, and the whole ladder on a tap, each step paid once.
 */
export const workScreen: Screen = {
  title: 'Travailler',
  mount(page, api) {
    const s = api.ctx.state, d = s.data, m = missionNow(s), st = streakView(d);
    const car = (['teranga', 'rafet', 'compacte', 'berline', 'gainde', 'tout_terrain'] as const).some(a => ownsVehicle(s, a));
    const mission = m ? section('En cours', card(`<div class="wk-mission"><i aria-hidden="true">${esc(m.icon)}</i><span><b>${esc(m.title)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</span><em class="pk-val gain">+${esc(fcfa(m.pay))}</em></div>
        <div class="pk-acts">${btn('Suivre', { act: 'follow', kind: 'primary', icon: '➜' })}${btn('Détails', { act: m.kind === 'vtc' ? 'vtc' : 'jobs' })}</div>`, 'wk-live')) : '';
    const ways = [
      phoneHooks.openVtc ? row({ icon: '🚖', label: 'Courses VTC', sub: car ? `${d.vtc?.trips ?? 0} course${(d.vtc?.trips ?? 0) > 1 ? 's' : ''} · ${fcfa(d.vtc?.earned ?? 0)} gagnés` : 'Avec ta propre voiture', act: 'vtc' }) : '',
      phoneHooks.openJobs ? row({ icon: '📦', label: 'Tiak Tiak et petits boulots', sub: `${(d.counters.livraisons ?? 0)} livraison${(d.counters.livraisons ?? 0) > 1 ? 's' : ''} · ${(d.counters.shifts ?? 0)} service${(d.counters.shifts ?? 0) > 1 ? 's' : ''}`, act: 'jobs' }) : '',
      phoneHooks.openBusiness ? row({ icon: '🏢', label: 'Affaires', sub: (t => (t.owned ? `Ta table : ${waitingText(t.clients)}${t.open ? ' · ouverte' : ''}` : 'Acheter, voir ce que ça rapporte'))(tableCard(s)), act: 'business' }) : '',
      row({ icon: '🤼', label: 'Arène', sub: `${d.counters.combats ?? 0} combat${(d.counters.combats ?? 0) > 1 ? 's' : ''} · classement`, go: 'arene' }),
    ].filter(Boolean);
    const lv = ladderView(s, api.ctx.hub() ?? d.hub);
    const pouce = lv.next ? section('Coups de pouce', card(`<div class="wk-mission wk-pouce"><i aria-hidden="true">🎁</i><span><b>${esc(lv.next.label)}</b><small>${esc(lv.next.hint)}</small></span><em class="pk-val gain">+${esc(fcfa(lv.next.amount))}</em></div>`)
      + more(`Les ${lv.count} coups de pouce · ${lv.done} reçu${lv.done > 1 ? 's' : ''} (+${fcfa(lv.received)} sur ${fcfa(lv.total)})`,
        rows(lv.steps.map(st => row({ icon: st.paid ? '✅' : st.next ? '🎁' : '▫️', label: st.label, sub: st.paid ? 'reçu' : st.online ?? '', value: `${st.paid ? '' : '+'}${fcfa(st.amount)}`, tone: st.paid ? 'mute' : 'gain' })))
        + '<p class="pk-note">Chacun est payé une seule fois, dès que c’est fait.</p>', 'wk-pouce-all')) : '';
    page.innerHTML = `${mission}
      ${pouce}
      ${section('Gagner ta vie', rows(ways))}
      ${section('Série', card(`<div class="wk-streak"><b>${esc(st.chip)}</b>${st.today ? badge('Aujourd’hui compte ✓', 'gain') : badge('Un travail payé aujourd’hui la fait avancer', 'sun')}</div>`))}
      ${m ? '' : more('Où prendre une livraison ?', '<p>Dans l’app Tiak Tiak, ou sur place : approche-toi d’une boutique qui porte le pictogramme 📦.</p>')}`;
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'follow') api.launch(() => api.ctx.toast('Suis la ligne d’objectif en haut de l’écran'));
      else if (a === 'vtc' && phoneHooks.openVtc) api.launch(phoneHooks.openVtc);
      else if (a === 'jobs' && phoneHooks.openJobs) api.launch(phoneHooks.openJobs);
      else if (a === 'business' && phoneHooks.openBusiness) api.launch(phoneHooks.openBusiness);
    });
  },
};
