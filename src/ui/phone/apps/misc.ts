import type { Screen } from '../types';
import { btn, empty, esc, note, row, rows, section } from '../kit';
import { phoneHooks } from '../../phoneHooks';
import { cityTimeAt, CITY_DAY_MS } from '../../../core/clock';
import { HUB_NAMES } from '../../../world/content';
import { restSpotHere } from '../../../game/rest';
import { clock } from './home';

/**
 * The smaller apps (Santé, Arène and Lutteurs, Ce soir, Actus, Météo, Horloge, Calculatrice, Aide), each one short screen made
 * of the shared pieces. They read the game; they never keep their own copy of it.
 */
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const hubShort = (h: string | null) => (h ? HUB_NAMES[h as keyof typeof HUB_NAMES].split(' · ')[0] : 'Dakar');

export const healthScreen: Screen = {
  title: 'Santé',
  mount(page, api) {
    const n = api.ctx.state.data.needs as unknown as Record<string, number>, rest = restSpotHere();
    const NEEDS: [string, string, string, string][] = [['faim', 'Faim', '#f97316', 'Mange à une gargote, une dibiterie ou au mall.'], ['energie', 'Énergie', '#facc15', rest ? `Repose-toi ici : ${rest}.` : 'Dors dans ta chambre ou repose-toi à l’ombre.'],
      ['moral', 'Moral', '#a855f7', 'Retrouve des amis, l’attaya, la plage.'], ['social', 'Social', '#22c55e', 'Parle aux habitants, rejoins les places.'], ['hygiene', 'Hygiène', '#0ea5e9', 'Passe chez toi pour te laver.']];
    const ring = (v: number, c: string) => `<i class="ph-ring" style="--v:${Math.round(clamp01(v / 100) * 100)};--c:${c}"><b>${Math.round(v)}</b></i>`;
    const low = NEEDS.filter(([k]) => (n[k] ?? 0) < 60);
    page.innerHTML = `<div class="ph-health"><small>Humeur</small><b>${esc(api.ctx.state.mood())}</b></div>
      <div class="ph-rings">${NEEDS.map(([k, l, c]) => `<div>${ring(n[k] ?? 0, c)}<span>${l}</span></div>`).join('')}</div>
      ${section('Conseils', low.length ? rows(low.map(([, l, , tip]) => row({ label: l, sub: tip }))) : empty('😄', 'Tout va bien. Profite de la ville !'))}`;
  },
};

export const arenaScreen: Screen = {
  title: 'Arène',
  mount(page, api) {
    const d = api.ctx.state.data, c = d.counters, combats = c.combats ?? 0, wins = c.victoires ?? 0;
    const list = [{ label: 'Écurie', value: d.flags.includes('ecurie_baobab') ? 'Écurie Baobab' : 'Aucune' }, { label: 'Combats', value: String(combats) }, { label: 'Victoires', value: String(wins) },
      { label: 'Défaites', value: String(Math.max(0, combats - wins)) }, { label: 'Entraînements', value: String(c.lutte ?? 0) }, ...(phoneHooks.arenaProfile?.() ?? [])];
    const table = phoneHooks.cityTable?.();
    const tableHtml = table ? section(`Classement · saison ${table.season}`, `<div class="ph-rows ph-table">${table.rows.map(r => r.id
      ? `<button type="button" data-lutteur="${esc(r.id)}"><b>${r.place}</b><span>${esc(r.name)}<small>${esc(r.sub)}</small></span><em>${r.pts} pts ›</em></button>`
      : `<div class="you"><b>${r.place}</b><span>${esc(r.name)}<small>${esc(r.sub)}</small></span><em>${r.pts} pts</em></div>`).join('')}</div>`) : '';
    page.innerHTML = `${rows(list.map(r => row({ label: r.label, value: r.value })))}
      ${phoneHooks.lutteurs ? btn('Lutteurs de la ville', { go: 'lutteurs', sub: 'Fiches, saison, suivre un lutteur', icon: '🤼' }) : ''}
      ${tableHtml}
      ${d.flags.includes('ecurie_baobab') ? '' : note('Pour rejoindre une écurie : Coach Ablaye, écurie Baobab, à Pikine.')}`;
    page.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lutteur]'); if (b) api.go('lutteurs', b.dataset.lutteur); });
  },
};

export const lutteursScreen: Screen = {
  title: 'Lutteurs',
  mount(page, api, arg) {
    const list = phoneHooks.lutteurs?.() ?? [];
    if (!list.length) { page.innerHTML = empty('🤼', 'Les lutteurs de la ville apparaîtront ici.'); return; }
    page.innerHTML = `<div class="ph-lts">${list.map(w => `<section class="ph-lt" id="lt-${esc(w.id)}">
        <div class="lt-head"><i class="lt-pic">${w.portrait}</i><span><b>${esc(w.name)}</b><small>${esc(w.ecurie)} · ${esc(w.style)} · ${esc(w.level)}</small></span>
          <button type="button" class="lt-follow${w.followed ? ' on' : ''}" data-follow="${esc(w.id)}" aria-pressed="${w.followed}">${w.followed ? '★ Suivi' : '☆ Suivre'}</button></div>
        <div class="lt-stats"><span><b>${w.place}${w.place === 1 ? 'er' : 'e'}</b><small>classement</small></span><span><b>${w.pts}</b><small>points</small></span><span><b>${w.v}-${w.d}${w.n ? `-${w.n}` : ''}</b><small>saison</small></span></div>
        ${w.belt ? `<p class="lt-belt">🏆 ${esc(w.belt)}</p>` : ''}
        ${w.last.length ? `<ul class="lt-last">${w.last.map(r => `<li><i class="r${r.res}">${r.res}</i>${esc(r.vs)}<small>${r.title ? 'titre · ' : r.main ? 'combat principal · ' : ''}jour ${r.day}</small></li>`).join('')}</ul>` : '<p class="lt-none">Pas encore combattu cette saison</p>'}
      </section>`).join('')}</div>
      ${note('Suivre un lutteur : « Ce soir » te dit quand il combat. Juste le plaisir de suivre.')}`;
    if (arg) requestAnimationFrame(() => page.querySelector(`#lt-${CSS.escape(arg)}`)?.scrollIntoView({ block: 'start' }));
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-follow]'); if (!b) return;
      const now = phoneHooks.follow?.(b.classList.contains('on') ? null : b.dataset.follow!) ?? null;
      page.querySelectorAll<HTMLButtonElement>('[data-follow]').forEach(x => {            // in place: the list keeps its scroll
        const on = x.dataset.follow === now; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); x.textContent = on ? '★ Suivi' : '☆ Suivre';
      });
      void api;
    });
  },
};

export const tonightScreen: Screen = {
  title: 'Ce soir',
  mount(page, api) {
    const list = phoneHooks.tonight?.() ?? [];
    if (!list.length) { page.innerHTML = empty('🌆', 'Rien de prévu ce soir.'); return; }
    page.innerHTML = `<div class="ph-tonight">${list.map(sec => section(sec.title, `<div class="ph-rows">${sec.rows.map(r => `<div>
        <span><i aria-hidden="true">${esc(r.icon)}</i><span>${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</span></span>${r.go
        ? `<button type="button" class="ph-go" data-tgo="${esc(r.go)}">Y aller</button>` : r.open ? `<button type="button" class="ph-go" data-go="${esc(r.open)}">Ouvrir</button>` : ''}</div>`).join('')}</div>`)).join('')}</div>`;
    page.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tgo]'); if (b) { const k = b.dataset.tgo!; api.launch(() => phoneHooks.tonightGo?.(k)); } });
  },
};

export const newsScreen: Screen = {
  title: 'Actus',
  mount(page, api) {
    const t = cityTimeAt(api.ctx.now()), c = api.ctx.state.data.counters, w = api.ctx.state.wallet;
    const pool = [
      ['Pikine', 'La grand-place affiche complet pour l’attaya du soir.'], ['Soumbédioune', 'Belle pêche ce matin : les mareyeuses cherchent des bras.'],
      ['Arène de Pikine', 'Combats amicaux cette semaine pour les lutteurs des écuries.'], ['Plateau', 'La Banque Teranga cherche des coursiers pour livrer des dossiers.'],
      ['Almadies', 'Le Dakar Life Mall reste ouvert tard ce week-end.'], ['Corniche', 'Les joggeurs envahissent les marches du Monument au lever du soleil.'],
      ['Tiak Tiak', 'Les livraisons à pied ont la cote à Pikine et au Plateau.'], ['Médina', 'L’Atelier Ndeye prépare les tenues d’un grand baptême.'],
      ['Car rapide', 'Les apprentis annoncent des départs toutes les dix minutes.'], ['Fann', 'Les étudiants révisent sur les bancs de la place.'],
    ];
    const pick = Array.from({ length: 5 }, (_, i) => pool[(t.day * 3 + i * 7) % pool.length]);
    const mine = [
      (c.victoires ?? 0) > 0 ? ['Arène', `Un nouveau lutteur fait parler de lui : ${c.victoires} victoire${(c.victoires ?? 0) > 1 ? 's' : ''}.`] : null,
      (c.livraisons ?? 0) >= 3 ? ['Tiak Tiak', `${c.livraisons} livraisons pour un jeune livreur du quartier.`] : null,
      w >= 1e6 ? ['Économie', `Un jeune entrepreneur dépasse ${w >= 1e9 ? 'le milliard' : 'le million'} de FCFA.`] : null,
    ].filter(Boolean) as string[][];
    page.innerHTML = `<p class="pk-note">Jour ${t.day} · ${DAYS[(t.day - 1) % 7]}</p>${[...mine, ...pick].map(([where, what], i) => `<article class="ph-news${i < mine.length ? ' me' : ''}"><small>${esc(where)}</small><p>${esc(what)}</p></article>`).join('')}`;
  },
};

export const weatherScreen: Screen = {
  title: 'Météo',
  mount(page, api) {
    const t = cityTimeAt(api.ctx.now()), h = t.hourFloat;
    const temp = (hour: number) => Math.round(28.5 + 3 * Math.sin(((hour - 9) / 24) * Math.PI * 2));
    const sky = (hour: number) => { const x = ((hour % 24) + 24) % 24; return x < 6 || x >= 19 ? '🌙' : x < 8 || x >= 17.5 ? '🌤️' : '☀️'; };
    const hours = Array.from({ length: 6 }, (_, i) => Math.floor(h) + i);
    const wind = 10 + (t.day * 7) % 12, humid = 62 + (t.day * 11) % 18;
    page.innerHTML = `<div class="ph-weather"><small>${esc(hubShort(api.ctx.hub()))}</small><b>${temp(h)}°</b>
        <span>${sky(h) === '🌙' ? 'Nuit dégagée' : sky(h) === '☀️' ? 'Ensoleillé' : 'Quelques nuages'} · max ${temp(15)}° min ${temp(3)}°</span></div>
      <div class="ph-hours">${hours.map((x, i) => `<div><small>${i ? clock(x % 24, 0).slice(0, 2) + ' h' : 'Maint.'}</small><i>${sky(x)}</i><b>${temp(x)}°</b></div>`).join('')}</div>
      ${rows([row({ label: 'Lever du soleil', value: '06:00' }), row({ label: 'Coucher du soleil', value: '19:00' }), row({ label: 'Vent (alizé)', value: `${wind} km/h` }), row({ label: 'Humidité', value: `${humid} %` })])}`;
  },
};

export const clockScreen: Screen = {
  title: 'Horloge',
  mount(page, api) { page.innerHTML = clockHtml(api.ctx.now()); },
  tick(page, api) { page.innerHTML = clockHtml(api.ctx.now()); },
};
function clockHtml(now: number): string {
  const t = cityTimeAt(now), real = new Date();
  const toNext = t.isNight ? ((30 - t.hourFloat) % 24) : 19 - t.hourFloat;
  const min = Math.round(toNext * (CITY_DAY_MS / 24) / 60000);
  return `${rows([row({ label: 'Dakar Rek', sub: `Heure de la ville · Jour ${t.day}`, value: clock(t.hour, t.minute) }), row({ label: 'Ton appareil', sub: 'Heure réelle', value: clock(real.getHours(), real.getMinutes()) })]).replace('pk-rows', 'pk-rows ph-clocks')}
    <div class="ph-daybar"><i style="left:${(t.hourFloat / 24) * 100}%"></i></div>
    ${note(`${t.isNight ? 'Lever du soleil' : 'Coucher du soleil'} dans ${min} min réelles · une journée en ville dure ${Math.round(CITY_DAY_MS / 60000)} min.`)}`;
}

/** Calculatrice: its state is kept while the phone stays open. */
const calc = { shown: '0', acc: null as number | null, op: '' as '' | '+' | '−' | '×' | '÷', fresh: true };
function calcShown() {
  const n = Number(calc.shown.replace(',', '.'));
  if (!Number.isFinite(n)) return 'Erreur';
  const [i, d] = calc.shown.split(',');
  return Number(i).toLocaleString('fr-FR').replace(/ | /g, ' ') + (d !== undefined ? ',' + d : '');
}
function calcKey(k: string) {
  const c = calc, val = () => Number(c.shown.replace(',', '.'));
  const apply = (a: number, b: number) => c.op === '+' ? a + b : c.op === '−' ? a - b : c.op === '×' ? a * b : c.op === '÷' ? a / b : b;
  const set = (n: number) => { c.shown = Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8).replace('.', ',') : 'NaN'; };
  if (/^\d$/.test(k)) { c.shown = c.fresh || c.shown === '0' ? k : (c.shown.replace(/\D/g, '').length < 12 ? c.shown + k : c.shown); c.fresh = false; }
  else if (k === ',') { if (c.fresh) { c.shown = '0,'; c.fresh = false; } else if (!c.shown.includes(',')) c.shown += ','; }
  else if (k === 'AC') Object.assign(calc, { shown: '0', acc: null, op: '', fresh: true });
  else if (k === '±') set(-val());
  else if (k === '%') set(val() / 100);
  else if (k === '=') { if (c.op && c.acc !== null) set(apply(c.acc, val())); c.acc = null; c.op = ''; c.fresh = true; }
  else { if (c.op && c.acc !== null && !c.fresh) set(apply(c.acc, val())); c.acc = val(); c.op = k as typeof c.op; c.fresh = true; }
}
export const calcScreen: Screen = {
  title: 'Calculatrice',
  look: 'dark',
  mount(page) {
    const keys = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='];
    page.innerHTML = `<div class="ph-calc"><output>${calcShown()}</output>
      <div>${keys.map(k => `<button type="button" data-k="${k}" class="${'÷×−+='.includes(k) ? 'op' : 'AC±%'.includes(k) ? 'fn' : ''}${k === '0' ? ' zero' : ''}">${k}</button>`).join('')}</div></div>`;
    const out = page.querySelector('output')!;
    page.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]'); if (b) { calcKey(b.dataset.k!); out.textContent = calcShown(); } });
  },
};

export const helpScreen: Screen = {
  title: 'Aide',
  mount(page) {
    page.innerHTML = section('Écran tactile', rows([row({ label: 'Marcher, conduire', value: 'Joystick à gauche' }), row({ label: 'Tourner la caméra', value: 'Glisser à droite' }), row({ label: 'Agir, parler, entrer', value: 'Bouton jaune' }), row({ label: 'Téléphone', value: 'Bouton 📱 en haut' })]))
      + section('Clavier et souris', rows([row({ label: 'Marcher', value: 'ZQSD, WASD, flèches' }), row({ label: 'Courir', value: 'Maj' }), row({ label: 'Tourner la caméra', value: 'Glisser · Q et R' }), row({ label: 'Agir, parler, entrer', value: 'E, Entrée, Espace' }), row({ label: 'Téléphone', value: 'Échap ou M' })]))
      + section('En ville', `<p class="pk-note">Approche-toi d’un lieu ou d’une personne : le bouton jaune dit ce que tu peux faire. Mange, dors, lave-toi et vois du monde : tes besoins baissent en jouant.</p><p class="pk-note">En ligne, le téléphone ne met pas la ville en pause.</p>`);
  },
};
