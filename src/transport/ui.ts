import './transport.css';

/** The ride card: line number, what is happening (waiting / riding), the next stop and its countdown. */
export class RideCard {
  private el: HTMLElement;
  private num: HTMLElement; private title: HTMLElement; private sub: HTMLElement; private req: HTMLElement;
  private last = '';
  constructor(root: HTMLElement, id = 'ride') {
    this.el = document.createElement('div');
    this.el.id = id; this.el.className = 'card ridecard'; this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = '<span class="num"></span><div class="txt"><b></b><small></small><div class="req"></div></div>';
    root.appendChild(this.el);
    this.num = this.el.querySelector('.num')!; this.title = this.el.querySelector('b')!; this.sub = this.el.querySelector('small')!; this.req = this.el.querySelector('.req')!;
  }
  /** Shows the card (null hides it). Only touches the DOM when the text changed. */
  show(v: { num: string; title: string; sub: string; req?: string | null } | null) {
    const key = v ? `${v.num}|${v.title}|${v.sub}|${v.req ?? ''}` : '';
    if (key === this.last) return;
    this.last = key;
    this.el.classList.toggle('on', !!v);
    if (!v) return;
    this.num.textContent = v.num; this.title.textContent = v.title; this.sub.textContent = v.sub;
    this.req.textContent = v.req ?? ''; this.el.classList.toggle('req', !!v.req);
  }
  get text() { return this.el.classList.contains('on') ? this.el.textContent ?? '' : ''; }
  dispose() { this.el.remove(); }
}
