import type { GameCtx, GameModule } from '../game/modules';
import type { LoanState } from '../core/types';
import { relate, relLevel } from '../venues/venue';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { phoneHooks } from '../ui/phoneHooks';
import { C, openLoans, repay, settle, standing } from './credit';

/**
 * The debts' clock (src/economy/credit.ts): each new city day, every open debt is looked at once — a due date passed without enough repaid is a missed
 * date, the lender trusts the player a little less and says so (never more than once per date: the day looked at is saved with the debt). Nothing is ever
 * taken back. The day an installment falls due, a reminder.
 */
class CreditClock implements GameModule {
  readonly name = 'credit';
  private lastDay = -1;
  private log = { missed: 0, reminders: 0, repaid: 0 };
  init(ctx: GameCtx) { phoneHooks.openCredits = () => this.creditsApp(ctx); }

  /** The phone's « Crédits »: every debt, to whom, what is late and what is left; repaid from here like a mobile-money transfer. */
  creditsApp(ctx: GameCtx) {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); }, d = ctx.day(), list = ctx.state.data.loans.list, open = openLoans(list), done = list.filter(l => l.status === 'closed');
    ctx.menu('Crédits', open.length ? `${open.length} crédit${open.length > 1 ? 's' : ''} en cours · confiance : Pape Sarr ${relLevel(ctx, 'sarr')}, Modou ${relLevel(ctx, 'modou')}` : 'Aucune dette en cours.', [
      ...open.map(l => { const st = standing(l, d); return { icon: l.lender === 'sarr' ? '🚗' : '🔧', label: l.label, detail: st.late > 0 ? `En retard : ${fcfa(st.late)} · reste ${fcfa(st.left)}` : `Prochaine échéance ${fcfa(st.next)} (jour ${st.nextDay}) · reste ${fcfa(st.left)}`, right: fcfa(st.left), onPick: () => this.repayMenu(ctx, l) }; }),
      ...done.slice(-3).map(l => ({ icon: '✅', label: l.label, detail: `Remboursé${l.missed ? ` · ${l.missed} retard${l.missed > 1 ? 's' : ''}` : ' sans retard'}`, disabled: true, onPick: () => {} })),
      { icon: '↩️', label: 'Fermer', onPick: close },
    ]);
  }
  /** Repay a debt: the late part, one installment ahead, or all of it (never more than is owed, never more than the wallet holds). */
  repayMenu(ctx: GameCtx, l: LoanState) {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); }, st = standing(l, ctx.day());
    const opt = (label: string, amount: number, detail: string) => ({ icon: '💵', label, detail, right: '−' + fcfa(amount), disabled: amount <= 0 || !ctx.state.canAfford(amount), reason: amount > 0 && !ctx.state.canAfford(amount) ? 'Pas assez d’argent' : undefined, onPick: () => { close(); this.pay(ctx, l, amount); } });
    ctx.menu(`Rembourser · ${l.label}`, `Reste ${fcfa(st.left)} · ${st.late > 0 ? `en retard : ${fcfa(st.late)}` : `prochaine échéance ${fcfa(st.next)} le jour ${st.nextDay}`}`, [
      ...(st.late > 0 ? [opt('Payer le retard', st.late, 'Ce qui aurait dû être payé')] : []),
      opt('Payer une échéance', Math.min(l.installment, st.left), 'D’avance, ça compte aussi'),
      ...(ctx.state.wallet < Math.min(l.installment, st.left) && ctx.state.wallet >= 1000 ? [opt('Payer ce que j’ai', Math.floor(Math.min(ctx.state.wallet, st.left) / 500) * 500, 'Une partie de l’échéance : ça compte, le reste plus tard')] : []),
      opt('Tout rembourser', st.left, l.kind === 'vehicle' ? 'Et la voiture est entièrement à toi' : 'Et l’ardoise est effacée'),
      { icon: '↩️', label: 'Pas maintenant', onPick: close },
    ]);
  }
  /** One repayment: one wallet line, the lender's trust (on time: a little more; all repaid: more), saved. Returns what was taken. */
  pay(ctx: GameCtx, l: LoanState, amount: number): number {
    const d = ctx.day(), wasLate = standing(l, d).late > 0, who = l.lender === 'sarr' ? 'Pape Sarr' : 'Modou';
    if (l.status !== 'open' || amount <= 0 || !ctx.state.canAfford(amount)) return 0;
    const take = repay(l, amount, d); if (!take) return 0;
    ctx.state.addMoney(-take, `Remboursement : ${l.label}`); this.log.repaid += take;
    if ((l.status as string) === 'closed') { relate(ctx, l.lender, C.trust.repaidAll); ctx.toast(`${who} : « Tout est réglé. ${say('Jërëjëf')}, tu es quelqu’un de parole. »`); }
    else { if (!wasLate) relate(ctx, l.lender, C.trust.paidOnTime); ctx.toast(`Remboursé ${fcfa(take)} · reste ${fcfa(l.principal - l.paid)}`); }
    ctx.save();
    return take;
  }
  update(ctx: GameCtx) {
    const day = ctx.day(); if (day === this.lastDay) return;
    const first = this.lastDay < 0; this.lastDay = day;
    for (const l of openLoans(ctx.state.data.loans.list)) {
      const missed = settle(l, day), who = l.lender === 'sarr' ? 'Pape Sarr' : 'Modou';
      if (missed > 0) {
        relate(ctx, l.lender, C.trust.missed * missed); this.log.missed += missed;
        ctx.toast(`${who} attendait ${fcfa(standing(l, day).late)} (${l.label}) : il te fera un peu moins confiance. Rembourse dès que tu peux.`);
      } else if (!first) {
        const st = standing(l, day);
        if (st.nextDay === day + l.every && st.late === 0 && (day - l.openedDay) % l.every === 0 && day > l.openedDay) { this.log.reminders++; ctx.toast(`${who} : échéance de ${fcfa(l.installment)} réglée ou à régler aujourd’hui · ${l.label}`); }
      }
    }
  }
  debug(ctx: GameCtx): Record<string, unknown> {
    return { credit: { info: () => ({ day: ctx.day(), loans: ctx.state.data.loans.list.map(l => ({ ...l, ...standing(l, ctx.day()) })), log: { ...this.log } }) } };
  }
}
export const creditClock = new CreditClock();
