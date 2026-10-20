import type { ActiveJob, ActivityId, ActivityState, AssetState, AssetsState, Avatar, HubId, JobsState, LedgerEntry, Needs, Placement, SaveData, TourRun, WrestlerLook } from './types';
import { ACTIVITY_IDS, AVATARS, HUB_IDS } from './types';
import { clamp } from './rng';
import { careerOf, newCareer } from '../career/career';

/**
 * Where the game keeps its save. Every schema owns a key: schema v6 lives under `SAVE_KEY`; the keys older clients write —
 * `V5_SAVE_KEY` (schema 5: the launch client) and `LEGACY_SAVE_KEY` (schemas 1 to 4, or a v5 test build) — are only ever READ,
 * once, to migrate. An older client that is served again (a rollback) keeps reading and writing its own key and can never
 * overwrite v6 progress, and this client never rewrites or removes what an older one wrote. A future schema gets its own key.
 */
export const SAVE_KEY = 'dakarrek.guest.save.v6';
export const V5_SAVE_KEY = 'dakarrek.guest.save.v5';
export const LEGACY_SAVE_KEY = 'dakarrek.guest.save';
/** Written by the v5 client: `migrated` once it carried the legacy save over, `declined` after its New Game. Only read here (never written). */
export const LEGACY_DONE_KEY = 'dakarrek.guest.save.legacy';
/** Written by this client at a New Game (`declined`): the older saves (v5 and legacy) are not imported again. It lives in v6's own namespace. */
export const IMPORT_DONE_KEY = 'dakarrek.guest.save.v6.import';
/**
 * A New Game starts with the default look, but remembers which avatar the player had chosen as a SUGGESTION: it is written here at a New
 * Game (v6's own namespace; older clients never read it) and read back with `suggestedAvatar`. Nothing applies it: whoever offers the
 * choice of look (the Meshy avatar lane's picker) shows it pre-selected, and the player confirms it or chooses again.
 */
export const AVATAR_SUGGESTION_KEY = 'dakarrek.guest.save.v6.avatar-suggestion';
export const SCHEMA_VERSION = 6;
/** Wallet history entries kept in the save, and completed delivery ids remembered (no double payment). */
export const LEDGER_MAX = 100;
export const DONE_JOBS_MAX = 200;
/** Largest amount a save keeps exactly (2^53 − 1 ≈ 9 × 10^15 F): a precision limit, far beyond the ventures ladder, not a cap. */
export const MONEY_MAX = Number.MAX_SAFE_INTEGER;
/** Assets kept in a save (furniture included): far above any home's furniture, a guard against a corrupted save. */
export const ASSETS_MAX = 2000;
/** Catalogue id of the starter room in Pikine, lent by the family (src/economy/catalog.ts). Every save holds it. */
export const STARTER_HOME = 'chambre_pikine';
export const DEFAULT_WRESTLER: WrestlerLook = { ngembColor: 'blanc', ngembPattern: 'uni', accessories: [] };

export const START_NEEDS: Needs = { faim: 70, energie: 85, moral: 70, social: 60, hygiene: 80 };

export function newGuestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newSave(now = Date.now()): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION, guestId: newGuestId(), createdAt: now, savedAt: now, playedMs: 0,
    hub: 'pikine', x: 0, z: 0, yaw: 0, wallet: 3000, needs: { ...START_NEEDS }, counters: {},
    rel: {}, flags: [], beats: {}, wrestler: { ...DEFAULT_WRESTLER, accessories: [] }, avatar: 'homme',
    ledger: [], jobs: { active: null, done: [], seq: 0 }, activities: { known: [], last: {} },
    assets: newAssets(0), inventory: {}, career: newCareer(),
  };
}

/** The avatar the player had chosen before their last New Game, to offer again as a pre-selected suggestion (null: none, or unreadable). */
export function suggestedAvatar(store: KV | null): Avatar | null {
  try { const r = JSON.parse(store?.getItem(AVATAR_SUGGESTION_KEY) ?? 'null') as { avatar?: unknown } | null; return AVATARS.includes(r?.avatar as Avatar) ? r!.avatar as Avatar : null; } catch { return null; }
}

/** Asset state of a new game: only the starter room, where the player lives. */
export function newAssets(playedMs: number): AssetsState {
  return {
    list: [starterRoom(1, playedMs)], seq: 1, home: 'a1',
    clockMs: playedMs, payMs: playedMs, carryIn: 0, carryOut: 0, earned: 0, spent: 0, arrears: 0, adUntil: 0,
  };
}
const starterRoom = (n: number, since: number): AssetState =>
  ({ uid: 'a' + n, spec: STARTER_HOME, how: 'given', since, paid: 0, condition: 100, upgrades: [], leased: false });

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ID = /^[a-z0-9_]{1,40}$/;
const UID = /^a(\d{1,9})$/;
const HOW: AssetState['how'][] = ['owned', 'rented', 'given'];

/**
 * Where the player resumes in a hub (main.ts loadHub, from a save or a teleport): the requested spot when it lies inside
 * the hub's bounds, else the hub's spawn — a save from an older map or a corrupt position is put back in the city.
 */
export function resumeSpot<S extends { x: number; z: number; yaw: number }>(at: S | undefined, bounds: { x0: number; x1: number; z0: number; z1: number }, spawn: S): S {
  return at && at.x >= bounds.x0 && at.x <= bounds.x1 && at.z >= bounds.z0 && at.z <= bounds.z1 ? at : spawn;
}

/** Validate and migrate any stored object into a current SaveData; returns null if unusable. */
export function migrate(raw: unknown, now = Date.now()): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ver = num(r.schemaVersion, 0);
  if (ver > SCHEMA_VERSION) return null; // written by a newer client: never overwrite blindly
  const base = newSave(now);
  const n = (r.needs ?? {}) as Record<string, unknown>;
  const hub = HUB_IDS.includes(r.hub as HubId) ? (r.hub as HubId) : base.hub;
  const counters: Record<string, number> = {};
  if (r.counters && typeof r.counters === 'object') {
    for (const [k, v] of Object.entries(r.counters as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) counters[k] = v;
  }
  const playedMs = Math.max(0, num(r.playedMs, 0));
  // v3/v4 starter-room furniture ids (migrated into furniture assets below).
  const furniture = Array.isArray(r.furniture) ? [...new Set((r.furniture as unknown[]).filter((f): f is string => typeof f === 'string' && ID.test(f)))].slice(0, 32) : [];
  const beats = strRecord(r.beats);
  // v4 → v5: the inventory leaves the counters (`inv:<id>`).
  const inventory = inventoryOf(r.inventory);
  for (const [k, v] of Object.entries(counters)) {
    if (!k.startsWith('inv:')) continue;
    delete counters[k];
    const id = k.slice(4);
    if (v >= 1 && ID.test(id) && !(id in inventory)) inventory[id] = Math.min(1e6, Math.floor(v));
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    guestId: typeof r.guestId === 'string' && r.guestId ? r.guestId : base.guestId,
    createdAt: num(r.createdAt, now), savedAt: num(r.savedAt, now), playedMs,
    hub, x: num(r.x, 0), z: num(r.z, 0), yaw: num(r.yaw, 0),
    wallet: money(num(r.wallet, base.wallet)),
    needs: {
      faim: clamp(num(n.faim, base.needs.faim), 0, 100), energie: clamp(num(n.energie, base.needs.energie), 0, 100),
      moral: clamp(num(n.moral, base.needs.moral), 0, 100), social: clamp(num(n.social, base.needs.social), 0, 100),
      hygiene: clamp(num(n.hygiene, base.needs.hygiene), 0, 100),
    },
    counters,
    // v1 -> v2: relationships, story flags, beats and wrestler look start empty.
    rel: numRecord(r.rel, -100, 100),
    flags: Array.isArray(r.flags) ? (r.flags as unknown[]).filter((f): f is string => typeof f === 'string').slice(0, 500) : [],
    beats,
    wrestler: wrestlerOf(r.wrestler),
    // cosmetic city player model (additive, no version change: a save without it gets the default)
    avatar: AVATARS.includes(r.avatar as Avatar) ? (r.avatar as Avatar) : base.avatar,
    // v2 -> v3: wallet history and deliveries start empty.
    ledger: ledgerOf(r.ledger),
    jobs: jobsOf(r.jobs),
    // v3 -> v4: the activities already practised are read from the counters (they unlock tiers but are not « recent »).
    activities: activitiesOf(r.activities, playedMs, { counters, beats, furniture }),
    // v4 -> v5: the starter-room furniture and the ventures' units become assets (one model for everything owned); older
    // saves start the income clock now (nothing is owed for the time before); the inventory gets its own field.
    assets: r.assets && typeof r.assets === 'object' ? assetsOf(r.assets, playedMs) : assetsFromV4(r.business, furniture, playedMs),
    inventory,
    // fight record (additive, no version change: a save without it starts with an empty record)
    career: careerOf(r.career),
  };
}

/** Whole, non-negative, exact amount. */
const money = (v: number) => Math.min(MONEY_MAX, Math.max(0, Math.round(v)));

/**
 * Sanitises a v5 asset state: malformed entries are dropped, clocks never run ahead of the played time, the starter room
 * is always there. Catalogue ids are only checked for shape here; src/economy/assets.ts ignores ids it does not know.
 */
function assetsOf(v: unknown, playedMs: number): AssetsState {
  const a = v as Record<string, unknown>;
  const clock = (x: unknown) => clamp(num(x, playedMs), 0, playedMs);
  const list: AssetState[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(a.list) ? (a.list as unknown[]).slice(0, ASSETS_MAX) : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.uid !== 'string' || !UID.test(x.uid) || seen.has(x.uid) || typeof x.spec !== 'string' || !ID.test(x.spec)) continue;
    seen.add(x.uid);
    const asset: AssetState = {
      uid: x.uid, spec: x.spec, how: HOW.includes(x.how as AssetState['how']) ? x.how as AssetState['how'] : 'owned',
      since: clock(x.since), paid: money(num(x.paid, 0)), condition: clamp(num(x.condition, 100), 0, 100),
      upgrades: Array.isArray(x.upgrades) ? [...new Set((x.upgrades as unknown[]).filter((u): u is string => typeof u === 'string' && ID.test(u)))].slice(0, 16) : [],
      leased: x.leased === true,
    };
    if (x.ownAd === true) asset.ownAd = true;
    if (typeof x.basis === 'number' && x.basis > 0) asset.basis = money(x.basis);
    if (typeof x.home === 'string' && UID.test(x.home)) { asset.home = x.home; asset.at = placementOf(x.at); }
    list.push(asset);
  }
  // furniture whose home is gone (or points at another piece of furniture) has nowhere to stand: it is dropped
  const homes = new Set(list.filter(x => !x.home).map(x => x.uid));
  const kept = list.filter(x => !x.home || homes.has(x.home));
  if (!kept.some(x => x.spec === STARTER_HOME)) kept.unshift(starterRoom(nextSeq(kept), playedMs));
  const seq = Math.max(Math.floor(num(a.seq, 0)), nextSeq(kept) - 1);
  const home = typeof a.home === 'string' && kept.some(x => x.uid === a.home && !x.home) ? a.home : kept.find(x => x.spec === STARTER_HOME)!.uid;
  return {
    list: kept, seq, home, clockMs: clock(a.clockMs), payMs: clock(a.payMs),
    carryIn: clamp(num(a.carryIn, 0), 0, MONEY_MAX), carryOut: clamp(num(a.carryOut, 0), 0, MONEY_MAX),
    earned: money(num(a.earned, 0)), spent: money(num(a.spent, 0)), arrears: money(num(a.arrears, 0)),
    adUntil: clamp(num(a.adUntil, 0), 0, playedMs + 30 * 86_400_000),
  };
}
/** v3 / v4 → v5: the starter room, its furniture (stored; the game puts each piece back at its usual spot) and the ventures. */
function assetsFromV4(business: unknown, furniture: string[], playedMs: number): AssetsState {
  const st = newAssets(playedMs);
  const b = (business && typeof business === 'object' ? business : {}) as Record<string, unknown>;
  const add = (spec: string, extra: Partial<AssetState> = {}) => {
    st.list.push({ uid: 'a' + ++st.seq, spec, how: 'owned', since: playedMs, paid: 0, condition: 100, upgrades: [], leased: false, ...extra });
  };
  for (const f of furniture) add(f, { home: st.home!, at: null });
  if (b.owned && typeof b.owned === 'object') {
    for (const [k, x] of Object.entries(b.owned as Record<string, unknown>).slice(0, 32)) {
      if (!/^[a-z_]{1,32}$/.test(k) || typeof x !== 'number' || !Number.isFinite(x) || x < 1) continue;
      for (let i = 0; i < Math.min(1000, Math.floor(x)); i++) add(k);
    }
  }
  const clock = (x: unknown) => clamp(num(x, playedMs), 0, playedMs);   // never ahead of the played time
  st.clockMs = clock(b.clockMs); st.payMs = clock(b.payMs);
  st.carryIn = clamp(num(b.carry, 0), 0, MONEY_MAX); st.earned = money(num(b.earned, 0));
  return st;
}
const nextSeq = (list: AssetState[]) => 1 + list.reduce((m, x) => Math.max(m, Number(UID.exec(x.uid)?.[1] ?? 0)), 0);
function placementOf(v: unknown): Placement | null {
  const p = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!p || typeof p.x !== 'number' || typeof p.z !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return { x: clamp(p.x, -50, 50), z: clamp(p.z, -50, 50), rot: ((Math.round(num(p.rot, 0)) % 4) + 4) % 4 };
}
function inventoryOf(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 200)) if (ID.test(k) && typeof x === 'number' && Number.isFinite(x) && x >= 1) out[k] = Math.min(1e6, Math.floor(x));
  }
  return out;
}

function activitiesOf(v: unknown, playedMs: number, d: { counters: Record<string, number>; beats: Record<string, string>; furniture: string[] }): ActivityState {
  const a = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!a) return { known: inferKnown(d), last: {} };
  const alias = (x: unknown) => (x === 'services' ? 'service' : x);           // the v4 affaires lane called it « services »
  const list = Array.isArray(a.known) ? (a.known as unknown[]).map(alias) : [];
  const raw = { ...(a.last && typeof a.last === 'object' ? a.last : {}) } as Record<string, unknown>;
  if ('services' in raw && !('service' in raw)) raw.service = raw.services;
  const last: ActivityState['last'] = {};
  for (const id of ACTIVITY_IDS) { const x = raw[id]; if (typeof x === 'number' && Number.isFinite(x)) last[id] = clamp(x, 0, playedMs); }
  return { known: ACTIVITY_IDS.filter(id => list.includes(id) || id in last), last };
}
/** Categories a save from before v4 had already practised, read from its counters (they unlock, they are not recent). */
export function inferKnown(d: { counters: Record<string, number>; beats: Record<string, string>; furniture: string[] }): ActivityId[] {
  const n = (k: string) => d.counters[k] ?? 0, out: ActivityId[] = [];
  if (n('livraisons') > 0) out.push('livraison');
  if (n('shifts') > 0) out.push('service');
  if (n('meubles') > 0 || d.furniture.length > 0) out.push('commerce');
  if (n('combats') + n('lutte') + n('lamb_skill') > 0) out.push('combat');
  if (n('chats') > 0 || Object.keys(d.beats).length > 0) out.push('social');
  return out;
}

function ledgerOf(v: unknown): LedgerEntry[] {
  if (!Array.isArray(v)) return [];
  const out: LedgerEntry[] = [];
  for (const e of v as unknown[]) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.amount === 'number' && Number.isFinite(x.amount) && typeof x.label === 'string') out.push({ at: num(x.at, 0), label: x.label.slice(0, 80), amount: Math.round(x.amount) });
  }
  return out.slice(-LEDGER_MAX);
}
function tourOf(v: unknown): TourRun | null {
  const t = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!t || typeof t.id !== 'string' || !Array.isArray(t.order) || t.order.length !== 2) return null;
  const [p, q] = t.order as unknown[];
  if (!((p === 0 && q === 1) || (p === 1 && q === 0))) return null;
  const pair = (x: unknown): [number, number] | null => (Array.isArray(x) && x.length === 2 && x.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) ? [x[0] as number, x[1] as number] : null);
  const limitS = pair(t.limitS), pay = pair(t.pay);
  if (!limitS || !pay) return null;
  const late = Array.isArray(t.late) ? (t.late as unknown[]).filter((x): x is boolean => typeof x === 'boolean').slice(0, 2) : [];
  const leg = t.leg === 1 ? 1 : 0;
  if (late.length !== leg) return null;                    // the stops served and the leg being served must agree
  return { id: t.id, order: [p, q], leg, departed: t.departed === true, limitS, pay, late };
}
function jobsOf(v: unknown): JobsState {
  const j = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const done = Array.isArray(j.done) ? (j.done as unknown[]).filter((d): d is string => typeof d === 'string').slice(-DONE_JOBS_MAX) : [];
  const a = (j.active && typeof j.active === 'object' ? j.active : null) as Record<string, unknown> | null;
  let active: ActiveJob | null = null;
  if (a && typeof a.runId === 'string' && typeof a.routeId === 'string' && HUB_IDS.includes(a.hub as HubId) && !done.includes(a.runId)) {
    active = {
      runId: a.runId, routeId: a.routeId, hub: a.hub as HubId, stage: a.stage === 'pickup' ? 'pickup' : 'deliver',
      pay: Math.max(0, Math.round(num(a.pay, 0))), startedMs: Math.max(0, num(a.startedMs, 0)), limitMs: Math.max(0, num(a.limitMs, 0)),
    };
    const t = tourOf(a.tour);
    if (t) active.tour = t;
    else if (a.tour !== undefined) active = null;          // a tour this build cannot read: dropped, nothing paid
  }
  return { active, done, seq: Math.max(0, Math.floor(num(j.seq, 0))) };
}

function numRecord(v: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'number' && Number.isFinite(x)) out[k] = clamp(x, lo, hi);
  return out;
}
function strRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string') out[k] = x;
  return out;
}
function wrestlerOf(v: unknown): WrestlerLook {
  const w = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    ngembColor: typeof w.ngembColor === 'string' ? w.ngembColor : DEFAULT_WRESTLER.ngembColor,
    ngembPattern: typeof w.ngembPattern === 'string' ? w.ngembPattern : DEFAULT_WRESTLER.ngembPattern,
    accessories: Array.isArray(w.accessories) ? (w.accessories as unknown[]).filter((a): a is string => typeof a === 'string').slice(0, 8) : [],
  };
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function loadSave(store: KV | null): SaveData | null {
  if (!store) return null;
  try {
    const own = store.getItem(SAVE_KEY);
    if (own) return migrate(JSON.parse(own));   // a v6 save wins for good, even when it cannot be read: nothing falls back to an older one
    if (store.getItem(IMPORT_DONE_KEY)) return null;   // New Game: the older saves stay on the device for an older client, they do not come back
    // one-time migration from the newest older save: v5, else the legacy one (production, schema 3). Written at once so a second tab
    // or a reload takes the v6 save; the older bytes are never touched.
    const v5 = store.getItem(V5_SAVE_KEY);
    if (v5) return carryOver(store, migrate(JSON.parse(v5)));   // a v5 save that cannot be read is not replaced by the legacy one either
    if (store.getItem(LEGACY_DONE_KEY)) return null;
    const legacy = store.getItem(LEGACY_SAVE_KEY);
    return legacy ? carryOver(store, migrate(JSON.parse(legacy))) : null;
  } catch { return null; }
}
function carryOver(store: KV, data: SaveData | null): SaveData | null {
  if (!data) return null;
  try { store.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* full or blocked storage: it is tried again at the next save */ }
  return data;
}
export function writeSave(store: KV | null, data: SaveData): boolean {
  try { store?.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); return !!store; } catch { return false; }
}
/**
 * New Game: forget the v6 save and never carry an older one over again (they stay in the storage, for an older client). The marker is
 * written first; on a full storage it is retried once the v6 save is gone (that frees the room it needs).
 */
export function clearSave(store: KV | null) {
  if (!store) return;
  try {                                                  // remember the chosen look, as a suggestion for the next game (never applied here)
    const cur = JSON.parse(store.getItem(SAVE_KEY) ?? 'null') as { avatar?: unknown } | null;
    if (AVATARS.includes(cur?.avatar as Avatar)) store.setItem(AVATAR_SUGGESTION_KEY, JSON.stringify({ avatar: cur!.avatar }));
  } catch { /* unreadable save or full storage: no suggestion */ }
  let marked = true;
  try { store.setItem(IMPORT_DONE_KEY, 'declined'); } catch { marked = false; }
  try { store.removeItem(SAVE_KEY); } catch { /* ignore */ }
  if (!marked) { try { store.setItem(IMPORT_DONE_KEY, 'declined'); } catch { /* blocked storage: the older save may come back */ } }
}
