/**
 * The character's phone: every user setting plus the main services (design doc, decisions by Habib).
 * Opens over the running game (online play is never paused), keeps its navigation between openings,
 * and works in portrait, landscape and with touch. Apps provided by other modules come from phoneHooks.
 */
import './phone.css';
import type { GameState } from '../core/state';
import type { Input } from '../core/input';
import type { HubId } from '../core/types';
import { cityTimeAt, CITY_DAY_MS } from '../core/clock';
import { isMuted, setMuted } from '../core/audioSettings';
import { canVibrate, hapticsOn, setHaptics } from '../transport/haptics';
import { mapBridge } from './minimap';
import { theme, type ThemeMode } from './theme';
import './theme.css';
import { fullMapHtml, fullCardHtml, mountFullMap } from './fullmap';
import { geoMapHtml, geoCardHtml } from './geoMapHtml';
import { sendFocus, shortcuts, stripHtml, type Focus } from './carteState';
import { HUB_NAMES } from '../world/content';
import type { Relations } from '../social/relations';
import { suggestion } from '../social/beats';
import { phoneHooks } from './phoneHooks';
import { bindSaveCard, saveCardHtml } from './saveCard';
import { betaFooter, reportText } from './betaInfo';
import { journalView, esc } from './journal';
import { glossesShown, setGlossesShown } from '../i18n/wolof';
import { fcfa } from './hud';
import { quietLog, ago } from './quiet';
import { walkMinutes } from '../world/walk';
import { restSpotHere } from '../game/rest';
import { mountSoundTest, soundTestHtml, type TestKit } from './soundTest';
import { radio, VOLUMES } from '../transport/radio';

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

/** The tab of the map screen the player last used. */
let lastMapTab: 'quartier' | 'ville' = 'quartier';
/** The vehicles list under the map's strip stays as the player left it while the screen is redrawn (marking a dealer redraws it). */
let vehiclesOpen = false;
type ScreenId = 'home' | 'reglages' | 'sontest' | 'aide' | 'nouvelle' | 'carnet' | 'portefeuille' | 'carte' | 'arene' | 'meteo' | 'calcul' | 'sante' | 'profil' | 'horloge' | 'actus' | 'cesoir' | 'lutteurs' | 'notifs';
interface Tile { id: string; label: string; color: string; icon: string; screen?: ScreenId; hook?: () => (() => void) | undefined }

const ICON: Record<string, string> = {
  messages: '<path d="M4 5h16v11H9l-5 4z"/>',
  portefeuille: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15.5 14.5h2"/>',
  carte: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  travail: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  affaires: '<path d="M4 4v16h16"/><path d="M7.5 15.5l3.5-4 3 2.5 5-6"/><path d="M15.5 8h3.5v3.5"/>',
  maison: '<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6"/>',
  habitants: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15.5 14c3 0 5.5 2 5.5 5"/>',
  quartier: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  arene: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  carnet: '<path d="M6 3h11a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h8M8 12h8M8 16h5"/>',
  aide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  reglages: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
};

/** Home-screen look of each app: an emoji glyph on a gradient tile (iOS-style). Unknown apps fall back to the line icon. */
const LOOK: Record<string, { emoji: string; grad: string; short?: string }> = {
  messages: { emoji: '💬', grad: '#5df27e,#1fb84a' },
  notifs: { emoji: '🔔', grad: '#fca5a5,#dc2626', short: 'Notifs' },
  portefeuille: { emoji: '💰', grad: '#fcd34d,#f59e0b' },
  carte: { emoji: '🗺️', grad: '#7dd3fc,#2563eb', short: 'Carte' },
  quartier: { emoji: '📍', grad: '#6ee7b7,#0f766e', short: 'Quartier' },
  travail: { emoji: '🛵', grad: '#bef264,#4d7c0f' },
  vtc: { emoji: '🚖', grad: '#fde047,#ca8a04', short: 'VTC' },
  credits: { emoji: '💳', grad: '#93c5fd,#1d4ed8', short: 'Crédits' },
  maison: { emoji: '🏠', grad: '#fda4af,#e11d48', short: 'Maison' },
  habitants: { emoji: '👥', grad: '#5eead4,#0e7490' },
  affaires: { emoji: '🏢', grad: '#34d399,#047857' },
  biens: { emoji: '🔑', grad: '#fde68a,#b45309' },
  arene: { emoji: '🤼', grad: '#d8b4fe,#7e22ce' },
  cesoir: { emoji: '🌆', grad: '#fda4af,#be123c', short: 'Ce soir' },
  carnet: { emoji: '📒', grad: '#fde68a,#d97706' },
  meteo: { emoji: '⛅', grad: '#7dd3fc,#1e40af' },
  sante: { emoji: '❤️', grad: '#fecdd3,#fb7185' },
  profil: { emoji: '🧑🏾', grad: '#c4b5fd,#6d28d9' },
  horloge: { emoji: '🕰️', grad: '#3f3f46,#09090b' },
  actus: { emoji: '📰', grad: '#fdba74,#c2410c' },
  calcul: { emoji: '🧮', grad: '#71717a,#18181b' },
  aide: { emoji: '💡', grad: '#fef08a,#eab308' },
  reglages: { emoji: '⚙️', grad: '#d1d5db,#6b7280' },
};
/** Apps kept in the dock at the bottom of the home screen (not repeated in the grid). */
const DOCK = ['carte', 'portefeuille', 'carnet', 'reglages'];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const TILES: Tile[] = [
  { id: 'messages', label: 'Messages', color: '#16a34a', icon: ICON.messages, hook: () => phoneHooks.openMessages },
  { id: 'notifs', label: 'Notifications', color: '#dc2626', icon: ICON.messages, screen: 'notifs' },
  { id: 'portefeuille', label: 'Portefeuille', color: '#d97706', icon: ICON.portefeuille, screen: 'portefeuille' },
  { id: 'carte', label: 'Carte et déplacements', color: '#0284c7', icon: ICON.carte, screen: 'carte' },
  { id: 'quartier', label: 'Coins du quartier', color: '#0f766e', icon: ICON.quartier, hook: () => phoneHooks.openPlaces },
  { id: 'travail', label: 'Travail', color: '#7c5a2a', icon: ICON.travail, hook: () => phoneHooks.openJobs },
  { id: 'vtc', label: 'Courses VTC', color: '#ca8a04', icon: ICON.travail, hook: () => phoneHooks.openVtc },
  { id: 'credits', label: 'Crédits', color: '#1d4ed8', icon: ICON.portefeuille, hook: () => phoneHooks.openCredits },
  { id: 'affaires', label: 'Affaires', color: '#a16207', icon: ICON.affaires, hook: () => phoneHooks.openBusiness },
  { id: 'maison', label: 'Maison et proches', color: '#dc2626', icon: ICON.maison, hook: () => phoneHooks.openHome },
  { id: 'biens', label: 'Biens', color: '#b45309', icon: ICON.maison, hook: () => phoneHooks.openAssets },
  { id: 'habitants', label: 'Habitants', color: '#0d9488', icon: ICON.habitants, hook: () => phoneHooks.openPeople },
  { id: 'arene', label: 'Arène', color: '#9333ea', icon: ICON.arene, screen: 'arene' },
  { id: 'cesoir', label: 'Ce soir', color: '#be123c', icon: ICON.arene, screen: 'cesoir' },
  { id: 'carnet', label: 'Carnet', color: '#475569', icon: ICON.carnet, screen: 'carnet' },
  { id: 'actus', label: 'Actus', color: '#c2410c', icon: ICON.carnet, screen: 'actus' },
  { id: 'sante', label: 'Santé', color: '#fb7185', icon: ICON.aide, screen: 'sante' },
  { id: 'profil', label: 'Profil', color: '#6d28d9', icon: ICON.habitants, screen: 'profil' },
  { id: 'horloge', label: 'Horloge', color: '#09090b', icon: ICON.aide, screen: 'horloge' },
  { id: 'meteo', label: 'Météo', color: '#1e40af', icon: ICON.aide, screen: 'meteo' },
  { id: 'calcul', label: 'Calculatrice', color: '#18181b', icon: ICON.aide, screen: 'calcul' },
  { id: 'aide', label: 'Aide', color: '#2563eb', icon: ICON.aide, screen: 'aide' },
  { id: 'reglages', label: 'Réglages', color: '#334155', icon: ICON.reglages, screen: 'reglages' },
];

const TITLES: Record<ScreenId, string> = {
  home: 'Téléphone', reglages: 'Réglages', sontest: 'Test du son', aide: 'Aide', nouvelle: 'Nouvelle partie', carnet: 'Carnet',
  portefeuille: 'Portefeuille', carte: 'Carte et déplacements', arene: 'Arène', meteo: 'Météo', calcul: 'Calculatrice', sante: 'Santé', profil: 'Profil', horloge: 'Horloge', actus: 'Actus · Dakar', cesoir: 'Ce soir', lutteurs: 'Lutteurs',
  notifs: 'Notifications',
};
const QUALITY_LABEL: Record<Quality, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute' };
const SENSITIVITY: [number, string][] = [[0.6, 'Lente'], [1, 'Normale'], [1.5, 'Rapide']];
const SENS_KEY = 'dakarrek.camera.sensitivity';
const PLACES_KEY = 'dakarrek.phone.places';

const svg = (paths: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
/** Signal, network and battery (the battery shows the character's energy). */
const SYS = `<svg class="ph-bars" viewBox="0 0 17 11"><rect y="7" width="3" height="4" rx="1"/><rect x="4.6" y="5" width="3" height="6" rx="1"/><rect x="9.2" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.8" width="3" height="11" rx="1"/></svg>
  <b>4G</b><svg class="ph-batt" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity=".45"/><rect class="lvl" x="2" y="2" width="20" height="9" rx="2.2"/><path d="M25 4.4v4.2c.9-.3 1.6-1.1 1.6-2.1s-.7-1.8-1.6-2.1z" opacity=".45"/></svg>`;
/** Wallpaper skyline: Dakar's buildings, a minaret, the Monument de la Renaissance on its hill and the Mamelles lighthouse. */
const SKYLINE = `<svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMax slice">
  <path class="far" d="M0 170V118h12V96h14v22h10V84h16v34h8V100h12V70h10v-8h6v8h10v48h10V92h18v26h12V104h14v14h16V86h12V74h14v44h10V96h16v22h14V90h18v28h10V80h14v38h12V98h16v20h14V88h14v30h16v52z"/>
  <path d="M0 170V132h18v-10h16v10h10V114h20v18h8V108h3V58l4-14 4 14v50h3v24h12V118h18v14h10l14-12c14-11 30-15 42-15s26 5 36 14l12 13h8V112h22v20h10V104h16v28h10l16-14c9-7 19-7 28 0l14 14h8v-8h16v12h12V114h20v18h10v38z"/>
  <path d="M243 106h24v6h-24z"/><path d="M246 106l2-22-4-9 2-10 5-4 5 3-1 9 5 7-2 26z"/><path d="M238 106l2-18-4-9 3-8 5 1 1 12-1 22z"/>
  <path d="M255 64l10-15 4-5 3 2-4 6-9 15z"/><circle cx="270" cy="40" r="3.4"/><path d="M267 42l-2 7 4 1 3-7z"/>
  <g transform="translate(-42 4)"><path d="M334 118h9V92l2-7h5l2 7v26h9z"/><circle cx="347.5" cy="81" r="3.6"/></g>
  <path d="M104 132V98h4V62l3.5-12 3.5 12v36h4v34z"/><path d="M122 132v-12a11 11 0 0 1 22 0v12z"/></svg>`;
function store(): Storage | null { try { return window.localStorage; } catch { return null; } }

export class Phone {
  readonly el = document.createElement('div');
  /** Shared app hooks (exposed for debug checks). */
  readonly hooks = phoneHooks;
  private screenEl: HTMLElement;
  private timeEl: HTMLElement;
  private battEl: SVGRectElement;
  /** Calculator state (kept while the phone stays open). */
  private calc = { shown: '0', acc: null as number | null, op: '' as '' | '+' | '−' | '×' | '÷', fresh: true };
  private titleEl: HTMLElement;
  /** Navigation stack below the home screen; kept between openings. */
  private stack: ScreenId[] = [];
  private timer = 0;
  /** Cleanup of the live screen showing (the interactive map of « Carte », src/ui/fullmap.ts; the sound test, src/ui/soundTest.ts). */
  private mapOff: (() => void) | null = null;
  /** The sound test's vehicle (car or Jakarta). */
  private testKit: TestKit = 'sedan';
  /** Places seen in each hub, remembered on this device. */
  private known: Partial<Record<HubId, string[]>> = {};

  constructor(private ctx: PhoneContext) {
    this.el.id = 'phone';
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'Téléphone'); this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<div class="ph-stage">
        <button type="button" class="ph-close" data-nav="close" aria-label="Fermer le téléphone">✕ Fermer</button>
        <div class="ph-device"><div class="ph-glass">
          <div class="ph-wall" aria-hidden="true">${SKYLINE}</div>
          <div class="ph-status"><span class="ph-time"></span><span class="ph-island" aria-hidden="true"></span><span class="ph-sys" aria-hidden="true">${SYS}</span></div>
          <div class="ph-head"><button type="button" data-nav="back" aria-label="Retour">‹ <span class="ph-back"></span></button><h2></h2><span></span></div>
          <div class="ph-screen"></div>
          <button type="button" class="ph-indicator" data-nav="home" aria-label="Écran d’accueil"><i></i></button>
        </div></div>
      </div>`;
    this.screenEl = this.el.querySelector('.ph-screen')!;
    this.timeEl = this.el.querySelector('.ph-time')!;
    this.battEl = this.el.querySelector('.ph-batt .lvl')!;
    this.titleEl = this.el.querySelector('.ph-head h2')!;
    // Taps on the phone never reach the joystick or the camera drag underneath.
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    this.el.addEventListener('click', e => { if (e.target === this.el || (e.target as HTMLElement).classList?.contains('ph-stage')) this.close(); });
    this.el.querySelector('[data-nav="back"]')!.addEventListener('click', () => this.back());
    this.el.querySelector('[data-nav="home"]')!.addEventListener('click', () => { this.stack = []; this.render(); });
    this.el.querySelector('[data-nav="close"]')!.addEventListener('click', () => this.close());
    document.body.appendChild(this.el);
    try { this.known = JSON.parse(store()?.getItem(PLACES_KEY) ?? '{}') ?? {}; } catch { this.known = {}; }
    const s = Number(store()?.getItem(SENS_KEY));
    if (SENSITIVITY.some(([v]) => v === s)) ctx.input.sensitivity = s;
  }

  get isOpen() { return this.el.classList.contains('on'); }
  /** Draws the open screen again (a picture or a value it shows became ready). */
  refresh() { if (this.isOpen) this.render(); }
  get current(): ScreenId { return this.stack[this.stack.length - 1] ?? 'home'; }

  /** Opens the phone where it was left, or on the given app (an app id or 'home'). Returns false for an unknown app. */
  open(app?: string): boolean {
    if (app) {
      const tile = TILES.find(t => t.id === app);
      if (tile?.hook) { const fn = tile.hook(); if (!fn) return false; this.launch(fn); return true; }
      const screen = app === 'home' ? 'home' : tile?.screen ?? (app in TITLES ? app as ScreenId : null);
      if (!screen) return false;
      this.stack = screen === 'home' ? [] : [screen];
    }
    this.remember();
    if (!this.isOpen) {
      this.el.classList.add('on'); this.el.setAttribute('aria-hidden', 'false');
      this.ctx.lock(true);
      this.timer = window.setInterval(() => this.status(), 1000);
    }
    this.render();
    return true;
  }
  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on'); this.el.setAttribute('aria-hidden', 'true');
    clearInterval(this.timer); this.mapOff?.(); this.mapOff = null;
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) document.activeElement.blur();
    this.ctx.lock(false);
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  /** Debug/test summary. */
  info() { return { open: this.isOpen, screen: this.current, muted: isMuted(), sensitivity: this.ctx.input.sensitivity, quality: this.ctx.quality() }; }
  back() { if (this.stack.length) { this.stack.pop(); this.render(); } else this.close(); }

  /** Records the places of the hub the player is in (Carte). */
  remember() {
    const hub = this.ctx.hub(); if (!hub) return;
    const names = [...new Set(this.ctx.places())];
    if (!names.length || (this.known[hub] && this.known[hub]!.join('|') === names.join('|'))) return;
    this.known[hub] = names;
    try { store()?.setItem(PLACES_KEY, JSON.stringify(this.known)); } catch { /* session only */ }
  }

  private go(screen: ScreenId) { this.stack.push(screen); this.render(); }
  /** Apps from other modules: close the phone and hand over. */
  private launch(fn: () => void) { this.close(); fn(); this.ctx.lock(false); }   // settle again: the app may have opened a menu

  private status() {
    const t = cityTimeAt(this.ctx.now());
    this.timeEl.textContent = clock(t.hour, t.minute);
    this.battEl.setAttribute('width', String(Math.max(2, 20 * clamp01((this.ctx.state.data.needs.energie ?? 100) / 100))));
    if (this.current === 'home') { const c = this.screenEl.querySelector('.ph-clock'); if (c) c.textContent = clock(t.hour, t.minute); }
  }

  private render() {
    this.status();
    const id = this.current;
    this.el.dataset.screen = id;
    this.titleEl.textContent = TITLES[id];
    (this.el.querySelector('[data-nav="back"]') as HTMLButtonElement).disabled = id === 'home';
    this.el.querySelector('.ph-back')!.textContent = this.stack.length > 1 ? TITLES[this.stack[this.stack.length - 2]] : 'Accueil';
    const s = this.screenEl;
    s.scrollTop = 0;
    this.mapOff?.(); this.mapOff = null;
    switch (id) {
      case 'home': s.innerHTML = this.homeHtml(); break;
      case 'reglages': s.innerHTML = this.settingsHtml(); break;
      case 'sontest': s.innerHTML = soundTestHtml(this.testKit); break;
      case 'aide': s.innerHTML = HELP_HTML; break;
      case 'nouvelle': s.innerHTML = `<p class="ph-note">Effacer la partie enregistrée sur cet appareil ? Argent, relations et progression seront perdus. Cette action est définitive.</p>
        <button type="button" class="ph-btn" data-act="cancel">Annuler</button>
        <button type="button" class="ph-btn danger" data-act="wipe">Effacer et recommencer</button>`; break;
      case 'carnet': { const j = journalView(this.ctx.rel, this.ctx.state); s.innerHTML = `<p class="ph-sub">${esc(j.subtitle)}</p><div class="ph-journal">${j.html}</div>`; break; }
      case 'portefeuille': s.innerHTML = this.walletHtml(); break;
      case 'carte': s.innerHTML = this.carteHtml(); break;
      case 'arene': s.innerHTML = this.arenaHtml(); break;
      case 'meteo': s.innerHTML = this.weatherHtml(); break;
      case 'calcul': s.innerHTML = this.calcHtml(); break;
      case 'sante': s.innerHTML = this.healthHtml(); break;
      case 'profil': s.innerHTML = this.profileHtml(); break;
      case 'horloge': s.innerHTML = this.clockHtml(); break;
      case 'actus': s.innerHTML = this.newsHtml(); break;
      case 'cesoir': s.innerHTML = this.tonightHtml(); break;
      case 'lutteurs': s.innerHTML = this.lutteursHtml(); break;
      case 'notifs': s.innerHTML = this.notifsHtml(); quietLog.markRead(); break;
    }
    this.bind();
    if (id === 'carte') this.mapOff = this.mountCarte(s);
    if (id === 'sontest') this.mapOff = mountSoundTest(s, k => { this.testKit = k; this.render(); }, this.testKit);
  }

  /**
   * The map screen's two tabs: « Quartier » (the district's own canvas map) and « Ville » (the whole city on MapLibre, src/ui/geoMap.ts). Only the open tab is alive: the other is released, and
   * MapLibre (its code, its WebGL context, its tiles) is only ever loaded while « Ville » is showing.
   */
  private mountCarte(s: HTMLElement): () => void {
    let off: (() => void) | null = null, tab: 'quartier' | 'ville' | null = null;
    const show = (t: 'quartier' | 'ville') => {
      if (t === tab) return;
      off?.(); off = null; tab = t; lastMapTab = t;
      s.querySelectorAll<HTMLElement>('[data-mt]').forEach(b => { const on = b.dataset.mt === t; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); });
      s.querySelectorAll<HTMLElement>('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
      if (t === 'quartier') off = mountFullMap(s);
      else void import('./geoMap').then(m => { if (tab === 'ville') off = m.mountGeoMap(s); });
    };
    s.querySelectorAll<HTMLElement>('[data-mt]').forEach(b => b.addEventListener('click', () => show(b.dataset.mt as 'quartier' | 'ville')));
    const strip = s.querySelector<HTMLElement>('.cm-strip'), vehicles = s.querySelector<HTMLElement>('.cm-sheet'), here = this.ctx.hub();
    const lit = (b: HTMLElement | null) => { strip?.querySelectorAll('.cm-chip.on').forEach(c => c.classList.remove('on')); b?.classList.add('on'); };
    /** The strip, the vehicles and the cards' buttons: one delegated listener, since the cards are rewritten as the player picks things. */
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null; if (!t) return;
      const hubChip = t.closest<HTMLElement>('[data-cm-hub]'), sc = t.closest<HTMLElement>('[data-cm-sc]'), veh = t.closest<HTMLElement>('[data-cm="dealers"]');
      if (hubChip) { lit(hubChip); if (vehicles) vehicles.hidden = true; vehiclesOpen = false; sendFocus(s, { kind: 'hub', hub: hubChip.dataset.cmHub as HubId }); return; }
      if (sc) {
        const f: Focus = { kind: 'place', id: sc.dataset.cmSc!, hub: sc.dataset.hub as HubId, name: sc.dataset.name ?? '', icon: sc.dataset.icon };
        lit(sc); if (vehicles) vehicles.hidden = true; vehiclesOpen = false;
        if (f.hub === here) show('quartier');                                  // a place of this district: on the district's own map, selected
        sendFocus(s, f); return;
      }
      if (veh && vehicles) { vehicles.hidden = !vehicles.hidden; vehiclesOpen = !vehicles.hidden; lit(vehicles.hidden ? null : veh); return; }
      const pin = t.closest<HTMLElement>('[data-cm-pin]');
      if (pin) {
        const on = shortcuts.toggle({ id: pin.dataset.id!, name: pin.dataset.name ?? '', hub: pin.dataset.hub as HubId, icon: pin.dataset.icon ?? '📍' });
        if (strip) strip.innerHTML = stripHtml(here);
        this.ctx.toast(on ? 'Raccourci ajouté' : 'Raccourci retiré');
        s.dispatchEvent(new Event('carte:refresh')); return;
      }
      const act = t.closest<HTMLElement>('.fm-card [data-dealer], .fm-card [data-walk], .fm-card [data-drive]');           // the cards are filled after the screen is bound
      if (act?.dataset.drive !== undefined) { const h = (act.dataset.drive || null) as HubId | null, n = act.dataset.name; this.launch(() => phoneHooks.driveTo?.(h, n)); }
      else if (act?.dataset.dealer) this.dealerAct(act); else if (act?.dataset.walk) { const h = act.dataset.walk as HubId; this.launch(() => phoneHooks.walkTo?.(h)); }
    };
    s.addEventListener('click', onClick);
    if (vehiclesOpen) lit(s.querySelector('[data-cm="dealers"]'));
    show(lastMapTab);
    return () => { s.removeEventListener('click', onClick); off?.(); off = null; tab = null; };
  }

  private homeHtml(): string {
    const hub = this.ctx.hub(), next = suggestion(this.ctx.rel, this.ctx.state), t = cityTimeAt(this.ctx.now());
    const tiles = TILES.filter(t => !t.hook || t.hook());
    const grid = tiles.filter(t => !DOCK.includes(t.id)), dock = tiles.filter(t => DOCK.includes(t.id));
    const fresh = quietLog.unread ? quietLog.entries.slice(0, Math.min(2, quietLog.unread)) : [];
    return `<div class="ph-lock"><b class="ph-clock">${clock(t.hour, t.minute)}</b><small>${DAYS[(t.day - 1) % 7]} · Jour ${t.day}${hub ? ' · ' + esc(HUB_NAMES[hub].split(' · ')[0]) : ''}</small></div>
      ${fresh.length ? `<button type="button" class="ph-notes" data-open="notifs" aria-label="Notifications : ${quietLog.unread} nouvelle${quietLog.unread > 1 ? 's' : ''}">${fresh.map(e => `<span>${esc(e.text)}</span>`).join('')}${quietLog.unread > fresh.length ? `<small>+ ${quietLog.unread - fresh.length} autre${quietLog.unread - fresh.length > 1 ? 's' : ''}</small>` : ''}</button>` : ''}
      <div class="ph-widgets">
        <button type="button" class="ph-wid" data-open="portefeuille"><small>💰 Solde</small><b>${fcfa(this.ctx.state.wallet)}</b></button>
        <div class="ph-wid"><small>➜ Prochaine piste</small><span>${next ? esc(next.hint) : 'Pas de piste en cours : la ville est à toi.'}</span></div>
      </div>
      <div class="ph-grid">${grid.map(t => appIcon(t, true)).join('')}</div>
      <div class="ph-dock">${dock.map(t => appIcon(t, false)).join('')}</div>`;
  }

  /**
   * Notifications: the quiet log (src/ui/quiet.ts) — what the game noted without stopping the player (a purchase, a
   * pay, a tip, an arrival), newest first. Opening it marks them seen (the badge on the phone button goes).
   */
  private notifsHtml(): string {
    const list = quietLog.entries, now = Date.now(), unseen = quietLog.unread;
    if (!list.length) return '<p class="ph-note">Rien de nouveau. Ce que le jeu note sans t’arrêter (achats, paies, conseils) arrive ici.</p>';
    return `<ul class="ph-log">${list.map((e, i) => `<li class="${i < unseen ? 'new' : ''}${e.kind === 'warn' ? ' warn' : ''}"><span>${esc(e.text)}</span><small>${ago(now - e.at)}</small></li>`).join('')}</ul>`;
  }
  private weatherHtml(): string {
    const t = cityTimeAt(this.ctx.now()), h = t.hourFloat;
    const temp = (hour: number) => Math.round(28.5 + 3 * Math.sin(((hour - 9) / 24) * Math.PI * 2));
    const sky = (hour: number) => { const x = ((hour % 24) + 24) % 24; return x < 6 || x >= 19 ? '🌙' : x < 8 || x >= 17.5 ? '🌤️' : '☀️'; };
    const hours = Array.from({ length: 6 }, (_, i) => Math.floor(h) + i);
    const wind = 10 + (t.day * 7) % 12, humid = 62 + (t.day * 11) % 18;
    return `<div class="ph-weather"><small>${this.ctx.hub() ? esc(HUB_NAMES[this.ctx.hub()!].split(' · ')[0]) : 'Dakar'}</small><b>${temp(h)}°</b>
        <span>${sky(h) === '🌙' ? 'Nuit dégagée' : sky(h) === '☀️' ? 'Ensoleillé' : 'Quelques nuages'} · max ${temp(15)}° min ${temp(3)}°</span></div>
      <div class="ph-hours">${hours.map((x, i) => `<div><small>${i ? clock(x % 24, 0).slice(0, 2) + ' h' : 'Maint.'}</small><i>${sky(x)}</i><b>${temp(x)}°</b></div>`).join('')}</div>
      <div class="ph-rows"><div><span>Lever du soleil</span><em>06:00</em></div><div><span>Coucher du soleil</span><em>19:00</em></div>
        <div><span>Vent (alizé)</span><em>${wind} km/h</em></div><div><span>Humidité</span><em>${humid} %</em></div></div>
      <p class="ph-note">La météo suit le ciel de la ville : même heure pour tous les joueurs.</p>`;
  }

  /** Arena › Lutteurs: one light card per roster wrestler (portrait from his look, season, belt, last results, « Suivre »). */
  private lutteursHtml(): string {
    const list = phoneHooks.lutteurs?.() ?? [];
    if (!list.length) return '<p class="ph-note">Les lutteurs de la ville apparaîtront ici.</p>';
    const RES = { V: 'V', D: 'D', N: 'N' } as const;
    return `<div class="ph-lts">${list.map(w => `<section class="ph-lt" id="lt-${esc(w.id)}">
        <div class="lt-head"><i class="lt-pic">${w.portrait}</i><span><b>${esc(w.name)}</b><small>${esc(w.ecurie)} · ${esc(w.style)} · ${esc(w.level)}</small></span>
          <button type="button" class="lt-follow${w.followed ? ' on' : ''}" data-follow="${esc(w.id)}" aria-pressed="${w.followed}">${w.followed ? '★ Suivi' : '☆ Suivre'}</button></div>
        <div class="lt-stats"><span><b>${w.place}${w.place === 1 ? 'er' : 'e'}</b><small>classement</small></span><span><b>${w.pts}</b><small>points</small></span><span><b>${w.v}-${w.d}${w.n ? `-${w.n}` : ''}</b><small>saison</small></span></div>
        ${w.belt ? `<p class="lt-belt">🏆 ${esc(w.belt)}</p>` : ''}
        ${w.last.length ? `<ul class="lt-last">${w.last.map(r => `<li><i class="r${r.res}">${RES[r.res]}</i>${esc(r.vs)}<small>${r.title ? 'titre · ' : r.main ? 'combat principal · ' : ''}jour ${r.day}</small></li>`).join('')}</ul>` : '<p class="lt-none">Pas encore combattu cette saison</p>'}
      </section>`).join('')}</div>
      <p class="ph-note">Suivre un lutteur : « Ce soir » et l’annonce du soir te disent quand il combat, et la carte d’après-gala son résultat. Rien à gagner : juste le plaisir de suivre.</p>`;
  }

  /** « Ce soir » (src/arena/tonight.ts): light cards of rows, « Y aller » on the places the pin can lead to. */
  private tonightHtml(): string {
    const page = phoneHooks.tonight?.() ?? [];
    if (!page.length) return '<p class="ph-note">Rien de prévu ce soir.</p>';
    return `<div class="ph-tonight">${page.map(sec => `<h3>${esc(sec.title)}</h3><div class="ph-rows">${sec.rows.map(r => `<div>
        <span><i aria-hidden="true">${esc(r.icon)}</i><span>${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</span></span>${r.go
        ? `<button type="button" class="ph-go" data-go="${esc(r.go)}">Y aller</button>` : r.open ? `<button type="button" class="ph-go" data-open="${esc(r.open)}">Ouvrir</button>` : ''}</div>`).join('')}</div>`).join('')}</div>
      <p class="ph-note">« Y aller » place le repère et la ligne d’objectif. Ce qui est écrit vient de la ville : même soirée pour tous.</p>`;
  }

  private healthHtml(): string {
    const n = this.ctx.state.data.needs as unknown as Record<string, number>;
    const rest = restSpotHere();
    const NEEDS: [string, string, string, string][] = [['faim', 'Faim', '#f97316', 'Mange à une gargote, une dibiterie ou au mall.'], ['energie', 'Énergie', '#facc15', rest ? `Repose-toi ici : ${rest}. Marcher ne demande pas d’énergie.` : 'Dors dans ta chambre ou repose-toi à l’ombre. Marcher ne demande pas d’énergie.'],
      ['moral', 'Moral', '#a855f7', 'Retrouve des amis, l’attaya, la plage.'], ['social', 'Social', '#22c55e', 'Parle aux habitants, rejoins les places.'], ['hygiene', 'Hygiène', '#0ea5e9', 'Passe par ta chambre pour te laver.']];
    const ring = (v: number, c: string) => `<i class="ph-ring" style="--v:${Math.round(clamp01(v / 100) * 100)};--c:${c}"><b>${Math.round(v)}</b></i>`;
    return `<div class="ph-health"><small>Humeur</small><b>${esc(this.ctx.state.mood())}</b></div>
      <div class="ph-rings">${NEEDS.map(([k, l, c]) => `<div>${ring(n[k] ?? 0, c)}<span>${l}</span></div>`).join('')}</div>
      <h3>Conseils</h3><div class="ph-rows">${NEEDS.filter(([k]) => (n[k] ?? 0) < 60).map(([, l, , tip]) => `<div><span>${l}<small>${tip}</small></span></div>`).join('') || '<div><span>Tout va bien. Profite de la ville !</span></div>'}</div>`;
  }

  private profileHtml(): string {
    const d = this.ctx.state.data, c = d.counters;
    const rows: [string, number | string][] = [['Temps de jeu', `${Math.floor(d.playedMs / 3600000)} h ${String(Math.floor(d.playedMs / 60000) % 60).padStart(2, '0')}`],
      ['Repas', c.meals ?? 0], ['Petits boulots', c.shifts ?? 0], ['Livraisons Tiak Tiak', c.livraisons ?? 0], ['Trajets en car rapide', c.trips ?? 0],
      ['Combats', c.combats ?? 0], ['Victoires', c.victoires ?? 0], ['Actions en ville', c.actions ?? 0], ['Meubles achetés', c.meubles ?? 0]];
    // What the player became, read from what they did (career module): four light gauges, never a class to pick.
    const dims = phoneHooks.profileDims?.() ?? [];
    const dimsHtml = dims.length ? `<div class="ph-dims">${dims.map(d => `<div><span><b>${esc(d.label)}</b><small>${esc(d.note)}</small></span><em>${esc(d.level)}${d.delta ? `<span class="dl ${d.delta.startsWith('+') ? 'up' : 'down'}">${esc(d.delta)}</span>` : ''}</em><i style="--v:${Math.max(0, Math.min(100, Math.round(d.score)))}"></i></div>`).join('')}</div>` : '';
    // the run of days worked (src/economy/streakModule.ts): « 3 jours d'affilée », what it opens, what the next milestone opens
    const streak = phoneHooks.streakProfile?.() ?? [];
    const streakHtml = streak.length ? `<h3>Régularité</h3><div class="ph-rows ph-streak">${streak.map((r, i) => `<div${i ? '' : ' class="run"'}><span>${esc(r.label)}<small>${esc(r.detail)}</small></span></div>`).join('')}</div>` : '';
    return `<div class="ph-profile">${((pic: string | null) => pic ? `<img class="ph-portrait" src="${pic}" alt="Ton personnage">` : '<i>🧑🏾</i>')(phoneHooks.profilePortrait?.() ?? null)}<b>${esc(phoneHooks.profileName?.() || 'Toi')}</b><small>${esc(phoneHooks.profileHeadline?.() ?? '')}${phoneHooks.profileHeadline ? ' · ' : ''}${fcfa(this.ctx.state.wallet)} · humeur ${esc(this.ctx.state.mood())}</small></div>
      ${phoneHooks.editCharacter ? '<button type="button" class="ph-btn" data-act="editchar">Modifier mon personnage<small>Corps, peau, cheveux, tenue et couleur : tu ne perds rien</small></button>' : ''}
      ${streakHtml}
      ${dimsHtml}
      <div class="ph-rows">${rows.map(([l, v]) => `<div><span>${l}</span><em>${typeof v === 'number' ? v.toLocaleString('fr-FR') : v}</em></div>`).join('')}</div>
      ${savedNoteHtml()}`;
  }

  private clockHtml(): string {
    const t = cityTimeAt(this.ctx.now()), now = new Date();
    const toNext = t.isNight ? ((30 - t.hourFloat) % 24) : 19 - t.hourFloat;   // city hours to the next sunrise (6h) or sunset (19h)
    const real = Math.round(toNext * (CITY_DAY_MS / 24) / 60000);
    return `<div class="ph-rows ph-clocks">
        <div><span>Dakar Rek<small>Heure de la ville · Jour ${t.day}</small></span><em>${clock(t.hour, t.minute)}</em></div>
        <div><span>Ton appareil<small>Heure réelle</small></span><em>${clock(now.getHours(), now.getMinutes())}</em></div></div>
      <div class="ph-daybar"><i style="left:${(t.hourFloat / 24) * 100}%"></i></div>
      <p class="ph-note">${t.isNight ? 'Lever du soleil' : 'Coucher du soleil'} dans ${real} min réelles. Une journée en ville dure ${Math.round(CITY_DAY_MS / 60000)} minutes réelles.</p>`;
  }

  private newsHtml(): string {
    const t = cityTimeAt(this.ctx.now()), c = this.ctx.state.data.counters, w = this.ctx.state.wallet;
    const pool = [
      ['Pikine', 'La grand-place affiche complet pour l’attaya du soir.'], ['Soumbédioune', 'Belle pêche ce matin : les mareyeuses cherchent des bras.'],
      ['Arène de Pikine', 'Combats amicaux cette semaine pour les lutteurs des écuries.'], ['Plateau', 'La Banque Teranga cherche des coursiers pour livrer des dossiers.'],
      ['Almadies', 'Le Dakar Life Mall reste ouvert tard ce week-end.'], ['Corniche', 'Les joggeurs envahissent les marches du Monument au lever du soleil.'],
      ['Tiak Tiak', 'Les livraisons à pied ont la cote à Pikine et au Plateau.'], ['Médina', 'L’Atelier Ndeye prépare les tenues d’un grand baptême.'],
      ['Car rapide', 'Les apprentis annoncent des départs toutes les dix minutes.'], ['Fann', 'Les étudiants révisent sur les bancs de la place.'],
    ];
    const pick = Array.from({ length: 5 }, (_, i) => pool[(t.day * 3 + i * 7) % pool.length]);
    const mine = [
      (c.victoires ?? 0) > 0 ? ['Arène', `Un nouveau lutteur fait parler de lui : ${c.victoires} victoire${(c.victoires ?? 0) > 1 ? 's' : ''}.`] : null,
      (c.livraisons ?? 0) >= 3 ? ['Tiak Tiak', `${c.livraisons} livraisons pour un jeune livreur du quartier.`] : null,
      w >= 1e6 ? ['Économie', `Un jeune entrepreneur dépasse ${w >= 1e9 ? 'le milliard' : 'le million'} de FCFA.`] : null,
    ].filter(Boolean) as string[][];
    return `<p class="ph-sub">Jour ${t.day} · ${DAYS[(t.day - 1) % 7]}</p>
      ${[...mine, ...pick].map(([where, what], i) => `<article class="ph-news${i < mine.length ? ' me' : ''}"><small>${esc(where)}</small><p>${esc(what)}</p></article>`).join('')}
      <p class="ph-note">Les nouvelles changent chaque jour en ville.</p>`;
  }

  private calcHtml(): string {
    const keys = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='];
    return `<div class="ph-calc"><output>${this.calcShown()}</output>
      <div>${keys.map(k => `<button type="button" data-k="${k}" class="${'÷×−+='.includes(k) ? 'op' : 'AC±%'.includes(k) ? 'fn' : ''}${k === '0' ? ' zero' : ''}">${k}</button>`).join('')}</div></div>`;
  }
  private calcShown() {
    const n = Number(this.calc.shown.replace(',', '.'));
    if (!Number.isFinite(n)) return 'Erreur';
    const [i, d] = this.calc.shown.split(',');
    return Number(i).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + (d !== undefined ? ',' + d : '');
  }
  private calcKey(k: string) {
    const c = this.calc, val = () => Number(c.shown.replace(',', '.'));
    const apply = (a: number, b: number) => c.op === '+' ? a + b : c.op === '−' ? a - b : c.op === '×' ? a * b : c.op === '÷' ? a / b : b;
    const set = (n: number) => { c.shown = Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8).replace('.', ',') : 'NaN'; };
    if (/^\d$/.test(k)) { c.shown = c.fresh || c.shown === '0' ? k : (c.shown.replace(/\D/g, '').length < 12 ? c.shown + k : c.shown); c.fresh = false; }
    else if (k === ',') { if (c.fresh) { c.shown = '0,'; c.fresh = false; } else if (!c.shown.includes(',')) c.shown += ','; }
    else if (k === 'AC') { this.calc = { shown: '0', acc: null, op: '', fresh: true }; }
    else if (k === '±') set(-val());
    else if (k === '%') set(val() / 100);
    else if (k === '=') { if (c.op && c.acc !== null) set(apply(c.acc, val())); c.acc = null; c.op = ''; c.fresh = true; }
    else { if (c.op && c.acc !== null && !c.fresh) set(apply(c.acc, val())); c.acc = val(); c.op = k as typeof c.op; c.fresh = true; }
    const out = this.screenEl.querySelector('.ph-calc output'); if (out) out.textContent = this.calcShown();
  }

  private settingsHtml(): string {
    const q = this.ctx.quality(), muted = isMuted(), sens = this.ctx.input.sensitivity, gloss = glossesShown();
    const c = this.ctx.state.data.counters;
    const tm = theme.mode, TH: [ThemeMode, string][] = [['auto', 'Auto'], ['day', 'Jour'], ['night', 'Nuit']];
    return `<h3>Apparence</h3>
      <div class="seg">${TH.map(([k, l]) => `<button type="button" data-theme="${k}" class="${k === tm ? 'on' : ''}" aria-pressed="${k === tm}">${l}</button>`).join('')}</div>
      <p class="ph-note">${tm === 'auto' ? 'Auto : l’écran s’assombrit avec la nuit de la ville (de 19 h à 6 h).' : tm === 'day' ? 'Jour : l’écran reste clair, même la nuit.' : 'Nuit : l’écran reste sombre, même en plein jour.'}</p>
      <h3>Graphismes</h3>
      <div class="seg">${(['low', 'medium', 'high'] as Quality[]).map(k => `<button type="button" data-q="${k}" class="${k === q ? 'on' : ''}" aria-pressed="${k === q}">${QUALITY_LABEL[k]}</button>`).join('')}</div>
      <p class="ph-note">Basse : plus fluide sur les petits téléphones. Le quartier est reconstruit, tu restes où tu es.</p>
      <h3>Son</h3>
      <button type="button" class="ph-toggle ${muted ? '' : 'on'}" data-act="sound" aria-pressed="${!muted}"><span>Son du jeu</span><em>${muted ? 'Coupé' : 'Activé'}</em></button>
      <button type="button" class="ph-btn" data-act="soundtest">Tester le son<small>Démarrage, moteur, klaxon, chocs : le vrai son du jeu, et ce qui l’empêche</small></button>
      <p class="ph-note">Radio de la voiture (📻 au volant) : son volume, sous celui du jeu.</p>
      <div class="seg">${VOLUMES.map(v => `<button type="button" data-radio="${v.v}" class="${Math.abs(radio.volume - v.v) < 0.01 ? 'on' : ''}" aria-pressed="${Math.abs(radio.volume - v.v) < 0.01}">${v.label}</button>`).join('')}</div>
      ${canVibrate()
        ? `<button type="button" class="ph-toggle ${hapticsOn() ? 'on' : ''}" data-act="haptics" aria-pressed="${hapticsOn()}"><span>Vibrations (chocs, klaxon)</span><em>${hapticsOn() ? 'Activées' : 'Coupées'}</em></button>`
        : `<p class="ph-note">Ce navigateur ne fait pas vibrer le téléphone : les chocs se sentent par le son et la caméra.</p>`}
      <button type="button" class="ph-toggle ${mapBridge.enabled ? 'on' : ''}" data-act="minimap" aria-pressed="${mapBridge.enabled}"><span>Mini-carte</span><em>${mapBridge.enabled ? 'Affichée' : 'Masquée'}</em></button>
      <p class="ph-note">Le petit rond en haut à gauche : où tu es, les lieux autour, le quartier et la rue.</p>
      <h3>Caméra</h3>
      <div class="seg">${SENSITIVITY.map(([v, l]) => `<button type="button" data-sens="${v}" class="${v === sens ? 'on' : ''}" aria-pressed="${v === sens}">${l}</button>`).join('')}</div>
      <p class="ph-note">Sensibilité quand tu glisses pour tourner la caméra.</p>
      <h3>Langue</h3>
      <div class="seg"><button type="button" class="on" aria-pressed="true">Français, expressions en wolof</button></div>
      <p class="ph-note">On parle comme à Dakar : en français, avec le wolof de tous les jours (salutations, merci, marché, attaya, làmb…).</p>
      <button type="button" class="ph-toggle ${gloss ? 'on' : ''}" data-act="gloss" aria-pressed="${gloss}"><span>Traduction des expressions wolof</span><em>${gloss ? 'Affichée' : 'Masquée'}</em></button>
      <p class="ph-note">${gloss ? '« Jërëjëf (merci) » : la traduction suit l’expression.' : '« Jërëjëf » : le wolof seul, sans traduction.'}</p>
      <h3>Partie</h3>
      ${phoneHooks.saveCard ? saveCardHtml() : '<button type="button" class="ph-btn" data-act="save">Sauvegarder maintenant</button>'}
      <button type="button" class="ph-btn" data-act="new">Nouvelle partie<small>Efface la sauvegarde de cet appareil</small></button>
      <button type="button" class="ph-btn" data-app="aide">Aide et commandes</button>
      <div class="kv">Temps de jeu : ${Math.floor(this.ctx.state.data.playedMs / 60000)} min · Repas : ${c.meals ?? 0} · Services : ${c.shifts ?? 0} · Forme : ${c.forme ?? 0} · Trajets : ${c.trips ?? 0}<br>Partie invité, sans compte : elle n’est pas synchronisée entre appareils.<br>${esc(betaFooter())}</div>
      <button type="button" class="ph-btn" data-act="report">Signaler un problème<small>Copie la version du jeu, ton écran et l’endroit : colle-les dans ton message</small></button>
      <textarea class="ph-code" data-report readonly rows="6" hidden aria-label="Infos pour ton message"></textarea>`;
  }

  private walletHtml(): string {
    const rows = phoneHooks.ledger?.();
    const history = rows === undefined
      ? '<p class="ph-note">L’historique des gains et des dépenses arrive avec les métiers.</p>'
      : rows.length === 0 ? '<p class="ph-note">Aucune opération pour l’instant.</p>'
        : `<div class="ph-rows">${rows.slice().sort((a, b) => b.at - a.at).map(r => `<div><span>${esc(r.label)}<small>${esc(when(r.at))}</small></span><em class="${r.amount < 0 ? 'neg' : 'pos'}">${r.amount < 0 ? '−' : '+'}${fcfa(Math.abs(r.amount))}</em></div>`).join('')}</div>`;
    const cash = this.ctx.state.wallet, w = phoneHooks.wealth?.(), full = fcfa(cash);
    const size = full.length > 17 ? 'xl' : full.length > 13 ? 'l' : '';   // a long amount stays on one line
    const wealth = w ? `<div class="ph-rows ph-wealth">
        <div><span>Valeur des biens<small>Logements, terrains, panneau, affaires, meubles</small></span><em>${fcfa(w.assets)}</em></div>
        <div><span>Fortune totale<small>En poche + biens</small></span><em class="pos">${fcfa(cash + w.assets)}</em></div>
        <div><span>Revenus<small>Par heure en ville, pendant que tu joues</small></span><em>+${fcfa(w.perHour)}</em></div>
        ${w.charges ? `<div><span>Loyers et charges<small>Par heure en ville</small></span><em class="neg">−${fcfa(w.charges)}</em></div>` : ''}
        <div><span>${esc(w.polyvalence)}</span></div>
      </div>${phoneHooks.openAssets ? '<button type="button" class="ph-btn" data-app="biens">Biens<small>Logements, terrains, panneau, annonces</small></button>' : ''}${phoneHooks.openBusiness ? '<button type="button" class="ph-btn" data-app="affaires">Affaires<small>Acheter et voir les revenus</small></button>' : ''}` : '';
    return `<div class="ph-balance"><small>Solde</small><b class="${size}">${full}</b><span>FCFA · monnaie de jeu, sans valeur réelle</span></div>
      ${wealth}
      ${savedNoteHtml()}
      <h3>Historique</h3>${history}`;
  }

  /**
   * The map screen: the map first (the district's own, or the whole city), the strip under it (the player's shortcuts, the vehicles, the other districts and how long to walk there), and one
   * short card for whatever was picked. Nothing to read before using it.
   */
  private carteHtml(): string {
    const here = this.ctx.hub();
    return `<div class="cm"><div class="cm-map"><div class="gm-pane" data-pane="quartier">${fullMapHtml()}</div><div class="gm-pane" data-pane="ville" hidden>${geoMapHtml()}</div></div>
      <div class="cm-side"><div class="cm-strip" role="group" aria-label="Raccourcis et quartiers">${stripHtml(here)}</div>
        <div class="cm-sheet"${vehiclesOpen ? '' : ' hidden'}>${this.dealersHtml(here, !!phoneHooks.walkTo)}</div>${fullCardHtml()}${geoCardHtml()}</div></div>`;
  }

  /** « Véhicules »: every dealer of the city, in any district: mark it, and from another district walk there (free) with the marker kept. One line each. */
  private dealersHtml(here: HubId | null, walk: boolean): string {
    const rows = phoneHooks.dealers?.() ?? [], mark = phoneHooks.marked?.() ?? null;
    if (!rows.length || !phoneHooks.markPlace) return '';
    return `<p class="cm-sheet-h">Concessionnaires · essai gratuit</p><div class="ph-dealers">${rows.map(r => {
      const marked = mark?.id === r.id, there = here === r.hub, leg = here && !there ? walkMinutes(here, r.hub) : 0;
      const act = there ? (marked ? 'Retirer le repère' : '📍 Marquer') : walk ? `🚶 ${leg} min` : '📍 Marquer';
      return `<div class="ph-dealer${marked ? ' on' : ''}"><span><i class="dl-i" aria-hidden="true">${r.icon}</i><span class="dl-t"><b>${esc(r.name)}</b><small>${esc(HUB_NAMES[r.hub].split(' · ')[0])} · ${esc(r.vehicle)}</small></span></span>
        <button type="button" class="ph-btn" data-dealer="${esc(r.id)}" data-hub="${r.hub}" data-name="${esc(r.name)}">${act}</button></div>`;
    }).join('')}</div>`;
  }

  /** « Marquer » a dealer (or any place named by the strip's cards), and from another district walk there, the marker kept: it shows the way on arrival. */
  private dealerAct(b: HTMLElement) {
    const id = b.dataset.dealer!, hub = b.dataset.hub as HubId, name = b.dataset.name ?? '', here = this.ctx.hub();
    if (phoneHooks.marked?.()?.id === id && here === hub) { phoneHooks.markPlace?.(null); this.render(); return; }
    phoneHooks.markPlace?.(id, hub, name);
    if (here === hub || !phoneHooks.walkTo) { this.ctx.toast?.('Repère : ' + name); this.render(); return; }
    this.launch(() => phoneHooks.walkTo?.(hub));
  }

  private arenaHtml(): string {
    const d = this.ctx.state.data, c = d.counters;
    const combats = c.combats ?? 0, wins = c.victoires ?? 0;
    const rows: { label: string; value: string }[] = [
      { label: 'Écurie', value: d.flags.includes('ecurie_baobab') ? 'Écurie Baobab' : 'Aucune' },
      { label: 'Combats', value: String(combats) },
      { label: 'Victoires', value: String(wins) },
      { label: 'Défaites', value: String(Math.max(0, combats - wins)) },
      { label: 'Entraînements', value: String(c.lutte ?? 0) },
      ...(phoneHooks.arenaProfile?.() ?? []),
    ];
    // the city's table (career module): each wrestler's row opens his card in « Lutteurs »
    const table = phoneHooks.cityTable?.();
    const tableHtml = table ? `<h3>Classement de la ville · saison ${table.season}</h3><div class="ph-rows ph-table">${table.rows.map(r => r.id
      ? `<button type="button" data-lutteur="${esc(r.id)}"><b>${r.place}</b><span>${esc(r.name)}<small>${esc(r.sub)}</small></span><em>${r.pts} pts ›</em></button>`
      : `<div class="you"><b>${r.place}</b><span>${esc(r.name)}<small>${esc(r.sub)}</small></span><em>${r.pts} pts</em></div>`).join('')}</div>` : '';
    return `<div class="ph-rows">${rows.map(r => `<div><span>${esc(r.label)}</span><em>${esc(r.value)}</em></div>`).join('')}</div>
      ${phoneHooks.lutteurs ? '<button type="button" class="ph-btn" data-open="lutteurs">Lutteurs de la ville<small>Fiches, saison, derniers résultats · suivre un lutteur</small></button>' : ''}
      ${tableHtml}
      ${d.flags.includes('ecurie_baobab') ? '' : '<p class="ph-note">Pour rejoindre une écurie, va voir Coach Ablaye à l’écurie Baobab, à Pikine.</p>'}
      <p class="ph-note">Lutte sans frappe : règles Dakar Rek. La lutte avec frappe arrive ensuite.</p>`;
  }

  private bind() {
    const s = this.screenEl;
    s.querySelectorAll<HTMLElement>('[data-app]').forEach(b => b.addEventListener('click', () => {
      const tile = TILES.find(t => t.id === b.dataset.app)!;
      const hook = tile.hook?.();
      if (hook) this.launch(hook); else if (tile.screen) this.go(tile.screen);
    }));
    s.querySelectorAll<HTMLElement>('[data-open]').forEach(b => b.addEventListener('click', () => this.go(b.dataset.open as ScreenId)));
    s.querySelectorAll<HTMLElement>('[data-lutteur]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.lutteur!;
      this.go('lutteurs');
      this.screenEl.querySelector(`#lt-${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' });
    }));
    s.querySelectorAll<HTMLButtonElement>('[data-follow]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.follow!, now = phoneHooks.follow?.(b.classList.contains('on') ? null : id) ?? null;
      s.querySelectorAll<HTMLButtonElement>('[data-follow]').forEach(x => {          // in place: the list keeps its scroll
        const on = x.dataset.follow === now;
        x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); x.textContent = on ? '★ Suivi' : '☆ Suivre';
      });
    }));
    s.querySelectorAll<HTMLElement>('[data-go]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.go!; this.launch(() => phoneHooks.tonightGo?.(k)); }));
    s.querySelectorAll<HTMLElement>('.cm-sheet [data-dealer]').forEach(b => b.addEventListener('click', () => this.dealerAct(b)));
    s.querySelectorAll<HTMLElement>('[data-walk]').forEach(b => b.addEventListener('click', () => { const h = b.dataset.walk as HubId; this.launch(() => phoneHooks.walkTo?.(h)); }));
    s.querySelectorAll<HTMLElement>('.cm-sheet [data-drive]').forEach(b => b.addEventListener('click', () => { const h = (b.dataset.drive || null) as HubId | null, n = b.dataset.name; this.launch(() => phoneHooks.driveTo?.(h, n)); }));
    s.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach(b => b.addEventListener('click', () => this.calcKey(b.dataset.k!)));
    s.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach(b => b.addEventListener('click', () => {
      const q = b.dataset.q as Quality;
      if (q !== this.ctx.quality()) { this.ctx.setQuality(q); this.remember(); this.ctx.toast('Qualité : ' + QUALITY_LABEL[q]); }
      this.render();
    }));
    s.querySelectorAll<HTMLButtonElement>('button[data-theme]').forEach(b => b.addEventListener('click', () => { theme.setMode(b.dataset.theme as ThemeMode); this.render(); }));
    s.querySelectorAll<HTMLButtonElement>('button[data-radio]').forEach(b => b.addEventListener('click', () => { radio.setVolume(Number(b.dataset.radio)); this.render(); }));
    s.querySelectorAll<HTMLButtonElement>('button[data-sens]').forEach(b => b.addEventListener('click', () => {
      this.ctx.input.sensitivity = Number(b.dataset.sens);
      try { store()?.setItem(SENS_KEY, b.dataset.sens!); } catch { /* session only */ }
      this.render();
    }));
    const act = (name: string, fn: () => void) => s.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    act('minimap', () => { mapBridge.setEnabled(!mapBridge.enabled); this.render(); });
    act('sound', () => { setMuted(!isMuted()); this.render(); });
    act('soundtest', () => this.go('sontest'));
    act('haptics', () => { setHaptics(!hapticsOn()); this.render(); });
    act('gloss', () => { setGlossesShown(!glossesShown()); this.render(); });
    act('save', () => this.ctx.toast(this.ctx.save() ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur'));
    bindSaveCard(s, () => this.render());
    act('report', () => {
      const d = this.ctx.state.data, text = reportText({ hub: this.ctx.hub(), x: d.x, z: d.z, quality: this.ctx.quality(), playedMin: Math.floor(d.playedMs / 60000) });
      const box = s.querySelector<HTMLTextAreaElement>('[data-report]'); if (box) { box.value = text; box.hidden = false; box.addEventListener('focus', () => box.select()); }
      try { navigator.clipboard.writeText(text).then(() => this.ctx.toast('Infos copiées : colle-les dans ton message'), () => this.ctx.toast('Sélectionne les infos affichées et copie-les')); } catch { this.ctx.toast('Sélectionne les infos affichées et copie-les'); }
    });
    act('new', () => this.go('nouvelle'));
    act('editchar', () => this.launch(() => phoneHooks.editCharacter?.()));
    act('cancel', () => this.back());
    act('wipe', () => this.ctx.newGame());
  }
}

/** What the phone may say about the save: only what the storage really did (src/core/saveHealth.ts). */
const savedNoteHtml = () => { const st = phoneHooks.saveStatus?.(); return st ? `<p class="ph-note${st.ok ? '' : ' warn'}">${st.ok ? `Partie invité : gardée sur ${esc(st.where)}.` : 'Partie invité : la sauvegarde ne marche pas bien ici. Copie-la dans Réglages › Partie.'}</p>` : ''; };
const clock = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** One app icon: emoji on its gradient tile (or the fallback line icon), with its label under it in the grid. */
function appIcon(t: Tile, label: boolean): string {
  const look = LOOK[t.id], n = t.id === 'notifs' ? quietLog.unread : 0;
  const badge = n ? `<b class="ph-badge" aria-hidden="true">${n > 9 ? '9+' : n}</b>` : '';
  const tile = look ? `<i class="ph-ico" style="--g:linear-gradient(180deg,${look.grad})"><span>${look.emoji}</span></i>`
    : `<i class="ph-ico line" style="--g:${t.color}">${svg(t.icon)}</i>`;
  return `<button type="button" class="ph-app" data-app="${t.id}" aria-label="${esc(t.label)}${n ? ` · ${n}` : ''}">${tile}${badge}${label ? `<span>${esc(look?.short ?? t.label)}</span>` : ''}</button>`;
}

function when(at: number): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

const HELP_HTML = `<h3>Clavier et souris</h3>
  <div class="ph-rows">
    <div><span>Marcher</span><em>ZQSD, WASD ou flèches</em></div>
    <div><span>Tourner la caméra</span><em>Glisser avec la souris</em></div>
    <div><span>Pivoter la caméra</span><em>Q et R (A et R en AZERTY)</em></div>
    <div><span>Action, parler, entrer</span><em>E, Entrée ou Espace</em></div>
    <div><span>Téléphone</span><em>Échap ou M</em></div>
    <div><span>Tout fermer</span><em>Échap</em></div>
  </div>
  <h3>Écran tactile</h3>
  <div class="ph-rows">
    <div><span>Marcher</span><em>Joystick à gauche</em></div>
    <div><span>Tourner la caméra</span><em>Glisser à droite</em></div>
    <div><span>Action</span><em>Bouton jaune</em></div>
    <div><span>Téléphone</span><em>Bouton ☰</em></div>
  </div>
  <h3>En ville</h3>
  <p class="ph-note">Approche-toi d’un lieu ou d’une personne : le bouton Action indique ce que tu peux faire. Les cars rapides relient les quartiers depuis leur gare. Tes besoins (faim, énergie, moral, social, hygiène) baissent en jouant : mange, dors, lave-toi et vois du monde.</p>
  <p class="ph-note">En ligne, ouvrir le téléphone ne met pas la ville en pause : les autres joueurs continuent.</p>`;
