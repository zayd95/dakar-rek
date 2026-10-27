/**
 * Touch driving controls. The LEFT thumb has the steering pad (`#steerpad`: a wide rocker, left half and right half; the further out the thumb, the more it turns, never
 * less than 40 % once it is down, and the wheel follows smoothly). The RIGHT thumb has two pedals shaped as pedals: the wide flat « Frein » (brakes; a car held at a standstill
 * backs up gently, a subtle « R » shows only while it really reverses) and the tall ribbed « Accélérer » (the lower the toe, the more throttle: heel half-way, toe down to the floor
 * and it opens the boosted speed range). The joystick is not used while driving. « Descendre » shows when the vehicle is stopped, every vehicle has a « Vue » button for its cameras.
 * One pad for the page; the module that is being driven takes it (`show`) and gives it back (`hide`). Desktop drivers keep the keys (W / S, Shift for « Accélérer »).
 */
import './ridePad.css';

type Owner = object;
/** The wheel for a thumb at `u` on the steering rocker (−1 the left rim … 1 the right rim): nothing in the middle gap, then never less than 0.4, the rim 1. */
export const rockerSteer = (u: number) => { const m = Math.min(1, Math.abs(u)); return m < 0.06 ? 0 : Math.sign(u) * (0.4 + 0.6 * m); };
/** The throttle asked by a toe at `f` down the gas pedal (0 the heel … 1 the toe): from 0.35, and from BOOST_AT the toe is on the floor. */
export const gasPressure = (f: number) => 0.35 + 0.65 * Math.max(0, Math.min(1, f));
/** The toe on the floor (a throttle from this up) for this long (s) opens the boosted speed range. */
export const BOOST_AT = 0.9, BOOST_HOLD = 0.6;
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
/** The steering rocker and the pedal pressure: what the thumbs ask for (raw) and what the car is given (smoothed, one step a frame in `tick`). */
let steerEl: HTMLDivElement | null = null, padId = -1, padTarget = 0, padSteer = 0, gasRaw = 0.7, gasSm = 0, gasHeld = 0;
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
  /** Steering asked for by the rocker, smoothed (−1 left … 1 right). */
  get steer() { return padSteer; },
  /** Throttle asked for by the gas pedal, smoothed (0 … 1). */
  get gasAmount() { return gasSm; },
  /** The toe is down to the floor and has stayed there a moment: the boosted speed range opens. */
  get boostOn() { return this.gas && gasHeld > BOOST_HOLD; },
  /** One frame of the pad's smoothing (the pad's owner only): the wheel and the throttle follow the thumbs, never in a step. */
  tick(by: Owner, dt: number) {
    if (owner !== by) return;
    padSteer += (padTarget - padSteer) * Math.min(1, dt * (padTarget === 0 ? 12 : 9));
    if (Math.abs(padSteer) < 0.01) padSteer = 0;
    const want = this.gas ? gasRaw : 0;
    gasSm += (want - gasSm) * Math.min(1, dt * (want > gasSm ? 5 : 10));
    if (gasSm < 0.005) gasSm = 0;
    gasHeld = this.gas && gasRaw >= BOOST_AT ? gasHeld + dt : 0;
    steerEl?.style.setProperty('--u', padSteer.toFixed(2));
  },
  /** Touches the Klaxon button has received (down, up, cancelled): the evidence on a phone that a thumb reached it. */
  get touches() { return { ...seen }; },
  /** The horn button went down or up: told at once, from the event itself, not at the next frame (the sound starts with the touch). Only the pad's owner may set it. */
  onHorn(by: Owner, fn: ((on: boolean) => void) | null) { if (owner === by) onHorn = fn; },
  /** Builds the pad (once) in the HUD layer. */
  init(parent: HTMLElement) {
    if (root) return;
    if (typeof location !== 'undefined' && /[?&]klaxon\b/.test(location.search)) document.body.classList.add('klaxon');   // (kept for the checks' links: the horn button is on the pad now, ridePad.css)
    root = document.createElement('div'); root.id = 'ridepad'; root.setAttribute('aria-hidden', 'true');
    const row = (cls: string) => { const r = document.createElement('div'); r.className = cls; root!.appendChild(r); return r; };
    const top = row('rp-top'), pedals = row('rp-pedals');
    const mk = (into: HTMLElement, cls: string, label: string) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; into.appendChild(b); return b; };
    extraB = mk(top, 'rp-extra', ''); offB = mk(top, 'rp-off', 'Descendre'); hornB = mk(top, 'rp-horn', 'Klaxon'); radioB = mk(top, 'rp-radio', '📻'); radioB.setAttribute('aria-label', 'Radio : station suivante'); viewB = mk(top, 'rp-view', 'Vue');
    brakeB = mk(pedals, 'rp-brake', 'Frein'); gasB = mk(pedals, 'rp-gas', 'Accélérer');
    for (const b of [brakeB, gasB]) { const t = b.textContent ?? ''; b.textContent = ''; const l = document.createElement('span'); l.className = 'rp-lbl'; l.textContent = t; b.appendChild(l); }
    const rb = document.createElement('div'); rb.className = 'rp-r'; rb.textContent = 'R'; rb.setAttribute('aria-hidden', 'true'); pedals.insertBefore(rb, brakeB);   // shown only while the vehicle really reverses
    const hold = (b: HTMLButtonElement, set: (on: boolean) => void, count?: (what: 'down' | 'up' | 'cancel') => void) => {
      const up = (e: Event) => { if (e.type === 'pointerup') count?.('up'); else if (e.type === 'pointercancel') count?.('cancel'); set(false); b.classList.remove('down'); };   // lostpointercapture follows every up: not counted
      b.addEventListener('pointerdown', e => { e.preventDefault(); count?.('down'); try { b.setPointerCapture?.(e.pointerId); } catch { /* a synthetic or already released pointer: the buttons still work */ } set(true); b.classList.add('down'); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(t, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold(gasB, on => { this.gas = on; }); hold(brakeB, on => { this.brake = on; });
    // the gas pedal is pressed by the toe: the lower on the pedal the thumb is, the more throttle (the heel half-way, the floor opens the boost)
    const gasAt = (e: PointerEvent) => { const r = gasB.getBoundingClientRect(); gasRaw = gasPressure((e.clientY - r.top) / Math.max(1, r.height)); gasB.style.setProperty('--p', gasRaw.toFixed(2)); };
    gasB.addEventListener('pointerdown', gasAt); gasB.addEventListener('pointermove', e => { if (this.gas) gasAt(e); });
    // the steering rocker: left half and right half under the left thumb; where the thumb is on it (centre 0, the outer edges ±1) sets how far the wheel turns
    steerEl = document.createElement('div'); steerEl.id = 'steerpad'; steerEl.setAttribute('aria-hidden', 'true');
    steerEl.innerHTML = '<i class="sp-l"></i><i class="sp-r"></i><b class="sp-k"></b>';
    const steerAt = (e: PointerEvent) => {
      const r = steerEl!.getBoundingClientRect(), u = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      padTarget = rockerSteer(u);
      steerEl!.classList.toggle('l', padTarget < 0); steerEl!.classList.toggle('r', padTarget > 0);
    };
    const steerEnd = (e: PointerEvent) => { if (e.pointerId !== padId) return; padId = -1; padTarget = 0; steerEl!.classList.remove('l', 'r'); };
    steerEl.addEventListener('pointerdown', e => { e.preventDefault(); if (padId >= 0) return; padId = e.pointerId; try { steerEl!.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ } steerAt(e); });
    steerEl.addEventListener('pointermove', e => { if (e.pointerId === padId) steerAt(e); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) steerEl.addEventListener(t, steerEnd);
    steerEl.addEventListener('contextmenu', e => e.preventDefault());
    hold(hornB, on => { this.horn = on; onHorn?.(on); }, what => { if (what === 'down') seen.hornDown++; else if (what === 'up') seen.hornUp++; else seen.hornCancel++; });
    // a touch the system takes away (a call, the app switcher, a banner) sends no « up » to a pedal under the thumb: everything is let go, the horn included, rather than left on
    const letGo = () => { this.gas = false; this.brake = false; padId = -1; padTarget = 0; steerEl?.classList.remove('l', 'r'); if (this.horn) { this.horn = false; onHorn?.(false); } gasB.classList.remove('down'); brakeB.classList.remove('down'); hornB.classList.remove('down'); };
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
    parent.appendChild(root); parent.appendChild(steerEl);
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
    padId = -1; padTarget = 0; padSteer = 0; gasSm = 0; gasHeld = 0; steerEl?.classList.remove('l', 'r'); steerEl?.style.setProperty('--u', '0');
    document.body.classList.remove('ridepad', 'ridepad-car', 'ridepad-radio'); root?.classList.remove('stopped', 'reversing', 'extra');
    gasB?.classList.remove('down'); brakeB?.classList.remove('down'); hornB?.classList.remove('down');
  },
};
