import { describe, expect, it } from 'vitest';
import {
  BODY_BUDGET, CLEAR_SPOT, FRAME_CALLS, NEXT, Routines, hashOf, inWindow, lifeBudget, shareAt, spotOpen, spotsInTheWay, stepAside, streamOf,
  type Host, type LifePlan, type LifeQuality, type LifeSpot, type Phase,
} from '../src/venues/routine';
import { NGOR_AREA, NGOR_KEEP, NGOR_LIFE, PATIO_KEEP, PATIO_LIFE, PATIO_WALK, TERRACE_AISLE, TERRACE_KEEP, placed, terraceLife } from '../src/venues/lifePlans';
import { AMBIENT_BUDGET, BODY_CALLS } from '../src/social/ambientData';
import { CAST, DANCE_FLOOR, HW, ZB, ZF, patioMoment } from '../src/venues/patioPlan';
import { ROOFTOPS } from '../src/venues/rooftop';
import { NGOR_BEACH } from '../src/world/ngorBeach';
import { stubCanvas } from './hubstub';

/**
 * The living places of 1.0.1 (src/venues/routine.ts, src/venues/lifePlans.ts): the routine's state machine (arrive → walk → gather → interact → leave, on the
 * place's hours, the same every run), the density and budget rule (people by hour and quality, full bodies never beyond what the shared budget has left), and
 * where people stand (never on a door, an anchor, an aisle, the cast, or each other).
 */
stubCanvas();
const QS: LifeQuality[] = ['low', 'medium', 'high'];
const TERRACES = Object.values(ROOFTOPS).map(d => terraceLife(d!, d!.id));
const PLANS: LifePlan[] = [PATIO_LIFE, NGOR_LIFE, ...TERRACES];
const spot = (id: string, kind: LifeSpot['kind'], x: number, z: number, extra: Partial<LifeSpot> = {}): LifeSpot => ({ id, kind, x, z, yaw: 0, ...extra });
const TOY: LifePlan = {
  id: 'toy', entries: [{ x: 0, z: 0 }, { x: 40, z: 0 }],
  gathers: [spot('g0', 'talk', 5, 2), spot('g1', 'talk', 6, 2), spot('g2', 'talk', 7, 2), spot('g3', 'talk', 5, 4), spot('g4', 'talk', 7, 4)],
  spots: [spot('a', 'dance', 12, 6), spot('b', 'sea', 16, 8), spot('c', 'sit', 20, 6, { seat: 'seat:1' }), spot('d', 'talk', 24, 6), spot('e', 'stand', 28, 6), spot('f', 'dance', 14, 9, { from: 21, until: 2 }), spot('h', 'talk', 30, 8), spot('i', 'stand', 32, 6), spot('j', 'sea', 34, 8), spot('k', 'stroll', 10, 9)],
  windows: [[13, 18, 1], [18, 20, 0.5], [22, 2, 0.25]], capacity: { low: 3, medium: 5, high: 8 }, near: { low: 0, medium: 2, high: 4 },
};
/** Runs a place for `seconds` at an hour, 0.1 s a step; `each` after every step. */
function run(r: Routines, seconds: number, hour: number, each?: () => void) { for (let t = 0; t < seconds; t += 0.1) { r.step(0.1, hour); each?.(); } }

describe('the hour windows and the density rule', () => {
  it('reads a window, across midnight too', () => {
    expect(inWindow(13, 13, 18)).toBe(true); expect(inWindow(18, 13, 18)).toBe(false); expect(inWindow(23.5, 22, 2)).toBe(true); expect(inWindow(1.9, 22, 2)).toBe(true);
    expect(inWindow(2, 22, 2)).toBe(false); expect(inWindow(-1, 22, 2)).toBe(true); expect(inWindow(24 + 14, 13, 18)).toBe(true);
    expect(shareAt(TOY, 15)).toBe(1); expect(shareAt(TOY, 19)).toBe(0.5); expect(shareAt(TOY, 0.5)).toBe(0.25); expect(shareAt(TOY, 8)).toBe(0); expect(shareAt(TOY, 20.5)).toBe(0);
  });
  it('the beach is busy in the afternoon and empty at night; Le Patio and the roofs in the evening and empty by day', () => {
    for (let h = 13; h < 18; h += 0.5) expect(shareAt(NGOR_LIFE, h), `plage ${h}`).toBe(1);
    for (const h of [21, 23, 0, 2, 4, 6, 7.5]) expect(shareAt(NGOR_LIFE, h), `plage ${h}`).toBe(0);
    expect(shareAt(NGOR_LIFE, 9)).toBeGreaterThan(0); expect(shareAt(NGOR_LIFE, 9)).toBeLessThan(shareAt(NGOR_LIFE, 11));
    for (let h = 0; h < 2.5; h += 0.5) expect(shareAt(PATIO_LIFE, h), `patio ${h}`).toBe(1);
    expect(shareAt(PATIO_LIFE, 20.5)).toBeLessThan(shareAt(PATIO_LIFE, 23));
    // nobody of the crowd whenever the club is not open (the moments of src/venues/patioPlan.ts), someone whenever it is
    for (let h = 0; h < 24; h += 0.25) expect(shareAt(PATIO_LIFE, h) > 0, `patio ${h}`).toBe(['early', 'warm', 'peak', 'dawn'].includes(patioMoment(h)));
    for (const t of TERRACES) {
      expect(shareAt(t, 21), t.id).toBe(1);
      for (const h of [2, 4, 6, 8, 10]) expect(shareAt(t, h), `${t.id} ${h}`).toBe(0);
    }
    // the hotel's roof has nobody while its stair door is shut (17 h – 1 h)
    const ngor = TERRACES.find(t => t.id === 'terrasse:almadies')!, hours = ROOFTOPS.almadies!.hours!;
    for (let h = 0; h < 24; h += 0.25) if (!inWindow(h, hours[0], hours[1])) expect(shareAt(ngor, h), `${h}`).toBe(0);
  });
  it('people by hour and quality: none outside the windows, at least one inside, the capacity at the full window, fewer on a lower quality', () => {
    for (const p of PLANS) {
      for (const q of QS) {
        let most = 0;
        for (let h = 0; h < 24; h += 0.25) {
          const b = lifeBudget(p, q, h), s = shareAt(p, h);
          expect(b.people === 0, `${p.id} ${q} ${h}`).toBe(s === 0);
          expect(b.people).toBeLessThanOrEqual(p.capacity[q]); most = Math.max(most, b.people);
        }
        expect(most, `${p.id} ${q}`).toBe(p.capacity[q]);
      }
      expect(p.capacity.low).toBeLessThan(p.capacity.medium); expect(p.capacity.medium).toBeLessThan(p.capacity.high);
    }
  });
  it('full bodies: the shared budget is the code’s cap (never above the audit’s 12 / 20 / 30), and a place never takes more than is left of it', () => {
    expect(BODY_BUDGET).toEqual({ low: AMBIENT_BUDGET.low.totalFull, medium: AMBIENT_BUDGET.medium.totalFull, high: AMBIENT_BUDGET.high.totalFull });
    const audit = { low: 12, medium: 20, high: 30 };
    for (const q of QS) expect(BODY_BUDGET[q]).toBeLessThanOrEqual(audit[q]);
    expect(FRAME_CALLS).toEqual({ low: 180, medium: 300, high: 420 });
    for (const p of PLANS) for (const q of QS) for (let h = 0; h < 24; h += 0.5) for (let others = 0; others <= 34; others++) {
      const b = lifeBudget(p, q, h, others);
      expect(b.bodies, `${p.id} ${q} ${h} ${others}`).toBeGreaterThanOrEqual(0);
      expect(b.bodies + others <= BODY_BUDGET[q] || b.bodies === 0).toBe(true);                    // with the others' bodies, inside the budget — or none at all
      expect(b.bodies).toBeLessThanOrEqual(Math.min(p.near[q], b.people));
      expect(lifeBudget(p, q, h, others).people).toBe(lifeBudget(p, q, h, 0).people);              // the budget never changes how many are there, only how they are drawn
    }
    // low quality: figures only; with the street's budget spent, figures only on every quality
    for (const p of PLANS) { expect(p.near.low).toBe(0); for (const q of QS) expect(lifeBudget(p, q, 21, BODY_BUDGET[q]).bodies).toBe(0); }
    expect(lifeBudget(PATIO_LIFE, 'medium', 1, 0).bodies).toBe(PATIO_LIFE.near.medium);
    expect(lifeBudget(PATIO_LIFE, 'medium', 1, BODY_BUDGET.medium - 1).bodies).toBe(1);
  });
  it('the draw calls a place may add stay a small share of the frame’s: five instanced calls at most and its bodies', () => {
    // the crowd: mid seated, mid standing, far seated, far standing, the round shadows (src/crowd/crowd.ts), and BODY_CALLS a full body
    for (const p of PLANS) for (const q of QS) expect(5 + p.near[q] * BODY_CALLS, `${p.id} ${q}`).toBeLessThanOrEqual(FRAME_CALLS[q] * 0.15);
  });
});

describe('the routine: arrive → walk → gather → interact → leave', () => {
  it('the same people, the same evening, every time it is run; another place gets other streams', () => {
    const shot = (plan: LifePlan) => { const r = new Routines(plan, 'high'); run(r, 90, 15); return r.people.map(p => `${p.phase}:${p.spot?.id}:${p.x.toFixed(3)}:${p.z.toFixed(3)}:${p.trail.join('')}`).join('|'); };
    expect(shot(TOY)).toBe(shot(TOY));
    expect(shot(TOY)).not.toBe(shot({ ...TOY, id: 'toy2' }));
    expect(hashOf('patio:p0')).not.toBe(hashOf('patio:p1'));
    const a = streamOf(7), b = streamOf(7); for (let i = 0; i < 20; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('fills one at a time up to the hour’s number, and never beyond it', () => {
    const r = new Routines(TOY, 'high');
    let most = 0, jumps = 0, last = 0;
    run(r, 6, 15, () => { if (r.live - last > 1) jumps++; last = r.live; most = Math.max(most, r.live); });
    expect(r.live).toBeGreaterThan(0); expect(r.live).toBeLessThan(TOY.capacity.high);                // a few seconds in: some, not all
    run(r, 200, 15, () => { if (r.live - last > 1) jumps++; last = r.live; most = Math.max(most, r.live); });
    expect(jumps).toBe(0);
    expect(most).toBeLessThanOrEqual(TOY.capacity.high);
    expect(most).toBeGreaterThanOrEqual(TOY.capacity.high - 2);
    for (const q of QS) { const x = new Routines(TOY, q); expect(x.people.length).toBe(TOY.capacity[q]); expect(x.target(15)).toBe(TOY.capacity[q]); expect(x.target(19)).toBe(Math.round(TOY.capacity[q] * 0.5)); expect(x.target(9)).toBe(0); }
  });
  it('every person goes through the phases in order, and only by the steps the routine allows', () => {
    const r = new Routines(TOY, 'high');
    const before = new Map<string, Phase>(r.people.map(p => [p.id, p.phase])), visits: string[] = [];
    const seen = new Set<Phase>();
    run(r, 420, 15, () => {
      for (const p of r.people) {
        const was = before.get(p.id)!;
        if (was !== p.phase) {
          expect(NEXT[was], `${was} → ${p.phase}`).toContain(p.phase);
          if (p.phase === 'off') visits.push(p.trail.join('>'));
          before.set(p.id, p.phase); seen.add(p.phase);
        }
        // standing phases stand still, walking ones move; a spot is held for as long as it is walked to or stood on
        if (p.phase === 'gather' || p.phase === 'interact') { expect(p.speed).toBe(0); expect(p.spot).not.toBeNull(); expect(r.holder(p.spot!.id)).toBe(p.id); expect(p.x).toBe(p.spot!.x); expect(p.z).toBe(p.spot!.z); }
        if (p.phase === 'gather') expect(p.doing).toBe('talk');
        if (p.phase === 'interact') { expect(p.doing).toBe(p.spot!.kind); expect(p.seated).toBe(p.spot!.kind === 'sit'); }
        if (p.phase === 'leave' || p.phase === 'off' || p.phase === 'arrive') expect(p.spot).toBeNull();
        if (p.phase !== 'interact') expect(p.seated).toBe(false);
      }
    });
    for (const ph of ['arrive', 'walk', 'gather', 'interact', 'leave', 'off'] as Phase[]) expect(seen.has(ph), ph).toBe(true);
    expect(visits.length).toBeGreaterThan(8);
    for (const v of visits) expect(v, v).toMatch(/^arrive>walk>(gather>walk>)?interact(>walk>interact)*>leave>off$|^arrive>(walk>gather>)?leave>off$/);
    // most visits are the whole routine: in, a word at the meeting point, something to do, out
    expect(visits.filter(v => v.startsWith('arrive>walk>gather>walk>interact')).length).toBeGreaterThan(visits.length * 0.6);
  });
  it('comes in and goes out by a way in, walks at a walking pace, and never jumps', () => {
    const r = new Routines(TOY, 'high'), at = new Map<string, { x: number; z: number; phase: Phase }>();
    run(r, 300, 15, () => {
      for (const p of r.people) {
        const was = at.get(p.id);
        if (p.phase === 'arrive') expect(TOY.entries.some(e => e.x === p.x && e.z === p.z)).toBe(true);
        if (was && was.phase !== 'off' && p.phase !== 'off') expect(Math.hypot(p.x - was.x, p.z - was.z)).toBeLessThanOrEqual(1.45 * 0.1 + 1e-6);
        if (was?.phase === 'leave' && p.phase === 'off') expect(TOY.entries.some(e => Math.hypot(e.x - was.x, e.z - was.z) < 0.2)).toBe(true);
        if (p.phase === 'walk' || p.phase === 'leave') expect(p.speed).toBeGreaterThanOrEqual(1.05);
        at.set(p.id, { x: p.x, z: p.z, phase: p.phase });
      }
    });
  });
  it('one person to a spot; a seat somebody else holds, or a spot the host refuses, is left alone; everything is given back', () => {
    const held = new Set<string>(), log: string[] = [];
    const host: Host = {
      claim: (s, who) => { if (s.id === 'd') return false; if (s.seat) { if (held.has(s.seat)) return false; held.add(s.seat); log.push(`+${who}`); } return true; },
      release: (s, who) => { if (s.seat) { expect(held.has(s.seat)).toBe(true); held.delete(s.seat); log.push(`-${who}`); } },
    };
    const r = new Routines(TOY, 'high', host);
    run(r, 400, 15, () => {
      const on = r.people.filter(p => p.spot).map(p => p.spot!.id);
      expect(new Set(on).size).toBe(on.length);
      expect(on).not.toContain('d');
      expect(held.size).toBe(r.people.filter(p => p.spot?.seat).length);
    });
    expect(log.some(l => l.startsWith('+'))).toBe(true);
    r.clear();
    expect(held.size).toBe(0); expect(r.live).toBe(0);
    for (const s of [...TOY.gathers, ...TOY.spots]) expect(r.holder(s.id)).toBeNull();
  });
  it('a spot with hours is used only in them (a roof’s dancers come out late)', () => {
    expect(spotOpen(TOY.spots[5], 22)).toBe(true); expect(spotOpen(TOY.spots[5], 15)).toBe(false); expect(spotOpen(TOY.spots[0], 15)).toBe(true);
    const day = new Routines(TOY, 'high'); let used = false;
    run(day, 300, 15, () => { if (day.holder('f')) used = true; });
    expect(used).toBe(false);
    const lounge = terraceLife(ROOFTOPS.almadies!, 'almadies'), dancers = lounge.spots.filter(s => s.kind === 'dance');
    expect(dancers.length).toBe(2); for (const d of dancers) { expect(spotOpen(d, 22)).toBe(true); expect(spotOpen(d, 18)).toBe(false); }
    expect(terraceLife(ROOFTOPS.plateau!, 'plateau').spots.some(s => s.kind === 'dance')).toBe(false);
  });
  it('walks the host’s way round what stands between', () => {
    const via = { x: 3, z: 9 }, r = new Routines(TOY, 'high', { route: (_a, b) => [via, b] });
    let through = false;
    run(r, 120, 15, () => { for (const p of r.people) if (Math.hypot(p.x - via.x, p.z - via.z) < 0.01) through = true; });
    expect(through).toBe(true);
  });
  it('when the hour’s number falls, the ones who have been there longest go home one at a time; at closing everybody has left', () => {
    const r = new Routines(TOY, 'high');
    run(r, 200, 15);
    const full = r.live; expect(full).toBeGreaterThanOrEqual(6);
    let last = r.counts().leave, burst = 0;
    run(r, 4, 19, () => { const l = r.counts().leave; if (l - last > 1) burst++; last = l; });
    expect(burst).toBe(0); expect(r.counts().leave).toBeGreaterThan(0);
    run(r, 240, 19);
    expect(r.live - r.counts().leave).toBeLessThanOrEqual(4);
    run(r, 240, 9);
    expect(r.live).toBe(0);
  });
  it('settles at once as the hour has it: the hour’s number already there, part of the way through what they do; empty when closed', () => {
    for (const q of QS) {
      const r = new Routines(TOY, q);
      r.settle(15);
      expect(r.live).toBe(TOY.capacity[q]);
      for (const p of r.people) { expect(['gather', 'interact']).toContain(p.phase); expect(p.x).toBe(p.spot!.x); expect(p.t).toBeGreaterThan(0); }
      r.settle(9);
      expect(r.live).toBe(0);
      for (const s of [...TOY.gathers, ...TOY.spots]) expect(r.holder(s.id)).toBeNull();
      r.settle(19);
      expect(r.live).toBe(Math.round(TOY.capacity[q] * 0.5));
    }
    // and then lives on: within a minute someone has changed phase and someone has walked
    const r = new Routines(TOY, 'medium'); r.settle(15);
    const was = r.people.map(p => `${p.phase}:${p.x}:${p.z}`);
    run(r, 60, 15);
    expect(r.people.filter((p, i) => `${p.phase}:${p.x}:${p.z}` !== was[i]).length).toBeGreaterThanOrEqual(2);
  });
});

describe('where people stand: never in the way', () => {
  it('no standing spot on a door, an anchor, a way in, the cast or another spot — Le Patio, the terraces, the beach', () => {
    expect(spotsInTheWay(PATIO_LIFE, PATIO_KEEP)).toEqual([]);
    expect(spotsInTheWay(NGOR_LIFE, NGOR_KEEP)).toEqual([]);
    for (const t of TERRACES) expect(spotsInTheWay(t, TERRACE_KEEP), t.id).toEqual([]);
    // the rule itself: a spot on a door, on a way in, on another spot is named
    const bad = { entries: [{ x: 0, z: 0 }], gathers: [spot('g', 'talk', 0.5, 0.5)], spots: [spot('a', 'stand', 10, 10), spot('b', 'stand', 10.3, 10), spot('c', 'sit', 0, 0, { seat: 's' })] };
    expect(spotsInTheWay(bad, [{ x: 10, z: 10.5, r: 1, why: 'door' }]).map(x => `${x.id}:${x.why}`).sort()).toEqual(['a:door', 'a:spot b', 'b:door', 'g:entry']);
    expect(CLEAR_SPOT).toBeGreaterThan(0.5);
  });
  it('Le Patio: inside the walls, off the walk from the gate to the floor, the middle of the floor left to the player, clear of every standing member of the cast', () => {
    const all = [...PATIO_LIFE.gathers, ...PATIO_LIFE.spots].filter(s => !s.seat);
    for (const s of all) {
      expect(Math.abs(s.x), s.id).toBeLessThan(HW - 0.6); expect(s.z, s.id).toBeGreaterThan(-ZB + 0.6); expect(s.z, s.id).toBeLessThan(ZF - 0.6);
      expect(s.x > PATIO_WALK.x0 && s.x < PATIO_WALK.x1 && s.z > PATIO_WALK.z0 && s.z < PATIO_WALK.z1, `${s.id} in the walk`).toBe(false);
      for (const c of CAST) if (c.spot) expect(Math.hypot(s.x - c.spot.x, s.z - c.spot.z), `${s.id} / ${c.id}`).toBeGreaterThan(0.9);
    }
    const dancers = PATIO_LIFE.spots.filter(s => s.kind === 'dance');
    expect(dancers.length).toBeGreaterThanOrEqual(8);
    for (const d of dancers) {
      expect(Math.abs(d.x - DANCE_FLOOR.x), d.id).toBeLessThanOrEqual(DANCE_FLOOR.w / 2); expect(Math.abs(d.z - DANCE_FLOOR.z), d.id).toBeLessThanOrEqual(DANCE_FLOOR.d / 2);
      expect(Math.hypot(d.x - DANCE_FLOOR.x, d.z - DANCE_FLOOR.z), d.id).toBeGreaterThanOrEqual(2.3);
    }
    // the ways in are in the gate's arch, and the seats are ones the cast does not hold
    for (const e of PATIO_LIFE.entries) { expect(Math.abs(e.x)).toBeLessThan(1.5); expect(e.z).toBeGreaterThanOrEqual(ZF); expect(e.z).toBeLessThan(ZF + 0.55); }
    const castSeats = new Set(CAST.map(c => c.seat).filter(Boolean));
    for (const s of PATIO_LIFE.spots.filter(x => x.seat)) expect(castSeats.has(s.seat), s.seat).toBe(false);
    expect(PATIO_LIFE.bpm).toBe(100);
  });
  it('the terraces: on the deck, never in the aisle from the bar to the stairs, the two tables by the bar left to the player', () => {
    for (const t of TERRACES) {
      for (const s of [...t.gathers, ...t.spots].filter(x => !x.seat)) {
        expect(Math.abs(s.x), s.id).toBeLessThan(7.6); expect(Math.abs(s.z), s.id).toBeLessThan(5.0);
        expect(s.x > TERRACE_AISLE.x0 - 0.3 && s.x < TERRACE_AISLE.x1 + 0.3 && s.z > TERRACE_AISLE.z0 && s.z < TERRACE_AISLE.z1, `${t.id} ${s.id} in the aisle`).toBe(false);
      }
      const seats = t.spots.filter(s => s.seat).map(s => s.seat!);
      expect(new Set(seats).size).toBe(seats.length);
      const lounge = t.id !== 'terrasse:plateau', per = lounge ? 5 : 2, total = 6 * per;
      const table = (id: string) => { const m = /:(chair|sofa|pouf):(\d+)$/.exec(id); return m ? Math.floor(+m[2] / per) : -1; };
      for (const s of seats) expect([3, 4], s).not.toContain(table(s));                              // tables 3 and 4 are the ones nearest the bar
      expect(seats.filter(s => table(s) >= 0).length).toBeLessThanOrEqual(Math.ceil(total * 0.6));
      expect(seats.filter(s => /:stool:/.test(s)).length).toBe(1);                                    // three stools of four stay free
      expect(t.entries).toEqual([{ x: 5, z: 5.3 }]);
    }
  });
  it('the beach: on its own ground, the sea-gazers at the water’s edge facing the sea, the seats ones the beach’s own figures do not hold', () => {
    for (const s of [...NGOR_LIFE.gathers, ...NGOR_LIFE.spots].filter(x => !x.seat)) {
      expect(s.x, s.id).toBeGreaterThan(NGOR_AREA.x0); expect(s.x, s.id).toBeLessThan(NGOR_AREA.x1); expect(s.z, s.id).toBeGreaterThan(NGOR_AREA.z0); expect(s.z, s.id).toBeLessThan(NGOR_AREA.z1);
      // not on the bar's deck, not on a sun bed
      const B = NGOR_BEACH.bar;
      expect(Math.abs(s.x - B.x) < B.w / 2 + 0.4 && Math.abs(s.z - B.z) < B.d / 2 + 0.4, `${s.id} on the bar`).toBe(false);
      for (const b of NGOR_BEACH.beds) expect(Math.abs(s.x - b.x) < 0.9 && Math.abs(s.z - b.z) < 1.5, `${s.id} on ${b.id}`).toBe(false);
    }
    const sea = NGOR_LIFE.spots.filter(s => s.kind === 'sea');
    expect(sea.length).toBeGreaterThanOrEqual(5);
    for (const s of sea) { expect(s.z).toBeLessThan(-159.5); expect(s.z).toBeGreaterThan(-163); expect(Math.cos(s.yaw)).toBeLessThan(-0.9); }   // on the wet sand, before the waterline, looking out
    const taken = ['bed:1', 'bed:4', 'bed:8', 'bed:10', 'bed:5', 'stool:1', 'stool:3', 'stool:4', 'wait:1', 'wait:2', 'look:0'].map(s => `almadies:ngor:${s}`);
    for (const s of NGOR_LIFE.spots.filter(x => x.seat)) expect(taken, s.seat).not.toContain(s.seat);
    expect(NGOR_LIFE.spots.filter(s => s.kind === 'stroll').length).toBeGreaterThanOrEqual(6);
  });
  it('a plan is placed in the world by its venue: every point moved, every facing turned, nothing else changed', () => {
    const at = (x: number, z: number) => ({ x: 100 - z, z: 50 + x }), w = placed(PATIO_LIFE, at, Math.PI / 2);
    expect(w.entries[0]).toEqual(at(PATIO_LIFE.entries[0].x, PATIO_LIFE.entries[0].z));
    w.spots.forEach((s, i) => { const o = PATIO_LIFE.spots[i]; expect({ x: s.x, z: s.z }).toEqual(at(o.x, o.z)); expect(s.yaw).toBeCloseTo(o.yaw + Math.PI / 2, 9); expect(s.id).toBe(o.id); expect(s.kind).toBe(o.kind); expect(s.seat).toBe(o.seat); });
    expect(w.capacity).toEqual(PATIO_LIFE.capacity); expect(PATIO_LIFE.spots[0].x).not.toBe(w.spots[0].x);
  });
  it('someone the player walks up to steps aside, and comes back', () => {
    expect(stepAside(1, 0, 5, 0)).toEqual({ x: 1, z: 0 });
    const a = stepAside(1, 0, 1.3, 0); expect(Math.hypot(a.x - 1.3, a.z)).toBeCloseTo(0.85, 6); expect(a.x).toBeLessThan(1);
    const b = stepAside(2, 2, 2, 2); expect(Math.hypot(b.x - 2, b.z - 2)).toBeCloseTo(0.85, 6);
  });
});
