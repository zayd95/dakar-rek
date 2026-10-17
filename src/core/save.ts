import type { ActiveJob, ActivityId, ActivityState, AssetState, AssetsState, HubId, JobsState, LedgerEntry, Needs, Placement, SaveData, WrestlerLook } from './types';
import { ACTIVITY_IDS, HUB_IDS } from './types';
import { clamp } from './rng';
import { careerOf, newCareer } from '../career/career';

export const SAVE_KEY = 'dakarrek.guest.save';
export const SCHEMA_VERSION = 5;
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
    rel: {}, flags: [], beats: {}, wrestler: { ...DEFAULT_WRESTLER, accessories: [] },
    ledger: [], jobs: { active: null, done: [], seq: 0 }, activities: { known: [], last: {} },
    assets: newAssets(0), inventory: {}, career: newCareer(),
  };
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
  try { const s = store?.getItem(SAVE_KEY); return s ? migrate(JSON.parse(s)) : null; } catch { return null; }
}
export function writeSave(store: KV | null, data: SaveData): boolean {
  try { store?.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); return !!store; } catch { return false; }
}
export function clearSave(store: KV | null) { try { store?.removeItem(SAVE_KEY); } catch { /* ignore */ } }
