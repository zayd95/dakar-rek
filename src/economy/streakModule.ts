import type { GameCtx, GameModule } from '../game/modules';
import { relate } from '../venues/venue';
import { phoneHooks } from '../ui/phoneHooks';
import { PERK_TEXT, STREAK, advancePlay, creditWork, perks, runLabel, runOf, type Credit, type WorkKind } from './streak';
import { workCard, type Card, type WorkDone } from './workCard';
import { radio } from '../transport/radio';

/**
 * The player's days and the run of days worked (rules: src/economy/streak.ts), and the card after each job (src/economy/workCard.ts).
 *   – Every frame: the player's day moves on when the city day changes (while playing, or on coming back).
 *   – `note(kind)`: a piece of real work was paid or done (a delivery, a VTC ride, a shift, a dealer's errand, a repayment, a bout). Called by the systems
 *     that pay it, after they paid it once.
 *   – `done(work)`: a Tiak or VTC job is finished and paid: the card (what, where, paid, how long, how far, the run, one line on how it went). It never pays.
 *   – A milestone (2, 3, 5, 7 days) gets its short card once the job's card is gone, saying what it opens. At 3 days, Pape Sarr's trust rises once.
 * The distance of a job is measured here: the player's way (on foot, ridden or driven) from the moment the job is seen in hand.
 */
class StreakModule implements GameModule {
  readonly name = 'streak';
  private ctx: GameCtx | null = null;
  /** Played time at which the player came back after a real absence (≥ 10 min since the save): the first work after it counts without the gap rule. */
  private back = Infinity;
  private meter = 0; private last: { x: number; z: number; hub: string | null } | null = null;
  /** Jobs in hand: the meter, played time and bumps when they were first seen. */
  private open = new Map<string, { m: number; ms: number; bumps: number }>();
  private bumps = 0;
  private log = { credits: [] as { kind: WorkKind; day: number; run: number; counted: boolean; why: string }[], cards: [] as { title: string; rows: string[]; next: string[] }[], milestones: [] as number[] };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    const d = ctx.state.data;
    if (d.savedAt && Date.now() - d.savedAt > 10 * 60_000) this.back = d.playedMs;
    phoneHooks.streakProfile = () => this.profileRows(ctx);
  }

  update(ctx: GameCtx) {
    const d = ctx.state.data;
    advancePlay(d.play, ctx.day());
    // the way travelled (a jump of more than 25 m in one frame is a teleport, a district's swap or a trip by map: not counted)
    const p = ctx.player.pos, hub = ctx.world()?.id ?? null;
    if (this.last && this.last.hub === hub) { const step = Math.hypot(p.x - this.last.x, p.z - this.last.z); if (step < 25) this.meter += step; }
    this.last = { x: p.x, z: p.z, hub };
    // the jobs in hand: their start is the first frame they are seen
    const keys: string[] = [];
    if (d.jobs.active) keys.push(`tiak:${d.jobs.active.runId}`);
    if (d.vtc.active) keys.push(`vtc:${d.vtc.active.id}`);
    for (const k of keys) if (!this.open.has(k)) this.open.set(k, { m: this.meter, ms: d.playedMs, bumps: this.bumps });
  }

  /** A knock with the vehicle (src/transport/ownedModule.ts): counted against the « sans accroc » of the job in hand. */
  bump() { this.bumps++; }

  /** Real work was done and paid once: the day counts (or not, and why). */
  note(kind: WorkKind): Credit | null {
    const ctx = this.ctx; if (!ctx) return null;
    const d = ctx.state.data;
    advancePlay(d.play, ctx.day());
    const c = creditWork(d.streak, d.play.day, d.playedMs, this.back);
    this.log.credits.push({ kind, day: d.play.day, run: c.run, counted: c.counted, why: c.why });
    if (this.log.credits.length > 40) this.log.credits.shift();
    if (c.counted && c.milestone === 3 && c.first) relate(ctx, 'sarr', 5);              // « un peu plus de confiance chez Pape Sarr », once
    if (c.milestone) this.pendingMilestone = c;
    ctx.save();
    if (!this.carding) this.flushMilestone();
    return c;
  }

  private pendingMilestone: Credit | null = null;
  private carding = false;
  /** A Tiak or VTC job finished and paid: the day is noted and the card shown. `key`: the job's own key (`tiak:<run>`, `vtc:<id>`). */
  done(key: string, w: Omit<WorkDone, 'ms' | 'metres' | 'bumps'> & { ms?: number }, extra: Card['rows'] = []) {
    const ctx = this.ctx; if (!ctx) return;
    const o = this.open.get(key); this.open.delete(key);
    const work: WorkDone = { ...w, ms: w.ms ?? (o ? ctx.state.data.playedMs - o.ms : 0), metres: o ? this.meter - o.m : 0, bumps: o ? this.bumps - o.bumps : 0 };
    this.carding = true;
    const c = this.note(w.kind === 'vtc' ? 'vtc' : 'tiak');
    const card = workCard(work, c, runOf(ctx.state.data), extra);
    this.log.cards.push({ title: card.title, rows: card.rows.map(r => `${r.k}: ${r.v}${r.note ? ` (${r.note})` : ''}`), next: card.next });
    if (this.log.cards.length > 20) this.log.cards.shift();
    ctx.hud.boutCard(card, 7000);
    radio.duck(0.45, 3.5);                                                          // the car's radio steps back while the card speaks
    this.carding = false;
    this.flushMilestone();
    for (const f of workDoneListeners) f(w.kind, 7000);
  }

  private flushMilestone() {
    const c = this.pendingMilestone, ctx = this.ctx; if (!c || !ctx || !c.milestone) return;
    this.pendingMilestone = null; this.log.milestones.push(c.milestone);
    const opens = PERK_TEXT[c.milestone];
    ctx.hud.moment({ icon: '🔥', title: `${runLabel(c.milestone)} !`, lines: c.first ? [opens, 'Tant que la série tient, sans jamais être la seule façon d’y arriver.'] : [opens] }, c.first ? 8000 : 4500);
  }

  /** The « Profil » screen's lines: the run, the best, the days worked, what the run opens now and next. */
  profileRows(ctx: GameCtx): { label: string; detail: string }[] {
    const d = ctx.state.data, run = runOf(d), p = perks(run), next = STREAK.milestones.find(m => m > run);
    const rows = [
      { label: `Série · ${runLabel(run)}`, detail: `Meilleure série : ${runLabel(d.streak.best)} · jours actifs en tout : ${d.streak.total}${d.streak.grace > 0 && run > 0 ? ' · un jour manqué te serait pardonné' : ''}` },
    ];
    const open = STREAK.milestones.filter(m => run >= m).map(m => PERK_TEXT[m]);
    if (open.length) rows.push({ label: 'Ce que ta série t’ouvre', detail: open.join(' ') });
    if (next) rows.push({ label: `À ${runLabel(next)}`, detail: PERK_TEXT[next] });
    if (!p.known) rows.push({ label: 'Comment ça marche', detail: 'Un jour compte quand tu as vraiment travaillé : une livraison, une course VTC, un service payé, un coup de main à un vendeur, un remboursement.' });
    return rows;
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    return {
      streak: {
        info: () => ({ play: { ...ctx.state.data.play }, streak: { ...ctx.state.data.streak, seen: [...ctx.state.data.streak.seen] }, run: runOf(ctx.state.data), perks: perks(runOf(ctx.state.data)), meter: Math.round(this.meter), back: this.back, log: { credits: [...this.log.credits], cards: [...this.log.cards], milestones: [...this.log.milestones] } }),
        /** Checks: the player's next day, as if a city day had gone by (labelled: a debug shortcut for the days a journey cannot wait for). */
        nextDay: () => { const p = ctx.state.data.play; p.day += 1; p.city = ctx.day(); return p.day; },
        /** Checks: the played time moves on (the gap between two counted days), labelled like nextDay. */
        later: (ms = STREAK.minGapMs) => { ctx.state.data.playedMs += ms; return ctx.state.data.playedMs; },
      },
    };
  }
}
const workDoneListeners: ((kind: WorkDone['kind'], cardMs: number) => void)[] = [];
/** A Tiak or VTC job was finished, paid and its card shown for `cardMs` (« Mes pistes » waits for it: src/economy/pistesModule.ts). */
export const onWorkDone = (f: (kind: WorkDone['kind'], cardMs: number) => void) => { workDoneListeners.push(f); };
export const streak = new StreakModule();
/** Real work was done and paid (see StreakModule.note). */
export const noteWork = (kind: WorkKind) => streak.note(kind);
