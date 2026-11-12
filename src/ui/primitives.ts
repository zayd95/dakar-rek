import './tokens.css';
import './primitives.css';
import { glyphEl } from './glyphs';

/**
 * Small DOM builders for the shared UI (tokens.css, primitives.css, docs/UI-PRIMITIVES.md). Presentation only: they take what to
 * show and a callback, and never read the game. The Tiak Tiak delivery cards and the shop rows are made from the same tokens.
 */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e;
};

/** Tone of a price string: « +1 500 F » gains, « −400 F » costs, anything else (« ✓ », « Payer ») neutral. */
export const priceTone = (text: string): 'gain' | 'cost' | '' => (/^\+/.test(text) ? 'gain' : /^[−-]\s?\d/.test(text) ? 'cost' : '');

/** A price: green for a gain, ink for a cost, tabular figures. `xl` for the big reward of a card. A cost is shown without its sign (« 400 F »). */
export function priceTag(text: string, xl = false): HTMLElement {
  const tone = priceTone(text);
  return el('em', `ui-price ${tone}${xl ? ' xl' : ''}`.trim(), tone === 'cost' ? text.replace(/^[−-]\s?/, '') : text);
}

/** The primary button: a yellow bar, one verb. */
export function primaryButton(label: string, onPick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'ui-btn' + (disabled ? ' is-disabled' : ''), label);
  b.type = 'button';
  if (disabled) b.setAttribute('aria-disabled', 'true'); else b.addEventListener('click', onPick);
  return b;
}

/** The gold star of an action that belongs to the player's current objective. */
export function starEl(): HTMLElement {
  const s = el('span', 'ui-star');
  s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Objectif en cours'); s.title = 'Objectif en cours';
  const g = glyphEl('star'); if (g) s.append(g); else s.textContent = '⭐';
  return s;
}

export interface RowOptions {
  /** Line icon name (src/ui/glyphs.ts), else the emoji. */
  glyph?: string; icon?: string;
  label: string;
  /** « −400 F », « +1 500 F ». */
  price?: string;
  disabled?: boolean; selected?: boolean;
  /** The action belongs to the current objective: a gold star after the label. */
  objective?: boolean;
  /** Said in full to a screen reader or on long-press, even when the row shows less. */
  title?: string;
  onPick: () => void;
  /** Called instead of `onPick` when a disabled row is tapped (the sheet shakes it and says why). */
  onDeny?: (row: HTMLElement) => void;
  /** The price this row replaces, struck through before `price`. */
  was?: string;
}

/** A one-line action row: line icon, label (and the objective star), the price, a chevron. Keeps the sheet's `.item` hook. */
export function shopRow(o: RowOptions): HTMLButtonElement {
  const b = el('button', 'item ui-line' + (o.disabled ? ' dis is-disabled' : '') + (o.selected ? ' is-selected' : '') + (o.objective ? ' is-objective' : ''));
  b.type = 'button';
  if (o.title) b.title = o.title;
  const g = glyphEl(o.glyph);
  if (g) { const w = el('span', 'ui-ic'); w.append(g); b.append(w); }
  else if (o.icon) { const w = el('span', 'ui-ic', o.icon); w.setAttribute('aria-hidden', 'true'); b.append(w); }
  const tx = el('div', 'tx');
  tx.append(el('span', 'lb', o.label));
  if (o.objective) tx.append(starEl());
  b.append(tx);
  if (o.was) { const w = el('s', 'ui-was', o.was); w.setAttribute('aria-label', 'avant ' + o.was); b.append(w); }
  if (o.price) b.append(priceTag(o.price));
  const ch = glyphEl('chevron'); if (ch) { const w = el('span', 'ui-chev'); w.append(ch); b.append(w); }
  if (o.selected) b.setAttribute('aria-current', 'true');
  if (o.disabled) { b.setAttribute('aria-disabled', 'true'); b.addEventListener('click', () => o.onDeny?.(b)); }
  else b.addEventListener('click', o.onPick);
  return b;
}
