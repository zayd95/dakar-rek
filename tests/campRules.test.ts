import { describe, expect, it } from 'vitest';
import { CampLobby } from '../src/multiplayer/campRules';
import { CAMP_LOBBY_MS, CAMP_RETURN_MS, type CampTerms } from '../src/multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp: the lobby's and the match's rules on the server (src/multiplayer/campRules.ts), from docs/release/GRAND-CAMP-RULES-1.0.1.md.
 * Team balance, readiness and the fee's hold, the start, cancelling and removing, the organizer's hand-over, private matches, the return window
 * before and after kick-off, abandonment, and what the ledger is told at the end.
 */
const tag = (i: number) => i.toString(16).padStart(16, '0');
const P = (i: number) => ({ name: `Joueur ${i}`, look: i % 6 });
const T0 = 1_800_000_000_000;
const terms = (o: Partial<CampTerms> = {}): CampTerms => ({ fee: 1000, size: 6, dist: 'team', open: true, hub: 'corniche', ...o });
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? 'ok' : r.reason);
/** A lobby of `n` (organizer = 1) where everyone joined, `t` ms apart. */
function filled(n: number, o: Partial<CampTerms> = {}) {
  const l = CampLobby.open('00112233aabbccdd', tag(1), P(1), terms({ size: n as CampTerms['size'], ...o }), T0);
  for (let i = 2; i <= n; i++) expect(l.join(tag(i), P(i), undefined, T0 + i * 1000).ok).toBe(true);
  return l;
}
function allReady(l: CampLobby) {
  for (const p of l.data.players) { const r = l.readyAsk(p.tag, `op-${p.tag}`); expect(r.ok).toBe(true); if (r.ok && r.hold) l.held(p.tag, `op-${p.tag}`, 'held'); }
}

describe('Grand Camp lobby: places and teams', () => {
  it('the organizer takes the first place; joiners fill the smaller team; the teams stay equal (half the places each)', () => {
    const l = filled(6);
    expect(l.data.players.map(p => p.team)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(l.data.players.map(p => p.sid)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reason(l.join(tag(7), P(7), undefined, T0))).toBe('full');
    const m = CampLobby.open('00112233aabbccdd', tag(1), P(1), terms({ size: 10 }), T0);
    for (let i = 2; i <= 5; i++) expect(m.join(tag(i), P(i), 0, T0).ok).toBe(true);
    expect(reason(m.join(tag(6), P(6), 0, T0))).toBe('team-full');               // five a side at most
    expect(m.join(tag(6), P(6), 1, T0).ok).toBe(true);
    expect(reason(m.setTeam(tag(6), 0))).toBe('team-full');
    expect(m.setTeam(tag(2), 1).ok).toBe(true);
    expect(m.setTeam(tag(6), 0).ok).toBe(true);
  });
  it('the terms freeze once a second player has joined', () => {
    const l = CampLobby.open('00112233aabbccdd', tag(1), P(1), terms(), T0);
    expect(l.view().frozen).toBe(false);
    l.join(tag(2), P(2), undefined, T0);
    expect(l.view().frozen).toBe(true);
    l.leave(tag(2));
    expect(l.view().frozen).toBe(true);                                             // frozen for good: to change them, cancel and open a new match
  });
  it('a member joining again keeps their place (a reconnect); a removed player cannot come back; a private match takes the invited only', () => {
    const l = filled(6);
    expect(l.join(tag(3), P(3), undefined, T0)).toMatchObject({ ok: true, again: true });
    expect(l.remove(tag(1), tag(3))).toMatchObject({ ok: true, release: false });
    expect(reason(l.join(tag(3), P(3), undefined, T0))).toBe('removed');
    expect(reason(l.remove(tag(2), tag(4)))).toBe('not-org');
    const p = CampLobby.open('00112233aabbccdd', tag(1), P(1), terms({ open: false }), T0);
    expect(reason(p.join(tag(2), P(2), undefined, T0))).toBe('private');
    expect(p.invite(tag(1), [tag(2)]).ok).toBe(true);
    expect(reason(p.invite(tag(2), [tag(3)]))).toBe('not-org');
    expect(p.join(tag(2), P(2), undefined, T0).ok).toBe(true);
  });
  it('team names: a player of the team or the organizer renames it', () => {
    const l = filled(6);
    expect(l.rename(tag(2), 1, 'Les Lions').ok).toBe(true);
    expect(reason(l.rename(tag(2), 0, 'Nous'))).toBe('not-member');
    expect(l.rename(tag(1), 1, 'Jaune').ok).toBe(true);
    expect(l.view().teams).toEqual(['Rouge', 'Jaune']);
  });
});

describe('Grand Camp lobby: « Prêt », the fee, the start', () => {
  it('« Prêt » asks the ledger to hold the fee; ready only once it is held; a refusal leaves the player not ready; a free match needs no hold', () => {
    const l = filled(6);
    expect(l.readyAsk(tag(2), 'op-a')).toMatchObject({ ok: true, hold: true, again: false });
    expect(l.view().players[1]).toMatchObject({ ready: false, hold: 'pending' });
    expect(l.readyAsk(tag(2), 'op-b')).toMatchObject({ ok: true, hold: false, again: true });   // a double tap: the first hold, once
    l.held(tag(2), 'op-b', 'held');                                                  // another op's answer: nothing
    expect(l.view().players[1].hold).toBe('pending');
    l.held(tag(2), 'op-a', 'held');
    expect(l.view().players[1]).toMatchObject({ ready: true, hold: 'held' });
    expect(l.view().pool).toBe(1000);
    expect(l.readyAsk(tag(3), 'op-c').ok).toBe(true); l.held(tag(3), 'op-c', 'refused');
    expect(l.view().players[2]).toMatchObject({ ready: false, hold: 'none' });
    expect(l.unready(tag(3))).toMatchObject({ ok: true, release: false });        // nothing held: nothing to return
    expect(l.unready(tag(2))).toMatchObject({ ok: true, release: true });
    expect(l.view().pool).toBe(0);
    const f = filled(6, { fee: 0 });
    expect(f.readyAsk(tag(2), 'op-a')).toMatchObject({ ok: true, hold: false });
    expect(f.view().players[1]).toMatchObject({ ready: true, hold: 'none' });
    expect(f.unready(tag(2))).toMatchObject({ ok: true, release: false });         // a free match touches no money
  });
  it('no answer from the ledger: not ready, and the fee is returned at the next occasion to be safe', () => {
    const l = filled(6);
    l.readyAsk(tag(2), 'op-a'); l.held(tag(2), 'op-a', 'unsure');
    expect(l.view().players[1]).toMatchObject({ ready: false, hold: 'none' });
    expect(l.leave(tag(2))).toMatchObject({ ok: true, release: true });
  });
  it('the start: every place filled and ready, equal teams, everyone connected — not before', () => {
    const l = filled(6);
    expect(l.startable()).toBe(false);
    allReady(l);
    expect(l.startable()).toBe(true);
    l.unready(tag(4));
    expect(l.startable()).toBe(false);
    l.readyAsk(tag(4), 'op-again'); l.held(tag(4), 'op-again', 'held');
    l.disconnect(tag(5), T0);                                                      // lost the connection before kick-off: the fee goes back
    expect(l.startable()).toBe(false);
    expect(l.view().players[4]).toMatchObject({ on: false, ready: false, hold: 'none' });
    l.reconnect(tag(5));
    expect(l.startable()).toBe(false);                                              // they press « Prêt » again
    l.readyAsk(tag(5), 'op-5b'); l.held(tag(5), 'op-5b', 'held');
    expect(l.startable()).toBe(true);
    const seats = l.start(T0 + 60_000);
    expect(l.state).toBe('play');
    expect(seats.filter(s => s.team === 0).length).toBe(3);
    expect(reason(l.unready(tag(2)))).toBe('started');                             // the fee is frozen once kicked off
    expect(reason(l.cancel(tag(1)))).toBe('started');
    expect(reason(l.join(tag(9), P(9), undefined, T0))).toBe('started');
    expect(reason(l.setTeam(tag(2), 0))).toBe('started');
  });
  it('a ready player cannot change team without « Pas prêt » first', () => {
    const l = filled(6); l.leave(tag(6));
    l.readyAsk(tag(2), 'op-a'); l.held(tag(2), 'op-a', 'held');
    expect(reason(l.setTeam(tag(2), 0))).toBe('ready');
  });
});

describe('Grand Camp lobby: leaving, cancelling, time', () => {
  it('leaving before kick-off frees the place and returns the fee; the organizer leaving hands the match to the longest present; empty closes it', () => {
    const l = filled(6); allReady(l);
    expect(l.leave(tag(3))).toMatchObject({ ok: true, release: true, gone: false, empty: false });
    expect(l.leave(tag(1))).toMatchObject({ ok: true, release: true, org: tag(2) });
    expect(l.data.org).toBe(tag(2));
    for (const i of [2, 4, 5]) l.leave(tag(i));
    expect(l.leave(tag(6))).toMatchObject({ ok: true, empty: true });
    expect(l.state).toBe('over'); expect(l.data.end).toBe('empty');
  });
  it('the organizer cancels: over (every fee returned by the ledger); only the organizer may', () => {
    const l = filled(6); allReady(l);
    expect(reason(l.cancel(tag(2)))).toBe('not-org');
    expect(l.cancel(tag(1)).ok).toBe(true);
    expect(l.state).toBe('over'); expect(l.data.end).toBe('cancel');
    expect(l.outcome('cancel', null, [])).toEqual({ kind: 'refund', why: 'cancel' });
    expect(reason(l.readyAsk(tag(2), 'op-z'))).toBe('closed');
  });
  it('time: a dropped player’s place is kept the return window, then freed; the organizer’s role passes on; not started in time closes the lobby', () => {
    const l = filled(6);
    l.disconnect(tag(1), T0 + 10_000);
    expect(l.due(T0 + 10_000 + CAMP_RETURN_MS - 1)).toMatchObject({ free: [] });
    expect(l.deadline()).toBe(T0 + 10_000 + CAMP_RETURN_MS);
    expect(l.due(T0 + 10_000 + CAMP_RETURN_MS)).toMatchObject({ free: [tag(1)] });
    expect(l.data.org).toBe(tag(2));
    expect(l.deadline()).toBe(T0 + CAMP_LOBBY_MS);
    expect(l.due(T0 + CAMP_LOBBY_MS - 1).close).toBeUndefined();
    expect(l.due(T0 + CAMP_LOBBY_MS).close).toBe('timeout');
    expect(l.state).toBe('over');
    const e = filled(6);
    for (let i = 1; i <= 6; i++) e.disconnect(tag(i), T0);
    expect(e.due(T0 + CAMP_RETURN_MS)).toMatchObject({ close: 'empty' });
  });
});

describe('Grand Camp match rules: drops, abandonment, the end', () => {
  const started = () => { const l = filled(10, { size: 10 }); allReady(l); l.start(T0); return l; };
  it('after kick-off a drop keeps the fee and the place: back within the window to the same team; past it, gone but on the result', () => {
    const l = started();
    expect(l.disconnect(tag(3), T0 + 1000)).toEqual({ release: false, drop: true });
    expect(l.reconnect(tag(3))).toEqual({ back: true });
    expect(l.view().players[2]).toMatchObject({ on: true, team: 0, hold: 'held' });
    l.disconnect(tag(4), T0 + 2000);
    expect(l.due(T0 + 2000 + CAMP_RETURN_MS - 1).gone).toEqual([]);
    expect(l.due(T0 + 2000 + CAMP_RETURN_MS)).toMatchObject({ gone: [tag(4)], stop: false });
    expect(l.reconnect(tag(4))).toEqual({ back: false });                           // too late: gone
    expect(reason(l.join(tag(4), P(4), undefined, T0))).toBe('started');
    expect(l.leave(tag(5))).toMatchObject({ ok: true, gone: true, release: false });   // leaving after kick-off: abandons, nothing returned
    expect(l.view().players.filter(p => p.gone).map(p => p.tag)).toEqual([tag(4), tag(5)]);
    // the result: the whole winning team, gone players included
    expect(l.outcome('win', 1, [])).toEqual({ kind: 'team', winners: [tag(2), tag(4), tag(6), tag(8), tag(10)] });
    expect(l.outcome('win', null, [])).toEqual({ kind: 'refund', why: 'draw' });
    expect(l.outcome('stopped', 0, [])).toEqual({ kind: 'refund', why: 'stopped' });
  });
  it('nobody on the pitch for the return window: the server stops the match', () => {
    const l = started();
    for (let i = 1; i <= 10; i++) i === 7 ? l.leave(tag(i)) : l.disconnect(tag(i), T0 + 1000 * i);
    expect(l.due(T0 + 10_000 + CAMP_RETURN_MS - 1).stop).toBe(false);
    expect(l.due(T0 + 10_000 + CAMP_RETURN_MS).stop).toBe(true);
  });
  it('« Un seul gagnant »: the winning team’s top scorer by their pitch number, or its first to have joined', () => {
    const l = filled(6, { dist: 'single' }); allReady(l); l.start(T0);
    expect(l.outcome('win', 0, [{ sid: 5, team: 0, clock: 3, own: false }, { sid: 3, team: 0, clock: 9, own: false }, { sid: 5, team: 0, clock: 20, own: false }])).toEqual({ kind: 'single', winner: tag(5) });
    expect(l.outcome('win', 1, [{ sid: 1, team: 1, clock: 3, own: true }])).toEqual({ kind: 'single', winner: tag(2) });
  });
});
