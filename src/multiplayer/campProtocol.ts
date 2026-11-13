import type { HubId } from '../core/types';
import { PITCH } from '../game/footballSim';
import { GAIT } from '../game/stride';
import { SHORT } from '../districts/matchRules';
import { isHub } from './protocol';
import { isOpId, isTag, type Tag } from '../online/protocol';

/**
 * 1.0.1 Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md): the wire contract of a player-organized football match, shared by the server's match
 * object (server/camp.ts `GrandCamp`) and the client (src/online/campClient.ts). Pure: no DOM, no Workers API.
 *
 * - Its own socket, `/api/camp?match=<id>&key=…` (beside presence's and the account's): the Worker turns the device key into the player's tag, as
 *   `/api/me` does, and hands the socket to the match's own object. Public lobbies of a district: `GET /api/camp/list?hub=…` (`CampListing`).
 * - Versioned inside the feature: the welcome says `feature: 'camp', v: CAMP_VERSION`, `/api/health` lists `features: ['camp']`. Presence's
 *   PROTOCOL_VERSION and the account's ONLINE_PROTOCOL do not move (a client that does not know Grand Camp never opens this socket).
 * - The server is the only authority: the ball and every touch of it, possession, passes, shots, goals, the score, the clock, the teams, readiness,
 *   invitations, who is connected, and the money (the fee held at « Prêt », the pool, the settlement: the Teranga Money ledger, src/online/campLedger.ts).
 *   A client sends requests (answered once by an `ack` with the same id; the same id again is never applied twice) and, while playing, its stick
 *   (`in`: a move vector and a facing, at its own rate, CAMP_INPUT_HZ at most) and its actions (pass / dribble / shoot, with a power).
 * - Every incoming frame is validated here (`parseCampClient`), strictly: types, ranges (a move vector longer than the full stick is an impossible move
 *   and is refused), sizes; the server adds the rates (CAMP_RATE).
 */
export const CAMP_FEATURE = 'camp';
export const CAMP_VERSION = 1;
/** Largest frame either side sends (a lobby of 14 with long names is the largest). */
export const CAMP_MAX_FRAME = 8192;

// ------------------------------------------------------------------ the organizer's terms

/** Players in a match: 3, 5 or 7 a side (every player human: the sim's formations, which stop at 5 a side, are only its NPCs'). */
export const CAMP_SIZES = [6, 10, 14] as const;
export type CampSize = typeof CAMP_SIZES[number];
/** « Équipe gagnante — partage égal » or « Un seul gagnant ». */
export type CampDist = 'team' | 'single';
/** The entry fee: 1 000 F by default; the shortcuts the organizer's screen offers; any whole amount from 0 (a free match) to one ledger operation. */
export const CAMP_FEE_DEFAULT = 1000;
export const CAMP_FEE_CHIPS = [0, 500, 1000, 2500, 5000] as const;
/** The largest fee: one operation of the ledger (ECONOMY.online.opMax, repeated so the wire has no economy dependency; a test keeps them in step). */
export const CAMP_FEE_MAX = 250_000;
export interface CampTerms {
  fee: number; size: CampSize; dist: CampDist;
  /** Public (listed to everyone in the district) or private (by invitation: the organizer's `invite`). */
  open: boolean;
  /** The district the match is organized in (the public listing's). */
  hub: HubId;
}
/** The teams' default names (team 0 attacks +x, as in src/game/footballSim.ts), and how long a name may be. */
export const CAMP_TEAM_NAMES: readonly [string, string] = ['Rouge', 'Jaune'];
export const CAMP_TEAM_NAME_MAX = 12;

// ------------------------------------------------------------------ the lobby and the match: times and rates

/** The match object's fixed tick (Hz) and the snapshot sent every tick (see server/camp.ts for why 20). */
export const CAMP_TICK_HZ = 20;
/** Stick frames a client sends per second at most (more are dropped; CAMP_RATE.inputAbuse closes the socket). */
export const CAMP_INPUT_HZ = 20;
export const CAMP_RATE = { inputs: 40, inputAbuse: 120, requests: 10, requestAbuse: 30 } as const;
/** A socket's rate window (the room's rule, server/worker.ts): this second's start and count. */
export interface CampRateWindow { at: number; n: number }
/** One more frame in the window: 'ok', 'drop' (over `limit` this second: ignored) or 'abuse' (over `abuse`: the socket is closed). */
export function campRate(w: CampRateWindow, now: number, limit: number, abuse: number): 'ok' | 'drop' | 'abuse' {
  if (now - w.at >= 1000) { w.at = now; w.n = 0; }
  w.n++;
  return w.n > abuse ? 'abuse' : w.n > limit ? 'drop' : 'ok';
}
/** A lobby not started this long after it opened closes and every fee is returned; a dropped player's place is kept this long (ms). */
export const CAMP_LOBBY_MS = 10 * 60_000;
export const CAMP_RETURN_MS = 60_000;
/**
 * The match's length: the single-device match's rule (src/districts/matchRules.ts SHORT: first to 3 goals, 240 s of play), with a half time at the
 * middle of the clock (a short pause, then the other team kicks off; the ends do not change). Pauses in seconds: after a goal, at half time, after the
 * last goal before full time; how long a set piece waits for its taker before another player of that team may take it.
 */
export const CAMP_MATCH = { goals: SHORT.goals, seconds: SHORT.seconds, goalPause: 4, halfPause: 5, endPause: 2.6, takerWait: 6 } as const;
/** A body on the pitch: the run of the city (src/game/stride.ts GAIT.run) for everyone alike, its acceleration and braking (m/s²), its turn rate (rad/s). */
export const CAMP_BODY = { run: GAIT.run, acc: 14, dec: 20, turn: 12, radius: 0.35 } as const;
/** How far inside the curb round the grass a body may go (m): the pitch's own limit (src/game/footballSim.ts PITCH.ex/ez). */
export const CAMP_CURB = { x: PITCH.ex - 0.3, z: PITCH.ez - 0.3 } as const;

// ------------------------------------------------------------------ what clients see

export type CampState = 'lobby' | 'play' | 'over';
export type CampHold = 'none' | 'pending' | 'held';
export interface CampPlayer {
  tag: Tag; name: string; look: number; app?: string;
  /** Their team (null: none yet), ready (the fee held, or a free match), the fee's state on the server. */
  team: 0 | 1 | null; ready: boolean; hold: CampHold;
  /** Connected now; when they joined (ms, server time: the longest present becomes organizer); their number on the pitch (snapshots, events). */
  on: boolean; at: number; sid: number;
  /** After kick-off: left for good (or not back in CAMP_RETURN_MS). They still follow their team's result. */
  gone?: boolean;
}
export type CampEnd = 'win' | 'draw' | 'cancel' | 'empty' | 'timeout' | 'stopped';
export interface CampResult {
  /** How it ended: a team won; a draw at full time; cancelled by the organizer; the lobby emptied; not started in time; stopped by the server. */
  end: CampEnd;
  score: [number, number]; winner: 0 | 1 | null;
  dist: CampDist; fee: number;
  /** The pool: every fee collected, nothing else. */
  total: number;
  /** What each player got back from the pool (a win: the winners' shares; every other end: each fee returned). Sums to `total` exactly. */
  payouts: { tag: Tag; amount: number }[];
  /** « Un seul gagnant »: who took the pool. */
  single?: Tag;
  /** 'settled': written once by the ledger (the payouts are real); 'none': nothing was held (a free match, a lobby nobody was ready in). */
  money: 'settled' | 'none';
  at: number;
}
export interface CampLobbyView {
  match: string; state: CampState; terms: CampTerms;
  /** The fee and the distribution cannot change any more (a second player has joined). */
  frozen: boolean;
  org: Tag; teams: [string, string]; players: CampPlayer[];
  /** Fees held now (the ledger's answers), and the pool if every place is filled. */
  pool: number; full: number;
  /** When the lobby opened, and when it closes if not started (ms, server time). */
  created: number; closes: number;
  result?: CampResult;
}
/** A public lobby of a district, as `GET /api/camp/list` gives it (and a private one this player is invited to). */
export interface CampListing {
  match: string; terms: CampTerms; org: { tag: Tag; name: string }; teams: [string, string];
  count: number; created: number; closes: number;
  /** This player is on the organizer's invitation list (a private match). */
  invited?: boolean;
}

// ------------------------------------------------------------------ the match on the wire

export const CAMP_PHASES = ['kickoff', 'play', 'goal', 'restart', 'half', 'over'] as const;
export type CampPhase = typeof CAMP_PHASES[number];
export type CampAction = 'pass' | 'shot' | 'dribble';
export type CampEventKind = 'kickoff' | 'pass' | 'shot' | 'goal' | 'post' | 'out' | 'half' | 'full' | 'drop' | 'back' | 'gone';
/**
 * Something that happened, numbered by the server (`n` from 1, no gaps: every client sees the same events in the same order; a client back from a
 * drop gets the ones it missed). `c`: the clock (tenths of a second); `team`, `who` (a pitch number), `to` (a pass's receiver), `own` (an own goal),
 * `d` (a restart's kind: kick-in, corner, goal-kick), `sc` (the score after a goal, at half and full time).
 */
export interface CampEvent { n: number; k: CampEventKind; c: number; team?: 0 | 1; who?: number; to?: number; own?: true; d?: string; sc?: [number, number] }
/** The match's state every tick, decoded (metres, m/s, radians; the server's clock in seconds). */
export interface CampSnapshot {
  /** The tick it was taken at, the clock (s), the half, the phase, the score. */
  k: number; clock: number; half: 1 | 2; phase: CampPhase; score: [number, number];
  ball: { x: number; z: number; h: number; vx: number; vz: number; vh: number };
  /** Bodies on the pitch now (a dropped player is not), with the last stick frame of theirs the server applied (`seq`: client prediction). */
  players: { sid: number; x: number; z: number; vx: number; vz: number; f: number; seq: number }[];
  /** Who has the ball (a pitch number, −1: nobody: loose, a pass on its way), its team (−1), who takes the set piece now (−1). */
  own: number; ownTeam: -1 | 0 | 1; taker: number;
}
/** The compact frame: centimetres, cm/s, centiradians; `p` rows are [sid, x, z, vx, vz, f, seq]. */
export interface CampSnapWire {
  type: 's'; k: number; c: number; hf: 1 | 2; ph: number; sc: [number, number];
  b: [number, number, number, number, number, number];
  p: [number, number, number, number, number, number, number][];
  o: number; ot: -1 | 0 | 1; tk: number;
}
/** The roster at kick-off (and to a player back from a drop): pitch numbers to players. */
export interface CampRosterEntry { sid: number; tag: Tag; team: 0 | 1 }

// ------------------------------------------------------------------ client → match

export type CampClientMessage =
  /** Opens the match (on a new match id, `newMatchId`) with the organizer's terms; the organizer takes the first place. */
  | { type: 'create'; id: string; terms: CampTerms }
  /** Takes a place (in a team, if it has room). */
  | { type: 'join'; id: string; team?: 0 | 1 }
  /** Leaves: before kick-off the place is freed and the fee returned; after it, the player abandons (still on the team's result). */
  | { type: 'leave'; id: string }
  | { type: 'team'; id: string; team: 0 | 1 }
  /** Renames a team (a player of it, or the organizer). */
  | { type: 'rename'; id: string; team: 0 | 1; name: string }
  /** « Prêt »: the fee is held (Teranga Money first; `fund`: a part brought from the wallet in the same operation, as a send's). */
  | { type: 'ready'; id: string; fund?: number }
  /** « Pas prêt »: the fee is returned. */
  | { type: 'unready'; id: string }
  /** The organizer: cancel the match (every fee returned), remove a player, invite friends (a private match). */
  | { type: 'cancel'; id: string }
  | { type: 'remove'; id: string; tag: Tag }
  | { type: 'invite'; id: string; tags: Tag[] }
  /**
   * The stick, while playing: `s` a counter (the snapshots say the last one applied), the move vector in pitch space (`mx`, `mz`: length 0…1 of the
   * run), the facing `f` (rad, footballSim's yaw: atan2(x, z)); an action `a` with its power `p` (0…1), struck when the ball is at the foot.
   */
  | { type: 'in'; s: number; mx: number; mz: number; f: number; a?: CampAction; p?: number };

export type CampRefusal =
  | 'invalid' | 'exists' | 'unknown' | 'full' | 'private' | 'removed' | 'closed' | 'started' | 'not-member' | 'team-full' | 'ready' | 'no-team'
  | 'not-org' | 'busy' | 'insufficient' | 'limit-fund' | 'limit-op' | 'amount' | 'offline' | 'rate-limited';

// ------------------------------------------------------------------ match → client

export type CampMoneyStep = 'hold' | 'release' | 'payout' | 'refund';
export type CampServerMessage =
  | { type: 'welcome'; feature: typeof CAMP_FEATURE; v: number; match: string; you: Tag; time: number; hz: number; lobby: CampLobbyView | null }
  /** The lobby as it stands (after every change; during the match when someone drops, comes back or leaves; at the end with its result). */
  | { type: 'lobby'; lobby: CampLobbyView }
  | { type: 'ack'; id: string; ok: true; duplicate?: boolean; match?: string }
  | { type: 'ack'; id: string; ok: false; reason: CampRefusal }
  /** A money step of THIS player, once the ledger has written it: the fee held, returned (`why`), the share paid, the fee refunded at the end. */
  | { type: 'money'; step: CampMoneyStep; op: string; amount: number; balance?: number; why?: string }
  /** Kick-off (and to a player back from a drop): the roster, who kicks off, the rules, and the events so far. */
  | { type: 'start'; roster: CampRosterEntry[]; kick: 0 | 1; seconds: number; goals: number; tick: number; events: CampEvent[] }
  | CampSnapWire
  | { type: 'ev'; e: CampEvent[] }
  /** The end, after the ledger has written the money (never before): see CampResult. */
  | { type: 'result'; result: CampResult }
  /** The server closes this socket for good: removed by the organizer, the match is over, another socket of the same player took the place. */
  | { type: 'bye'; reason: 'removed' | 'over' | 'replaced' };

// ------------------------------------------------------------------ validators (pure: the match object, the client, vitest)

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keysIn = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k));
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TAU = Math.PI * 2;
/** An angle into −π…π. */
export const wrapAngle = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

/** A match id: 16 lower-case hex characters, made by the organizer's client (`newMatchId`). */
export const isMatchId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
export function newMatchId(): string {
  const b = new Uint8Array(8);
  (globalThis.crypto as Crypto).getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const isCampSize = (v: unknown): v is CampSize => (CAMP_SIZES as readonly unknown[]).includes(v);
/** A fee the organizer may set: a whole number of francs, 0 (a free match) … CAMP_FEE_MAX. */
export const isCampFee = (v: unknown): v is number => whole(v) && v >= 0 && v <= CAMP_FEE_MAX;
/**
 * A team name as typed: filtered like a nickname (src/multiplayer/protocol.ts `nickname`: letters, digits, spaces, apostrophes and hyphens), at most
 * CAMP_TEAM_NAME_MAX characters, never empty (null).
 */
export function campTeamName(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > CAMP_TEAM_NAME_MAX * 4) return null;
  const s = v.normalize('NFC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim();
  const cut = [...s].slice(0, CAMP_TEAM_NAME_MAX).join('').trim();
  return cut || null;
}
export function parseTerms(v: unknown): CampTerms | null {
  if (!plain(v) || !keysIn(v, ['fee', 'size', 'dist', 'open', 'hub'])) return null;
  if (!isCampFee(v.fee) || !isCampSize(v.size) || (v.dist !== 'team' && v.dist !== 'single') || typeof v.open !== 'boolean' || !isHub(v.hub)) return null;
  return { fee: v.fee, size: v.size, dist: v.dist, open: v.open, hub: v.hub };
}
/** The pool if every place is filled (what a player is shown before accepting). */
export const campFullPool = (t: Pick<CampTerms, 'fee' | 'size'>) => t.fee * t.size;
/** What one winner gets if every place is filled: twice the fee (equal split between equal teams) or the whole pool. */
export const campWinnerShare = (t: Pick<CampTerms, 'fee' | 'size' | 'dist'>) => (t.dist === 'single' ? campFullPool(t) : t.fee * 2);

/** A stick frame, checked: a move vector no longer than the full stick (anything longer is an impossible move), a finite facing, a known action. */
export function parseInput(v: Record<string, unknown>): Extract<CampClientMessage, { type: 'in' }> | null {
  if (!whole(v.s) || v.s < 0 || v.s > 2 ** 31 || !fin(v.mx) || !fin(v.mz) || !fin(v.f) || Math.abs(v.f) > 1000) return null;
  const m = Math.hypot(v.mx, v.mz);
  if (m > 1.01) return null;
  const k = m > 1 ? 1 / m : 1;
  const out: Extract<CampClientMessage, { type: 'in' }> = { type: 'in', s: v.s, mx: v.mx * k, mz: v.mz * k, f: wrapAngle(v.f) };
  if (v.a !== undefined) {
    if (v.a !== 'pass' && v.a !== 'shot' && v.a !== 'dribble') return null;
    if (v.p !== undefined && (!fin(v.p) || v.p < 0 || v.p > 1)) return null;
    out.a = v.a; out.p = v.p === undefined ? 0.6 : v.p;
  } else if (v.p !== undefined) return null;
  return out;
}

const FIELDS: Record<CampClientMessage['type'], readonly string[]> = {
  create: ['id', 'terms'], join: ['id', 'team'], leave: ['id'], team: ['id', 'team'], rename: ['id', 'team', 'name'], ready: ['id', 'fund'],
  unready: ['id'], cancel: ['id'], remove: ['id', 'tag'], invite: ['id', 'tags'], in: ['s', 'mx', 'mz', 'f', 'a', 'p'],
};
export type CampParsed = { ok: true; msg: CampClientMessage } | { ok: false; id?: string; reason: 'invalid' };
/** A client's frame, strictly shaped, or why not (with its id when it had a readable one, so the match can answer `ack.ok = false`). */
export function parseCampClient(v: unknown): CampParsed {
  if (!plain(v) || typeof v.type !== 'string' || !Object.prototype.hasOwnProperty.call(FIELDS, v.type)) return { ok: false, reason: 'invalid' };
  const type = v.type as CampClientMessage['type'], id = isOpId(v.id) ? v.id : undefined;
  const bad = (): CampParsed => ({ ok: false, ...(id ? { id } : {}), reason: 'invalid' });
  if (!keysIn(v, ['type', ...FIELDS[type]])) return bad();
  if (type === 'in') { const m = parseInput(v); return m ? { ok: true, msg: m } : bad(); }
  if (!id) return bad();
  const team = (x: unknown): x is 0 | 1 => x === 0 || x === 1;
  switch (type) {
    case 'create': { const terms = parseTerms(v.terms); return terms ? { ok: true, msg: { type, id, terms } } : bad(); }
    case 'join': return v.team === undefined || team(v.team) ? { ok: true, msg: { type, id, ...(v.team !== undefined ? { team: v.team as 0 | 1 } : {}) } } : bad();
    case 'team': return team(v.team) ? { ok: true, msg: { type, id, team: v.team } } : bad();
    case 'rename': { const name = campTeamName(v.name); return team(v.team) && name ? { ok: true, msg: { type, id, team: v.team, name } } : bad(); }
    case 'ready': return v.fund === undefined || (whole(v.fund) && v.fund >= 0 && v.fund <= CAMP_FEE_MAX) ? { ok: true, msg: { type, id, ...(v.fund ? { fund: v.fund as number } : {}) } } : bad();
    case 'leave': case 'unready': case 'cancel': return { ok: true, msg: { type, id } };
    case 'remove': return isTag(v.tag) ? { ok: true, msg: { type, id, tag: v.tag } } : bad();
    case 'invite': return Array.isArray(v.tags) && v.tags.length >= 1 && v.tags.length <= 20 && v.tags.every(isTag) ? { ok: true, msg: { type, id, tags: [...new Set(v.tags as Tag[])] } } : bad();
  }
  return bad();
}

const isPhaseIndex = (v: unknown) => whole(v) && v >= 0 && v < CAMP_PHASES.length;
function isEvent(v: unknown): v is CampEvent {
  return plain(v) && whole(v.n) && v.n > 0 && typeof v.k === 'string' && whole(v.c) && (v.team === undefined || v.team === 0 || v.team === 1)
    && (v.who === undefined || whole(v.who)) && (v.to === undefined || whole(v.to)) && (v.sc === undefined || (Array.isArray(v.sc) && v.sc.length === 2 && v.sc.every(whole)));
}
function isLobby(v: unknown): v is CampLobbyView {
  return plain(v) && isMatchId(v.match) && (v.state === 'lobby' || v.state === 'play' || v.state === 'over') && !!parseTerms(v.terms) && isTag(v.org)
    && Array.isArray(v.teams) && v.teams.length === 2 && Array.isArray(v.players) && v.players.every(p => plain(p) && isTag(p.tag) && whole(p.sid)) && whole(v.pool);
}
/**
 * A frame from the match, or null when it is not one this client understands (ignored: a newer server may add messages). Checked as far as the client
 * relies on it: snapshots, events and money strictly.
 */
export function parseCampServer(v: unknown): CampServerMessage | null {
  if (!plain(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 's':
      return whole(v.k) && whole(v.c) && (v.hf === 1 || v.hf === 2) && isPhaseIndex(v.ph) && Array.isArray(v.sc) && v.sc.length === 2 && v.sc.every(whole)
        && Array.isArray(v.b) && v.b.length === 6 && v.b.every(whole) && Array.isArray(v.p) && v.p.every(r => Array.isArray(r) && r.length === 7 && r.every(whole))
        && whole(v.o) && (v.ot === -1 || v.ot === 0 || v.ot === 1) && whole(v.tk) ? v as unknown as CampServerMessage : null;
    case 'ev': return Array.isArray(v.e) && v.e.every(isEvent) ? v as unknown as CampServerMessage : null;
    case 'welcome': return v.feature === CAMP_FEATURE && whole(v.v) && isMatchId(v.match) && isTag(v.you) && fin(v.time) && (v.lobby === null || isLobby(v.lobby)) ? v as unknown as CampServerMessage : null;
    case 'lobby': return isLobby(v.lobby) ? v as unknown as CampServerMessage : null;
    case 'ack': return isOpId(v.id) && typeof v.ok === 'boolean' ? v as unknown as CampServerMessage : null;
    case 'money': return ['hold', 'release', 'payout', 'refund'].includes(v.step as string) && isOpId(v.op) && whole(v.amount) && v.amount >= 0 ? v as unknown as CampServerMessage : null;
    case 'start': return Array.isArray(v.roster) && v.roster.every(r => plain(r) && whole(r.sid) && isTag(r.tag) && (r.team === 0 || r.team === 1)) && (v.kick === 0 || v.kick === 1)
      && Array.isArray(v.events) && v.events.every(isEvent) ? v as unknown as CampServerMessage : null;
    case 'result': {
      const r = v.result;
      return plain(r) && typeof r.end === 'string' && whole(r.total) && Array.isArray(r.payouts) && r.payouts.every(p => plain(p) && isTag(p.tag) && whole(p.amount))
        && (r.money === 'settled' || r.money === 'none') ? v as unknown as CampServerMessage : null;
    }
    case 'bye': return v.reason === 'removed' || v.reason === 'over' || v.reason === 'replaced' ? v as unknown as CampServerMessage : null;
    default: return null;
  }
}

// ------------------------------------------------------------------ snapshots

const cm = (v: number) => Math.round(v * 100);
export function encodeSnap(s: CampSnapshot): CampSnapWire {
  const b = s.ball;
  return {
    type: 's', k: s.k, c: Math.round(s.clock * 10), hf: s.half, ph: CAMP_PHASES.indexOf(s.phase), sc: [s.score[0], s.score[1]],
    b: [cm(b.x), cm(b.z), cm(b.h), cm(b.vx), cm(b.vz), cm(b.vh)],
    p: s.players.map(p => [p.sid, cm(p.x), cm(p.z), cm(p.vx), cm(p.vz), cm(wrapAngle(p.f)), p.seq]),
    o: s.own, ot: s.ownTeam, tk: s.taker,
  };
}
export function decodeSnap(w: CampSnapWire): CampSnapshot {
  const u = (v: number) => v / 100;
  return {
    k: w.k, clock: w.c / 10, half: w.hf, phase: CAMP_PHASES[w.ph] ?? 'play', score: [w.sc[0], w.sc[1]],
    ball: { x: u(w.b[0]), z: u(w.b[1]), h: u(w.b[2]), vx: u(w.b[3]), vz: u(w.b[4]), vh: u(w.b[5]) },
    players: w.p.map(r => ({ sid: r[0], x: u(r[1]), z: u(r[2]), vx: u(r[3]), vz: u(r[4]), f: u(r[5]), seq: r[6] })),
    own: w.o, ownTeam: w.ot, taker: w.tk,
  };
}

// ------------------------------------------------------------------ bodies (the server integrates them; a client predicts its own with the same step)

export interface CampBody { x: number; z: number; vx: number; vz: number; f: number }
/**
 * One step of a body from its stick: the wanted velocity is the move vector times the run (never faster: the speed cap), reached with the body's
 * acceleration or braking; the curb round the grass stops it; the facing turns toward the one asked at CAMP_BODY.turn at most. Deterministic: the
 * server and a client's prediction step the same numbers.
 */
export function stepBody(b: CampBody, mx: number, mz: number, f: number, dt: number) {
  const B = CAMP_BODY;
  let m = Math.hypot(mx, mz);
  if (m > 1) { mx /= m; mz /= m; m = 1; }
  const wx = mx * B.run, wz = mz * B.run;
  let ax = wx - b.vx, az = wz - b.vz;
  const a = Math.hypot(ax, az), lim = (m * B.run < Math.hypot(b.vx, b.vz) ? B.dec : B.acc) * dt;
  if (a > lim) { ax *= lim / a; az *= lim / a; }
  b.vx += ax; b.vz += az;
  const v = Math.hypot(b.vx, b.vz);
  if (v > B.run) { b.vx *= B.run / v; b.vz *= B.run / v; }
  b.x += b.vx * dt; b.z += b.vz * dt;
  if (Math.abs(b.x) > CAMP_CURB.x) { b.x = Math.sign(b.x) * CAMP_CURB.x; b.vx = 0; }
  if (Math.abs(b.z) > CAMP_CURB.z) { b.z = Math.sign(b.z) * CAMP_CURB.z; b.vz = 0; }
  const d = wrapAngle(f - b.f), t = B.turn * dt;
  b.f = wrapAngle(b.f + (d > t ? t : d < -t ? -t : d));
}

/**
 * Where a team's players stand at a kick-off (pitch space): `n` a side, `slot` 0…n−1 (the last slot, the centre forward, takes the kick-off of its
 * team). The kicking team keeps to its half, the other outside the centre circle (the futsal shape, widened to the pitch for 7 a side).
 */
const SHAPES: Record<number, readonly (readonly [number, number])[]> = {
  3: [[-12, 0], [-5, -7], [-5, 7]],
  5: [[-14, -4], [-14, 4], [-7, -9], [-7, 9], [-5, 0]],
  7: [[-16, -6], [-16, 0], [-16, 6], [-9, -11], [-9, 0], [-9, 11], [-5, 0]],
};
export function campKickoffSpot(n: number, team: 0 | 1, slot: number, kicking: boolean): { x: number; z: number; f: number } {
  const d = team === 0 ? 1 : -1, shape = SHAPES[n] ?? SHAPES[5], s = shape[Math.max(0, Math.min(slot, shape.length - 1))];
  let x = s[0], z = s[1];
  if (slot === shape.length - 1) { x = kicking ? -0.55 : -3.6; z = kicking ? 0.25 : 0; }
  return { x: x * d, z, f: d > 0 ? Math.PI / 2 : -Math.PI / 2 };
}
