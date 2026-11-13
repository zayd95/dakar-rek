import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/economy/config';
import { GAIT } from '../src/game/stride';
import { SHORT } from '../src/districts/matchRules';
import { PITCH } from '../src/game/footballSim';
import {
  CAMP_BODY, CAMP_CURB, CAMP_FEE_MAX, CAMP_MATCH, CAMP_MAX_FRAME, CAMP_RATE, CAMP_SIZES, CAMP_TEAM_NAMES, campFullPool, campKickoffSpot, campRate, campTeamName,
  campWinnerShare, decodeSnap, encodeSnap, isMatchId, newMatchId, parseCampClient, parseCampServer, parseTerms, stepBody, wrapAngle, type CampBody, type CampSnapshot,
} from '../src/multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md): the wire contract between a client and its match object. Every incoming frame strictly
 * shaped (types, ranges, sizes), the rates, the body step both sides run, and the snapshot frame.
 */
const T = 'aaaaaaaaaaaaaaaa', U = 'bbbbbbbbbbbbbbbb', ID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const terms = { fee: 1000, size: 10, dist: 'team', open: true, hub: 'corniche' };
const ok = (v: unknown) => { const r = parseCampClient(v); return r.ok ? r.msg : null; };
const why = (v: unknown) => { const r = parseCampClient(v); return r.ok ? 'ok' : `${r.reason}${r.id ? ':id' : ''}`; };

describe('Grand Camp protocol: the organizer’s terms', () => {
  it('the owner’s rules: fee 0 … one ledger operation (default 1 000 F), 6 / 10 / 14 players, team or single, public or private', () => {
    expect(CAMP_FEE_MAX).toBe(ECONOMY.online.opMax);
    expect([...CAMP_SIZES]).toEqual([6, 10, 14]);
    expect(parseTerms(terms)).toEqual(terms);
    for (const fee of [0, 1, 500, 1000, 2500, 5000, 12_345, CAMP_FEE_MAX]) expect(parseTerms({ ...terms, fee })?.fee).toBe(fee);
    for (const fee of [-1, 0.5, CAMP_FEE_MAX + 1, NaN, '1000', null]) expect(parseTerms({ ...terms, fee })).toBeNull();
    for (const size of [6, 10, 14]) expect(parseTerms({ ...terms, size })?.size).toBe(size);
    for (const size of [0, 2, 8, 12, 16, '10']) expect(parseTerms({ ...terms, size })).toBeNull();
    expect(parseTerms({ ...terms, dist: 'single' })?.dist).toBe('single');
    expect(parseTerms({ ...terms, dist: 'top3' })).toBeNull();
    expect(parseTerms({ ...terms, open: 'yes' })).toBeNull();
    expect(parseTerms({ ...terms, hub: 'mermoz' })?.hub).toBe('mermoz');
    expect(parseTerms({ ...terms, hub: 'dakar' })).toBeNull();
    expect(parseTerms({ ...terms, extra: 1 })).toBeNull();
  });
  it('what a player is shown before accepting: the pool if full, a winner’s share (equal teams divide exactly)', () => {
    expect(campFullPool({ fee: 1000, size: 10 })).toBe(10_000);
    expect(campWinnerShare({ fee: 1000, size: 10, dist: 'team' })).toBe(2000);
    expect(campWinnerShare({ fee: 1000, size: 10, dist: 'single' })).toBe(10_000);
    expect(campWinnerShare({ fee: 0, size: 14, dist: 'team' })).toBe(0);
  });
  it('team names: « Rouge » / « Jaune » by default, filtered like nicknames, short, never empty', () => {
    expect(CAMP_TEAM_NAMES).toEqual(['Rouge', 'Jaune']);
    expect(campTeamName('  Les   Lions  ')).toBe('Les Lions');
    expect(campTeamName('Ndar <b>FC</b>!!')).toBe('Ndar bFCb');
    expect(campTeamName('Téranga Boys United')).toBe('Téranga Boys');
    expect(campTeamName('🔥🔥')).toBeNull();
    expect(campTeamName('')).toBeNull();
    expect(campTeamName(42)).toBeNull();
    expect(campTeamName('x'.repeat(200))).toBeNull();
  });
  it('match ids: 16 lower-case hex characters, made fresh', () => {
    const a = newMatchId(), b = newMatchId();
    expect(isMatchId(a) && isMatchId(b) && a !== b).toBe(true);
    for (const bad of ['ABCDEF0123456789', 'abc', '0123456789abcdef0', null]) expect(isMatchId(bad)).toBe(false);
  });
});

describe('Grand Camp protocol: client frames', () => {
  it('requests: every type, strictly shaped, answered by id', () => {
    expect(ok({ type: 'create', id: ID, terms })).toEqual({ type: 'create', id: ID, terms });
    expect(ok({ type: 'join', id: ID })).toEqual({ type: 'join', id: ID });
    expect(ok({ type: 'join', id: ID, team: 1 })).toEqual({ type: 'join', id: ID, team: 1 });
    expect(ok({ type: 'team', id: ID, team: 0 })).toEqual({ type: 'team', id: ID, team: 0 });
    expect(ok({ type: 'rename', id: ID, team: 1, name: ' Les Lions ' })).toEqual({ type: 'rename', id: ID, team: 1, name: 'Les Lions' });
    expect(ok({ type: 'ready', id: ID })).toEqual({ type: 'ready', id: ID });
    expect(ok({ type: 'ready', id: ID, fund: 600 })).toEqual({ type: 'ready', id: ID, fund: 600 });
    for (const type of ['leave', 'unready', 'cancel'] as const) expect(ok({ type, id: ID })).toEqual({ type, id: ID });
    expect(ok({ type: 'remove', id: ID, tag: T })).toEqual({ type: 'remove', id: ID, tag: T });
    expect(ok({ type: 'invite', id: ID, tags: [T, U, T] })).toEqual({ type: 'invite', id: ID, tags: [T, U] });
  });
  it('refuses the wrong type, field, value or size — with the id when it had a readable one', () => {
    expect(why({ type: 'start', id: ID })).toBe('invalid');                       // a client never starts a match
    expect(why({ type: 'join', id: ID, team: 2 })).toBe('invalid:id');
    expect(why({ type: 'join', id: 'short' })).toBe('invalid');
    expect(why({ type: 'join' })).toBe('invalid');
    expect(why({ type: 'join', id: ID, sneaky: true })).toBe('invalid:id');
    expect(why({ type: 'create', id: ID, terms: { ...terms, fee: -5 } })).toBe('invalid:id');
    expect(why({ type: 'rename', id: ID, team: 0, name: '!!!' })).toBe('invalid:id');
    expect(why({ type: 'ready', id: ID, fund: -1 })).toBe('invalid:id');
    expect(why({ type: 'ready', id: ID, fund: 1.5 })).toBe('invalid:id');
    expect(why({ type: 'remove', id: ID, tag: 'nobody' })).toBe('invalid:id');
    expect(why({ type: 'invite', id: ID, tags: [] })).toBe('invalid:id');
    expect(why({ type: 'invite', id: ID, tags: Array(21).fill(T) })).toBe('invalid:id');
    expect(why([])).toBe('invalid'); expect(why(null)).toBe('invalid'); expect(why('join')).toBe('invalid');
  });
  it('the stick: a move vector no longer than the full stick (longer is an impossible move), a finite facing, an action with a power 0…1', () => {
    expect(ok({ type: 'in', s: 7, mx: 0.6, mz: -0.8, f: 1 })).toEqual({ type: 'in', s: 7, mx: 0.6, mz: -0.8, f: 1 });
    const just = ok({ type: 'in', s: 8, mx: 1.005, mz: 0, f: 0 }) as { mx: number };
    expect(just.mx).toBeCloseTo(1, 9);                                            // rounding at the stick's edge: brought back to the full stick
    expect(ok({ type: 'in', s: 9, mx: 1.2, mz: 0, f: 0 })).toBeNull();            // faster than the run: refused
    expect(ok({ type: 'in', s: 9, mx: 0.9, mz: 0.9, f: 0 })).toBeNull();
    expect(ok({ type: 'in', s: 9, mx: NaN, mz: 0, f: 0 })).toBeNull();
    expect(ok({ type: 'in', s: 9, mx: 0, mz: 0, f: Infinity })).toBeNull();
    expect(ok({ type: 'in', s: -1, mx: 0, mz: 0, f: 0 })).toBeNull();
    expect(ok({ type: 'in', s: 1.5, mx: 0, mz: 0, f: 0 })).toBeNull();
    expect((ok({ type: 'in', s: 1, mx: 0, mz: 0, f: 7 }) as { f: number }).f).toBeCloseTo(wrapAngle(7), 9);
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, a: 'shot', p: 0.8 })).toEqual({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, a: 'shot', p: 0.8 });
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, a: 'dribble' })).toMatchObject({ a: 'dribble', p: 0.6 });
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, a: 'tackle' })).toBeNull();
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, a: 'pass', p: 1.2 })).toBeNull();
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, p: 0.5 })).toBeNull();      // a power without an action
    expect(ok({ type: 'in', s: 1, mx: 0, mz: 1, f: 0, x: 3 })).toBeNull();        // never a position: the server integrates the body
  });
  it('rates: up to the limit, then dropped, then the socket is closed; a new second starts again', () => {
    const w = { at: 0, n: 0 }, seen: string[] = [];
    for (let i = 0; i < CAMP_RATE.inputAbuse + 1; i++) seen.push(campRate(w, 500, CAMP_RATE.inputs, CAMP_RATE.inputAbuse));
    expect(seen.filter(x => x === 'ok').length).toBe(CAMP_RATE.inputs);
    expect(seen.filter(x => x === 'drop').length).toBe(CAMP_RATE.inputAbuse - CAMP_RATE.inputs);
    expect(seen[seen.length - 1]).toBe('abuse');
    expect(campRate(w, 1600, CAMP_RATE.inputs, CAMP_RATE.inputAbuse)).toBe('ok');
    expect(CAMP_MAX_FRAME).toBeLessThanOrEqual(16_384);
  });
});

describe('Grand Camp protocol: the match on the wire', () => {
  const snap: CampSnapshot = {
    k: 1234, clock: 61.25, half: 1, phase: 'play', score: [2, 1],
    ball: { x: 3.456, z: -7.891, h: 0.11, vx: 12.345, vz: -0.5, vh: 1.2 },
    players: [{ sid: 1, x: -10.123, z: 4.567, vx: 6.5, vz: -1.25, f: 1.5708, seq: 812 }, { sid: 7, x: 19.7, z: -16.7, vx: 0, vz: 0, f: -3.1, seq: 0 }],
    own: 1, ownTeam: 0, taker: -1,
  };
  it('a snapshot round-trips to the centimetre, and the client accepts what the server sends', () => {
    const w = encodeSnap(snap), back = decodeSnap(w);
    expect(back.k).toBe(1234); expect(back.clock).toBeCloseTo(61.3, 5); expect(back.phase).toBe('play'); expect(back.score).toEqual([2, 1]);
    expect(Math.abs(back.ball.x - 3.456)).toBeLessThan(0.006); expect(Math.abs(back.players[0].f - 1.5708)).toBeLessThan(0.006);
    expect(back.players.map(p => p.seq)).toEqual([812, 0]);
    expect(parseCampServer(JSON.parse(JSON.stringify(w)))).not.toBeNull();
    expect(parseCampServer({ ...w, b: [1, 2, 3] })).toBeNull();
    expect(parseCampServer({ ...w, p: [[1, 2, 3, 4, 5, 6, 0.5]] })).toBeNull();
    expect(parseCampServer({ type: 'news' })).toBeNull();                         // a newer server's message: ignored
    // size: a full 5-a-side frame stays small (measured on the wire by scripts/check-grand-camp.mjs)
    const ten = { ...snap, players: Array.from({ length: 10 }, (_, i) => ({ sid: i + 1, x: -19.99 + i, z: 14.99 - i, vx: -6.99, vz: 6.99, f: -3.14, seq: 123_456 })) };
    expect(JSON.stringify(encodeSnap(ten)).length).toBeLessThan(560);
  });
  it('events, money and the result are checked before the client relies on them', () => {
    expect(parseCampServer({ type: 'ev', e: [{ n: 1, k: 'kickoff', c: 0, team: 0 }, { n: 2, k: 'goal', c: 231, team: 0, who: 5, sc: [1, 0] }] })).not.toBeNull();
    expect(parseCampServer({ type: 'ev', e: [{ n: 0, k: 'goal', c: 1 }] })).toBeNull();
    expect(parseCampServer({ type: 'money', step: 'hold', op: ID, amount: 1000, balance: 4000 })).not.toBeNull();
    expect(parseCampServer({ type: 'money', step: 'gift', op: ID, amount: 1000 })).toBeNull();
    expect(parseCampServer({ type: 'result', result: { end: 'win', total: 10_000, payouts: [{ tag: T, amount: 2000 }], money: 'settled' } })).not.toBeNull();
    expect(parseCampServer({ type: 'result', result: { end: 'win', total: 10_000, payouts: [{ tag: 'x', amount: 2000 }], money: 'settled' } })).toBeNull();
  });
});

describe('Grand Camp protocol: bodies and line-ups', () => {
  it('the body step: never faster than the run, stopped by the curb, turns at a bounded rate, the same numbers every time', () => {
    expect(CAMP_BODY.run).toBe(GAIT.run);
    expect(CAMP_MATCH).toMatchObject({ goals: SHORT.goals, seconds: SHORT.seconds });
    const b: CampBody = { x: 0, z: 0, vx: 0, vz: 0, f: 0 }, dt = 1 / 20;
    let top = 0;
    for (let i = 0; i < 400; i++) { stepBody(b, 1, 0, Math.PI / 2, dt); top = Math.max(top, Math.hypot(b.vx, b.vz)); }
    expect(top).toBeLessThanOrEqual(CAMP_BODY.run + 1e-9);
    expect(b.x).toBe(CAMP_CURB.x); expect(CAMP_CURB.x).toBeLessThan(PITCH.ex);
    expect(b.f).toBeCloseTo(Math.PI / 2, 9);
    const c: CampBody = { x: 0, z: 0, vx: 0, vz: 0, f: 0 };
    stepBody(c, 0, 0, Math.PI, dt);
    expect(Math.abs(c.f)).toBeCloseTo(CAMP_BODY.turn * dt, 9);                    // one tick turns at most turn × dt
    const run = () => { const x: CampBody = { x: 1, z: 2, vx: 0, vz: 0, f: 0 }; for (let i = 0; i < 50; i++) stepBody(x, Math.sin(i), Math.cos(i * 0.7) * 0.5, i * 0.3, dt); return x; };
    expect(run()).toEqual(run());
    // from standing to the full run in about half a second
    const d: CampBody = { x: 0, z: 0, vx: 0, vz: 0, f: 0 };
    for (let i = 0; i < 10; i++) stepBody(d, 0, 1, 0, dt);
    expect(Math.hypot(d.vx, d.vz)).toBeCloseTo(CAMP_BODY.run, 5);
  });
  it('kick-off line-ups: the kicking team in its half with its centre forward on the ball, the other outside the centre circle', () => {
    for (const n of [3, 5, 7]) for (const team of [0, 1] as const) for (const kicking of [true, false]) {
      for (let slot = 0; slot < n; slot++) {
        const k = campKickoffSpot(n, team, slot, kicking), d = team === 0 ? 1 : -1;
        expect(k.x * d).toBeLessThanOrEqual(0);
        if (!kicking) expect(Math.hypot(k.x, k.z)).toBeGreaterThan(3.2);
        if (kicking && slot === n - 1) expect(Math.hypot(k.x, k.z)).toBeLessThan(0.7);
        expect(Math.abs(k.x)).toBeLessThan(PITCH.hx); expect(Math.abs(k.z)).toBeLessThan(PITCH.hz);
        expect(Math.sin(k.f) * d).toBeCloseTo(1, 9);                              // facing the goal it attacks
      }
    }
  });
});
