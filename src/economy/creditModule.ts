import type { GameCtx, GameModule } from '../game/modules';
import type { LoanState } from '../core/types';
import { relate, relLevel } from '../venues/venue';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { phoneHooks } from '../ui/phoneHooks';
import { C, onPlayClock, openLoans, repay, settle, standing } from './credit';
import { noteWork } from './streakModule';

/**
 * The debts' clock (src/economy/credit.ts): each new day of the PLAYER's (SaveData.play: the days they play, never the ones that go by while they are away),
 * every open debt is looked at once — a due date passed with more behind than the lender's grace is a missed date, the lender trusts the player a little
 * less and says so (never more than once per date: the day looked at is saved with the debt). Nothing is ever taken back. The day an installment falls
 * due, a reminder. A debt signed in city days moves onto the player's days the first time it is looked at.
 */
/** The player's day (src/economy/streak.ts), the debts' calendar. */
export const playDay = (ctx: GameCtx) => ctx.state.data.play.day;
class CreditClock implements GameModule {
  readonly name = 'credit';
  private lastDay = -1;
  private log = { missed: 0, reminders: 0, repaid: 0 };
  init(ctx: GameCtx) { phoneHooks.openCredits = () => this.creditsApp(ctx); }

  /** The phone's « Crédits »: every debt, to whom, what is late and what is left; repaid from here like a mobile-money transfer. */
  creditsApp(ctx: GameCtx) {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); }, d = playDay(ctx), list = ctx.state.data.loans.list, open = openLoans(list), done = list.filter(l => l.status === 'closed');
    for (const l of open) onPlayClock(l, d);
    ctx.menu('Crédits', open.length ? `${open.length} crédit${open.length > 1 ? 's' : ''} en cours · confiance : Pape Sarr ${relLevel(ctx, 'sarr')}, Modou ${relLevel(ctx, 'modou')}` : 'Aucune dette en cours.', [
      ...open.map(l => { const st = standing(l, d); return { icon: l.lender === 'sarr' ? '🚗' : '🔧', label: l.label, detail: `${dueLine(st)} · remboursé ${fcfa(st.paid)} sur ${fcfa(l.principal)} (${st.pct} %)${l.kind === 'vehicle' && l.share !== false ? ` · ${Math.round(C.dealer.fareShare * 100)} % de chaque course VTC` : ''}`, right: `reste ${fcfa(st.left)}`, onPick: () => this.repayMenu(ctx, l) }; }),
      ...done.slice(-3).map(l => ({ icon: '✅', label: l.label, detail: `Remboursé${l.missed ? ` · ${l.missed} retard${l.missed > 1 ? 's' : ''}` : ' sans retard'}`, disabled: true, onPick: () => {} })),
      { icon: '↩️', label: 'Fermer', onPick: close },
    ]);
  }
  /** Repay a debt: the late part, one installment ahead, or all of it (never more than is owed, never more than the wallet holds). */
  repayMenu(ctx: GameCtx, l: LoanState) {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); }, st = standing(l, playDay(ctx));
    const opt = (label: string, amount: number, detail: string) => ({ icon: '💵', label, detail, right: '−' + fcfa(amount), disabled: amount <= 0 || !ctx.state.canAfford(amount), reason: amount > 0 && !ctx.state.canAfford(amount) ? 'Pas assez d’argent' : undefined, onPick: () => { close(); this.pay(ctx, l, amount); } });
    const some = [50_000, 200_000].filter(v => v < st.left && v > l.installment);
    ctx.menu(`Rembourser · ${l.label}`, `Remboursé ${fcfa(st.paid)} sur ${fcfa(l.principal)} (${st.pct} %) · reste ${fcfa(st.left)} · ${dueLine(st)}`, [
      ...(st.behind > 0 ? [opt('Rattraper le retard', Math.min(st.behind, st.left), st.late > 0 ? 'Ce qui aurait dû être payé' : 'Pas encore un retard : il patiente un peu')] : []),
      opt(`Verser ${fcfa(Math.min(l.installment, st.left))}`, Math.min(l.installment, st.left), 'Le versement du jour (d’avance, ça compte aussi)'),
      ...some.map(v => opt(`Verser ${fcfa(v)}`, v, 'Une belle avance sur ce qui reste')),
      ...(ctx.state.wallet < Math.min(l.installment, st.left) && ctx.state.wallet >= 1000 ? [opt('Verser ce que j’ai', Math.floor(Math.min(ctx.state.wallet, st.left) / 500) * 500, 'Une partie du versement : ça compte, le reste plus tard')] : []),
      opt('Tout rembourser', st.left, l.kind === 'vehicle' ? 'Et la voiture est entièrement à toi' : 'Et l’ardoise est effacée'),
      ...(l.kind === 'vehicle' ? [{ icon: l.share === false ? '⬜' : '✅', label: `${Math.round(C.dealer.fareShare * 100)} % de chaque course VTC à Pape Sarr`, detail: l.share === false ? 'Désactivé : tu verses toi-même' : 'Activé : chaque course rembourse un peu, sans y penser', onPick: () => { l.share = l.share === false; ctx.save(); this.repayMenu(ctx, l); } }] : []),
      { icon: '↩️', label: 'Pas maintenant', onPick: close },
    ]);
  }
  /** One repayment: one wallet line, the lender's trust (on time: a little more; all repaid: more), saved. Returns what was taken. */
  pay(ctx: GameCtx, l: LoanState, amount: number, quiet = false): number {
    const d = playDay(ctx), wasLate = standing(l, d).late > 0, who = l.lender === 'sarr' ? 'Pape Sarr' : 'Modou';
    if (l.status !== 'open' || amount <= 0 || !ctx.state.canAfford(amount)) return 0;
    const take = repay(l, amount, d); if (!take) return 0;
    ctx.state.addMoney(-take, `Remboursement : ${l.label}`); this.log.repaid += take;
    if (take >= 1000) noteWork('repay');                                        // a real repayment is a day's real work for the run of days
    if ((l.status as string) === 'closed') { relate(ctx, l.lender, C.trust.repaidAll); ctx.toast(`${who} : « Tout est réglé. ${say('Jërëjëf')}, tu es quelqu’un de parole. »`); }
    else { if (!wasLate) relate(ctx, l.lender, C.trust.paidOnTime); if (!quiet) ctx.toast(`Remboursé ${fcfa(take)} · reste ${fcfa(l.principal - l.paid)}`); }
    ctx.save();
    return take;
  }
  update(ctx: GameCtx) {
    const day = playDay(ctx); if (day === this.lastDay || day <= 0) return;
    const first = this.lastDay < 0; this.lastDay = day;
    for (const l of openLoans(ctx.state.data.loans.list)) {
      if (onPlayClock(l, day)) { if (l.lender === 'sarr' && l.kind === 'vehicle') ctx.toast(`Pape Sarr a revu ton crédit : ${fcfa(l.installment)} par jour de jeu, quand tu joues. Reste ${fcfa(l.principal - l.paid)}.`); continue; }
      const missed = settle(l, day), who = l.lender === 'sarr' ? 'Pape Sarr' : 'Modou';
      if (missed > 0) {
        relate(ctx, l.lender, C.trust.missed * missed); this.log.missed += missed;
        ctx.toast(`${who} attendait ${fcfa(standing(l, day).behind)} (${l.label}) : il te fera un peu moins confiance. Rembourse dès que tu peux.`);
      } else if (!first) {
        const st = standing(l, day);
        if (st.nextDay === day && st.next > 0) { this.log.reminders++; ctx.toast(`${who} : versement du jour ${fcfa(Math.min(st.next, l.installment))} · reste ${fcfa(st.left)} · ${l.label}`); }
      }
    }
  }
  debug(ctx: GameCtx): Record<string, unknown> {
    return { credit: { info: () => ({ day: playDay(ctx), loans: ctx.state.data.loans.list.map(l => ({ ...l, ...standing(l, playDay(ctx)) })), log: { ...this.log } }) } };
  }
}
export const creditClock = new CreditClock();
/** Where a debt stands, in one line: what is truly late, what is to catch up, or the next installment. */
function dueLine(st: ReturnType<typeof standing>): string {
  return st.late > 0 ? `en retard : ${fcfa(st.late)}` : st.behind > 0 ? `à rattraper : ${fcfa(st.behind)}` : st.next > 0 ? `prochain versement ${fcfa(st.next)}` : 'à jour';
}
