import type { ActiveJob, ActivityId, ActivityState, BusinessState, HubId, JobsState, LedgerEntry, Needs, SaveData, WrestlerLook } from './types';
import { ACTIVITY_IDS, HUB_IDS } from './types';
import { clamp } from './rng';

export const SAVE_KEY = 'dakarrek.guest.save';
export const SCHEMA_VERSION = 4;
/** Wallet history entries kept in the save, and completed delivery ids remembered (no double payment). */
export const LEDGER_MAX = 100;
export const DONE_JOBS_MAX = 200;
/** Largest amount a save keeps exactly (2^53 − 1 ≈ 9 × 10^15 F): a precision limit, far beyond the ventures ladder, not a cap. */
export const MONEY_MAX = Number.MAX_SAFE_INTEGER;
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
    ledger: [], furniture: [], jobs: { active: null, done: [], seq: 0 },
    business: { owned: {}, clockMs: 0, payMs: 0, carry: 0, earned: 0 }, activities: { known: [], last: {} },
  };
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

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
  const furniture = Array.isArray(r.furniture) ? [...new Set((r.furniture as unknown[]).filter((f): f is string => typeof f === 'string'))].slice(0, 32) : [];
  const beats = strRecord(r.beats);
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
    // v2 -> v3: wallet history, starter-room furniture and deliveries start empty.
    ledger: ledgerOf(r.ledger),
    furniture,
    jobs: jobsOf(r.jobs),
    // v3 -> v4: no ventures yet (their income clock starts now, nothing is owed for the time before); the activities
    // already practised are read from the counters (they unlock tiers but are not « recent »).
    business: businessOf(r.business, playedMs),
    activities: activitiesOf(r.activities, playedMs, { counters, beats, furniture }),
  };
}

/** Whole, non-negative, exact amount. */
const money = (v: number) => Math.min(MONEY_MAX, Math.max(0, Math.round(v)));

function businessOf(v: unknown, playedMs: number): BusinessState {
  const b = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const owned: Record<string, number> = {};
  if (b.owned && typeof b.owned === 'object') {
    for (const [k, x] of Object.entries(b.owned as Record<string, unknown>).slice(0, 32)) if (/^[a-z_]{1,32}$/.test(k) && typeof x === 'number' && Number.isFinite(x) && x >= 1) owned[k] = Math.min(1000, Math.floor(x));
  }
  const clock = (x: unknown) => clamp(num(x, playedMs), 0, playedMs);   // never ahead of the played time
  return { owned, clockMs: clock(b.clockMs), payMs: clock(b.payMs), carry: clamp(num(b.carry, 0), 0, MONEY_MAX), earned: money(num(b.earned, 0)) };
}
function activitiesOf(v: unknown, playedMs: number, d: { counters: Record<string, number>; beats: Record<string, string>; furniture: string[] }): ActivityState {
  const a = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!a) return { known: inferKnown(d), last: {} };
  const list = Array.isArray(a.known) ? a.known as unknown[] : [];
  const raw = (a.last && typeof a.last === 'object' ? a.last : {}) as Record<string, unknown>;
  const last: ActivityState['last'] = {};
  for (const id of ACTIVITY_IDS) { const x = raw[id]; if (typeof x === 'number' && Number.isFinite(x)) last[id] = clamp(x, 0, playedMs); }
  return { known: ACTIVITY_IDS.filter(id => list.includes(id) || id in last), last };
}
/** Categories a save from before v4 had already practised, read from its counters (they unlock, they are not recent). */
export function inferKnown(d: { counters: Record<string, number>; beats: Record<string, string>; furniture: string[] }): ActivityId[] {
  const n = (k: string) => d.counters[k] ?? 0, out: ActivityId[] = [];
  if (n('livraisons') > 0) out.push('livraison');
  if (n('shifts') > 0) out.push('services');
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
