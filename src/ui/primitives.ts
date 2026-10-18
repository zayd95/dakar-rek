import './tokens.css';
import './primitives.css';

/**
 * Small DOM builders for the shared UI (tokens.css, primitives.css, docs/UI-PRIMITIVES.md). Presentation only: they take what to
 * show and a callback, and never read the game. The Tiak Tiak delivery cards and the shop rows are made from the same tokens.
 */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e;
};

/** Tone of a price string: « +1 500 F » gains, « −400 F » costs, anything else (« ✓ », « Payer ») neutral. */
export const priceTone = (text: string): 'gain' | 'cost' | '' => (/^\+/.test(text) ? 'gain' : /^[−-]\s?\d/.test(text) ? 'cost' : '');

/** A price: green for a gain, ink for a cost, tabular figures. `xl` for the big reward of a card. */
export function priceTag(text: string, xl = false): HTMLElement {
  return el('em', `ui-price ${priceTone(text)}${xl ? ' xl' : ''}`.trim(), text);
}

/** The primary button: a yellow bar, one verb. */
export function primaryButton(label: string, onPick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', 'ui-btn' + (disabled ? ' is-disabled' : ''), label);
  b.type = 'button';
  if (disabled) b.setAttribute('aria-disabled', 'true'); else b.addEventListener('click', onPick);
  return b;
}

export interface RowOptions {
  icon?: string; label: string;
  /** One short line under the label; rows keep it only when it says something the label does not (a reason, a number). */
  note?: string;
  /** « −400 F », « +1 500 F ». */
  price?: string;
  disabled?: boolean; selected?: boolean;
  /** Said in full to a screen reader or on long-press, even when the row shows less. */
  title?: string;
  onPick: () => void;
  /** Called instead of `onPick` when a disabled row is tapped (the sheet shakes it and says why). */
  onDeny?: (row: HTMLButtonElement) => void;
}

/** An action row: icon tile, label, an optional line, the price on the right. Keeps the sheet's `.item` hook. */
export function actionRow(o: RowOptions): HTMLButtonElement {
  const b = el('button', 'item ui-row' + (o.disabled ? ' dis is-disabled' : '') + (o.selected ? ' is-selected' : ''));
  b.type = 'button';
  if (o.title) b.title = o.title;
  if (o.icon) { const ic = el('i', 'ic', o.icon); ic.setAttribute('aria-hidden', 'true'); b.append(ic); }
  const tx = el('div', 'tx');
  tx.append(el('span', 'lb', o.label));
  if (o.note) tx.append(el('small', '', o.note));
  b.append(tx);
  if (o.price) b.append(priceTag(o.price));
  if (o.selected) b.setAttribute('aria-current', 'true');
  if (o.disabled) { b.setAttribute('aria-disabled', 'true'); b.addEventListener('click', () => o.onDeny?.(b)); }
  else b.addEventListener('click', o.onPick);
  return b;
}

/** The first sentence or two of a greeting, cut at a sentence end within `max` characters (a shop's subtitle). */
export function shortLine(text: string, max = 44): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!parts) return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
  let out = '';
  for (const p of parts) { if ((out + p).trim().length > max && out) break; out += p; }
  return (out || parts[0]).trim();
}
