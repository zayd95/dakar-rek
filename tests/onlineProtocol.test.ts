import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/economy/config';
import { ONLINE_MAX_FRAME, SNAPSHOT_MAX, friendCode, isItem, parseClientMessage, parseServerMessage, parseSnapshot, tagOfCode, type HomeSnapshot } from '../src/online/protocol';
import { parseMove } from '../src/multiplayer/protocol';

/** LD2.0-B wire validators (src/online/protocol.ts): strict shapes, sizes, ids, and the `home:<tag>` presence space. */
const T = '7f3a91c20b4e55d1', ID = '0e7c1b9a-3f42-4d1e-9a51-1f2e3d4c5b6a';
const snap = (n = 3): HomeSnapshot => ({ home: { spec: 'appart_plateau', hub: 'plateau', door: 'door:residence-jamm', name: 'Résidence Jàmm · appartement' }, upgrades: ['peinture'],
  furniture: Array.from({ length: n }, (_, i) => ({ spec: 'canape', at: { x: i * 0.5, z: -1, rot: 1 } })), at: 1_800_000_000_000 });
const ok = (v: unknown) => { const r = parseClientMessage(v); return r.ok ? r.msg : null; };
const why = (v: unknown) => { const r = parseClientMessage(v); return r.ok ? 'ok' : `${r.reason}${r.id ? '#id' : ''}`; };

describe('online protocol validators', () => {
  it('tags and friend codes', () => {
    expect(friendCode(T)).toBe('7F3A-91C2-0B4E-55D1');
    expect(tagOfCode('7F3A-91C2-0B4E-55D1')).toBe(T); expect(tagOfCode(' 7f3a 91c2-0b4e55d1 ')).toBe(T);
    expect(tagOfCode('7F3A-91C2-0B4E-55D')).toBeNull(); expect(tagOfCode('ZZZZ-91C2-0B4E-55D1')).toBeNull(); expect(tagOfCode(42)).toBeNull();
  });

  it('accepts each request in its exact shape', () => {
    expect(ok({ type: 'say', id: ID, to: T, text: '  Na nga def ? 🙏🏾 ' })).toEqual({ type: 'say', id: ID, to: T, text: 'Na nga def ? 🙏🏾' });
    expect(ok({ type: 'pay', id: ID, to: T, amount: 5000, fund: 0, note: 'Pour le taxi', req: ID })).toMatchObject({ amount: 5000, fund: 0, note: 'Pour le taxi', req: ID });
    expect(ok({ type: 'fund', id: ID, amount: 20000 })).toEqual({ type: 'fund', id: ID, amount: 20000 });
    expect(ok({ type: 'invite', id: ID, to: T, snapshot: snap(), perms: { use: true } })).toMatchObject({ type: 'invite', perms: { use: true } });
    expect(ok({ type: 'meet', id: ID, to: T, place: { id: 'corniche:pitch', hub: 'corniche', name: 'Terrain', icon: '⚽' }, when: 0 })).toMatchObject({ when: 0 });
    expect(ok({ type: 'where', hub: null, room: 0 })).toEqual({ type: 'where', hub: null, room: 0 });
    expect(ok({ type: 'conv', with: T, before: 123 })).toEqual({ type: 'conv', with: T, before: 123 });
    expect(ok({ type: 'history' })).toEqual({ type: 'history' });
    for (const m of [{ type: 'read', with: T }, { type: 'ask', id: ID, to: T, amount: 5000 }, { type: 'ask-close', id: ID, ref: ID, how: 'declined' }, { type: 'cashout', id: ID, amount: 1 },
      { type: 'invite-answer', id: ID, ref: ID, accept: true }, { type: 'invite-revoke', id: ID, ref: ID }, { type: 'home', id: ID, snapshot: snap() }, { type: 'visit', id: ID, host: T },
      { type: 'meet-answer', id: ID, ref: ID, accept: false }, { type: 'meet-cancel', id: ID, ref: ID }, { type: 'meet-here', id: ID, ref: ID }, { type: 'block', id: ID, tag: T, on: true },
      { type: 'report', id: ID, tag: T, reason: 'arnaque' }, { type: 'forget', id: ID, with: T }, { type: 'lookup', id: ID, code: '7F3A-91C2-0B4E-55D1' }, { type: 'find', id: ID, tag: T },
      { type: 'loc', id: ID, to: T, hub: 'pikine', x: 1.5, z: -3, name: 'Marché Thiaroye' }]) expect(why(m), m.type).toBe('ok');
  });

  it('refuses unknown types and fields, wrong types, bad ids, and says the id when it could read it', () => {
    expect(why({ type: 'teleport', id: ID })).toBe('invalid');
    expect(why({ type: 'say', id: ID, to: T, text: 'x', amount: 100000 })).toBe('invalid#id');   // a spoofed field
    expect(why({ type: 'say', id: 'short', to: T, text: 'x' })).toBe('invalid');
    expect(why({ type: 'say', id: ID, to: 'B', text: 'x' })).toBe('invalid#id');
    expect(why({ type: 'say', id: ID, to: T, text: '   ' })).toBe('invalid#id');
    expect(why({ type: 'say', id: ID, to: T, text: 'a'.repeat(501) })).toBe('too-large#id');
    expect(why({ type: 'pay', id: ID, to: T, amount: '5000', fund: 0 })).toBe('invalid#id');
    expect(why({ type: 'pay', id: ID, to: T, amount: 2.5, fund: 0 })).toBe('invalid#id');
    expect(why({ type: 'pay', id: ID, to: T, amount: 5000 })).toBe('invalid#id');                  // fund is required (0 when none)
    expect(ok({ type: 'pay', id: ID, to: T, amount: -5, fund: 0 })).not.toBeNull();               // the range is the ledger's rule ('amount')
    expect(why({ type: 'pay', id: ID, to: T, amount: 5, fund: 0, note: 'n'.repeat(81) })).toBe('invalid#id');
    expect(why({ type: 'ask-close', id: ID, ref: ID, how: 'paid' })).toBe('invalid#id');
    expect(why({ type: 'where', hub: 'dakar', room: 1 })).toBe('invalid');
    expect(why({ type: 'report', id: ID, tag: T, reason: 'spam' })).toBe('invalid#id');
    expect(why(null)).toBe('invalid'); expect(why([])).toBe('invalid'); expect(why('say')).toBe('invalid');
  });

  it('a home snapshot: shape and size (at most 12 000 characters)', () => {
    expect(SNAPSHOT_MAX).toBe(ECONOMY.online.snapshotMax);
    expect(parseSnapshot(snap())).toEqual(snap());
    expect(parseSnapshot({ ...snap(), extra: 1 })).toBeNull();
    expect(parseSnapshot({ ...snap(), furniture: [{ spec: 'canape', at: { x: 1, evil: { nested: true } } }] })).toBeNull();
    expect(parseSnapshot({ ...snap(), furniture: [{ spec: 'canape', at: null }] })).not.toBeNull();
    expect(parseSnapshot({ ...snap(), home: { ...snap().home, spec: 'Bad Spec' } })).toBeNull();
    let n = 1; while (JSON.stringify(snap(n)).length <= SNAPSHOT_MAX) n++;
    expect(parseSnapshot(snap(n - 1))).not.toBeNull();
    expect(n - 1 <= 300 ? parseSnapshot(snap(n)) : null).toBeNull();
    expect(why({ type: 'invite', id: ID, to: T, snapshot: snap(n), perms: { use: false } })).toBe(n <= 300 ? 'too-large#id' : 'invalid#id');
    expect(JSON.stringify({ type: 'invite', id: ID, to: T, snapshot: snap(n - 1), perms: { use: false } }).length).toBeLessThan(ONLINE_MAX_FRAME);
  });

  it('items are strict: the server’s, the cache’s', () => {
    const t = { id: ID, k: 'text', from: T, at: 5, text: 'Salut' };
    expect(isItem(t)).toBe(true);
    expect(isItem({ ...t, extra: 1 })).toBe(false);
    expect(isItem({ ...t, k: 'video' })).toBe(false);
    expect(isItem({ id: ID, k: 'ask', from: T, at: 5, amount: 5000, state: 'open' })).toBe(true);
    expect(isItem({ id: ID, k: 'ask', from: T, at: 5, amount: 5000, state: 'stolen' })).toBe(false);
    expect(isItem({ id: ID, k: 'meet', from: T, at: 5, place: { id: 'x:y', hub: 'pikine', name: 'Ici' }, when: 0, state: 'open', here: [T, T, T] })).toBe(false);
    expect(parseServerMessage({ type: 'item', with: T, item: t })).not.toBeNull();
    expect(parseServerMessage({ type: 'item', with: T, item: { ...t, from: 'nope' } })).toBeNull();
    expect(parseServerMessage({ type: 'ack', id: ID, ok: false, reason: 'limit-op' })).not.toBeNull();
    expect(parseServerMessage({ type: 'mystery' })).toBeNull();
  });

  it('presence: a home of a player is its own space, `home:<tag>`; the old `home` still works', () => {
    const move = (space: string) => parseMove({ type: 'move', x: 1, y: 0, z: 1, yaw: 0, speed: 0, space, clip: 'Sit' }, 'plateau');
    expect(move(`home:${T}`)?.space).toBe(`home:${T}`);
    expect(move('home')?.space).toBe('home');
    expect(move('home:7F3A91C20B4E55D1')).toBeNull();
    expect(move(`home:${T}0`)).toBeNull();
    expect(move('home:')).toBeNull();
  });
});
