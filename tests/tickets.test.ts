import { describe, it, expect } from 'vitest';
import {
  TICKETS, TIER_COUNTER, TIER_NOTE, TRIBUNES, crowdMayTake, honneurDress, placeDraw, seatRefusal, sectionAt, ticketLabel, ticketSheet, ticketTribune,
  tierRows, tribuneOf, whereLine, type Tribune,
} from '../src/arena/tickets';
import { honneurPlate, tribuneDecor } from '../src/arena/ticketsDecor';
import { TICKET_COUNTER, TICKET_PRICE, fillOrder, hasTicket, standSeats, ticketTier } from '../src/arena/program';
import { SECTIONS, PARAPET_R } from '../src/world/geew';
import { arenaField } from '../src/arena/together';
import { parseArena } from '../src/multiplayer/protocol';
import { ARENA, unknownPhrases } from '../src/i18n/lines';

const C = { x: 30, z: -30 };
const seats = standSeats(C.x, C.z, 't');
const of = (t: Tribune) => seats.filter(s => s.tribune === t);

describe('ticket tiers: prices', () => {
  it('three tiers at the window, dearer as they get closer and roomier; the « Populaire » is today\'s ticket', () => {
    expect(TRIBUNES).toEqual(['populaire', 'couverte', 'honneur']);
    expect(TICKETS.populaire.price).toBe(1000); expect(TICKETS.couverte.price).toBe(2500); expect(TICKETS.honneur.price).toBe(5000);
    expect(TICKET_PRICE).toBe(TICKETS.populaire.price);
    expect(ticketSheet().replace(/[  ]/g, ' ')).toMatch(/^Populaire 1 000 F · Tribune couverte 2 500 F · Tribune d’honneur 5 000 F/);
    expect(ticketLabel('populaire')).toBe('Billet · gala de làmb');                                // the wallet line as before
    expect(ticketLabel('honneur')).toBe('Billet · gala de làmb · Tribune d’honneur');
    for (const t of TRIBUNES) expect(`${TICKETS[t].label} ${TICKETS[t].detail}`).not.toMatch(/®|™|sponsor|VIP/i);   // no brands
  });
  it('the window\'s rows: the price first, then the tier, one short line on what it gets, « Payer » on the right', () => {
    const sp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
    const rows = tierRows(10000);
    expect(rows.map(r => sp(r.label))).toEqual(['1 000 F · Populaire', '2 500 F · Tribune couverte', '5 000 F · Tribune d’honneur']);
    expect(rows.map(r => r.tribune)).toEqual([...TRIBUNES]);
    for (const r of rows) {
      expect(r.right).toBe('Payer'); expect(r.disabled).toBe(false); expect(r.reason).toBeUndefined();
      expect(r.detail).toBe(TIER_NOTE[r.tribune]);
      expect(r.detail.length).toBeLessThanOrEqual(40);                                            // two lines at most on a phone
      expect(r.detail).not.toMatch(/®|™|sponsor|VIP/i);
    }
  });
  it('a tier the wallet cannot pay is greyed with what is missing; exactly the price is enough', () => {
    const sp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
    const at = (w: number) => tierRows(w).map(r => (r.disabled ? sp(r.reason!) : 'ok'));
    expect(at(2500)).toEqual(['ok', 'ok', 'Il te manque 2 500 F']);
    expect(at(1000)).toEqual(['ok', 'Il te manque 1 500 F', 'Il te manque 4 000 F']);
    expect(at(400)).toEqual(['Il te manque 600 F', 'Il te manque 2 100 F', 'Il te manque 4 600 F']);
    expect(at(5000)).toEqual(['ok', 'ok', 'ok']);
  });
  it('the evening\'s ticket keeps its tier in the save; a ticket from before the tiers is a « Populaire »', () => {
    expect(ticketTier({}, 12)).toBeNull();
    expect(ticketTier({ [TICKET_COUNTER]: 12 }, 12)).toBe('populaire');
    expect(ticketTier({ [TICKET_COUNTER]: 12, [TIER_COUNTER]: 2 }, 12)).toBe('honneur');
    expect(ticketTier({ [TICKET_COUNTER]: 11, [TIER_COUNTER]: 2 }, 12)).toBeNull();               // yesterday's
    expect(hasTicket({ [TICKET_COUNTER]: 12, [TIER_COUNTER]: 1 }, 12)).toBe(true);
    expect(ticketTribune({ [TIER_COUNTER]: 9 }, true)).toBe('populaire');
    expect(TIER_COUNTER).not.toBe(TICKET_COUNTER);
  });
});

describe('ticket tiers: which places', () => {
  it('every place on the tiers has its section and its tier; the honneur rows are the two front rows of B, by the officials', () => {
    for (const s of seats) { expect(s.section).toBe(sectionAt(s.a)); expect(s.section).not.toBeNull(); expect(s.tribune).toBe(tribuneOf(s.section, s.tier)); }
    expect(of('honneur').every(s => s.section === 'B' && s.tier <= 1)).toBe(true);
    expect(of('couverte').every(s => ['C', 'F', 'G'].includes(s.section!))).toBe(true);
    expect(of('populaire').every(s => ['A', 'D', 'E', 'H'].includes(s.section!) || (s.section === 'B' && s.tier === 2))).toBe(true);
    // the officials' table is in front of B (+x side, z + 2)
    const B = SECTIONS.find(s => s.id === 'B')!, table = Math.atan2(13.2, 2);
    expect(table).toBeGreaterThan(B.a0); expect(table).toBeLessThan(B.a1);
  });
  it('fewer places of honneur than of the others; every tier has room for an evening', () => {
    const n = Object.fromEntries(TRIBUNES.map(t => [t, of(t).length])) as Record<Tribune, number>;
    expect(n.honneur).toBeGreaterThan(20); expect(n.honneur).toBeLessThan(n.couverte / 3); expect(n.honneur).toBeLessThan(n.populaire / 3);
    expect(n.couverte).toBeGreaterThan(100); expect(n.populaire).toBeGreaterThan(100);
    expect(n.honneur + n.couverte + n.populaire).toBe(seats.length);
  });
  it('a ticket opens its own places only, and the refusal says why (which ticket, where its places are)', () => {
    for (const t of TRIBUNES) for (const s of TRIBUNES) {
      const why = seatRefusal(t, s);
      if (t === s) expect(why).toBeNull();
      else { expect(why).toContain(TICKETS[t].name); expect(why).toContain(TICKETS[t].where); expect(why).toContain(TICKETS[s].name); }
    }
    for (const s of TRIBUNES) expect(seatRefusal(null, s)!.replace(/[  ]/g, ' ')).toContain(`${TICKETS[s].price.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`);
  });
  it('the controller lets a ticket in and says where its places are (lexicon Wolof only)', () => {
    unknownPhrases.clear();
    for (const t of TRIBUNES) { const l = ARENA.welcome(whereLine(t)); expect(l).toContain('Dalal ak jàmm'); expect(l).toContain(TICKETS[t].where); }
    expect([...unknownPhrases]).toEqual([]);
  });
});

describe('ticket tiers: who sits there', () => {
  it('the crowd fills each tier by its share: the honneur rows stay roomy', () => {
    for (const t of TRIBUNES) {
      const list = of(t), share = list.filter(s => crowdMayTake(s.id, t)).length / list.length;
      expect(Math.abs(share - TICKETS[t].crowd)).toBeLessThan(0.15);
    }
    expect(TICKETS.honneur.crowd).toBeLessThan(TICKETS.couverte.crowd); expect(TICKETS.couverte.crowd).toBeLessThanOrEqual(TICKETS.populaire.crowd);
    expect(placeDraw('x')).toBe(placeDraw('x'));
  });
  it('as the stands fill along the preliminaries (to about 95 %), every tier fills in step, each to its own share', () => {
    const order = fillOrder(seats.length, 7).map(i => seats[i]).filter(d => crowdMayTake(d.id, d.tribune));
    for (const f of [0.35, 0.6, 0.95]) {
      const taken = order.slice(0, Math.round(order.length * f));
      for (const t of TRIBUNES) {
        const share = taken.filter(s => s.tribune === t).length / of(t).length;
        expect(Math.abs(share - f * TICKETS[t].crowd), `${t} at ${f}`).toBeLessThan(0.12);
      }
    }
  });
  it('the honneur rows are in their best: boubous and long dresses, never a tee-shirt, some guests in the officials\' colours', () => {
    let k = 1; const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    const looks = Array.from({ length: 300 }, () => honneurDress({ style: 'tee', shirt: 0xd9322b, legs: 0x2b2f3a, skin: 0x4e2e1c, wrap: null }, r));
    expect(looks.every(l => l.style !== 'tee')).toBe(true);
    expect(looks.filter(l => [0xf2f2ec, 0x9cc8e8, 0x27407a].includes(l.shirt) && l.style === 'boubou').length).toBeGreaterThan(60);
    const dress = honneurDress({ style: 'dress', shirt: 0xe58a2f, legs: 0xe58a2f, skin: 0x4e2e1c, wrap: null }, r);
    expect(dress.style === 'dress' || dress.style === 'boubou').toBe(true);
  });
});

describe('ticket tiers: the view and the look', () => {
  it('from every honneur place the ring is in view: nothing of the officials\' canopy between the eyes and the ring', () => {
    // the officials' table and its canopy (src/world/builder.ts): posts at tx ± 2, tz ± 1.5; roof 4.4 × 3.4 at 2.6 m; trims at tz ± 1.7
    const B = 0.14, tx = C.x + 13.2, tz = C.z + 2;
    const boxes = [
      { x0: tx - 2.2, x1: tx + 2.2, y0: B + 2.6, y1: B + 2.72, z0: tz - 1.7, z1: tz + 1.7 },
      ...[-1, 1].map(sz => ({ x0: tx - 2.2, x1: tx + 2.2, y0: B + 2.3, y1: B + 2.65, z0: tz + sz * 1.7 - 0.02, z1: tz + sz * 1.7 + 0.02 })),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x0: tx + sx * 2 - 0.05, x1: tx + sx * 2 + 0.05, y0: 0, y1: B + 2.6, z0: tz + sz * 1.5 - 0.05, z1: tz + sz * 1.5 + 0.05 })),
    ];
    const hits = (a: number[], b: number[]) => boxes.some(q => {
      for (let i = 0; i <= 200; i++) {
        const k = i / 200, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k;
        if (x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1 && z > q.z0 && z < q.z1) return true;
      }
      return false;
    });
    let marks = 0, seen = 0;
    const eyeOf = (s: typeof seats[number]) => [s.x + Math.sin(s.yaw) * 0.12, s.top + 0.8, s.z + Math.cos(s.yaw) * 0.12];
    for (const s of of('honneur')) {
      const eye = eyeOf(s);
      expect(hits(eye, [C.x, 1.0, C.z]), `${s.id}`).toBe(false);                                     // the ring's centre, always
      for (const t of [[C.x + 3, 1.0, C.z], [C.x - 3, 1.0, C.z]]) { marks++; if (!hits(eye, t)) seen++; }   // the wrestlers' marks
      expect(Math.hypot(s.x - C.x, s.z - C.z)).toBeLessThan(19.5);                                  // the closest rows
    }
    expect(seen / marks).toBeGreaterThan(0.95);
    // the couverte places see everything; the row behind the canopy is not sold as anything but « Populaire »
    for (const s of of('couverte')) expect(hits(eyeOf(s), [C.x, 1.0, C.z]), s.id).toBe(false);
  });
  it('cushions on the couverte and honneur places, the couverte\'s canvas, the honneur plate on the parapet in front of B', () => {
    const b = tribuneDecor(C.x, C.z, seats);
    expect(b.count).toBeGreaterThan(of('couverte').length + of('honneur').length * 3);
    const pl = honneurPlate(C.x, C.z);
    expect(sectionAt(Math.atan2(pl.x - C.x, pl.z - C.z))).toBe('B');
    expect(Math.hypot(pl.x - C.x, pl.z - C.z)).toBeLessThan(PARAPET_R);
  });
});

describe('ticket tiers: friends', () => {
  it('nothing about a ticket or money crosses the presence protocol: the arena field is the show only', () => {
    const f = arenaField({ day: 12, phase: 'bout', t: 41, result: { winner: 'left', outcome: 'projection' }, here: true })!;
    expect(Object.keys(f).sort()).toEqual(['d', 'o', 'p', 't', 'w']);
    const back = parseArena({ ...f, tier: 2, price: 5000, wallet: 1 }) as Record<string, unknown> | null;   // extra keys never get through
    for (const k of ['tier', 'price', 'wallet']) expect(back?.[k]).toBeUndefined();
  });
});
