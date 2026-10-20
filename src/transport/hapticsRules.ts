/** The buzz of a contact, in milliseconds on/off/on…: a bump is a tick, a hit a thump that lasts longer and is stronger the harder it was; a press of the horn is a short tick. */
export const HORN_TICK = 8;
export function impactBuzz(kind: 'bump' | 'hit', strength: number): number | number[] {
  if (kind === 'bump') return 12;
  const k = Math.max(0, Math.min(1, strength));
  return [25 + Math.round(45 * k), 30, 15 + Math.round(35 * k)];
}
