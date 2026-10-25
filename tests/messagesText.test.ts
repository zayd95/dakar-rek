import { describe, expect, it } from 'vitest';
import {
  ago, cardOf, cashoutCheck, cityClock, cityWhen, clockOf, dayLabel, formatCode, fundCheck, groupByDay, initials, isCode, knownText, limitLines, listTime, meetChoices,
  plusActions, previewOf, realIn, reasonText, retryable, seenText, statusText, type PlusCtx,
} from '../src/ui/phone/apps/messagesText';
import { cityTimeAt } from '../src/core/clock';
import type { AskItem, InviteItem, Item, MeetItem, PayItem } from '../src/online/protocol';
import { FAKE_LIMITS } from '../src/online/fake';

/**
 * The Messages app's words and rules (src/ui/phone/apps/messagesText.ts): amounts, times and days as a player reads them, what a card offers to which
 * side in which state, which « + » actions are open and why not, the city times of a meeting, friend codes, the limits said before a money operation.
 */
const NB = (s: string) => s.replace(/[  ]/g, ' ');
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 25, 15, 30);
const ME = 'f00dfeedcafe0001', AWA = 'a11ce0000000a001';

describe('times and days', () => {
  it('the list says the hour today, « hier », the weekday this week, else the date', () => {
    expect(listTime(at(2026, 10, 25, 9, 5), NOW)).toBe('09:05');
    expect(listTime(at(2026, 10, 24, 23, 59), NOW)).toBe('hier');
    expect(listTime(at(2026, 10, 21, 8), NOW)).toBe('mer.');
    expect(listTime(at(2026, 10, 12, 8), NOW)).toBe('12/10');
  });
  it('day separators: Aujourd’hui, Hier, then the full day (the year only when it differs)', () => {
    expect(dayLabel(at(2026, 10, 25, 1), NOW)).toBe('Aujourd’hui');
    expect(dayLabel(at(2026, 10, 24, 1), NOW)).toBe('Hier');
    expect(dayLabel(at(2026, 10, 19, 1), NOW)).toBe('lundi 19 octobre');
    expect(dayLabel(at(2026, 11, 1, 1), at(2026, 11, 20))).toBe('dimanche 1er novembre');
    expect(dayLabel(at(2025, 12, 31, 1), NOW)).toBe('mercredi 31 décembre 2025');
  });
  it('last seen and when a balance was known, in words', () => {
    expect(seenText('online', NOW)).toBe('en ligne');
    expect(seenText('never', NOW)).toBe('pas encore sur Messages');
    expect(seenText(NOW - 20_000, NOW)).toBe('vu à l’instant');
    expect(seenText(NOW - 5 * 60_000, NOW)).toBe('vu il y a 5 min');
    expect(seenText(NOW - 2 * 3600_000 - 1000, NOW)).toBe('vu il y a 2 h');
    expect(seenText(at(2026, 10, 24, 20), NOW)).toBe('vu hier');
    expect(seenText(at(2026, 10, 2, 20), NOW)).toBe('vu le 02/10');
    expect(seenText(null, NOW)).toBe('');
    expect(knownText(NOW - 5000, true, NOW)).toBe('à l’instant');
    expect(knownText(NOW - 3 * 60_000, false, NOW)).toBe('il y a 3 min · hors ligne');
    expect(ago(NOW - 59_000, NOW)).toBe('à l’instant');
    expect(clockOf(at(2026, 10, 25, 7, 4))).toBe('07:04');
  });
  it('the account’s state is always a sentence', () => {
    expect(statusText('online').text).toBe('En ligne');
    expect(statusText('offline').text).toMatch(/Hors ligne/);
    expect(statusText('reconnecting').text).toMatch(/Reconnexion/);
    expect(statusText(null).text).toMatch(/solo/);
  });
  it('groups a conversation by day, oldest first, one separator per day', () => {
    const items = [{ id: 'a', at: at(2026, 10, 24, 18) }, { id: 'b', at: at(2026, 10, 24, 18, 5) }, { id: 'c', at: at(2026, 10, 25, 9) }];
    const rows = groupByDay(items, NOW);
    expect(rows.map(r => (r.k === 'day' ? r.label : r.item.id))).toEqual(['Hier', 'a', 'b', 'Aujourd’hui', 'c']);
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('the list’s preview', () => {
  const base = { from: ME, at: NOW };
  it('says money as a player reads it: « 5 000 F envoyés », « reçus », a request and its outcome', () => {
    expect(NB(previewOf({ ...base, id: 'p', k: 'pay', amount: 5000, op: 'p' }, ME))).toBe('5 000 F envoyés');
    expect(NB(previewOf({ ...base, from: AWA, id: 'p', k: 'pay', amount: 5000, op: 'p' }, ME))).toBe('5 000 F reçus');
    expect(NB(previewOf({ ...base, from: AWA, id: 'q', k: 'ask', amount: 2000, state: 'open' }, ME))).toBe('Te demande 2 000 F');
    expect(NB(previewOf({ ...base, id: 'q', k: 'ask', amount: 2000, state: 'paid' }, ME))).toBe('Tu demandes 2 000 F · payée ✓');
  });
  it('texts (mine prefixed « Toi : »), positions, invitations, meetings, and an empty conversation', () => {
    expect(previewOf({ ...base, id: 't', k: 'text', text: 'À tout’' }, ME)).toBe('Toi : À tout’');
    expect(previewOf({ ...base, from: AWA, id: 't', k: 'text', text: 'Salaam' }, ME)).toBe('Salaam');
    expect(previewOf({ ...base, from: AWA, id: 'l', k: 'loc', hub: 'pikine', x: 0, z: 0, name: 'Marché' }, ME)).toBe('📍 Position : Marché');
    expect(previewOf({ ...base, id: 'm', k: 'meet', place: { id: 'x', hub: 'corniche', name: 'Corniche' }, when: 0, state: 'open', here: [] }, ME)).toBe('Rendez-vous · Corniche maintenant');
    expect(previewOf(null, ME)).toBe('Pas encore de message');
  });
});

describe('cards: what each side may do, in each state', () => {
  const acts = (i: Item, me = ME) => cardOf(i, me, 'Awa', NOW, { goToPlace: true, goToLocation: true, goToInvite: true }).actions.map(a => a.act);
  const ask = (from: string, state: AskItem['state']): AskItem => ({ id: 'q1', from, at: NOW, k: 'ask', amount: 5000, state });
  it('a request: the payer « Payer » / « Refuser », the payee « Annuler », then its outcome without actions', () => {
    expect(acts(ask(AWA, 'open'))).toEqual(['pay', 'decline']);
    expect(acts(ask(ME, 'open'))).toEqual(['cancel']);
    for (const s of ['paid', 'declined', 'cancelled'] as const) { expect(acts(ask(AWA, s))).toEqual([]); expect(acts(ask(ME, s))).toEqual([]); }
    expect(cardOf(ask(AWA, 'paid'), ME, 'Awa', NOW).state).toBe('Payée ✓');
    expect(cardOf(ask(ME, 'declined'), ME, 'Awa', NOW).state).toBe('Refusée');
    expect(cardOf(ask(ME, 'cancelled'), ME, 'Awa', NOW).state).toBe('Annulée');
    expect(NB(cardOf(ask(AWA, 'open'), ME, 'Awa', NOW).title)).toBe('Awa te demande 5 000 F');
  });
  const inv = (from: string, state: InviteItem['state'], until = NOW + 3600_000): InviteItem => ({ id: 'i1', from, at: NOW, k: 'invite', home: { spec: 's', hub: 'pikine', door: 'd', name: 'Chambre' }, perms: { use: true }, state, until });
  it('an invitation: the guest « Accepter » / « Refuser » then « Y aller »; the host « Retirer l’invitation »; closed ones none', () => {
    expect(acts(inv(AWA, 'open'))).toEqual(['accept', 'decline']);
    expect(acts(inv(AWA, 'accepted'))).toEqual(['go']);
    expect(acts(inv(ME, 'open'))).toEqual(['revoke']);
    expect(acts(inv(ME, 'accepted'))).toEqual(['revoke']);
    for (const s of ['declined', 'revoked', 'expired'] as const) expect(acts(inv(AWA, s))).toEqual([]);
    expect(cardOf(inv(AWA, 'open', NOW - 1), ME, 'Awa', NOW).state).toBe('Expirée');            // past its time: said, nothing offered
    expect(cardOf(inv(AWA, 'accepted'), ME, 'Awa', NOW, {}).actions).toEqual([]);              // « Y aller » only where the world can lead
  });
  const meet = (from: string, state: MeetItem['state'], here: string[] = []): MeetItem => ({ id: 'm1', from, at: NOW, k: 'meet', place: { id: 'p', hub: 'corniche', name: 'Terrain' }, when: NOW + 60_000, state, here });
  it('a meeting: the other « Accepter » / « Refuser » / « Proposer une autre heure », the proposer « Annuler », « Y aller » once accepted, met said', () => {
    expect(acts(meet(AWA, 'open'))).toEqual(['accept', 'decline', 'counter']);
    expect(acts(meet(ME, 'open'))).toEqual(['cancel']);
    expect(acts(meet(ME, 'accepted'))).toEqual(['go', 'cancel']);
    expect(acts(meet(AWA, 'accepted'))).toEqual(['go']);
    expect(cardOf(meet(AWA, 'met', [AWA, ME]), ME, 'Awa', NOW).state).toBe('Vous y êtes tous les deux ✓');
    expect(cardOf(meet(AWA, 'accepted', [ME]), ME, 'Awa', NOW).state).toMatch(/tu y es, on attend Awa/);
    for (const s of ['declined', 'cancelled', 'countered', 'missed', 'met'] as const) expect(acts(meet(AWA, s))).toEqual([]);
  });
  it('money sent and received, and a shared position (« Y aller » on theirs only)', () => {
    const pay: PayItem = { id: 'p', from: ME, at: NOW, k: 'pay', amount: 5000, op: 'p' };
    expect(NB(cardOf(pay, ME, 'Awa', NOW).title)).toBe('5 000 F envoyés');
    expect(NB(cardOf({ ...pay, from: AWA }, ME, 'Awa', NOW).title)).toBe('5 000 F reçus');
    const loc: Item = { id: 'l', from: AWA, at: NOW, k: 'loc', hub: 'pikine', x: 1, z: 2, name: 'Marché' };
    expect(acts(loc)).toEqual(['go']); expect(acts({ ...loc, from: ME })).toEqual([]);
  });
});

describe('the « + » menu', () => {
  const ctx = (o: Partial<PlusCtx> = {}): PlusCtx => ({ status: 'online', seen: 'online', blocked: false, name: 'Awa', hooks: { invite: true, meet: true, loc: true }, home: true, here: true, ...o });
  it('offers exactly five actions, in order, when everything is there', () => {
    const a = plusActions(ctx());
    expect(a.map(x => x.label)).toEqual(['Envoyer de l’argent', 'Demander de l’argent', 'Inviter chez moi', 'Proposer un rendez-vous', 'Partager ma position']);
    expect(a.every(x => x.ok && !x.why)).toBe(true);
  });
  it('hides an action whose world hook is missing, and closes one with its reason', () => {
    expect(plusActions(ctx({ hooks: { invite: false, meet: true, loc: false } })).map(x => x.id)).toEqual(['pay', 'ask', 'meet']);
    const noHome = plusActions(ctx({ home: false })).find(x => x.id === 'invite')!;
    expect(noHome.ok).toBe(false); expect(noHome.why).toMatch(/logement/);
    expect(plusActions(ctx({ here: false })).find(x => x.id === 'loc')!.why).toMatch(/position/);
  });
  it('offline, blocked or not on Messages: every action closed with one sentence', () => {
    for (const [o, re] of [[{ status: 'offline' }, /Hors ligne/], [{ status: 'reconnecting' }, /Hors ligne/], [{ blocked: true }, /bloqué Awa/], [{ seen: 'never' }, /pas encore ouvert Messages/]] as const) {
      const a = plusActions(ctx(o as Partial<PlusCtx>));
      expect(a.every(x => !x.ok)).toBe(true);
      expect(a[0].why).toMatch(re);
    }
  });
});

describe('meetings on the city clock (1 city hour = 1 real minute)', () => {
  const t0 = Date.UTC(2026, 9, 25, 10, 0, 0);
  it('« Maintenant » is sent as 0; the others are later city times, in order, each with its real delay', () => {
    const c = meetChoices(t0);
    expect(c.map(x => x.id)).toEqual(['now', 'soon', 'h1', 'h2']);
    expect(c[0].when).toBe(0);
    for (let i = 2; i < c.length; i++) expect(c[i].when).toBeGreaterThan(c[i - 1].when);
    const m0 = cityTimeAt(t0).hourFloat * 60;
    const soon = cityTimeAt(c[1].when), dSoon = (c[1].when - t0) / 1000;
    expect(dSoon).toBeGreaterThanOrEqual(60 - 0.01); expect(dSoon).toBeLessThan(76);       // one city hour, to the next quarter
    expect(soon.minute % 15).toBe(0);
    const h1 = cityTimeAt(c[2].when);
    expect(h1.minute).toBe(0); expect(h1.hour % 2).toBe(0); expect((c[2].when - t0) / 1000).toBeGreaterThanOrEqual(120 - 0.01);
    expect(c[2].label).toBe(`À ${h1.hour} h`);
    expect(c[2].clock).toBe(`${String(h1.hour).padStart(2, '0')}:00`);
    expect(c[3].when - c[2].when).toBe(120_000);
    expect(c[2].sub).toMatch(/^dans \d+ min$/);
    expect(Number.isFinite(m0)).toBe(true);
  });
  it('city times and real delays read as words', () => {
    expect(cityClock(Date.UTC(2026, 9, 6, 0, 18, 0))).toBe('18:00');                            // the epoch day: 18 real minutes = 18:00
    expect(cityWhen(Date.UTC(2026, 9, 6, 0, 18, 0), Date.UTC(2026, 9, 6, 0, 10, 0))).toBe('à 18:00');
    expect(cityWhen(Date.UTC(2026, 9, 6, 0, 26, 0), Date.UTC(2026, 9, 6, 0, 10, 0))).toBe('demain à 02:00');
    expect(realIn(t0 + 180_000, t0)).toBe('dans 3 min');
    expect(realIn(t0 + 40_000, t0)).toBe('dans 40 s');
    expect(realIn(t0 + 3_000, t0)).toBe('maintenant');
    expect(realIn(t0 - 120_000, t0)).toBe('il y a 2 min');
  });
});

describe('codes, limits, refusals', () => {
  it('a friend code is typed loosely and shown in groups of four', () => {
    expect(formatCode('7f3a91c2 0b4e-55d1')).toBe('7F3A-91C2-0B4E-55D1');
    expect(formatCode('7f3a9')).toBe('7F3A-9');
    expect(formatCode('zz7f3a91c20b4e55d1aa')).toBe('7F3A-91C2-0B4E-55D1');
    expect(isCode('7F3A-91C2-0B4E-55D1')).toBe(true); expect(isCode('7F3A-91C2-0B4E')).toBe(false);
    expect(initials('Awa')).toBe('A'); expect(initials('mame diarra')).toBe('MD');
  });
  it('today’s limits are said before a money operation', () => {
    const l = limitLines(FAKE_LIMITS, { funded: 0, sent: 5000, received: 0 }).map(NB);
    expect(l[0]).toBe('Envoyé aujourd’hui : 5 000 F sur 500 000 F');
    expect(l[3]).toBe('250 000 F au plus par opération · solde 5 000 000 F au plus');
    expect(limitLines(null, null)).toEqual([]);
  });
  it('a top-up or a withdrawal that cannot go says why before the confirmation', () => {
    expect(fundCheck(10_000, 50_000, 0, FAKE_LIMITS, { funded: 0 }, 'online')).toBe('');
    expect(NB(fundCheck(10_000, 4_000, 0, FAKE_LIMITS, { funded: 0 }, 'online'))).toBe('Ton portefeuille n’a que 4 000 F.');
    expect(fundCheck(10_000, 50_000, 0, FAKE_LIMITS, { funded: 495_000 }, 'online')).toMatch(/recharge permise/);
    expect(fundCheck(10_000, 50_000, 4_995_000, FAKE_LIMITS, { funded: 0 }, 'online')).toMatch(/dépasser/);
    expect(fundCheck(300_000, 500_000, 0, FAKE_LIMITS, { funded: 0 }, 'online')).toMatch(/au plus par recharge/);
    expect(fundCheck(1_000, 50_000, 0, FAKE_LIMITS, null, 'offline')).toMatch(/Hors ligne/);
    expect(cashoutCheck(1_000, 3_000, FAKE_LIMITS, 'online')).toBe('');
    expect(NB(cashoutCheck(5_000, 3_000, FAKE_LIMITS, 'online'))).toBe('Teranga Money n’a que 3 000 F.');
  });
  it('a failed message says why, and only what can go again is offered again', () => {
    expect(reasonText('rate-limited')).toMatch(/trop rapide/);
    expect(reasonText('offline')).toBe('pas de réseau');
    expect(retryable('offline')).toBe(true); expect(retryable('rate-limited')).toBe(true);
    expect(retryable('blocked')).toBe(false); expect(retryable('too-long')).toBe(false);
  });
});
