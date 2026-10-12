import './stride.css';
import type { Stride } from '../game/stride';

/**
 * Running on foot: a « Courir » button for touch screens (beside the joystick: one press jogs, a second press while jogging,
 * or a double tap, sprints, a third stops) and a slim stamina gauge shown only while it matters (running, or not yet full),
 * labelled « Footing » or « Sprint » while running. Keyboard players hold Shift (jog) or double-tap it and hold (sprint).
 */
export class StrideUi {
  /** Touch button state (keyboard uses Shift): 0 walking, 1 jogging, 2 sprinting. */
  level: 0 | 1 | 2 = 0;
  get runToggle() { return this.level > 0; }
  set runToggle(on: boolean) { this.setLevel(on ? 1 : 0); }
  private gauge: HTMLElement; private label: HTMLElement;
  private bar: HTMLElement;
  private btn: HTMLButtonElement;
  private idle = 0;
  private shown = false;

  constructor(root: HTMLElement, private stride: Stride) {
    this.gauge = document.createElement('div'); this.gauge.id = 'stamina';
    this.gauge.innerHTML = '<i></i><span>Endurance</span>';
    this.bar = this.gauge.querySelector('i')!; this.label = this.gauge.querySelector('span')!;
    this.btn = document.createElement('button'); this.btn.id = 'runBtn'; this.btn.type = 'button';
    this.btn.innerHTML = '🏃<small>Courir</small>'; this.btn.setAttribute('aria-pressed', 'false');
    this.btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.setLevel(this.level === 0 ? 1 : this.level === 1 ? 2 : 0); });
    root.append(this.gauge, this.btn);
  }

  private setLevel(l: 0 | 1 | 2) {
    this.level = l; this.btn.classList.toggle('on', l > 0); this.btn.classList.toggle('sprint', l === 2); this.btn.setAttribute('aria-pressed', String(l > 0));
    this.btn.querySelector('small')!.textContent = l === 2 ? 'Sprint' : l === 1 ? 'Footing' : 'Courir';
  }

  /** Each frame: `moving` = the stick or keys are in use; `visible` = free movement is possible (not in a menu, a seat, a vehicle). */
  update(dt: number, moving: boolean, visible: boolean) {
    // the touch toggle turns itself off after a second without moving
    this.idle = moving ? 0 : this.idle + dt;
    if (this.level > 0 && this.idle > 1) this.setLevel(0);
    const s = this.stride, max = s.maxStamina(), full = s.stamina >= max - 0.5;
    const show = visible && (s.running || !full);
    if (show !== this.shown) { this.shown = show; this.gauge.classList.toggle('on', show); }
    if (show) {
      const word = s.gait === 'sprint' ? 'Sprint' : s.gait === 'jog' ? 'Footing' : 'Endurance';
      if (word !== this.label.textContent) this.label.textContent = word;
      this.bar.style.width = `${(s.stamina / max) * 100}%`;
      this.gauge.classList.toggle('low', s.winded || s.stamina < max * 0.2);
    }
    this.btn.classList.toggle('hidden', !visible);
    this.btn.classList.toggle('blocked', !!s.whyNot());
  }
}
