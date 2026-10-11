import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DRAW, FETE, LIFT_H, OUTFLOW_WITHIN, OWN, SAND_FANS, TOUR_R, drawAt, entourageAt, liftSpot, loserAt, partyLength, partyPlan, sandFanAt, sideAngle, tourStart, winnerAt,
  type PartyKind, type PartyPlan,
} from '../src/arena/celebration';
import { cornerSides, type Fighter, type Who } from '../src/arena/ceremony';
import { SHOW, standSeats, fillOrder, type Quality } from '../src/arena/program';
import { PRELIM } from '../src/arena/undercard';
import { PEOPLE, PEOPLE_COUNT, celebratePath, polar } from '../src/arena/people';
import { prepCornerCentre } from '../src/world/arenaModules';
import { RING_R, TUNNEL_MOUTH_R, WALL_R } from '../src/world/geew';
import { fighterSpots } from '../src/arena/fighter';
import { ArenaStands, sideOf } from '../src/crowd/arenaStands';
import { REACTIONS } from '../src/crowd/reactions';

const C = { x: 30, z: -30 };
const BILL: { left: Fighter; right: Fighter } = { left: { id: 'babacar', name: 'Babacar', ecurie: 'Baobab' }, right: { id: 'lamine', name: 'Lamine', ecurie: 'Teranga' } };
const plan = (o: Partial<{ kind: PartyKind; winner: Who | null; outcome: string; day: number; quality: Quality; player: Who | null }> = {}): PartyPlan => {
  const q = o.quality ?? 'medium';
  return partyPlan({ kind: o.kind ?? 'main', winner: o.winner === undefined ? 'left' : o.winner, outcome: o.outcome ?? 'projection', hub: 'pikine', day: o.day ?? 12, quality: q, bill: BILL, corners: cornerSides(BILL), entourage: PEOPLE_COUNT[q].entourage, player: o.player ?? null });
};
const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const r = (p: { x: number; z: number }) => d(p, C);
const FROM: Record<Who, { x: number; z: number }> = { left: { x: C.x + 1.2, z: C.z + 0.4 }, right: { x: C.x - 0.6, z: C.z - 0.9 } };

describe('la fête après la chute: the plan', () => {
  it('the same evening and result give the same fête on every device; other evenings vary', () => {
    expect(plan()).toEqual(plan());
    const texts = new Set<string>(), dirs = new Set<number>();
    for (let day = 1; day <= 30; day++) { const p = plan({ day }); dirs.add(p.dir); for (const c of p.cues) if (c.kind === 'griot') texts.add(c.text!); }
    expect(dirs.size).toBe(2);                                                 // round the ring one way or the other
    expect(texts.size).toBeGreaterThan(3);
  });

  it('a win: about a minute of fête, then the crowd leaves; the street\'s outflow within 90 s of the result', () => {
    for (const kind of ['main', 'own', 'prelim'] as const) for (const winner of ['left', 'right', null] as const) for (const quality of ['low', 'medium', 'high'] as const) {
      const p = plan({ kind, winner, quality, player: 'left' }), len = partyLength(p, SHOW.leaving);
      expect(len + SHOW.leaving).toBeLessThanOrEqual(OUTFLOW_WITHIN);
      for (const c of p.cues) { expect(c.t).toBeGreaterThanOrEqual(0); expect(c.t).toBeLessThanOrEqual(len); }
      // the drums always come back to the evening's rhythm before the end
      const drums = p.cues.filter(c => c.kind === 'drums');
      if (drums.length) expect(drums.at(-1)!.rhythm).toBe('gala');
      if (p.loud) { expect(p.loud[0]).toBeGreaterThan(0); expect(p.loud[1]).toBeLessThan(len); }
    }
    const win = plan(), draw = plan({ winner: null, outcome: 'egalite' });
    expect(win.length).toBeGreaterThanOrEqual(50);
    expect(win.length + SHOW.leaving).toBeGreaterThanOrEqual(60);
    expect(draw.length).toBe(DRAW.end);
    expect(draw.length).toBeLessThan(win.length);
    expect(plan({ kind: 'prelim' }).length).toBe(PRELIM.result);              // a preliminary keeps its few seconds
    expect(plan({ kind: 'own' }).length).toBe(OWN.end);
    // the parts follow each other
    const parts = [FETE.toLift, FETE.rise, FETE.out, FETE.tour, FETE.salute, FETE.lower, FETE.corner];
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toBeCloseTo(parts[i - 1][1], 9);
    expect(FETE.corner[1]).toBeLessThan(FETE.end);
  });

  it('the winner\'s section dances and waves, the losing side sits down quietly, the ends applaud; the announcer and the griot speak', () => {
    const p = plan({ winner: 'right' });
    const stands = p.cues.filter(c => c.kind === 'stands');
    expect(stands.some(c => c.group === 'right' && c.reaction === 'dance' && (c.seconds ?? 0) >= 20)).toBe(true);
    expect(stands.some(c => c.group === 'left' && c.reaction === 'slump')).toBe(true);
    expect(stands.some(c => c.group === 'ends' && c.reaction === 'applause')).toBe(true);
    expect(stands.some(c => c.group === 'left' && (c.reaction === 'dance' || c.reaction === 'celebrate'))).toBe(false);
    const said = p.cues.filter(c => c.text).map(c => c.text!).join(' | ');
    expect(said).toMatch(/L’annonceur : Victoire de Lamine/);
    expect(said).toMatch(/Le griot/);
    expect(said).toMatch(/Lamine salue ses supporters/);
    expect(p.cues.some(c => c.kind === 'drums' && c.rhythm === 'bakk')).toBe(true);
    // a draw: no drums, no dancing, a calmer applause shared by everyone
    const draw = plan({ winner: null, outcome: 'egalite' });
    expect(draw.cues.every(c => c.kind !== 'stands' || (c.group === 'all' && c.reaction === 'applause'))).toBe(true);
    expect(draw.loud).toBeNull();
    expect(draw.cues.some(c => /Match nul/.test(c.text ?? ''))).toBe(true);
    // the player's own bout: their side dances when they win, sits down when they lose
    const won = plan({ kind: 'own', winner: 'left', player: 'left' }), lost = plan({ kind: 'own', winner: 'right', player: 'left' });
    expect(won.cues.some(c => c.group === 'left' && c.reaction === 'dance')).toBe(true);
    expect(lost.cues.some(c => c.group === 'left' && c.reaction === 'slump')).toBe(true);
    expect(won.cues.some(c => /Ton nom/.test(c.text ?? ''))).toBe(true);
    // the new reactions: dancing on the beat with the arms up (flags go up), the slump outranks everything
    expect(REACTIONS.dance.stand && REACTIONS.dance.up.pitch >= 1.7 && REACTIONS.dance.up.bounce > 0).toBe(true);
    expect(REACTIONS.slump.stand).toBe(false);
    for (const k of Object.keys(REACTIONS) as (keyof typeof REACTIONS)[]) if (k !== 'slump') expect(REACTIONS.slump.rank).toBeGreaterThan(REACTIONS[k].rank);
  });
});

describe('la fête après la chute: where everyone is', () => {
  const sample = (f: (t: number) => { x: number; z: number; y?: number }, t0: number, t1: number, step = 0.05) => {
    let last = f(t0), jump = 0;
    for (let t = t0 + step; t <= t1; t += step) { const p = f(t); jump = Math.max(jump, d(p, last) + Math.abs((p.y ?? 0) - (last.y ?? 0))); last = p; }
    return jump;
  };
  for (const who of ['left', 'right'] as const) it(`the ${who} winner is lifted, carried once round the ring inside the sandbags, salutes his section, goes to his corner`, () => {
    const p = plan({ winner: who });
    expect(p.lift).toBe(true);
    // smooth all along (no jump between two frames of 50 ms)
    expect(sample(t => winnerAt(p, t, C.x, C.z, FROM[who]), FETE.toLift[0], FETE.end)).toBeLessThan(0.25);
    expect(winnerAt(p, FETE.rise[1] + 0.01, C.x, C.z, FROM[who]).y).toBeCloseTo(LIFT_H, 5);
    let swept = 0, prev = sideAngle(who);
    for (let t = FETE.tour[0]; t <= FETE.tour[1]; t += 0.1) {
      const w = winnerAt(p, t, C.x, C.z, FROM[who]);
      expect(r(w)).toBeCloseTo(TOUR_R, 5);
      expect(r(w)).toBeLessThan(RING_R - 1);
      expect(w.y).toBeCloseTo(LIFT_H, 5);
      const a = Math.atan2(w.x - C.x, w.z - C.z), da = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
      swept += da; prev = a;
    }
    expect(Math.abs(swept)).toBeGreaterThan(2 * Math.PI - 0.05);              // a full tour
    expect(Math.sign(swept)).toBe(p.dir);
    // the tour at a walking pace
    expect((2 * Math.PI * TOUR_R) / (FETE.tour[1] - FETE.tour[0])).toBeLessThan(1.8);
    // the salute: at the edge of the ring on his side, facing his section
    const s = winnerAt(p, (FETE.salute[0] + FETE.salute[1]) / 2, C.x, C.z, FROM[who]);
    expect(d(s, tourStart(C.x, C.z, who))).toBeLessThan(1e-9);
    expect(s.yaw).toBeCloseTo(sideAngle(who), 9);
    expect(sideOf(sideAngle(who) < 0 ? sideAngle(who) + 2 * Math.PI : sideAngle(who))).toBe(who);   // the side's sections
    // down again, then in his corner
    expect(winnerAt(p, FETE.lower[1] + 0.01, C.x, C.z, FROM[who]).y).toBe(0);
    const end = winnerAt(p, FETE.end, C.x, C.z, FROM[who]), corner = prepCornerCentre(C.x, C.z, cornerSides(BILL)[who]);
    expect(d(end, corner)).toBeLessThan(1e-6);
    // the loser is back in his corner well before
    const lose: Who = who === 'left' ? 'right' : 'left';
    expect(d(loserAt(p, 20, C.x, C.z, FROM[lose]), prepCornerCentre(C.x, C.z, cornerSides(BILL)[lose]))).toBeLessThan(1e-6);
  });

  it('two of his people carry him (under him all along), the others follow his track; on a phone he walks his tour, arms up', () => {
    const p = plan({ winner: 'left' }), from = FROM.left;
    const start = (k: number) => celebratePath(C.x, C.z, cornerSides(BILL).left, k).at(-1)!;
    for (const carry of [0, 1] as const) {
      expect(entourageAt(p, FETE.run - 0.1, C.x, C.z, from, start(carry), { carry })).toBeNull();     // their run is people.ts's
      for (let t = FETE.toLift[1]; t < FETE.lower[0]; t += 0.25) {
        const c = entourageAt(p, t, C.x, C.z, from, start(carry), { carry })!, w = winnerAt(p, t, C.x, C.z, from);
        expect(d(c, w)).toBeLessThan(0.4);
      }
      expect(sample(t => entourageAt(p, t, C.x, C.z, from, start(carry), { carry })!, FETE.run, FETE.end)).toBeLessThan(0.3);
    }
    const lag = { lag: 1.5, side: 0.5 };
    expect(sample(t => entourageAt(p, t, C.x, C.z, from, start(2), lag)!, FETE.run, FETE.end)).toBeLessThan(0.3);
    for (let t = FETE.tour[0] + 3; t < FETE.tour[1]; t += 0.5) expect(d(entourageAt(p, t, C.x, C.z, from, start(2), lag)!, winnerAt(p, t, C.x, C.z, from))).toBeLessThan(3.5);
    // low quality: one of his people only, no lift, the same tour on foot
    const low = plan({ quality: 'low' });
    expect(low.lift).toBe(false);
    expect(winnerAt(low, 20, C.x, C.z, from).y).toBe(0);
    expect(winnerAt(low, 20, C.x, C.z, from).clip).toBe('walk');
    expect(low.fans).toBe(SAND_FANS.low);
  });

  it('a draw: they meet in the middle, shake hands face to face, and go back to their corners', () => {
    const p = plan({ winner: null, outcome: 'egalite' });
    const l = drawAt(p, 8, C.x, C.z, 'left', FROM.left), rr = drawAt(p, 8, C.x, C.z, 'right', FROM.right);
    expect(l.clip).toBe('Talk'); expect(rr.clip).toBe('Talk');
    expect(d(l, rr)).toBeLessThan(1);
    expect(Math.abs(Math.atan2(Math.sin(l.yaw - rr.yaw), Math.cos(l.yaw - rr.yaw)))).toBeCloseTo(Math.PI, 5);
    for (const who of ['left', 'right'] as const) expect(d(drawAt(p, DRAW.end, C.x, C.z, who, FROM[who]), prepCornerCentre(C.x, C.z, cornerSides(BILL)[who]))).toBeLessThan(1e-6);
  });

  it('his supporters pour down from their stands, dance inside his tour, off the judges, and are all back up before the end', () => {
    const judges = PEOPLE.judges.angles.map(a => polar(C.x, C.z, a, PEOPLE.judges.r));
    for (const who of ['left', 'right'] as const) for (const q of ['low', 'medium', 'high'] as const) {
      const p = plan({ winner: who, quality: q });
      expect(p.fans).toBe(SAND_FANS[q]);
      let danced = 0;
      for (let k = 0; k < p.fans; k++) {
        let wasOn = false;
        for (let t = 0; t <= p.length; t += 0.1) {
          const f = sandFanAt(p, t, C.x, C.z, k);
          if (!f.on) continue;
          if (!wasOn) expect(r(f)).toBeGreaterThan(16);                        // down from the walkway in front of the stands
          wasOn = true;
          for (const j of judges) expect(d(f, j)).toBeGreaterThan(1.0);
          const a = Math.atan2(f.x - C.x, f.z - C.z), off = Math.abs(Math.atan2(Math.sin(a - sideAngle(who)), Math.cos(a - sideAngle(who))));
          expect(off).toBeLessThan(0.7);                                       // on their side
          if (f.dance) { danced++; expect(r(f)).toBeLessThan(TOUR_R - 1); }
          expect(fighterSpots(C.x, C.z, 'baobab').inTunnel(f.x, f.z)).toBe(false);
        }
        expect(sandFanAt(p, p.length, C.x, C.z, k).on).toBe(false);
      }
      expect(danced).toBeGreaterThan(0);
      // nobody on the sand for a draw, the player's own bout or a preliminary
      for (const other of [plan({ winner: null, outcome: 'egalite', quality: q }), plan({ kind: 'own', quality: q }), plan({ kind: 'prelim', quality: q })])
        for (let k = 0; k < SAND_FANS.high; k++) expect(sandFanAt(other, 10, C.x, C.z, k).on).toBe(false);
    }
  });

  it('the wrestlers\' tunnel stays free: nobody of the fête goes into it (a fighter of tonight leaves that way)', () => {
    const tunnel = fighterSpots(C.x, C.z, 'baobab').inTunnel;
    for (const who of ['left', 'right'] as const) {
      const p = plan({ winner: who });
      for (let t = 0; t <= p.length; t += 0.25) {
        expect(tunnel(winnerAt(p, t, C.x, C.z, FROM[who]).x, winnerAt(p, t, C.x, C.z, FROM[who]).z)).toBe(false);
        const l = loserAt(p, t, C.x, C.z, FROM[who === 'left' ? 'right' : 'left']); expect(tunnel(l.x, l.z)).toBe(false);
      }
    }
    expect(TUNNEL_MOUTH_R).toBeLessThan(WALL_R);
    expect(liftSpot(C.x, C.z, 'left').x).toBeGreaterThan(C.x);
  });
});

describe('la fête après la chute: the stands', () => {
  it('the supporters on the sand are the crowd\'s own figures: no new draw call at rest, none past the peak\'s', () => {
    const seats = standSeats(C.x, C.z, 'fete:stand'), order = fillOrder(seats.length, 7).map(i => seats[i]);
    const s = new ArenaStands(order, 0, { quality: 'medium' });
    s.fill(order.length, () => false);
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    cam.position.set(C.x, 9, C.z - 26); cam.lookAt(C.x, 1, C.z); cam.updateMatrixWorld();
    s.cull(cam); s.update(0.3, true);
    const rest = s.crowd.drawCalls();
    expect(rest).toBeLessThanOrEqual(2);
    expect(s.present).toBe(order.length);                                       // the supporters on the sand are not seats
    // the result: the winner's side celebrates, the losing side sits down; then the fête
    const p = plan({ winner: 'left' });
    s.moment('result', { winner: 'left' });
    let peak = 0;
    for (let t = 0; t < 14; t += 0.25) {
      for (const c of p.cues) if (c.kind === 'stands' && c.t > t - 0.25 && c.t <= t) s.react(c.group!, c.reaction!, { share: c.share, seconds: c.seconds });
      s.party(p, t); s.update(0.25, true); peak = Math.max(peak, s.crowd.drawCalls());
    }
    expect(s.sandNow()).toBe(SAND_FANS.medium);
    const st = s.stats();
    expect((st.kinds.dance ?? 0)).toBeGreaterThan(20);
    expect(st.kinds.slump ?? 0).toBeGreaterThan(20);
    for (const o of order) if (sideOf(o.a) === 'right' && s.crowd.reactionOf(o.id) === 'slump') expect(s.crowd.standingNow(o.id)).toBe(false);
    expect(peak).toBeLessThanOrEqual(5);                                          // seated + standing, near and far, flags: as before
    // after the fête: nobody on the sand, the counts as before
    s.party(p, p.length); s.update(0.25, true);
    expect(s.sandNow()).toBe(0);
    s.party(null, 0);
    expect(s.present).toBe(order.length);
    s.dispose();
  });
});
