/**
 * « Mode développeur » (phone › Réglages › Avancé): the developer's tools stay out of a normal player's way. Kept on the device as
 * `localStorage['dakarrek.dev'] === '1'` (removed: off) — the same key the preview's own route launchers read — and announced with a
 * `dakar:devmode` window event when it changes. While on, `body.dev-mode` (the build tag at the bottom shows, like with `?debug`).
 */
const KEY = 'dakarrek.dev';
const store = () => { try { return window.localStorage; } catch { return null; } };
const read = () => { try { return store()?.getItem(KEY) === '1'; } catch { return false; } };
export const devMode = {
  get on(): boolean { return read(); },
  set(on: boolean) {
    try { if (on) store()?.setItem(KEY, '1'); else store()?.removeItem(KEY); } catch { /* session only */ }
    this.apply();
    try { window.dispatchEvent(new Event('dakar:devmode')); } catch { /* no window (tests) */ }
  },
  apply() { if (typeof document !== 'undefined') document.body.classList.toggle('dev-mode', read()); },
};
