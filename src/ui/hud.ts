import type { Needs } from '../core/types';
import type { Input } from '../core/input';
import { glossed } from '../i18n/wolof';

export interface MenuItem { label: string; detail?: string; right?: string; disabled?: boolean; icon?: string; onPick: () => void }

const NEED_LABELS: [keyof Needs, string][] = [['faim', 'Faim'], ['energie', 'Énergie'], ['moral', 'Moral'], ['social', 'Social'], ['hygiene', 'Hygiène']];
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const fcfa = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';

export class Hud {
  private bars = new Map<string, HTMLElement>();
  private el: Record<string, HTMLElement> = {};
  private toastT = 0;
  private resetTouch: () => void = () => {};
  onAction: () => void = () => {};
  onMenu: () => void = () => {};
  /** « ⋯ » next to the action button: the other actions of the focused target. */
  onMore: () => void = () => {};

  constructor(root: HTMLElement, private input: Input) {
    root.innerHTML = `
      <div id="stats" class="card"><div id="wallet"><span id="money">0 F</span></div><div id="mood"></div>${NEED_LABELS.map(([k, l]) => `<div class="need"><span>${l}</span><div class="bar"><i data-need="${k}"></i></div></div>`).join('')}</div>
      <div id="place" class="card"><b id="hubName"></b><small id="clock"></small></div>
      <div id="menuBtn" class="card" role="button" aria-label="Téléphone">☰</div>
      <div id="toast" class="card"></div>
      <div id="goal" class="card"></div>
      <div id="sceneTag" class="card"></div>
      <div id="progress" class="card"><span id="progLabel"></span><div class="bar"><i id="progBar" style="width:0"></i></div></div>
      <div id="joy"><i></i></div>
      <div id="hint" class="card">ZQSD/WASD ou flèches : marcher · glisser : caméra · E : action · Échap : téléphone</div>
      <div id="wprompt" aria-hidden="true"></div>
      <button id="act" class="off">Action</button>
      <button id="actMore" class="off" aria-label="Autres actions">⋯</button>
      <div id="temp">Dakar Rek · Alpha</div>
      <div id="fade"></div>
      <div id="modal"><div class="panel"></div></div>`;
    for (const id of ['money', 'mood', 'hubName', 'clock', 'toast', 'progress', 'progLabel', 'progBar', 'joy', 'act', 'actMore', 'wprompt', 'fade', 'modal', 'menuBtn', 'goal', 'sceneTag']) this.el[id] = root.querySelector('#' + id)!;
    root.querySelectorAll<HTMLElement>('[data-need]').forEach(b => this.bars.set(b.dataset.need!, b));
    this.el.act.addEventListener('click', () => this.onAction());
    this.el.actMore.addEventListener('click', () => this.onMore());
    this.el.menuBtn.addEventListener('click', () => this.onMenu());
    this.el.modal.addEventListener('click', e => { if (e.target === this.el.modal) this.closeModal(); });
    if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch')) document.body.classList.add('touch');
    this.setupTouch();
  }

  private setupTouch() {
    const joy = this.el.joy, knob = joy.firstElementChild as HTMLElement;
    let joyId = -1, camId = -1, lx = 0, ly = 0;
    const R = 50;
    const reset = () => { joyId = camId = -1; this.input.reset(); knob.style.transform = ''; };
    this.resetTouch = reset;
    window.addEventListener('blur', reset);
    window.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    window.addEventListener('pointerdown', e => {
      if (!this.input.enabled) return;
      if (e.pointerType !== 'touch' && !document.body.classList.contains('touch')) return;
      const t = e.target as HTMLElement;
      if (t.closest('#act,#actMore,#menuBtn,#modal,#stats')) return;
      if (e.clientX < innerWidth * 0.45 && joyId < 0) {
        joyId = e.pointerId; const r = joy.getBoundingClientRect(); joy.dataset.cx = String(r.left + r.width / 2); joy.dataset.cy = String(r.top + r.height / 2);
        this.moveJoy(e, knob, R);
      } else if (e.clientX >= innerWidth * 0.45 && camId < 0) { camId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    });
    window.addEventListener('pointermove', e => {
      if (e.pointerId === joyId) this.moveJoy(e, knob, R);
      else if (e.pointerId === camId) { this.input.dragYaw -= (e.clientX - lx) * 0.006; this.input.dragPitch += (e.clientY - ly) * 0.004; lx = e.clientX; ly = e.clientY; }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === joyId) { joyId = -1; this.input.joy = { x: 0, y: 0 }; knob.style.transform = ''; }
      if (e.pointerId === camId) camId = -1;
    };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  private moveJoy(e: PointerEvent, knob: HTMLElement, R: number) {
    const cx = Number(this.el.joy.dataset.cx), cy = Number(this.el.joy.dataset.cy);
    let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    this.input.joy = { x: dx / R, y: -dy / R };
  }

  setStats(wallet: number, needs: Needs, mood: string) {
    this.el.money.textContent = fcfa(wallet);
    this.el.mood.textContent = 'Humeur : ' + mood;
    for (const [k] of NEED_LABELS) {
      const b = this.bars.get(k)!, v = needs[k];
      b.style.width = v + '%'; b.className = v < 25 ? 'low' : v < 50 ? 'mid' : '';
    }
  }
  setPlace(name: string, clock: string, night: boolean) { this.el.hubName.textContent = name; this.el.clock.textContent = (night ? '🌙 ' : '☀️ ') + clock; }
  /** Main action button: the focused target's primary verb (`label`), what it applies to (`sub`), and « ⋯ » when it has more. */
  setPrompt(label: string | null, sub = '', more = false) {
    this.el.act.className = label ? '' : 'off';
    this.el.act.innerHTML = label ? `${esc(label)}<small>${esc(sub || 'Appuyer / E')}</small>` : 'Action';
    this.el.actMore.className = label && more ? '' : 'off';
  }
  /** Diegetic prompt floating above the focused target (screen position in CSS pixels), or hidden. */
  setWorldPrompt(at: { x: number; y: number } | null, icon = '', label = '') {
    const w = this.el.wprompt;
    if (!at) { w.classList.remove('on'); return; }
    const html = `<i>${esc(icon)}</i>${esc(label)}<kbd>E</kbd>`;
    if (w.dataset.html !== html) { w.innerHTML = html; w.dataset.html = html; }
    w.style.transform = `translate(${Math.round(at.x)}px,${Math.round(at.y)}px) translate(-50%,-100%)`;
    w.classList.add('on');
  }
  /** One suggested next step at most (nothing is compulsory). */
  setGoal(text: string | null) { this.el.goal.textContent = text ? '➜ ' + text : ''; this.el.goal.classList.toggle('on', !!text); }
  /** Scene banner: makes training, entrance and combat clearly distinct. */
  setScene(label: string | null, note = '') {
    this.el.sceneTag.innerHTML = label ? `<b></b><small></small>` : '';
    if (label) { (this.el.sceneTag.querySelector('b') as HTMLElement).textContent = label; (this.el.sceneTag.querySelector('small') as HTMLElement).textContent = note; }
    this.el.sceneTag.classList.toggle('on', !!label); document.body.classList.toggle('inscene', !!label);
  }
  toast(msg: string) {
    this.el.toast.textContent = glossed(msg); this.el.toast.classList.add('on');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => this.el.toast.classList.remove('on'), 2600);
  }
  progress(on: boolean, pct = 0, label = '') {
    this.el.progress.style.display = on ? 'block' : 'none'; this.el.progLabel.textContent = label;
    (this.el.progBar as HTMLElement).style.width = pct * 100 + '%';
  }
  fade(on: boolean, text = '') { this.el.fade.textContent = text; this.el.fade.classList.toggle('on', on); }
  /** Drop held keys, joystick finger and camera drag (opening the phone or a menu). */
  resetControls() { this.resetTouch(); }
  get modalOpen() { return this.el.modal.classList.contains('on'); }
  closeModal() { this.el.modal.classList.remove('on'); }

  /** Every menu text goes through `glossed`: Wolof glosses shown or hidden as set in Réglages › Langue. */
  openMenu(title: string, subtitle: string, items: MenuItem[], extraHtml = '', afterRender?: (panel: HTMLElement) => void) {
    this.resetTouch();
    const panel = this.el.modal.querySelector('.panel') as HTMLElement;
    panel.innerHTML = `<h2></h2><p></p>${glossed(extraHtml)}<div class="list"></div>`;
    (panel.querySelector('h2') as HTMLElement).textContent = glossed(title); (panel.querySelector('p') as HTMLElement).textContent = glossed(subtitle);
    const list = panel.querySelector('.list') as HTMLElement;
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'item' + (it.disabled ? ' dis' : '');
      if (it.icon) { const ic = document.createElement('i'); ic.className = 'ic'; ic.textContent = it.icon; b.appendChild(ic); }
      const l = document.createElement('div'); l.textContent = glossed(it.label);
      if (it.detail) { const s = document.createElement('small'); s.textContent = glossed(it.detail); l.appendChild(s); }
      b.appendChild(l);
      if (it.right) { const r = document.createElement('em'); r.textContent = it.right; b.appendChild(r); }
      if (!it.disabled) b.addEventListener('click', () => it.onPick());
      list.appendChild(b);
    }
    const c = document.createElement('button'); c.className = 'item close'; c.textContent = 'Fermer'; c.addEventListener('click', () => this.closeModal()); list.appendChild(c);
    this.el.modal.classList.add('on');
    afterRender?.(panel);
  }
}
