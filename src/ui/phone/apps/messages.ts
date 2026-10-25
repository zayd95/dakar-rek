import type { Screen, PhoneApi } from '../types';
import { btn, empty, esc, more, toggle } from '../kit';
import { online, onlineHooks, type ItemView, type OnlineApi, type Outcome } from '../../../online/api';
import type { Francs, InviteItem, Item, MeetItem, PlaceRef, Tag } from '../../../online/protocol';
import { ensureFakeOnline } from '../../../online/fake';
import { phoneHooks } from '../../phoneHooks';
import { tapSettled } from '../../tapGuard';
import { parseAmount } from '../../../economy/bank';
import { HUB_NAMES } from '../../../world/content';
import {
  F, NOTE_MAX, QUICK_AMOUNTS, cardOf, cashoutCheck, clockOf, codeOf, fundCheck, formatCode, groupByDay, initials, isCode, limitLines, listTime, lookColor, meetChoices,
  plusActions, plusClosed, previewOf, realIn, reasonText, retryable, seenText, statusText, type CardAct, type PlusId,
} from './messagesText';
import './messages.css';

/**
 * Messages (LD2.0-B « Belong Online », docs/ld2/LD2_B_CONTRACT.md « The UI »): the player's private conversations with other players, on their online
 * account (`online`, src/online/api.ts — never the socket). Three views of one phone screen, by its argument:
 *   – the list (no argument): the account's state in words, « Nouveau message », the conversations (avatar, name, last item, unread, time), the privacy line;
 *   – « Nouveau message » ('new'): the players around (presence, `messagesDeps.nearby`), « Ajouter par code », the recent ones, the player's own code;
 *   – a conversation (the other player's tag): bubbles and cards by day, the field and « Envoyer » above the keyboard, ONE « + » menu (money, request,
 *     invitation, meeting, position) whose sheets slide over the phone, and the header's menu (block, report, forget).
 * Every state is said in words (online, reconnecting, sending, failed, last seen); every money or invitation action goes through one confirmation whose op
 * id is made when it shows (a double tap sends it once) and the tap guard. Chat text is never read for meaning: only the sheets' confirmations act.
 * Pure rules and words: ./messagesText.ts. The money sheet is also Argent's (Recharger / Retirer, src/ui/phone/apps/money.ts).
 */
export interface Nearby { tag: Tag; name: string; look: number; app?: string; dist: number }
/** What the game provides to Messages (chat.ts fills `nearby` from presence; a feature without its provider is simply not shown). */
export const messagesDeps: { nearby?: () => Nearby[] } = {};

/** Players met through « Nouveau message » before any item exists between you (name and look for the header). */
const contacts = new Map<Tag, { name: string; look: number }>();
const drafts = new Map<Tag, string>();
/** The conversation on screen now (the notices do not toast it). */
let viewing: Tag | null = null;
const isTag = (s?: string): s is Tag => !!s && /^[0-9a-f]{16}$/.test(s);
const fake = (o: OnlineApi) => !!(o as { fake?: boolean }).fake;
const short = (hub: string) => (HUB_NAMES as Record<string, string>)[hub]?.split(' · ')[0] ?? '';

/** A player's name: their conversation's, else one met this session (a forgotten conversation, a code looked up, a player nearby), else « Joueur ». */
export function nameOf(tag: Tag): string {
  const c = online?.convs().find(x => x.with === tag);
  if (c) { contacts.set(tag, { name: c.name, look: c.look }); return c.name; }
  return contacts.get(tag)?.name ?? messagesDeps.nearby?.().find(n => n.tag === tag)?.name ?? 'Joueur';
}
function lookOf(tag: Tag): number { return online?.convs().find(c => c.with === tag)?.look ?? contacts.get(tag)?.look ?? 0; }
/**
 * Draws `html` into `el` only when it differs from what was drawn there last: the views redraw on every change and every second, and an element
 * replaced between a finger's down and up would lose its tap.
 */
const drawn = new WeakMap<Element, string>();
function setHtml(el: Element, html: string) { if (drawn.get(el) !== html) { drawn.set(el, html); el.innerHTML = html; } }
const avatar = (name: string, look: number, on = false, cls = '') =>
  `<i class="mg-av${cls ? ' ' + cls : ''}" style="--c:${lookColor(look)}" aria-hidden="true">${esc(initials(name))}${on ? '<b class="mg-dot"></b>' : ''}</i>`;

// ------------------------------------------------------------------ sheets (over the whole phone: the conversation's « + » actions, Argent's money)

export interface Sheet { root: HTMLElement; body: HTMLElement; close(): void; open(): boolean; settle(): void }
/** The sheets showing (one at a time): closed with their screen (its cleanup), or by the next one. */
const live = new Set<() => void>();
export function closeSheets() { for (const close of [...live]) close(); }
/** Opens a sheet over the phone's glass (above its header) with a title and « Fermer »; taps within the tap guard of its appearance are dropped. */
export function openSheet(from: HTMLElement, title: string, onClose?: () => void): Sheet {
  closeSheets();
  const glass = from.closest('.ph-glass') ?? document.body;
  const root = document.createElement('div');
  root.className = 'mg-sheet-wrap'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="mg-dim" data-sh="x"></div><section class="mg-sheet"><header class="mg-sh-head"><h3>${esc(title)}</h3><button type="button" class="mg-sh-x" data-sh="x">Fermer</button></header><div class="mg-sh-body"></div></section>`;
  glass.appendChild(root);
  let shownAt = performance.now(), closed = false;
  const close = () => { if (closed) return; closed = true; live.delete(close); root.remove(); removeEventListener('keydown', esc_, true); onClose?.(); };
  live.add(close);
  // the second half of the tap that opened it, or of the tap that changed its step, never lands on it (src/ui/tapGuard.ts)
  root.addEventListener('click', e => {
    if (!tapSettled(shownAt)) { e.stopPropagation(); e.preventDefault(); return; }
    if ((e.target as HTMLElement).closest('[data-sh="x"]')) { e.stopPropagation(); close(); }
  }, true);
  const esc_ = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  addEventListener('keydown', esc_, true);                                     // before the game's menu key
  return { root, body: root.querySelector('.mg-sh-body')!, close, open: () => !closed, settle: () => { shownAt = performance.now(); } };
}

/** The amounts quick-picked in a money sheet, and « Tout » when the source has a known ceiling. */
function chipsFor(kind: MoneyKind, o: OnlineApi, wallet: number): { list: Francs[]; all: Francs } {
  const l = o.limits, bal = o.balance?.amount ?? 0, t = o.today ?? { funded: 0, sent: 0, received: 0 };
  if (kind === 'fund') {
    const all = Math.max(0, Math.min(wallet, l?.opMax ?? Infinity, (l?.fundDayMax ?? Infinity) - t.funded, (l?.balanceMax ?? Infinity) - bal));
    return { list: [5_000, 10_000, 25_000, 50_000].filter(a => a <= all), all };
  }
  if (kind === 'cashout') { const all = Math.max(0, Math.min(bal, l?.opMax ?? Infinity)); return { list: [1_000, 5_000, 10_000, 25_000].filter(a => a <= all), all }; }
  return { list: QUICK_AMOUNTS, all: 0 };
}
export type MoneyKind = 'pay' | 'ask' | 'fund' | 'cashout';
const VERB: Record<MoneyKind, string> = { pay: 'Envoyer', ask: 'Demander', fund: 'Recharger', cashout: 'Retirer' };
const ICON: Record<MoneyKind, string> = { pay: '💸', ask: '🧾', fund: '⬇️', cashout: '⬆️' };
/**
 * The money sheet: an amount (quick picks or typed) and a short note, then ONE confirmation that says how it will be paid (payQuote: Teranga Money first,
 * the rest from the wallet), the balances after and today's limits; its op id is made when it shows, the tap guard and an in-flight lock keep it to one
 * request however the player taps, and the answer is said in words. `req`: paying a request (its amount and note fixed: straight to the confirmation).
 */
export function moneySheet(api: PhoneApi, from: HTMLElement, m: { kind: MoneyKind; to?: Tag; name?: string; req?: { id: string; amount: Francs; note?: string }; done?: (ok: boolean) => void }) {
  const o = online; if (!o) return;
  const title = m.kind === 'pay' ? (m.req ? 'Payer la demande' : 'Envoyer de l’argent') : m.kind === 'ask' ? 'Demander de l’argent' : m.kind === 'fund' ? 'Recharger Teranga Money' : 'Retirer vers le portefeuille';
  const sh = openSheet(from, title);
  const wallet = () => api.ctx.state.wallet, bal = () => o.balance?.amount ?? 0, who = m.name ?? 'ce joueur';
  let amount = m.req?.amount ?? 0, note = m.req?.note ?? '', busy = false;
  const toLine = () => m.kind === 'fund' ? '<p class="mg-to">👛 Portefeuille → 📱 Teranga Money</p>' : m.kind === 'cashout' ? '<p class="mg-to">📱 Teranga Money → 👛 Portefeuille</p>'
    : `<p class="mg-to">${avatar(who, m.to ? lookOf(m.to) : 0, false, 'sm')}<span>${m.kind === 'ask' ? 'Demander à' : 'À'} <b>${esc(who)}</b></span></p>`;
  const have = () => `<p class="mg-have">Teranga Money <b>${esc(F(bal()))}</b> · Portefeuille <b>${esc(F(wallet()))}</b></p>`;

  const pick = () => {
    const c = chipsFor(m.kind, o, wallet());
    sh.body.innerHTML = `${toLine()}<output class="mg-amt" aria-live="polite">${esc(F(amount))}</output>
      <div class="mg-chips">${c.list.map(a => `<button type="button" class="mg-chip${a === amount ? ' on' : ''}" data-amt="${a}">${esc(F(a))}</button>`).join('')}${c.all > 0 ? `<button type="button" class="mg-chip all" data-amt="${c.all}">Tout · ${esc(F(c.all))}</button>` : ''}</div>
      <label class="mg-lbl"><span>Autre montant</span><input class="mg-in" data-f="amount" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="14" placeholder="Montant en francs"></label>
      ${m.kind === 'pay' || m.kind === 'ask' ? `<label class="mg-lbl"><span>Note <small>(facultatif)</small></span><input class="mg-in" data-f="note" type="text" autocomplete="off" enterkeyhint="done" maxlength="${NOTE_MAX}" placeholder="${m.kind === 'ask' ? 'Pour le ndogou, le taxi…' : 'Pour le taxi, cadeau…'}" value="${esc(note)}"></label>` : ''}
      ${m.kind === 'ask' ? `<p class="mg-have">${esc(who)} pourra payer ou refuser. Rien ne part sans sa confirmation.</p>` : have()}
      <p class="mg-err" role="alert" hidden></p>
      ${btn('Continuer', { kind: 'primary', cls: 'mg-next', act: 'next' })}`;
    const out = sh.body.querySelector('.mg-amt')!, next = sh.body.querySelector<HTMLButtonElement>('.mg-next')!, err = sh.body.querySelector<HTMLElement>('.mg-err')!;
    const set = (a: number) => { amount = a; out.textContent = F(a); next.disabled = !(a > 0); err.hidden = true; sh.body.querySelectorAll<HTMLElement>('.mg-chip').forEach(b => b.classList.toggle('on', Number(b.dataset.amt) === a && !typed.value)); };
    const typed = sh.body.querySelector<HTMLInputElement>('[data-f="amount"]')!;
    typed.addEventListener('input', () => { const a = parseAmount(typed.value); set(a ?? 0); if (typed.value && a === null) { err.textContent = 'Écris un montant en francs, par exemple 5 000.'; err.hidden = false; } });
    sh.body.querySelector<HTMLInputElement>('[data-f="note"]')?.addEventListener('input', e => { note = (e.target as HTMLInputElement).value.slice(0, NOTE_MAX); });
    sh.body.querySelectorAll<HTMLElement>('.mg-chip').forEach(b => b.addEventListener('click', () => { typed.value = ''; set(Number(b.dataset.amt)); }));
    for (const f of sh.body.querySelectorAll('input')) f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } });
    next.addEventListener('click', () => { if (amount > 0) { (document.activeElement as HTMLElement | null)?.blur?.(); confirm(); } });
    set(amount);
  };

  const confirm = () => {
    const id = o.newId();                                                     // the confirmation's own key: made now, sent however many times it is tapped
    const q = m.kind === 'pay' ? o.payQuote(amount) : null;
    const refusal = q?.refusal ? q.text ?? 'Impossible pour l’instant.'
      : m.kind === 'fund' ? fundCheck(amount, wallet(), bal(), o.limits, o.today, o.status)
        : m.kind === 'cashout' ? cashoutCheck(amount, bal(), o.limits, o.status)
          : o.status !== 'online' ? 'Hors ligne : la demande partira une fois reconnecté.' : '';
    const ask = `${VERB[m.kind]} ${F(amount)}${m.kind === 'pay' ? ` à ${who}` : m.kind === 'ask' ? ` à ${who}` : m.kind === 'fund' ? ' sur Teranga Money' : ' vers ton portefeuille'} ?`;
    const after = (tm: number, w: number): [string, string][] => [['Teranga Money après', F(Math.max(0, tm))], ['Portefeuille après', F(Math.max(0, w))]];
    const lines: [string, string][] = m.kind === 'pay' && q ? [
      ['Depuis Teranga Money', F(q.fromOnline)], ...(q.fromWallet > 0 ? [['Depuis ton portefeuille', F(q.fromWallet)] as [string, string]] : []),
      ...after(bal() - q.fromOnline, wallet() - q.fromWallet),
    ] : m.kind === 'fund' ? after(bal() + amount, wallet() - amount) : m.kind === 'cashout' ? after(bal() - amount, wallet() + amount) : [];
    const limits = limitLines(o.limits, o.today);
    sh.body.innerHTML = `<div class="pk-confirm mg-conf"><i aria-hidden="true">${ICON[m.kind]}</i><p><b>${esc(ask)}</b>${note ? `<br><span class="mg-cnote">« ${esc(note)} »</span>` : ''}</p></div>
      ${lines.length ? `<div class="mg-lines">${lines.map(([k, v]) => `<p><span>${esc(k)}</span><b>${esc(v)}</b></p>`).join('')}</div>` : ''}
      ${refusal ? `<p class="mg-refuse" role="alert">${esc(refusal)}</p>` : ''}
      ${limits.length ? more('Limites du jour', limits.map(l => `<p>${esc(l)}</p>`).join('')) : ''}
      <div class="pk-acts">${btn(`${VERB[m.kind]} ${F(amount)}`, { kind: 'primary', act: 'ok', arg: id, cls: 'mg-ok' })}${btn(m.req ? 'Annuler' : 'Modifier', { act: 'edit' })}</div>`;
    const ok = sh.body.querySelector<HTMLButtonElement>('.mg-ok')!;
    ok.disabled = !!refusal; ok.dataset.id = id;
    sh.settle();
    sh.body.querySelector('[data-act="edit"]')!.addEventListener('click', () => { if (busy) return; if (m.req) sh.close(); else { pick(); sh.settle(); } });
    ok.addEventListener('click', async () => {
      if (busy || ok.disabled) return;                                       // in flight: the same request is not asked twice
      busy = true; ok.disabled = true; ok.querySelector('span')!.textContent = m.kind === 'ask' ? 'Envoi de la demande…' : 'Envoi…';
      sh.body.querySelector<HTMLButtonElement>('[data-act="edit"]')!.disabled = true;
      const r: Outcome = m.kind === 'pay' ? await o.pay({ id, to: m.to!, amount, ...(note ? { note } : {}), ...(m.req ? { req: m.req.id } : {}) })
        : m.kind === 'ask' ? await o.ask({ id, to: m.to!, amount, ...(note ? { note } : {}) })
          : m.kind === 'fund' ? await o.fund({ id, amount }) : await o.cashout({ id, amount });
      busy = false;
      outcome(r);
    });
  };

  const outcome = (r: Outcome) => {
    const what = m.kind === 'pay' ? `${F(amount)} envoyés à ${who}` : m.kind === 'ask' ? `Demande de ${F(amount)} envoyée à ${who}` : m.kind === 'fund' ? `${F(amount)} rechargés sur Teranga Money` : `${F(amount)} retirés dans ton portefeuille`;
    m.done?.(r.ok);
    if (!sh.open()) { api.notify(r.ok ? what : r.text, r.ok ? 'ok' : 'warn'); return; }
    sh.body.innerHTML = r.ok
      ? `<div class="pk-confirm mg-out ok" role="status"><i aria-hidden="true">✅</i><p><b>${esc(what)}</b>${m.kind !== 'ask' ? `<br>Teranga Money : ${esc(F(bal()))} · portefeuille ${esc(F(wallet()))}` : `<br>${esc(who)} la verra dans votre conversation.`}</p></div>${btn('OK', { kind: 'primary', act: 'close' })}`
      : `<div class="pk-confirm mg-out bad" role="alert"><i aria-hidden="true">⚠️</i><p><b>Rien n’est parti</b><br>${esc(r.text)}</p></div><div class="pk-acts">${btn('Réessayer', { kind: 'primary', act: 'again' })}${btn('Fermer', { act: 'close' })}</div>`;
    sh.settle();
    sh.body.querySelector('[data-act="close"]')!.addEventListener('click', () => sh.close());
    sh.body.querySelector('[data-act="again"]')?.addEventListener('click', () => confirm());   // a new confirmation: a new id (a refused one is never resent)
  };
  if (m.req) confirm(); else pick();
}

// ------------------------------------------------------------------ the list

const PRIVACY = 'Tes conversations sont gardées sur le serveur du jeu pour te suivre d’un appareil à l’autre. Aucun message ne peut payer quoi que ce soit : seul « Envoyer de l’argent » le fait, après ta confirmation. Bloquer un joueur le cache et refuse son argent et ses invitations.';
function statusHtml(o: OnlineApi): string {
  const s = statusText(o.status);
  return `<p class="mg-status ${s.tone}" role="status"><i aria-hidden="true"></i><span>${esc(s.text)}${fake(o) ? ' · simulé (debug)' : ''}</span></p>`;
}
function listView(page: HTMLElement, api: PhoneApi, o: OnlineApi): () => void {
  page.innerHTML = `<div class="mg-top"><div class="mg-st"></div>${btn('Nouveau message', { act: 'new', kind: 'primary', inline: true, icon: '✏️', cls: 'mg-new' })}</div>
    <div class="mg-list" role="list"></div><p class="mg-privacy"><span aria-hidden="true">🔒</span> ${esc(PRIVACY)}</p>`;
  const list = page.querySelector<HTMLElement>('.mg-list')!, st = page.querySelector<HTMLElement>('.mg-st')!;
  const draw = () => {
    const now = api.ctx.now(), me = o.me?.tag ?? null, cs = o.convs();
    setHtml(st, statusHtml(o));
    setHtml(list, cs.length ? cs.map(c => `<button type="button" class="mg-conv${c.blocked ? ' blocked' : ''}${c.unread ? ' unread' : ''}" role="listitem" data-tag="${esc(c.with)}" aria-label="${esc(`${c.name}${c.unread ? `, ${c.unread} non lu${c.unread > 1 ? 's' : ''}` : ''}`)}">
        ${avatar(c.name, c.look, c.seen === 'online' && !c.blocked)}
        <span class="mg-conv-tx"><span class="mg-conv-top"><b>${esc(c.name)}</b>${c.last ? `<time>${esc(listTime(c.last.at, now))}</time>` : ''}</span>
          <span class="mg-conv-bot"><small>${esc(c.blocked ? 'Bloqué · ses messages ne te parviennent plus' : previewOf(c.last, me))}</small>${c.unread ? `<em class="mg-unread">${c.unread > 99 ? '99+' : c.unread}</em>` : ''}</span></span>
      </button>`).join('')
      : empty('💬', 'Pas encore de conversation. Écris à un joueur croisé en ville, ou ajoute un ami avec son code.'));
  };
  page.addEventListener('click', e => {
    const t = e.target as HTMLElement, c = t.closest<HTMLElement>('[data-tag]');
    if (c) api.go('messages', c.dataset.tag);
    else if (t.closest('[data-act="new"]')) api.go('messages', 'new');
  });
  draw();
  return draw;
}

// ------------------------------------------------------------------ « Nouveau message »

function newView(page: HTMLElement, api: PhoneApi, o: OnlineApi): () => void {
  const open = (tag: Tag, name: string, look: number) => { contacts.set(tag, { name, look }); api.back(); api.go('messages', tag); };
  const near = messagesDeps.nearby?.() ?? null;
  const code = o.me?.code ?? '';
  page.innerHTML = `${near ? `<section class="pk-sec"><h3>À côté de toi</h3><div class="mg-near"></div></section>` : ''}
    <section class="pk-sec"><h3>Ajouter par code</h3>
      <form class="mg-code" novalidate><input class="mg-in" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" maxlength="19" placeholder="7F3A-91C2-0B4E-55D1" aria-label="Code ami, 16 caractères"><button type="submit" class="pk-btn primary inline">Chercher</button></form>
      <p class="mg-err" role="alert" hidden></p><div class="mg-found"></div></section>
    <section class="pk-sec mg-recent-sec"><h3>Récents</h3><div class="mg-recent"></div></section>
    ${code ? `<section class="pk-sec"><h3>Ton code</h3><div class="pk-card mg-mycode"><b class="mg-codetx">${esc(code)}</b>
      <p class="pk-note">Donne-le à un ami : il pourra t’écrire depuis n’importe quel quartier.</p>${btn('Copier', { act: 'copy', inline: true, icon: '📋' })}</div></section>` : ''}`;
  const person = (tag: Tag, name: string, look: number, sub: string, on: boolean) => `<button type="button" class="pk-row tap mg-person" data-tag="${esc(tag)}" data-name="${esc(name)}" data-look="${look}">${avatar(name, look, on)}<span class="pk-tx"><b>${esc(name)}</b><small>${esc(sub)}</small></span><span class="pk-chev" aria-hidden="true">›</span></button>`;
  const draw = () => {
    const now = api.ctx.now();
    const nearEl = page.querySelector('.mg-near');
    if (nearEl) {
      const n = (messagesDeps.nearby?.() ?? []).sort((a, b) => a.dist - b.dist).slice(0, 8);
      setHtml(nearEl, n.length ? `<div class="pk-rows">${n.map(p => person(p.tag, p.name, p.look, `${p.dist < 150 ? `à ${Math.round(p.dist)} m` : 'dans le quartier'}${o.isBlocked(p.tag) ? ' · bloqué' : ''}`, true)).join('')}</div>` : empty('🚶🏾', 'Personne d’autre autour de toi pour l’instant.'));
    }
    const rec = o.convs().slice(0, 6);
    page.querySelector('.mg-recent-sec')!.toggleAttribute('hidden', !rec.length);
    setHtml(page.querySelector('.mg-recent')!, rec.length ? `<div class="pk-rows">${rec.map(c => person(c.with, c.name, c.look, seenText(c.seen, now) || ' ', c.seen === 'online')).join('')}</div>` : '');
  };
  const form = page.querySelector<HTMLFormElement>('.mg-code')!, input = form.querySelector('input')!, err = page.querySelector<HTMLElement>('.mg-err')!, found = page.querySelector<HTMLElement>('.mg-found')!;
  input.addEventListener('input', () => { const v = formatCode(input.value); if (v !== input.value) input.value = v; err.hidden = true; });
  let looking = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = formatCode(input.value);
    if (!isCode(c)) { err.textContent = 'Un code a 16 caractères, comme 7F3A-91C2-0B4E-55D1.'; err.hidden = false; return; }
    if (looking) return;
    looking = true; found.innerHTML = '<p class="pk-note">Recherche…</p>'; input.blur();
    const r = await o.lookup(c); looking = false;
    if (!r.ok) { found.innerHTML = ''; err.textContent = r.text; err.hidden = false; return; }
    contacts.set(r.tag, { name: r.name, look: r.look });
    found.innerHTML = `<div class="pk-rows">${person(r.tag, r.name, r.look, `${c} · ${seenText(o.seen(r.tag), api.ctx.now()) || 'trouvé'}`, o.seen(r.tag) === 'online')}</div>`;
  });
  page.addEventListener('click', e => {
    const t = e.target as HTMLElement, p = t.closest<HTMLElement>('.mg-person');
    if (p) { open(p.dataset.tag!, p.dataset.name ?? 'Joueur', Number(p.dataset.look) || 0); return; }
    if (t.closest('[data-act="copy"]')) {
      const done = () => api.notify('Code copié');
      try { navigator.clipboard.writeText(code).then(done, () => selectCode()); } catch { selectCode(); }
    }
  });
  const selectCode = () => { const el = page.querySelector('.mg-codetx'); if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); api.notify('Code sélectionné : copie-le'); } };
  draw();
  return draw;
}

// ------------------------------------------------------------------ a conversation

const KIND: Record<Exclude<Item['k'], 'text'>, [string, string]> = { pay: ['💸', 'Teranga Money'], ask: ['🧾', 'Demande d’argent'], invite: ['🏠', 'Invitation'], meet: ['🤝', 'Rendez-vous'], loc: ['📍', 'Position'] };
const REASONS: [string, string][] = [['insulte', 'Insultes'], ['harcelement', 'Harcèlement'], ['arnaque', 'Arnaque'], ['autre', 'Autre chose']];

function convView(page: HTMLElement, api: PhoneApi, o: OnlineApi, tag: Tag): { draw: () => void; cleanup: () => void } {
  viewing = tag;
  page.classList.add('mg-page-conv');
  page.innerHTML = `<div class="mg-chat">
      <div class="mg-bar"><span class="mg-bar-av"></span><span class="mg-who"><b class="mg-seen"></b><small class="mg-code-sm">${esc(codeOf(tag))}</small></span>
        <button type="button" class="mg-menu-btn" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Options : bloquer, signaler, supprimer">⋯</button></div>
      <p class="mg-banner" role="status" hidden></p>
      <ol class="mg-log" aria-live="polite" aria-label="Conversation"></ol>
      <button type="button" class="mg-jump" data-act="jump" hidden>Nouveau message ↓</button>
      <div class="mg-pop mg-plus-pop" role="menu" aria-label="Plus" hidden></div>
      <div class="mg-pop mg-menu-pop" role="menu" aria-label="Options" hidden></div>
      <p class="mg-note" role="alert" hidden></p>
      <form class="mg-compose" novalidate>
        <button type="button" class="mg-plus" data-act="plus" aria-haspopup="menu" aria-expanded="false" aria-label="Plus : argent, invitation, rendez-vous, position">+</button>
        <input class="mg-field" type="text" enterkeyhint="send" autocomplete="off" autocorrect="on" maxlength="500" aria-label="Message">
        <button type="submit" class="mg-send">Envoyer</button>
      </form>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => page.querySelector<T>(s)!;
  const chat = $('.mg-chat'), log = $<HTMLOListElement>('.mg-log'), field = $<HTMLInputElement>('.mg-field'), form = $<HTMLFormElement>('.mg-compose'), note = $('.mg-note');
  const plusPop = $('.mg-plus-pop'), menuPop = $('.mg-menu-pop'), jump = $('.mg-jump'), banner = $('.mg-banner'), sendBtn = $<HTMLButtonElement>('.mg-send');
  field.value = drafts.get(tag) ?? '';
  const name = () => nameOf(tag);
  const els = new Map<string, { el: HTMLElement; sig: string }>();
  /** Failed items the player sent again (a new id): hidden here, the new one shows. */
  const resent = new Set<string>();
  /** Card actions in flight, and their op ids (one id per card and action: a double tap reuses it). */
  const busy = new Set<string>(), ids = new Map<string, string>();
  let actAt = -Infinity, more = true, loading = false;
  const idFor = (ref: string, act: string) => { const k = `${ref}:${act}`; let id = ids.get(k); if (!id) { id = o.newId(); ids.set(k, id); } return id; };

  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  const toBottom = () => { log.scrollTop = log.scrollHeight; jump.hidden = true; };
  const hooks = () => ({ goToPlace: !!onlineHooks.goToPlace, goToLocation: !!onlineHooks.goToLocation, goToInvite: !!onlineHooks.goToInvite });
  const seenNow = () => o.seen(tag);
  const blocked = () => o.isBlocked(tag);
  /** Why nothing can be written now, or ''. */
  const closedWhy = () => blocked() ? `Tu as bloqué ${name()} : débloque-le dans « ⋯ » pour lui écrire.` : seenNow() === 'never' ? `${name()} n’a pas encore ouvert Messages : rien ne peut lui parvenir pour l’instant.` : '';

  const itemHtml = (it: ItemView, last: boolean, now: number, newest: boolean, who: string): string => {
    const me = o.me?.tag ?? null, mine = !!me && it.from === me, side = mine ? 'me' : 'them';
    const st = it.status === 'sending' ? ' · envoi…' : it.status === 'failed' ? '' : mine && newest ? ' · envoyé' : '';
    const failed = it.status === 'failed'
      ? `<span class="mg-fail">Pas envoyé · ${esc(reasonText(it.reason))}</span>${retryable(it.reason) ? `<button type="button" class="mg-retry" data-act="retry" data-ref="${esc(it.id)}">Réessayer</button>` : ''}` : '';
    const meta = last || it.status ? `<small class="mg-meta">${esc(clockOf(it.at))}${st}${failed}</small>` : '';
    if (it.k === 'text') return `<li class="mg-b ${side}${last ? ' last' : ''}${it.status ? ' ' + it.status : ''}" data-key="${esc(it.id)}"><p>${esc(it.text)}</p>${meta}</li>`;
    const v = cardOf(it, me, who, now, hooks()), [icon, kind] = KIND[it.k];
    const sub = it.k === 'invite' ? `<p class="mg-csub">${esc(it.home.name)}<br>${it.perms.use ? 'Peut s’asseoir et utiliser la télé' : 'Visite seulement'}</p>`
      : it.k === 'meet' ? `<p class="mg-csub">${it.place.icon ? esc(it.place.icon) + ' ' : ''}${esc(short(it.place.hub))}${it.when && (it.state === 'open' || it.state === 'accepted') ? ` · ${esc(realIn(it.when, now))}` : ''}${it.counter ? ' · autre heure proposée' : ''}</p>`
        : it.k === 'loc' ? `<p class="mg-csub">${esc(short(it.hub))}</p>` : '';
    const noteTx = 'note' in it && it.note ? `<p class="mg-cnote">« ${esc(it.note)} »</p>` : '';
    const wait = busy.has(it.id);
    const acts = v.actions.length ? `<div class="mg-acts">${v.actions.map(a => `<button type="button" class="mg-act ${a.kind}" data-act="card" data-do="${a.act}" data-ref="${esc(it.id)}"${wait ? ' disabled' : ''}>${esc(wait ? '…' : a.label)}</button>`).join('')}</div>` : '';
    return `<li class="mg-c ${side} k-${it.k}${last ? ' last' : ''}" data-key="${esc(it.id)}"><div class="mg-card"><span class="mg-kind"><i aria-hidden="true">${icon}</i>${esc(kind)}</span>
      <b class="mg-title">${esc(v.title)}</b>${sub}${noteTx}${v.state ? `<span class="mg-state ${v.tone}">${esc(v.state)}</span>` : ''}${acts}</div>${meta}</li>`;
  };

  const drawLog = () => {
    const now = api.ctx.now(), items = o.items(tag).filter(i => !resent.has(i.id));
    // what stays put: the bottom when the player is there, else the first item shown (older items loaded above it must not move the view)
    const bottom = atBottom(), prevTop = log.scrollTop, anchor = log.querySelector<HTMLElement>('li[data-key]:not(.mg-day)'), aKey = anchor?.dataset.key, aTop = anchor?.offsetTop ?? 0;
    const lastCount = log.querySelectorAll('[data-key]:not(.mg-day)').length, lastKey = (log.lastElementChild as HTMLElement | null)?.dataset.key;
    const rows = groupByDay(items, now), keep = new Set<string>();
    const who = name(), meTag = o.me?.tag, newestMine = [...items].reverse().find(i => i.from === meTag && !i.status)?.id;   // « envoyé » under the player's last sent item only
    let prev: Element | null = null;
    const place = (el: HTMLElement) => { const want: Element | null = prev ? prev.nextElementSibling : log.firstElementChild; if (want !== el) log.insertBefore(el, want); prev = el; };
    if (!items.length) {
      const hello = `<li class="mg-hello" data-key="hello">${closedWhy() ? esc(closedWhy()) : `Écris à ${esc(name())}, ou touche « + » pour envoyer de l’argent, l’inviter chez toi, proposer un rendez-vous ou partager ta position.`}</li>`;
      setHtml(log, hello); els.clear(); return;
    }
    if (log.querySelector('.mg-hello')) { log.querySelector('.mg-hello')!.remove(); drawn.delete(log); }
    rows.forEach((r, i) => {
      let html: string, sig: string;
      if (r.k === 'day') { html = `<li class="mg-day" data-key="${r.key}"><span>${esc(r.label)}</span></li>`; sig = r.label; }
      else {
        const it = r.item, nx = rows[i + 1], next = nx && nx.k === 'item' ? nx.item : null;
        const last = !next || next.from !== it.from || next.at - it.at > 5 * 60_000 || it.k !== 'text' || next.k !== 'text';
        html = itemHtml(it, last, now, it.id === newestMine, who);
        sig = html;
      }
      let e = els.get(r.key);
      if (!e || e.sig !== sig) {
        const tpl = document.createElement('template'); tpl.innerHTML = html.trim();
        const el = tpl.content.firstElementChild as HTMLElement;
        if (e) e.el.replaceWith(el);
        e = { el, sig }; els.set(r.key, e);
      }
      keep.add(r.key); place(e.el);
    });
    for (const [k, e] of els) if (!keep.has(k)) { e.el.remove(); els.delete(k); }
    const appended = lastCount > 0 && (log.lastElementChild as HTMLElement | null)?.dataset.key !== lastKey, mineLast = items[items.length - 1]?.from === o.me?.tag;
    if (bottom || (appended && mineLast)) { toBottom(); return; }
    const a2 = aKey ? els.get(aKey)?.el : null, delta = a2?.isConnected ? a2.offsetTop - aTop : 0;
    if (delta) log.scrollTop = prevTop + delta;
    if (appended) jump.hidden = false;                                         // something new below while reading above: a pill, never a jump
  };

  const drawBar = () => {
    const s = seenNow(), now = api.ctx.now(), b = blocked();
    setHtml($('.mg-bar-av'), avatar(name(), lookOf(tag), s === 'online' && !b));
    const seen = $('.mg-seen'); seen.textContent = b ? 'bloqué' : seenText(s, now) || '…'; seen.className = `mg-seen${s === 'online' && !b ? ' on' : ''}`;
    const st = statusText(o.status);
    banner.hidden = o.status === 'online'; banner.textContent = st.text; banner.className = `mg-banner ${st.tone}`;
    const why = closedWhy();
    field.disabled = !!why; sendBtn.disabled = !!why;
    field.placeholder = why ? (blocked() ? 'Joueur bloqué' : 'Pas encore sur Messages') : `Message à ${name()}`;
    // the header's « ‹ Messages » counts what waits in the other conversations (as a messaging app does)
    const back = document.querySelector<HTMLElement>('#phone .ph-back');
    if (back && /^Messages( \(\d+\+?\))?$/.test(back.textContent ?? '')) {
      const n = o.convs().reduce((a, c) => a + (c.with !== tag && !c.blocked ? c.unread : 0), 0), t = n ? `Messages (${n > 99 ? '99+' : n})` : 'Messages';
      if (back.textContent !== t) back.textContent = t;
    }
  };

  const hint = (text: string) => { note.textContent = text; note.hidden = !text; };
  const draw = () => {
    drawBar(); drawLog();
    if (!plusPop.hidden) drawPlus();
    if (!menuPop.hidden) drawMenu();
    if (o.convs().find(c => c.with === tag)?.unread) o.read(tag);              // on screen: read
  };

  // the « + » menu and the header's menu: one popover open at a time
  const drawPlus = () => {
    const acts = plusActions({ status: o.status, seen: seenNow(), blocked: blocked(), name: name(), hooks: { invite: !!onlineHooks.homeToInvite, meet: !!onlineHooks.meetupPlaces, loc: !!onlineHooks.hereNow },
      home: !!onlineHooks.homeToInvite?.(), here: !!onlineHooks.hereNow?.() });
    const all = plusClosed({ status: o.status, seen: seenNow(), blocked: blocked(), name: name() });   // one reason for all: said once, above them
    setHtml(plusPop, (all ? `<p class="mg-pop-why">${esc(all)}</p>` : '') + acts.map(a => `<button type="button" role="menuitem" class="mg-pi${a.ok ? '' : ' off'}" data-act="plus-do" data-do="${a.id}"${a.ok ? '' : ` aria-disabled="true" title="${esc(a.why)}"`}><i aria-hidden="true">${a.icon}</i><span><b>${esc(a.label)}</b>${a.why && !all ? `<small>${esc(a.why)}</small>` : ''}</span></button>`).join(''));
  };
  const drawMenu = () => {
    const b = blocked();
    setHtml(menuPop, `<button type="button" role="menuitem" class="mg-pi" data-act="m-block"><i aria-hidden="true">${b ? '✅' : '🚫'}</i><span><b>${b ? 'Débloquer' : 'Bloquer'}</b><small>${b ? 'Ses messages te parviendront de nouveau' : 'Le cacher, refuser son argent et ses invitations'}</small></span></button>
      <button type="button" role="menuitem" class="mg-pi" data-act="m-report"><i aria-hidden="true">⚑</i><span><b>Signaler</b><small>Insultes, harcèlement, arnaque…</small></span></button>
      <button type="button" role="menuitem" class="mg-pi danger" data-act="m-forget"><i aria-hidden="true">🗑️</i><span><b>Supprimer la conversation</b><small>De ton téléphone et de ton compte</small></span></button>`);
  };
  const pop = (which: 'plus' | 'menu' | null) => {
    plusPop.hidden = which !== 'plus'; menuPop.hidden = which !== 'menu';
    $('.mg-plus').setAttribute('aria-expanded', String(which === 'plus')); $('.mg-menu-btn').setAttribute('aria-expanded', String(which === 'menu'));
    if (which === 'plus') drawPlus(); else if (which === 'menu') drawMenu();
  };

  // sending
  let keepFocus = false;
  sendBtn.addEventListener('pointerdown', () => { keepFocus = document.activeElement === field; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = field.value;
    if (!text.trim()) return;
    const r = o.say(tag, text);
    if (!r.ok) { hint(r.text); return; }
    field.value = ''; drafts.delete(tag); hint('');
    if (keepFocus) field.focus();
    keepFocus = false;
    drawLog(); toBottom();
  });
  field.addEventListener('input', () => { if (field.value) drafts.set(tag, field.value); else drafts.delete(tag); if (!note.hidden) hint(''); });
  field.addEventListener('focus', () => { pop(null); chat.classList.add('typing'); });
  field.addEventListener('blur', () => chat.classList.remove('typing'));

  // older items: near the top, the next page (the view keeps its place); a first page too short to scroll asks for the next at once
  const older = () => { if (more && !loading && o.items(tag).length) { loading = true; o.more(tag).then(m => { more = m; loading = false; if (m && log.scrollHeight <= log.clientHeight + 4) older(); }, () => { loading = false; }); } };
  log.addEventListener('scroll', () => {
    if (atBottom()) jump.hidden = true;
    if (log.scrollTop < 60) older();
  }, { passive: true });

  const run = async (ref: string, act: string, p: Promise<Outcome>, ok?: string) => {
    busy.add(ref); drawLog();
    const r = await p;
    busy.delete(ref);
    if (!r.ok) { ids.delete(`${ref}:${act}`); api.notify(r.text, 'warn'); } else if (ok) api.notify(ok);   // a refused id is never sent again
    drawLog();
  };
  const cardAct = (act: CardAct, ref: string) => {
    const it = o.items(tag).find(i => i.id === ref); if (!it || busy.has(ref)) return;
    const n = name();
    if (it.k === 'ask') {
      if (act === 'pay') moneySheet(api, page, { kind: 'pay', to: tag, name: n, req: { id: it.id, amount: it.amount, note: it.note } });
      else if (act === 'decline') void run(ref, act, o.closeAsk({ id: idFor(ref, act), ref, how: 'declined' }), 'Demande refusée');
      else if (act === 'cancel') void run(ref, act, o.closeAsk({ id: idFor(ref, act), ref, how: 'cancelled' }), 'Demande annulée');
    } else if (it.k === 'invite') {
      if (act === 'accept' || act === 'decline') void run(ref, act, o.answerInvite({ id: idFor(ref, act), ref, accept: act === 'accept' }), act === 'accept' ? 'Invitation acceptée' : 'Invitation refusée');
      else if (act === 'revoke') void run(ref, act, o.revokeInvite({ id: idFor(ref, act), ref }), 'Invitation retirée');
      else if (act === 'go' && onlineHooks.goToInvite) { const inv = it as InviteItem, go = onlineHooks.goToInvite; api.launch(() => go(tag, inv)); }
    } else if (it.k === 'meet') {
      if (act === 'accept' || act === 'decline') void run(ref, act, o.answerMeet({ id: idFor(ref, act), ref, accept: act === 'accept' }), act === 'accept' ? 'Rendez-vous accepté' : 'Rendez-vous refusé');
      else if (act === 'cancel') void run(ref, act, o.cancelMeet({ id: idFor(ref, act), ref }), 'Rendez-vous annulé');
      else if (act === 'counter') meetSheet(api, page, o, tag, it as MeetItem);
      else if (act === 'go' && onlineHooks.goToPlace) { const place = (it as MeetItem).place, go = onlineHooks.goToPlace; api.launch(() => go(place)); }
    } else if (it.k === 'loc' && act === 'go' && onlineHooks.goToLocation) { const go = onlineHooks.goToLocation; api.launch(() => go(it)); }
  };

  page.addEventListener('click', e => {
    const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-act]');
    if (!b) { if (!t.closest('.mg-pop')) pop(null); return; }
    const act = b.dataset.act;
    if (act !== 'plus' && act !== 'menu' && !b.closest('.mg-pop')) pop(null);
    if (act === 'plus') pop(plusPop.hidden ? 'plus' : null);
    else if (act === 'menu') pop(menuPop.hidden ? 'menu' : null);
    else if (act === 'jump') toBottom();
    else if (act === 'retry') {
      const it = o.items(tag).find(i => i.id === b.dataset.ref); if (!it) return;
      const r = it.k === 'text' ? o.say(tag, it.text) : it.k === 'loc' ? o.shareLocation(tag) : null;
      if (r && r.ok) { resent.add(it.id); drawLog(); toBottom(); } else if (r) hint(r.text);
    } else if (act === 'card') {
      if (!tapSettled(actAt)) return;                                         // a card that just changed state: the second half of the tap is not an answer
      actAt = performance.now();
      cardAct(b.dataset.do as CardAct, b.dataset.ref!);
    } else if (act === 'plus-do') {
      if (b.getAttribute('aria-disabled') === 'true') return;
      pop(null); field.blur();
      const id = b.dataset.do as PlusId, n = name();
      if (id === 'pay' || id === 'ask') moneySheet(api, page, { kind: id, to: tag, name: n });
      else if (id === 'invite') inviteSheet(api, page, o, tag);
      else if (id === 'meet') meetSheet(api, page, o, tag);
      else if (id === 'loc') locSheet(api, page, o, tag);
    } else if (act === 'm-block') {
      pop(null);
      if (blocked()) void o.block(tag, false).then(r => api.notify(r.ok ? `${name()} débloqué` : r.text, r.ok ? 'ok' : 'warn'));
      else blockSheet(api, page, o, tag);
    } else if (act === 'm-report') { pop(null); reportSheet(page, o, tag); }
    else if (act === 'm-forget') { pop(null); forgetSheet(api, page, o, tag); }
  });
  // Escape closes a popover before the game's menu key sees it
  const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape' && (!plusPop.hidden || !menuPop.hidden)) { e.stopPropagation(); e.preventDefault(); pop(null); } };
  addEventListener('keydown', onKey, true);

  // the phone's keyboard: the conversation rides above it (the field is never hidden); closing it releases the field (as src/multiplayer/chat.ts)
  const vv = window.visualViewport, phoneEl = page.closest<HTMLElement>('#phone');
  let kbOpen = false;
  const onViewport = () => {
    if (!vv) return;
    const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop), up = kb >= 60;
    const wasBottom = atBottom();
    phoneEl?.style.setProperty('--kb', `${up ? Math.round(kb) : 0}px`);
    chat.classList.toggle('kb', up);
    if (kbOpen && !up && document.activeElement === field) field.blur();
    kbOpen = up;
    if (up && wasBottom) requestAnimationFrame(toBottom);
  };
  vv?.addEventListener('resize', onViewport); vv?.addEventListener('scroll', onViewport); onViewport();

  draw(); toBottom();
  requestAnimationFrame(() => { toBottom(); if (log.scrollHeight <= log.clientHeight + 4) older(); });
  return {
    draw,
    cleanup: () => {
      if (viewing === tag) viewing = null;
      vv?.removeEventListener('resize', onViewport); vv?.removeEventListener('scroll', onViewport); phoneEl?.style.removeProperty('--kb');
      removeEventListener('keydown', onKey, true);
      closeSheets();
    },
  };
}

// ------------------------------------------------------------------ the other « + » sheets

/** A one-step sheet whose confirmation runs `send` with an op id made when it shows (a new one after a refusal). */
function confirmButton(sh: Sheet, o: OnlineApi, label: string, send: (id: string) => Promise<Outcome> | Outcome, done: (r: Outcome) => void) {
  let id = o.newId(), busy = false;
  const ok = sh.body.querySelector<HTMLButtonElement>('.mg-ok')!, err = sh.body.querySelector<HTMLElement>('.mg-err');
  ok.addEventListener('click', async () => {
    if (busy || ok.disabled) return;
    busy = true; ok.disabled = true; ok.querySelector('span')!.textContent = 'Envoi…';
    const r = await send(id);
    busy = false;
    if (!r.ok) { id = o.newId(); ok.disabled = false; ok.querySelector('span')!.textContent = label; if (err) { err.textContent = r.text; err.hidden = false; } }
    done(r);
  });
}
function inviteSheet(api: PhoneApi, from: HTMLElement, o: OnlineApi, tag: Tag) {
  const home = onlineHooks.homeToInvite?.() ?? null, n = nameOf(tag), sh = openSheet(from, 'Inviter chez moi');
  if (!home) { sh.body.innerHTML = empty('🏠', 'Tu n’as pas encore de logement où recevoir.'); return; }
  let use = true;
  const label = `Inviter ${n}`;
  sh.body.innerHTML = `<div class="mg-home"><i aria-hidden="true">🏠</i><span><b>${esc(home.name)}</b><small>${esc(short(home.hub))} · ${esc(n)} sera guidé jusqu’à ta porte</small></span></div>
    <div class="pk-rows mg-perm">${toggle('use', 'Peut s’asseoir et utiliser la télé', use, 'Sinon, visite seulement')}</div>
    <p class="pk-note">Rien ne peut être déplacé, acheté ni emporté. Tu peux retirer l’invitation à tout moment.</p>
    <p class="mg-err" role="alert" hidden></p>
    ${btn(label, { kind: 'primary', cls: 'mg-ok', icon: '🏠' })}`;
  sh.body.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act="use"]'); if (!t) return;
    use = !use; t.classList.toggle('on', use); t.setAttribute('aria-checked', String(use)); t.querySelector('.pk-sw')!.textContent = use ? 'Activé' : 'Coupé';
  });
  confirmButton(sh, o, label, id => o.invite({ id, to: tag, perms: { use } }), r => { if (r.ok) { sh.close(); api.notify(`Invitation envoyée à ${n}`); } });
}
function meetSheet(api: PhoneApi, from: HTMLElement, o: OnlineApi, tag: Tag, counter?: MeetItem) {
  const places = onlineHooks.meetupPlaces?.() ?? [], n = nameOf(tag), sh = openSheet(from, counter ? 'Proposer une autre heure' : 'Proposer un rendez-vous');
  if (!places.length && !counter) { sh.body.innerHTML = empty('🤝', 'Aucun lieu de rendez-vous disponible ici.'); return; }
  const list: PlaceRef[] = counter && !places.some(p => p.id === counter.place.id) ? [counter.place, ...places] : places;
  const choices = meetChoices(api.ctx.now());
  let place = counter?.place ?? list[0], when = choices[counter ? 2 : 1], note = '';
  const label = counter ? 'Proposer cette heure' : 'Proposer le rendez-vous';
  sh.body.innerHTML = `<section class="pk-sec mg-first"><h3>Où</h3><div class="pk-rows mg-places" role="radiogroup">${list.map(p => `<button type="button" class="pk-row tap mg-opt" role="radio" data-place="${esc(p.id)}"><i class="pk-ic" aria-hidden="true">${esc(p.icon ?? '📍')}</i><span class="pk-tx"><b>${esc(p.name)}</b><small>${esc(short(p.hub))}</small></span><em class="mg-check" aria-hidden="true">✓</em></button>`).join('')}</div></section>
    <section class="pk-sec"><h3>Quand <small>(heure de la ville)</small></h3><div class="mg-whens" role="radiogroup">${choices.map(c => `<button type="button" class="mg-when" role="radio" data-when="${c.id}"><b>${esc(c.label)}</b><span>${esc(c.clock)}</span><small>${esc(c.sub)}</small></button>`).join('')}</div></section>
    <label class="mg-lbl"><span>Note <small>(facultatif)</small></span><input class="mg-in" data-f="note" type="text" autocomplete="off" enterkeyhint="done" maxlength="${NOTE_MAX}" placeholder="Je serai devant l’entrée…"></label>
    <p class="mg-sum" aria-live="polite"></p><p class="mg-err" role="alert" hidden></p>
    ${btn(label, { kind: 'primary', cls: 'mg-ok', icon: '🤝' })}`;
  const sync = () => {
    sh.body.querySelectorAll<HTMLElement>('[data-place]').forEach(b => { const on = b.dataset.place === place.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    sh.body.querySelectorAll<HTMLElement>('[data-when]').forEach(b => { const on = b.dataset.when === when.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    sh.body.querySelector('.mg-sum')!.textContent = `${place.name} · ${when.when ? `à ${when.clock} (${when.sub})` : 'maintenant'}${counter ? ` · au lieu de ${counter.when ? 'l’heure proposée' : 'maintenant'}` : ''}`;
  };
  sh.body.addEventListener('click', e => {
    const t = e.target as HTMLElement, p = t.closest<HTMLElement>('[data-place]'), w = t.closest<HTMLElement>('[data-when]');
    if (p) place = list.find(x => x.id === p.dataset.place) ?? place;
    if (w) when = choices.find(x => x.id === w.dataset.when) ?? when;
    if (p || w) sync();
  });
  sh.body.querySelector<HTMLInputElement>('[data-f="note"]')!.addEventListener('input', e => { note = (e.target as HTMLInputElement).value.slice(0, NOTE_MAX); });
  sync();
  confirmButton(sh, o, label, id => o.meet({ id, to: tag, place, when: when.when, ...(note ? { note } : {}), ...(counter ? { counter: counter.id } : {}) }),
    r => { if (r.ok) { sh.close(); api.notify(`Rendez-vous proposé à ${n}`); } });
}
function locSheet(api: PhoneApi, from: HTMLElement, o: OnlineApi, tag: Tag) {
  const here = onlineHooks.hereNow?.() ?? null, n = nameOf(tag), sh = openSheet(from, 'Partager ma position');
  if (!here) { sh.body.innerHTML = empty('📍', 'Ta position n’est pas disponible ici.'); return; }
  sh.body.innerHTML = `<div class="pk-confirm"><i aria-hidden="true">📍</i><p><b>Partager ta position avec ${esc(n)} ?</b><br>${esc(here.name)} · ${esc(short(here.hub))}</p></div>
    <p class="pk-note">${esc(n)} verra où tu es maintenant, une fois, et pourra s’y rendre. Ta position ne se met pas à jour toute seule.</p><p class="mg-err" role="alert" hidden></p>
    <div class="pk-acts">${btn('Partager', { kind: 'primary', cls: 'mg-ok' })}${btn('Annuler', { act: 'no' })}</div>`;
  sh.body.querySelector('[data-act="no"]')!.addEventListener('click', () => sh.close());
  confirmButton(sh, o, 'Partager', () => o.shareLocation(tag), r => { if (r.ok) { sh.close(); api.notify('Position partagée'); } });
}
function blockSheet(api: PhoneApi, from: HTMLElement, o: OnlineApi, tag: Tag) {
  const n = nameOf(tag), sh = openSheet(from, `Bloquer ${n}`);
  sh.body.innerHTML = `<div class="pk-confirm"><i aria-hidden="true">🚫</i><p><b>Bloquer ${esc(n)} ?</b><br>Tu ne verras plus ses messages ni son personnage. Son argent, ses demandes et ses invitations seront refusés, vos invitations retirées et vos rendez-vous annulés.</p></div>
    <p class="mg-err" role="alert" hidden></p><div class="pk-acts">${btn('Bloquer', { kind: 'danger', cls: 'mg-ok' })}${btn('Annuler', { act: 'no' })}</div>`;
  sh.body.querySelector('[data-act="no"]')!.addEventListener('click', () => sh.close());
  confirmButton(sh, o, 'Bloquer', () => o.block(tag, true), r => { if (r.ok) { sh.close(); api.notify(`${n} est bloqué`); } });
}
function reportSheet(from: HTMLElement, o: OnlineApi, tag: Tag) {
  const n = nameOf(tag), sh = openSheet(from, `Signaler ${n}`);
  sh.body.innerHTML = `<p class="pk-note mg-first">Pourquoi ? Le signalement est gardé par le serveur du jeu, avec ta conversation.</p>
    <div class="pk-rows">${REASONS.map(([k, l]) => `<button type="button" class="pk-row tap" data-reason="${k}"><span class="pk-tx"><b>${esc(l)}</b></span><span class="pk-chev" aria-hidden="true">›</span></button>`).join('')}</div>
    <p class="mg-err" role="alert" hidden></p>`;
  let busy = false;
  sh.body.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-reason]'); if (!b || busy) return;
    busy = true; b.classList.add('wait');
    const r = await o.report(tag, b.dataset.reason as 'insulte' | 'harcelement' | 'arnaque' | 'autre');
    busy = false;
    if (!sh.open()) return;
    if (!r.ok) { const err = sh.body.querySelector<HTMLElement>('.mg-err')!; err.textContent = r.text; err.hidden = false; b.classList.remove('wait'); return; }
    sh.body.innerHTML = `<div class="pk-confirm mg-out ok" role="status"><i aria-hidden="true">✅</i><p><b>Signalement envoyé</b><br>Merci. Tu peux aussi bloquer ${esc(n)} depuis « ⋯ ».</p></div>${btn('OK', { kind: 'primary', act: 'close' })}`;
    sh.settle(); sh.body.querySelector('[data-act="close"]')!.addEventListener('click', () => sh.close());
  });
}
function forgetSheet(api: PhoneApi, from: HTMLElement, o: OnlineApi, tag: Tag) {
  const n = nameOf(tag), sh = openSheet(from, 'Supprimer la conversation');
  sh.body.innerHTML = `<div class="pk-confirm"><i aria-hidden="true">🗑️</i><p><b>Supprimer ta conversation avec ${esc(n)} ?</b><br>Elle disparaît de ton téléphone et de ton compte. ${esc(n)} garde la sienne.</p></div>
    <p class="mg-err" role="alert" hidden></p><div class="pk-acts">${btn('Supprimer', { kind: 'danger', cls: 'mg-ok' })}${btn('Annuler', { act: 'no' })}</div>`;
  sh.body.querySelector('[data-act="no"]')!.addEventListener('click', () => sh.close());
  confirmButton(sh, o, 'Supprimer', () => o.forget(tag), r => { if (r.ok) { sh.close(); drafts.delete(tag); api.notify('Conversation supprimée'); api.back(); } });
}

// ------------------------------------------------------------------ the screen

const refreshers = new WeakMap<HTMLElement, () => void>();
export const messagesScreen: Screen = {
  title: arg => (arg === 'new' ? 'Nouveau message' : isTag(arg) ? nameOf(arg) : 'Messages'),
  mount(page, api, arg) {
    ensureFakeOnline(api.ctx, phoneHooks.profileName?.());
    const o = online;
    page.classList.add('mg');
    if (!o) {
      page.innerHTML = empty('💬', 'Messages a besoin de la connexion en ligne. Cette version du jeu tourne en solo : ta partie continue normalement.');
      return;
    }
    for (const c of o.convs()) contacts.set(c.with, { name: c.name, look: c.look });   // names stay known after a conversation is forgotten (histories)
    let draw: () => void, cleanup: (() => void) | undefined;
    if (arg === 'new') draw = newView(page, api, o);
    else if (isTag(arg)) ({ draw, cleanup } = convView(page, api, o, arg));
    else draw = listView(page, api, o);
    refreshers.set(page, draw);
    const off = o.onChange(() => { if (page.isConnected) draw(); });
    return () => { off(); cleanup?.(); };
  },
  tick(page) { refreshers.get(page)?.(); },                                   // « vu il y a 5 min », « dans 3 min »: in place
};

/** The Messages app's badge (the phone's app tile): unread items in every conversation. */
export const messagesBadge = () => online?.unread() ?? 0;

/**
 * Optional, for main.ts: a toast for each new item another player sends while its conversation is not on screen (« 💬 Awa : On se retrouve où ? »).
 * Call once the account is installed; returns the unsubscribe.
 */
export function startMessageNotices(toast: (msg: string) => void): () => void {
  const o = online; if (!o) return () => {};
  const told = new Set(o.convs().map(c => c.last?.id ?? ''));
  return o.onChange(() => {
    for (const c of o.convs()) {
      const l = c.last; if (!l || told.has(l.id)) continue;
      told.add(l.id);
      if (c.unread && !c.blocked && l.from === c.with && viewing !== c.with) toast(`💬 ${c.name} : ${previewOf(l, o.me?.tag ?? null)}`);
    }
  });
}

/** ?debug: what the Messages screen shows, for the checks. */
if (typeof window !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__dakarMessages = { deps: messagesDeps, viewing: () => viewing, contacts };
}
