/** Ignore thumb tremor near the joystick centre, easing into the unchanged outer response. */
export const STICK_DEAD_ZONE = 0.12;
export function stickMagnitude(magnitude: number): number {
  const m = Math.min(1, Math.max(0, magnitude));
  if (m <= STICK_DEAD_ZONE) return 0;
  if (m >= STICK_DEAD_ZONE * 2) return m;
  const t = (m - STICK_DEAD_ZONE) / STICK_DEAD_ZONE;
  return m * t * t * (3 - 2 * t);
}
