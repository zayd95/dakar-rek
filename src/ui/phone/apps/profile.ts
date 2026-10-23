import type { Screen, PhoneApi } from '../types';
import { bar, badge, btn, card, empty, esc, more, row, rows, section, seg, stats } from '../kit';
import { highlights, historyRows, lifeLine, residenceLine, statRows, streakView } from '../selectors';
import { phoneHooks } from '../../phoneHooks';
import { STREAK, runLabel } from '../../../economy/streak';
import { seePerk } from './home';

/**
 * Profil (« Ma vie »): above the fold the character's own portrait (drawn from the Avatar Studio's look), the name, one line of life, the home, the
 * streak, « Modifier mon personnage », and three highlights. Then three tabs — Progression, Statistiques, Historique — switched in place. Complex values
 * (what a gauge means, what the streak opens) are explained on a tap, never in standing paragraphs.
 */
type Tab = 'progression' | 'stats' | 'historique';
const TABS: [Tab, string][] = [['progression', 'Progression'], ['stats', 'Statistiques'], ['historique', 'Historique']];
/** The tab the player last looked at (this session). */
let lastTab: Tab = 'progression';

function head(api: PhoneApi): string {
  const s = api.ctx.state, pic = phoneHooks.profilePortrait?.() ?? null, home = residenceLine(s), st = streakView(s.data);
  const name = phoneHooks.profileName?.() || 'Toi';
  return `<div class="pf-head ph-profile">
      <div class="pf-pic-wrap">${pic ? `<img class="pf-pic ph-portrait" src="${pic}" alt="Ton personnage">` : '<i class="pf-pic pf-none" aria-hidden="true">🧑🏾</i>'}</div>
      <div class="pf-id"><b class="pf-name">${esc(name)}</b><small class="pf-life">${esc(lifeLine(s))}</small>
        <small class="pf-home">🏠 ${esc(home.name)}${home.where ? ' · ' + esc(home.where) : ''}</small>
        <button type="button" class="pf-streak${st.run ? ' on' : ''}" data-tab-go="progression" aria-label="Série : ${esc(st.label)}">${esc(st.chip)}${st.best > st.run ? `<small> · record ${st.best} j</small>` : ''}</button></div>
    </div>
    ${phoneHooks.editCharacter ? btn('Modifier mon personnage', { act: 'editchar', icon: '✏️', cls: 'pf-edit' }) : ''}
    ${stats(highlights(s, api.ctx.rel).map(h => ({ value: h.value.toLocaleString('fr-FR'), label: h.label, go: h.go, app: h.app && phoneHooks.openAssets ? h.app : undefined })))}`;
}

function progression(api: PhoneApi): string {
  const s = api.ctx.state, st = streakView(s.data), ms = STREAK.milestones;
  const dots = `<ol class="pf-miles">${ms.map(m => `<li class="${st.run >= m ? 'on' : ''}${st.next === m ? ' next' : ''}"><b>${m}</b><small>j</small></li>`).join('')}</ol>`;
  const streakCard = card(`<div class="pf-run"><b>${st.run ? `🔥 ${esc(st.label)}` : 'Série 0 j'}</b>${st.today ? badge('Aujourd’hui ✓', 'gain') : st.run ? badge('À faire aujourd’hui', 'sun') : ''}</div>
      ${dots}
      ${st.next ? `<p class="pf-next"><small>À ${esc(runLabel(st.next))}</small>${esc(st.nextText)}</p>${bar(st.run / st.next, 'sun')}` : '<p class="pf-next">Tous les paliers sont atteints : garde ta série.</p>'}
      <p class="pf-best">Record ${st.best} j · ${st.total} jour${st.total > 1 ? 's' : ''} actif${st.total > 1 ? 's' : ''}</p>
      ${more('Comment ça marche ?', `<p>Un jour compte quand tu as vraiment travaillé : une livraison, une course VTC, un service payé, un coup de main à un vendeur, un remboursement.</p>${st.open.length ? `<p><b>Ta série t’ouvre :</b> ${esc(st.open.join(' '))}</p>` : ''}<p>Un jour manqué peut être pardonné ; il revient à chaque semaine complète.</p>`)}`, 'pf-streakcard ph-streak');
  const dims = phoneHooks.profileDims?.() ?? [];
  const dimsHtml = dims.length ? section('Ce que tu deviens', `<div class="pk-rows pf-dims">${dims.map(d => `<div class="pf-dim"><details><summary><span class="pf-dl"><b>${esc(d.label)}</b>${d.delta ? `<em class="pf-delta ${d.delta.startsWith('+') ? 'up' : 'down'}">${esc(d.delta)}</em>` : ''}</span><span class="pf-lv">${esc(d.level)}</span>${bar(d.score / 100)}</summary><p>${esc(d.note)}</p></details></div>`).join('')}</div>`) : '';
  return section('Série de travail', streakCard) + dimsHtml;
}

function statistics(api: PhoneApi): string {
  const { shown, zero } = statRows(api.ctx.state);
  return section('', rows(shown.map(r => row({ icon: r.icon, label: r.label, value: r.value }))))
    + (zero.length ? more(`Pas encore fait (${zero.length})`, `<p>${esc(zero.join(' · '))}</p>`, 'pf-zero') : '');
}

function history(api: PhoneApi): string {
  const list = historyRows(api.ctx.state, api.ctx.rel);
  if (!list.length) return empty('📖', 'Ton histoire commence : ta première livraison, ta première course et tes rencontres s’écriront ici.');
  return section('', rows(list.map(h => row({ icon: h.icon, label: h.title, sub: h.sub }))));
}

const PANES: Record<Tab, (api: PhoneApi) => string> = { progression, stats: statistics, historique: history };

export const profileScreen: Screen = {
  title: 'Profil',
  mount(page, api, arg) {
    let tab: Tab = arg === 'progression' || arg === 'stats' || arg === 'historique' ? arg : lastTab;
    page.innerHTML = `<div class="pf">${head(api)}<div class="pf-tabs">${seg('tab', TABS, tab, 'tab')}</div><div class="pf-pane" role="tabpanel"></div></div>`;
    const pane = page.querySelector<HTMLElement>('.pf-pane')!;
    const show = (t: Tab, scroll = false) => {
      tab = t; lastTab = t;
      if (t === 'progression') seePerk(api);
      page.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      pane.innerHTML = PANES[t](api);
      if (scroll) pane.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    show(tab, arg === 'progression');
    page.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-tab]'); if (b) { show(b.dataset.tab as Tab); return; }
      const g = t.closest<HTMLElement>('[data-tab-go]'); if (g) { show(g.dataset.tabGo as Tab, true); return; }
      if (t.closest('[data-act="editchar"]')) api.launch(() => phoneHooks.editCharacter?.());
    });
  },
};
