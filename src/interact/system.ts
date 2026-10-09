import type { Affordance, Target, TargetSource } from './types';

/**
 * One contextual interaction system for the whole world. Every frame it asks each source for the targets in reach and
 * focuses the best one: the closest, slightly preferring what is in front of the player, plus the target's bias.
 */
export class Interactions {
  focus: Target | null = null;
  private sources: TargetSource[] = [];
  private buf: Target[] = [];

  add(source: TargetSource) { this.remove(source.name); this.sources.push(source); return source; }
  remove(name: string) { this.sources = this.sources.filter(s => s.name !== name); }

  /** Picks the focused target. `facing` is the player's yaw (forward = sin/cos of it, as everywhere in the game). */
  update(space: string, x: number, z: number, facing: number): Target | null {
    const buf = this.buf; buf.length = 0;
    for (const s of this.sources) s.collect(space, x, z, buf);
    this.focus = pickTarget(buf, space, x, z, facing);
    return this.focus;
  }

  /** The action the main button runs: the first affordance that is available. */
  primary(target: Target | null = this.focus): Affordance | null { return primaryOf(target); }
  /** All affordances of the focused target (for the context sheet). */
  all(target: Target | null = this.focus): Affordance[] { return target ? target.affordances() : []; }
}

/** Ranking used by Interactions (exported for tests): distance + bias + up to 0.8 m when the target is behind. */
export function pickTarget(list: readonly Target[], space: string, x: number, z: number, facing: number): Target | null {
  let best: Target | null = null, bestScore = Infinity;
  const fx = Math.sin(facing), fz = Math.cos(facing);
  for (const t of list) {
    if (t.space !== space) continue;
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
    if (d > t.radius) continue;
    const ahead = d > 0.01 ? (dx * fx + dz * fz) / d : 1;          // 1 in front, −1 behind
    const score = d + (t.bias ?? 0) + (1 - ahead) * 0.4;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

export function primaryOf(target: Target | null): Affordance | null {
  if (!target) return null;
  const list = target.affordances();
  return list.find(a => !a.disabled) ?? list[0] ?? null;
}
