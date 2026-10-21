import type { GameCtx, GameModule } from '../game/modules';
import { relate } from '../venues/venue';
import { fcfa } from '../ui/hud';
import { C, openLoans, settle, standing } from './credit';

/**
 * The debts' clock (src/economy/credit.ts): each new city day, every open debt is looked at once — a due date passed without enough repaid is a missed
 * date, the lender trusts the player a little less and says so (never more than once per date: the day looked at is saved with the debt). Nothing is ever
 * taken back. The day an installment falls due, a reminder.
 */
class CreditClock implements GameModule {
  readonly name = 'credit';
  private lastDay = -1;
  private log = { missed: 0, reminders: 0 };
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
