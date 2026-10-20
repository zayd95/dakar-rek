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
let root: HTMLDivElement | null = null, gasB: HTMLButtonElement, brakeB: HTMLButtonElement, offB: HTMLButtonElement, revB: HTMLButtonElement, viewB: HTMLButtonElement, hornB: HTMLButtonElement;
let owner: Owner | null = null, onDescend: (() => void) | null = null, onView: (() => void) | null = null, onHorn: ((on: boolean) => void) | null = null;
/** What the pad's own buttons count (the on-device diagnostics: whether a thumb's touch reached the Klaxon button at all). */
const seen = { hornDown: 0, hornUp: 0, hornCancel: 0 };
export const ridePad = {
  gas: false, brake: false,
  /** The horn, held. */
  horn: false,
  /** Reverse gear selected (a car, stopped): the gas then backs up. */
  reverse: false,
  get active() { return owner !== null; },
  /** Gas − brake, in −1…1 (a motorbike: the brake backs it up once stopped, as before). */
  get throttle() { return (this.gas ? 1 : 0) - (this.brake ? 1 : 0); },
  /** Touches the Klaxon button has received (down, up, cancelled): the evidence on a phone that a thumb reached it. */
  get touches() { return { ...seen }; },
  /** The horn button went down or up: told at once, from the event itself, not at the next frame (the sound starts with the touch). Only the pad's owner may set it. */
  onHorn(by: Owner, fn: ((on: boolean) => void) | null) { if (owner === by) onHorn = fn; },
  /** Builds the pad (once) in the HUD layer. */
  init(parent: HTMLElement) {
    if (root) return;
    if (typeof location !== 'undefined' && /[?&]klaxon\b/.test(location.search)) document.body.classList.add('klaxon');   // the horn button is hidden unless asked for (ridePad.css)
    root = document.createElement('div'); root.id = 'ridepad'; root.setAttribute('aria-hidden', 'true');
    const row = (cls: string) => { const r = document.createElement('div'); r.className = cls; root!.appendChild(r); return r; };
    const top = row('rp-top'), pedals = row('rp-pedals');
    const mk = (into: HTMLElement, cls: string, label: string) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; into.appendChild(b); return b; };
    offB = mk(top, 'rp-off', 'Descendre'); revB = mk(top, 'rp-rev', 'R'); hornB = mk(top, 'rp-horn', 'Klaxon'); viewB = mk(top, 'rp-view', 'Vue');
    brakeB = mk(pedals, 'rp-brake', 'Frein'); gasB = mk(pedals, 'rp-gas', 'Accélérer');
    revB.title = 'Marche arrière';
    const hold = (b: HTMLButtonElement, set: (on: boolean) => void, count?: (what: 'down' | 'up' | 'cancel') => void) => {
      const up = (e: Event) => { if (e.type === 'pointerup') count?.('up'); else if (e.type === 'pointercancel') count?.('cancel'); set(false); b.classList.remove('down'); };   // lostpointercapture follows every up: not counted
      b.addEventListener('pointerdown', e => { e.preventDefault(); count?.('down'); try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic or already released pointer: the buttons still work */ } set(true); b.classList.add('down'); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold(gasB, on => { this.gas = on; }); hold(brakeB, on => { this.brake = on; });
    hold(hornB, on => { this.horn = on; onHorn?.(on); }, what => { if (what === 'down') seen.hornDown++; else if (what === 'up') seen.hornUp++; else seen.hornCancel++; });
    // a touch the system takes away (a call, the app switcher, a banner) sends no « up » to a pedal under the thumb: everything is let go, the horn included, rather than left on
    const letGo = () => { this.gas = false; this.brake = false; if (this.horn) { this.horn = false; onHorn?.(false); } gasB.classList.remove('down'); brakeB.classList.remove('down'); hornB.classList.remove('down'); };
    window.addEventListener('blur', letGo); document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
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
    if (this.horn) onHorn?.(false);
    owner = null; onDescend = null; onView = null; onHorn = null; this.gas = false; this.brake = false; this.reverse = false; this.horn = false;
    document.body.classList.remove('ridepad', 'ridepad-car'); root?.classList.remove('stopped', 'canrev');
    gasB?.classList.remove('down'); brakeB?.classList.remove('down'); hornB?.classList.remove('down'); revB?.classList.remove('on'); if (revB) revB.textContent = 'R';
  },
};
