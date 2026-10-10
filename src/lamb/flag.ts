/**
 * Làmb 2.0 (« lutte avec frappe », docs/LAMB2.md) is built step by step behind this flag: `?lamb2` in the address, or
 * `localStorage['dakarrek.lamb2'] = '1'`. Without it every bout — the player's and the evening's watched bout — is the
 * sans-frappe one, as before. Read once.
 */
let on: boolean | null = null;
export function lamb2On(): boolean {
  if (on !== null) return on;
  try { on = new URLSearchParams(location.search).has('lamb2') || localStorage.getItem('dakarrek.lamb2') === '1'; } catch { on = false; }
  return on;
}
