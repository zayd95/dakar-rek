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
  /** Home app: furniture owned and available (economy/housing module). */
  openHome?: () => void;
  /** Jobs app (economy module). */
  openJobs?: () => void;
  /** Arena app: sporting profile (arena module). */
  arenaProfile?: () => { label: string; value: string }[];
  /** People app: neighbours the player knows (NPC module). */
  openPeople?: () => void;
  /** Local places directory and walking destination (city module). */
  openPlaces?: () => void;
} = {};
