/**
 * Shared city clock. One city day = 24 real minutes (1 city hour = 1 real minute).
 * Derived from a fixed epoch so every client agrees. PARTIAL: uses the device clock until the
 * server supplies authoritative time (design doc, Time systems).
 */
export const CITY_EPOCH_MS = Date.UTC(2026, 9, 6, 0, 0, 0);
export const CITY_DAY_MS = 24 * 60 * 1000;

export interface CityTime { day: number; hour: number; minute: number; hourFloat: number; isNight: boolean; label: string }

export function cityTimeAt(nowMs: number): CityTime {
  const elapsed = Math.max(0, nowMs - CITY_EPOCH_MS);
  const day = Math.floor(elapsed / CITY_DAY_MS) + 1;
  const hourFloat = ((elapsed % CITY_DAY_MS) / CITY_DAY_MS) * 24;
  const hour = Math.floor(hourFloat);
  const minute = Math.floor((hourFloat - hour) * 60);
  return { day, hour, minute, hourFloat, isNight: hourFloat < 6 || hourFloat >= 19, label: `Jour ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

/** Sun elevation factor 0..1 for lighting from a city hour. */
export function daylight(hourFloat: number): number {
  const t = (hourFloat - 6) / 13; // sunrise 6h, sunset 19h
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI);
}
