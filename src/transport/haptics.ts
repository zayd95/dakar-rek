/**
 * Vibration of the phone, only where the browser has it. Chrome and Firefox on Android do (`navigator.vibrate`); **Safari on iPhone does not implement it, and nothing here pretends to**:
 * there the feel of a contact is carried by the sound, the jolt of the camera and of the body (src/transport/contact.ts). No undocumented tricks, no claim of vibration on a device without it.
 * A setting (Réglages › Vibrations, shown only where it can work) switches it off; the sound setting is separate.
 */
import { HORN_TICK, impactBuzz } from './hapticsRules';

const KEY = 'dakarrek.haptics';
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
let last = 0;

type Vibrator = { vibrate?: (p: number | number[]) => boolean };
/** Whether this browser can vibrate at all. */
export const canVibrate = (nav: Vibrator = typeof navigator === 'undefined' ? {} : navigator): boolean => typeof nav.vibrate === 'function';
export const hapticsOn = () => on;
export function setHaptics(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* kept for this session only */ } }

/** A buzz, when the browser can, the setting is on and the last one is over (a browser may drop or merge buzzes closer than ~100 ms). Whether one was asked of the device. */
export function buzz(pattern: number | number[], nav: Vibrator = typeof navigator === 'undefined' ? {} : navigator, now = typeof performance === 'undefined' ? 0 : performance.now()): boolean {
  if (!on || !canVibrate(nav) || now - last < 100) return false;
  try { const ok = nav.vibrate!(pattern); if (ok) last = now; return ok; } catch { return false; }
}
export const _resetHaptics = () => { last = 0; };
export { HORN_TICK, impactBuzz as impactPattern };
