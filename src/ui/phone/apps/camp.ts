import type { PhoneApi, Screen } from '../types';
import { badge, btn, card, empty, esc, more, row, rows, section, seg } from '../kit';
import { online } from '../../../online/api';
import type { Tag } from '../../../online/protocol';
import { campHooks, campSession } from '../../../online/campSession';
import { campRefusalText, type CampClient } from '../../../online/campClient';
import { CAMP_SIZES, CAMP_TEAM_NAME_MAX, campTeamName, type CampLobbyView, type CampSize } from '../../../multiplayer/campProtocol';
import { messagesDeps, openSheet } from './messages';
import {
  CAMP_PLACE, DIST_LABEL, F, FEE_CHIPS, campFormDefault, campSummary, feeLabel, formFee, formTerms, listingView, lobbyActions, moneyLine, quoteLine,
  resultView, rulesLines, seatOf, sizeLabel, termsLine, type CampAct, type CampForm,
} from './campText';
import './camp.css';

/**
 * 1.0.1 « Grand Camp » (docs/release/GRAND-CAMP-RULES-1.0.1.md): player-organized football matches at the Corniche's pitch, one app of the phone (no
 * button on the HUD). Three views of one screen, by its argument:
 *   – the list (no argument): my Grand Camp first, « Organiser un Grand Camp », the Corniche's matches that take players (`CampClient.list`: the
 *     public ones and the private ones I am invited to);
 *   – the organizer's form ('new'): the fee (Gratuit · 500 F · 1 000 F · 2 500 F · 5 000 F, or typed), 6 · 10 · 14 players, the distribution, public or
 *     private, and the live summary (« Cagnotte totale si tous les joueurs participent : 10 000 F », « Gain par gagnant : 2 000 F », « Sans commission »);
 *   – a match's lobby (its id): the two teams and their places, who is ready, the fee and the pool, my money as the server has said it, the buttons
 *     (campText.ts `lobbyActions`: « Rejoindre », « Changer d’équipe », « Prêt » / « Pas prêt », « Quitter »; the organizer's « Inviter »,
 *     « Retirer un joueur », « Annuler le match »), the rules; at the end the result, the payout or refund only once the server has written it.
 * Routes (other modules open it through phoneHooks.openPhone): 'grandcamp' — the list; 'grandcamp:<match id>' — that match's lobby, the list under it
 * (joining stays the player's tap). The screen's own id is 'camp' ('camp', 'camp:<match id>' work alike).
 * Every request answers in words (the server's reason, src/online/campClient.ts campRefusalText). Nothing about money shows as done before the server
 * said so: the money lines are `client.state.money`. The lobby is redrawn piece by piece, only the pieces that changed (a button replaced under a finger
 * would lose its tap).
 */
let form: CampForm = campFormDefault();

export const campScreen: Screen = {
  title: arg => (arg === 'new' ? 'Organiser un Grand Camp' : arg ? 'Grand Camp · le match' : 'Grand Camp'),
  mount(page, api, arg) {
    if (!campSession.enabled || !campSession.client) { page.innerHTML = empty('⚽', 'Grand Camp se joue en ligne : il n’est pas disponible dans cette version du jeu.'); return; }
    if (arg === 'new') return formView(page, api);
    if (arg) return lobbyView(page, api, arg);
    return listView(page);
  },
};

// ------------------------------------------------------------------ the list
function mineRow(c: CampClient): string {
  const l = c.state.lobby, me = l ? seatOf(l, c.state.me) : null;
  if (!campSession.mine) return '';
  const what = !l ? 'Connexion…' : l.state === 'play' ? 'Match en cours' : l.state === 'over' ? 'Terminé : voir le résultat'
    : `${l.players.length}/${l.terms.size} joueurs · ${me?.ready ? 'tu es prêt' : 'tu n’es pas encore prêt'}`;
  return section('Ton Grand Camp', rows([row({ icon: '⚽', label: l ? `Grand Camp de ${l.players.find(p => p.tag === l.org)?.name ?? 'l’organisateur'}` : 'Ton match', sub: [l ? termsLine(l.terms) : '', what].filter(Boolean).join(' · '), go: 'camp', arg: campSession.mine })]), ' data-gc="mine"');
}
function listView(page: HTMLElement) {
  const c = campSession.client!;
  if (campSession.mine) campSession.restore();
  page.innerHTML = `<div class="gc-mine-slot">${mineRow(c)}</div>
    <div class="gc-hero">${card(`<p class="gc-hero-tx"><b>Un match à ton nom au terrain de la Corniche</b><span>Tu fixes la mise, le nombre de joueurs et le partage. Pas de commission.</span></p>
      ${btn('Organiser un Grand Camp', { go: 'camp', arg: 'new', kind: 'primary', icon: '⚽', cls: 'gc-new', ...(campSession.mine ? { sub: 'Tu as déjà un Grand Camp' } : {}) })}`)}</div>
    ${section('Matchs de la Corniche', '<div class="gc-list"><p class="pk-note">Chargement…</p></div>' + btn('Actualiser', { act: 'refresh', kind: 'quiet', inline: true, icon: '🔄' }))}`;
  const newBtn = page.querySelector<HTMLButtonElement>('.gc-new'); if (newBtn) newBtn.disabled = !!campSession.mine;
  let asked = 0;
  const load = async () => {
    const n = ++asked, box = page.querySelector('.gc-list')!;
    const r = await campSession.list();
    if (n !== asked || !page.isConnected) return;
    if (!r.ok) { box.innerHTML = `<p class="pk-note warn">${esc(r.text)}</p>`; return; }
    const list = r.matches.filter(m => m.match !== campSession.mine);
    box.innerHTML = list.length ? rows(list.map(m => { const v = listingView(m); return row({ icon: m.invited ? '✉️' : '⚽', label: v.title, sub: `${v.sub} · ${v.places}`, go: 'camp', arg: m.match, end: v.badge ? badge(v.badge, m.invited ? 'sun' : 'info') : '' }); }))
      : empty('🥅', 'Aucun Grand Camp ouvert pour l’instant. Organise le premier !');
    box.setAttribute('data-count', String(list.length));
  };
  page.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-act="refresh"]')) void load(); });
  void load();
  let shown = mineRow(c);
  const off = campSession.onChange(() => { const h = mineRow(c); if (h === shown || !page.isConnected) return; shown = h; page.querySelector('.gc-mine-slot')!.innerHTML = h; if (newBtn) newBtn.disabled = !!campSession.mine; });
  const t = setInterval(() => { if (page.isConnected) void load(); }, 8000);
  return () => { off(); clearInterval(t); };
}

// ------------------------------------------------------------------ the organizer's form
function formView(page: HTMLElement, api: PhoneApi) {
  const fee = formFee(form);
  page.innerHTML = `${section('Mise par joueur (F CFA)', `<div class="gc-chips">${FEE_CHIPS.map(v => `<button type="button" class="gc-chip${!form.typed && form.fee === v ? ' on' : ''}" data-fee="${v}">${esc(feeLabel(v))}</button>`).join('')}</div>
      <label class="gc-field"><span>Autre montant</span><input class="gc-typed" type="text" inputmode="numeric" autocomplete="off" maxlength="9" placeholder="ex. 1 500" value="${esc(form.typed)}" aria-label="Autre montant en francs"></label>
      <p class="pk-note gc-fee-why${fee.ok ? '' : ' warn'}">${fee.ok ? '' : esc(fee.why)}</p>`)}
    ${section('Nombre de participants', seg('size', CAMP_SIZES.map(n => [String(n), `${n} · ${sizeLabel(n)}`]), String(form.size)))}
    ${section('Répartition des gains', seg('dist', [['team', DIST_LABEL.team], ['single', DIST_LABEL.single]], form.dist))}
    ${section('Qui peut jouer', seg('open', [['1', 'Public'], ['0', 'Privé · sur invitation']], form.open ? '1' : '0'))}
    <div class="gc-sum-slot"></div>
    ${btn('Organiser le match', { act: 'create', kind: 'primary', icon: '⚽', cls: 'gc-create', sub: CAMP_PLACE })}`;
  const sum = () => {
    const t = formTerms(form), slot = page.querySelector('.gc-sum-slot')!, b = page.querySelector<HTMLButtonElement>('.gc-create')!;
    slot.innerHTML = t.ok ? card(`<ul class="gc-sum">${campSummary(t.terms).map(s => `<li>${esc(s)}</li>`).join('')}</ul>`, 'gc-sum-card') : '';
    b.disabled = !t.ok || busy;
    const why = page.querySelector('.gc-fee-why')!, f = formFee(form);
    why.textContent = f.ok ? '' : f.why; why.classList.toggle('warn', !f.ok);
  };
  let busy = false;
  page.addEventListener('click', async e => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLElement>('[data-fee]');
    if (chip) { form = { ...form, fee: Number(chip.dataset.fee), typed: '' }; page.querySelectorAll('.gc-chip').forEach(c => c.classList.toggle('on', c === chip)); page.querySelector<HTMLInputElement>('.gc-typed')!.value = ''; sum(); return; }
    const sz = t.closest<HTMLElement>('[data-size]'), di = t.closest<HTMLElement>('[data-dist]'), op = t.closest<HTMLElement>('[data-open]');
    if (sz || di || op) {
      if (sz) form = { ...form, size: Number(sz.dataset.size) as CampSize };
      if (di) form = { ...form, dist: di.dataset.dist === 'single' ? 'single' : 'team' };
      if (op) form = { ...form, open: op.dataset.open === '1' };
      const b = (sz ?? di ?? op)!, group = b.parentElement!;
      group.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      sum(); return;
    }
    if (t.closest('[data-act="create"]') && !busy) {
      const terms = formTerms(form); if (!terms.ok) return;
      busy = true; sum();
      const b = page.querySelector<HTMLButtonElement>('.gc-create')!; b.querySelector('span')!.firstChild!.textContent = 'Ouverture du match…';
      const r = await campSession.create(terms.terms);
      busy = false;
      if (!page.isConnected) return;
      if (!r.ok) { api.notify(r.text, 'warn'); b.querySelector('span')!.firstChild!.textContent = 'Organiser le match'; sum(); return; }
      api.notify('Grand Camp ouvert : invite tes amis');
      form = campFormDefault();
      api.back(); api.go('camp', r.match);
    }
  });
  page.querySelector<HTMLInputElement>('.gc-typed')!.addEventListener('input', e => {
    form = { ...form, typed: (e.target as HTMLInputElement).value };
    page.querySelectorAll('.gc-chip').forEach(c => c.classList.toggle('on', !form.typed && Number((c as HTMLElement).dataset.fee) === form.fee));
    sum();
  });
  sum();
}

// ------------------------------------------------------------------ a match's lobby
const STATUS_WORDS: Record<string, string> = { connecting: 'Connexion…', reconnecting: 'Reconnexion…', closed: 'Hors ligne', idle: 'Connexion…' };
function teamsHtml(l: CampLobbyView, me: Tag | null): string {
  const perTeam = l.terms.size / 2, org = l.org;
  const col = (team: 0 | 1) => {
    const list = l.players.filter(p => p.team === team).sort((a, b) => a.sid - b.sid);
    const canRename = l.state === 'lobby' && !!me && (org === me || list.some(p => p.tag === me));
    const li = list.map(p => {
      const st = l.state !== 'lobby' ? (p.gone ? badge('parti', 'mute') : !p.on ? badge('hors ligne', 'warn') : '')
        : p.hold === 'pending' ? badge('mise en attente', 'sun') : p.ready ? badge('prêt ✓', 'gain') : !p.on ? badge('hors ligne', 'warn') : badge('pas prêt', '');
      return `<li class="gc-p${p.tag === me ? ' me' : ''}" data-tag="${esc(p.tag)}"><span class="gc-pn">${esc(p.name)}${p.tag === me ? ' <small>(toi)</small>' : ''}${p.tag === org ? ' <small>· organisateur</small>' : ''}</span>${st}</li>`;
    }).join('');
    const free = Math.max(0, perTeam - list.length);
    return `<div class="gc-team t${team}"><h4><i class="gc-dot" aria-hidden="true"></i><span class="gc-tn">${esc(l.teams[team])}</span>${canRename ? `<button type="button" class="gc-rename" data-act="rename" data-team="${team}" aria-label="Renommer l’équipe ${esc(l.teams[team])}">✏️</button>` : ''}<em>${list.length}/${perTeam}</em></h4>
      <ul>${li}${l.state === 'lobby' && free ? `<li class="gc-free">${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}</li>` : ''}</ul></div>`;
  };
  return `<div class="gc-teams">${col(0)}${col(1)}</div>`;
}
function headHtml(l: CampLobbyView): string {
  const org = l.players.find(p => p.tag === l.org)?.name ?? 'l’organisateur';
  const state = l.state === 'play' ? badge('Match en cours', 'gain') : l.state === 'over' ? badge('Terminé', 'mute') : badge(l.terms.open ? 'Public' : 'Privé', 'info');
  return card(`<div class="gc-head"><b>Grand Camp de ${esc(org)}</b>${state}</div><p class="gc-terms">${esc(termsLine(l.terms))} · ${esc(CAMP_PLACE)}</p>
    <ul class="gc-sum">${campSummary(l.terms).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    ${l.terms.fee ? `<p class="gc-pool">Cagnotte maintenant : <b>${esc(F(l.pool))}</b> <small>(${l.players.filter(p => p.hold === 'held').length} mise${l.players.filter(p => p.hold === 'held').length > 1 ? 's' : ''} prise${l.players.filter(p => p.hold === 'held').length > 1 ? 's' : ''})</small></p>` : ''}
    <p class="gc-count">${l.players.length}/${l.terms.size} joueurs</p>`, 'gc-head-card');
}
function actsHtml(list: CampAct[]): string {
  return `<div class="gc-acts">${list.map(a => `<button type="button" class="pk-btn ${a.kind} gc-a" data-act="${a.id}"${a.why ? ' disabled aria-disabled="true"' : ''}><span>${esc(a.label)}${a.why ? `<small>${esc(a.why)}</small>` : a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span></button>`).join('')}</div>`;
}

function lobbyView(page: HTMLElement, api: PhoneApi, match: string) {
  const c = campSession.client!;
  const live = campSession.view(match);
  if (!live) {
    page.innerHTML = `${empty('⚽', 'Tu es déjà inscrit à un autre Grand Camp : un seul match à la fois. Quitte-le avant d’en rejoindre un autre.', btn('Voir mon Grand Camp', { go: 'camp', arg: campSession.mine ?? '', kind: 'primary', inline: true }))}`;
    return;
  }
  page.innerHTML = `<p class="gc-status" role="status" hidden></p><div class="gc-s-head"></div><div class="gc-s-result"></div><div class="gc-s-teams"></div>
    <div class="gc-s-money"></div><p class="pk-note gc-quote" hidden></p><div class="gc-s-acts"></div><div class="gc-s-rules"></div>`;
  const slots: Record<string, string> = {};
  const put = (sel: string, html: string) => { if (slots[sel] === html) return; slots[sel] = html; const el = page.querySelector<HTMLElement>(sel); if (el) el.innerHTML = html; };
  let busy = false;
  const draw = () => {
    if (!page.isConnected) return;
    const s = c.state, l = s.lobby?.match === match ? s.lobby : null;
    const st = page.querySelector<HTMLElement>('.gc-status')!, word = s.status === 'open' ? '' : STATUS_WORDS[s.status] ?? '';
    st.hidden = !word || (!l && s.status === 'connecting'); st.textContent = word;
    if (!l) {
      put('.gc-s-head', s.status === 'open' && s.match === match ? empty('🔒', 'Ce match n’est pas visible pour toi : il est privé, ou il n’existe plus.') : `<p class="pk-note">Connexion au match…</p>`);
      return;
    }
    const seat = seatOf(l, s.me);
    put('.gc-s-head', headHtml(l));
    put('.gc-s-teams', section(l.state === 'lobby' ? 'Les équipes' : 'Les équipes du match', teamsHtml(l, s.me)));
    const mine = s.money.slice().reverse().slice(0, 4).map(m => { const x = moneyLine(m); return `<li class="gc-m ${x.tone}">${esc(x.text)}</li>`; }).join('');
    put('.gc-s-money', mine ? section('Ta mise', `<ul class="gc-money">${mine}</ul>`) : '');
    if (l.state === 'over' || s.result) {
      const rv = resultView(s.result, { me: s.me, team: seat?.team ?? null, teams: l.teams, names: t => l.players.find(p => p.tag === t)?.name ?? null });
      put('.gc-s-result', card(`<div class="gc-res ${rv.tone}"><i aria-hidden="true">${rv.icon}</i><b>${esc(rv.title)}</b>${rv.score ? `<span class="gc-res-sc">${esc(rv.score)}</span>` : ''}${rv.lines.map(x => `<p>${esc(x)}</p>`).join('')}</div>
        ${s.result ? btn('Fermer', { act: 'done', kind: 'primary' }) : ''}`, 'gc-res-card'));
    } else put('.gc-s-result', '');
    const acts = lobbyActions({ lobby: l, me: s.me, status: s.status, atPitch: campHooks.atPitch?.() ?? false, busy, elsewhere: !!campSession.mine && campSession.mine !== match });
    put('.gc-s-acts', actsHtml(acts));
    const q = page.querySelector<HTMLElement>('.gc-quote')!;
    const showQuote = !!seat && l.state === 'lobby' && !seat.ready && seat.hold === 'none' && l.terms.fee > 0;
    const quote = showQuote ? campSession.quote() : null, qt = quote ? quote.why ?? `Mise de ${F(l.terms.fee)} : ${quoteLine(quote)}` : '';
    q.hidden = !qt; if (q.textContent !== qt) q.textContent = qt; q.classList.toggle('warn', !!quote?.why);
    put('.gc-s-rules', more('Les règles du match', rulesLines(l.terms).map(x => `<p>${esc(x)}</p>`).join(''), 'gc-rules'));
  };
  const ask = async (fn: () => Promise<{ ok: boolean; text?: string }>, done?: string) => {
    if (busy) return;
    busy = true; draw();
    const r = await fn();
    busy = false;
    if (!page.isConnected) return;
    if (!r.ok) api.notify((r as { text: string }).text, 'warn'); else if (done) api.notify(done);
    draw();
  };
  page.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]'); if (!b || b.disabled) return;
    const l = c.state.lobby, act = b.dataset.act;
    if (!l) return;
    switch (act) {
      case 'join': void ask(() => campSession.join(), 'Tu as rejoint le match'); break;
      case 'team': void ask(() => c.team(seatOf(l, c.state.me)?.team === 0 ? 1 : 0)); break;
      case 'ready': {
        const q = campSession.quote();
        if (q.why) { api.notify(q.why, 'warn'); break; }
        void ask(() => campSession.ready()); break;
      }
      case 'unready': void ask(() => c.unready()); break;
      case 'go': api.launch(() => campHooks.goToPitch?.()); break;
      case 'play': api.launch(() => campHooks.playNow?.()); break;
      case 'leave': confirmSheet(page, 'Quitter le match ?', l.terms.fee && seatOf(l, c.state.me)?.hold !== 'none' ? `Ta mise de ${F(l.terms.fee)} t’est rendue.` : 'Ta place sera libérée.', 'Quitter', () => ask(() => campSession.leave(), 'Tu as quitté le match').then(() => { if (page.isConnected) api.back(); })); break;
      case 'abandon': confirmSheet(page, 'Quitter le match en cours ?', 'Ton équipe joue à un de moins. Tu suis son résultat : payé si elle gagne, pas remboursé si elle perd.', 'Quitter le match', () => ask(() => campSession.leave(), 'Tu as quitté le match')); break;
      case 'cancel': confirmSheet(page, 'Annuler le match ?', l.pool > 0 ? 'Chaque mise prise est rendue à son joueur.' : 'Personne n’a encore payé de mise.', 'Annuler le match', () => ask(() => c.cancel(), 'Match annulé')); break;
      case 'invite': inviteSheet(page, api, l); break;
      case 'remove': removeSheet(page, api, c, l); break;
      case 'rename': renameSheet(page, api, c, Number(b.dataset.team) === 1 ? 1 : 0, l.teams[Number(b.dataset.team) === 1 ? 1 : 0]); break;
      case 'done': campSession.done(); api.back(); break;
    }
  });
  draw();
  const off = c.onChange(draw);
  const t = setInterval(draw, 1000);                                       // « Prêt » follows the player walking to the pitch with the phone open
  return () => { off(); clearInterval(t); campSession.leaveView(match); };
}

// ------------------------------------------------------------------ sheets (the Messages app's, over the phone's glass)
function confirmSheet(from: HTMLElement, title: string, line: string, ok: string, run: () => void) {
  const sh = openSheet(from, title);
  sh.body.innerHTML = `<p class="gc-sh-line">${esc(line)}</p><div class="pk-acts">${btn('Retour', { act: 'no' })}${btn(ok, { act: 'yes', kind: 'danger' })}</div>`;
  sh.body.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
    sh.close(); if (b.dataset.act === 'yes') run();
  });
}
/** « Inviter »: friends from Messages and the players around, ticked; the server's invitation list, then a text message to each. */
function inviteSheet(from: HTMLElement, api: PhoneApi, l: CampLobbyView) {
  const sh = openSheet(from, 'Inviter au Grand Camp');
  const inLobby = new Set(l.players.map(p => p.tag)), seen = new Set<string>();
  const people: { tag: Tag; name: string; sub: string }[] = [];
  for (const n of messagesDeps.nearby?.() ?? []) if (!inLobby.has(n.tag) && !seen.has(n.tag)) { seen.add(n.tag); people.push({ tag: n.tag, name: n.name, sub: `À côté de toi · ${Math.round(n.dist)} m` }); }
  for (const cv of online?.convs() ?? []) if (!inLobby.has(cv.with) && !seen.has(cv.with) && !online?.isBlocked(cv.with)) { seen.add(cv.with); people.push({ tag: cv.with, name: cv.name, sub: 'Dans tes Messages' }); }
  const picked = new Set<Tag>();
  const draw = () => {
    sh.body.innerHTML = people.length ? `<p class="gc-sh-line">Ils voient ton match dans leur Grand Camp et reçoivent un message.</p>
      <div class="pk-rows gc-pick">${people.map(p => `<button type="button" class="pk-row tap gc-pp${picked.has(p.tag) ? ' on' : ''}" data-tag="${esc(p.tag)}" role="checkbox" aria-checked="${picked.has(p.tag)}"><span class="pk-tx"><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></span><em class="gc-tick" aria-hidden="true">${picked.has(p.tag) ? '✓' : ''}</em></button>`).join('')}</div>
      ${btn(picked.size ? `Inviter (${picked.size})` : 'Inviter', { act: 'send', kind: 'primary', cls: 'gc-send' })}`
      : empty('👥', 'Personne à inviter pour l’instant : écris d’abord à tes amis dans Messages, ou approche-toi d’eux.');
    const s = sh.body.querySelector<HTMLButtonElement>('.gc-send'); if (s) s.disabled = !picked.size;
  };
  let busy = false;
  sh.body.addEventListener('click', async e => {
    const t = e.target as HTMLElement, p = t.closest<HTMLElement>('[data-tag]');
    if (p) { const tag = p.dataset.tag!; if (picked.has(tag)) picked.delete(tag); else picked.add(tag); draw(); return; }
    if (t.closest('[data-act="send"]') && picked.size && !busy) {
      busy = true;
      const names = people.filter(x => picked.has(x.tag)).map(x => x.name);
      const r = await campSession.invite([...picked]);
      busy = false;
      if (!r.ok) { api.notify(r.text, 'warn'); return; }
      sh.close();
      api.notify(`Invitation envoyée à ${names.join(', ')}`);
    }
  });
  draw();
}
function removeSheet(from: HTMLElement, api: PhoneApi, c: CampClient, l: CampLobbyView) {
  const sh = openSheet(from, 'Retirer un joueur');
  const others = l.players.filter(p => p.tag !== c.state.me);
  sh.body.innerHTML = `<p class="gc-sh-line">Sa mise lui est rendue, et il ne peut plus revenir dans ce match.</p>
    <div class="pk-rows">${others.map(p => `<div class="pk-row"><span class="pk-tx"><b>${esc(p.name)}</b><small>${esc(l.teams[p.team ?? 0])}${p.ready ? ' · prêt' : ''}</small></span>${btn('Retirer', { act: 'kick', arg: p.tag, kind: 'danger', inline: true })}</div>`).join('')}</div>`;
  sh.body.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act="kick"]'); if (!b || b.disabled) return;
    b.disabled = true;
    const name = others.find(p => p.tag === b.dataset.arg)?.name ?? 'Le joueur';
    const r = await c.remove(b.dataset.arg!);
    if (!r.ok) { b.disabled = false; api.notify(r.text, 'warn'); return; }
    sh.close(); api.notify(`${name} est retiré du match`);
  });
}
function renameSheet(from: HTMLElement, api: PhoneApi, c: CampClient, team: 0 | 1, now: string) {
  const sh = openSheet(from, 'Renommer l’équipe');
  sh.body.innerHTML = `<label class="gc-field"><span>Nom de l’équipe (${CAMP_TEAM_NAME_MAX} lettres au plus)</span><input class="gc-tname" type="text" maxlength="${CAMP_TEAM_NAME_MAX}" value="${esc(now)}" autocomplete="off"></label>
    ${btn('Renommer', { act: 'ok', kind: 'primary' })}`;
  sh.body.addEventListener('click', async e => {
    if (!(e.target as HTMLElement).closest('[data-act="ok"]')) return;
    const name = campTeamName(sh.body.querySelector<HTMLInputElement>('.gc-tname')!.value);
    if (!name) { api.notify('Un nom de lettres et de chiffres.', 'warn'); return; }
    const r = await c.rename(team, name);
    if (!r.ok) { api.notify(r.text ?? campRefusalText(r.reason), 'warn'); return; }
    sh.close(); api.notify(`L’équipe s’appelle « ${name} »`);
  });
}
