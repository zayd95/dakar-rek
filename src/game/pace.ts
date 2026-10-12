import { WALL_H, WALL_R } from '../world/geew';

/**
 * Systems whose output nobody can see wait between updates, with the time gone by (docs/PERF_EVENING.md « Headroom »).
 *
 * Seated on the tiers the player is inside the arena's walls: the street outside (its walkers and traffic, the fans
 * queueing, the arrivals, the venues' people, the car rapide line) cannot be seen, and the shared humanoid budget does
 * not draw it. It lives on, but at 4 Hz instead of at every frame: a system is called with the seconds it is owed, as
 * every one of them already is by a long frame (the main loop caps dt at 0.1 s; the browser check's frames last 0.1 s).
 */
export const HIDDEN_EVERY = 0.25;

/**
 * This frame's step for a system owed `owed` seconds: the time to update it with (null: not yet) and what it is owed
 * after. `every` 0 (or less): every frame, at once and with what it was owed.
 */
export function paceStep(owed: number, dt: number, every: number): [number | null, number] {
  const t = owed + dt;
  return every > 0 && t < every ? [null, t] : [t, 0];
}

/** The time owed to one system. */
export class Pace {
  private owed = 0;
  /** The seconds to update with now, or null: not yet. `every` as in `paceStep`. */
  step(dt: number, every: number): number | null {
    const [run, owed] = paceStep(this.owed, dt, every);
    this.owed = owed;
    return run;
  }
  reset() { this.owed = 0; }
}

/** The time owed to each of several systems (by name), for the main loop and the host that mirrors it. */
export class Pacer {
  private owed = new Map<string, number>();
  /** The seconds to update `name` with now, or null: not yet. `every` as in `paceStep`. */
  step(name: string, dt: number, every: number): number | null {
    const [run, owed] = paceStep(this.owed.get(name) ?? 0, dt, every);
    this.owed.set(name, owed);
    return run;
  }
  /** Forget what is owed (a new hub: nothing is behind). */
  reset() { this.owed.clear(); }
}

/** The camera is inside the arena's walls (on the tiers, in the ring): the street outside cannot be seen. */
export function insideWalls(arena: { cx: number; cz: number } | null | undefined, cam: { x: number; y: number; z: number }): boolean {
  return !!arena && Math.hypot(cam.x - arena.cx, cam.z - arena.cz) < WALL_R - 0.3 && cam.y < WALL_H + 3;
}

/** The update interval of what the street outside does: every frame, or HIDDEN_EVERY while the camera is inside the walls. */
export const hiddenEvery = (arena: { cx: number; cz: number } | null | undefined, cam: { x: number; y: number; z: number }) =>
  insideWalls(arena, cam) ? HIDDEN_EVERY : 0;
