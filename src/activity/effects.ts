import type { GameState } from '../core/state';
import type { ActivityCategory, Effects } from './types';

/** Hooks for the effects other modules own (relationships, flags, inventory, polyvalence). */
export interface EffectHooks {
  rel?(npc: string, delta: number): void;
  flag?(flag: string): void;
  item?(id: string, delta: number): void;
  category?(c: ActivityCategory): void;
}

/** Applies an activity's effects in one place; returns a short summary for a toast (« +1 200 F · Faim +40 »). */
export function applyEffects(state: GameState, e: Effects | undefined, label: string, hooks: EffectHooks = {}): string[] {
  if (!e) return [];
  const notes: string[] = [];
  if (e.money) { const done = state.addMoney(e.money, e.label ?? label); if (done) notes.push(`${done > 0 ? '+' : '−'}${fmt(Math.abs(done))} F`); }
  if (e.needs) state.adjust(e.needs);
  for (const [k, v] of Object.entries(e.counters ?? {})) state.count(k, v);
  for (const [k, v] of Object.entries(e.items ?? {})) hooks.item?.(k, v);
  for (const [k, v] of Object.entries(e.rel ?? {})) hooks.rel?.(k, v);
  for (const f of e.flags ?? []) hooks.flag?.(f);
  if (e.category) hooks.category?.(e.category);
  return notes;
}

/** Totals shown before choosing: what the activity costs and earns overall. */
export function totals(price = 0, steps: { effects?: Effects }[]): { cost: number; gain: number } {
  let cost = price, gain = 0;
  for (const s of steps) { const m = s.effects?.money ?? 0; if (m < 0) cost += -m; else gain += m; }
  return { cost, gain };
}

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
