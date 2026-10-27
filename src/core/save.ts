import type { ActiveJob, ActivityId, ActivityState, AssetState, AssetsState, Avatar, BanaResult, BanaSession, BanaState, BankState, BankTx, BankTxKind, HubId, JobsState, LedgerEntry, LoanState, LoansState, Needs, OnlinePending, OnlineSave, Placement, PlayDays, SaveData, StreakState, TourRun, VtcState, VtcTrip, WrestlerLook } from './types';
import { ACTIVITY_IDS, AVATARS, HUB_IDS } from './types';
import { clamp } from './rng';
import { careerOf, newCareer } from '../career/career';
import { appearanceOf } from '../actors/appearance';
import { newPistes, pistesOf } from '../economy/pistes';

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
/**
 * What an older v6 client cannot keep (docs/SAVES.md § « Debts and older clients »). A v6 client rebuilds the save from the fields it knows, so one
 * served again after this one (a rollback, a stale cached page) would drop the debts, the VTC record, the player's days, the streak and the look chosen in the studio at its first save.
 * This client writes them a second time under this key at every save, with the guest id; loading a save that LACKS one of those fields (only an older client
 * writes such a save: this one always writes them all) takes it back from here, for the same guest only. Older clients never read or write this key.
 */
export const EXTRAS_KEY = 'dakarrek.guest.save.v6.extras';
/**
 * The same backup a second time, under a key only clients from the beta on know. A client that knows the first backup but fewer fields (the polish
 * pass, PR #64: no `appearance`) rewrites `EXTRAS_KEY` at its saves without the fields it does not know; this one it never touches.
 */
export const EXTRAS_V2_KEY = 'dakarrek.guest.save.v6.extras.2';
/** The fields an older v6 client drops, and that the extras backup keeps. */
export const EXTRA_FIELDS = ['loans', 'vtc', 'play', 'streak', 'appearance'] as const;
/**
 * The third backup (LD2.0 on): the fields above and the ones only LD2.0 clients know (the savings account). The beta client (PR #65) rewrites the first two
 * backups at its saves without `bank`; it never touches this key, so savings dropped by a rollback come back with the next LD2.0 client.
 */
export const EXTRAS_V3_KEY = 'dakarrek.guest.save.v6.extras.3';
export const EXTRA_FIELDS_V3 = [...EXTRA_FIELDS, 'bank', 'pistes', 'bana', 'online'] as const;
/**
 * The same third backup a second time (LD2.0-B on), under a key only LD2.0-B clients know. The LD2.0-A client rewrites `EXTRAS_V3_KEY` at its saves with
 * the fields it knows, so without `online`: a top-up it would drop (reserved from the wallet, not yet answered by the server) comes back from this one.
 */
export const EXTRAS_V4_KEY = 'dakarrek.guest.save.v6.extras.4';
type ExtraField = typeof EXTRA_FIELDS_V3[number];
/** Teranga Money operations waiting for the server's answer, and settled op ids remembered (a refund or a withdrawal is never applied twice). */
export const ONLINE_PENDING_MAX = 50;
export const ONLINE_REFS_MAX = 200;
/** Savings history kept in the save, and idempotency keys remembered (an operation is never applied twice). */
export const BANK_TX_MAX = 200;
export const BANK_REFS_MAX = 200;
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
    assets: newAssets(0), inventory: {}, career: newCareer(), loans: { list: [], seq: 0 }, vtc: { active: null, done: [], seq: 0, trips: 0, earned: 0 },
    play: { day: 0, city: -1 }, streak: newStreak(), appearance: null, bank: newBank(), pistes: newPistes(), bana: newBana(), online: newOnline(),
  };
}
/** The device's side of Teranga Money of a game that never connected. */
export const newOnline = (): OnlineSave => ({ tag: null, pending: [], refs: [], balance: null, at: 0 });
export const newBank = (): BankState => ({ opened: -1, savings: 0, tx: [], seq: 0, goal: null, refs: [], interestDay: -1, milestones: [] });
/** The bana-bana table of a player who never owned one (src/economy/bana.ts sets it up with the first unit). */
export const newBana = (): BanaState => ({ since: -1, stock: {}, clients: 0, clientMs: 0, open: null, last: null, day: -1, today: 0, total: 0, sessions: 0, seq: 0, ack: false });

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
 * the hub's bounds (or on a road leaving it: `onRoad`), else the hub's spawn — a save from an older map or a corrupt position is put back in the city.
 */
export function resumeSpot<S extends { x: number; z: number; yaw: number }>(at: S | undefined, bounds: { x0: number; x1: number; z0: number; z1: number }, spawn: S, onRoad?: (x: number, z: number) => boolean): S {
  return at && ((at.x >= bounds.x0 && at.x <= bounds.x1 && at.z >= bounds.z0 && at.z <= bounds.z1) || onRoad?.(at.x, at.z)) ? at : spawn;
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
  const avatar: Avatar = AVATARS.includes(r.avatar as Avatar) ? (r.avatar as Avatar) : base.avatar;
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
    avatar,
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
    // debts and VTC rides (additive, no version change: a save without them owes nothing and has no ride in hand)
    loans: loansOf(r.loans),
    vtc: vtcOf(r.vtc, playedMs),
    // the player's own days and the work streak (additive, no version change: a save without them starts on day 0 with no streak)
    play: playOf(r.play),
    streak: streakOf(r.streak, playedMs),
    // the look chosen in the character studio (additive, no version change): missing or unreadable is « no look » (the body as it was made)
    appearance: appearanceOf(r.appearance, avatar),
    // the Banque Teranga savings account (additive, no version change: a save without it has an empty account)
    bank: bankOf(r.bank),
    // « Mes pistes » (additive): leads dismissed or followed stay so
    pistes: pistesOf(r.pistes, playedMs),
    // the player's bana-bana table (additive, no version change: a save without it gets an empty table, set up by src/economy/bana.ts if a unit is owned)
    bana: banaOf(r.bana, playedMs),
    // Teranga Money's pending operations on this device (additive, no version change: a save without it has nothing pending)
    online: onlineOf(r.online),
  };
}

const OP_ID = /^[A-Za-z0-9-]{8,64}$/, TAG = /^[0-9a-f]{16}$/;
/**
 * The device's side of Teranga Money: well-formed pending operations only (a malformed one is dropped, so a corrupted save never sends or refunds
 * anything it cannot read), whole amounts, a send's top-up never more than the send, each id once; settled ids; the last balance known.
 */
function onlineOf(v: unknown): OnlineSave {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, pending: OnlinePending[] = [], seen = new Set<string>();
  for (const e of Array.isArray(o.pending) ? (o.pending as unknown[]).slice(0, ONLINE_PENDING_MAX) : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.id !== 'string' || !OP_ID.test(x.id) || seen.has(x.id) || (x.kind !== 'fund' && x.kind !== 'cashout' && x.kind !== 'pay')) continue;
    if (typeof x.tag !== 'string' || !TAG.test(x.tag) || typeof x.amount !== 'number' || !Number.isSafeInteger(x.amount) || x.amount <= 0) continue;
    const fund = x.kind === 'fund' ? x.amount : x.kind === 'cashout' ? 0 : typeof x.fund === 'number' && Number.isSafeInteger(x.fund) && x.fund >= 0 && x.fund <= x.amount ? x.fund : -1;
    if (fund < 0 || (x.kind === 'pay' && (typeof x.to !== 'string' || !TAG.test(x.to)))) continue;
    seen.add(x.id);
    const p: OnlinePending = { id: x.id, kind: x.kind, amount: x.amount, fund, at: Math.max(0, num(x.at, 0)), tag: x.tag };
    if (x.kind === 'pay') {
      p.to = x.to as string;
      if (typeof x.note === 'string' && x.note) p.note = x.note.slice(0, 80);
      if (typeof x.req === 'string' && OP_ID.test(x.req)) p.req = x.req;
    }
    pending.push(p);
  }
  const refs = Array.isArray(o.refs) ? [...new Set((o.refs as unknown[]).filter((r): r is string => typeof r === 'string' && OP_ID.test(r)))].slice(-ONLINE_REFS_MAX) : [];
  const balance = typeof o.balance === 'number' && Number.isFinite(o.balance) ? money(o.balance) : null;
  return { tag: typeof o.tag === 'string' && TAG.test(o.tag) ? o.tag : null, pending, refs, balance, at: balance === null ? 0 : Math.max(0, num(o.at, 0)) };
}

/** Goods of the table: known shape only (ids like the catalogue's, whole non-negative counts, at most a few hundred); src/economy/bana.ts ignores ids it does not sell. */
function goodsOf(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 16)) if (ID.test(k) && typeof x === 'number' && Number.isFinite(x) && x >= 1) out[k] = Math.min(999, Math.floor(x));
  return out;
}
/**
 * The bana-bana table: whole non-negative amounts, clocks never ahead of the played time, a session in progress kept with its till (paid once, at closing),
 * the last session's profit always its sales minus its cost.
 */
function banaOf(v: unknown, playedMs: number): BanaState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, n = (x: unknown, d = 0, hi = 1e9) => clamp(Math.round(num(x, d)), 0, hi);
  const since = Math.round(num(o.since, -1));
  const s = (o.open && typeof o.open === 'object' ? o.open : null) as Record<string, unknown> | null;
  const open: BanaSession | null = s && typeof s.id === 'number' && Number.isFinite(s.id)
    ? { id: n(s.id), startedMs: clamp(num(s.startedMs, playedMs), 0, playedMs), sales: money(num(s.sales, 0)), cost: money(num(s.cost, 0)), served: n(s.served, 0, 999), sold: goodsOf(s.sold) } : null;
  const l = (o.last && typeof o.last === 'object' ? o.last : null) as Record<string, unknown> | null;
  let last: BanaResult | null = null;
  if (l && typeof l.id === 'number' && Number.isFinite(l.id)) {
    const sales = money(num(l.sales, 0)), cost = money(num(l.cost, 0));
    last = { id: n(l.id), day: n(l.day, 0, 1e7), at: num(l.at, 0), sales, cost, profit: sales - cost, served: n(l.served, 0, 999), sold: goodsOf(l.sold) };
  }
  const seq = Math.max(n(o.seq), open?.id ?? 0, last?.id ?? 0);
  return {
    since: since < 0 ? -1 : clamp(since, 0, playedMs), stock: goodsOf(o.stock), clients: n(o.clients, 0, 999), clientMs: clamp(num(o.clientMs, playedMs), 0, playedMs),
    open, last, day: clamp(Math.round(num(o.day, -1)), -1, 1e7), today: Math.round(clamp(num(o.today, 0), -MONEY_MAX, MONEY_MAX)), total: Math.round(clamp(num(o.total, 0), -MONEY_MAX, MONEY_MAX)),
    sessions: n(o.sessions), seq, ack: o.ack === true,
  };
}

const TX_ID = /^T\d{1,9}$/;
const TX_KINDS: BankTxKind[] = ['deposit', 'withdraw', 'interest'];
/** The savings account: whole non-negative balance, well-formed history entries, a goal only when positive. The balance is authoritative; the history is a record. */
function bankOf(v: unknown): BankState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, tx: BankTx[] = [], seen = new Set<string>();
  for (const e of Array.isArray(o.tx) ? (o.tx as unknown[]).slice(-BANK_TX_MAX) : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.id !== 'string' || !TX_ID.test(x.id) || seen.has(x.id) || !TX_KINDS.includes(x.kind as BankTxKind)) continue;
    if (typeof x.amount !== 'number' || !Number.isFinite(x.amount)) continue;
    seen.add(x.id);
    const t: BankTx = { id: x.id, at: num(x.at, 0), day: Math.max(0, Math.round(num(x.day, 0))), kind: x.kind as BankTxKind, amount: Math.round(x.amount), balance: money(num(x.balance, 0)), label: typeof x.label === 'string' ? x.label.slice(0, 80) : '' };
    if (typeof x.ref === 'string' && x.ref.length <= 64) t.ref = x.ref;
    tx.push(t);
  }
  const g = (o.goal && typeof o.goal === 'object' ? o.goal : null) as Record<string, unknown> | null, goalAmount = g ? money(num(g.amount, 0)) : 0;
  const refs = Array.isArray(o.refs) ? [...new Set((o.refs as unknown[]).filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 64))].slice(-BANK_REFS_MAX) : [];
  const seqOf = tx.reduce((m, t) => Math.max(m, Number(t.id.slice(1))), 0);
  return {
    opened: clamp(Math.round(num(o.opened, -1)), -1, 1e7), savings: money(num(o.savings, 0)), tx, seq: Math.max(Math.round(num(o.seq, 0)), seqOf),
    goal: goalAmount > 0 ? { amount: goalAmount, label: typeof g!.label === 'string' ? g!.label.slice(0, 40) : '' } : null,
    refs, interestDay: clamp(Math.round(num(o.interestDay, -1)), -1, 1e7),
    milestones: Array.isArray(o.milestones) ? [...new Set((o.milestones as unknown[]).filter((m): m is number => typeof m === 'number' && Number.isInteger(m) && m > 0))].slice(0, 32) : [],
  };
}

export const newStreak = (): StreakState => ({ run: 0, best: 0, last: -1, lastMs: 0, total: 0, grace: 1, seen: [] });
function playOf(v: unknown): PlayDays {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { day: clamp(Math.round(num(o.day, 0)), 0, 1e7), city: clamp(Math.round(num(o.city, -1)), -1, 1e9) };
}
function streakOf(v: unknown, playedMs: number): StreakState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, n = (x: unknown, d: number, hi = 1e7) => clamp(Math.round(num(x, d)), 0, hi);
  const run = n(o.run, 0), seen = Array.isArray(o.seen) ? [...new Set((o.seen as unknown[]).filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d > 0 && d <= 365))].slice(0, 16) : [];
  return { run, best: Math.max(run, n(o.best, 0)), last: clamp(Math.round(num(o.last, -1)), -1, 1e7), lastMs: clamp(num(o.lastMs, 0), 0, playedMs), total: Math.max(run, n(o.total, 0)), grace: n(o.grace, 1, 3), seen };
}

const LOAN_ID = /^L\d{1,6}$/;
/** Debts: malformed entries dropped, amounts whole and non-negative, a debt never repaid beyond what was owed. */
function loansOf(v: unknown): LoansState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, list: LoanState[] = [], seen = new Set<string>();
  for (const e of Array.isArray(o.list) ? (o.list as unknown[]).slice(0, 40) : []) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.id !== 'string' || !LOAN_ID.test(x.id) || seen.has(x.id)) continue;
    if (x.lender !== 'sarr' && x.lender !== 'modou') continue;
    if (x.kind !== 'vehicle' && x.kind !== 'repair') continue;
    const principal = money(num(x.principal, 0)); if (principal <= 0) continue;
    seen.add(x.id);
    const l: LoanState = {
      id: x.id, lender: x.lender, kind: x.kind, label: typeof x.label === 'string' ? x.label.slice(0, 80) : 'Crédit',
      principal, paid: Math.min(principal, money(num(x.paid, 0))), installment: Math.max(1, money(num(x.installment, principal))), every: clamp(Math.round(num(x.every, 1)), 1, 30),
      openedDay: Math.max(0, Math.round(num(x.openedDay, 0))), checkedDay: Math.max(0, Math.round(num(x.checkedDay, 0))), missed: clamp(Math.round(num(x.missed, 0)), 0, 999),
      status: x.status === 'closed' ? 'closed' : 'open',
    };
    if (typeof x.asset === 'string' && UID.test(x.asset)) l.asset = x.asset;
    if (typeof x.spec === 'string' && ID.test(x.spec)) l.spec = x.spec;
    if (typeof x.closedDay === 'number') l.closedDay = Math.max(0, Math.round(x.closedDay));
    if (x.clock === 'play') l.clock = 'play';
    if (typeof x.share === 'boolean') l.share = x.share;
    if (l.paid >= l.principal) l.status = 'closed';
    list.push(l);
  }
  return { list, seq: Math.max(Math.round(num(o.seq, 0)), list.length) };
}

const TRIP_ID = /^V\d{1,7}$/;
/** VTC: the ride in hand (dropped when malformed: the passenger simply was not picked up), the paid rides' ids. */
function vtcOf(v: unknown, playedMs: number): VtcState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const done = Array.isArray(o.done) ? [...new Set((o.done as unknown[]).filter((d): d is string => typeof d === 'string' && TRIP_ID.test(d)))].slice(-60) : [];
  const spot = (p: unknown) => { const q = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>; return typeof q.x === 'number' && typeof q.z === 'number' && Number.isFinite(q.x) && Number.isFinite(q.z) ? { x: q.x, z: q.z, name: typeof q.name === 'string' ? q.name.slice(0, 60) : '' } : null; };
  let active: VtcTrip | null = null;
  const a = (o.active && typeof o.active === 'object' ? o.active : null) as Record<string, unknown> | null;
  if (a && typeof a.id === 'string' && TRIP_ID.test(a.id) && !done.includes(a.id) && HUB_IDS.includes(a.from as HubId) && HUB_IDS.includes(a.to as HubId)) {
    const pickup = spot(a.pickup), dropoff = spot(a.dropoff), ps = (a.passenger && typeof a.passenger === 'object' ? a.passenger : {}) as Record<string, unknown>;
    if (pickup && dropoff) active = {
      id: a.id, from: a.from as HubId, to: a.to as HubId, pickup, dropoff, fare: money(num(a.fare, 0)), stage: a.stage === 'aboard' ? 'aboard' : 'pickup',
      passenger: { name: typeof ps.name === 'string' ? ps.name.slice(0, 40) : 'Passager', seed: Math.round(num(ps.seed, 1)) },
      ...(typeof a.asset === 'string' && ID.test(a.asset) ? { asset: a.asset } : {}), ...(typeof a.seat === 'string' && ID.test(a.seat) ? { seat: a.seat } : {}),
      acceptedMs: clamp(num(a.acceptedMs, playedMs), 0, playedMs),
    };
  }
  return { active, done, seq: Math.max(0, Math.round(num(o.seq, 0))), trips: Math.max(0, Math.round(num(o.trips, 0))), earned: money(num(o.earned, 0)) };
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

/** Fields taken back from the extras backup by the last `loadSave` (the game says so once), e.g. ['loans']. */
export let restoredExtras: string[] = [];
export function loadSave(store: KV | null): SaveData | null {
  restoredExtras = [];
  if (!store) return null;
  try {
    const own = store.getItem(SAVE_KEY);
    if (own) { const raw = JSON.parse(own), data = migrate(raw); if (data) restoreExtras(store, raw, data); return data; }   // a v6 save wins for good, even when it cannot be read: nothing falls back to an older one
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
  let ok = false;
  try { store?.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); ok = !!store; } catch { return false; }
  const extras = JSON.stringify({ guestId: data.guestId, savedAt: Date.now(), ...Object.fromEntries(EXTRA_FIELDS.map(k => [k, data[k]])) });
  for (const key of [EXTRAS_KEY, EXTRAS_V2_KEY]) { try { store?.setItem(key, extras); } catch { /* full storage: the save itself was written */ } }
  const v3 = JSON.stringify({ guestId: data.guestId, savedAt: Date.now(), ...Object.fromEntries(EXTRA_FIELDS_V3.map(k => [k, data[k]])) });
  for (const key of [EXTRAS_V3_KEY, EXTRAS_V4_KEY]) { try { store?.setItem(key, v3); } catch { /* full storage */ } }
  return ok;
}
/**
 * A save written by an older v6 client lacks the fields it did not know: take each missing one back from the extras backup of the same guest (sanitised
 * like any save). A debt is owed again exactly as it stood (even if that client sold the car meanwhile: the money of the sale is in the wallet); a ride
 * that was in hand is not resumed (the passenger is long gone), but the rides already paid stay paid. Returns the fields restored.
 */
function restoreExtras(store: KV, raw: Record<string, unknown>, data: SaveData): string[] {
  const missing: ExtraField[] = EXTRA_FIELDS_V3.filter(k => raw[k] === undefined);
  const rawLoans = (raw.loans as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  const lostShare = rawLoans.some(l => l && typeof l === 'object' && l.share === undefined);
  if (!missing.length && !lostShare) return [];
  // both backups of this guest, newest first; each field is taken from the newest one that has it (an older client may have rewritten the first without it)
  const backups: { raw: Record<string, unknown>; back: SaveData }[] = [];
  for (const key of [EXTRAS_KEY, EXTRAS_V2_KEY, EXTRAS_V3_KEY, EXTRAS_V4_KEY]) {
    let b: Record<string, unknown> | null = null;
    try { b = JSON.parse(store.getItem(key) ?? 'null') as Record<string, unknown> | null; } catch { b = null; }
    const back = b && b.guestId === data.guestId ? migrate({ ...b, schemaVersion: SCHEMA_VERSION, playedMs: data.playedMs }) : null;
    if (b && back) backups.push({ raw: b, back });
  }
  backups.sort((x, y) => num(y.raw.savedAt, 0) - num(x.raw.savedAt, 0));
  const pick = (k: string) => backups.find(x => x.raw[k] !== undefined);
  const out: string[] = [];
  // a client that knew the debts but not the share of the fares (PR #63) kept each loan without it: the same loan in the backup says whether it was on
  // (its due dates are left as that client left them: a loan without its player-day clock is moved onto it by src/economy/credit.ts onPlayClock)
  const withLoans = pick('loans')?.back;
  if (lostShare && withLoans) for (const l of data.loans.list) { const was = withLoans.loans.list.find(x => x.id === l.id); if (l.share === undefined && was?.share !== undefined) l.share = was.share; }
  for (const k of missing) {
    const found = pick(k); if (!found) continue;
    const { raw: b, back } = found;
    if (k === 'loans') { if (!back.loans.list.length) continue; data.loans = back.loans; }
    else if (k === 'vtc') data.vtc = { ...back.vtc, active: null };
    else if (k === 'play') data.play = back.play;
    else if (k === 'appearance') { const look = appearanceOf(b.appearance, data.avatar); if (!look) continue; data.appearance = look; }   // for this save's own body
    else if (k === 'bank') { if (back.bank.opened < 0 && !back.bank.savings) continue; data.bank = back.bank; }   // the savings, exactly as the last LD2.0 save left them
    else if (k === 'pistes') data.pistes = back.pistes;
    else if (k === 'bana') { if (back.bana.since < 0) continue; data.bana = back.bana; }   // the table as the last LD2.0 save left it (its till included: paid at the next closing)
    // Teranga Money's side as the last LD2.0-B save left it: a top-up reserved from the wallet (which the older client kept debited) is sent again at
    // the next connection, and the server applies it once or returns its first answer; nothing is counted twice
    else if (k === 'online') { if (!back.online.pending.length && !back.online.refs.length && back.online.balance === null) continue; data.online = back.online; }
    else data.streak = back.streak;
    out.push(k);
  }
  restoredExtras = out;
  return out;
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
  for (const key of [EXTRAS_KEY, EXTRAS_V2_KEY, EXTRAS_V3_KEY, EXTRAS_V4_KEY]) { try { store.removeItem(key); } catch { /* ignore: a new game has a new guest id, never matched */ } }
  if (!marked) { try { store.setItem(IMPORT_DONE_KEY, 'declined'); } catch { /* blocked storage: the older save may come back */ } }
}
