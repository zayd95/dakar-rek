import type { Gesture } from './types';

/**
 * Gestures played in the world itself instead of the card of src/ui/gesture.ts: the grill of a Dibi (src/venues/grillPlay.ts),
 * La Vague's dance floor (src/venues/dancePlay.ts). A venue registers its player when it is built and removes it with the
 * venue; the shared gesture player (src/ui/gesture.ts) asks here first and falls back to its card (a timing bar) when no
 * place can play the gesture right now — the activity, its pay and its hooks are the same either way (src/activity/runner.ts).
 */
export interface InWorldPlayer {
  readonly kind: 'grill' | 'dance';
  /** Whether this place can play the gesture now (the player is at this grill, on this floor). */
  accepts(g: Gesture): boolean;
  /**
   * Plays it; `done(score)` (0…1) is called exactly once when it ends by itself. The returned function aborts it
   * (no `done` afterwards): the activity was stopped.
   */
  play(g: Gesture, label: string, done: (score: number) => void): () => void;
  /** State for the checks (?debug), null when idle. */
  info(): Record<string, unknown> | null;
  /** Checks only: end now with this score, as if played. */
  finishNow(score: number): boolean;
}

const players = new Set<InWorldPlayer>();

/** Adds a place's player; returns the function that removes it (the venue's dispose). */
export function registerInWorld(p: InWorldPlayer): () => void {
  players.add(p);
  return () => { players.delete(p); };
}

/** The player that can play this gesture now, or null (then the card plays it). */
export function inWorldFor(g: Gesture): InWorldPlayer | null {
  if (g.kind !== 'grill' && g.kind !== 'dance') return null;
  for (const p of players) if (p.kind === g.kind && p.accepts(g)) return p;
  return null;
}

/**
 * Plays `g` in the world if a place can: `done` is called at most once (a player that reports twice, or reports after
 * being aborted, changes nothing), and the returned `abort` is a no-op once it has ended. Null: no place can, the card plays it.
 */
export function playInWorld(g: Gesture, label: string, done: (score: number) => void): { player: InWorldPlayer; abort: () => void; ended: () => boolean } | null {
  const player = inWorldFor(g); if (!player) return null;
  let over = false, stop: () => void = () => {};
  stop = player.play(g, label, score => { if (over) return; over = true; done(score); });
  return { player, ended: () => over, abort: () => { if (over) return; over = true; stop(); } };
}

/**
 * The HUD's focus contract (UX lane): while an in-world activity runs, `body[data-focus="activity"]` lets the HUD fade
 * what does not serve it. Counted, so two overlapping calls never clear each other's.
 */
let focusN = 0;
export function focusActivity(on: boolean) {
  if (typeof document === 'undefined') return;
  focusN = Math.max(0, focusN + (on ? 1 : -1));
  if (focusN > 0) document.body.dataset.focus = 'activity';
  else delete document.body.dataset.focus;
}
