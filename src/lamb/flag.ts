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

/**
 * The bout, phase 1 (docs/wrestling/COMBAT.md): the player's own bout — friendly, ranked, the fighter's path, the écurie's
 * lesson and drills — in both disciplines is the new combat (grips, a balance with a direction, resistance, throws with
 * their set-up, a smart opponent, the fall rule). One switch turns it off and gives the bout as it was (Làmb 2.0 avec
 * frappe, the 2.6 s empoignade sans frappe):
 *
 * - `COMBAT_DEFAULT` is the default: **true** on this branch (the owner's mission: « the new bout is the player's bout »).
 * - `?combat0` in the address (or `localStorage['dakarrek.combat'] = '0'`) turns it off; `?combat1` (or `'1'`) turns it on.
 *   The address wins over the stored choice, `?combat0` over `?combat1`. Read once per page.
 * - Watched bouts (the evening's main event and preliminaries, AI against AI, seeded) never take it: they stay exactly
 *   what they were (tests/combatWatchedGolden.test.ts).
 */
export const COMBAT_DEFAULT = true;

/** Pure resolution of the combat switch: the address's query, the stored choice, the default. */
export function resolveCombat(search: string, stored: string | null, def: boolean = COMBAT_DEFAULT): boolean {
  const q = new URLSearchParams(search);
  if (q.has('combat0')) return false;
  if (q.has('combat1')) return true;
  if (stored === '0') return false;
  if (stored === '1') return true;
  return def;
}

let combat: boolean | null = null;
/** Is the new bout on for this page (resolved once)? */
export function combatOn(): boolean {
  if (combat !== null) return combat;
  let search = '', stored: string | null = null;
  try { search = location.search; } catch { /* no page (tests) */ }
  try { stored = localStorage.getItem('dakarrek.combat'); } catch { /* storage blocked */ }
  combat = resolveCombat(search, stored);
  return combat;
}
