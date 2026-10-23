import type { Screen, PhoneApi } from '../types';
import { esc } from '../kit';
import { APPS, GROUPS, visibleApps, type AppDef } from '../registry';
import { contextualShortcut, debtsNow, metCount, missionNow, residenceLine, streakView, type Shortcut } from '../selectors';
import { phoneHooks } from '../../phoneHooks';
import { quietLog } from '../../quiet';
import { suggestion } from '../../../social/beats';
import { cityTimeAt } from '../../../core/clock';
import { HUB_NAMES } from '../../../world/content';
import { fcfaShort } from '../../../economy/format';

/**
 * The home screen: who and where the player is (a compact summary), at most ONE contextual shortcut (resume a ride, follow a parcel, repay what is due,
 * a streak privilege, going home), then five big destinations — Carte, Travailler, Ma vie, Maison, Argent — and « Toutes les apps ».
 */
const DAYS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
export const clock = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const short = (name: string) => name.split(' · ')[0];

function when(api: PhoneApi) {
  const t = cityTimeAt(api.ctx.now()), hub = api.ctx.hub();
  return `${hub ? esc(short(HUB_NAMES[hub])) + ' · ' : ''}${DAYS[(t.day - 1) % 7]} <b class="hm-clock">${clock(t.hour, t.minute)}</b>`;
}

/** The one line of what is going on: the job in hand, else the next lead of the story. */
function nowLine(api: PhoneApi): string {
  const m = missionNow(api.ctx.state);
  if (m) return `${m.icon} ${m.title}${m.sub ? ' · ' + m.sub : ''}`;
  const next = suggestion(api.ctx.rel, api.ctx.state);
  return next ? `➜ ${next.hint}` : '➜ La ville est à toi : promène-toi, travaille, rencontre du monde.';
}

function shortcutNow(api: PhoneApi): Shortcut | null {
  return contextualShortcut(api.ctx.state, { hub: api.ctx.hub(), hour: cityTimeAt(api.ctx.now()).hourFloat, homeHub: phoneHooks.homeHub?.() ?? null, inside: false });
}

function runShortcut(api: PhoneApi, id: Shortcut['id']) {
  if (id === 'resume-vtc') { const f = phoneHooks.openVtc; if (f) api.launch(f); else api.launch(() => {}); }
  else if (id === 'follow-job') api.launch(() => api.ctx.toast('Suis la ligne d’objectif en haut de l’écran'));
  else if (id === 'repay') { const f = phoneHooks.openCredits; if (f) api.launch(f); else api.go('portefeuille'); }
  else if (id === 'perk') api.go('profil', 'progression');
  else if (id === 'home') { const h = phoneHooks.homeHub?.(); if (h && phoneHooks.walkTo) api.launch(() => phoneHooks.walkTo!(h)); }
}

function destinations(api: PhoneApi): string {
  const s = api.ctx.state, hub = api.ctx.hub(), m = missionNow(s), st = streakView(s.data), debt = debtsNow(s), home = residenceLine(s);
  const places = api.ctx.places().length;
  const tiles: { go: string; icon: string; grad: string; title: string; sub: string; alert?: boolean }[] = [
    { go: 'carte', icon: '🗺️', grad: '#7dd3fc,#2563eb', title: 'Carte', sub: hub ? `${short(HUB_NAMES[hub])}${places ? ` · ${places} lieux` : ''}` : 'La ville' },
    { go: 'travailler', icon: '💼', grad: '#bef264,#4d7c0f', title: 'Travailler', sub: m ? (m.kind === 'vtc' ? 'Course en cours' : 'Livraison en cours') : 'VTC · Tiak Tiak · boulots', alert: !!m },
    { go: 'profil', icon: '🧑🏾', grad: '#c4b5fd,#6d28d9', title: 'Ma vie', sub: `${st.run ? `🔥 ${st.run} j` : 'Série 0 j'} · ${metCount(api.ctx.rel)} relation${metCount(api.ctx.rel) > 1 ? 's' : ''}` },
    { go: 'logement', icon: '🏠', grad: '#fda4af,#e11d48', title: 'Maison', sub: home.name },
    { go: 'portefeuille', icon: '💰', grad: '#fcd34d,#f59e0b', title: 'Argent', sub: debt ? `${fcfaShort(s.wallet)} · crédit en cours` : fcfaShort(s.wallet), alert: !!debt && debt.late > 0 },
    { go: 'apps', icon: '▦', grad: '#e5e7eb,#9ca3af', title: 'Toutes les apps', sub: `${visibleApps().length} apps` },
  ];
  return `<nav class="hm-dest" aria-label="Destinations">${tiles.map(t => `<button type="button" class="hm-tile" data-go="${t.go}"><i class="hm-ic" style="--g:linear-gradient(160deg,${t.grad})" aria-hidden="true">${t.icon}</i><span><b>${esc(t.title)}</b><small${t.go === 'portefeuille' ? ' class="hm-wallet"' : ''}>${esc(t.sub)}</small></span>${t.alert ? '<em class="hm-dot" aria-label="à voir"></em>' : ''}</button>`).join('')}</nav>`;
}

const HINT_KEY = 'dakarrek.phone.hint';
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === 'seen'; } catch { return true; } };
const seeHint = () => { try { localStorage.setItem(HINT_KEY, 'seen'); } catch { /* session only */ } };

export const homeScreen: Screen = {
  title: 'Accueil',
  look: 'home',
  mount(page, api) {
    const s = api.ctx.state, st = streakView(s.data), pic = phoneHooks.profilePortrait?.() ?? null, sc = shortcutNow(api), unread = quietLog.unread;
    const name = phoneHooks.profileName?.() || 'Invité';
    const hint = hintSeen() ? '' : `<div class="hm-hint" role="note"><p>Ton téléphone, c’est ta vie à Dakar : la carte, le travail, ta progression, ta maison et ton argent.</p><button type="button" data-act="hint" aria-label="Compris">✕</button></div>`;
    page.innerHTML = `${hint}<header class="hm-sum">
        <div class="hm-who">${pic ? `<img class="hm-pic" src="${pic}" alt="">` : '<i class="hm-pic" aria-hidden="true">🧑🏾</i>'}
          <span><b class="hm-name">${esc(name)}</b><small class="hm-when">${when(api)}</small></span>
          <button type="button" class="hm-bell" data-go="notifs" aria-label="Notifications${unread ? ` : ${unread} nouvelle${unread > 1 ? 's' : ''}` : ''}">🔔${unread ? `<em>${unread > 9 ? '9+' : unread}</em>` : ''}</button></div>
        <div class="hm-chips"><button type="button" class="hm-chip money" data-go="portefeuille"><small>Solde</small><b class="hm-money">${esc(fcfaShort(s.wallet))}</b></button>
          <button type="button" class="hm-chip streak${st.run ? ' on' : ''}${st.today ? ' today' : ''}" data-go="profil" data-arg="progression"><small>Série</small><b class="hm-streak">${esc(st.chip)}</b></button></div>
        <p class="hm-now">${esc(nowLine(api))}</p>
      </header>
      ${sc ? `<button type="button" class="hm-short" data-act="shortcut" data-id="${sc.id}"><i aria-hidden="true">${esc(sc.icon)}</i><span><b>${esc(sc.label)}</b>${sc.sub ? `<small>${esc(sc.sub)}</small>` : ''}</span><span class="pk-chev" aria-hidden="true">›</span></button>` : ''}
      ${destinations(api)}`;
    page.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="hint"]')) { seeHint(); page.querySelector('.hm-hint')?.remove(); return; }
      if (t.closest('[data-go]')) seeHint();                                   // the one-time hint: gone once the player went somewhere
      const b = t.closest<HTMLElement>('[data-act="shortcut"]');
      if (b) runShortcut(api, b.dataset.id as Shortcut['id']);
    });
  },
  tick(page, api) {
    const w = page.querySelector('.hm-when'); if (w) w.innerHTML = when(api);
    const m = page.querySelector('.hm-money'); if (m) m.textContent = fcfaShort(api.ctx.state.wallet);
    const st = page.querySelector('.hm-streak'); if (st) st.textContent = streakView(api.ctx.state.data).chip;
  },
};

/** One app tile: the emoji on its gradient, its name under it (two lines at most, never cut). */
export function appTile(a: AppDef): string {
  const n = a.id === 'notifs' ? quietLog.unread : 0;
  return `<button type="button" class="ph-app" data-app="${a.id}" aria-label="${esc(a.label)}${n ? ` · ${n}` : ''}"><i class="ph-ico" style="--g:linear-gradient(180deg,${a.grad})"><span>${a.emoji}</span></i>${n ? `<b class="ph-badge" aria-hidden="true">${n > 9 ? '9+' : n}</b>` : ''}<span>${esc(a.short ?? a.label)}</span></button>`;
}

/** « Toutes les apps »: every app, grouped (Ma vie, Travail, Argent et biens, En ville, Outils). */
export const appsScreen: Screen = {
  title: 'Toutes les apps',
  mount(page) {
    const shown = new Set(visibleApps().map(a => a.id));
    page.innerHTML = GROUPS.map(([g, title]) => {
      const list = APPS.filter(a => a.group === g && shown.has(a.id)).sort((x, y) => x.order - y.order);
      return list.length ? `<section class="pk-sec"><h3>${esc(title)}</h3><div class="ph-grid">${list.map(appTile).join('')}</div></section>` : '';
    }).join('');
  },
};
