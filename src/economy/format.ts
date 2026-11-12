/**
 * Money formatting, French conventions, exact up to 10^15 and beyond (no exponent notation).
 * Full amounts in the phone and menus; a compact form (« 340 M F », « 1,25 Md F ») where space is short (HUD).
 */
const NNBSP = '\u202f', NBSP = '\u00a0';

/** Rounded absolute amount with grouped thousands (`sep` between groups). */
export function digits(n: number, sep = NNBSP): string {
  const r = Math.round(Math.abs(Number.isFinite(n) ? n : 0));
  return (r < 1e21 ? r.toString() : BigInt(r).toString()).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
const sign = (n: number) => (Math.round(n) < 0 ? '−' : '');

/** Full amount, the format of the HUD's fcfa() (src/ui/hud.ts): narrow no-break space between thousands,
 * no-break space before F. Pure logic, no DOM. */
export const fcfaText = (n: number) => sign(n) + digits(n) + NBSP + 'F';

/** From this amount on the HUD shows the compact form (the stat card is 150 px wide). */
export const COMPACT_FROM = 10_000_000;

/** Compact amount: three significant digits, rounded down (never shows more than the player has), comma decimal.
 * M = million, Md = milliard; above 10^12 the milliards are grouped (« 12 500 Md F »). Below COMPACT_FROM: full. */
export function fcfaShort(n: number): string {
  const a = Math.abs(Math.round(Number.isFinite(n) ? n : 0));
  if (a < COMPACT_FROM) return fcfaText(n);
  const [div, unit] = a >= 1e9 ? [1e9, 'Md'] : [1e6, 'M'];
  const v = a / div, dec = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const cut = Math.floor(v * 10 ** dec + 1e-9) / 10 ** dec;
  const [int, frac = ''] = cut.toFixed(dec).split('.');
  const f = frac.replace(/0+$/, '');
  return sign(n) + int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP) + (f ? ',' + f : '') + NBSP + unit + NBSP + 'F';
}

/** Multiplier with a comma decimal: ×1,6 · ×2. */
export const times = (m: number) => '×' + (Math.round(m * 100) / 100).toString().replace('.', ',');
