import type { GameCtx, GameModule } from '../game/modules';
import type { MenuItem } from '../ui/sheet';
import type { Action } from '../world/types';
import { esc } from '../ui/journal';
import { CITY_ACTIONS } from '../world/cityContent';
import { tapSettled } from '../ui/tapGuard';
import { fcfaText as F } from './format';
import {
  bankAdvice, chipsFor, clearGoal, deposit, goalPresets, goalView, isOpen, levelOf, newRef, nextLevelOf, openAccount, parseAmount, payInterest,
  rateText, setGoal, withdraw, type BankResult,
} from './bank';
import './bank.css';

/**
 * Banque Teranga at the counter (Pikine and Plateau agencies, src/world/cityContent.ts `bank`), and the bank's day (rules: src/economy/bank.ts):
 *   – « Mon épargne » / « Ouvrir un compte »: the account opened for free, deposits and withdrawals (quick amounts, « Tout », any amount), the balances,
 *     the history of the savings, the goal; every sheet reads the state when it opens, so a balance is never stale after an operation;
 *   – a confirmation carries a fresh ref (src/economy/money.ts): its double tap is refused, and a tap whose finger went down within SETTLE_MS of a sheet
 *     opening is the second half of a double tap (dropped, as the phone does; src/ui/tapGuard.ts);
 *   – « Demander conseil à la conseillère » (at the counter or from the account): the advice of `bankAdvice`; the old conversation's social effect (the
 *     content's `conseiller` action: its needs and counter) kept, once per player day;
 *   – once per player day played, the interest of the day (a toast) and the levels reached (a moment card, once each).
 */
const SETTLE_MS = 320;
const ADVICE_KEY = 'bank:advice:day';
type Kind = 'deposit' | 'withdraw';
const signed = (n: number) => (n < 0 ? '−' : '+') + F(Math.abs(n));
function when(at: number): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) && at > 0 ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

class BankModule implements GameModule {
  readonly name = 'bank';
  private ctx: GameCtx | null = null;
  private shownAt = 0;
  /** The agency the player stands at (« Pikine », « Plateau »), written in the histories. */
  private where = '';
  private log = { ops: [] as string[], interest: [] as { day: number; amount: number }[], milestones: [] as number[], lastRef: '' };

  init(ctx: GameCtx) { this.ctx = ctx; }

  update(ctx: GameCtx) {
    const b = ctx.state.data.bank;
    if (b.opened < 0 || b.interestDay >= ctx.state.data.play.day) return;                  // the bank looks once a player day
    const r = payInterest(ctx.state); if (!r) return;
    if (r.amount > 0) {
      this.log.interest.push({ day: r.day, amount: r.amount }); if (this.log.interest.length > 20) this.log.interest.shift();
      ctx.toast(`Épargne Teranga : +${F(r.amount)} d’intérêts aujourd’hui · ${F(b.savings)} de côté`);
      this.celebrate(r.milestones);
    }
    ctx.save();
  }

  /** A level reached for the first time ever: a moment card (each level once). */
  private celebrate(list: number[]) {
    const ctx = this.ctx; if (!ctx) return;
    for (const m of list) {
      this.log.milestones.push(m);
      const next = nextLevelOf(m);
      ctx.hud.moment({ icon: '🏦', title: `Épargne : palier ${F(m)} !`, lines: [`Ton épargne rapporte désormais ${rateText(levelOf(m))}.`, next ? `Prochain palier : ${F(next.from)}.` : 'C’est le plus haut palier.'] }, 6000);
    }
  }

  // ---------------------------------------------------------------- sheets
  private close = () => { this.ctx?.hud.closeModal(); this.ctx?.setMode('play'); };
  /** Opens a sheet; every pick is dropped while the sheet is still settling (the second tap of a double tap lands on the new sheet). */
  private sheet(title: string, sub: string, items: MenuItem[], html = '', after?: (panel: HTMLElement) => void) {
    const ctx = this.ctx!, guard = (fn: () => void) => () => { if (this.settled()) fn(); };
    ctx.setMode('menu');
    ctx.hud.openMenu(title, sub, items.map(it => (it.disabled ? it : { ...it, onPick: guard(it.onPick) })), html, panel => { this.shownAt = performance.now(); after?.(panel); });
  }
  /** The tap under way began once this sheet could be seen (src/ui/tapGuard.ts: the finger's own time, so a slow frame never lets a double tap through). */
  private settled() { return tapSettled(this.shownAt, SETTLE_MS); }

  /** « Mon épargne » at an agency (`place`: the interactable's name, « Banque Teranga · Pikine »). */
  counter(place?: string) {
    if (place) this.where = place.split(' · ')[1] ?? '';
    this.home();
  }

  /** The account: open it, or its balances, goal and services. Reads the state now (never a stale balance). */
  home() {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.state, b = s.data.bank, at = this.where ? `Banque Teranga · ${this.where}` : 'Banque Teranga';
    if (!isOpen(s)) {
      this.sheet('Ouvrir un compte', `${at} · « Un compte, c’est gratuit. Ton argent est à l’abri, et il rapporte un peu chaque jour où tu joues. »`, [
        { icon: '🏦', label: 'Ouvrir mon compte Épargne Teranga', detail: `Gratuit · ${rateText(levelOf(0))} · dépôts et retraits ici ou sur le téléphone`, onPick: () => {
          if (openAccount(s)) { ctx.save(); this.log.ops.push('open'); ctx.toast('Compte Épargne Teranga ouvert ✓'); }
          this.home();
        } },
        { icon: '💬', label: 'Demander conseil à la conseillère', detail: 'Ce qu’elle voit dans tes comptes', onPick: () => this.advise() },
        { icon: '↩️', label: 'Pas maintenant', onPick: this.close },
      ]);
      return;
    }
    const g = goalView(s), next = nextLevelOf(b.savings), n = b.tx.length;
    const html = `<div class="bk-sum"><div class="bk-bal"><span><small>Épargne</small><b data-bk="savings">${esc(F(b.savings))}</b></span><span><small>Portefeuille</small><b data-bk="wallet">${esc(F(s.data.wallet))}</b></span></div>
      <p class="bk-rate">📈 ${esc(rateText(levelOf(b.savings)))}${next ? ` · dès ${esc(F(next.from))} : ${esc(F(next.cap))} max` : ''}</p>
      ${g ? `<p class="bk-goal">🎯 ${esc(g.label)} · ${esc(F(g.saved))} / ${esc(F(g.amount))}${g.reached ? ' · atteint ✓' : ''}</p><i class="bk-bar"><i style="width:${g.pct}%"></i></i>` : ''}</div>`;
    this.sheet('Mon épargne', at, [
      { icon: '⬇️', label: 'Déposer', detail: 'Du portefeuille vers ton épargne', disabled: s.data.wallet <= 0, reason: 'Ton portefeuille est vide', onPick: () => this.amount('deposit') },
      { icon: '⬆️', label: 'Retirer', detail: 'De ton épargne vers ton portefeuille', disabled: b.savings <= 0, reason: 'Ton épargne est vide', onPick: () => this.amount('withdraw') },
      { icon: '🎯', label: g ? 'Changer d’objectif' : 'Choisir un objectif', detail: g ? `${g.label} · ${g.pct} %` : goalPresets(s).map(p => p.label).join(', ') + ' ou un montant libre', onPick: () => this.goal() },
      { icon: '🧾', label: 'Historique', detail: n ? `${n} opération${n > 1 ? 's' : ''} · dernière ${signed(b.tx[n - 1].amount)}` : 'Aucune opération pour l’instant', onPick: () => this.history() },
      { icon: '💬', label: 'Demander conseil à la conseillère', detail: 'Ce qu’elle voit dans tes comptes', onPick: () => this.advise() },
      { icon: '↩️', label: 'Fermer', onPick: this.close },
    ], html);
  }

  /** How much: the quick amounts the source covers, « Tout », or any amount typed. */
  amount(kind: Kind) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.state, c = chipsFor(s, kind), dep = kind === 'deposit';
    const chips = c.amounts.map(a => `<button type="button" class="bk-chip" data-amt="${a}">${esc(F(a))}</button>`).join('')
      + (c.all > 0 ? `<button type="button" class="bk-chip all" data-amt="${c.all}">Tout · ${esc(F(c.all))}</button>` : '');
    const html = `<div class="bk-chips">${chips}</div>
      <form class="bk-free" novalidate><input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="20" placeholder="Autre montant (F)" aria-label="Autre montant, en francs"><button type="submit">OK</button></form>
      <p class="bk-err" role="alert" hidden></p>`;
    this.sheet(dep ? 'Déposer' : 'Retirer', `Portefeuille ${F(s.data.wallet)} · Épargne ${F(s.data.bank.savings)}`, [{ icon: '↩️', label: 'Retour', onPick: () => this.home() }], html, panel => {
      panel.querySelectorAll<HTMLElement>('.bk-chip').forEach(b => b.addEventListener('click', () => { if (this.settled()) this.confirm(kind, Number(b.dataset.amt)); }));
      const form = panel.querySelector<HTMLFormElement>('.bk-free')!, input = form.querySelector('input')!, err = panel.querySelector<HTMLElement>('.bk-err')!;
      form.addEventListener('submit', e => {
        e.preventDefault(); if (!this.settled()) return;
        const a = parseAmount(input.value), have = dep ? s.data.wallet : s.data.bank.savings;
        const why = a === null ? 'Écris un montant en francs, par exemple 15 000.' : a > have ? `Tu n’as que ${F(have)} ${dep ? 'dans ton portefeuille' : 'sur ton épargne'}.` : '';
        if (why) { err.textContent = why; err.hidden = false; return; }
        input.blur(); this.confirm(kind, a!);
      });
    });
  }

  /** The confirmation, with the balances after it; its ref is made now, so its double tap (or a replay) is refused. */
  confirm(kind: Kind, amount: number) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.state, dep = kind === 'deposit', ref = newRef(dep ? 'dep' : 'ret');
    const sav = s.data.bank.savings + (dep ? amount : -amount), wal = s.data.wallet + (dep ? -amount : amount);
    this.log.lastRef = ref;
    this.sheet(dep ? 'Confirmer le dépôt' : 'Confirmer le retrait', dep ? `${F(amount)} de ton portefeuille vers ton épargne.` : `${F(amount)} de ton épargne vers ton portefeuille.`, [
      { icon: '✅', label: dep ? `Déposer ${F(amount)}` : `Retirer ${F(amount)}`, right: F(amount), onPick: () => this.apply(kind, amount, ref) },
      { icon: '↩️', label: 'Annuler', onPick: () => this.amount(kind) },
    ], `<p class="bk-after" data-ref="${esc(ref)}">Après : épargne <b>${esc(F(sav))}</b> · portefeuille <b>${esc(F(wal))}</b></p>`);
  }

  /** Applies a confirmed operation once (its ref), saves, and shows the account as it is now. */
  apply(kind: Kind, amount: number, ref: string): BankResult {
    const ctx = this.ctx!, s = ctx.state, where = !this.where ? 'agence' : this.where === 'Plateau' ? 'agence du Plateau' : `agence de ${this.where}`;
    const r = kind === 'deposit' ? deposit(s, amount, { ref, where }) : withdraw(s, amount, { ref, where });
    this.log.ops.push(`${kind}:${amount}:${r.ok ? 'ok' : r.why}`); if (this.log.ops.length > 40) this.log.ops.shift();
    if (r.ok) {
      ctx.save();
      ctx.toast(`${kind === 'deposit' ? 'Dépôt' : 'Retrait'} de ${F(amount)} ✓ · épargne ${F(s.data.bank.savings)} · portefeuille ${F(s.data.wallet)}`);
      this.celebrate(r.milestones);
    } else ctx.toast(r.text);
    this.home();
    return r;
  }

  /** The goal: a venture at the price the player would pay for it now, any amount, or none. */
  goal() {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.state, g = s.data.bank.goal, set = (amount: number, label: string) => { if (setGoal(s, amount, label)) { ctx.save(); ctx.toast(`Objectif : ${label} · ${F(amount)}`); } this.home(); };
    const html = `<form class="bk-free" novalidate><input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" maxlength="20" placeholder="Montant libre (F)" aria-label="Objectif libre, en francs"><button type="submit">OK</button></form><p class="bk-err" role="alert" hidden></p>`;
    this.sheet('Mon objectif', g ? `Actuel : ${g.label} · ${F(g.amount)}` : 'Ce que tu veux t’offrir avec ton épargne', [
      ...goalPresets(s).map(p => ({ icon: '🎯', label: `${p.label} · ${F(p.amount)}`, detail: `${p.name} · environ ${F(p.perHour)} par heure en ville`, right: g && g.label === p.label && g.amount === p.amount ? '✓' : undefined, onPick: () => set(p.amount, p.label) })),
      ...(g ? [{ icon: '🗑️', label: 'Retirer l’objectif', onPick: () => { clearGoal(s); ctx.save(); this.home(); } }] : []),
      { icon: '↩️', label: 'Retour', onPick: () => this.home() },
    ], html, panel => {
      const form = panel.querySelector<HTMLFormElement>('.bk-free')!, input = form.querySelector('input')!, err = panel.querySelector<HTMLElement>('.bk-err')!;
      form.addEventListener('submit', e => {
        e.preventDefault(); if (!this.settled()) return;
        const a = parseAmount(input.value);
        if (a === null) { err.textContent = 'Écris un montant en francs, par exemple 80 000.'; err.hidden = false; return; }
        input.blur(); set(a, 'Mon projet');
      });
    });
  }

  /** The savings' own history, newest first (the wallet's is in the phone's Argent). */
  history() {
    const ctx = this.ctx; if (!ctx) return;
    const list = ctx.state.data.bank.tx.slice(-20).reverse();
    const html = list.length ? `<ul class="bk-hist">${list.map(t => `<li><span><b>${esc(t.label)}</b><small>Jour ${t.day}${when(t.at) ? ` · ${esc(when(t.at))}` : ''} · solde ${esc(F(t.balance))}</small></span><em class="${t.amount > 0 ? 'gain' : ''}">${esc(signed(t.amount))}</em></li>`).join('')}</ul>` : '';
    this.sheet('Historique', list.length ? 'Les mouvements de ton épargne (le portefeuille a les siens dans Argent)' : 'Aucune opération pour l’instant.', [{ icon: '↩️', label: 'Retour', onPick: () => this.home() }], html);
  }

  /**
   * « Demander conseil à la conseillère »: her advice from the real state. The conversation keeps the old action's social effect (its needs and counter),
   * once per player day: talking again the same day still gives the advice.
   */
  advise(place?: string, talk: Pick<Action, 'needs' | 'counter'> | undefined = CITY_ACTIONS.bank.find(x => x.id === 'conseiller')) {
    const ctx = this.ctx; if (!ctx) return;
    if (place) this.where = place.split(' · ')[1] ?? this.where;
    const s = ctx.state, d = s.data, a = talk;
    if (a && d.counters[ADVICE_KEY] !== d.play.day) {
      d.counters[ADVICE_KEY] = d.play.day;
      if (a.needs) s.adjust(a.needs);
      if (a.counter) s.count(a.counter);
      s.count('actions');
    }
    const lines = bankAdvice(s);
    this.log.ops.push('advice');
    this.sheet('La conseillère', '« Voilà ce que je vois dans tes comptes. »', [
      { icon: '🏦', label: isOpen(s) ? 'Mon épargne' : 'Ouvrir un compte', onPick: () => this.home() },
      { icon: '🙏', label: 'Merci', onPick: this.close },
    ], `<ul class="bk-advice">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`);
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    return {
      bank: {
        info: () => { const b = ctx.state.data.bank; return { ...b, tx: b.tx.map(t => ({ ...t })), refs: [...b.refs], milestones: [...b.milestones], goal: b.goal ? { ...b.goal } : null, wallet: ctx.state.data.wallet, day: ctx.state.data.play.day, log: { ...this.log, ops: [...this.log.ops], interest: [...this.log.interest], milestones: [...this.log.milestones] } }; },
        advice: () => bankAdvice(ctx.state),
        /** Checks: an operation with a given ref, as a confirmation would apply it (a ref already applied is refused). */
        replay: (kind: Kind, amount: number, ref: string) => { const r = kind === 'deposit' ? deposit(ctx.state, amount, { ref }) : withdraw(ctx.state, amount, { ref }); return r.ok ? { ok: true } : { ok: false, why: r.why }; },
        counter: (place = 'Banque Teranga · Pikine') => this.counter(place),
      },
    };
  }
}
export const bankModule = new BankModule();
