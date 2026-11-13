import { phoneHooks } from '../phoneHooks';
import { online } from '../../online/api';
import { quietLog } from '../quiet';

/**
 * Every app of the phone, in one registry: its icon (an emoji on a gradient tile), its name, its place on the home screen (`dock`: one of the four
 * favourites at the bottom; `home`: its rank in the grid, the most used first), its group in the app library (« Toutes les apps ») and its priority
 * there, and what it opens — a screen of the phone (`screen`), or another module's app (`hook`: the phone closes and the module opens its sheet). A hook
 * app only shows when its module registered the hook (src/ui/phoneHooks.ts). Every app is ONE tap from the home screen; the library is the same apps
 * sorted by theme. An app may carry a `badge` (a count the shell keeps up to date on its tile, wherever the tile is).
 */
export type AppGroup = 'vie' | 'travail' | 'argent' | 'ville' | 'outils';
export interface AppDef {
  id: string;
  label: string;
  /** The name under the tile, when the label is long. */
  short?: string;
  emoji: string;
  grad: string;
  group: AppGroup;
  /** Lower first within its group. */
  order: number;
  /** Rank in the home screen's grid (lower first: what a player opens all day comes first). */
  home: number;
  /** One of the dock's four favourites (always in view at the bottom of the home screen), in `home` order. */
  dock?: boolean;
  screen?: string;
  hook?: () => (() => void) | undefined;
  /** A count to show on the app's tile (unread messages); 0: none. */
  badge?: () => number;
}

export const GROUPS: [AppGroup, string][] = [['vie', 'Ma vie'], ['travail', 'Travail'], ['argent', 'Argent et biens'], ['ville', 'En ville'], ['outils', 'Outils']];

export const APPS: AppDef[] = [
  { id: 'profil', label: 'Profil', emoji: '🧑🏾', grad: '#c4b5fd,#6d28d9', group: 'vie', order: 0, home: 11, screen: 'profil' },
  { id: 'notifs', label: 'Notifications', short: 'Notifs', emoji: '🔔', grad: '#fca5a5,#dc2626', group: 'vie', order: 1, home: 10, screen: 'notifs', badge: () => quietLog.unread },
  // LD2.0-B: a screen of the phone (src/ui/phone/apps/messages.ts) on the player's online account, no longer the chat panel's private tab
  { id: 'messages', label: 'Messages', emoji: '💬', grad: '#5df27e,#1fb84a', group: 'vie', order: 2, home: 3, dock: true, screen: 'messages', badge: () => online?.unread() ?? 0 },
  { id: 'carnet', label: 'Carnet', emoji: '📒', grad: '#fde68a,#d97706', group: 'vie', order: 3, home: 41, screen: 'carnet' },
  { id: 'sante', label: 'Santé', emoji: '❤️', grad: '#fecdd3,#fb7185', group: 'vie', order: 4, home: 42, screen: 'sante' },
  { id: 'habitants', label: 'Habitants', emoji: '👥', grad: '#5eead4,#0e7490', group: 'vie', order: 5, home: 40, hook: () => phoneHooks.openPeople },

  { id: 'travailler', label: 'Travailler', emoji: '💼', grad: '#bef264,#4d7c0f', group: 'travail', order: 0, home: 1, dock: true, screen: 'travailler' },
  { id: 'pistes', label: 'Mes pistes', short: 'Pistes', emoji: '🧭', grad: '#fde68a,#0e7490', group: 'travail', order: 0.5, home: 30, screen: 'pistes' },
  { id: 'travail', label: 'Tiak Tiak et petits boulots', short: 'Tiak Tiak', emoji: '🛵', grad: '#fde68a,#ca8a04', group: 'travail', order: 1, home: 20, hook: () => phoneHooks.openJobs },
  { id: 'vtc', label: 'Courses VTC', short: 'VTC', emoji: '🚖', grad: '#fde047,#ca8a04', group: 'travail', order: 2, home: 13, hook: () => phoneHooks.openVtc },
  { id: 'affaires', label: 'Affaires', emoji: '🏢', grad: '#34d399,#047857', group: 'travail', order: 3, home: 31, hook: () => phoneHooks.openBusiness },
  { id: 'arene', label: 'Arène', emoji: '🤼', grad: '#d8b4fe,#7e22ce', group: 'travail', order: 4, home: 53, screen: 'arene' },

  { id: 'portefeuille', label: 'Argent', emoji: '💰', grad: '#fcd34d,#f59e0b', group: 'argent', order: 0, home: 2, dock: true, screen: 'portefeuille' },
  { id: 'banque', label: 'Banque', emoji: '🏦', grad: '#5eead4,#0f766e', group: 'argent', order: 0.5, home: 22, screen: 'banque' },
  { id: 'credits', label: 'Crédits', emoji: '💳', grad: '#93c5fd,#1d4ed8', group: 'argent', order: 1, home: 32, hook: () => phoneHooks.openCredits },
  { id: 'logement', label: 'Maison', emoji: '🏠', grad: '#fda4af,#e11d48', group: 'argent', order: 2, home: 12, screen: 'logement' },
  { id: 'maison', label: 'Mes meubles', short: 'Meubles', emoji: '🛋️', grad: '#fecaca,#b91c1c', group: 'argent', order: 3, home: 33, hook: () => phoneHooks.openHome },
  { id: 'biens', label: 'Biens et véhicules', short: 'Biens', emoji: '🔑', grad: '#fde68a,#b45309', group: 'argent', order: 4, home: 21, hook: () => phoneHooks.openAssets },
  // 1.0.1 « Retrouver mon véhicule » (src/ui/phone/apps/vehicles.ts): where each vehicle was left, « Localiser » on the phone's map.
  { id: 'vehicules', label: 'Mes véhicules', short: 'Véhicules', emoji: '🚗', grad: '#93c5fd,#0e7490', group: 'argent', order: 4.5, home: 23.5, screen: 'vehicules' },

  { id: 'carte', label: 'Carte', emoji: '🗺️', grad: '#7dd3fc,#2563eb', group: 'ville', order: 0, home: 0, dock: true, screen: 'carte' },
  { id: 'quartier', label: 'Coins du quartier', short: 'Quartier', emoji: '📍', grad: '#6ee7b7,#0f766e', group: 'ville', order: 1, home: 43, hook: () => phoneHooks.openPlaces },
  { id: 'cesoir', label: 'Ce soir', emoji: '🌆', grad: '#fda4af,#be123c', group: 'ville', order: 2, home: 50, screen: 'cesoir' },
  { id: 'actus', label: 'Actus', emoji: '📰', grad: '#fdba74,#c2410c', group: 'ville', order: 3, home: 51, screen: 'actus' },
  { id: 'meteo', label: 'Météo', emoji: '⛅', grad: '#7dd3fc,#1e40af', group: 'ville', order: 4, home: 52, screen: 'meteo' },

  { id: 'horloge', label: 'Horloge', emoji: '🕰️', grad: '#3f3f46,#09090b', group: 'outils', order: 0, home: 60, screen: 'horloge' },
  { id: 'calcul', label: 'Calculatrice', short: 'Calcul', emoji: '🧮', grad: '#71717a,#18181b', group: 'outils', order: 1, home: 61, screen: 'calcul' },
  { id: 'aide', label: 'Aide', emoji: '💡', grad: '#fef08a,#eab308', group: 'outils', order: 2, home: 62, screen: 'aide' },
  { id: 'reglages', label: 'Réglages', emoji: '⚙️', grad: '#d1d5db,#6b7280', group: 'outils', order: 3, home: 23, screen: 'reglages' },
];

export const appById = (id: string) => APPS.find(a => a.id === id);
/** The apps shown now: a hook app only with its module. */
export const visibleApps = () => APPS.filter(a => !a.hook || !!a.hook());
/** The home screen: the dock's favourites and the grid, each in `home` order (hook apps only with their module). */
export function homeLayout(): { dock: AppDef[]; grid: AppDef[] } {
  const list = visibleApps().sort((a, b) => a.home - b.home);
  return { dock: list.filter(a => a.dock), grid: list.filter(a => !a.dock) };
}
