import { SCALE_NOTE } from '../geo/anchors';
import { tabsHtml } from './carteState';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Markup of the city map (filled by `mountGeoMap`): the map, the tabs laid over its top left, its two buttons and its status line. */
export function geoMapHtml(): string {
  return `<div class="gm" id="gm"><div class="gm-map" aria-label="Carte de Dakar"></div>
      <div class="cm-top">${tabsHtml()}</div>
      <div class="gm-btns"><button type="button" data-gm="me" aria-label="Me recentrer">◎</button><button type="button" data-gm="all" aria-label="Vue d’ensemble">⌂</button></div>
      <div class="gm-status" aria-live="polite">Chargement de la carte…</div></div>`;
}

/** Its caption (the card) and the scale note, one quiet line that opens on tap. */
export const geoCardHtml = () => `<div class="fm-card gm-card" data-pane="ville" aria-live="polite" hidden></div>
  <details class="gm-note" data-pane="ville" hidden><summary>Échelle et précision de la carte</summary><p>${esc(SCALE_NOTE)}</p></details>`;
