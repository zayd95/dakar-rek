import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { CITY_DAY_MS, cityTimeAt } from '../src/core/clock';
import { HUB_IDS, type HubId } from '../src/core/types';
import {
  CITY_MINUTE_MS, MEET_EARLY_MS, MEET_LATE_MS, MEET_PLACES, PITCH_ID, hereDue, homeMeetHost, inWindow, joinsOther, liftDue, meetTime, meetWindow, metNow, placeRadius,
} from '../src/online/meetups';
import { hubLayout } from '../src/world/builder';
import type { MeetItem } from '../src/online/protocol';

stubCanvas();
const A = '0123456789abcdef', B = 'fedcba9876543210';
const meet = (o: Partial<MeetItem>): MeetItem => ({ id: 'm1', from: A, at: 1_000_000, k: 'meet', place: { id: 'pikine:city:square', hub: 'pikine', name: 'Grand-place de Pikine' }, when: 0, state: 'accepted', here: [], ...o });

describe('the city time of a meeting', () => {
  it('one city minute is one real second (1 city hour = 1 real minute)', () => {
    expect(CITY_MINUTE_MS).toBe(1000);
    expect(MEET_EARLY_MS).toBe(5 * 60_000);
    expect(MEET_LATE_MS).toBe(10 * 60_000);
    const t = Date.UTC(2026, 9, 25, 12, 0, 0);
    expect(cityTimeAt(t + 60 * CITY_MINUTE_MS).hourFloat - cityTimeAt(t).hourFloat).toBeCloseTo(1, 6);
  });
  it('the window: from 5 real minutes before its time to 10 after (ECONOMY.online, the account\'s own)', () => {
    const T = 5_000_000, m = meet({ when: T });
    expect(meetTime(m)).toBe(T);
    expect(meetWindow(m)).toEqual({ from: T - MEET_EARLY_MS, to: T + MEET_LATE_MS });
    expect(inWindow(m, T - MEET_EARLY_MS - 1)).toBe(false);
    expect(inWindow(m, T - MEET_EARLY_MS)).toBe(true);
    expect(inWindow(m, T)).toBe(true);
    expect(inWindow(m, T + MEET_LATE_MS)).toBe(true);
    expect(inWindow(m, T + MEET_LATE_MS + 1)).toBe(false);
  });
  it('« maintenant » (when = 0) is the time it was made', () => {
    const m = meet({ when: 0, at: 7_000_000 });
    expect(meetTime(m)).toBe(7_000_000);
    expect(inWindow(m, 7_000_000 + 30_000)).toBe(true);
    expect(inWindow(m, 7_000_000 + MEET_LATE_MS + 1)).toBe(false);
  });
  it('a meeting set at a city time a city day away is not open today', () => {
    const now = 9_000_000, m = meet({ when: now + CITY_DAY_MS });
    expect(inWindow(m, now)).toBe(false);
    expect(inWindow(m, now + CITY_DAY_MS - 5_000)).toBe(true);
  });
});

describe('being there', () => {
  const T = 2_000_000;
  it('`here` once: accepted, in the window, at the place, not yet counted, not sent before', () => {
    expect(hereDue(meet({ when: T }), B, T, true, false)).toBe(true);
    expect(hereDue(meet({ when: T }), B, T, true, true)).toBe(false);                 // already sent
    expect(hereDue(meet({ when: T, here: [B] }), B, T, true, false)).toBe(false);     // already counted by the server
    expect(hereDue(meet({ when: T }), B, T, false, false)).toBe(false);               // not there
    expect(hereDue(meet({ when: T, state: 'open' }), B, T, true, false)).toBe(false); // not accepted
    expect(hereDue(meet({ when: T, state: 'met' }), B, T, true, false)).toBe(false);
    expect(hereDue(meet({ when: T }), B, T + MEET_LATE_MS + 1, true, false)).toBe(false);
    expect(hereDue(meet({ when: T }), B, T - MEET_EARLY_MS - 1, true, false)).toBe(false);
  });
  it('the card when it turns « met » (seen before in another state, or this player was there); never again for an old one', () => {
    expect(metNow('accepted', 'met', false)).toBe(true);
    expect(metNow(undefined, 'met', true)).toBe(true);
    expect(metNow(undefined, 'met', false)).toBe(false);
    expect(metNow('met', 'met', true)).toBe(false);
    expect(metNow('accepted', 'missed', true)).toBe(false);
  });
  it('the social lift at most once a city day', () => {
    expect(liftDue(undefined, 20)).toBe(true);
    expect(liftDue(20, 20)).toBe(false);
    expect(liftDue(20, 21)).toBe(true);
  });
  it('« chez moi »: the proposer is the host; the one who did not propose joins the proposer’s room', () => {
    expect(homeMeetHost(meet({ place: { id: 'pikine:home:jamm', hub: 'pikine', name: 'Chez moi · Appartement F2' } }))).toBe(A);
    expect(homeMeetHost(meet({}))).toBeNull();
    expect(joinsOther(meet({}), B)).toBe(true);
    expect(joinsOther(meet({}), A)).toBe(false);
    expect(joinsOther(meet({}), null)).toBe(false);
  });
  it('how near is there: the catalogue’s radius, 6 m at a home’s door, 12 m elsewhere', () => {
    expect(placeRadius({ id: PITCH_ID })).toBe(26);
    expect(placeRadius({ id: 'pikine:home:11' })).toBe(6);
    expect(placeRadius({ id: 'somewhere:else' })).toBe(12);
  });
});

describe('the places of the catalogue', () => {
  it('unique ids of the game’s districts, each with a name, an icon and a radius', () => {
    expect(new Set(MEET_PLACES.map(p => p.id)).size).toBe(MEET_PLACES.length);
    for (const p of MEET_PLACES) {
      expect(HUB_IDS).toContain(p.hub);
      expect(p.id.startsWith(p.hub + ':') || p.id.startsWith(p.hub)).toBe(true);
      expect(p.name.length).toBeGreaterThan(3); expect(p.icon).toBeTruthy(); expect(p.radius).toBeGreaterThan(4);
    }
    for (const h of HUB_IDS) expect(MEET_PLACES.some(p => p.hub === h)).toBe(true);
  });
  it('the Corniche has its football pitch (the directory entry this module adds stands on it)', () => {
    expect(hubLayout('corniche').specials.some(s => s.kind === 'pitch')).toBe(true);
  });
  // the ids the world itself builds (src/world/builder.ts, src/world/city.ts) are in the built districts; the others are added by modules once the
  // district is loaded (the arena's ticket window: src/arena, La Vague: src/venues/club.ts, the pitch: this module), checked in the game by scripts/check-visit.mjs
  const MODULE_PLACES = new Set(['pikine:arena:guichet', 'almadies:city:club', PITCH_ID]);
  it('every other id is an interactable of the built district, with the catalogue’s name', async () => {
    const { buildHub } = await import('../src/world/builder');
    const byHub = new Map<HubId, { id: string; name: string }[]>();
    for (const p of MEET_PLACES.filter(q => !MODULE_PLACES.has(q.id))) {
      if (!byHub.has(p.hub)) byHub.set(p.hub, buildHub(p.hub, true).interactables.map(i => ({ id: i.id, name: i.name })));
      const it = byHub.get(p.hub)!.find(i => i.id === p.id);
      expect(it, p.id).toBeTruthy();
      expect(it!.name).toBe(p.name);
    }
  }, 120_000);
});
