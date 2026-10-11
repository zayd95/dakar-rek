export type HubId = 'plateau' | 'corniche' | 'almadies' | 'pikine';
export const HUB_IDS: HubId[] = ['plateau', 'corniche', 'almadies', 'pikine'];

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
  /** v3: wallet history on this device (last 100 money changes). Not a server ledger. */
  ledger: LedgerEntry[];
  /** v3: furniture owned in the starter room (item ids, src/economy/furniture.ts). */
  furniture: string[];
  /** v3: Tiak Tiak delivery in progress and completed run ids (a run is paid once). */
  jobs: JobsState;
}

export interface LedgerEntry { at: number; label: string; amount: number }
export interface ActiveJob {
  runId: string; routeId: string; hub: HubId;
  /** 'pickup': go to the pick-up point first (accepted from the phone); 'deliver': parcel in hand. */
  stage: 'pickup' | 'deliver';
  pay: number;
  /** Played time (ms) when the delivery leg started, and its limit. */
  startedMs: number; limitMs: number;
}
export interface JobsState { active: ActiveJob | null; done: string[]; seq: number }

export interface WrestlerLook { ngembColor: string; ngembPattern: string; accessories: string[] }
