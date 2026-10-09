import type { Needs } from '../core/types';
import type { Input } from '../core/input';
import { Sheet, replay, type MenuItem } from './sheet';

export type { MenuItem } from './sheet';

/**
 * The light HUD (docs/UI.md): wallet and needs (rings, tap to open), place and time, the phone button, the goal hint,
 * stacked toasts, the contextual action (primary verb with icon and price, « ⋯ » for the others, a diegetic bubble above
 * the target), the activity progress pill, and the sheets (src/ui/sheet.ts). Every setter called per frame only touches
 * the DOM when its content changed.
 */

const NEEDS: { k: keyof Needs; label: string; icon: string }[] = [
  { k: 'faim', label: 'Faim', icon: '🍽️' }, { k: 'energie', label: 'Énergie', icon: '⚡' }, { k: 'moral', label: 'Moral', icon: '🙂' },
  { k: 'social', label: 'Social', icon: '💬' }, { k: 'hygiene', label: 'Hygiène', icon: '🚿' },
];
const MOOD_FACE: Record<string, string> = { 'au top': '😄', bien: '🙂', bof: '😐', mal: '😟' };
const ARROWS = '↑↗→↘↓↙←↖';
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const fcfa = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
/** « −500 F » / « +1 200 F ». */
const signed = (n: number) => (n < 0 ? '−' : '+') + fcfa(Math.abs(n));
/** A leading emoji in a label (« ✋ Arrêter ») becomes the button's icon. */
const LEAD_ICON = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s+(.+)$/u;
export function splitIcon(label: string): { icon: string; text: string } {
  const m = LEAD_ICON.exec(label); return m ? { icon: m[1], text: m[2] } : { icon: '', text: label };
}
/** Toast parts: the game joins bits with two spaces (« Jus de bouye ✓  −500 F »); amounts become coloured chips. */
export function toastParts(msg: string): { text: string; amount?: 'gain' | 'cost' }[] {
  return msg.split(/\s{2,}/).filter(Boolean).map(text => {
    const t = text.trim();
    return /^[+−-]\s?\d[\d\s]*F$/.test(t) ? { text, amount: t[0] === '+' ? 'gain' as const : 'cost' as const } : { text };
  });
}
const PHONE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M10.5 5.2h3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.05" fill="currentColor"/></svg>';

/** Optional details of the primary action and the diegetic bubble. */
export interface PromptOpts {
  icon?: string;
  /** Price of the action (spent) or pay (earned), shown as « −500 F » / « +1 200 F ». */
  cost?: number;
  gain?: number;
  /** Why it cannot be done now: the button greys out and says it. */
  disabled?: string | null;
  /** The running activity's « Arrêter » (white button, not the sun-coloured primary). */
  stop?: boolean;
}
/** What the activity progress pill shows besides the step label. */
export interface ProgressMeta { title?: string; icon?: string; step?: number; steps?: number }
export type ToastKind = 'info' | 'warn';

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private rings = new Map<keyof Needs, HTMLElement>();
  private rows = new Map<keyof Needs, HTMLElement>();
  private needShown: Partial<Record<keyof Needs, number>> = {};
  private moodShown = '';
  private placeKey = '';
  private promptKey = '';
  private wpKey = '';
  private progKey = '';
  private goalKey = '';
  private wallet = { shown: NaN, from: 0, to: 0, t0: 0, raf: 0 };
  private resetTouch: () => void = () => {};
  private sheet: Sheet;
  onAction: () => void = () => {};
  onMenu: () => void = () => {};
  /** « ⋯ » next to the action button: the other actions of the focused target. */
  onMore: () => void = () => {};
  /** « Arrêter » on the scene banner (a làmb scene the player may leave). */
  onSceneStop: () => void = () => {};

  constructor(root: HTMLElement, private input: Input) {
    root.innerHTML = `
      <div id="stats" class="card" role="button" tabindex="0" aria-expanded="false" aria-label="Portefeuille et besoins">
        <div id="wallet"><span id="money">0 F</span></div>
        <div class="rings">${NEEDS.map(n => `<i class="ring" data-need="${n.k}" title="${n.label}"><b aria-hidden="true">${n.icon}</b></i>`).join('')}</div>
        <div class="needs">
          <div id="mood"></div>
          ${NEEDS.map(n => `<div class="nrow" data-row="${n.k}"><b aria-hidden="true">${n.icon}</b><span>${n.label}</span><i class="bar"><i></i></i><em></em></div>`).join('')}
        </div>
      </div>
      <div id="place" class="card"><b id="hubName"></b><small id="clock"></small></div>
      <div id="menuBtn" class="card" role="button" tabindex="0" aria-label="Téléphone">${PHONE_SVG}</div>
      <div id="goal" class="card"><i class="gi" aria-hidden="true">➜</i><span class="gt"></span><em class="gd"></em></div>
      <div id="sceneTag" class="card"><span class="st"><b></b><small></small></span><button type="button" class="st-stop">✋ Arrêter</button></div>
      <div id="wprompt" aria-hidden="true"><div class="wp"></div></div>
      <div id="joy"><i></i></div>
      <div id="hint" class="card"><kbd>ZQSD</kbd> marcher · <kbd>glisser</kbd> caméra · <kbd>E</kbd> agir · <kbd>Échap</kbd> téléphone</div>
      <div id="progress" aria-live="polite"><i class="pg-ic" aria-hidden="true"></i><span class="pg-tx"><b id="progTitle"></b><small id="progLabel"></small></span><em id="progPct"></em><span class="pg-bar"><i id="progBar"></i></span></div>
      <div id="actbar">
        <button id="actMore" class="off" type="button" aria-label="Autres actions"><span aria-hidden="true">⋯</span></button>
        <button id="act" class="off" type="button">Action</button>
      </div>
      <div id="temp">Dakar Rek · Alpha</div>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="fade"></div>
      <div id="modal"></div>`;
    for (const id of ['stats', 'money', 'wallet', 'mood', 'place', 'hubName', 'clock', 'toast', 'progress', 'progTitle', 'progLabel', 'progPct', 'progBar', 'joy', 'act', 'actMore', 'wprompt', 'fade', 'modal', 'menuBtn', 'goal', 'sceneTag'])
      this.el[id] = root.querySelector('#' + id)!;
    root.querySelectorAll<HTMLElement>('.ring').forEach(r => this.rings.set(r.dataset.need as keyof Needs, r));
    root.querySelectorAll<HTMLElement>('.nrow').forEach(r => this.rows.set(r.dataset.row as keyof Needs, r));
    this.sheet = new Sheet(this.el.modal, { deny: r => this.toast(r, 'warn'), opened: () => this.resetTouch() });
    // Tapped or clicked HUD buttons give the focus back: a focused button would also fire on Space/Enter, the game's action keys.
    const tap = (e: HTMLElement, fn: () => void) => e.addEventListener('click', () => { e.blur(); fn(); });
    tap(this.el.act, () => this.onAction());
    tap(this.el.actMore, () => this.onMore());
    tap(this.el.menuBtn, () => this.onMenu());
    tap(this.el.wprompt, () => this.onAction());                                      // tap the bubble in the world = act
    this.el.sceneTag.querySelector('.st-stop')!.addEventListener('click', () => this.onSceneStop());
    this.el.stats.addEventListener('click', () => this.toggleNeeds());
    this.el.stats.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.toggleNeeds(); } });
    try { if (localStorage.getItem('dakarrek.ui.needs') === 'open') this.toggleNeeds(true); } catch { /* storage blocked */ }
    if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch')) document.body.classList.add('touch');
    this.setupTouch();
  }

  private setupTouch() {
    const joy = this.el.joy, knob = joy.firstElementChild as HTMLElement;
    let joyId = -1, camId = -1, lx = 0, ly = 0;
    const R = 50;
    const reset = () => { joyId = camId = -1; this.input.reset(); knob.style.transform = ''; joy.style.transform = ''; joy.classList.remove('on'); };
    this.resetTouch = reset;
    window.addEventListener('blur', reset);
    window.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    window.addEventListener('pointerdown', e => {
      if (!this.input.enabled) return;
      if (e.pointerType !== 'touch' && !document.body.classList.contains('touch')) return;
      const t = e.target as HTMLElement;
      if (t.closest('#act,#actMore,#actbar,#menuBtn,#modal,#stats,#wprompt,#sceneTag')) return;
      if (e.clientX < innerWidth * 0.45 && joyId < 0) {
        // Floating stick: a finger on the base drives it from its centre; anywhere else in the left zone moves the base under the finger.
        joyId = e.pointerId; joy.style.transform = '';
        const r = joy.getBoundingClientRect(); let cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) > r.width / 2 + 10) {
          const h = r.width / 2 + 8, nx = Math.min(Math.max(e.clientX, h), innerWidth * 0.45), ny = Math.min(Math.max(e.clientY, h + 60), innerHeight - h);
          joy.style.transform = `translate(${Math.round(nx - cx)}px,${Math.round(ny - cy)}px)`; cx = nx; cy = ny;
        }
        joy.dataset.cx = String(cx); joy.dataset.cy = String(cy);
        joy.classList.add('on');
        this.moveJoy(e, knob, R);
      } else if (e.clientX >= innerWidth * 0.45 && camId < 0) { camId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    });
    window.addEventListener('pointermove', e => {
      if (e.pointerId === joyId) this.moveJoy(e, knob, R);
      else if (e.pointerId === camId) { this.input.dragYaw -= (e.clientX - lx) * 0.006; this.input.dragPitch += (e.clientY - ly) * 0.004; lx = e.clientX; ly = e.clientY; }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === joyId) { joyId = -1; this.input.joy = { x: 0, y: 0 }; knob.style.transform = ''; joy.style.transform = ''; joy.classList.remove('on'); }
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

  // ---------------------------------------------------------------- wallet, needs, place
  /** Called a few times per second: animates wallet changes and only repaints the needs that moved. */
  setStats(wallet: number, needs: Needs, mood: string) {
    this.showWallet(wallet);
    if (mood !== this.moodShown) {
      this.moodShown = mood;
      this.el.mood.textContent = `${MOOD_FACE[mood] ?? '🙂'} Humeur : ${mood}`;
      (this.rings.get('moral')!.firstElementChild as HTMLElement).textContent = MOOD_FACE[mood] ?? '🙂';
    }
    for (const { k, label } of NEEDS) {
      const v = Math.round(Math.max(0, Math.min(100, needs[k])));
      if (this.needShown[k] === v) continue;
      this.needShown[k] = v;
      const level = v < 25 ? 'low' : v < 50 ? 'mid' : 'ok';
      const ring = this.rings.get(k)!, row = this.rows.get(k)!;
      ring.style.setProperty('--v', String(v)); ring.dataset.level = level; ring.setAttribute('aria-label', `${label} ${v} %`);
      row.dataset.level = level; (row.querySelector('.bar > i') as HTMLElement).style.transform = `scaleX(${v / 100})`;
      (row.querySelector('em') as HTMLElement).textContent = `${v} %`;
    }
  }
  private toggleNeeds(force?: boolean) {
    const open = this.el.stats.classList.toggle('open', force);
    this.el.stats.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('dakarrek.ui.needs', open ? 'open' : 'closed'); } catch { /* storage blocked */ }
  }
  /** Wallet: counts to the new amount and floats the difference (+/− F) beside it. */
  private showWallet(w: number) {
    const s = this.wallet;
    if (Number.isNaN(s.shown)) { s.shown = s.to = w; this.el.money.textContent = fcfa(w); return; }
    if (w === s.to) return;
    const delta = w - s.to;
    s.from = s.shown; s.to = w; s.t0 = performance.now();
    if (!s.raf) s.raf = requestAnimationFrame(this.tickWallet);
    const fx = document.createElement('span');
    fx.className = 'mfx ' + (delta > 0 ? 'gain' : 'cost'); fx.textContent = signed(delta); fx.setAttribute('aria-hidden', 'true');
    const old = this.el.wallet.querySelectorAll('.mfx'); if (old.length > 2) old[0].remove();
    this.el.wallet.appendChild(fx);
    fx.addEventListener('animationend', () => fx.remove(), { once: true });
    setTimeout(() => fx.remove(), 2400);
    replay(this.el.stats, delta > 0 ? 'bump-up' : 'bump-down');
  }
  private tickWallet = (now: number) => {
    const s = this.wallet, k = Math.min(1, (now - s.t0) / 650), e = 1 - (1 - k) ** 3;
    s.shown = Math.round(s.from + (s.to - s.from) * e);
    this.el.money.textContent = fcfa(s.shown);
    s.raf = k < 1 ? requestAnimationFrame(this.tickWallet) : 0;
  };

  setPlace(name: string, clock: string, night: boolean) {
    const key = name + '|' + clock + '|' + night;
    if (key === this.placeKey) return; this.placeKey = key;
    this.el.hubName.textContent = name; this.el.clock.textContent = (night ? '🌙 ' : '☀️ ') + clock;
  }

  // ---------------------------------------------------------------- contextual action
  /**
   * Main action button: the focused target's primary verb (`label`, a leading emoji becomes the icon), what it applies
   * to or why it is unavailable (`sub`), « ⋯ » when the target has other actions (`more`), and its price (`opt`).
   * Called every frame: the DOM changes only when the content does.
   */
  setPrompt(label: string | null, sub = '', more: boolean | number = false, opt: PromptOpts = {}) {
    const key = JSON.stringify([label, sub, !!more, opt.icon, opt.cost, opt.gain, opt.disabled, opt.stop]);
    if (key === this.promptKey) return; this.promptKey = key;
    const act = this.el.act;
    this.el.actMore.className = label && more ? '' : 'off';
    if (!label) { act.className = 'off'; act.innerHTML = 'Action'; act.removeAttribute('aria-label'); return; }
    const { icon, text } = opt.icon ? { icon: opt.icon, text: label } : splitIcon(label);
    const price = opt.cost ? signed(-opt.cost) : opt.gain ? signed(opt.gain) : '';
    act.className = opt.stop ? 'stop' : opt.disabled ? 'dis' : '';
    act.innerHTML = `${icon ? `<i class="a-ic" aria-hidden="true">${esc(icon)}</i>` : ''}<span class="a-tx"><b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`
      + (price && !opt.stop ? `<em class="a-pr ${opt.cost ? 'cost' : 'gain'}">${price}</em>` : '') + '<kbd aria-hidden="true">E</kbd>';
    act.setAttribute('aria-label', [text, sub, price].filter(Boolean).join(' · '));
  }
  /** Diegetic bubble above the focused target (screen position in CSS pixels), or hidden. */
  setWorldPrompt(at: { x: number; y: number } | null, icon = '', label = '', opt: PromptOpts = {}) {
    const w = this.el.wprompt;
    if (!at) { if (this.wpKey) { w.classList.remove('on'); this.wpKey = ''; } return; }
    const price = opt.cost ? signed(-opt.cost) : opt.gain ? signed(opt.gain) : '';
    const key = [icon, label, price, opt.disabled ?? ''].join('|');
    if (key !== this.wpKey) {
      const changed = !!this.wpKey;
      this.wpKey = key;
      const wp = w.firstElementChild as HTMLElement;
      wp.className = 'wp' + (opt.disabled ? ' dis' : '');
      wp.innerHTML = `${icon ? `<i>${esc(icon)}</i>` : ''}<span>${esc(label)}</span>${price ? `<em class="${opt.cost ? 'cost' : 'gain'}">${price}</em>` : ''}<kbd>E</kbd>`;
      if (changed || !w.classList.contains('on')) replay(wp, 'pop');
    }
    w.style.transform = `translate(${Math.round(at.x)}px,${Math.round(at.y)}px) translate(-50%,-100%)`;
    w.classList.add('on');
  }
  /** The action is unavailable: shake the button and say why. */
  deny(reason: string) {
    if (!this.el.act.classList.contains('off')) replay(this.el.act, 'deny');
    this.toast(reason, 'warn');
  }

  // ---------------------------------------------------------------- hints, scene, toasts, progress
  /** One suggested next step at most (nothing is compulsory). A leading direction arrow becomes the compass badge. */
  setGoal(text: string | null) {
    const key = text ?? '';
    if (key === this.goalKey) return; this.goalKey = key;
    const g = this.el.goal;
    g.classList.toggle('on', !!text);
    const arrow = !!text && ARROWS.includes(text[0]) && text[1] === ' ';
    (g.querySelector('.gt') as HTMLElement).textContent = text ? (arrow ? text.slice(2) : text) : '';
    if (!this.guideOn) (g.querySelector('.gi') as HTMLElement).textContent = arrow ? text![0] : '➜';
    g.classList.toggle('walk', arrow || this.guideOn);
    this.paintGuideDistance();
  }
  /**
   * Way-finding for the goal hint: direction of the next-step place relative to the camera (radians, 0 = straight
   * ahead, clockwise) and its distance in metres; null when there is no place to walk to. Called every frame.
   */
  setGuide(dir: { angle: number; dist: number } | null) {
    const g = this.el.goal, gi = g.querySelector('.gi') as HTMLElement;
    if (!dir) {
      if (this.guideOn) { this.guideOn = false; gi.style.transform = ''; gi.textContent = '➜'; this.goalKey = '\u0000'; this.guideDist = -1; this.paintGuideDistance(); }
      return;
    }
    if (!this.guideOn) { this.guideOn = true; gi.textContent = '↑'; g.classList.add('walk'); }
    const deg = Math.round((dir.angle * 180) / Math.PI / 3) * 3;
    if (deg !== this.guideDeg) { this.guideDeg = deg; gi.style.transform = `rotate(${deg}deg)`; }
    const m = Math.round(dir.dist);
    if (m !== this.guideDist) { this.guideDist = m; this.paintGuideDistance(); }
  }
  private guideOn = false;
  private guideDeg = NaN;
  private guideDist = -1;
  private paintGuideDistance() {
    const gd = this.el.goal.querySelector('.gd') as HTMLElement, text = this.goalKey;
    const show = this.guideOn && this.guideDist >= 0 && !/\d+ m$/.test(text);
    const v = show ? `${this.guideDist} m` : '';
    if (gd.textContent !== v) gd.textContent = v;
  }
  /** Scene banner: makes training, entrance and combat clearly distinct; `stoppable` adds « Arrêter » (onSceneStop). */
  setScene(label: string | null, note = '', stoppable = false) {
    const t = this.el.sceneTag;
    (t.querySelector('b') as HTMLElement).textContent = label ?? ''; (t.querySelector('small') as HTMLElement).textContent = label ? note : '';
    t.classList.toggle('on', !!label); t.classList.toggle('stoppable', !!label && stoppable);
    document.body.classList.toggle('inscene', !!label);
  }
  /**
   * Stacked notifications (three at most), above the sheets and clear of the action area. Parts separated by two spaces
   * (« Jus de bouye ✓  −500 F ») are laid out as chips; amounts are coloured.
   */
  toast(msg: string, kind: ToastKind = 'info') {
    const box = this.el.toast;
    const same = [...box.children].find(c => (c as HTMLElement).dataset.msg === msg && !c.classList.contains('out')) as HTMLElement | undefined;
    if (same) { this.armToast(same, msg); replay(same, 'again'); return; }
    const t = document.createElement('div');
    t.className = 't ' + kind + (/✓/.test(msg) ? ' ok' : ''); t.dataset.msg = msg;
    toastParts(msg).forEach((p, i) => {
      if (i) t.appendChild(document.createTextNode(' '));
      const s = document.createElement('span'); s.textContent = p.text;
      if (p.amount) s.className = 'amt ' + p.amount;
      t.appendChild(s);
    });
    box.prepend(t);
    const live = [...box.children].filter(c => !c.classList.contains('out'));
    for (const old of live.slice(3)) this.dropToast(old as HTMLElement);
    this.armToast(t, msg);
  }
  private armToast(t: HTMLElement, msg: string) {
    clearTimeout(Number(t.dataset.timer));
    t.dataset.timer = String(window.setTimeout(() => this.dropToast(t), Math.min(5200, 2400 + msg.length * 35)));
  }
  private dropToast(t: HTMLElement) {
    clearTimeout(Number(t.dataset.timer));
    t.classList.add('out');
    setTimeout(() => t.remove(), 220);
  }
  /** Activity progress: a slim pill above the action button (title, step label, step n/m, bar). */
  progress(on: boolean, pct = 0, label = '', meta: ProgressMeta = {}) {
    const p = this.el.progress;
    if (!on) { if (this.progKey) { p.classList.remove('on'); this.progKey = ''; } return; }
    const title = meta.title && meta.title !== label ? meta.title : '';
    const key = [title, label, meta.icon ?? '', meta.step ?? '', meta.steps ?? ''].join('|');
    if (key !== this.progKey) {
      this.progKey = key;
      (p.querySelector('.pg-ic') as HTMLElement).textContent = meta.icon ?? '⏳';
      this.el.progTitle.textContent = title || label;
      this.el.progLabel.textContent = title ? label + (meta.steps && meta.steps > 1 ? ` · ${meta.step}/${meta.steps}` : '') : '';
      p.classList.add('on');
    }
    const v = Math.max(0, Math.min(1, pct));
    this.el.progBar.style.transform = `scaleX(${v})`;
    const txt = Math.round(v * 100) + ' %';
    if (this.el.progPct.textContent !== txt) this.el.progPct.textContent = txt;
  }
  fade(on: boolean, text = '') { this.el.fade.textContent = text; this.el.fade.classList.toggle('on', on); }
  /** Drop held keys, joystick finger and camera drag (opening the phone or a menu). */
  resetControls() { this.resetTouch(); }

  // ---------------------------------------------------------------- sheets
  get modalOpen() { return this.sheet.isOpen; }
  closeModal() { this.sheet.close(); }
  /** A menu as a bottom sheet (phones) or a floating card (desktop). Same contract as before the sheets. */
  openMenu(title: string, subtitle: string, items: MenuItem[], extraHtml = '', afterRender?: (panel: HTMLElement) => void) {
    this.sheet.open('menu', title, subtitle, items, extraHtml, afterRender);
  }
  /** Quick actions of a target (« ⋯ »): an icon grid near the action button, prices and disabled reasons included. */
  openQuick(title: string, items: MenuItem[], subtitle = '') {
    this.sheet.open('quick', title, subtitle, items);
  }
}
