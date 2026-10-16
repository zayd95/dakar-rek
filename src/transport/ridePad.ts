/**
 * Touch riding controls for a motorbike: the joystick steers, two buttons held with the thumb give the gas and the
 * brake, and « Descendre » shows when the bike is stopped. One pad for the page; the module that is being ridden takes
 * it (`show`) and gives it back (`hide`). Desktop riders keep the keys.
 */
import './ridePad.css';

type Owner = object;
let root: HTMLDivElement | null = null, gasB: HTMLButtonElement, brakeB: HTMLButtonElement, offB: HTMLButtonElement;
let owner: Owner | null = null, onDescend: (() => void) | null = null;
export const ridePad = {
  gas: false, brake: false,
  get active() { return owner !== null; },
  /** Gas − brake, in −1…1. */
  get throttle() { return (this.gas ? 1 : 0) - (this.brake ? 1 : 0); },
  /** Builds the pad (once) in the HUD layer. */
  init(parent: HTMLElement) {
    if (root) return;
    root = document.createElement('div'); root.id = 'ridepad'; root.setAttribute('aria-hidden', 'true');
    const mk = (cls: string, label: string) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; root!.appendChild(b); return b; };
    offB = mk('rp-off', 'Descendre'); brakeB = mk('rp-brake', 'Frein'); gasB = mk('rp-gas', 'Accélérer');
    const hold = (b: HTMLButtonElement, set: (on: boolean) => void) => {
      const up = () => { set(false); b.classList.remove('down'); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic or already released pointer: the buttons still work */ } set(true); b.classList.add('down'); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold(gasB, on => { this.gas = on; }); hold(brakeB, on => { this.brake = on; });
    offB.addEventListener('click', () => onDescend?.());
    parent.appendChild(root);
  },
  /** The ridden bike shows the pad on touch screens; `stopped` shows « Descendre ». */
  show(by: Owner, stopped: boolean, descend: () => void) {
    if (!root || !document.body.classList.contains('touch')) return;
    owner = by; onDescend = descend;
    document.body.classList.add('ridepad');
    root.classList.toggle('stopped', stopped);
  },
  /** Gives the pad back (only the module that holds it can). */
  hide(by: Owner) {
    if (owner !== by) return;
    owner = null; onDescend = null; this.gas = false; this.brake = false;
    document.body.classList.remove('ridepad'); root?.classList.remove('stopped');
    gasB?.classList.remove('down'); brakeB?.classList.remove('down');
  },
};
