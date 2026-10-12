/**
 * Sheets (docs/UI.md): every menu of the game goes through one element, #modal, in one of two forms.
 *
 * - **menu**: title, subtitle, optional extra HTML, then rows (icon, label, detail line, right-aligned price, disabled
 *   reason). A bottom sheet on portrait phones (grabber, max ~56 % of the height, drag up to enlarge, swipe down or tap
 *   outside to close, safe-area insets), a side sheet on landscape phones, a compact floating card on desktop.
 * - **quick**: the « ⋯ » actions of the focused target as an icon grid, anchored above the action button (thumb zone).
 *
 * Disabled rows stay tappable: a tap shakes the row and says why (`deny`). Selectors the checks rely on are kept:
 * #modal(.on), #modal .panel (the scroll container), #modal h2, #modal p (subtitle, first paragraph), #modal .item,
 * #modal .item.close (accessible name « Fermer »; it comes after the rows, so `.item >> nth=0` is the first row).
 */
export interface MenuItem {
  label: string;
  detail?: string;
  /** Right column: a price (« −500 F », « +1 200 F ») or a short mark (« ✓ »). */
  right?: string;
  disabled?: boolean;
  /** Why it is unavailable, said when the player taps it (defaults to `detail`). */
  reason?: string;
  /** One emoji. */
  icon?: string;
  onPick: () => void;
}

export type SheetKind = 'menu' | 'quick';

export interface SheetHooks {
  /** A disabled row was tapped: say why (toast) — the row itself shakes. */
  deny(reason: string): void;
  /** Called on every open (drop held keys and touches). */
  opened(): void;
}

/**
 * CSS class of a right-column string: gains in green, costs in ink, « Payer » (the row's price is in its label, said
 * first) a sun pill like the action button, anything else neutral.
 */
export function priceClass(right: string): string {
  return /^\+/.test(right) ? 'gain' : /^[−-]\s?\d/.test(right) ? 'cost' : /^Payer\b/.test(right) ? 'pay' : '';
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e;
};

/** Restart a one-shot CSS animation class on an element. */
export function replay(e: HTMLElement, cls: string) {
  e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
  e.addEventListener('animationend', () => e.classList.remove(cls), { once: true });
}

export class Sheet {
  readonly box: HTMLElement;
  readonly panel: HTMLElement;
  private x: HTMLButtonElement;
  private kind: SheetKind = 'menu';

  constructor(readonly root: HTMLElement, private hooks: SheetHooks) {
    root.innerHTML = '';
    this.box = el('div', 'sheet');
    this.panel = el('div', 'panel');
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-labelledby', 'shTitle');
    this.x = el('button', 'item close sh-x', '✕');
    this.x.type = 'button'; this.x.setAttribute('aria-label', 'Fermer');
    this.x.addEventListener('click', () => this.close());
    this.box.append(this.panel, this.x);
    root.appendChild(this.box);
    root.addEventListener('click', e => { if (e.target === root) this.close(); });
    // The class is the state (checks and main.ts read it): keep the body flag and the drag offset in sync with it.
    new MutationObserver(() => {
      const on = root.classList.contains('on');
      document.body.classList.toggle('sheet-open', on);
      if (!on) { this.box.style.transform = ''; this.box.classList.remove('tall', 'drag'); }
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    this.swipe();
    // Phone keyboard (a text field in a sheet): lift the sheet above it.
    const vv = window.visualViewport;
    if (vv) {
      const lift = () => { const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); root.style.setProperty('--kb', kb > 60 ? `${Math.round(kb)}px` : '0px'); };
      vv.addEventListener('resize', lift); vv.addEventListener('scroll', lift);
    }
  }

  get isOpen() { return this.root.classList.contains('on'); }
  close() { this.root.classList.remove('on'); }

  open(kind: SheetKind, title: string, subtitle: string, items: MenuItem[], extraHtml = '', afterRender?: (panel: HTMLElement) => void) {
    this.hooks.opened();
    this.kind = kind;
    this.root.dataset.kind = kind;
    const p = this.panel;
    p.innerHTML = '';
    const top = el('div', 'sh-top');
    top.append(el('span', 'sh-grab'));
    const h = el('h2', '', title); h.id = 'shTitle';
    top.append(h);
    p.append(top);
    const sub = el('p', 'sh-sub', subtitle);
    p.append(sub);
    if (extraHtml) { const x = el('div', 'sh-extra'); x.innerHTML = extraHtml; p.append(x); }
    const list = el('div', 'list');
    for (const it of items) list.appendChild(this.row(it, kind === 'quick'));
    p.append(list);
    p.scrollTop = 0;
    this.box.classList.remove('tall');
    this.box.style.transform = '';
    this.root.classList.add('on');
    afterRender?.(p);
  }

  private row(it: MenuItem, tile: boolean): HTMLButtonElement {
    const b = el('button', 'item' + (tile ? ' tile' : '') + (it.disabled ? ' dis' : ''));
    b.type = 'button';
    if (it.icon) { const ic = el('i', 'ic', it.icon); ic.setAttribute('aria-hidden', 'true'); b.appendChild(ic); }
    const l = el('div', 'tx');
    l.appendChild(el('span', 'lb', it.label));
    const why = it.reason ?? it.detail;
    if (it.detail || (tile && it.disabled && why)) l.appendChild(el('small', '', it.disabled ? why : it.detail));
    b.appendChild(l);
    if (it.right) b.appendChild(el('em', priceClass(it.right), it.right));
    if (it.disabled) {
      b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => { replay(b, 'deny'); this.hooks.deny(why || 'Indisponible'); });
    } else b.addEventListener('click', () => it.onPick());
    return b;
  }

  /** Bottom sheet only (portrait phones): drag the grabber or the title down to close, up to enlarge. */
  private swipe() {
    let id = -1, y0 = 0, t0 = 0, dy = 0;
    const bottom = () => this.kind === 'menu' && matchMedia('(max-width: 640px) and (orientation: portrait)').matches;
    this.box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || id >= 0 || !bottom() || !(e.target as HTMLElement).closest('.sh-top')) return;
      id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0;
      this.box.classList.add('drag');
      try { this.box.setPointerCapture(id); } catch { /* synthetic or already released pointer */ }
    });
    this.box.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      dy = e.clientY - y0;
      this.box.style.transform = dy > 0 ? `translateY(${Math.round(dy)}px)` : '';
      if (dy < -36) this.box.classList.add('tall');
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1; this.box.classList.remove('drag');
      const v = dy / Math.max(1, performance.now() - t0);
      if (dy > 90 || (dy > 30 && v > 0.6)) this.close();
      else this.box.style.transform = '';
    };
    this.box.addEventListener('pointerup', end); this.box.addEventListener('pointercancel', end);
  }
}
