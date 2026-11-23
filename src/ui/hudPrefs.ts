/**
 * « HUD compact » (phone › Réglages › Affichage): a quieter game screen — the wallet without the needs' rings (they come back when one runs low), no
 * mini-map on foot unless a goal is set, no online pill, smaller chips. A device preference kept in localStorage (never in the save). DOM class only:
 * `body.hud-compact` (src/ui/style.css).
 */
const KEY = 'dakarrek.ui.hudCompact';
const store = () => { try { return window.localStorage; } catch { return null; } };

const read = (): boolean => { try { return store()?.getItem(KEY) === 'on'; } catch { return false; } };
const apply = (on: boolean) => { if (typeof document !== 'undefined') document.body.classList.toggle('hud-compact', on); };
export const hudPrefs = {
  get compact(): boolean { return read(); },
  setCompact(on: boolean) {
    try { if (on) store()?.setItem(KEY, 'on'); else store()?.removeItem(KEY); } catch { /* session only */ }
    apply(on);
  },
  /** Puts the saved choice on the page (the HUD calls it once when it is built). */
  apply() { apply(read()); },
};
