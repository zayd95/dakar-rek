import { SCALE_NOTE } from '../geo/anchors';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Markup of the tab (filled by `mountGeoMap`). */
export function geoMapHtml(): string {
  return `<div class="gm" id="gm"><div class="gm-map" aria-label="Carte de Dakar"></div>
      <div class="gm-btns"><button type="button" data-gm="me" aria-label="Me recentrer">◎</button><button type="button" data-gm="all" aria-label="Vue d’ensemble">⌂</button></div>
      <div class="gm-status" aria-live="polite">Chargement de la carte…</div></div>
    <div class="gm-side"><div class="fm-card gm-card" aria-live="polite"></div>
      <details class="gm-note"><summary>Échelle et précision de la carte</summary><p>${esc(SCALE_NOTE)}</p></details></div>`;
}
