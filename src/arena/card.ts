/** The gala card: what is on (the bill) and the moment of the show, under the HUD's place name. */
const CSS = `#ui .galacard{position:absolute;left:50%;top:118px;transform:translateX(-50%);display:none;align-items:center;gap:10px;
  padding:8px 14px 8px 10px;max-width:min(460px,78vw);pointer-events:none}
#ui .galacard.on{display:flex}
#ui .galacard .num{flex:none;padding:5px 8px;border-radius:8px;background:#d9322b;color:#fff;font:900 12px/1 var(--font);letter-spacing:.3px}
#ui .galacard .txt{min-width:0}
#ui .galacard b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ui .galacard small{display:block;font-size:11.5px;opacity:.86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (orientation:portrait) and (max-width:640px){#ui .galacard{top:150px;max-width:92vw}}`;

export class GalaCard {
  private el: HTMLElement;
  private title: HTMLElement; private sub: HTMLElement;
  private last = '';
  constructor(root: HTMLElement) {
    if (!document.getElementById('galacard-css')) { const st = document.createElement('style'); st.id = 'galacard-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div');
    this.el.id = 'galacard'; this.el.className = 'card galacard'; this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = '<span class="num">LÀMB</span><div class="txt"><b></b><small></small></div>';
    root.appendChild(this.el);
    this.title = this.el.querySelector('b')!; this.sub = this.el.querySelector('small')!;
  }
  show(v: { title: string; sub: string } | null) {
    const key = v ? `${v.title}|${v.sub}` : '';
    if (key === this.last) return;
    this.last = key;
    this.el.classList.toggle('on', !!v);
    if (v) { this.title.textContent = v.title; this.sub.textContent = v.sub; }
  }
  get text() { return this.el.classList.contains('on') ? this.el.textContent ?? '' : ''; }
  dispose() { this.el.remove(); }
}
