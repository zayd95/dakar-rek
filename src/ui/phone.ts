/**
 * The character's phone: every user setting plus the main services (design doc, decisions by Habib).
 * Opens over the running game (online play is never paused), keeps its navigation between openings,
 * and works in portrait, landscape and with touch. Apps provided by other modules come from phoneHooks.
 */
import './phone.css';
import type { GameState } from '../core/state';
import type { Input } from '../core/input';
import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import { cityTimeAt, CITY_DAY_MS } from '../core/clock';
import { isMuted, setMuted } from '../core/audioSettings';
import { HUB_NAMES, travelLeg } from '../world/content';
import type { Relations } from '../social/relations';
import { suggestion } from '../social/beats';
import { phoneHooks } from './phoneHooks';
import { journalView, esc } from './journal';
import { glossesShown, setGlossesShown } from '../i18n/wolof';
import { fcfa } from './hud';

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

type ScreenId = 'home' | 'reglages' | 'aide' | 'nouvelle' | 'carnet' | 'portefeuille' | 'carte' | 'arene' | 'meteo' | 'calcul' | 'sante' | 'profil' | 'horloge' | 'actus';
interface Tile { id: string; label: string; color: string; icon: string; screen?: ScreenId; hook?: () => (() => void) | undefined }

const ICON: Record<string, string> = {
  messages: '<path d="M4 5h16v11H9l-5 4z"/>',
  portefeuille: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15.5 14.5h2"/>',
  carte: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  travail: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
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
  portefeuille: { emoji: '💰', grad: '#fcd34d,#f59e0b' },
  carte: { emoji: '🗺️', grad: '#7dd3fc,#2563eb', short: 'Carte' },
  quartier: { emoji: '📍', grad: '#6ee7b7,#0f766e', short: 'Quartier' },
  travail: { emoji: '🛵', grad: '#bef264,#4d7c0f' },
  maison: { emoji: '🏠', grad: '#fda4af,#e11d48', short: 'Maison' },
  habitants: { emoji: '👥', grad: '#5eead4,#0e7490' },
  affaires: { emoji: '🏢', grad: '#34d399,#047857' },
  arene: { emoji: '🤼', grad: '#d8b4fe,#7e22ce' },
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
  { id: 'portefeuille', label: 'Portefeuille', color: '#d97706', icon: ICON.portefeuille, screen: 'portefeuille' },
  { id: 'carte', label: 'Carte et déplacements', color: '#0284c7', icon: ICON.carte, screen: 'carte' },
  { id: 'quartier', label: 'Coins du quartier', color: '#0f766e', icon: ICON.quartier, hook: () => phoneHooks.openPlaces },
  { id: 'travail', label: 'Travail', color: '#7c5a2a', icon: ICON.travail, hook: () => phoneHooks.openJobs },
  { id: 'maison', label: 'Maison et proches', color: '#dc2626', icon: ICON.maison, hook: () => phoneHooks.openHome },
  { id: 'habitants', label: 'Habitants', color: '#0d9488', icon: ICON.habitants, hook: () => phoneHooks.openPeople },
  { id: 'arene', label: 'Arène', color: '#9333ea', icon: ICON.arene, screen: 'arene' },
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
  home: 'Téléphone', reglages: 'Réglages', aide: 'Aide', nouvelle: 'Nouvelle partie', carnet: 'Carnet',
  portefeuille: 'Portefeuille', carte: 'Carte et déplacements', arene: 'Arène', meteo: 'Météo', calcul: 'Calculatrice', sante: 'Santé', profil: 'Profil', horloge: 'Horloge', actus: 'Actus · Dakar',
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
    clearInterval(this.timer);
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
    switch (id) {
      case 'home': s.innerHTML = this.homeHtml(); break;
      case 'reglages': s.innerHTML = this.settingsHtml(); break;
      case 'aide': s.innerHTML = HELP_HTML; break;
      case 'nouvelle': s.innerHTML = `<p class="ph-note">Effacer la partie enregistrée sur cet appareil ? Argent, relations et progression seront perdus. Cette action est définitive.</p>
        <button type="button" class="ph-btn" data-act="cancel">Annuler</button>
        <button type="button" class="ph-btn danger" data-act="wipe">Effacer et recommencer</button>`; break;
      case 'carnet': { const j = journalView(this.ctx.rel, this.ctx.state); s.innerHTML = `<p class="ph-sub">${esc(j.subtitle)}</p><div class="ph-journal">${j.html}</div>`; break; }
      case 'portefeuille': s.innerHTML = this.walletHtml(); break;
      case 'carte': s.innerHTML = this.mapHtml(); break;
      case 'arene': s.innerHTML = this.arenaHtml(); break;
      case 'meteo': s.innerHTML = this.weatherHtml(); break;
      case 'calcul': s.innerHTML = this.calcHtml(); break;
      case 'sante': s.innerHTML = this.healthHtml(); break;
      case 'profil': s.innerHTML = this.profileHtml(); break;
      case 'horloge': s.innerHTML = this.clockHtml(); break;
      case 'actus': s.innerHTML = this.newsHtml(); break;
    }
    this.bind();
  }

  private homeHtml(): string {
    const hub = this.ctx.hub(), next = suggestion(this.ctx.rel, this.ctx.state), t = cityTimeAt(this.ctx.now());
    const tiles = TILES.filter(t => !t.hook || t.hook());
    const grid = tiles.filter(t => !DOCK.includes(t.id)), dock = tiles.filter(t => DOCK.includes(t.id));
    return `<div class="ph-lock"><b class="ph-clock">${clock(t.hour, t.minute)}</b><small>${DAYS[(t.day - 1) % 7]} · Jour ${t.day}${hub ? ' · ' + esc(HUB_NAMES[hub].split(' · ')[0]) : ''}</small></div>
      <div class="ph-widgets">
        <button type="button" class="ph-wid" data-open="portefeuille"><small>💰 Solde</small><b>${fcfa(this.ctx.state.wallet)}</b></button>
        <div class="ph-wid"><small>➜ Prochaine piste</small><span>${next ? esc(next.hint) : 'Pas de piste en cours : la ville est à toi.'}</span></div>
      </div>
      <div class="ph-grid">${grid.map(t => appIcon(t, true)).join('')}</div>
      <div class="ph-dock">${dock.map(t => appIcon(t, false)).join('')}</div>`;
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

  private healthHtml(): string {
    const n = this.ctx.state.data.needs as unknown as Record<string, number>;
    const NEEDS: [string, string, string, string][] = [['faim', 'Faim', '#f97316', 'Mange à une gargote, une dibiterie ou au mall.'], ['energie', 'Énergie', '#facc15', 'Dors dans ta chambre ou repose-toi à l’ombre.'],
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
    return `<div class="ph-profile"><i>🧑🏾</i><b>Toi</b><small>${fcfa(this.ctx.state.wallet)} · humeur ${esc(this.ctx.state.mood())}</small></div>
      <div class="ph-rows">${rows.map(([l, v]) => `<div><span>${l}</span><em>${typeof v === 'number' ? v.toLocaleString('fr-FR') : v}</em></div>`).join('')}</div>
      <p class="ph-note">Partie invité : ton profil est enregistré sur cet appareil.</p>`;
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
      ['Arène de Pikine', 'Combats amicaux ouverts à tous cette semaine.'], ['Plateau', 'La Banque Teranga cherche des coursiers pour livrer des dossiers.'],
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
    return `<h3>Graphismes</h3>
      <div class="seg">${(['low', 'medium', 'high'] as Quality[]).map(k => `<button type="button" data-q="${k}" class="${k === q ? 'on' : ''}" aria-pressed="${k === q}">${QUALITY_LABEL[k]}</button>`).join('')}</div>
      <p class="ph-note">Basse : plus fluide sur les petits téléphones. Le quartier est reconstruit, tu restes où tu es.</p>
      <h3>Son</h3>
      <button type="button" class="ph-toggle ${muted ? '' : 'on'}" data-act="sound" aria-pressed="${!muted}"><span>Son du jeu</span><em>${muted ? 'Coupé' : 'Activé'}</em></button>
      <h3>Caméra</h3>
      <div class="seg">${SENSITIVITY.map(([v, l]) => `<button type="button" data-sens="${v}" class="${v === sens ? 'on' : ''}" aria-pressed="${v === sens}">${l}</button>`).join('')}</div>
      <p class="ph-note">Sensibilité quand tu glisses pour tourner la caméra.</p>
      <h3>Langue</h3>
      <div class="seg"><button type="button" class="on" aria-pressed="true">Français, expressions en wolof</button></div>
      <p class="ph-note">On parle comme à Dakar : en français, avec le wolof de tous les jours (salutations, merci, marché, attaya, làmb…).</p>
      <button type="button" class="ph-toggle ${gloss ? 'on' : ''}" data-act="gloss" aria-pressed="${gloss}"><span>Traduction des expressions wolof</span><em>${gloss ? 'Affichée' : 'Masquée'}</em></button>
      <p class="ph-note">${gloss ? '« Jërëjëf (merci) » : la traduction suit l’expression.' : '« Jërëjëf » : le wolof seul, sans traduction.'}</p>
      <h3>Partie</h3>
      <button type="button" class="ph-btn" data-act="save">Sauvegarder maintenant</button>
      <button type="button" class="ph-btn" data-act="new">Nouvelle partie<small>Efface la sauvegarde de cet appareil</small></button>
      <button type="button" class="ph-btn" data-app="aide">Aide et commandes</button>
      <div class="kv">Temps de jeu : ${Math.floor(this.ctx.state.data.playedMs / 60000)} min · Repas : ${c.meals ?? 0} · Services : ${c.shifts ?? 0} · Forme : ${c.forme ?? 0} · Trajets : ${c.trips ?? 0}<br>Sauvegarde invité : sur cet appareil seulement (pas de compte).<br>Dakar Rek · version de développement 0.1</div>`;
  }

  private walletHtml(): string {
    const rows = phoneHooks.ledger?.();
    const history = rows === undefined
      ? '<p class="ph-note">L’historique des gains et des dépenses arrive avec les métiers.</p>'
      : rows.length === 0 ? '<p class="ph-note">Aucune opération pour l’instant.</p>'
        : `<div class="ph-rows">${rows.slice().sort((a, b) => b.at - a.at).map(r => `<div><span>${esc(r.label)}<small>${esc(when(r.at))}</small></span><em class="${r.amount < 0 ? 'neg' : 'pos'}">${r.amount < 0 ? '−' : '+'}${fcfa(Math.abs(r.amount))}</em></div>`).join('')}</div>`;
    return `<div class="ph-balance"><small>Solde</small><b>${fcfa(this.ctx.state.wallet)}</b><span>FCFA · monnaie de jeu, sans valeur réelle</span></div>
      <p class="ph-note">Partie invité : cet argent est enregistré sur cet appareil seulement.</p>
      <h3>Historique</h3>${history}`;
  }

  private mapHtml(): string {
    const here = this.ctx.hub();
    return `<p class="ph-note">Pour changer de quartier, va à la gare des cars rapides du quartier : le trajet se paie et prend du temps.</p>
      ${phoneHooks.openPlaces ? '<button type="button" class="ph-btn" data-app="quartier">Choisir un repère à pied<small>Commerces, travail et lieux de rencontre du quartier</small></button>' : ''}
      ${[...HUB_IDS].sort((a, b) => Number(b === here) - Number(a === here)).map(h => {
        const leg = here && h !== here ? travelLeg(here, h) : null;
        const places = this.known[h];
        return `<section class="ph-hub ${h === here ? 'here' : ''}" data-hub="${h}">
          <header><b>${esc(HUB_NAMES[h])}</b>${h === here ? '<em>Tu es ici</em>' : leg ? `<small>${fcfa(leg.cost)} · ≈ ${leg.minutes} min</small>` : ''}</header>
          ${places?.length ? `<ul>${places.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="ph-note">Lieux à découvrir sur place.</p>'}
        </section>`;
      }).join('')}`;
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
    return `<div class="ph-rows">${rows.map(r => `<div><span>${esc(r.label)}</span><em>${esc(r.value)}</em></div>`).join('')}</div>
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
    s.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach(b => b.addEventListener('click', () => this.calcKey(b.dataset.k!)));
    s.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach(b => b.addEventListener('click', () => {
      const q = b.dataset.q as Quality;
      if (q !== this.ctx.quality()) { this.ctx.setQuality(q); this.remember(); this.ctx.toast('Qualité : ' + QUALITY_LABEL[q]); }
      this.render();
    }));
    s.querySelectorAll<HTMLButtonElement>('button[data-sens]').forEach(b => b.addEventListener('click', () => {
      this.ctx.input.sensitivity = Number(b.dataset.sens);
      try { store()?.setItem(SENS_KEY, b.dataset.sens!); } catch { /* session only */ }
      this.render();
    }));
    const act = (name: string, fn: () => void) => s.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    act('sound', () => { setMuted(!isMuted()); this.render(); });
    act('gloss', () => { setGlossesShown(!glossesShown()); this.render(); });
    act('save', () => this.ctx.toast(this.ctx.save() ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur'));
    act('new', () => this.go('nouvelle'));
    act('cancel', () => this.back());
    act('wipe', () => this.ctx.newGame());
  }
}

const clock = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** One app icon: emoji on its gradient tile (or the fallback line icon), with its label under it in the grid. */
function appIcon(t: Tile, label: boolean): string {
  const look = LOOK[t.id];
  const tile = look ? `<i class="ph-ico" style="--g:linear-gradient(180deg,${look.grad})"><span>${look.emoji}</span></i>`
    : `<i class="ph-ico line" style="--g:${t.color}">${svg(t.icon)}</i>`;
  return `<button type="button" class="ph-app" data-app="${t.id}" aria-label="${esc(t.label)}">${tile}${label ? `<span>${esc(look?.short ?? t.label)}</span>` : ''}</button>`;
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
