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
import { cityTimeAt } from '../core/clock';
import { isMuted, setMuted } from '../core/audioSettings';
import { HUB_NAMES, travelLeg } from '../world/content';
import type { Relations } from '../social/relations';
import { suggestion } from '../social/beats';
import { phoneHooks } from './phoneHooks';
import { journalView, esc } from './journal';
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

type ScreenId = 'home' | 'reglages' | 'aide' | 'nouvelle' | 'carnet' | 'portefeuille' | 'carte' | 'arene';
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
  { id: 'aide', label: 'Aide', color: '#2563eb', icon: ICON.aide, screen: 'aide' },
  { id: 'reglages', label: 'Réglages', color: '#334155', icon: ICON.reglages, screen: 'reglages' },
];

const TITLES: Record<ScreenId, string> = {
  home: 'Téléphone', reglages: 'Réglages', aide: 'Aide', nouvelle: 'Nouvelle partie', carnet: 'Carnet',
  portefeuille: 'Portefeuille', carte: 'Carte et déplacements', arene: 'Arène',
};
const QUALITY_LABEL: Record<Quality, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute' };
const SENSITIVITY: [number, string][] = [[0.6, 'Lente'], [1, 'Normale'], [1.5, 'Rapide']];
const SENS_KEY = 'dakarrek.camera.sensitivity';
const PLACES_KEY = 'dakarrek.phone.places';

const svg = (paths: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
function store(): Storage | null { try { return window.localStorage; } catch { return null; } }

export class Phone {
  readonly el = document.createElement('div');
  /** Shared app hooks (exposed for debug checks). */
  readonly hooks = phoneHooks;
  private screenEl: HTMLElement;
  private timeEl: HTMLElement;
  private moneyEl: HTMLElement;
  private titleEl: HTMLElement;
  /** Navigation stack below the home screen; kept between openings. */
  private stack: ScreenId[] = [];
  private timer = 0;
  /** Places seen in each hub, remembered on this device. */
  private known: Partial<Record<HubId, string[]>> = {};

  constructor(private ctx: PhoneContext) {
    this.el.id = 'phone';
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'Téléphone'); this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `<div class="ph-device">
        <div class="ph-status"><span class="ph-time"></span><span class="ph-money"></span></div>
        <div class="ph-head"><h2></h2></div>
        <div class="ph-screen"></div>
        <nav class="ph-nav">
          <button type="button" data-nav="back" aria-label="Retour">‹ Retour</button>
          <button type="button" data-nav="home" aria-label="Accueil">Accueil</button>
          <button type="button" data-nav="close" aria-label="Reprendre">Reprendre</button>
        </nav>
      </div>`;
    this.screenEl = this.el.querySelector('.ph-screen')!;
    this.timeEl = this.el.querySelector('.ph-time')!;
    this.moneyEl = this.el.querySelector('.ph-money')!;
    this.titleEl = this.el.querySelector('.ph-head h2')!;
    // Taps on the phone never reach the joystick or the camera drag underneath.
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
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
    this.timeEl.textContent = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} · Jour ${t.day}`;
    this.moneyEl.textContent = fcfa(this.ctx.state.wallet);
  }

  private render() {
    this.status();
    const id = this.current;
    this.el.dataset.screen = id;
    this.titleEl.textContent = TITLES[id];
    (this.el.querySelector('[data-nav="back"]') as HTMLButtonElement).disabled = id === 'home';
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
    }
    this.bind();
  }

  private homeHtml(): string {
    const hub = this.ctx.hub(), next = suggestion(this.ctx.rel, this.ctx.state);
    const tiles = TILES.filter(t => !t.hook || t.hook());
    return `<div class="ph-widget"><b>${hub ? esc(HUB_NAMES[hub]) : '…'}</b><small>${next ? '➜ ' + esc(next.hint) : 'Pas de piste en cours : la ville est à toi.'}</small></div>
      <div class="ph-grid">${tiles.map(t => `<button type="button" class="ph-app" data-app="${t.id}"><i style="background:${t.color}">${svg(t.icon)}</i><span>${t.label}</span></button>`).join('')}</div>`;
  }

  private settingsHtml(): string {
    const q = this.ctx.quality(), muted = isMuted(), sens = this.ctx.input.sensitivity;
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
      <div class="seg"><button type="button" class="on" aria-pressed="true">Français</button></div>
      <p class="ph-note">Les textes en wolof et en pulaar sont en cours de relecture ; ils seront proposés une fois validés.</p>
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
    act('save', () => this.ctx.toast(this.ctx.save() ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur'));
    act('new', () => this.go('nouvelle'));
    act('cancel', () => this.back());
    act('wipe', () => this.ctx.newGame());
  }
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
