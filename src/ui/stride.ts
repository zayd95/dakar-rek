import './stride.css';
import type { Stride } from '../game/stride';

/**
 * Running on foot: a slim stamina gauge shown only while it matters (running, or not yet full), labelled « Footing » or « Sprint » while
 * running. On a phone the joystick alone sets the pace (src/game/stride.ts analog: a light push walks slowly, a full one sprints), so there is no
 * « Courir » button any more; keyboard players hold Shift (jog) or double-tap it and hold (sprint). `level` stays as a debug / test override.
 */
export class StrideUi {
  /** Forced gait for the debug API and the checks (the phone has no button; the keyboard uses Shift): 0 none, 1 jogging, 2 sprinting. */
  level: 0 | 1 | 2 = 0;
  get runToggle() { return this.level > 0; }
  set runToggle(on: boolean) { this.setLevel(on ? 1 : 0); }
  private gauge: HTMLElement; private label: HTMLElement;
  private bar: HTMLElement;
  private idle = 0;
  private shown = false;

  constructor(root: HTMLElement, private stride: Stride) {
    this.gauge = document.createElement('div'); this.gauge.id = 'stamina';
    this.gauge.innerHTML = '<i></i><span>Endurance</span>';
    this.bar = this.gauge.querySelector('i')!; this.label = this.gauge.querySelector('span')!;
    root.append(this.gauge);
  }

  private setLevel(l: 0 | 1 | 2) {
    this.idle = 0;
    this.level = l;
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
  }
}
