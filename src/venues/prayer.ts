/**
 * The five daily prayer times, by their everyday Wolof names, in city hours (the game's own approximate Dakar times;
 * no religious text). The mosque fills up around them and the NPC activity system can read the same windows
 * (`prayerPeaks`, also stored as the mosque place's `peaks`).
 */
export interface PrayerTime { id: string; name: string; hour: number }
export const PRAYER_TIMES: readonly PrayerTime[] = [
  { id: 'fajar', name: 'Fajar', hour: 6 },
  { id: 'tisbaar', name: 'Tisbaar', hour: 14 },
  { id: 'takusaan', name: 'Takusaan', hour: 17 },
  { id: 'timis', name: 'Timis', hour: 19.25 },
  { id: 'gee', name: 'Gee', hour: 20.5 },
];
/** City hours before and after a prayer time when the congregation gathers (one city hour = one real minute). */
export const PRAYER_WINDOW: readonly [number, number] = [0.5, 1];

const wrap = (h: number) => ((h % 24) + 24) % 24;

/** Windows [from, to) around every prayer time. */
export const prayerPeaks = (): [number, number][] => PRAYER_TIMES.map(p => [wrap(p.hour - PRAYER_WINDOW[0]), wrap(p.hour + PRAYER_WINDOW[1])]);

/** The prayer the congregation gathers for at city hour h (the closest one when two windows overlap), or null. */
export function prayerAt(h: number): PrayerTime | null {
  let best: PrayerTime | null = null, bd = Infinity;
  for (const p of PRAYER_TIMES) {
    const d = wrap(h - p.hour + 12) - 12;                  // signed distance, −12…12
    if (d < -PRAYER_WINDOW[0] || d >= PRAYER_WINDOW[1]) continue;
    if (Math.abs(d) < bd) { bd = Math.abs(d); best = p; }
  }
  return best;
}

/** The next prayer time strictly after h (wraps to Fajar after Gee). */
export function nextPrayer(h: number): PrayerTime {
  const t = wrap(h);
  return PRAYER_TIMES.find(p => p.hour > t) ?? PRAYER_TIMES[0];
}

/** « 19 h 15 », « 6 h ». */
export function hourLabel(h: number): string {
  const hh = Math.floor(wrap(h)), mm = Math.round((wrap(h) - hh) * 60);
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}
