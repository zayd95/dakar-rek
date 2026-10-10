/**
 * Shared contract between the in-game phone (src/ui/phone*.ts) and the modules that provide its apps.
 * A module registers what it provides; the phone shows an app only when its hook exists.
 * Keep this file tiny: it is the meeting point of parallel work (phone, chat, economy, NPCs, arena).
 */
export interface LedgerEntry { at: number; label: string; amount: number }
export const phoneHooks: {
  /** Messages app (chat module). */
  openMessages?: () => void;
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
  /** « Affaires » app: ventures, income, polyvalence, purchases (economy module). */
  openBusiness?: () => void;
  /**
   * Wealth beside the cash, for the wallet (economy module): value of everything owned (homes, land, billboards,
   * ventures, furniture), income and charges per in-game hour, polyvalence line.
   */
  wealth?: () => { assets: number; perHour: number; charges: number; polyvalence: string };
  /** Arena app: sporting profile (arena module; the career module adds rank, record, purses and attributes). */
  arenaProfile?: () => { label: string; value: string }[];
  /** Profile app: Forme / Richesse / Réputation / Influence, 0–100 each with a word and a reason (career module). */
  profileDims?: () => { label: string; score: number; level: string; note: string }[];
  /** Profile app: one line under the name (« Une vie à Dakar », « Lutteur · Undercards »). Never a class to pick. */
  profileHeadline?: () => string;
  /** People app: neighbours the player knows (NPC module). */
  openPeople?: () => void;
  /** Local places directory and walking destination (city module). */
  openPlaces?: () => void;
} = {};
