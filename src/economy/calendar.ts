import { CITY_EPOCH_MS } from '../core/clock';

/**
 * The ECONOMIC calendar (1.0.1): one economic month is seven real days. It is used ONLY by the monthly contracts (src/economy/monthly.ts): the
 * city's day and night still turn in 24 real minutes (src/core/clock.ts) and every other income and charge is still counted per city hour of play
 * (src/economy/assets.ts). A monthly amount is never tied to the fast clock: 50 000 F a month is 50 000 F every seven real days, played or not.
 *
 * The time read is the server's when the game is online (`presence.serverNow()`, wired by src/main.ts) and the device's otherwise. A device clock
 * can be set forward: what bounds it is in monthly.ts (a month is settled once, never again when the clock goes back; a capped catch-up; one batch
 * of settlements per half hour of play). It cannot be prevented while the wallet lives in the local save.
 */
export const REAL_DAY_MS = 86_400_000;
export const ECON_MONTH_DAYS = 7;
export const ECON_MONTH_MS = ECON_MONTH_DAYS * REAL_DAY_MS;

let clock: () => number = () => Date.now();
/** Checks only (?debug): economic time added to the clock (`__dakar.econAdvance`). Never saved. */
let shift = 0;
export const setEconClock = (fn: () => number) => { clock = fn; };
export const econNow = () => clock() + shift;
export const shiftEconClock = (ms: number) => { shift += ms; return shift; };

/** The global month a time falls in (counted from the city's epoch): what the tenant demand of a month is drawn from. */
export const econMonthAt = (ms: number) => Math.floor((ms - CITY_EPOCH_MS) / ECON_MONTH_MS);
/** The month of a contract a time falls in (0: the month it was signed for). */
export const contractMonthAt = (start: number, ms: number) => Math.max(0, Math.floor((ms - start) / ECON_MONTH_MS));

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « mar. 17 nov. · 14 h 05 », in the device's time zone. */
export function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}
/** « dans 3 jours », « dans 5 h », « maintenant ». */
export function inLabel(ms: number): string {
  if (ms <= 0) return 'maintenant';
  const h = ms / 3_600_000;
  if (h < 1) return `dans ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 36) return `dans ${Math.round(h)} h`;
  return `dans ${Math.round(h / 24)} jours`;
}
