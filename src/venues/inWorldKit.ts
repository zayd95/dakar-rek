import * as THREE from 'three';
import '../ui/inworld.css';
import { glossed } from '../i18n/wolof';

/**
 * What the in-world activities share (src/venues/grillPlay.ts, src/venues/dancePlay.ts): a transparent touch layer under
 * the HUD's controls with chips pinned to points of the world, a small result card, and a framing camera that eases in
 * from wherever the follow camera was.
 */
const esc = (t: string) => glossed(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export { esc };

const V = new THREE.Vector3();

export class Layer {
  readonly el: HTMLElement;
  private card: HTMLElement | null = null;
  private cardT = 0;
  /** Floating words, aged by the game's own frames (a stepped capture shows them as a phone would). */
  private words: { el: HTMLElement; t: number }[] = [];
  constructor(cls: string) {
    this.el = document.createElement('div');
    this.el.className = `iw ${cls}`;
    (document.getElementById('ui') ?? document.body).appendChild(this.el);
  }
  add(cls: string, html = '', tag = 'div'): HTMLElement {
    const e = document.createElement(tag); e.className = cls; e.innerHTML = html; this.el.appendChild(e); return e;
  }
  /** Puts `e` at the screen point of the world point (hidden when behind the camera). Returns the point (page px). */
  pin(e: HTMLElement, camera: THREE.Camera, p: THREE.Vector3, dy = 0, keepIn = false): { x: number; y: number } | null {
    V.copy(p).project(camera);
    if (V.z > 1 || (!keepIn && (Math.abs(V.x) > 1.3 || Math.abs(V.y) > 1.3))) { e.style.visibility = 'hidden'; return null; }
    let x = (V.x * 0.5 + 0.5) * innerWidth, y = (-V.y * 0.5 + 0.5) * innerHeight + dy;
    if (keepIn) {                                                                   // a speech bubble stays whole on the screen, its tail toward the speaker
      const hw = e.offsetWidth / 2 + 8;
      x = Math.max(hw, Math.min(innerWidth - hw, x)); y = Math.max(e.offsetHeight + 120, Math.min(innerHeight - 160, y));
    }
    e.style.visibility = ''; e.style.left = `${x.toFixed(1)}px`; e.style.top = `${y.toFixed(1)}px`;
    return { x, y };
  }
  /** A short word floating up from a screen point (the grade of a step, « ✓ »…). */
  word(text: string, cls: string, x: number, y: number) {
    const w = this.add(`iw-word ${cls}`, esc(text)); w.style.left = `${x}px`; w.style.top = `${y}px`;
    this.words.push({ el: w, t: 0 });
  }
  /** The small result card at the top: a title, a percentage, a line, a few marks. Stays `seconds`. */
  showCard(o: { title: string; pct: number; line: string; marks?: boolean[]; top?: boolean }, seconds = 3.6) {
    this.card?.remove();
    const marks = o.marks?.length ? `<div class="m">${o.marks.map(m => `<i class="${m ? 'on' : ''}"></i>`).join('')}</div>` : '';
    this.card = this.add(`iw-card${o.top ? ' top' : ''}`, `<div class="t"><span>${esc(o.title)}</span><span class="q">${Math.round(o.pct * 100)} %</span></div><div class="l">${esc(o.line)}</div>${marks}`);
    this.cardT = seconds;
  }
  get cardShown() { return !!this.card; }
  tick(dt: number) {
    if (this.card && (this.cardT -= dt) <= 0) { this.card.remove(); this.card = null; }
    for (const w of this.words) { w.t += dt; const k = Math.min(1, w.t / 0.65); w.el.style.opacity = String(1 - k); w.el.style.marginTop = `${-34 * k}px`; if (k >= 1) w.el.remove(); }
    this.words = this.words.filter(w => w.t < 0.65);
  }
  dispose() { this.el.remove(); this.card = null; }
}

/** A framing camera: eases from the follow camera's view to the activity's, holds it. */
export class FrameCam {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private on = false;
  /** Sets the camera toward (pos, look) this frame. */
  frame(camera: THREE.Camera, pos: THREE.Vector3, look: THREE.Vector3, dt: number, rate = 3.2) {
    if (!this.on) {
      this.on = true; this.pos.copy(camera.position);
      camera.getWorldDirection(V); this.look.copy(camera.position).addScaledVector(V, pos.distanceTo(look));
    }
    const a = 1 - Math.exp(-dt * rate);
    this.pos.lerp(pos, a); this.look.lerp(look, a);
    camera.position.copy(this.pos); camera.lookAt(this.look);
  }
  release() { this.on = false; }
  get active() { return this.on; }
}
