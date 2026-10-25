import type { CareerSave } from '../career/career';
import type { Appearance } from '../actors/appearance';
import type { PistesState } from '../economy/pistes';
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
  /** Which city player model is drawn (cosmetic only): the Meshy body of that identity (src/actors/playerBody.ts). Carried through every migration. */
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
  /**
   * Money owed to the people who trusted the player (src/economy/credit.ts): a car bought on credit from Sarr Auto, a repair Modou let them pay later.
   * Additive field (no version change): a save without it owes nothing. Game money only.
   */
  loans: LoansState;
  /** VTC rides (src/transport/vtc.ts): the ride in hand and the ones already paid (a ride is paid once). Additive field. */
  vtc: VtcState;
  /**
   * The player's own days (« jours de jeu », src/economy/streak.ts): one more each time a city day begins while they play, or when they come back on a
   * later city day (however many went by while they were away: time away is never counted against them). Additive field.
   */
  play: PlayDays;
  /** Days worked in a row (src/economy/streak.ts), counted in the player's own days. Additive field: a save without it starts with no streak. */
  streak: StreakState;
  /**
   * The look chosen in the character studio (src/actors/appearance.ts: skin tone, hairstyle, outfit, outfit colour), for the body above. Additive field, no version
   * change: a save without it (every save made before the studio) is null and draws the body exactly as it was made.
   */
  appearance: Appearance | null;
  /**
   * LD2.0-A: the Banque Teranga savings account (src/economy/money.ts): the second of the player's money accounts, beside the wallet. Additive field, no
   * version change: a save without it has an empty account. Kept in the third extras backup (src/core/save.ts EXTRAS_V3_KEY) so an older client that
   * drops it at its save never loses the player's savings for good.
   */
  bank: BankState;
  /** LD2.0-A: what the player did with « Mes pistes » (src/economy/pistes.ts): leads dismissed or followed, offered in the street. Additive field. */
  pistes: PistesState;
}

/**
 * One movement of a money account other than the wallet (the wallet keeps its own `ledger`). Whole francs; `balance` is the account's balance after it.
 * `ref`, when given, is the operation's idempotency key: an operation with a ref already applied is refused (never applied twice).
 */
export interface BankTx {
  id: string;
  /** Real time (ms) and the player's day (SaveData.play.day) when it was applied. */
  at: number; day: number;
  kind: BankTxKind;
  /** Signed amount moved on this account (deposit +, withdrawal −). */
  amount: number;
  balance: number;
  label: string;
  ref?: string;
}
export type BankTxKind = 'deposit' | 'withdraw' | 'interest';
export interface BankState {
  /** Opened at the counter or from the phone (the player's day; −1: never opened). */
  opened: number;
  savings: number;
  /** History, oldest first (last BANK_TX_MAX kept), and the sequence of tx ids. */
  tx: BankTx[]; seq: number;
  /** The player's savings goal (null: none). */
  goal: { amount: number; label: string } | null;
  /** Idempotency keys of the operations already applied (last BANK_REFS_MAX). */
  refs: string[];
  /** The player's day interest was last paid on (−1: never), and the milestones (savings levels, F) already celebrated. */
  interestDay: number; milestones: number[];
}

export interface PlayDays {
  /** The player's day (1 on the first day played). */
  day: number;
  /** The city day it was last advanced on (−1: never). */
  city: number;
}
export interface StreakState {
  /** Days in a row with real work done, and the longest run ever. */
  run: number; best: number;
  /** The player's day the run was last counted on (−1: never), the played time then (ms), and the active days ever. */
  last: number; lastMs: number; total: number;
  /** Days that may be skipped without breaking the run (given back at each week). */
  grace: number;
  /** Milestones (2, 3, 5, 7 days) already celebrated once: later runs reaching them get a short word, not the whole card. */
  seen: number[];
}

/**
 * One debt. The schedule is fixed when it is signed: `installment` every `every` days from `openedDay`, until `principal` is repaid. Days are the player's
 * own (`clock: 'play'`, SaveData.play); a debt signed before them counted city days and is moved onto the player's days the first time it is looked at.
 */
export interface LoanState {
  id: string;
  /** Who lent: Pape Sarr (Sarr Auto) or Modou (Garage Modou). */
  lender: 'sarr' | 'modou';
  kind: 'vehicle' | 'repair';
  label: string;
  /** The financed vehicle (asset uid) and its catalogue id. */
  asset?: string; spec?: string;
  /** What is owed after the down payment, what has been repaid. */
  principal: number; paid: number;
  installment: number; every: number;
  openedDay: number;
  /** The last city day whose due dates were looked at, and how many due dates were missed (the lender remembers). */
  checkedDay: number; missed: number;
  status: 'open' | 'closed';
  closedDay?: number;
  /** 'play': the days above are the player's days. Absent: city days (a debt from before them). */
  clock?: 'play';
  /** A car credit: a share of each VTC fare goes to the lender (true by default; the player can turn it off). */
  share?: boolean;
}
export interface LoansState { list: LoanState[]; seq: number }

/** A VTC ride in hand (src/transport/vtc.ts): fixed when accepted, so what was shown is what is paid, across reloads. */
export interface VtcTrip {
  id: string;
  from: HubId; to: HubId;
  /** Where the passenger waits and where they get out (hub-local metres), and the places' names. */
  pickup: { x: number; z: number; name: string }; dropoff: { x: number; z: number; name: string };
  fare: number;
  /** 'pickup': drive to the passenger · 'aboard': they sit in the car. */
  stage: 'pickup' | 'aboard';
  passenger: { name: string; seed: number };
  /** The vehicle they ride in (catalogue id) and their seat. */
  asset?: string; seat?: string;
  acceptedMs: number;
}
export interface VtcState { active: VtcTrip | null; done: string[]; seq: number; trips: number; earned: number }

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

/** The two playable identities: the Meshy bodies (src/actors/playerBody.ts). */
export type Avatar = 'homme' | 'femme';
export const AVATARS: Avatar[] = ['homme', 'femme'];

export interface WrestlerLook { ngembColor: string; ngembPattern: string; accessories: string[] }
