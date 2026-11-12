import type { HubId } from '../core/types';
/**
 * Shared contract between the in-game phone (src/ui/phone*.ts) and the modules that provide its apps.
 * A module registers what it provides; the phone shows an app only when its hook exists.
 * Keep this file tiny: it is the meeting point of parallel work (phone, chat, economy, NPCs, arena).
 */
export interface LedgerEntry { at: number; label: string; amount: number }
export const phoneHooks: {
  /** Messages app (chat module). */
  openMessages?: () => void;
  /** « Aller à pied » to a neighbourhood (main.ts doWalk: free, any energy, src/world/walk.ts). */
  walkTo?: (hub: import('../core/types').HubId) => void;
  /** The vehicle dealers of every district, and the walking marker that can name a place of another district (the map's « Concessionnaires »). */
  dealers?: () => { id: string; name: string; hub: import('../core/types').HubId; vehicle: string; icon: string; price: number; owned: boolean }[];
  markPlace?: (id: string | null, hub?: import('../core/types').HubId, name?: string) => void;
  /** The place marked on foot (any district), or null. */
  marked?: () => { id: string; hub: import('../core/types').HubId; name?: string } | null;
  /** The neighbourhood the player lives in (« Rentrer chez moi »), null without a home. */
  homeHub?: () => import('../core/types').HubId | null;
  /** « Partie » in the settings: save now, copy the save as a code, import one (src/ui/saveCard.ts; main.ts provides it). */
  saveCard?: import('./saveCard').SaveCardHooks;
  /** Whether the last save was kept, when, and where (« cet appareil »): never claim a save the storage refused (src/core/saveHealth.ts). */
  saveStatus?: () => { ok: boolean; at: number; where: string } | undefined;
  /** Wallet history (economy module). Local to the device until a server ledger exists. */
  ledger?: () => LedgerEntry[];
  /** Home app: where the player lives, its furniture, arranging it (ownership module). */
  openHome?: () => void;
  /** « Biens » app: net worth, everything owned or rented, listings (ownership module). */
  openAssets?: () => void;
  /** The ownership sheet of one asset id (a home, a plot…; `business:<placeId>` talks business at that place). */
  openAsset?: (assetId: string) => void;
  /** Jobs app (economy module). */
  openJobs?: () => void;
  /** « Courses VTC »: rides asked for with the player's own car (src/transport/vtc.ts). */
  openVtc?: () => void;
  /** « Crédits »: what the player owes and to whom, and repaying it (src/transport/sarrAuto.ts). */
  openCredits?: () => void;
  /** « Affaires » app: ventures, income, polyvalence, purchases (economy module). */
  openBusiness?: () => void;
  /** Opens the phone on an app or screen (main.ts), false when it cannot open now. */
  openPhone?: (app?: string) => boolean;
  /** « Mes pistes » (src/economy/pistesModule.ts): the open leads, « Y aller », « Pas maintenant ». */
  pistes?: () => import('../economy/pistes').Piste[];
  followPiste?: (id: string) => boolean;
  dropPiste?: (id: string) => boolean;
  /** The Banque Teranga savings app (bank module): its presence says the service exists in this build. */
  openBank?: () => void;
  /** Where the player's bana-bana table (or the one for sale) stands, for « Y aller » (business module); null when not in this build. */
  banaPlace?: () => import('../economy/pistes').PlaceRef | null;
  /**
   * Wealth beside the cash, for the wallet (economy module): value of everything owned (homes, land, billboards,
   * ventures, furniture), income and charges per in-game hour, polyvalence line.
   */
  wealth?: () => { assets: number; perHour: number; charges: number; polyvalence: string };
  /** Arena app: sporting profile (arena module; the career module adds rank, record, purses and attributes). */
  arenaProfile?: () => { label: string; value: string }[];
  /** Driving directions to a district (and a place of it), or none (src/game/navigation.ts). */
  driveTo?: (hub: HubId | null, name?: string) => void;
  /** The player is at the wheel (or on a saddle) now: the map offers directions first, not a walk. */
  driving?: () => boolean;
  /** The district chosen for directions, if any. */
  navGoal?: () => { hub: HubId; name: string } | null;
  /** « Profil »: the run of days worked and what it opens (src/economy/streakModule.ts). */
  streakProfile?: () => { label: string; detail: string }[];
  /**
   * Profile app: Forme / Richesse / Réputation / Influence, 0–100 each with a word and a reason (career module), and
   * the change since the last day played (« +6 depuis hier », '' when none; real saved values only).
   */
  profileDims?: () => { label: string; score: number; level: string; note: string; delta?: string }[];
  /**
   * Arena app › Lutteurs (career module): one card per roster wrestler (src/career/roster.ts wrestlerCard, with an SVG
   * portrait), the city's table linking to them, and « Suivre » (one wrestler followed, or none: returns who is followed).
   */
  lutteurs?: () => { id: string; name: string; ecurie: string; style: string; level: string; v: number; d: number; n: number; pts: number; place: number;
    belt: string | null; last: { day: number; vs: string; res: 'V' | 'D' | 'N'; main: boolean; title: boolean }[]; portrait: string; followed: boolean }[];
  cityTable?: () => { season: number; rows: { id: string | null; place: number; name: string; pts: number; sub: string }[] };
  follow?: (id: string | null) => string | null;
  /** « Ce soir » app: the evening's page (src/arena/tonight.ts), and « Y aller » toward one of its targets. */
  tonight?: () => { title: string; rows: { icon: string; label: string; detail?: string; go?: string; open?: string }[] }[];
  tonightGo?: (key: string) => void;
  /** Profile app: one line under the name (« Une vie à Dakar », « Lutteur · Undercards »). Never a class to pick. */
  profileHeadline?: () => string;
  /** Profile app › « Modifier mon personnage »: the character creator's screen on the current look (main.ts), without a new game. */
  editCharacter?: () => void;
  /** Profile app: the player's first name (presence profile). */
  profileName?: () => string;
  /** Profile app: a picture of the player's own avatar (data URL), or null while it is not drawn yet. */
  profilePortrait?: () => string | null;
  /** People app: neighbours the player knows (NPC module). */
  openPeople?: () => void;
  /** Local places directory and walking destination (city module). */
  openPlaces?: () => void;
  /** Réglages › « Jouer en ligne »: the online profile and the invitation (src/multiplayer/ui.ts, wired by main.ts). */
  openPresence?: () => void;
} = {};
