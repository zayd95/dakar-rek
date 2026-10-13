/**
 * Làmb 2.0 (« lutte avec frappe », docs/LAMB2.md) or the old làmb (« sans frappe »): one switch for the whole game.
 *
 * - `LAMB2_DEFAULT` is the game's default. It is false today: every bout is the sans-frappe one unless `?lamb2` is in
 *   the address (or `localStorage['dakarrek.lamb2'] = '1'`). Flipping it to true makes Làmb 2.0 the game's làmb
 *   (docs/LAMB2.md « La bascule » lists what changes); `?lamb1` (or `localStorage['dakarrek.lamb2'] = '0'`) then forces
 *   the old làmb.
 * - The address wins over the stored choice; `?lamb1` wins over `?lamb2`. Read once per page.
 */
export const LAMB2_DEFAULT = false;

/** Pure resolution of the switch: the address's query (`location.search`), the stored choice, the default. */
export function resolveLamb2(search: string, stored: string | null, def: boolean = LAMB2_DEFAULT): boolean {
  const q = new URLSearchParams(search);
  if (q.has('lamb1')) return false;
  if (q.has('lamb2')) return true;
  if (stored === '0') return false;
  if (stored === '1') return true;
  return def;
}

let on: boolean | null = null;
/** Is Làmb 2.0 on for this page (resolved once)? */
export function lamb2On(): boolean {
  if (on !== null) return on;
  let search = '', stored: string | null = null;
  try { search = location.search; } catch { /* no page (tests) */ }
  try { stored = localStorage.getItem('dakarrek.lamb2'); } catch { /* storage blocked */ }
  on = resolveLamb2(search, stored);
  return on;
}
