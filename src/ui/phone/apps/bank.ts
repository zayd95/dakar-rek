import type { Screen, PhoneApi } from '../types';
import type { HubId } from '../../../core/types';
import { bar, btn, card, empty, esc, more, note, row, rows, section } from '../kit';
import { phoneHooks } from '../../phoneHooks';
import { fcfa } from '../../hud';
import {
  bankAdvice, chipsFor, clearGoal, deposit, goalPresets, goalView, isOpen, levelOf, milestoneText, newRef, nextLevelOf, parseAmount, rateText, setGoal, withdraw,
} from '../../../economy/bank';
import { tapSettled } from '../../tapGuard';
import './bank.css';

/**
 * Banque: the Épargne Teranga account in the pocket (mobile banking; rules: src/economy/bank.ts). The savings and the wallet, Déposer / Retirer, the goal
 * and how far it is, the conseillère's advice (the same lines as at the counter), the interest of the level reached, the savings' own history (the
 * wallet's is in Argent). Deposits and withdrawals: a quick amount, « Tout » or any amount, then a confirmation whose ref is made when it is shown (a
 * double tap or a replay is refused, src/economy/money.ts). After an operation the screen is drawn again from the state: never a stale balance.
 * The account is opened at an agency counter (Pikine, Plateau); until then the app shows the way.
 */
type Kind = 'deposit' | 'withdraw';
const SETTLE_MS = 320;
const signed = (n: number) => (n < 0 ? '−' : '+') + fcfa(Math.abs(n));
function when(at: number): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) && at > 0 ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
const AGENCIES: Partial<Record<HubId, string>> = { pikine: 'Banque Teranga · Pikine', plateau: 'Banque Teranga · Plateau' };

/** No account yet: where to open one (and a marker to it, or the walk to the nearest agency's district). */
function closedHtml(): string {
  return `<div class="bk-hero"><small>Épargne Teranga</small><b>Pas encore de compte</b><span>Gratuit · ${esc(rateText(levelOf(0)))}</span></div>
    ${section('', empty('🏦', 'Ouvre ton compte au guichet d’une agence Banque Teranga : à Pikine ou au Plateau.', phoneHooks.markPlace ? btn('Y aller', { act: 'agency', kind: 'primary', icon: '📍' }) : ''))}`;
}
function goAgency(api: PhoneApi) {
  const here = api.ctx.hub(), hub: HubId = here && AGENCIES[here] ? here : 'pikine', name = AGENCIES[hub]!;
  phoneHooks.markPlace?.(`${hub}:city:bank`, hub, name);
  if (here === hub || !phoneHooks.walkTo) api.launch(() => api.ctx.toast(`Repère : ${name}`));
  else api.launch(() => phoneHooks.walkTo?.(hub));
}

function mainHtml(api: PhoneApi): string {
  const s = api.ctx.state, b = s.data.bank, g = goalView(s), lvl = levelOf(b.savings), next = nextLevelOf(b.savings);
  const hero = `<div class="bk-hero"><small>Épargne Teranga</small><b data-bk="savings">${esc(fcfa(b.savings))}</b><span>Portefeuille <b data-bk="wallet">${esc(fcfa(s.data.wallet))}</b></span></div>
    <div class="pk-acts">${btn('Déposer', { go: 'banque', arg: 'deposit', kind: 'primary', icon: '⬇️' })}${btn('Retirer', { go: 'banque', arg: 'withdraw', icon: '⬆️' })}</div>`;
  const goal = g ? section('Objectif', card(`<div class="bk-goal"><b>🎯 ${esc(g.label)}</b><span>${esc(fcfa(g.saved))} / ${esc(fcfa(g.amount))}</span></div>${bar(g.pct / 100, 'sun')}
      <div class="bk-goal-foot"><span>${g.reached ? 'Atteint ✓' : `Encore ${esc(fcfa(g.left))}`}</span>${btn('Changer', { go: 'banque', arg: 'goal', inline: true })}</div>`))
    : section('Objectif', rows([row({ icon: '🎯', label: 'Choisir un objectif', sub: goalPresets(s).map(p => `${p.label} ${fcfa(p.amount)}`).join(' · '), go: 'banque', arg: 'goal' })]));
  const tips = section('Conseil', card(`<ul class="bk-tips">${bankAdvice(s).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`));
  const rate = section('Intérêts', rows([row({ icon: '📈', label: rateText(lvl), sub: next ? `Dès ${fcfa(next.from)} d’épargne : ${rateText(next)}` : 'Le plus haut palier' })]));
  const list = b.tx.slice().reverse(), txRows = (l: typeof list) => rows(l.map(t => row({ label: t.label, sub: `Jour ${t.day}${when(t.at) ? ` · ${when(t.at)}` : ''} · solde ${fcfa(t.balance)}`, value: signed(t.amount), tone: t.amount > 0 ? 'gain' : '' })));
  const hist = section('Historique', list.length ? txRows(list.slice(0, 5)) + (list.length > 5 ? more(`Tout l’historique (${list.length})`, txRows(list.slice(5))) : '') : empty('🧾', 'Aucun mouvement pour l’instant.'))
    + note('Le portefeuille a son propre historique dans Argent.');
  return hero + goal + tips + rate + hist;
}

/** Déposer / Retirer: the quick amounts the source covers, « Tout », any amount; then the confirmation, in place. */
function amountScreen(page: HTMLElement, api: PhoneApi, kind: Kind) {
  const s = api.ctx.state, dep = kind === 'deposit', c = chipsFor(s, kind);
  const line = `<p class="bk-line">Portefeuille <b data-bk="wallet">${esc(fcfa(s.data.wallet))}</b> · Épargne <b data-bk="savings">${esc(fcfa(s.data.bank.savings))}</b></p>`;
  if (c.all <= 0) { page.innerHTML = line + section('', empty('💸', dep ? 'Ton portefeuille est vide : rien à déposer.' : 'Ton épargne est vide : rien à retirer.')); return; }
  const chips = c.amounts.map(a => `<button type="button" class="bk-chip" data-act="amt" data-arg="${a}">${esc(fcfa(a))}</button>`).join('')
    + `<button type="button" class="bk-chip all" data-act="amt" data-arg="${c.all}">Tout · ${esc(fcfa(c.all))}</button>`;
  page.innerHTML = `${line}<div class="bk-pick">${section(dep ? 'Combien déposer ?' : 'Combien retirer ?', `<div class="bk-chips">${chips}</div>
      <form class="bk-free" novalidate><input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="20" placeholder="Autre montant (F)" aria-label="Autre montant, en francs"><button type="submit">OK</button></form>
      <p class="bk-err" role="alert" hidden></p>`)}</div><div class="bk-conf" hidden></div>`;
  const pick = page.querySelector<HTMLElement>('.bk-pick')!, conf = page.querySelector<HTMLElement>('.bk-conf')!, err = page.querySelector<HTMLElement>('.bk-err')!;
  let shownAt = 0, amount = 0, ref = '';
  const confirm = (a: number) => {
    amount = a; ref = newRef(dep ? 'dep' : 'ret');                                    // the confirmation's own key: made now, applied once
    const sav = s.data.bank.savings + (dep ? a : -a), wal = s.data.wallet + (dep ? -a : a);
    conf.innerHTML = section('', card(`<div class="pk-confirm"><i aria-hidden="true">${dep ? '⬇️' : '⬆️'}</i><p><b>${dep ? 'Déposer' : 'Retirer'} ${esc(fcfa(a))} ?</b><br>Après : épargne ${esc(fcfa(sav))} · portefeuille ${esc(fcfa(wal))}</p></div>
      <div class="pk-acts">${btn('Confirmer', { act: 'ok', arg: ref, kind: 'primary' })}${btn('Annuler', { act: 'cancel' })}</div>`));
    pick.hidden = true; conf.hidden = false; shownAt = performance.now();
  };
  page.addEventListener('submit', e => {
    e.preventDefault();
    const input = page.querySelector<HTMLInputElement>('.bk-free input')!, a = parseAmount(input.value), have = dep ? s.data.wallet : s.data.bank.savings;
    const why = a === null ? 'Écris un montant en francs, par exemple 15 000.' : a > have ? `Tu n’as que ${fcfa(have)} ${dep ? 'dans ton portefeuille' : 'sur ton épargne'}.` : '';
    if (why) { err.textContent = why; err.hidden = false; return; }
    input.blur(); confirm(a!);
  });
  page.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'amt') confirm(Number(b.dataset.arg));
    else if (act === 'cancel') { conf.hidden = true; pick.hidden = false; }
    else if (act === 'ok') {
      if (!tapSettled(shownAt, SETTLE_MS)) return;                                   // the second half of the tap that showed it
      const key = b.dataset.arg ?? ref, r = dep ? deposit(s, amount, { ref: key, where: 'téléphone' }) : withdraw(s, amount, { ref: key, where: 'téléphone' });
      if (r.ok) {
        api.ctx.save();
        api.notify(r.milestones.length ? milestoneText(r.milestones[r.milestones.length - 1]) : `${dep ? 'Dépôt' : 'Retrait'} de ${fcfa(amount)} · épargne ${fcfa(s.data.bank.savings)}`);
        api.back();
      } else {
        api.notify(r.text, 'warn');
        if (r.why === 'duplicate') api.back();
      }
    }
  });
}

/** The goal: a venture at the price it would cost now, any amount, or none. */
function goalScreen(page: HTMLElement, api: PhoneApi) {
  const s = api.ctx.state, g = s.data.bank.goal, presets = goalPresets(s);
  page.innerHTML = section('Un projet', rows(presets.map(p => row({ icon: '🎯', label: `${p.label} · ${fcfa(p.amount)}`, sub: `${p.name} · ≈ ${fcfa(p.perHour)} par heure en ville`, act: 'preset', arg: p.id, ...(g && g.label === p.label && g.amount === p.amount ? { value: '✓', chevron: false } : {}) }))))
    + section('Ou un montant libre', `<form class="bk-free" novalidate><input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="20" placeholder="Montant (F)" aria-label="Objectif libre, en francs"><button type="submit">OK</button></form><p class="bk-err" role="alert" hidden></p>`)
    + (g ? btn('Retirer l’objectif', { act: 'clear', kind: 'quiet' }) : '');
  const done = (amount: number, label: string) => { if (setGoal(s, amount, label)) { api.ctx.save(); api.notify(`Objectif : ${label} · ${fcfa(amount)}`); } api.back(); };
  page.addEventListener('submit', e => {
    e.preventDefault();
    const input = page.querySelector<HTMLInputElement>('.bk-free input')!, a = parseAmount(input.value), err = page.querySelector<HTMLElement>('.bk-err')!;
    if (a === null) { err.textContent = 'Écris un montant en francs, par exemple 80 000.'; err.hidden = false; return; }
    input.blur(); done(a, 'Mon projet');
  });
  page.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
    if (b.dataset.act === 'preset') { const p = presets.find(x => x.id === b.dataset.arg); if (p) done(p.amount, p.label); }
    else if (b.dataset.act === 'clear') { clearGoal(s); api.ctx.save(); api.notify('Objectif retiré'); api.back(); }
  });
}

export const bankScreen: Screen = {
  title: arg => (arg === 'deposit' ? 'Déposer' : arg === 'withdraw' ? 'Retirer' : arg === 'goal' ? 'Objectif' : 'Banque'),
  mount(page, api, arg) {
    // the shell drops a tap that lands within its settle of a screen change; here it is measured from when the finger went down (src/ui/tapGuard.ts), so a
    // double tap whose first half confirmed an operation never reaches this screen, however slow the frame that drew it
    const shownAt = performance.now();
    page.addEventListener('click', e => { if (!tapSettled(shownAt, SETTLE_MS)) { e.stopPropagation(); e.preventDefault(); } }, true);
    if (!isOpen(api.ctx.state)) {
      page.innerHTML = closedHtml();
      page.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-act="agency"]')) goAgency(api); });
      return;
    }
    if (arg === 'deposit' || arg === 'withdraw') { amountScreen(page, api, arg); return; }
    if (arg === 'goal') { goalScreen(page, api); return; }
    page.innerHTML = mainHtml(api);
  },
  tick(page, api) {
    const s = api.ctx.state;
    for (const [k, v] of [['savings', s.data.bank.savings], ['wallet', s.data.wallet]] as const) {
      const el = page.querySelector(`[data-bk="${k}"]`), t = fcfa(v);
      if (el && el.textContent !== t) el.textContent = t;                         // in place: the list keeps its scroll
    }
  },
};
