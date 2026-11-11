/**
 * The compact speedometer: the driven vehicle's ACTUAL speed in km/h, a number and its unit in a small disc, shown only while the player is at the wheel or the handlebar
 * (never on foot, never as a passenger). One for the page; the vehicle that is driven takes it (`show`, every frame) and gives it back (`hide`), as with the driving pad
 * (src/transport/ridePad.ts). It stands on the left edge, above the steering pad and clear of it, away from the pedals, the minimap and the phone button (speedo.css).
 *
 * The speed is the distance the vehicle really covered this frame over the frame's time (the drive's odometer), not the speed its engine asks for: a car held against a wall
 * reads 0, a car scraping along one reads what it really does. No per-frame layout: the text is written only when the whole number changes, and at most `EVERY` times a
 * second (a figure that flickers through 25 values a second under acceleration cannot be read); the disc has a fixed size and tabular figures, so a new number moves nothing.
 */
import './speedo.css';

type Owner = object;
/** The least time (s) between two changes of the figure. */
export const EVERY = 0.1;
/** m/s → the whole km/h shown (a creep under half a km/h reads 0). */
export const kmhOf = (metresPerSecond: number) => Math.round(Math.abs(metresPerSecond) * 3.6);
/** The actual speed (m/s) from the metres covered in `dt` seconds; 0 for a frame with no time in it. */
export const speedOver = (metres: number, dt: number) => (dt > 1e-6 ? Math.abs(metres) / dt : 0);

let root: HTMLDivElement | null = null, num: HTMLElement | null = null, owner: Owner | null = null, shown = -1, since = 0, writes = 0;
export const speedo = {
  /** Builds it (once) in the HUD layer, hidden. */
  init(parent: HTMLElement) {
    if (root) return;
    root = document.createElement('div'); root.id = 'speedo'; root.setAttribute('role', 'img'); root.setAttribute('aria-label', 'Vitesse');
    num = document.createElement('b'); num.textContent = '0';
    const unit = document.createElement('span'); unit.textContent = 'km/h';
    root.append(num, unit); parent.appendChild(root);
  },
  /** The driven vehicle's actual speed this frame (m/s), `dt` seconds after the last one: shows the speedometer and, when the whole km/h has changed, writes it. */
  show(by: Owner, metresPerSecond: number, dt: number) {
    if (!root || !num) return;
    if (owner !== by) { owner = by; shown = -1; since = EVERY; root.classList.add('on'); }
    since += dt;
    const kmh = kmhOf(metresPerSecond);
    if (kmh === shown || (since < EVERY && kmh !== 0)) return;                 // (a stop is shown at once: « 0 » must not lag behind a car that stands)
    shown = kmh; since = 0; writes++;
    num.textContent = String(kmh);
    root.setAttribute('aria-label', `Vitesse : ${kmh} km/h`);
  },
  /** Nobody drives it any more (only the vehicle that holds it can hide it). */
  hide(by: Owner) {
    if (owner !== by) return;
    owner = null; shown = -1; root?.classList.remove('on');
  },
  /** Shown now (the checks). */
  get active() { return owner !== null; },
  /** What it reads (« 43 km/h »; empty when hidden), and how many times its text was written (the checks: no write per frame). */
  get text() { return owner && shown >= 0 ? `${shown} km/h` : ''; },
  get writes() { return writes; },
};
