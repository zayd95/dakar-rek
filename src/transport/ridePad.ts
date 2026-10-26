/**
 * Touch driving controls: the joystick steers AND gives the throttle (forward = speed, left / right = steering), and two buttons
 * held with the right thumb: « Accélérer » (the boosted speed range) and « Frein » (brakes; a car held at a standstill backs up
 * gently, a subtle « R » shows only while it really reverses). « Descendre » shows when the vehicle is stopped, every vehicle has
 * a « Vue » button for its cameras. One pad for the page; the module that is being driven takes it (`show`) and gives it back
 * (`hide`). Desktop drivers keep the keys (W / S, Shift for « Accélérer »).
 */
import './ridePad.css';

type Owner = object;
export interface PadOptions {
  /** A car: bigger buttons. */
  car?: boolean;
  /** « Vue »: next camera. */
  view?: () => void;
  /** « 📻 »: the car's radio, next station (a car only). */
  radio?: () => void;
}
let root: HTMLDivElement | null = null, gasB: HTMLButtonElement, brakeB: HTMLButtonElement, offB: HTMLButtonElement, viewB: HTMLButtonElement, hornB: HTMLButtonElement, radioB: HTMLButtonElement, extraB: HTMLButtonElement;
/** An action another module offers at the wheel where the vehicle stands (LD2.0-D: « Garer à la villa »), shown above « Descendre ». */
let extraAct: { label: string; run(): void } | null = null;
let owner: Owner | null = null, onDescend: (() => void) | null = null, onView: (() => void) | null = null, onHorn: ((on: boolean) => void) | null = null, onRadio: (() => void) | null = null;
/** What the pad's own buttons count (the on-device diagnostics: whether a thumb's touch reached the Klaxon button at all). */
const seen = { hornDown: 0, hornUp: 0, hornCancel: 0 };
export const ridePad = {
  gas: false, brake: false,
  /** The horn, held. */
  horn: false,
  /** The vehicle is really moving backwards (set by the driven module): the subtle « R » badge shows. */
  get reversing() { return root?.classList.contains('reversing') ?? false; },
  set reversing(on: boolean) { root?.classList.toggle('reversing', on); },
  get active() { return owner !== null; },
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
    extraB = mk(top, 'rp-extra', ''); offB = mk(top, 'rp-off', 'Descendre'); hornB = mk(top, 'rp-horn', 'Klaxon'); radioB = mk(top, 'rp-radio', '📻'); radioB.setAttribute('aria-label', 'Radio : station suivante'); viewB = mk(top, 'rp-view', 'Vue');
    brakeB = mk(pedals, 'rp-brake', 'Frein'); gasB = mk(pedals, 'rp-gas', 'Accélérer');
    const rb = document.createElement('div'); rb.className = 'rp-r'; rb.textContent = 'R'; rb.setAttribute('aria-hidden', 'true'); pedals.insertBefore(rb, brakeB);   // shown only while the vehicle really reverses
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
    tap(extraB, () => extraAct?.run());
    tap(viewB, () => onView?.());
    tap(radioB, () => onRadio?.());
    parent.appendChild(root);
  },
  /** The driven vehicle shows the pad on touch screens; `stopped` shows « Descendre » (and the reverse gear of a car). */
  show(by: Owner, stopped: boolean, descend: () => void, o: PadOptions = {}) {
    if (!root || !document.body.classList.contains('touch')) return;
    owner = by; onDescend = descend; onView = o.view ?? null; onRadio = o.radio ?? null;
    document.body.classList.add('ridepad');
    document.body.classList.toggle('ridepad-radio', !!o.radio);
    document.body.classList.toggle('ridepad-car', !!o.car);
    root.classList.toggle('stopped', stopped);
  },
  /** The extra action of the moment (null: none), for the pad's owner only; its label is written only when it changes. */
  extra(by: Owner, a: { label: string; run(): void } | null) {
    if (!root || owner !== by) return;
    if (a?.label !== extraAct?.label && a) extraB.textContent = a.label;
    extraAct = a;
    root.classList.toggle('extra', !!a);
  },
  get extraLabel() { return extraAct?.label ?? null; },
  /** Gives the pad back (only the module that holds it can). */
  hide(by: Owner) {
    if (owner !== by) return;
    if (this.horn) onHorn?.(false);
    owner = null; onDescend = null; onView = null; onHorn = null; onRadio = null; extraAct = null; this.gas = false; this.brake = false; this.horn = false;
    document.body.classList.remove('ridepad', 'ridepad-car', 'ridepad-radio'); root?.classList.remove('stopped', 'reversing', 'extra');
    gasB?.classList.remove('down'); brakeB?.classList.remove('down'); hornB?.classList.remove('down');
  },
};
