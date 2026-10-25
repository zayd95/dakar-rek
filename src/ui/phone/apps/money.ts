import type { Screen, PhoneApi } from '../types';
import { badge, btn, card, empty, esc, more, row, rows, section } from '../kit';
import { debtsNow } from '../selectors';
import { phoneHooks, type LedgerEntry } from '../../phoneHooks';
import { fcfa } from '../../hud';
import { online, type OnlineApi } from '../../../online/api';
import type { LedgerOp } from '../../../online/protocol';
import { ensureFakeOnline } from '../../../online/fake';
import { moneySheet, nameOf } from './messages';
import { knownText, limitLines, statusText } from './messagesText';
import './money.css';

/**
 * Argent: the balance (one line at any size), Teranga Money (LD2.0-B: the server-held account, when this build is online), what the player owes and when
 * the next repayment falls, income and charges, the last movements (the full history on a tap), and the money apps (Épargne, Crédits, Biens, Affaires).
 */
function when(at: number): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
const signed = (n: number) => (n < 0 ? '−' : '+') + fcfa(Math.abs(n));
const ledgerRows = (list: LedgerEntry[]) => rows(list.map(r => row({ label: r.label, sub: when(r.at), value: signed(r.amount), tone: r.amount < 0 ? '' : 'gain' })));

// ------------------------------------------------------------------ Teranga Money (the online account: only what the server said, and when)
const tmSigned = (op: LedgerOp, me: string | undefined) => op.kind === 'fund' || (op.kind === 'pay' && op.to === me) ? op.amount : -op.amount;
function tmLabel(op: LedgerOp, me: string | undefined): { label: string; sub: string } {
  if (op.kind === 'fund') return { label: 'Recharge depuis le portefeuille', sub: '' };
  if (op.kind === 'cashout') return { label: 'Retrait vers le portefeuille', sub: '' };
  const out = op.from === me, who = nameOf((out ? op.to : op.from) ?? '');
  const parts = [op.note ? `« ${op.note} »` : '', op.req ? (out ? 'demande payée' : 'ta demande payée') : '', out && op.fund ? `dont ${fcfa(op.fund)} du portefeuille` : ''].filter(Boolean);
  return { label: out ? `Envoyé à ${who}` : `Reçu de ${who}`, sub: parts.join(' · ') };
}
function tmHtml(o: OnlineApi, now: number): string {
  const b = o.balance, on = o.status === 'online', st = statusText(o.status);
  return `<div class="tm-card"><div class="tm-top"><span class="tm-tx"><small>Teranga Money · ton argent en ligne${(o as { fake?: boolean }).fake ? ' · simulé (debug)' : ''}</small>
      <b class="tm-bal">${b ? esc(fcfa(b.amount)) : '—'}</b><span class="tm-when">${b ? esc(knownText(b.at, b.fresh && on, now)) : esc(st.text)}</span></span><i aria-hidden="true">📱</i></div></div>
    <div class="pk-acts">${btn('Recharger', { act: 'tm-fund', kind: 'primary', icon: '⬇️', cls: 'tm-go', sub: 'depuis le portefeuille' })}${btn('Retirer', { act: 'tm-cashout', icon: '⬆️', cls: 'tm-go', sub: 'vers le portefeuille' })}</div>
    ${on ? '' : `<p class="pk-note warn tm-off">${esc('Hors ligne : Recharger et Retirer reviennent avec la connexion. Le solde affiché est le dernier connu.')}</p>`}`;
}
/** Teranga Money's block: its balance and when it was known, « Recharger » / « Retirer » (the money sheet's one confirmation), its history and today's limits. */
function teranga(page: HTMLElement, api: PhoneApi, o: OnlineApi): () => void {
  const sec = page.querySelector<HTMLElement>('[data-slot="tm"]'); if (!sec) return () => {};
  let lastBal = o.balance?.amount ?? NaN, asked = 0;
  const draw = () => {
    sec.querySelector('.tm-box')!.innerHTML = tmHtml(o, api.ctx.now());
    const on = o.status === 'online';
    sec.querySelectorAll<HTMLButtonElement>('.tm-go').forEach(b => { b.disabled = !on; });
    const lim = limitLines(o.limits, o.today);
    sec.querySelector('.tm-lim')!.innerHTML = lim.length ? more('Limites du jour', lim.map(l => `<p>${esc(l)}</p>`).join(''), 'tm-limits') : '';
  };
  const history = async () => {
    const n = ++asked, box = sec.querySelector('.tm-hist')!;
    if (!box.innerHTML) box.innerHTML = '<p class="pk-note">Chargement de l’historique…</p>';
    const r = await o.history();
    if (n !== asked || !page.isConnected) return;
    if (!r.ok) { box.innerHTML = `<p class="pk-note">${esc(r.text)}</p>`; return; }
    const me = o.me?.tag, rowOf = (op: LedgerOp) => { const l = tmLabel(op, me), v = tmSigned(op, me); return row({ label: l.label, sub: [l.sub, when(op.at)].filter(Boolean).join(' · '), value: signed(v), tone: v > 0 ? 'gain' : '' }); };
    box.innerHTML = r.ops.length ? rows(r.ops.slice(0, 5).map(rowOf)) + (r.ops.length > 5 ? more(`Tout l’historique (${r.ops.length}${r.more ? '+' : ''})`, rows(r.ops.slice(5).map(rowOf)), 'mn-all') : '')
      : empty('🧾', 'Aucune opération Teranga Money pour l’instant.');
  };
  sec.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act^="tm-"]'); if (!b || (b as HTMLButtonElement).disabled) return;
    moneySheet(api, page, { kind: b.dataset.act === 'tm-fund' ? 'fund' : 'cashout', done: ok => { if (ok) { draw(); void history(); } } });
  });
  draw(); void history();
  const off = o.onChange(() => {
    if (!page.isConnected) return;
    draw();
    if ((o.balance?.amount ?? NaN) !== lastBal) { lastBal = o.balance?.amount ?? NaN; void history(); }
  });
  (page as HTMLElement & { _tm?: () => void })._tm = () => { const w = sec.querySelector('.tm-when'), b = o.balance; if (w && b) { const t = knownText(b.at, b.fresh && o.status === 'online', api.ctx.now()); if (w.textContent !== t) w.textContent = t; } };
  return off;
}

function balance(api: PhoneApi): string {
  const cash = api.ctx.state.wallet, full = fcfa(cash), w = phoneHooks.wealth?.();
  const size = full.length > 17 ? 'xl' : full.length > 13 ? 'l' : '';
  return `<div class="ph-balance"><small>Solde</small><b class="${size}">${esc(full)}</b><span>FCFA · monnaie de jeu, sans valeur réelle</span>
    ${w ? `<div class="mn-worth"><span>Fortune totale</span><b>${esc(fcfa(cash + w.assets))}</b></div>` : ''}</div>`;
}

export const moneyScreen: Screen = {
  title: 'Argent',
  mount(page, api) {
    ensureFakeOnline(api.ctx, phoneHooks.profileName?.());
    const s = api.ctx.state, debt = debtsNow(s), w = phoneHooks.wealth?.(), ledger = phoneHooks.ledger?.(), o = online;
    const debtHtml = debt ? section('Crédits', card(`<div class="mn-debt"><span><small>Reste à rembourser</small><b>${esc(fcfa(debt.left))}</b></span>${debt.late > 0 ? badge('En retard', 'warn') : debt.next > 0 && debt.inDays <= 0 ? badge('Dû aujourd’hui', 'sun') : ''}</div>
        ${debt.next > 0 ? `<p class="mn-next">Prochain remboursement : <b>${esc(fcfa(debt.next))}</b> ${debt.inDays <= 0 ? 'aujourd’hui' : debt.inDays === 1 ? 'demain' : `dans ${debt.inDays} jours`}</p>` : ''}
        ${phoneHooks.openCredits ? btn('Rembourser', { act: 'credits', kind: debt.late > 0 || debt.inDays <= 0 ? 'primary' : 'secondary' }) : ''}`)) : '';
    const flows = w ? section('Revenus et charges', rows([
      row({ icon: '📈', label: 'Revenus', sub: 'Par heure en ville, pendant que tu joues', value: '+' + fcfa(w.perHour), tone: 'gain' }),
      ...(w.charges ? [row({ icon: '📉', label: 'Loyers et charges', sub: 'Par heure en ville', value: '−' + fcfa(w.charges) })] : []),
      row({ icon: '🏷️', label: 'Valeur de tes biens', value: fcfa(w.assets) }),
    ]) + (w.polyvalence ? more('Polyvalence', `<p>${esc(w.polyvalence)}</p>`) : '')) : '';
    const apps = [
      row({ icon: '🏦', label: 'Épargne', sub: s.data.bank.opened >= 0 ? `${fcfa(s.data.bank.savings)} de côté · Banque Teranga` : 'Ouvrir un compte à la Banque Teranga', go: 'banque' }),
      phoneHooks.openCredits ? row({ icon: '💳', label: 'Crédits', sub: debt ? `${debt.count} en cours` : 'Aucune dette', act: 'credits' }) : '',
      phoneHooks.openAssets ? row({ icon: '🔑', label: 'Biens', sub: 'Logements, terrains, panneau, annonces', app: 'biens' }) : '',
      phoneHooks.openBusiness ? row({ icon: '🏢', label: 'Affaires', sub: 'Acheter et voir les revenus', app: 'affaires' }) : '',
    ].filter(Boolean);
    const recent = ledger === undefined ? empty('🧾', 'L’historique des gains et des dépenses arrive avec les métiers.')
      : ledger.length === 0 ? empty('🧾', 'Aucune opération pour l’instant.')
        : (() => { const list = ledger.slice().sort((a, b) => b.at - a.at); return ledgerRows(list.slice(0, 5)) + (list.length > 5 ? more(`Tout l’historique (${list.length})`, ledgerRows(list.slice(5)), 'mn-all') : ''); })();
    // Teranga Money: only in a build with the online account (hidden entirely without it)
    const tm = o ? section('Teranga Money', '<div class="tm-box"></div><div class="tm-lim"></div><h4 class="tm-h">Historique Teranga Money</h4><div class="tm-hist"></div>', ' data-slot="tm"') : '';
    page.innerHTML = `${balance(api)}${tm}${debtHtml}${flows}${apps.length ? section('Gérer', rows(apps)) : ''}${section('Derniers mouvements', recent)}`;
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act="credits"]');
      if (b && phoneHooks.openCredits) api.launch(phoneHooks.openCredits);
    });
    return o ? teranga(page, api, o) : undefined;
  },
  tick(page, api) {
    (page as HTMLElement & { _tm?: () => void })._tm?.();                          // « il y a 3 min » in place
    const b = page.querySelector('.ph-balance > b'), t = fcfa(api.ctx.state.wallet);
    if (b && b.textContent !== t) { b.textContent = t; b.className = t.length > 17 ? 'xl' : t.length > 13 ? 'l' : ''; }   // in place: the list keeps its scroll
  },
};
