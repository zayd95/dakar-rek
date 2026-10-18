import './tokens.css';
import './primitives.css';
import { glyphEl } from './glyphs';

/**
 * Small DOM builders for the shared UI (tokens.css, primitives.css, docs/UI-PRIMITIVES.md). Presentation only: they take what to
 * show and a callback, and never read the game. The Tiak Tiak delivery cards and the shop cards are made from the same tokens.
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

/** The primary button: a yellow bar, one verb. `quiet`: ink on the card colour (a light pill at night, a dark one by day). */
export function primaryButton(label: string, onPick: () => void, opts: { disabled?: boolean; quiet?: boolean } = {}): HTMLButtonElement {
  const b = el('button', 'ui-btn' + (opts.quiet ? ' quiet' : '') + (opts.disabled ? ' is-disabled' : ''), label);
  b.type = 'button';
  if (opts.disabled) b.setAttribute('aria-disabled', 'true'); else b.addEventListener('click', onPick);
  return b;
}

export interface CardOptions {
  /** Line icon name (src/ui/glyphs.ts), else the emoji. */
  glyph?: string; icon?: string;
  label: string;
  /** One short line under the label: a kind (« Petit boulot ») or, when unavailable, the reason. */
  tag?: string;
  /** « −400 F », « +1 500 F ». */
  price?: string;
  disabled?: boolean; selected?: boolean;
  /** Said in full to a screen reader or on long-press, even when the card shows less. */
  title?: string;
  onPick: () => void;
  /** Called instead of `onPick` when a disabled card is tapped (the sheet shakes it and says why). */
  onDeny?: (card: HTMLElement) => void;
}

function head(o: CardOptions): HTMLElement[] {
  const out: HTMLElement[] = [];
  const g = glyphEl(o.glyph);
  if (g) { const w = el('span', 'ui-ic'); w.append(g); out.push(w); }
  else if (o.icon) { const w = el('span', 'ui-ic', o.icon); w.setAttribute('aria-hidden', 'true'); out.push(w); }
  const tx = el('div', 'tx');
  tx.append(el('span', 'lb', o.label));
  if (o.tag) tx.append(el('small', '', o.tag));
  out.push(tx);
  if (o.price) out.push(priceTag(o.price));
  return out;
}

/** An outlined action card: line icon, title, kind line, the price, a chevron. Keeps the sheet's `.item` hook. */
export function shopRow(o: CardOptions): HTMLButtonElement {
  const b = el('button', 'item ui-line' + (o.disabled ? ' dis is-disabled' : '') + (o.selected ? ' is-selected' : ''));
  b.type = 'button';
  if (o.title) b.title = o.title;
  b.append(...head(o));
  const ch = glyphEl('chevron'); if (ch) { const w = el('span', 'ui-chev'); w.append(ch); b.append(w); }
  if (o.selected) b.setAttribute('aria-current', 'true');
  if (o.disabled) { b.setAttribute('aria-disabled', 'true'); b.addEventListener('click', () => o.onDeny?.(b)); }
  else b.addEventListener('click', o.onPick);
  return b;
}

/** The featured card: the same head on a raised card, with its own big button under it (« Acheter »). */
export function shopFeature(o: CardOptions & { cta: string }): HTMLElement {
  const c = el('div', 'item ui-feature');
  if (o.title) c.title = o.title;
  const top = el('div', 'ui-feature-head');
  top.append(...head(o));
  c.append(top, primaryButton(o.cta, () => {}, { quiet: true }));
  const btn = c.querySelector('.ui-btn') as HTMLButtonElement;
  btn.addEventListener('click', e => { e.stopPropagation(); o.onPick(); });
  c.addEventListener('click', o.onPick);
  return c;
}
