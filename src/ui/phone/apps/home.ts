import type { Screen, PhoneApi } from '../types';
import { esc } from '../kit';
import { APPS, GROUPS, homeLayout, visibleApps, type AppDef } from '../registry';
import { contextualShortcut, missionNow, perkKey, streakView, type Shortcut } from '../selectors';
import { phoneHooks } from '../../phoneHooks';
import { suggestion } from '../../../social/beats';
import { cityTimeAt } from '../../../core/clock';
import { HUB_NAMES } from '../../../world/content';
import { fcfaShort } from '../../../economy/format';

/**
 * The home screen, a smartphone's: a small widget (who and where the player is, the balance, the streak, the one line of what is going on), at most ONE
 * contextual shortcut (resume a ride, follow a parcel, repay what is due, a streak privilege, going home; else « Mes pistes » when there are leads),
 * then EVERY app as an icon — the most used first — and a dock, always in view, with the four favourites (Carte, Travailler, Argent, Messages) and, set
 * apart at its end, the app library (the same apps by theme). One tap opens anything; the grid scrolls under the widget when it does not fit.
 */
export const DAYS_SHORT = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const clock = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const short = (name: string) => name.split(' · ')[0];

/** Where and which day (the hour is in the status bar). */
function when(api: PhoneApi) {
  const t = cityTimeAt(api.ctx.now()), hub = api.ctx.hub();
  return `${hub ? short(HUB_NAMES[hub]) + ' · ' : ''}${DAYS[(t.day - 1) % 7]}`;
}

/** The one line of what is going on: the job in hand, else the next lead of the story. */
function nowLine(api: PhoneApi): string {
  const m = missionNow(api.ctx.state);
  if (m) return `${m.icon} ${m.title}${m.sub ? ' · ' + m.sub : ''}`;
  const next = suggestion(api.ctx.rel, api.ctx.state);
  return next ? `➜ ${next.hint}` : '➜ La ville est à toi : promène-toi, travaille, rencontre du monde.';
}

const PERK_KEY = 'dakarrek.phone.perkSeen';
/** The streak privilege the player has looked at (Profil › Progression): its shortcut then leaves the home screen. */
export function seePerk(api: PhoneApi) { try { localStorage.setItem(PERK_KEY, perkKey(api.ctx.state.data)); } catch { /* session only */ } }
function shortcutNow(api: PhoneApi): Shortcut | null {
  let perkSeen: string | undefined; try { perkSeen = localStorage.getItem(PERK_KEY) ?? undefined; } catch { /* none */ }
  return contextualShortcut(api.ctx.state, { hub: api.ctx.hub(), hour: cityTimeAt(api.ctx.now()).hourFloat, homeHub: phoneHooks.homeHub?.() ?? null, inside: false, perkSeen });
}

function runShortcut(api: PhoneApi, id: Shortcut['id']) {
  if (id === 'resume-vtc') { const f = phoneHooks.openVtc; if (f) api.launch(f); else api.launch(() => {}); }
  else if (id === 'follow-job') api.launch(() => api.ctx.toast('Suis la ligne d’objectif en haut de l’écran'));
  else if (id === 'repay') { const f = phoneHooks.openCredits; if (f) api.launch(f); else api.go('portefeuille'); }
  else if (id === 'perk') api.go('profil', 'progression');
  else if (id === 'home') { const h = phoneHooks.homeHub?.(); if (h && phoneHooks.walkTo) api.launch(() => phoneHooks.walkTo!(h)); }
}

/**
 * One app tile: the emoji on its gradient, its name under it (two lines at most, never cut). Its count (unread messages, new notifications) is put on
 * it by the shell, which keeps it up to date. On the home screen a tile also carries the screen it opens (`data-go`: the checks' and the links' name).
 */
export function appTile(a: AppDef, home = false): string {
  return `<button type="button" class="ph-app${home ? ' hm-tile' : ''}" data-app="${a.id}"${home && a.screen ? ` data-go="${a.screen}"` : ''} aria-label="${esc(a.label)}"><i class="ph-ico" style="--g:linear-gradient(180deg,${a.grad})"><span>${a.emoji}</span></i><span>${esc(a.short ?? a.label)}</span></button>`;
}
/** The library's tile: four small squares, as a folder of apps. */
const LIBRARY = '<button type="button" class="ph-app hm-tile hm-lib" data-go="apps" aria-label="Toutes les apps, par thème"><i class="ph-ico"><span aria-hidden="true"><b></b><b></b><b></b><b></b></span></i><span>Apps</span></button>';

export const homeScreen: Screen = {
  title: 'Accueil',
  look: 'home',
  mount(page, api) {
    const s = api.ctx.state, st = streakView(s.data), pic = phoneHooks.profilePortrait?.() ?? null, sc = shortcutNow(api);
    const name = phoneHooks.profileName?.() || 'Invité';
    const pi = sc ? [] : phoneHooks.pistes?.() ?? [];                          // « Mes pistes »: one row, only when no other shortcut takes the place
    const { dock, grid } = homeLayout();
    page.innerHTML = `<div class="hm-scroll" data-scroll>
        <header class="hm-sum">
          <button type="button" class="hm-who" data-go="profil" aria-label="Profil de ${esc(name)}">${pic ? `<img class="hm-pic" src="${pic}" alt="">` : '<i class="hm-pic" aria-hidden="true">🧑🏾</i>'}
            <span><b class="hm-name">${esc(name)}</b><small class="hm-when">${esc(when(api))}</small></span></button>
          <div class="hm-chips"><button type="button" class="hm-chip money" data-go="portefeuille"><small>Solde</small><b class="hm-money">${esc(fcfaShort(s.wallet))}</b></button>
            <button type="button" class="hm-chip streak${st.run ? ' on' : ''}${st.today ? ' today' : ''}" data-go="profil" data-arg="progression"><small>Série</small><b class="hm-streak">${esc(st.run ? st.chip : '0 j')}</b></button></div>
          ${sc?.id === 'follow-job' || sc?.id === 'resume-vtc' ? '' : `<p class="hm-now${sc || pi.length ? ' one' : ''}">${esc(nowLine(api))}</p>`}
        </header>
        ${sc ? `<button type="button" class="hm-short" data-act="shortcut" data-id="${sc.id}"><i aria-hidden="true">${esc(sc.icon)}</i><span><b>${esc(sc.label)}</b>${sc.sub ? `<small>${esc(sc.sub)}</small>` : ''}</span><span class="pk-chev" aria-hidden="true">›</span></button>`
          : pi.length ? `<button type="button" class="hm-short hm-pistes" data-go="pistes"><i aria-hidden="true">🧭</i><span><b>Mes pistes · ${pi.length}</b><small>${esc(pi[0].title)}${pi.length > 1 ? ` et ${pi.length - 1} autre${pi.length > 2 ? 's' : ''}` : ''}</small></span><span class="pk-chev" aria-hidden="true">›</span></button>` : ''}
        <nav class="hm-dest hm-grid" aria-label="Applications">${grid.map(a => appTile(a, true)).join('')}</nav>
      </div>
      <nav class="hm-dest ph-dock" aria-label="Favoris" style="--n:${dock.length + 1}">${dock.map(a => appTile(a, true)).join('')}${LIBRARY}</nav>`;
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act="shortcut"]');
      if (b) runShortcut(api, b.dataset.id as Shortcut['id']);
    });
  },
  tick(page, api) {
    const set = (sel: string, text: string) => { const el = page.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    const st = streakView(api.ctx.state.data);
    set('.hm-when', when(api)); set('.hm-money', fcfaShort(api.ctx.state.wallet)); set('.hm-streak', st.run ? st.chip : '0 j');
  },
};

/** The app library (« Toutes les apps »): the same apps as the home screen, by theme (Ma vie, Travail, Argent et biens, En ville, Outils). */
export const appsScreen: Screen = {
  title: 'Toutes les apps',
  mount(page) {
    const shown = new Set(visibleApps().map(a => a.id));
    page.innerHTML = GROUPS.map(([g, title]) => {
      const list = APPS.filter(a => a.group === g && shown.has(a.id)).sort((x, y) => x.order - y.order);
      return list.length ? `<section class="pk-sec"><h3>${esc(title)}</h3><div class="ph-grid">${list.map(a => appTile(a)).join('')}</div></section>` : '';
    }).join('');
  },
};
