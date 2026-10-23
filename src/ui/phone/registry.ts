import { phoneHooks } from '../phoneHooks';

/**
 * Every app of the phone, in one registry: its icon (an emoji on a gradient tile), its name, its group in « Toutes les apps », its priority there, and
 * what it opens — a screen of the phone (`screen`), or another module's app (`hook`: the phone closes and the module opens its sheet). A hook app only
 * shows when its module registered the hook (src/ui/phoneHooks.ts). No app was removed by the redesign: the home screen shows five destinations, and
 * every app stays one tap away in « Toutes les apps ».
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
  screen?: string;
  hook?: () => (() => void) | undefined;
}

export const GROUPS: [AppGroup, string][] = [['vie', 'Ma vie'], ['travail', 'Travail'], ['argent', 'Argent et biens'], ['ville', 'En ville'], ['outils', 'Outils']];

export const APPS: AppDef[] = [
  { id: 'profil', label: 'Profil', emoji: '🧑🏾', grad: '#c4b5fd,#6d28d9', group: 'vie', order: 0, screen: 'profil' },
  { id: 'notifs', label: 'Notifications', short: 'Notifs', emoji: '🔔', grad: '#fca5a5,#dc2626', group: 'vie', order: 1, screen: 'notifs' },
  { id: 'messages', label: 'Messages', emoji: '💬', grad: '#5df27e,#1fb84a', group: 'vie', order: 2, hook: () => phoneHooks.openMessages },
  { id: 'carnet', label: 'Carnet', emoji: '📒', grad: '#fde68a,#d97706', group: 'vie', order: 3, screen: 'carnet' },
  { id: 'sante', label: 'Santé', emoji: '❤️', grad: '#fecdd3,#fb7185', group: 'vie', order: 4, screen: 'sante' },
  { id: 'habitants', label: 'Habitants', emoji: '👥', grad: '#5eead4,#0e7490', group: 'vie', order: 5, hook: () => phoneHooks.openPeople },

  { id: 'travailler', label: 'Travailler', emoji: '💼', grad: '#bef264,#4d7c0f', group: 'travail', order: 0, screen: 'travailler' },
  { id: 'travail', label: 'Tiak Tiak et petits boulots', short: 'Tiak Tiak', emoji: '🛵', grad: '#fde68a,#ca8a04', group: 'travail', order: 1, hook: () => phoneHooks.openJobs },
  { id: 'vtc', label: 'Courses VTC', short: 'VTC', emoji: '🚖', grad: '#fde047,#ca8a04', group: 'travail', order: 2, hook: () => phoneHooks.openVtc },
  { id: 'affaires', label: 'Affaires', emoji: '🏢', grad: '#34d399,#047857', group: 'travail', order: 3, hook: () => phoneHooks.openBusiness },
  { id: 'arene', label: 'Arène', emoji: '🤼', grad: '#d8b4fe,#7e22ce', group: 'travail', order: 4, screen: 'arene' },

  { id: 'portefeuille', label: 'Argent', emoji: '💰', grad: '#fcd34d,#f59e0b', group: 'argent', order: 0, screen: 'portefeuille' },
  { id: 'credits', label: 'Crédits', emoji: '💳', grad: '#93c5fd,#1d4ed8', group: 'argent', order: 1, hook: () => phoneHooks.openCredits },
  { id: 'logement', label: 'Maison', emoji: '🏠', grad: '#fda4af,#e11d48', group: 'argent', order: 2, screen: 'logement' },
  { id: 'maison', label: 'Mes meubles', short: 'Meubles', emoji: '🛋️', grad: '#fecaca,#b91c1c', group: 'argent', order: 3, hook: () => phoneHooks.openHome },
  { id: 'biens', label: 'Biens', emoji: '🔑', grad: '#fde68a,#b45309', group: 'argent', order: 4, hook: () => phoneHooks.openAssets },

  { id: 'carte', label: 'Carte', emoji: '🗺️', grad: '#7dd3fc,#2563eb', group: 'ville', order: 0, screen: 'carte' },
  { id: 'quartier', label: 'Coins du quartier', short: 'Quartier', emoji: '📍', grad: '#6ee7b7,#0f766e', group: 'ville', order: 1, hook: () => phoneHooks.openPlaces },
  { id: 'cesoir', label: 'Ce soir', emoji: '🌆', grad: '#fda4af,#be123c', group: 'ville', order: 2, screen: 'cesoir' },
  { id: 'actus', label: 'Actus', emoji: '📰', grad: '#fdba74,#c2410c', group: 'ville', order: 3, screen: 'actus' },
  { id: 'meteo', label: 'Météo', emoji: '⛅', grad: '#7dd3fc,#1e40af', group: 'ville', order: 4, screen: 'meteo' },

  { id: 'horloge', label: 'Horloge', emoji: '🕰️', grad: '#3f3f46,#09090b', group: 'outils', order: 0, screen: 'horloge' },
  { id: 'calcul', label: 'Calculatrice', short: 'Calcul', emoji: '🧮', grad: '#71717a,#18181b', group: 'outils', order: 1, screen: 'calcul' },
  { id: 'aide', label: 'Aide', emoji: '💡', grad: '#fef08a,#eab308', group: 'outils', order: 2, screen: 'aide' },
  { id: 'reglages', label: 'Réglages', emoji: '⚙️', grad: '#d1d5db,#6b7280', group: 'outils', order: 3, screen: 'reglages' },
];

export const appById = (id: string) => APPS.find(a => a.id === id);
/** The apps shown now: a hook app only with its module. */
export const visibleApps = () => APPS.filter(a => !a.hook || !!a.hook());
