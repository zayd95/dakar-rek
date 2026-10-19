/**
 * Touch driving controls: the joystick steers, two buttons held with the right thumb give the gas and the brake, and
 * « Descendre » shows when the vehicle is stopped. A car also has « R » (reverse gear, only while stopped) so that the
 * brake never backs it up by itself, and every vehicle a « Vue » button for its cameras. One pad for the page; the module
 * that is being driven takes it (`show`) and gives it back (`hide`). Desktop drivers keep the keys.
 */
import './ridePad.css';

type Owner = object;
export interface PadOptions {
  /** A car: bigger pedals and the reverse gear. */
  car?: boolean;
  /** « Vue »: next camera. */
  view?: () => void;
}
let root: HTMLDivElement | null = null, gasB: HTMLButtonElement, brakeB: HTMLButtonElement, offB: HTMLButtonElement, revB: HTMLButtonElement, viewB: HTMLButtonElement;
let owner: Owner | null = null, onDescend: (() => void) | null = null, onView: (() => void) | null = null;
export const ridePad = {
  gas: false, brake: false,
  /** Reverse gear selected (a car, stopped): the gas then backs up. */
  reverse: false,
  get active() { return owner !== null; },
  /** Gas − brake, in −1…1 (a motorbike: the brake backs it up once stopped, as before). */
  get throttle() { return (this.gas ? 1 : 0) - (this.brake ? 1 : 0); },
  /** Builds the pad (once) in the HUD layer. */
  init(parent: HTMLElement) {
    if (root) return;
    root = document.createElement('div'); root.id = 'ridepad'; root.setAttribute('aria-hidden', 'true');
    const row = (cls: string) => { const r = document.createElement('div'); r.className = cls; root!.appendChild(r); return r; };
    const top = row('rp-top'), pedals = row('rp-pedals');
    const mk = (into: HTMLElement, cls: string, label: string) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; into.appendChild(b); return b; };
    offB = mk(top, 'rp-off', 'Descendre'); revB = mk(top, 'rp-rev', 'R'); viewB = mk(top, 'rp-view', 'Vue');
    brakeB = mk(pedals, 'rp-brake', 'Frein'); gasB = mk(pedals, 'rp-gas', 'Accélérer');
    revB.title = 'Marche arrière';
    const hold = (b: HTMLButtonElement, set: (on: boolean) => void) => {
      const up = () => { set(false); b.classList.remove('down'); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic or already released pointer: the buttons still work */ } set(true); b.classList.add('down'); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold(gasB, on => { this.gas = on; }); hold(brakeB, on => { this.brake = on; });
    // taps fire on release of the same button, so a tap with the second thumb works while the first one holds the gas (a browser may not synthesise a click then)
    const tap = (b: HTMLButtonElement, fn: () => void) => {
      let armed = false;
      b.addEventListener('pointerdown', e => { e.preventDefault(); armed = true; try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ } });
      b.addEventListener('pointerup', e => {
        if (!armed) return; armed = false;
        const r = b.getBoundingClientRect(); if (e.clientX < r.left - 8 || e.clientX > r.right + 8 || e.clientY < r.top - 8 || e.clientY > r.bottom + 8) return;   // slid off: no tap
        fn();
      });
      for (const t of ['pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, () => { armed = false; });
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('click', e => e.preventDefault());
    };
    tap(offB, () => onDescend?.());
    tap(viewB, () => onView?.());
    tap(revB, () => { this.reverse = !this.reverse; revB.classList.toggle('on', this.reverse); revB.textContent = this.reverse ? 'R · marche arrière' : 'R'; });
    parent.appendChild(root);
  },
  /** The driven vehicle shows the pad on touch screens; `stopped` shows « Descendre » (and the reverse gear of a car). */
  show(by: Owner, stopped: boolean, descend: () => void, o: PadOptions = {}) {
    if (!root || !document.body.classList.contains('touch')) return;
    owner = by; onDescend = descend; onView = o.view ?? null;
    document.body.classList.add('ridepad');
    document.body.classList.toggle('ridepad-car', !!o.car);
    root.classList.toggle('stopped', stopped);
    root.classList.toggle('canrev', !!o.car && (stopped || this.reverse));
  },
  /** Gives the pad back (only the module that holds it can). */
  hide(by: Owner) {
    if (owner !== by) return;
    owner = null; onDescend = null; onView = null; this.gas = false; this.brake = false; this.reverse = false;
    document.body.classList.remove('ridepad', 'ridepad-car'); root?.classList.remove('stopped', 'canrev');
    gasB?.classList.remove('down'); brakeB?.classList.remove('down'); revB?.classList.remove('on'); if (revB) revB.textContent = 'R';
  },
};
