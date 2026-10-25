import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/economy/config';
import { REASONS, blockEffects, deliveryOf, findAllowed, inviteNext, meetNext, meetWindow, nextDeadline, refusalText, seenOf, silentWhenBlocked, visitCheck, type MeetTimes } from '../src/online/accountRules';
import type { InviteItem, Item, MeetItem, MoneyLimits } from '../src/online/protocol';

/** LD2.0-B account rules (src/online/accountRules.ts): invitations, meetings, blocking, visits and the sentences refusals are shown with. */
const H = '1111111111111111', G = '2222222222222222', X = '3333333333333333';
const T: MeetTimes = { early: ECONOMY.online.meetEarlyMs, late: ECONOMY.online.meetLateMs, nowOpen: ECONOMY.online.meetNowOpenMs };
const now = 1_800_000_000_000;
const invite = (o: Partial<InviteItem> = {}): InviteItem => ({ id: 'inv-00000001', k: 'invite', from: H, at: now, home: { spec: 'appart_plateau', hub: 'plateau', door: 'door:residence', name: 'Résidence Jàmm · appartement' }, perms: { use: true }, state: 'open', until: now + ECONOMY.online.inviteMs, ...o });
const meet = (o: Partial<MeetItem> = {}): MeetItem => ({ id: 'meet-0000001', k: 'meet', from: H, at: now, place: { id: 'corniche:pitch', hub: 'corniche', name: 'Terrain de la Corniche' }, when: now + 120_000, state: 'open', here: [], ...o });
const text = (from: string): Item => ({ id: 'txt-00000001', k: 'text', from, at: now, text: 'Salut' });

describe('account rules', () => {
  it('the meeting window is 10 city minutes before to 1 city hour after (1 city hour = 1 real minute)', () => {
    expect(T).toMatchObject({ early: 10_000, late: 60_000 });
    expect(meetWindow({ when: now }, T)).toEqual({ from: now - 10_000, to: now + 60_000 });
    expect(meetWindow({ when: 0 }, T)).toBeNull();
  });

  it('an invitation: the guest accepts or declines; the host revokes; it expires; repeats are duplicates', () => {
    const i = invite();
    expect(inviteNext(i, G, 'accept', G, now)).toMatchObject({ ok: true, changed: true, item: { state: 'accepted' } });
    expect(inviteNext(i, G, 'accept', H, now)).toMatchObject({ ok: false, reason: 'invalid' });   // the host cannot accept for the guest
    expect(inviteNext(i, G, 'accept', X, now)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(inviteNext(i, G, 'decline', G, now)).toMatchObject({ ok: true, item: { state: 'declined' } });
    const acc = invite({ state: 'accepted' });
    expect(inviteNext(acc, G, 'accept', G, now)).toMatchObject({ ok: true, changed: false });
    expect(inviteNext(acc, G, 'decline', G, now)).toMatchObject({ ok: false, reason: 'closed' });
    expect(inviteNext(acc, G, 'revoke', G, now)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(inviteNext(acc, G, 'revoke', H, now)).toMatchObject({ ok: true, changed: true, item: { state: 'revoked' } });
    expect(inviteNext(invite({ state: 'revoked' }), G, 'revoke', H, now)).toMatchObject({ ok: true, changed: false });
    expect(inviteNext(invite({ state: 'declined' }), G, 'revoke', H, now)).toMatchObject({ ok: false, reason: 'closed' });
    const late = now + ECONOMY.online.inviteMs;
    expect(inviteNext(acc, G, 'expire', null, late)).toMatchObject({ ok: true, changed: true, item: { state: 'expired' } });
    expect(inviteNext(i, G, 'accept', G, late)).toMatchObject({ ok: false, reason: 'closed' });
    expect(inviteNext(acc, G, 'expire', null, now)).toMatchObject({ ok: true, changed: false });
    expect(nextDeadline(acc, T)).toBe(acc.until); expect(nextDeadline(invite({ state: 'revoked' }), T)).toBeNull();
  });

  it('a visit needs an accepted, unrevoked, unexpired invitation from the host', () => {
    expect(visitCheck([], G, now)).toEqual({ ok: false, reason: 'no-invite' });
    expect(visitCheck([invite()], G, now)).toEqual({ ok: false, reason: 'no-invite' });
    expect(visitCheck([invite({ state: 'accepted' })], G, now)).toMatchObject({ ok: true, invite: { id: 'inv-00000001' } });
    expect(visitCheck([invite({ state: 'accepted' })], G, now + ECONOMY.online.inviteMs)).toEqual({ ok: false, reason: 'no-invite' });
    expect(visitCheck([invite({ state: 'revoked' })], G, now)).toEqual({ ok: false, reason: 'revoked' });
    expect(visitCheck([invite({ state: 'revoked', at: now + 5 }), invite({ id: 'inv-00000002', state: 'accepted' })], G, now)).toMatchObject({ ok: true, invite: { id: 'inv-00000002' } });
    expect(visitCheck([invite({ state: 'accepted', from: G })], G, now)).toEqual({ ok: false, reason: 'no-invite' });   // the guest's own invitation opens nothing here
  });

  it('a meeting: accepted, countered, declined or cancelled; both here in the window is met; past it, missed', () => {
    const m = meet();
    expect(meetNext(m, G, 'accept', H, now, T)).toMatchObject({ ok: false, reason: 'invalid' });   // the proposer does not accept their own
    expect(meetNext(m, G, 'accept', G, now, T)).toMatchObject({ ok: true, changed: true, item: { state: 'accepted', when: m.when } });
    expect(meetNext(m, G, 'counter', G, now, T)).toMatchObject({ ok: true, item: { state: 'countered' } });
    expect(meetNext(m, G, 'decline', G, now, T)).toMatchObject({ ok: true, item: { state: 'declined' } });
    expect(meetNext(m, G, 'cancel', H, now, T)).toMatchObject({ ok: true, item: { state: 'cancelled' } });
    expect(meetNext(m, G, 'cancel', X, now, T)).toMatchObject({ ok: false, reason: 'invalid' });
    const acc = meet({ state: 'accepted' });
    expect(meetNext(acc, G, 'here', G, now, T)).toMatchObject({ ok: false, reason: 'closed' });   // too early
    const at = acc.when - 5_000;
    const one = meetNext(acc, G, 'here', G, at, T);
    expect(one).toMatchObject({ ok: true, changed: true, item: { state: 'accepted', here: [G] } });
    const again = meetNext((one as { item: MeetItem }).item, G, 'here', G, at, T);
    expect(again).toMatchObject({ ok: true, changed: false });
    const both = meetNext((one as { item: MeetItem }).item, G, 'here', H, acc.when + 30_000, T);
    expect(both).toMatchObject({ ok: true, item: { state: 'met', here: [G, H] } });
    expect(meetNext((both as { item: MeetItem }).item, G, 'tick', null, acc.when + 61_000, T)).toMatchObject({ changed: false });   // met stays met
    expect(meetNext((one as { item: MeetItem }).item, G, 'tick', null, acc.when + 60_001, T)).toMatchObject({ changed: true, item: { state: 'missed' } });
    expect(meetNext(acc, G, 'here', G, acc.when + 60_001, T)).toMatchObject({ ok: false, reason: 'closed' });
    expect(meetNext(m, G, 'tick', null, m.when + 60_001, T)).toMatchObject({ changed: true, item: { state: 'missed' } });   // never answered
    expect(meetNext(meet({ state: 'declined' }), G, 'accept', G, now, T)).toMatchObject({ ok: false, reason: 'closed' });
  });

  it('« maintenant » gets its time when accepted; unanswered, it is missed after a while', () => {
    const m = meet({ when: 0 });
    expect(meetWindow(m, T)).toBeNull();
    const acc = meetNext(m, G, 'accept', G, now + 30_000, T);
    expect(acc).toMatchObject({ ok: true, item: { state: 'accepted', when: now + 30_000 } });
    expect(meetNext(m, G, 'tick', null, now + T.nowOpen + 1, T)).toMatchObject({ changed: true, item: { state: 'missed' } });
    expect(nextDeadline(m, T)).toBe(now + T.nowOpen + 1);
    expect(nextDeadline((acc as { item: MeetItem }).item, T)).toBe(now + 30_000 + T.late + 1);
  });

  it('blocking: the blocker’s own invitations are revoked and meetings cancelled; finished ones stay', () => {
    const mine: Item[] = [invite(), invite({ id: 'inv-00000002', state: 'accepted' }), invite({ id: 'inv-00000003', state: 'declined' }), meet(), meet({ id: 'meet-0000002', state: 'met' }),
      meet({ id: 'meet-0000003', from: G }), text(H)];
    const out = blockEffects(mine, H);
    expect(out.map(i => [i.id, (i as InviteItem | MeetItem).state])).toEqual([['inv-00000001', 'revoked'], ['inv-00000002', 'revoked'], ['meet-0000001', 'cancelled']]);
  });

  it('delivery from a blocked player: text, locations and new invitations dropped; money and known items kept', () => {
    expect(deliveryOf(text(G), { blocked: true, known: false })).toBe('drop');
    expect(deliveryOf(invite({ from: G }), { blocked: true, known: false })).toBe('drop');
    expect(deliveryOf(invite({ from: G, state: 'revoked' }), { blocked: true, known: true })).toBe('store');
    expect(deliveryOf({ id: 'pay-00000001', k: 'pay', from: G, at: now, amount: 5_000, op: 'pay-00000001' }, { blocked: true, known: false })).toBe('store');
    expect(deliveryOf(text(G), { blocked: false, known: false })).toBe('store');
    expect(['say', 'loc'].every(k => silentWhenBlocked(k as 'say'))).toBe(true);
    expect(['pay', 'ask', 'invite', 'meet'].some(k => silentWhenBlocked(k as 'pay'))).toBe(false);
  });

  it('where a player is: only with an accepted invitation or meeting', () => {
    expect(findAllowed([text(G), invite(), meet()], now, T)).toBe(false);
    expect(findAllowed([invite({ state: 'accepted' })], now, T)).toBe(true);
    expect(findAllowed([invite({ state: 'accepted' })], now + ECONOMY.online.inviteMs, T)).toBe(false);
    expect(findAllowed([meet({ state: 'accepted' })], now, T)).toBe(true);
    expect(findAllowed([meet({ state: 'accepted' })], now + 200_000, T)).toBe(false);
    expect(findAllowed([invite({ state: 'revoked' }), meet({ state: 'cancelled' })], now, T)).toBe(false);
  });

  it('seen: online, last seen, never', () => {
    expect(seenOf({ sockets: 2, lastSeen: 5, exists: true })).toBe('online');
    expect(seenOf({ sockets: 0, lastSeen: 5, exists: true })).toBe(5);
    expect(seenOf({ sockets: 0, lastSeen: null, exists: false })).toBe('never');
  });

  it('every refusal has its French sentence, with the limits’ numbers', () => {
    const L: MoneyLimits = { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 };
    const texts = REASONS.map(r => refusalText(r, L));
    expect(new Set(texts).size).toBe(REASONS.length);
    for (const t of texts) expect(t).toMatch(/^[A-ZÀ-Ý]/);
    expect(refusalText('limit-op', L)).toBe('Au plus 250 000 F par opération.');
    expect(refusalText('limit-fund', L)).toContain('500 000 F');
    expect(refusalText('something-new', L)).toBe(refusalText('invalid', L));
  });
});
