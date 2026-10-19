import { describe, expect, it } from 'vitest';
import { EMOTES, parseEmote, parseMove, type Peer } from '../src/multiplayer/protocol';
import { EMOTE_GAP_MS, EMOTE_INFO, Emoter, emoteChanged, GREET_REACH, NOTICE_GAP_MS, NOTICE_R, Notice, PlayerSocial, seatedPeers, shownHere } from '../src/multiplayer/social';
import { CHAT_NEAR_RADIUS } from '../src/multiplayer/chatRules';
import type { Target } from '../src/interact/types';

/**
 * M1-C, C4: lightweight social between real players on the presence that exists — a validated `emo` field, « Saluer » on
 * the player next to you, one quiet line when someone comes close, seats taken by sitting peers. The two-browser demo is
 * scripts/check-social.mjs.
 */
const move = (over: Record<string, unknown> = {}) => ({ type: 'move', x: 1, y: 0.1, z: 2, yaw: 0, speed: 0, space: 'street', clip: 'Idle', ...over });
const peer = (id: string, x: number, z: number, over: Partial<Peer> = {}): Peer => ({ id, name: `Joueur ${id}`, look: 0, type: 'move', x, y: 0.1, z, yaw: 0, speed: 0, space: 'street', clip: 'Idle', updatedAt: 0, ...over });
const ID = 'a1b2c3d4-0000-4000-8000-123456789abc';

describe('the emote field of the presence protocol', () => {
  it('accepts a known gesture, its counter, and the id of who it is meant for', () => {
    for (const k of EMOTES) expect(parseEmote({ k, n: 1 })).toEqual({ k, n: 1 });
    expect(parseEmote({ k: 'salut', n: 7, to: ID })).toEqual({ k: 'salut', n: 7, to: ID });
    expect(parseMove(move({ emo: { k: 'bravo', n: 3 } }), 'pikine')?.emo).toEqual({ k: 'bravo', n: 3 });
    expect(parseMove(move(), 'pikine')?.emo).toBeUndefined();
  });
  it('refuses everything else — no free text, no extra keys, no absurd counters — and then the whole move', () => {
    for (const bad of [null, [], 'salut', { k: 'insulte', n: 1 }, { k: 'salut' }, { k: 'salut', n: 0 }, { k: 'salut', n: 1.5 }, { k: 'salut', n: 1e9 }, { k: 'salut', n: 1, text: 'hello' }, { k: 'salut', n: 1, to: 'x' }, { k: 'salut', n: 1, to: '<script>alert(1)</script>' }, { k: 'salut', n: 1, to: 42 }]) {
      expect(parseEmote(bad)).toBeNull();
      expect(parseMove(move({ emo: bad }), 'pikine')).toBeNull();
    }
  });
  it('the gestures are a short fixed list, each with a glyph, a verb and a pose the presence accepts', () => {
    expect(EMOTES.length).toBeLessThanOrEqual(6);
    for (const k of EMOTES) { const i = EMOTE_INFO[k]; expect(i.glyph.length).toBeGreaterThan(0); expect(i.label.length).toBeLessThan(20); expect(parseMove(move({ clip: i.clip }), 'pikine')).not.toBeNull(); }
  });
});

describe('reacting to a new emote only', () => {
  it('a peer first seen with an emote already there does not replay it; a peer who then makes one does', () => {
    const seen = new Map<string, number>();
    expect(emoteChanged(seen, 'old', { k: 'salut', n: 4 })).toBe(false);                      // arrived with an old greeting: nothing
    expect(emoteChanged(seen, 'old', { k: 'salut', n: 4 })).toBe(false);
    expect(emoteChanged(seen, 'old', { k: 'bravo', n: 5 })).toBe(true);                       // a new one
    expect(emoteChanged(seen, 'new', undefined)).toBe(false);                                 // seen without any…
    expect(emoteChanged(seen, 'new', { k: 'salut', n: 1 })).toBe(true);                       // …then the first greeting counts
    expect(emoteChanged(seen, 'new', { k: 'salut', n: 1 })).toBe(false);
  });
});

describe('making an emote', () => {
  it('counts up, remembers who it was for, and never faster than once per EMOTE_GAP_MS', () => {
    const e = new Emoter();
    expect(e.make('salut', ID, 1000)).toBe(true); expect(e.emo).toEqual({ k: 'salut', n: 1, to: ID });
    expect(e.make('bravo', undefined, 1000 + EMOTE_GAP_MS - 1)).toBe(false); expect(e.emo?.n).toBe(1);
    expect(e.make('bravo', undefined, 1000 + EMOTE_GAP_MS)).toBe(true); expect(e.emo).toEqual({ k: 'bravo', n: 2 });
    e.reset(); expect(e.emo).toBeNull();
  });
  it('the counter wraps inside what the protocol accepts', () => {
    const e = new Emoter(); (e as unknown as { n: number }).n = 999_999;
    expect(e.make('salut', undefined, 0)).toBe(true); expect(e.emo!.n).toBe(1);
    expect(parseEmote(e.emo)).not.toBeNull();
    expect(e.make('salut', undefined, 10_000)).toBe(true); expect(parseEmote(e.emo)).not.toBeNull();
  });
});

describe('greeting the player next to you', () => {
  const collect = (ps: Peer[], space = 'street', at = { x: 0, z: 0 }, hidden: (p: Peer) => boolean = () => false) => {
    const acted: string[] = [], src = new PlayerSocial(() => ps, hidden, (k, p) => { acted.push(`${k}:${p.id}`); });
    const out: Target[] = []; src.collect(space, at.x, at.z, out); return { out, acted };
  };
  it('a free seat beside a seated player is offered before the greeting (sitting together comes first)', () => {
    const { out } = collect([peer('p1', 1.5, 1)]);
    expect(out[0].bias).toBeGreaterThan(1);                                                    // a seat's bias is 1 (src/interact/seats.ts)
  });
  it('a player within reach is a target, named after them, « Saluer » first', () => {
    const { out, acted } = collect([peer('p1', 1.5, 1)]);
    expect(out.map(t => t.id)).toEqual(['peer:p1']); expect(out[0].name).toBe('Joueur p1'); expect(out[0].kind).toBe('person');
    const aff = out[0].affordances(); expect(aff[0].label).toBe('Saluer'); expect(aff.map(a => a.id)).toEqual([...EMOTES]);
    aff[0].run(); expect(acted).toEqual(['salut:p1']);
  });
  it('not beyond reach, not in another space', () => {
    expect(collect([peer('far', GREET_REACH + 0.5, 0)]).out).toEqual([]);
    expect(collect([peer('inside', 1, 1, { space: 'pikine:gargote:01' })]).out).toEqual([]);
  });
  it('the private rooms offer nothing (nobody else is there)', () => {
    expect(collect([peer('p', 1, 1, { space: 'home' })], 'home').out).toEqual([]);
    expect(collect([peer('p', 1, 1, { space: 'scene' })], 'scene').out).toEqual([]);
  });
  it('a blocked player is neither a target nor shown: the same predicate as their avatar', () => {
    expect(collect([peer('bad', 1, 1), peer('ok', 2, 0)], 'street', { x: 0, z: 0 }, p => p.id === 'bad').out.map(t => t.id)).toEqual(['peer:ok']);
  });
});

describe('noticing someone close, quietly', () => {
  const me = { x: 0, z: 0, space: 'street' };
  it('names the nearest player within NOTICE_R, once each, with a pause between two lines', () => {
    const n = new Notice(), ps = [peer('a', 9, 0), peer('b', 5, 0), peer('c', NOTICE_R + 5, 0)];
    expect(n.next(ps, me, () => false, 0)?.id).toBe('b');
    expect(n.next(ps, me, () => false, NOTICE_GAP_MS - 1)).toBeNull();                          // too soon: not a stream of lines
    expect(n.next(ps, me, () => false, NOTICE_GAP_MS)?.id).toBe('a');
    expect(n.next(ps, me, () => false, 3 * NOTICE_GAP_MS)).toBeNull();                          // b and a were told; c is too far
    n.reset(); expect(n.next([peer('b', 5, 0)], me, () => false, 4 * NOTICE_GAP_MS)?.id).toBe('b');
  });
  it('never in a private room, never for a blocked player, never across spaces', () => {
    const n = new Notice();
    expect(n.next([peer('a', 1, 1, { space: 'home' })], { x: 0, z: 0, space: 'home' }, () => false, 0)).toBeNull();
    expect(n.next([peer('a', 1, 1)], me, () => true, 0)).toBeNull();
    expect(n.next([peer('a', 1, 1, { space: 'pikine:maiga:01' })], me, () => false, 0)).toBeNull();
  });
});

describe('sitting together', () => {
  it('lists the players whose pose is a seated one, in this space only', () => {
    const ps = [peer('s', 0, 0, { clip: 'Sit' }), peer('f', 1, 0, { clip: 'SitFloor' }), peer('k', 2, 0, { clip: 'Kneel' }), peer('w', 3, 0, { clip: 'Walk' }), peer('l', 4, 0, { clip: 'Lie' }), peer('i', 5, 0, { clip: 'Sit', space: 'pikine:gargote:01' })];
    expect(seatedPeers(ps, 'street').map(p => p.id)).toEqual(['s', 'f', 'k']);
  });
});

describe('what is shown, and to whom', () => {
  it('a gesture is shown within the chat radius, in the same shared space, never in a private room', () => {
    const me = { x: 0, z: 0, space: 'street' };
    expect(shownHere(peer('a', CHAT_NEAR_RADIUS - 1, 0), me)).toBe(true);
    expect(shownHere(peer('a', CHAT_NEAR_RADIUS + 1, 0), me)).toBe(false);
    expect(shownHere(peer('a', 1, 0, { space: 'pikine:gargote:01' }), me)).toBe(false);
    expect(shownHere(peer('a', 1, 0, { space: 'home' }), { x: 0, z: 0, space: 'home' })).toBe(false);
  });
});
