import type { CareerSave } from '../career/career';
export type HubId = 'plateau' | 'corniche' | 'almadies' | 'pikine';
export const HUB_IDS: HubId[] = ['plateau', 'corniche', 'almadies', 'pikine'];
/**
 * Activity categories that count for polyvalence (src/economy/polyvalence.ts): the working and social ones among the
 * activity framework's categories (src/activity/types.ts ActivityCategory; leisure, prayer and travel do not count).
 */
export const ACTIVITY_IDS = ['livraison', 'service', 'commerce', 'combat', 'peche', 'artisanat', 'social'] as const;
export type ActivityId = typeof ACTIVITY_IDS[number];

export interface Needs { faim: number; energie: number; moral: number; social: number; hygiene: number }

/** Guest save: device-local, never authoritative for transferable money (see design doc, Saves and accounts). */
export interface SaveData {
  schemaVersion: number;
  guestId: string;
  createdAt: number;
  savedAt: number;
  playedMs: number;
  hub: HubId;
  x: number; z: number; yaw: number;
  wallet: number;
  needs: Needs;
  counters: Record<string, number>;
  /** Relationship levels (-100 rival … 100 close friend), keyed by sorted pair "a|b"; "player" is the player. */
  rel: Record<string, number>;
  /** Story flags set by authored beats (met, owes a favour, recommended…). */
  flags: string[];
  /** Completed story beats: beat id -> choice id. */
  beats: Record<string, string>;
  /** Wrestling identity (cosmetic only, never combat power). */
  wrestler: WrestlerLook;
  /** Which city player model is drawn (cosmetic only; the Meshy avatar lane, branch claude/lucid-cori-60vlgt). Carried through every migration. */
  avatar: Avatar;
  /** v3: wallet history on this device (last 100 money changes). Not a server ledger. */
  ledger: LedgerEntry[];
  /** v3: Tiak Tiak delivery in progress and completed run ids (a run is paid once). */
  jobs: JobsState;
  /** v4: activity categories practised, for polyvalence (src/economy/polyvalence.ts). */
  activities: ActivityState;
  /**
   * v5: everything the player owns or rents — homes, land, billboards, ventures, furniture (vehicles and aircraft
   * later) — on one model (src/economy/assets.ts), with the income clock. Replaces v3 `furniture` and v4 `business`.
   */
  assets: AssetsState;
  /** v5: what the player carries (item id → count; src/activity/inventory.ts). Replaces the `inv:<id>` counters. */
  inventory: Record<string, number>;
  /** Fight record and best rung reached (src/career/career.ts). Additive field: older saves start with an empty record. */
  career: CareerSave;
}

export interface LedgerEntry { at: number; label: string; amount: number }
export interface ActiveJob {
  runId: string; routeId: string; hub: HubId;
  /** 'pickup': go to the pick-up point first (accepted from the phone); 'deliver': parcel in hand. */
  stage: 'pickup' | 'deliver';
  pay: number;
  /** Played time (ms) when the delivery leg started, and its limit. */
  startedMs: number; limitMs: number;
  /** A « tournée » (src/economy/tour.ts): two clients served in the order picked. Absent for an ordinary delivery. */
  tour?: TourRun;
}
/**
 * A tour in hand. `order` lists the two stops (indexes into the tour's stops) in the order they are served, `leg` is the
 * one being served now. Time limits and pay are fixed when the tour is accepted (the clients' trust at that moment), so
 * what was shown is what is paid, across reloads. The clock (`startedMs`) starts at `departed`.
 */
export interface TourRun {
  id: string; order: [number, number]; leg: 0 | 1;
  departed: boolean;
  /** Seconds allowed and base pay of each stop, by stop index. */
  limitS: [number, number]; pay: [number, number];
  /** Whether each stop served so far was late. */
  late: boolean[];
}
export interface JobsState { active: ActiveJob | null; done: string[]; seq: number }

/** One asset held by the player (save state). What it is — name, price, size, income… — is in the catalogue. */
export interface AssetState {
  /** Instance id ('a1', 'a2'…): several chairs or kiosks of the same catalogue entry are separate assets. */
  uid: string;
  /** Catalogue id (src/economy/catalog.ts, src/economy/furniture.ts). */
  spec: string;
  /** Bought, rented (a lease paid per in-game day) or given (the starter room, lent by the family). */
  how: 'owned' | 'rented' | 'given';
  /** Played time (ms) of the purchase or lease. */
  since: number;
  /** Price paid (F). */
  paid: number;
  /** 0–100: wear lowers the rent it brings and its value; a repair restores it. */
  condition: number;
  /** Upgrade ids bought for this asset. */
  upgrades: string[];
  /** Let to someone else (a plot, a billboard, a home the player does not live in): it brings rent. */
  leased: boolean;
  /** A billboard the player owns showing the player's own ad. */
  ownAd?: boolean;
  /**
   * A vehicle moved over from a retired catalogue entry (the old « Voiture d'occasion »): its worth stays what its owner paid, not the new
   * entry's price, so resale and net worth carry no windfall when the catalogue changes. Absent: worth follows the catalogue price.
   */
  basis?: number;
  /** Furniture: the home (asset uid) it belongs to, and where it stands there (null = stored). */
  home?: string;
  at?: Placement | null;
}
/** Furniture placement in a home: metres from the home interior's centre, quarter turns (0 faces +z, the door side). */
export interface Placement { x: number; z: number; rot: number }
export interface AssetsState {
  list: AssetState[];
  /** Number of the last uid given. */
  seq: number;
  /** Uid of the home the player lives in (new furniture is delivered there). */
  home: string | null;
  /** Played time (ms) up to which income and charges were counted, and of the last hourly settlement. */
  clockMs: number; payMs: number;
  /** Counted but not settled yet (F, fractional). */
  carryIn: number; carryOut: number;
  /** Totals settled so far. */
  earned: number; spent: number;
  /** Rent the wallet could not cover (F); a lease ends after three in-game days of arrears. */
  arrears: number;
  /** Played time (ms) until which ad space rented on a billboard runs. */
  adUntil: number;
}
export interface ActivityState {
  /** Categories ever practised (unlocks), and the played time (ms) each was last practised (polyvalence). */
  known: ActivityId[]; last: Partial<Record<ActivityId, number>>;
}

export type Avatar = 'homme' | 'femme';
export const AVATARS: Avatar[] = ['homme', 'femme'];

export interface WrestlerLook { ngembColor: string; ngembPattern: string; accessories: string[] }
