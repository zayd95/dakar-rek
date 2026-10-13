import './stride.css';
import type { Stride } from '../game/stride';

/**
 * Running on foot: a « Courir » toggle for touch screens (beside the joystick) and a slim stamina gauge shown only while
 * it matters (running, or not yet full). Keyboard players hold Shift.
 */
export class StrideUi {
  /** Touch toggle state (keyboard uses Shift). */
  runToggle = false;
  private gauge: HTMLElement;
  private bar: HTMLElement;
  private btn: HTMLButtonElement;
  private idle = 0;
  private shown = false;

  constructor(root: HTMLElement, private stride: Stride) {
    this.gauge = document.createElement('div'); this.gauge.id = 'stamina';
    this.gauge.innerHTML = '<i></i><span>Endurance</span>';
    this.bar = this.gauge.querySelector('i')!;
    this.btn = document.createElement('button'); this.btn.id = 'runBtn'; this.btn.type = 'button';
    this.btn.innerHTML = '🏃<small>Courir</small>'; this.btn.setAttribute('aria-pressed', 'false');
    this.btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.setToggle(!this.runToggle); });
    root.append(this.gauge, this.btn);
  }

  private setToggle(on: boolean) { this.runToggle = on; this.btn.classList.toggle('on', on); this.btn.setAttribute('aria-pressed', String(on)); }

  /** Each frame: `moving` = the stick or keys are in use; `visible` = free movement is possible (not in a menu, a seat, a vehicle). */
  update(dt: number, moving: boolean, visible: boolean) {
    // the touch toggle turns itself off after a second without moving
    this.idle = moving ? 0 : this.idle + dt;
    if (this.runToggle && this.idle > 1) this.setToggle(false);
    const s = this.stride, max = s.maxStamina(), full = s.stamina >= max - 0.5;
    const show = visible && (s.running || !full);
    if (show !== this.shown) { this.shown = show; this.gauge.classList.toggle('on', show); }
    if (show) {
      this.bar.style.width = `${(s.stamina / max) * 100}%`;
      this.gauge.classList.toggle('low', s.winded || s.stamina < max * 0.2);
    }
    this.btn.classList.toggle('hidden', !visible);
    this.btn.classList.toggle('blocked', !!s.whyNot());
  }
}
