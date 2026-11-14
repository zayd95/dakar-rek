import type { GameCtx, GameModule } from '../game/modules';
import { fcfa } from '../ui/hud';
import { ladderView, nextStep, payDue, type Payment } from './pouce';

/**
 * « Coups de pouce » in the game (the rules: src/economy/pouce.ts). Twice a second, while the player plays or reads a sheet, every step met and not
 * paid yet is paid (its mark and its wallet line together), the game saves at once, and one notice says it: « Coup de pouce : +10 000 F », what it
 * was for and the next one. Several at once (an older save's first look) make ONE notice. The goal line and the phone's list read the same rules.
 */
const lower1 = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
let acc = 0;

function notice(ctx: GameCtx, paid: Payment[]) {
  const total = paid.reduce((t, p) => t + p.amount, 0), next = nextStep(ctx.state);
  const then = next ? `Prochain coup de pouce : ${lower1(next.label)} (+${fcfa(next.amount)})` : 'C’était le dernier coup de pouce : la suite, c’est ton travail';
  ctx.hud.moment(paid.length === 1
    ? { icon: '🎁', title: `Coup de pouce : +${fcfa(total)}`, lines: [paid[0].step.label, then] }
    : { icon: '🎁', title: `Coups de pouce : +${fcfa(total)}`, lines: [`Pour ce que tu as déjà fait : ${paid.map(p => lower1(p.step.label)).join(', ')}`, then] }, 9000);
}

export const pouceModule: GameModule = {
  name: 'pouce',
  update(ctx, dt) {
    acc += dt; if (acc < 0.5) return; acc = 0;
    const mode = ctx.mode(); if (mode !== 'play' && mode !== 'menu') return;          // not in the middle of an activity or a scene: paid when it ends
    const paid = payDue(ctx.state); if (!paid.length) return;
    ctx.save();
    notice(ctx, paid);
  },
  debug: ctx => ({
    /** « Coups de pouce »: the ladder as the phone shows it (read-only). */
    pouce: () => ladderView(ctx.state, ctx.world()?.id ?? ctx.state.data.hub),
  }),
};
