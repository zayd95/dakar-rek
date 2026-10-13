/**
 * Day / night appearance of the interface (the phone's Réglages « Apparence »). Auto follows the city's own hour: the
 * screen goes dark when the sun is down in the game (19 h – 6 h). The choice is kept on the device. DOM class only
 * (`body.theme-night`, src/ui/theme.css): no per-frame work beyond comparing two booleans.
 */
export type ThemeMode = 'auto' | 'day' | 'night';
const KEY = 'dakarrek.ui.theme';
const store = () => { try { return localStorage; } catch { return null; } };

/** Night in the city: from 19 h to 6 h. */
export const isNightHour = (hour: number) => { const h = ((hour % 24) + 24) % 24; return h >= 19 || h < 6; };
/** Whether the screen is dark for a mode and a city hour. */
export const nightFor = (mode: ThemeMode, hour: number) => mode === 'night' || (mode === 'auto' && isNightHour(hour));

export const theme = {
  hour: 12,
  night: false,
  get mode(): ThemeMode { const m = store()?.getItem(KEY); return m === 'day' || m === 'night' ? m : 'auto'; },
  setMode(m: ThemeMode) { try { if (m === 'auto') store()?.removeItem(KEY); else store()?.setItem(KEY, m); } catch { /* session only */ } this.apply(); },
  /** Called with the city hour (every frame is fine: the class changes only when the answer does). */
  follow(hour: number) { this.hour = hour; this.apply(); },
  apply() {
    const night = nightFor(this.mode, this.hour);
    if (night === this.night && document.body.classList.contains('theme-night') === night) return;
    this.night = night;
    document.body.classList.toggle('theme-night', night);
  },
};
