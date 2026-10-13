import type { GameState } from '../core/state';
import type { ActivityCategory, Effects } from './types';

/** Hooks for the effects other modules own (relationships, flags, inventory, polyvalence). */
export interface EffectHooks {
  rel?(npc: string, delta: number): void;
  flag?(flag: string): void;
  item?(id: string, delta: number): void;
  /** The activity's category was practised (the economy's polyvalence counts the variety). Called before the pay. */
  category?(c: ActivityCategory): void;
  /** Money earned by an activity of this category, as paid (the economy scales work pay with polyvalence). */
  pay?(money: number, c: ActivityCategory | null): number;
  /** What `pay` would give if the activity were done now (shown before choosing). */
  payPreview?(money: number, c: ActivityCategory | null): number;
}

/** Applies an activity's effects in one place; returns a short summary for a toast (« +1 200 F · Faim +40 »). */
export function applyEffects(state: GameState, e: Effects | undefined, label: string, hooks: EffectHooks = {}): string[] {
  if (!e) return [];
  const notes: string[] = [];
  if (e.category) hooks.category?.(e.category);
  if (e.money) {
    const amount = e.money > 0 && hooks.pay ? hooks.pay(e.money, e.category ?? null) : e.money;
    const done = state.addMoney(amount, e.label ?? label);
    if (done) notes.push(`${done > 0 ? '+' : '−'}${fmt(Math.abs(done))} F`);
  }
  if (e.needs) state.adjust(e.needs);
  for (const [k, v] of Object.entries(e.counters ?? {})) state.count(k, v);
  for (const [k, v] of Object.entries(e.items ?? {})) hooks.item?.(k, v);
  for (const [k, v] of Object.entries(e.rel ?? {})) hooks.rel?.(k, v);
  for (const f of e.flags ?? []) hooks.flag?.(f);
  return notes;
}

/** Totals shown before choosing: what the activity costs and earns overall (earnings as `preview` would pay them). */
export function totals(price = 0, steps: { effects?: Effects }[], preview?: (money: number, c: ActivityCategory | null) => number): { cost: number; gain: number } {
  let cost = price, gain = 0;
  for (const s of steps) { const m = s.effects?.money ?? 0; if (m < 0) cost += -m; else if (m > 0) gain += preview ? preview(m, s.effects?.category ?? null) : m; }
  return { cost, gain };
}

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
