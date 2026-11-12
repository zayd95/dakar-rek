/**
 * Keeping a page's sound alive on a phone. Three things an iPhone does that a desktop does not:
 *   – a context only starts (or restarts) from inside a real gesture: the end of a touch (`touchend`, `pointerup`), a click or a key, not at the START of a touch (`pointerdown`, `touchstart`);
 *   – the unlock is not forever: after a phone call, the lock screen or another tab the context is « suspended », or « interrupted » (Safari's own state, not in the standard), and must be resumed by the next gesture;
 *   – by default sound follows the silent switch (the ringer): a game that wants its horn heard while driving asks for a « playback » session (the Audio Session API, where it exists).
 * So the listeners stay for the whole life of the page (one property read per gesture while the context runs) and every gesture, and every return to the page, nudges the context back to « running ».
 */
export interface Resumable { state: string; resume(): Promise<void> | void }

/** A context that is not playing and may be started again (suspended, or interrupted on Safari). A closed one cannot. */
export function needsResume(state: string | undefined): boolean { return state === 'suspended' || state === 'interrupted'; }

/** Asks a context that stopped to resume (never throws, never waits). Whether it was asked. */
export function nudge(ctx: Resumable | null | undefined): boolean {
  if (!ctx || !needsResume(ctx.state)) return false;
  try { const p = ctx.resume(); if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { /* not allowed outside a gesture: the next one asks again */ }); } catch { /* no audio */ }
  return true;
}

/** The gestures that may start sound: the end of a touch counts, the start of one does not (kept in the list for browsers that do accept it). */
export const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/**
 * Listens for gestures and returns to the page; each one nudges the context (`create` makes it, inside the gesture, the first time). Returns the function that removes the listeners.
 * `onNudge` is told whenever a resume was asked (the diagnostics).
 */
export function keepAlive(win: Pick<Window, 'addEventListener' | 'removeEventListener'>, doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>,
  get: () => Resumable | null, create: () => Resumable | null, onNudge?: (why: string) => void): () => void {
  const gesture = (e: Event) => { const c = get() ?? create(); if (nudge(c)) onNudge?.(e.type); };
  const back = (e: Event) => { if (doc.visibilityState === 'hidden') return; if (nudge(get())) onNudge?.(e.type); };
  for (const t of GESTURES) win.addEventListener(t, gesture, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', back); win.addEventListener('pageshow', back); win.addEventListener('focus', back);
  return () => {
    for (const t of GESTURES) win.removeEventListener(t, gesture, true);
    doc.removeEventListener('visibilitychange', back); win.removeEventListener('pageshow', back); win.removeEventListener('focus', back);
  };
}

type Session = { type: string };
/** A « playback » audio session while driving, so the horn and the engine are not muted by the silent switch (iOS Safari 16.4+); back to « auto » after. Whether the browser has the API and accepted. */
export function setPlaybackSession(on: boolean, nav: object = typeof navigator === 'undefined' ? {} : navigator): boolean {
  const s = (nav as { audioSession?: Session }).audioSession; if (!s) return false;
  try { const want = on ? 'playback' : 'auto'; if (s.type !== want) s.type = want; return s.type === want; } catch { return false; }
}
export const sessionType = (nav: object = typeof navigator === 'undefined' ? {} : navigator): string => (nav as { audioSession?: Session }).audioSession?.type ?? 'unsupported';
