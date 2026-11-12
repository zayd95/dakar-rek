/**
 * When did the tap under way begin? The time its finger (or the mouse button) went down — the input's own time, not when a busy frame got round to the
 * click — while a pointer gesture is under way (its pointerup within the last 3 s); otherwise now (the keyboard). A tap that began before a new screen
 * could be seen, or within `ms` of it, is the second half of a double tap aimed at the screen before: the bank's sheets and its phone screen drop it
 * (src/economy/bankModule.ts, src/ui/phone/apps/bank.ts), as the phone's shell does on a screen change.
 */
let downAt = -Infinity, upAt = -Infinity;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => { downAt = e.timeStamp; }, true);
  document.addEventListener('pointerup', e => { upAt = e.timeStamp; }, true);
}
export function tapStartedAt(now = performance.now()): number { return now - upAt < 3000 ? downAt : now; }
/** True when the tap under way began at least `ms` after `shownAt` (performance.now() when the screen appeared). */
export const tapSettled = (shownAt: number, ms = 320) => tapStartedAt() - shownAt >= ms;
