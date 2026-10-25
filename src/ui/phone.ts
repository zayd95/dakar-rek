/**
 * The character's phone: the player's life hub (where they are, their work, their life, their home, their money) and every setting. It opens over the
 * running game (online play is never paused), keeps its navigation between openings, and works in portrait, landscape and with touch; on a phone it
 * fills the screen, on a large screen it is a handset.
 *
 * This file is the shell: lifecycle (open, close), navigation (a stack of screens, back, home), the header and the status line, the in-phone
 * confirmation, and the once-a-second tick. The apps are modules of their own (src/ui/phone/apps/*.ts) listed in one registry
 * (src/ui/phone/registry.ts), drawn with the shared pieces of src/ui/phone/kit.ts and the selectors of src/ui/phone/selectors.ts. Apps provided by other
 * modules come from phoneHooks. Each screen draws into a page element of its own, removed (with its listeners) when the screen leaves.
 */
import './phone.css';
import type { GameState } from '../core/state';
import type { Input } from '../core/input';
import type { HubId } from '../core/types';
import { cityTimeAt } from '../core/clock';
import { isMuted } from '../core/audioSettings';
import './theme.css';
import type { Relations } from '../social/relations';
import { phoneHooks } from './phoneHooks';
import type { PhoneApi, Screen } from './phone/types';
import { appById } from './phone/registry';
import { homeScreen, appsScreen, clock } from './phone/apps/home';
import { profileScreen } from './phone/apps/profile';
import { moneyScreen } from './phone/apps/money';
import { bankScreen } from './phone/apps/bank';
import { workScreen } from './phone/apps/work';
import { houseScreen } from './phone/apps/house';
import { mapScreen } from './phone/apps/map';
import { settingsScreen, newGameScreen, soundTestScreen, restoreSensitivity } from './phone/apps/settings';
import { arenaScreen, calcScreen, clockScreen, healthScreen, helpScreen, lutteursScreen, newsScreen, tonightScreen, weatherScreen } from './phone/apps/misc';
import { carnetScreen, notifsScreen } from './phone/apps/social';

export type Quality = 'low' | 'medium' | 'high';

export interface PhoneContext {
  state: GameState;
  rel: Relations;
  input: Input;
  /** Hub the player is in (null while loading). */
  hub: () => HubId | null;
  /** Names of the places of the current hub (world interactables, people excluded). */
  places: () => string[];
  /** Shared city clock source (server time when online). */
  now: () => number;
  quality: () => Quality;
  /** Rebuilds the hub at the new quality, keeping the player inside a room if they are in one. */
  setQuality: (q: Quality) => void;
  save: () => boolean;
  newGame: () => void;
  toast: (msg: string) => void;
  /** true: the phone took over (movement off, controls reset). false: back to the game unless something else is open. */
  lock: (on: boolean) => void;
}

/** Every screen of the phone, by id (the ids are kept from the first phone: checks and other modules open them by name). */
const SCREENS: Record<string, Screen> = {
  home: homeScreen, apps: appsScreen, profil: profileScreen, portefeuille: moneyScreen, travailler: workScreen, logement: houseScreen, carte: mapScreen,
  reglages: settingsScreen, nouvelle: newGameScreen, sontest: soundTestScreen,
  notifs: notifsScreen, sante: healthScreen, carnet: carnetScreen, arene: arenaScreen, lutteurs: lutteursScreen, cesoir: tonightScreen,
  actus: newsScreen, meteo: weatherScreen, horloge: clockScreen, calcul: calcScreen, aide: helpScreen, banque: bankScreen,
};
/** Other names a screen is opened by: « progression » is the Profile on its Progression tab (the HUD's streak chip). */
const ALIASES: Record<string, [string, string?]> = { progression: ['profil', 'progression'], argent: ['portefeuille'], maison_hub: ['logement'], travail_hub: ['travailler'] };
type Entry = { id: string; arg?: string };

const PLACES_KEY = 'dakarrek.phone.places';
/** A tap that lands this soon after a screen changed is the second half of a double tap: it is dropped (no accidental tap on the new screen). */
const SETTLE_MS = 320;
const BATT = `<svg class="ph-batt" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity=".45"/><rect class="lvl" x="2" y="2" width="20" height="9" rx="2.2"/><path d="M25 4.4v4.2c.9-.3 1.6-1.1 1.6-2.1s-.7-1.8-1.6-2.1z" opacity=".45"/></svg>`;
/** Wallpaper skyline: Dakar's buildings, a minaret, the Monument de la Renaissance on its hill and the Mamelles lighthouse. */
const SKYLINE = `<svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMax slice">
  <path class="far" d="M0 170V118h12V96h14v22h10V84h16v34h8V100h12V70h10v-8h6v8h10v48h10V92h18v26h12V104h14v14h16V86h12V74h14v44h10V96h16v22h14V90h18v28h10V80h14v38h12V98h16v20h14V88h14v30h16v52z"/>
  <path d="M0 170V132h18v-10h16v10h10V114h20v18h8V108h3V58l4-14 4 14v50h3v24h12V118h18v14h10l14-12c14-11 30-15 42-15s26 5 36 14l12 13h8V112h22v20h10V104h16v28h10l16-14c9-7 19-7 28 0l14 14h8v-8h16v12h12V114h20v18h10v38z"/>
  <path d="M243 106h24v6h-24z"/><path d="M246 106l2-22-4-9 2-10 5-4 5 3-1 9 5 7-2 26z"/><path d="M238 106l2-18-4-9 3-8 5 1 1 12-1 22z"/>
  <path d="M255 64l10-15 4-5 3 2-4 6-9 15z"/><circle cx="270" cy="40" r="3.4"/><path d="M267 42l-2 7 4 1 3-7z"/>
  <g transform="translate(-42 4)"><path d="M334 118h9V92l2-7h5l2 7v26h9z"/><circle cx="347.5" cy="81" r="3.6"/></g>
  <path d="M104 132V98h4V62l3.5-12 3.5 12v36h4v34z"/><path d="M122 132v-12a11 11 0 0 1 22 0v12z"/></svg>`;
function store(): Storage | null { try { return window.localStorage; } catch { return null; } }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class Phone {
  readonly el = document.createElement('div');
  /** Shared app hooks (exposed for debug checks). */
  readonly hooks = phoneHooks;
  private screenEl: HTMLElement;
  private timeEl: HTMLElement;
  private battEl: SVGRectElement;
  private titleEl: HTMLElement;
  private backEl: HTMLButtonElement;
  private homeEl: HTMLButtonElement;
  private toastEl: HTMLElement;
  /** Navigation stack below the home screen; kept between openings. */
  private stack: Entry[] = [];
  private timer = 0;
  private toastTimer = 0;
  /** The page showing, its screen and its cleanup. */
  private page: HTMLElement | null = null;
  private shown: Entry | null = null;
  private cleanup: (() => void) | null = null;
  private mountedAt = 0;
  /** Places seen in each hub, remembered on this device. */
  private known: Partial<Record<HubId, string[]>> = {};
  private api: PhoneApi;

  constructor(private ctx: PhoneContext) {
    this.el.id = 'phone';
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'Téléphone'); this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<div class="ph-stage">
        <div class="ph-device"><div class="ph-glass">
          <div class="ph-wall" aria-hidden="true">${SKYLINE}</div>
          <div class="ph-status"><span class="ph-time"></span><span class="ph-island" aria-hidden="true"></span><span class="ph-sys" aria-hidden="true">${BATT}</span></div>
          <header class="ph-head">
            <button type="button" class="ph-nav ph-backbtn" data-nav="back" aria-label="Retour"><span class="ph-chev" aria-hidden="true">‹</span><span class="ph-back">Accueil</span></button>
            <h2></h2>
            <span class="ph-head-end">
              <button type="button" class="ph-nav ph-homebtn" data-nav="home" aria-label="Écran d’accueil">⌂</button>
              <button type="button" class="ph-nav ph-close" data-nav="close" aria-label="Fermer le téléphone"><span aria-hidden="true">✕</span><span class="ph-close-tx">Fermer</span></button>
            </span>
          </header>
          <div class="ph-screen"></div>
          <div class="ph-toast" role="status" aria-live="polite"></div>
        </div></div>
      </div>`;
    this.screenEl = this.el.querySelector('.ph-screen')!;
    this.timeEl = this.el.querySelector('.ph-time')!;
    this.battEl = this.el.querySelector('.ph-batt .lvl')!;
    this.titleEl = this.el.querySelector('.ph-head h2')!;
    this.backEl = this.el.querySelector('[data-nav="back"]')!;
    this.homeEl = this.el.querySelector('[data-nav="home"]')!;
    this.toastEl = this.el.querySelector('.ph-toast')!;
    // Taps on the phone never reach the joystick or the camera drag underneath.
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    this.el.addEventListener('click', e => { if (e.target === this.el || (e.target as HTMLElement).classList?.contains('ph-stage')) this.close(); });
    this.backEl.addEventListener('click', () => this.back());
    this.homeEl.addEventListener('click', () => { this.stack = []; this.render(); });
    this.el.querySelector('[data-nav="close"]')!.addEventListener('click', () => this.close());
    // the second tap of a double tap lands on the new screen: dropped
    this.screenEl.addEventListener('click', e => { if (performance.now() - this.mountedAt < SETTLE_MS) { e.stopPropagation(); e.preventDefault(); } }, true);
    // the shared actions of every screen: open an app, go to a screen of the phone
    this.screenEl.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const app = t.closest<HTMLElement>('[data-app]'); if (app) { this.openApp(app.dataset.app!); return; }
      const go = t.closest<HTMLElement>('[data-go]'); if (go) this.go(go.dataset.go!, go.dataset.arg);
    });
    document.body.appendChild(this.el);
    try { this.known = JSON.parse(store()?.getItem(PLACES_KEY) ?? '{}') ?? {}; } catch { this.known = {}; }
    restoreSensitivity(ctx.input);
    this.api = {
      ctx, go: (id, arg) => this.go(id, arg), back: () => this.back(), home: () => { this.stack = []; this.render(); },
      openApp: id => this.openApp(id), launch: fn => this.launch(fn), rerender: () => this.render(true), notify: (m, k) => this.notify(m, k),
    };
  }

  get isOpen() { return this.el.classList.contains('on'); }
  /** Draws the open screen again (a picture or a value it shows became ready). */
  refresh() { if (this.isOpen) this.render(true); }
  get current(): string { return this.stack[this.stack.length - 1]?.id ?? 'home'; }

  /** Opens the phone where it was left, or on the given app (an app id, a screen id, an alias, or 'home'). Returns false for an unknown app. */
  open(app?: string): boolean {
    if (app) {
      const a = appById(app);
      if (a?.hook) { const fn = a.hook(); if (!fn) return false; this.launch(fn); return true; }
      const [id, arg] = ALIASES[app] ?? [a?.screen ?? app];
      if (!SCREENS[id]) return false;
      this.stack = id === 'home' ? [] : [{ id, arg }];
    }
    this.remember();
    if (!this.isOpen) {
      this.el.classList.add('on'); this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('phone-open');
      this.ctx.lock(true);
      this.timer = window.setInterval(() => this.tick(), 1000);
    }
    this.render();
    return true;
  }
  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on'); this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phone-open');
    clearInterval(this.timer); this.unmount();
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) document.activeElement.blur();
    this.ctx.lock(false);
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  /** Debug/test summary. */
  info() { return { open: this.isOpen, screen: this.current, arg: this.stack[this.stack.length - 1]?.arg ?? null, depth: this.stack.length, muted: isMuted(), sensitivity: this.ctx.input.sensitivity, quality: this.ctx.quality() }; }
  back() { if (this.stack.length) { this.stack.pop(); this.render(); } else this.close(); }

  /** Records the places of the hub the player is in (Carte). */
  remember() {
    const hub = this.ctx.hub(); if (!hub) return;
    const names = [...new Set(this.ctx.places())];
    if (!names.length || (this.known[hub] && this.known[hub]!.join('|') === names.join('|'))) return;
    this.known[hub] = names;
    try { store()?.setItem(PLACES_KEY, JSON.stringify(this.known)); } catch { /* session only */ }
  }

  private go(id: string, arg?: string) {
    const [sid, a] = ALIASES[id] ?? [id, arg];
    if (!SCREENS[sid]) { this.openApp(id); return; }
    if (sid === 'home') { this.stack = []; this.render(); return; }
    this.stack.push({ id: sid, arg: a ?? arg }); this.render();
  }
  /** An app of the registry: its screen, or the module's own app (the phone closes and hands over). */
  private openApp(id: string) {
    const a = appById(id);
    const fn = a?.hook?.();
    if (fn) this.launch(fn); else if (a?.screen) this.go(a.screen); else if (SCREENS[id]) this.go(id);
  }
  /** Apps from other modules: close the phone and hand over. */
  private launch(fn: () => void) { this.close(); fn(); this.ctx.lock(false); }   // settle again: the app may have opened a menu

  private notify(msg: string, kind: 'ok' | 'warn' = 'ok') {
    this.ctx.toast(msg);                                                      // read out and logged by the game as before
    const t = this.toastEl; t.textContent = msg; t.className = `ph-toast on ${kind}`;
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => { t.className = 'ph-toast'; }, 2200);
  }

  private tick() {
    this.status();
    const s = this.shown && SCREENS[this.shown.id];
    if (s?.tick && this.page) s.tick(this.page, this.api);
  }
  private status() {
    const t = cityTimeAt(this.ctx.now());
    this.timeEl.textContent = clock(t.hour, t.minute);
    this.battEl.setAttribute('width', String(Math.max(2, 20 * clamp01((this.ctx.state.data.needs.energie ?? 100) / 100))));
  }

  private unmount() {
    try { this.cleanup?.(); } catch { /* a screen's cleanup never blocks the phone */ }
    this.cleanup = null; this.page?.remove(); this.page = null; this.shown = null;
  }

  /** Draws the screen on top of the stack (`keep`: the same screen again, its scroll kept). */
  private render(keep = false) {
    this.status();
    const top = this.stack[this.stack.length - 1] ?? { id: 'home' }, screen = SCREENS[top.id] ?? homeScreen;
    const same = keep && this.shown && this.shown.id === top.id, scroll = same ? this.screenEl.scrollTop : 0;
    this.unmount();
    this.el.dataset.screen = top.id;
    this.el.dataset.look = screen.look ?? 'app';
    const title = typeof screen.title === 'function' ? screen.title(top.arg) : screen.title;
    this.titleEl.textContent = top.id === 'home' ? '' : title;
    const prev = this.stack[this.stack.length - 2];
    this.backEl.disabled = top.id === 'home';
    this.backEl.querySelector('.ph-back')!.textContent = prev ? this.titleOf(prev) : 'Accueil';
    this.backEl.setAttribute('aria-label', `Retour : ${prev ? this.titleOf(prev) : 'Accueil'}`);
    this.homeEl.hidden = this.stack.length < 2;
    const page = document.createElement('div');
    page.className = `ph-page pg-${top.id}`;
    this.screenEl.appendChild(page);
    this.page = page; this.shown = top;
    if (!same) this.mountedAt = performance.now();
    try { this.cleanup = screen.mount(page, this.api, top.arg) ?? null; }
    catch (err) { page.innerHTML = '<div class="pk-empty"><i aria-hidden="true">⚠️</i><p>Cette app n’a pas pu s’ouvrir. Réessaie dans un instant.</p></div>'; console.error(err); }
    this.screenEl.scrollTop = scroll;
  }
  private titleOf(e: Entry) { const s = SCREENS[e.id]; return s ? (typeof s.title === 'function' ? s.title(e.arg) : s.title) : 'Accueil'; }
}
