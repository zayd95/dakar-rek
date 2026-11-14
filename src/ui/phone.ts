/**
 * The character's phone: a smartphone the player carries, and the hub of their life (where they are, their work, their home, their money, their
 * messages) and every setting. It opens over the running game (online play is never paused), keeps its navigation between openings, and works in
 * portrait, landscape and with touch; on a phone it fills the screen, on a large screen it is a handset.
 *
 * This file is the shell, and it behaves like a phone's system:
 *   – a status bar on every screen: the CITY's time and day, the sky of the hour, the online account's state when the build has one, the player's
 *     energy as the battery, and « Fermer » (back to the game);
 *   – the home screen (src/ui/phone/apps/home.ts): every app one tap away, the four favourites in a dock;
 *   – inside an app, a header with « ‹ back » (a stack of screens) and, at the bottom of every screen, the home indicator: one tap returns to the home
 *     screen from anywhere. An app left that way is found again where it was (its sub-screen, its scroll) for the rest of the session;
 *   – the in-phone confirmation and the once-a-second tick.
 * Nothing touched in the phone reaches the game under it (the stick, the camera, the action button), and neither does the second half of a double tap
 * that opened or closed it.
 *
 * The apps are modules of their own (src/ui/phone/apps/*.ts) listed in one registry (src/ui/phone/registry.ts), drawn with the shared pieces of
 * src/ui/phone/kit.ts and the selectors of src/ui/phone/selectors.ts. Apps provided by other modules come from phoneHooks. Each screen draws into a page
 * element of its own, removed (with its listeners) when the screen leaves.
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
import { APPS, appById } from './phone/registry';
import { homeScreen, appsScreen, clock, dayName } from './phone/apps/home';
import { online } from '../online/api';
import { pistesScreen } from './phone/apps/pistes';
import { vehiclesScreen } from './phone/apps/vehicles';
import { profileScreen } from './phone/apps/profile';
import { moneyScreen } from './phone/apps/money';
import { bankScreen } from './phone/apps/bank';
import { workScreen } from './phone/apps/work';
import { houseScreen } from './phone/apps/house';
import { mapScreen } from './phone/apps/map';
import { settingsScreen, newGameScreen, soundTestScreen, restoreSensitivity } from './phone/apps/settings';
import { arenaScreen, calcScreen, clockScreen, healthScreen, helpScreen, lutteursScreen, newsScreen, skyAt, tonightScreen, weatherScreen } from './phone/apps/misc';
import { carnetScreen, notifsScreen } from './phone/apps/social';
import { messagesScreen } from './phone/apps/messages';

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
  actus: newsScreen, meteo: weatherScreen, horloge: clockScreen, calcul: calcScreen, aide: helpScreen, pistes: pistesScreen, banque: bankScreen,
  messages: messagesScreen, vehicules: vehiclesScreen,
};
/** Other names a screen is opened by: « progression » is the Profile on its Progression tab (the HUD's streak chip). */
const ALIASES: Record<string, [string, string?]> = { progression: ['profil', 'progression'], argent: ['portefeuille'], maison_hub: ['logement'], travail_hub: ['travailler'] };
/** One screen of the navigation stack, and where its list was scrolled to when it was last left (found again on « back », on reopening the phone). */
type Entry = { id: string; arg?: string; scroll?: number };
/** The online account's state in the status bar (shown only in a build that has the account). */
const NET: Record<string, [string, string]> = { online: ['on', 'En ligne'], connecting: ['wait', 'Connexion…'], reconnecting: ['wait', 'Reconnexion…'], offline: ['off', 'Hors ligne'] };

const PLACES_KEY = 'dakarrek.phone.places';
/** A tap that lands this soon after a screen changed is the second half of a double tap: it is dropped (no accidental tap on the new screen). */
const SETTLE_MS = 320;
/** How close to the first tap (px) the second half of a double tap lands. */
const DOUBLE_PX = 56;
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

/** Where the last finger (or mouse button) came up: what tells a double tap (the same spot, at once) from two taps. */
const lastUp = { x: 0, y: 0, t: -Infinity };
if (typeof document !== 'undefined') document.addEventListener('pointerup', e => { lastUp.x = e.clientX; lastUp.y = e.clientY; lastUp.t = e.timeStamp; }, true);
type Tap = { x: number; y: number; t: number };
/** The pointer tap being handled now (its finger came up a moment ago), or null (a key, a script). */
const tapNow = (): Tap | null => (performance.now() - lastUp.t < 700 ? { x: lastUp.x, y: lastUp.y, t: performance.now() } : null);
/** Is this click the second half of a double tap whose first half was `first` (the same spot, within the settle time)? */
const doubleOf = (e: MouseEvent, first: Tap | null) => !!first && e.detail > 0 && e.timeStamp - first.t < SETTLE_MS && Math.hypot(e.clientX - first.x, e.clientY - first.y) < DOUBLE_PX;

export class Phone {
  readonly el = document.createElement('div');
  /** Shared app hooks (exposed for debug checks). */
  readonly hooks = phoneHooks;
  private screenEl: HTMLElement;
  private timeEl: HTMLElement;
  private dayEl: HTMLElement;
  private skyEl: HTMLElement;
  private netEl: HTMLElement;
  private battEl: SVGRectElement;
  private energyEl: HTMLElement;
  private titleEl: HTMLElement;
  private backEl: HTMLButtonElement;
  private toastEl: HTMLElement;
  /** Navigation stack below the home screen; kept between openings. */
  private stack: Entry[] = [];
  /** The home screen's own entry (its scroll is kept like any screen's). */
  private readonly homeEntry: Entry = { id: 'home' };
  /** Apps left with the home indicator, by their first screen: found again where they were (this session). */
  private parked = new Map<string, Entry[]>();
  private timer = 0;
  private toastTimer = 0;
  /** The page showing, its screen and its cleanup. */
  private page: HTMLElement | null = null;
  private shown: Entry | null = null;
  private cleanup: (() => void) | null = null;
  private mountedAt = 0;
  /** The taps that opened and closed the phone (null: a key, a script): their double tap's second half is dropped. */
  private openTap: Tap | null = null;
  private closeTap: Tap | null = null;
  /** What the status bar shows (written only when it changes). */
  private statusShown = '';
  /** Places seen in each hub, remembered on this device. */
  private known: Partial<Record<HubId, string[]>> = {};
  private api: PhoneApi;

  constructor(private ctx: PhoneContext) {
    this.el.id = 'phone';
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'Téléphone'); this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<div class="ph-stage">
        <div class="ph-device"><div class="ph-glass">
          <div class="ph-wall" aria-hidden="true">${SKYLINE}</div>
          <div class="ph-top">
            <div class="ph-status"><span class="ph-st-l"><b class="ph-time"></b><span class="ph-day"></span></span><span class="ph-island" aria-hidden="true"></span>
              <span class="ph-sys"><i class="ph-sky" aria-hidden="true"></i><i class="ph-net" role="img" hidden></i><span class="ph-energy" role="img">${BATT}</span>
                <button type="button" class="ph-nav ph-close" data-nav="close" aria-label="Fermer le téléphone"><span aria-hidden="true">✕</span><span class="ph-close-tx">Fermer</span></button></span></div>
            <header class="ph-head">
              <button type="button" class="ph-nav ph-backbtn" data-nav="back" aria-label="Retour"><span class="ph-chev" aria-hidden="true">‹</span><span class="ph-back">Accueil</span></button>
              <h2></h2>
              <span class="ph-head-end" aria-hidden="true"></span>
            </header>
          </div>
          <div class="ph-screen"></div>
          <div class="ph-toast" role="status" aria-live="polite"></div>
          <button type="button" class="ph-homebar" data-nav="home" aria-label="Écran d’accueil"><i aria-hidden="true"></i></button>
        </div></div>
      </div>`;
    this.screenEl = this.el.querySelector('.ph-screen')!;
    this.timeEl = this.el.querySelector('.ph-time')!;
    this.dayEl = this.el.querySelector('.ph-day')!;
    this.skyEl = this.el.querySelector('.ph-sky')!;
    this.netEl = this.el.querySelector('.ph-net')!;
    this.energyEl = this.el.querySelector('.ph-energy')!;
    this.battEl = this.el.querySelector('.ph-batt .lvl')!;
    this.titleEl = this.el.querySelector('.ph-head h2')!;
    this.backEl = this.el.querySelector('[data-nav="back"]')!;
    this.toastEl = this.el.querySelector('.ph-toast')!;
    // Taps on the phone never reach the joystick or the camera drag underneath.
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    // The second half of a double tap never acts. The one that opened the phone: ☰ is right under « Fermer », so it would close it again (or, its finger
    // down before the phone was drawn, toggle ☰ itself). The one that closed it: « Fermer » is over ☰, an app's tile over the action button — it never
    // reaches the game. Dropped before anyone hears it, wherever it lands.
    addEventListener('click', e => { if (doubleOf(e, this.openTap) || doubleOf(e, this.closeTap)) { e.stopPropagation(); e.preventDefault(); } }, true);
    this.el.addEventListener('click', e => { if (e.target === this.el || (e.target as HTMLElement).classList?.contains('ph-stage')) this.close(); });
    this.backEl.addEventListener('click', () => this.back());
    this.el.querySelector('[data-nav="home"]')!.addEventListener('click', () => this.home());
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
      ctx, go: (id, arg) => this.go(id, arg), back: () => this.back(), home: () => this.home(),
      openApp: id => this.openApp(id), launch: fn => this.launch(fn), rerender: () => this.render(true), notify: (m, k) => this.notify(m, k),
    };
  }

  get isOpen() { return this.el.classList.contains('on'); }
  /** Draws the open screen again (a picture or a value it shows became ready). */
  refresh() { if (this.isOpen) this.render(true); }
  get current(): string { return this.stack[this.stack.length - 1]?.id ?? 'home'; }

  /**
   * Opens the phone where it was left, or on the given app (an app id, a screen id, an alias, or 'home'; `app:arg` opens a screen on its argument, e.g.
   * `messages:<tag>`, a conversation, above the screen's first page). Returns false for an unknown app.
   */
  open(app?: string): boolean {
    if (app) {
      const cut = app.indexOf(':'), name = cut > 0 ? app.slice(0, cut) : app, extra = cut > 0 ? app.slice(cut + 1) : undefined;
      const a = appById(name);
      if (a?.hook) { const fn = a.hook(); if (!fn) return false; this.launch(fn); return true; }
      const [id, arg] = ALIASES[name] ?? [a?.screen ?? name];
      if (!SCREENS[id]) return false;
      // on an argument (a conversation): the screen's own first page sits under it, so « back » leads to the list
      this.stack = id === 'home' ? [] : extra !== undefined ? [{ id, arg }, { id, arg: extra }] : [{ id, arg }];
    }
    this.remember();
    if (!this.isOpen) {
      this.openTap = tapNow(); this.closeTap = null;
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
    this.closeTap = tapNow(); this.openTap = null;
    this.el.classList.remove('on'); this.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phone-open');
    clearInterval(this.timer); this.keepScroll(); this.unmount();
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) document.activeElement.blur();
    // the key that closed it on a focused button (Entrée, Espace) is also the game's action key: it closed the phone, it does not act in the street
    this.ctx.input.takeAction();
    this.ctx.lock(false);
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  /** Debug/test summary. */
  info() { return { open: this.isOpen, screen: this.current, arg: this.stack[this.stack.length - 1]?.arg ?? null, depth: this.stack.length, muted: isMuted(), sensitivity: this.ctx.input.sensitivity, quality: this.ctx.quality() }; }
  back() { if (this.stack.length) { this.stack.pop(); this.render(); } else this.close(); }
  /**
   * The home indicator: back to the home screen from anywhere. The app in hand is parked — its first screen, and the sub-screens that are its own (a
   * conversation, « Tester le son »; not another app it led to, not a one-time question) — and found again there when its tile is tapped. Already on the
   * home screen: back to the top of the grid.
   */
  home() {
    if (!this.stack.length) { this.scroller().scrollTop = 0; return; }
    this.keepScroll();
    const root = this.stack[0];
    let n = 1;
    while (n < this.stack.length && (this.stack[n].id === root.id || (!SCREENS[this.stack[n].id]?.once && !APPS.some(a => a.screen === this.stack[n].id)))) n++;
    this.parked.set(root.id, this.stack.slice(0, n));
    this.stack = []; this.render();
  }

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
    if (sid === 'home') { this.home(); return; }
    // from the home screen or the library, an app left with the home indicator is found again where it was
    const from = this.stack[this.stack.length - 1]?.id ?? 'home', was = (a ?? arg) === undefined && (from === 'home' || from === 'apps') ? this.parked.get(sid) : undefined;
    this.parked.delete(sid);
    if (was) this.stack.push(...was); else this.stack.push({ id: sid, arg: a ?? arg });
    this.render();
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
    this.badges();
  }
  /** The apps' counts (registry `badge`: unread messages, new notifications) on their tiles, wherever a tile is (the dock, the grid, the library). */
  private badges() {
    const page = this.page; if (!page) return;
    for (const a of APPS) {
      if (!a.badge) continue;
      const tiles = page.querySelectorAll(`.ph-app[data-app="${a.id}"]`); if (!tiles.length) continue;
      const n = a.badge(), t = n > 9 ? '9+' : String(n);
      tiles.forEach(el => {
        let b = el.querySelector<HTMLElement>(':scope > .ph-badge');
        if (!n) { b?.remove(); return; }
        if (!b) { b = document.createElement('b'); b.className = 'ph-badge'; b.setAttribute('aria-hidden', 'true'); el.appendChild(b); }
        if (b.textContent !== t) b.textContent = t;
      });
    }
  }
  /** The status bar: the city's time and day, the sky of the hour, the online account, the energy. Written only when something changed. */
  private status() {
    const t = cityTimeAt(this.ctx.now()), energy = Math.round(clamp01((this.ctx.state.data.needs.energie ?? 100) / 100) * 100), net = online ? NET[online.status] ?? NET.offline : null;
    const key = `${t.day}|${t.hour}|${t.minute}|${energy}|${net?.[0] ?? ''}`;
    if (key === this.statusShown) return;
    this.statusShown = key;
    this.timeEl.textContent = clock(t.hour, t.minute);
    this.dayEl.textContent = dayName(t.day, true);
    this.skyEl.textContent = skyAt(t.hourFloat);
    this.netEl.hidden = !net;
    if (net) { this.netEl.className = `ph-net ${net[0]}`; this.netEl.setAttribute('aria-label', net[1]); this.netEl.title = net[1]; }
    this.battEl.setAttribute('width', String(Math.max(2, 20 * energy / 100)));
    this.energyEl.classList.toggle('low', energy < 20);
    this.energyEl.setAttribute('aria-label', `Énergie : ${energy} %`); this.energyEl.title = `Ton énergie : ${energy} %`;
  }

  /** The element that scrolls: the screen, or the part of the page that says so (the home screen's grid, above its dock). */
  private scroller(): HTMLElement { return this.page?.querySelector<HTMLElement>('[data-scroll]') ?? this.screenEl; }
  /** Remembers how far the showing screen was scrolled, on its entry. */
  private keepScroll() { if (this.shown && this.page) this.shown.scroll = this.scroller().scrollTop; }

  private unmount() {
    try { this.cleanup?.(); } catch { /* a screen's cleanup never blocks the phone */ }
    this.cleanup = null; this.page?.remove(); this.page = null; this.shown = null;
  }

  /**
   * Draws the screen on top of the stack (`keep`: the same screen drawn again, no settle time). A screen comes back scrolled where it was left — on
   * « back », when the phone is opened again, when it is drawn again; a screen just entered starts at the top.
   */
  private render(keep = false) {
    this.status();
    const top = this.stack[this.stack.length - 1] ?? this.homeEntry, screen = SCREENS[top.id] ?? homeScreen;
    const same = keep && this.shown === top;
    this.keepScroll();
    this.unmount();
    this.el.dataset.screen = top.id;
    this.el.dataset.look = screen.look ?? 'app';
    const title = typeof screen.title === 'function' ? screen.title(top.arg) : screen.title;
    this.titleEl.textContent = top.id === 'home' ? '' : title;
    const prev = this.stack[this.stack.length - 2];
    this.backEl.disabled = top.id === 'home';
    this.backEl.querySelector('.ph-back')!.textContent = prev ? this.titleOf(prev) : 'Accueil';
    this.backEl.setAttribute('aria-label', `Retour : ${prev ? this.titleOf(prev) : 'Accueil'}`);
    const page = document.createElement('div');
    page.className = `ph-page pg-${top.id}`;
    this.screenEl.appendChild(page);
    this.page = page; this.shown = top;
    if (!same) this.mountedAt = performance.now();
    try { this.cleanup = screen.mount(page, this.api, top.arg) ?? null; }
    catch (err) { page.innerHTML = '<div class="pk-empty"><i aria-hidden="true">⚠️</i><p>Cette app n’a pas pu s’ouvrir. Réessaie dans un instant.</p><button type="button" class="pk-btn inline" data-go="home">Écran d’accueil</button></div>'; console.error(err); }
    this.screenEl.scrollTop = 0;
    if (top.scroll) this.scroller().scrollTop = top.scroll;
    this.badges();
  }
  private titleOf(e: Entry) { const s = SCREENS[e.id]; return s ? (typeof s.title === 'function' ? s.title(e.arg) : s.title) : 'Accueil'; }
}
