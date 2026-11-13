import type { Tag } from '../online/protocol';
import { campSingleWinner, type CampGoal } from './campMatch';
import {
  CAMP_LOBBY_MS, CAMP_RETURN_MS, CAMP_TEAM_NAMES, campFullPool,
  type CampEnd, type CampLobbyView, type CampPlayer, type CampRefusal, type CampResult, type CampTerms,
} from './campProtocol';

/**
 * 1.0.1 Grand Camp: the lobby's and the match's rules as the server applies them (server/camp.ts keeps one `CampLobby` per match, saved as its
 * plain `data` after every change). Pure: times are passed in, money is asked for, never moved here — a method says when the ledger must hold or
 * return a fee, and `held` takes the ledger's answer. GRAND-CAMP-RULES-1.0.1.md:
 *
 * - The organizer opens the match with its terms and takes the first place. The fee and the distribution freeze once a second player has joined.
 * - Joining: a free place (a private match: on the organizer's invitation list); the team asked for if it has room, else the team with fewer players.
 * - « Prêt » holds the fee (none for a free match); « Pas prêt », leaving, being removed, or losing the connection before kick-off returns it.
 * - The match starts when every place is filled and ready, the teams equal, everyone connected.
 * - Before kick-off: the organizer cancels (every fee returned); a dropped player's place is kept CAMP_RETURN_MS, then freed; the lobby closes when it
 *   empties or is not started CAMP_LOBBY_MS after it opened. The organizer leaving hands the match to the player present the longest.
 * - After kick-off: a dropped player has CAMP_RETURN_MS to come back to the same team; one who does not (or leaves) is gone but stays on the team's
 *   result. When nobody has been on the pitch for CAMP_RETURN_MS the server stops the match (every fee returned).
 */
export interface CampProfile { name: string; look: number; app?: string }
export interface CampSeat extends CampPlayer {
  /** The op id of the fee's hold (the « Prêt » request id); `unsure`: the ledger did not answer it (it is returned at the next occasion). */
  op?: string; unsure?: boolean;
  /** When the connection dropped (ms). */
  off?: number;
}
export interface CampLobbyData {
  v: 1; match: string; terms: CampTerms; org: Tag; created: number;
  state: 'lobby' | 'play' | 'over';
  teams: [string, string]; players: CampSeat[];
  invited: Tag[]; removed: Tag[];
  frozen: boolean; next: number;
  started?: number; end?: CampEnd; result?: CampResult;
}
export type CampOk<T = object> = ({ ok: true } & T) | { ok: false; reason: CampRefusal };
export type CampOutcome = { kind: 'team'; winners: Tag[] } | { kind: 'single'; winner: Tag } | { kind: 'refund'; why: Exclude<CampEnd, 'win'> };

const no = (reason: CampRefusal) => ({ ok: false as const, reason });
const INVITED_MAX = 40;

export class CampLobby {
  constructor(public data: CampLobbyData) {}
  static open(match: string, org: Tag, p: CampProfile, terms: CampTerms, now: number): CampLobby {
    const l = new CampLobby({ v: 1, match, terms, org, created: now, state: 'lobby', teams: [CAMP_TEAM_NAMES[0], CAMP_TEAM_NAMES[1]], players: [], invited: [], removed: [], frozen: false, next: 1 });
    l.data.players.push(l.newSeat(org, p, 0, now));
    return l;
  }
  private newSeat(tag: Tag, p: CampProfile, team: 0 | 1, now: number): CampSeat {
    return { tag, name: p.name, look: p.look, ...(p.app ? { app: p.app } : {}), team, ready: false, hold: 'none', on: true, at: now, sid: this.data.next++ };
  }
  get state() { return this.data.state; }
  get terms() { return this.data.terms; }
  /** Players a side. */
  get perTeam() { return this.data.terms.size / 2; }
  seat(tag: Tag) { return this.data.players.find(p => p.tag === tag); }
  bySid(sid: number) { return this.data.players.find(p => p.sid === sid); }
  count(team: 0 | 1, except?: Tag) { return this.data.players.filter(p => p.team === team && p.tag !== except).length; }
  /** Fees held now (as the ledger answered them). */
  get pool() { return this.data.players.filter(p => p.hold === 'held').length * this.data.terms.fee; }

  view(): CampLobbyView {
    const d = this.data;
    return {
      match: d.match, state: d.state, terms: { ...d.terms }, frozen: d.frozen, org: d.org, teams: [d.teams[0], d.teams[1]],
      players: d.players.map(p => ({ tag: p.tag, name: p.name, look: p.look, ...(p.app ? { app: p.app } : {}), team: p.team, ready: p.ready, hold: p.hold, on: p.on, at: p.at, sid: p.sid, ...(p.gone ? { gone: true } : {}) })),
      pool: this.pool, full: campFullPool(d.terms), created: d.created, closes: d.created + CAMP_LOBBY_MS, ...(d.result ? { result: d.result } : {}),
    };
  }

  // ------------------------------------------------------------------ before kick-off
  /** A player takes a place (or a member comes back: `again`). */
  join(tag: Tag, p: CampProfile, team: 0 | 1 | undefined, now: number): CampOk<{ seat: CampSeat; again: boolean }> {
    const d = this.data, had = this.seat(tag);
    if (had && !had.gone) { had.name = p.name; had.look = p.look; if (p.app) had.app = p.app; return { ok: true, seat: had, again: true }; }
    if (d.state === 'play') return no('started');
    if (d.state !== 'lobby') return no('closed');
    if (d.removed.includes(tag)) return no('removed');
    if (!d.terms.open && tag !== d.org && !d.invited.includes(tag)) return no('private');
    if (d.players.length >= d.terms.size) return no('full');
    let t: 0 | 1;
    if (team !== undefined) { if (this.count(team) >= this.perTeam) return no('team-full'); t = team; }
    else t = this.count(0) <= this.count(1) ? 0 : 1;
    const seat = this.newSeat(tag, p, t, now);
    d.players.push(seat);
    if (d.players.length >= 2) d.frozen = true;
    return { ok: true, seat, again: false };
  }
  /** Leaves. Before kick-off: the place is freed (`release`: the fee goes back), the organizer's role passes on, an empty lobby closes. After: gone. */
  leave(tag: Tag): CampOk<{ release: boolean; gone: boolean; org?: Tag; empty: boolean }> {
    const d = this.data, s = this.seat(tag);
    if (!s) return no('not-member');
    if (d.state === 'play') { if (s.gone) return { ok: true, release: false, gone: true, empty: false }; s.gone = true; s.on = false; return { ok: true, release: false, gone: true, empty: false }; }
    if (d.state !== 'lobby') return no('closed');
    const release = this.mustRelease(s);
    d.players = d.players.filter(p => p !== s);
    let org: Tag | undefined;
    if (d.org === tag && d.players.length) { org = [...d.players].sort((a, b) => a.at - b.at || a.sid - b.sid)[0].tag; d.org = org; }
    const empty = d.players.length === 0;
    if (empty) this.close('empty');
    return { ok: true, release, gone: false, ...(org ? { org } : {}), empty };
  }
  setTeam(tag: Tag, team: 0 | 1): CampOk {
    const s = this.seat(tag);
    if (this.data.state !== 'lobby') return no(this.data.state === 'play' ? 'started' : 'closed');
    if (!s) return no('not-member');
    if (s.team === team) return { ok: true };
    if (s.ready || s.hold === 'pending') return no('ready');
    if (this.count(team, tag) >= this.perTeam) return no('team-full');
    s.team = team;
    return { ok: true };
  }
  /** Renames a team: one of its players, or the organizer (the name is already filtered: campTeamName). */
  rename(tag: Tag, team: 0 | 1, name: string): CampOk {
    const s = this.seat(tag);
    if (this.data.state !== 'lobby') return no(this.data.state === 'play' ? 'started' : 'closed');
    if (!s || (s.team !== team && this.data.org !== tag)) return no('not-member');
    this.data.teams[team] = name;
    return { ok: true };
  }
  /** « Prêt » (op: the request's id, the hold's op id): `hold` when the ledger must now hold the fee (a free match is ready at once). */
  readyAsk(tag: Tag, op: string): CampOk<{ hold: boolean; again: boolean }> {
    const s = this.seat(tag);
    if (this.data.state !== 'lobby') return no(this.data.state === 'play' ? 'started' : 'closed');
    if (!s) return no('not-member');
    if (s.team === null) return no('no-team');
    if (s.ready || s.hold === 'pending') return { ok: true, hold: false, again: true };
    if (this.data.terms.fee === 0) { s.ready = true; return { ok: true, hold: false, again: false }; }
    s.hold = 'pending'; s.op = op; s.unsure = false;
    return { ok: true, hold: true, again: false };
  }
  /** The ledger's answer to the hold of `op`: held (the player is ready), refused (nothing taken), or no answer (`unsure`: returned later to be safe). */
  held(tag: Tag, op: string, answer: 'held' | 'refused' | 'unsure'): void {
    const s = this.seat(tag);
    if (!s || s.op !== op || s.hold !== 'pending') return;
    if (answer === 'held') { s.hold = 'held'; s.ready = true; return; }
    s.hold = 'none'; s.ready = false; s.unsure = answer === 'unsure';
  }
  /** « Pas prêt »: `release` when the ledger must return the fee. */
  unready(tag: Tag): CampOk<{ release: boolean }> {
    const s = this.seat(tag);
    if (this.data.state !== 'lobby') return no(this.data.state === 'play' ? 'started' : 'closed');
    if (!s) return no('not-member');
    const release = this.mustRelease(s);
    s.ready = false; s.hold = 'none'; s.unsure = false;
    return { ok: true, release };
  }
  /** The fee of this seat may be on the ledger: held, or asked for without an answer. */
  private mustRelease(s: CampSeat) { return this.data.terms.fee > 0 && (s.hold === 'held' || s.hold === 'pending' || !!s.unsure); }
  cancel(tag: Tag): CampOk {
    if (this.data.state !== 'lobby') return no(this.data.state === 'play' ? 'started' : 'closed');
    if (tag !== this.data.org) return no('not-org');
    this.close('cancel');
    return { ok: true };
  }
  remove(org: Tag, target: Tag): CampOk<{ release: boolean }> {
    const d = this.data;
    if (d.state !== 'lobby') return no(d.state === 'play' ? 'started' : 'closed');
    if (org !== d.org) return no('not-org');
    const s = this.seat(target);
    if (!s || target === org) return no('not-member');
    const release = this.mustRelease(s);
    d.players = d.players.filter(p => p !== s);
    if (!d.removed.includes(target)) d.removed.push(target);
    return { ok: true, release };
  }
  invite(org: Tag, tags: Tag[]): CampOk {
    const d = this.data;
    if (d.state !== 'lobby') return no(d.state === 'play' ? 'started' : 'closed');
    if (org !== d.org) return no('not-org');
    for (const t of tags) if (t !== org && !d.invited.includes(t)) d.invited.push(t);
    if (d.invited.length > INVITED_MAX) d.invited.splice(0, d.invited.length - INVITED_MAX);
    for (const t of tags) d.removed = d.removed.filter(r => r !== t);
    return { ok: true };
  }
  /** A player's last socket closed. Before kick-off the fee is returned at once (`release`); after it the player leaves the pitch (`drop`). */
  disconnect(tag: Tag, now: number): { release: boolean; drop: boolean } {
    const s = this.seat(tag);
    if (!s || !s.on || s.gone) return { release: false, drop: false };
    s.on = false; s.off = now;
    if (this.data.state === 'lobby') { const release = this.mustRelease(s); s.ready = false; s.hold = 'none'; s.unsure = false; return { release, drop: false }; }
    return { release: false, drop: this.data.state === 'play' };
  }
  /** A member's socket is back: `back` when they return to the pitch (after kick-off, within the window: past it they are gone). */
  reconnect(tag: Tag): { back: boolean } {
    const s = this.seat(tag);
    if (!s || s.gone) return { back: false };
    const was = s.on; s.on = true; delete s.off;
    return { back: !was && this.data.state === 'play' };
  }

  // ------------------------------------------------------------------ kick-off, time, the end
  /** Every place filled and ready, the teams equal, everyone connected. */
  startable(): boolean {
    const d = this.data;
    return d.state === 'lobby' && d.players.length === d.terms.size && this.count(0) === this.perTeam && this.count(1) === this.perTeam
      && d.players.every(p => p.on && p.ready && (d.terms.fee === 0 || p.hold === 'held'));
  }
  start(now: number): { sid: number; team: 0 | 1; tag: Tag }[] {
    this.data.state = 'play'; this.data.started = now;
    return this.data.players.map(p => ({ sid: p.sid, team: p.team as 0 | 1, tag: p.tag }));
  }
  /**
   * What the clock brings: before kick-off, the lobby not started in time (`close`), dropped players' places freed (`free`: their fees were returned
   * when they dropped), the lobby empty; after it, dropped players not back in time (`gone`), and `stop` when nobody has been on the pitch for the window.
   */
  due(now: number): { close?: CampEnd; free: Tag[]; gone: Tag[]; stop: boolean } {
    const d = this.data, out = { free: [] as Tag[], gone: [] as Tag[], stop: false } as { close?: CampEnd; free: Tag[]; gone: Tag[]; stop: boolean };
    if (d.state === 'lobby') {
      for (const s of d.players) if (!s.on && s.off !== undefined && now - s.off >= CAMP_RETURN_MS) out.free.push(s.tag);
      if (out.free.length) {
        d.players = d.players.filter(p => !out.free.includes(p.tag));
        if (out.free.includes(d.org) && d.players.length) d.org = [...d.players].sort((a, b) => a.at - b.at || a.sid - b.sid)[0].tag;
      }
      if (!d.players.length) { this.close('empty'); out.close = 'empty'; }
      else if (now >= d.created + CAMP_LOBBY_MS) { this.close('timeout'); out.close = 'timeout'; }
    } else if (d.state === 'play') {
      for (const s of d.players) if (!s.on && !s.gone && s.off !== undefined && now - s.off >= CAMP_RETURN_MS) { s.gone = true; out.gone.push(s.tag); }
      out.stop = d.players.every(p => !p.on && (p.gone || (p.off !== undefined && now - p.off >= CAMP_RETURN_MS)));
    }
    return out;
  }
  /** The next time `due` has something to do (ms), or null. */
  deadline(): number | null {
    const d = this.data;
    let t = d.state === 'lobby' ? d.created + CAMP_LOBBY_MS : Infinity;
    if (d.state === 'lobby' || d.state === 'play') for (const s of d.players) if (!s.on && !s.gone && s.off !== undefined) t = Math.min(t, s.off + CAMP_RETURN_MS);
    return Number.isFinite(t) ? t : null;
  }
  /** Over: the end's reason (the result comes once the ledger has written the money). */
  close(end: CampEnd) { if (this.data.state === 'over') return; this.data.state = 'over'; this.data.end = end; }

  /**
   * What the ledger is told at the end: the winning team's players, all of them, even gone or dropped (`team`); the one player who takes the pool
   * (`single`: campSingleWinner); or every fee returned (a draw, a cancel, a lobby closed, a stopped match).
   */
  outcome(end: CampEnd, winner: 0 | 1 | null, goals: readonly CampGoal[]): CampOutcome {
    const d = this.data;
    if (end !== 'win' || winner === null) return { kind: 'refund', why: end === 'win' ? 'draw' : end };
    const team = d.players.filter(p => p.team === winner).sort((a, b) => a.at - b.at || a.sid - b.sid);
    if (d.terms.dist === 'single') {
      const sid = campSingleWinner(goals, winner, team.map(p => p.sid));
      const w = this.bySid(sid) ?? team[0];
      return { kind: 'single', winner: w.tag };
    }
    return { kind: 'team', winners: team.map(p => p.tag) };
  }
}
