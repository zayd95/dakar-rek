import type { GameCtx } from '../game/modules';
import type { PlaceSpec } from '../activity/places';
import type { MenuItem } from '../ui/hud';
import type { VenueMaterials } from './kit';
import { Relations, PLAYER } from '../social/relations';
import { daylight } from '../core/clock';

/** A composed venue of the current hub (geometry + places + seats + roles + its own moments). */
export interface Venue {
  id: string;
  type: string;
  name: string;
  places: PlaceSpec[];
  update(dt: number): void;
  spaceChanged?(space: string): void;
  /** The venue's own presence / interaction space while the player is in it (a club's terrace), else null. */
  space?(): string | null;
  dispose(): void;
  debug(): Record<string, unknown>;
}

export interface VenueEnv {
  ctx: GameCtx;
  mats: VenueMaterials;
  lite: boolean;
  /** Bodies of the venue's street roles, for greetings. */
  addPeople(bodies: () => ReturnType<import('./cast').Cast['bodies']>): void;
}

/** 0 by day, 1 at night (same curve as the street lamps). */
export const nightOf = (hour: number) => 1 - Math.min(1, Math.max(0, daylight(hour) * 3.2));

export interface Choice { label: string; icon?: string; pick(): string | null }
/**
 * A short conversation in the place's bottom sheet: the person's line on top, the player's choices below; each choice
 * shows the answer in place of the line and keeps the choices (null closes the sheet).
 */
export function conversation(ctx: GameCtx, title: string, first: string, choices: Choice[]) {
  const show = (line: string) => ctx.menu(title, line, choices.map((c): MenuItem => ({ label: c.label, icon: c.icon, onPick: () => {
    const next = c.pick();
    if (next === null) ctx.hud.closeModal(); else show(next);
  } })));
  show(first);
}

/** Relationship with a venue's person (any id works with the shared relationship store). */
export const relate = (ctx: GameCtx, who: string, delta: number) => new Relations(ctx.state.data).change(PLAYER, who, delta);
export const relLevel = (ctx: GameCtx, who: string) => new Relations(ctx.state.data).level(who);
export const counter = (ctx: GameCtx, k: string) => ctx.state.data.counters[k] ?? 0;
