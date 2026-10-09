import { describe, expect, it } from 'vitest';
import {
  cleanChatText, chatLength, parseChatRequest, parseReport, rateLimit, DedupeMemory, nearRecipients, isPrivateSpace, bubbleText,
  CHAT_MAX_CHARS, CHAT_RATE_COUNT, CHAT_RATE_WINDOW_MS, CHAT_NEAR_RADIUS,
} from '../src/multiplayer/chatRules';
import { deviceKey } from '../src/multiplayer/protocol';

const ch = (...codes: number[]) => String.fromCharCode(...codes);
const id = '0b6f3f0e-2a51-4f0c-9d0b-0c6a2d1e9f00';

describe('chat text', () => {
  it('keeps the player text as written: language, case, emoji and inner spacing', () => {
    for (const text of ['Na nga def ?', 'Salam  aleykoum 🙏🏾', 'Jërëjëf !!', 'MANGI FII']) expect(cleanChatText(text)).toEqual({ ok: true, text });
  });
  it('trims, turns control characters into spaces and removes direction overrides', () => {
    expect(cleanChatText(`  bonjour${ch(10)}toi${ch(9)}!  `)).toEqual({ ok: true, text: 'bonjour toi !' });
    expect(cleanChatText(`a${ch(0x202e)}b${ch(0x2066)}c${ch(0x1b)}`)).toEqual({ ok: true, text: 'abc' });
    expect(cleanChatText(`${ch(0)}${ch(7)} `)).toEqual({ ok: false, reason: 'empty' });
  });
  it('limits length to 200 visible characters after trimming', () => {
    expect(cleanChatText(' '.repeat(50) + 'a'.repeat(CHAT_MAX_CHARS) + ' '.repeat(50)).ok).toBe(true);
    expect(cleanChatText('a'.repeat(CHAT_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'too-long' });
    const emoji = '😀'.repeat(CHAT_MAX_CHARS);
    expect(chatLength(emoji)).toBe(CHAT_MAX_CHARS); expect(cleanChatText(emoji).ok).toBe(true);
    expect(cleanChatText(42)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('shortens bubbles only, at 60 visible characters', () => {
    expect(bubbleText('court')).toBe('court');
    const long = bubbleText('x'.repeat(100)); expect(chatLength(long)).toBe(60); expect(long.endsWith('…')).toBe(true);
  });
});

describe('chat envelope', () => {
  it('accepts proximity and private messages and drops any extra field', () => {
    const near = parseChatRequest({ type: 'chat', id, channel: 'near', text: ' Salut ', from: 'someone-else', amount: 5000 });
    expect(near).toEqual({ ok: true, request: { type: 'chat', id, channel: 'near', text: 'Salut' } });
    const dm = parseChatRequest({ type: 'chat', id, channel: 'dm', to: 'peer-1234-abcd', text: 'yo' });
    expect(dm).toEqual({ ok: true, request: { type: 'chat', id, channel: 'dm', to: 'peer-1234-abcd', text: 'yo' } });
  });
  it('rejects malformed envelopes, with the id when it can be answered', () => {
    expect(parseChatRequest(null)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseChatRequest({ type: 'chat', id: 'x', channel: 'near', text: 'a' })).toEqual({ ok: false, reason: 'invalid' });
    expect(parseChatRequest({ type: 'chat', id, channel: 'group', text: 'a' })).toEqual({ ok: false, id, reason: 'invalid' });
    expect(parseChatRequest({ type: 'chat', id, channel: 'dm', text: 'a' })).toEqual({ ok: false, id, reason: 'invalid' });
    expect(parseChatRequest({ type: 'chat', id, channel: 'near', text: 'a'.repeat(CHAT_MAX_CHARS + 1) })).toEqual({ ok: false, id, reason: 'too-long' });
  });
  it('accepts reports with a known reason only', () => {
    expect(parseReport({ type: 'report', target: 'peer-1234-abcd', reason: 'insulte' })).toEqual({ type: 'report', target: 'peer-1234-abcd', reason: 'insulte' });
    expect(parseReport({ type: 'report', target: 'peer-1234-abcd', reason: 'ban him' })).toBeNull();
  });
  it('accepts only random hex device keys', () => {
    expect(deviceKey('a'.repeat(32))).toBe('a'.repeat(32));
    for (const bad of ['A'.repeat(32), 'a'.repeat(31), 'g'.repeat(32), null, 3]) expect(deviceKey(bad)).toBeNull();
  });
});

describe('rate limit and dedupe', () => {
  it('allows five messages per ten seconds per connection, then frees the window', () => {
    let times: number[] = [];
    for (let i = 0; i < CHAT_RATE_COUNT; i++) { const r = rateLimit(times, 1000 + i * 100); expect(r.allowed).toBe(true); times = r.times; }
    const blocked = rateLimit(times, 2000); expect(blocked.allowed).toBe(false); expect(blocked.times).toHaveLength(CHAT_RATE_COUNT);
    expect(rateLimit(blocked.times, 1000 + CHAT_RATE_WINDOW_MS).allowed).toBe(true);
  });
  it('remembers delivered ids within a bounded memory', () => {
    const memory = new DedupeMemory<number>(3);
    memory.remember('a', 1); memory.remember('b', 2); memory.remember('c', 3);
    expect(memory.get('a')).toBe(1);
    memory.remember('d', 4);
    expect(memory.size).toBe(3); expect(memory.get('a')).toBeUndefined(); expect(memory.get('d')).toBe(4);
  });
});

describe('proximity', () => {
  const me = { id: 'me', x: 0, z: 0, space: 'street' };
  it('reaches players in the same shared space and radius only', () => {
    const others = [
      { id: 'close', x: 10, z: 10, space: 'street' }, { id: 'edge', x: CHAT_NEAR_RADIUS, z: 0, space: 'street' },
      { id: 'far', x: CHAT_NEAR_RADIUS + 1, z: 0, space: 'street' }, { id: 'maiga', x: 1, z: 1, space: 'pikine:maiga:03' }, me,
    ];
    expect(nearRecipients(me, others).map(p => p.id)).toEqual(['close', 'edge']);
  });
  it('the personal room and individual scenes are private', () => {
    expect(isPrivateSpace('home')).toBe(true); expect(isPrivateSpace('scene')).toBe(true); expect(isPrivateSpace('pikine:maiga:03')).toBe(false);
    expect(nearRecipients({ ...me, space: 'home' }, [{ id: 'x', x: 0, z: 0, space: 'home' }])).toEqual([]);
  });
});
