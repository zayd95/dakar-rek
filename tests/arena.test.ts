import { describe, it, expect } from 'vitest';
import {
  BILL, DENSITY, GALA, GALA_DONE_COUNTER, REACTION, SEAT_GAP, SHOW, TICKET_COUNTER, TICKET_PRICE,
  fillAt, fillOrder, hasTicket, pilot, seatRadius, standSeats, streetAt, ticketsChecked, type BoutView,
} from '../src/arena/program';
import { inGate, tierTop, TIERS, PARAPET_R, WALL_R, tierRadius, TIER_DEPTH } from '../src/world/geew';
import { ARENA, unknownPhrases } from '../src/i18n/lines';
import { glossed } from '../src/i18n/wolof';
import { Seats } from '../src/interact/seats';
import { CAST } from '../src/social/cast';

const plain = (s: string) => glossed(s, true).replace(/[  ]/g, ' ');

describe('the gala evening', () => {
  it('the street wakes up at 16 h, the doors open at 17 h, it is over at 23 h or once the gala of the day was seen', () => {
    expect(streetAt(10, false)).toBe('quiet');
    expect(streetAt(16.5, false)).toBe('setup');
    expect(streetAt(17, false)).toBe('doors');
    expect(streetAt(21.9, false)).toBe('doors');
    expect(streetAt(21.9, true)).toBe('after');
    expect(streetAt(23.5, false)).toBe('after');
    expect(streetAt(0.5, false)).toBe('quiet');
    expect(ticketsChecked(18, false)).toBe(true);
    expect(ticketsChecked(18, true)).toBe(false);
    expect(ticketsChecked(12, false)).toBe(false);
    expect(GALA.doors).toBeLessThan(GALA.close);
  });
  it('a ticket is paid once and holds for the city day it was bought', () => {
    expect(TICKET_PRICE).toBeGreaterThan(0);
    expect(hasTicket({}, 12)).toBe(false);
    expect(hasTicket({ [TICKET_COUNTER]: 12 }, 12)).toBe(true);
    expect(hasTicket({ [TICKET_COUNTER]: 12 }, 13)).toBe(false);
    expect(TICKET_COUNTER).not.toBe(GALA_DONE_COUNTER);
  });
  it('the stands fill hour after hour, then empty', () => {
    expect(fillAt(16)).toBe(0);
    let prev = 0;
    for (let h = 17; h < 23; h += 0.5) { const f = fillAt(h); expect(f).toBeGreaterThanOrEqual(prev); expect(f).toBeLessThanOrEqual(1); prev = f; }
    expect(fillAt(19.2)).toBe(1);
    expect(fillAt(23.5)).toBe(0);
  });
  it('density follows the graphics quality', () => {
    expect(DENSITY.low.crowdShare).toBeLessThan(DENSITY.medium.crowdShare);
    expect(DENSITY.medium.crowdShare).toBeLessThan(DENSITY.high.crowdShare);
    expect(DENSITY.low.near).toBe(0);
    expect(DENSITY.high.queue).toBeGreaterThan(DENSITY.low.queue);
  });
  it('the show has a duration for every timed phase and reactions for every moment', () => {
    for (const k of ['filling', 'entrance', 'result', 'leaving'] as const) expect(SHOW[k]).toBeGreaterThan(0);
    for (const r of Object.values(REACTION)) { expect(r.share).toBeGreaterThan(0); expect(r.share).toBeLessThanOrEqual(1); }
    expect(REACTION.fall.share).toBeGreaterThan(REACTION.clinch.share);
  });
});

describe('places on the tiers', () => {
  const seats = standSeats(30, -30, 'pikine:arena:stand');
  it('three tiers of places facing the ring, none in the gate, at the height of their tier', () => {
    expect(seats.length).toBeGreaterThan(300);
    for (let t = 0; t < TIERS; t++) expect(seats.filter(s => s.tier === t).length).toBeGreaterThan(100);
    for (const s of seats) {
      const a = Math.atan2(s.x - 30, s.z + 30);
      expect(inGate(a)).toBe(false);
      expect(s.top).toBeCloseTo(tierTop(s.tier));
      const r = Math.hypot(s.x - 30, s.z + 30);
      expect(r).toBeCloseTo(seatRadius(s.tier), 6);
      expect(r).toBeGreaterThan(PARAPET_R); expect(r).toBeLessThan(WALL_R);
      // on the tier's top, behind its front edge
      expect(r).toBeGreaterThan(tierRadius(s.tier) - TIER_DEPTH / 2); expect(r).toBeLessThan(tierRadius(s.tier) + TIER_DEPTH / 2);
      // facing the centre: forward = (sin yaw, cos yaw)
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      expect(fx * (30 - s.x) / r + fz * (-30 - s.z) / r).toBeGreaterThan(0.999);
    }
  });
  it('places never overlap and keep stable ids', () => {
    const ids = new Set(seats.map(s => s.id)); expect(ids.size).toBe(seats.length);
    for (let t = 0; t < TIERS; t++) {
      const row = seats.filter(s => s.tier === t);
      for (let i = 1; i < row.length; i++) expect(Math.hypot(row[i].x - row[i - 1].x, row[i].z - row[i - 1].z)).toBeGreaterThan(SEAT_GAP * 0.95);
    }
    expect(standSeats(30, -30, 'pikine:arena:stand').map(s => s.id)).toEqual(seats.map(s => s.id));
  });
  it('the crowd fills them in a seeded order, each place once', () => {
    const o = fillOrder(seats.length, 7);
    expect(new Set(o).size).toBe(seats.length);
    expect(fillOrder(seats.length, 7)).toEqual(o);
    expect(o.slice(0, 10)).not.toEqual(Array.from({ length: 10 }, (_, i) => i));
  });
  it('the seat registry offers a free place on the tiers from the ring side, never one somebody holds', () => {
    const reg = new Seats();
    for (const s of seats.slice(0, 40)) reg.add({ id: s.id, x: s.x, z: s.z, top: s.top, yaw: s.yaw, kind: 'stand', space: 'street', occupant: null, reach: 3.4 });
    const first = seats[0], r = Math.hypot(first.x - 30, first.z + 30), k = (r - 2.4) / r;
    const px = 30 + (first.x - 30) * k, pz = -30 + (first.z + 30) * k;       // 2.4 m in front, on the ring side
    const out: import('../src/interact/types').Target[] = []; reg.collect('street', px, pz, out);
    expect(out.some(t => t.id === 'seat:' + first.id)).toBe(true);
    expect(out[0].name).toBe('Place en tribune');
    reg.occupy(first.id, 'arena-crowd');
    const again: import('../src/interact/types').Target[] = []; reg.collect('street', px, pz, again);
    expect(again.some(t => t.id === 'seat:' + first.id)).toBe(false);
    expect(reg.occupy(first.id, 'player')).toBe(false);
  });
});

describe('the watched bout and the lines', () => {
  const view = (o: Partial<BoutView>): BoutView => ({ phase: 'fight', dist: 3, windup: false, open: null, stamina: { player: 100, opponent: 100 }, clinch: null, ...o });
  it('the pilot walks in, guards an attack, grabs at close range, pushes and breaks away in the empoignade', () => {
    expect(pilot(view({ dist: 3 }), 0.5, 0.016).approach).toBe(1);
    expect(pilot(view({ dist: 0.6 }), 0.5, 0.016).approach).toBeLessThan(0);
    expect(pilot(view({ windup: true, dist: 1.2 }), 0.1, 0.016).guard).toBe(true);
    expect(pilot(view({ dist: 1.2 }), 0.001, 0.016).grab).toBe(true);
    expect(pilot(view({ dist: 1.2, stamina: { player: 10, opponent: 100 } }), 0.001, 0.016).grab).toBe(false);
    expect(pilot(view({ dist: 2.5 }), 0.001, 0.016).grab).toBe(false);
    const c = view({ phase: 'clinch', clinch: { losing: true, breakWindow: true } });
    expect(pilot(c, 0.01, 0.016).taps).toBe(1);
    expect(pilot(c, 0.01, 0.016).brk).toBe(true);
    expect(pilot(view({ phase: 'result' }), 0.01, 0.016)).toEqual({ approach: 0, guard: false, grab: false, taps: 0, brk: false });
  });
  it('the bill is the game’s own cast and fictional écuries', () => {
    for (const side of [BILL.left, BILL.right]) expect(CAST.some(c => c.id === side.id && c.name === side.name)).toBe(true);
    expect([BILL.left.ecurie, BILL.right.ecurie]).toEqual(['Baobab', 'Teranga']);
  });
  it('arena lines: lexicon Wolof with glosses, French spacing, no religious formula', () => {
    unknownPhrases.clear();
    const lines = [ARENA.ticket(TICKET_PRICE), ARENA.welcome(), ARENA.stop(), ARENA.bissap(), ARENA.bill('Babacar', 'Baobab', 'Lamine', 'Teranga'),
      ARENA.entrance('Babacar', 'Baobab'), ARENA.result('Babacar', 'projection'), ARENA.result('Lamine', 'decision'), ARENA.result(null, 'egalite'), ARENA.over].map(plain);
    expect([...unknownPhrases]).toEqual([]);
    expect(lines[0]).toBe('Le guichetier : « 1 000 F, jërëjëf ! » (merci)');
    expect(lines[1]).toMatch(/^Le contrôleur : « Dalal ak jàmm ! » \(bienvenue\)/);
    expect(lines[2]).toMatch(/^Le contrôleur : « Xaaral tuuti ! » \(attends un peu\) · Il faut un billet/);
    expect(lines[6]).toBe('Babacar l’emporte par projection ! · Le public : « Daan na ! » (il a gagné)');
    for (const l of lines) {
      expect(l).not.toMatch(/allah|alxamdu|bismi|insha|marabout|sourate|verset|coran|du[’']a/i);
      expect(/[^\s(][?!;»]/.test(l) || /«[^\s]/.test(l), l).toBe(false);
    }
  });
});
