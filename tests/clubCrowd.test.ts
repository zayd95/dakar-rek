import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import {
  BAR_SPOTS, CLEAR_R, DROP_EVERY, PLAYER_ROOM, QUEUE_EVERY, RAIL_SPOTS, RING, TABLE_SPOTS, VAGUE, VAGUE_BPM, VAGUE_CROWD, contestOn, dropAt, floorCount,
  floorSpots, queueAt, queuePool, queueSpot, ringPlan, ringRows, ringSpots, soloAt, standCount, type ClubMoment, type Spot,
} from '../src/crowd/clubPlan';
import { VagueCrowd, type ClubFrame, type ClubNow } from '../src/crowd/clubCrowd';
import { nightLook } from '../src/crowd/looks';
import { REACTIONS, dancePose, poseFor } from '../src/crowd/reactions';
import { clubCrowd } from '../src/activity/templates';

stubCanvas();
const F = VAGUE.floor;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** La Vague's frame as VenueKit makes it (src/venues/kit.ts): origin and yaw of the local +z. */
function frame(ox: number, oz: number, yaw: number): ClubFrame {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { yaw, w: (x, z) => ({ x: ox + x * c + z * s, z: oz - x * s + z * c }), local: (x, z) => { const dx = x - ox, dz = z - oz; return { x: dx * c - dz * s, z: dx * s + dz * c }; } };
}
/** From src/venues/club.ts: the bar's stools, the lounge's bench places, the waiter's spot, the other high table's talkers. */
const STOOLS = [-4.2, -2.6, -1.0, 0.6, 2.2].map(z => ({ x: 8.5, z }));
const BENCH_SEATS = [-5, -1, 3].flatMap(z => [{ x: -11.1, z: z - 0.8 }, { x: -11.1, z: z + 0.8 }]);
const WAITER_HOME = { x: -7.6, z: 6.4 };
const TALKERS = [{ x: 4.0, z: -3.0 }, { x: 5.2, z: -3.0 }];
const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};

describe('La Vague: the plan of a night (pure)', () => {
  it('20 / 40 / 60 on the floor by quality, the nearest 0 / 3 / 4 as full humanoids; the curve of the night', () => {
    expect([VAGUE_CROWD.low.floor, VAGUE_CROWD.medium.floor, VAGUE_CROWD.high.floor]).toEqual([20, 40, 60]);
    expect([VAGUE_CROWD.low.near, VAGUE_CROWD.medium.near, VAGUE_CROWD.high.near]).toEqual([0, 3, 4]);
    for (const q of ['low', 'medium', 'high'] as const) {
      const n = VAGUE_CROWD[q].floor, f = (m: ClubMoment) => floorCount(m, n), s = (m: ClubMoment) => standCount(m, 6);
      expect(f('closed')).toBe(0);
      expect(f('early')).toBeGreaterThan(0);
      expect(f('early')).toBeLessThan(f('warm'));
      expect(f('warm')).toBeLessThan(f('peak'));
      expect(f('dawn')).toBeLessThan(f('peak'));
      expect(f('peak')).toBe(n);
      expect(s('closed')).toBe(0);
      expect(s('early')).toBeLessThanOrEqual(s('warm'));
      expect(s('warm')).toBeLessThanOrEqual(s('peak'));
    }
    // the hours of src/activity/templates.ts: empty by day, the peak after midnight, thinning at dawn
    expect([13, 21.5, 23.5, 1, 4.2].map(clubCrowd)).toEqual(['closed', 'early', 'warm', 'peak', 'dawn']);
  });

  it('the dancers\' places: the same for a night, another mix the next; on the floor, the middle clear, never on each other', () => {
    for (const n of [20, 40, 60]) for (const night of [1, 2, 7, 30]) {
      const s = floorSpots(n, night);
      expect(s).toEqual(floorSpots(n, night));
      expect(s).toHaveLength(n);
      for (const p of s) {
        expect(Math.abs(p.x - F.x)).toBeLessThan(F.w / 2 - 0.15);
        expect(Math.abs(p.z - F.z)).toBeLessThan(F.d / 2 - 0.15);
        expect(dist(p, F)).toBeGreaterThanOrEqual(CLEAR_R);                // the player's « Danser » spot
      }
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(dist(s[i], s[j])).toBeGreaterThan(0.42);
      // a thin night gathers in the middle: the first places are nearer than the last
      const d = s.map(p => dist(p, F));
      expect(d.slice(0, 5).reduce((a, b) => a + b, 0)).toBeLessThan(d.slice(-5).reduce((a, b) => a + b, 0));
      // most face the booth
      const facing = s.filter(p => { const a = Math.atan2(VAGUE.booth.x - p.x, VAGUE.booth.z - p.z); return Math.cos(p.yaw - a) > 0.7; }).length;
      expect(facing).toBeGreaterThan(n * 0.5);
    }
    expect(floorSpots(40, 1)).not.toEqual(floorSpots(40, 2));
  });

  it('the ring round the contest: everyone on the floor takes one place of it, the inner row first, no two on one', () => {
    const rows = ringRows(), ring = ringSpots();
    expect(rows[0]).toHaveLength(RING.nInner);
    expect(ring.length).toBeGreaterThanOrEqual(VAGUE_CROWD.high.floor);
    for (let i = 0; i < ring.length; i++) {
      expect(dist(ring[i], F)).toBeGreaterThanOrEqual(2.0 - 1e-9);
      expect(Math.abs(ring[i].x - F.x)).toBeLessThanOrEqual(F.w / 2 - 0.2);
      expect(Math.cos(ring[i].yaw - Math.atan2(F.x - ring[i].x, F.z - ring[i].z))).toBeCloseTo(1, 6);   // facing the middle
      for (let j = i + 1; j < ring.length; j++) expect(dist(ring[i], ring[j])).toBeGreaterThan(0.6);
      for (const r of RAIL_SPOTS) expect(dist(ring[i], r)).toBeGreaterThan(0.75);
    }
    for (const n of [20, 40, 60]) for (const night of [1, 2, 3, 4, 5, 6, 7]) {
      const s = floorSpots(n, night), plan = ringPlan(s), used = [...plan.values()];
      expect(new Set(used).size).toBe(used.length);
      expect(plan.size).toBe(n);                                            // nobody is left standing inside the ring
      expect(used.filter(j => j < RING.nInner).length).toBe(Math.min(n, RING.nInner));
    }
  });

  it('the contest from 23 h on the sabar night only; the soloists in turn, the same for everyone', () => {
    expect(contestOn(true, 22.9)).toBe(false);
    expect(contestOn(true, 23.1)).toBe(true);
    expect(contestOn(true, 2)).toBe(true);
    expect(contestOn(false, 23.5)).toBe(false);
    const seen = new Set<number>();
    let none = 0;
    for (let h = 23; h < 29; h += 0.05) {
      const k = soloAt(5, h % 24);
      expect(k).toBe(soloAt(5, h % 24));
      if (k < 0) none++; else { expect(k).toBeLessThan(RING.nInner); seen.add(k); }
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(none).toBeGreaterThan(20);                                      // a quarter of an hour with nobody in the middle, in turn
  });

  it('the DJ\'s drops: from 21 h to 5 h, three windows in four, the same for everyone that night', () => {
    expect(dropAt(3, 13)).toBe(-1);
    for (const night of [1, 2, 3, 4]) {
      const heard: number[] = [];
      let last = -1;
      for (let h = 21; h < 29.2; h += 0.01) { const k = dropAt(night, h % 24); expect(k).toBe(dropAt(night, h % 24)); if (k >= 0 && k !== last) heard.push(k); if (k >= 0) last = k; }
      expect(new Set(heard).size).toBe(heard.length);
      expect(heard.length).toBeGreaterThanOrEqual(4);
      expect(heard.length).toBeLessThanOrEqual(Math.ceil(8 / DROP_EVERY));
    }
    // not the same night after night
    const at = (night: number) => Array.from({ length: 800 }, (_, i) => dropAt(night, (21 + i * 0.01) % 24)).join();
    expect(at(1)).not.toBe(at(2));
  });

  it('standing at the bar, the lounge\'s edge and the high table: clear of the stools, the benches, the waiter\'s way and the talkers', () => {
    for (const b of BAR_SPOTS) for (const s of STOOLS) expect(dist(b, s)).toBeGreaterThan(0.85);
    for (const r of RAIL_SPOTS) {
      expect(r.x).toBeLessThan(F.x - F.w / 2);                              // off the floor
      for (const s of BENCH_SEATS) {
        expect(dist(r, s)).toBeGreaterThan(2.5);
        expect(segDist(r, WAITER_HOME, { x: -9.0, z: s.z })).toBeGreaterThanOrEqual(0.75);   // the waiter brings a drink to that place
      }
      for (const n of [20, 40, 60]) for (const p of floorSpots(n, 3)) expect(dist(r, p)).toBeGreaterThan(0.75);
    }
    for (const t of TABLE_SPOTS) { expect(dist(t, { x: 4.6, z: 1.5 })).toBeGreaterThan(0.55); for (const o of TALKERS) expect(dist(t, o)).toBeGreaterThan(3); }
    const all: Spot[] = [...BAR_SPOTS, ...RAIL_SPOTS, ...TABLE_SPOTS];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(dist(all[i], all[j])).toBeGreaterThan(0.6);
  });

  it('the queue at the gate: people from the taxi walk to its tail, move up, go in past the rope; never two on one figure, never through the fence', () => {
    const from = { x: -12, z: 19.7 };                                      // the Ngor rank's drop, in the club's frame (Almadies)
    for (const q of [3, 5, 7]) {
      const last = new Map<number, { x: number; z: number }>();
      let most = 0;
      for (let t = 0; t < 200; t += 0.1) {
        const now = queueAt(t, q, from);
        expect(now).toEqual(queueAt(t, q, from));
        expect(new Set(now.map(o => o.k)).size).toBe(now.length);
        expect(now.length).toBeLessThanOrEqual(queuePool(q));
        most = Math.max(most, now.filter(o => o.speed === 0).length);
        for (const o of now) {
          expect(o.k).toBeGreaterThanOrEqual(0); expect(o.k).toBeLessThan(queuePool(q));
          // outside the fence (local z 9) but through the gate's opening
          if (o.z < VAGUE.gate.z + 0.3 && o.z > VAGUE.gate.z - 0.3) expect(Math.abs(o.x)).toBeLessThan(1.25);
          const was = last.get(o.k);
          if (was) expect(dist(was, o)).toBeLessThan(0.25);                // nobody jumps: a figure is never taken by two people
        }
        last.clear(); for (const o of now) last.set(o.k, o);
      }
      expect(most).toBe(q);                                                // the queue's places are all taken at the peak
    }
    // its places along the fence, outside, left of the rope, a step apart
    for (let j = 0; j < 7; j++) { const s = queueSpot(j); expect(s.z).toBeGreaterThan(VAGUE.gate.z + 1); expect(s.x).toBeLessThan(-1.5); if (j) expect(dist(s, queueSpot(j - 1))).toBeCloseTo(0.75, 6); }
    // someone goes in every QUEUE_EVERY seconds
    const ins = (t: number) => queueAt(t, 5, from).filter(o => o.z < VAGUE.gate.z).length;
    let entering = 0; for (let t = 0; t < QUEUE_EVERY * 10; t += 0.5) if (ins(t) > 0) entering++;
    expect(entering).toBeGreaterThan(5);
  });

  it('the walk from the Ngor taxi rank to the queue is clear of the street\'s solids', async () => {
    const { buildHub } = await import('../src/world/builder');
    const { taxiRank, taxiDrop } = await import('../src/transport/taxi');
    const hub = buildHub('almadies', true), drop = taxiDrop(taxiRank(hub).spot);
    const site = { x: -36, z: -144 }, fr = frame(site.x, site.z, 0), from = fr.local(drop.x, drop.z);   // src/venues/club.ts CLUB_SITE
    expect(dist(drop, fr.w(0, VAGUE.gate.z))).toBeLessThan(25);            // the rank is by La Vague
    const near = hub.colliders.filter(c => c.x1 > site.x - 30 && c.x0 < site.x + 30 && c.z1 > site.z - 5 && c.z0 < site.z + 40);
    let hit: string | null = null, samples = 0;
    for (let t = 0; t < 120; t += 0.25) for (const o of queueAt(t, VAGUE_CROWD.high.queue, from)) {
      if (o.z < VAGUE.gate.z + 0.3) continue;                              // through the gate (the club's own solids are checked above)
      const p = fr.w(o.x, o.z); samples++;
      for (const c of near) if (p.x > c.x0 - 0.2 && p.x < c.x1 + 0.2 && p.z > c.z0 - 0.2 && p.z < c.z1 + 0.2) hit ??= `${p.x.toFixed(1)},${p.z.toFixed(1)} in ${JSON.stringify(c)}`;
    }
    expect(samples).toBeGreaterThan(500);
    expect(hit).toBeNull();
  });

  it('night looks: the same person all night, another outfit the next; dresses, fitted boubous, shirts, wax and a few caps', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `vague:floor:${i}`);
    expect(ids.map(id => nightLook(id, 3))).toEqual(ids.map(id => nightLook(id, 3)));
    const changed = ids.filter(id => JSON.stringify(nightLook(id, 3)) !== JSON.stringify(nightLook(id, 4))).length;
    expect(changed).toBeGreaterThan(380);
    const looks = ids.map(id => nightLook(id, 3)), share = (f: (l: ReturnType<typeof nightLook>) => boolean) => looks.filter(f).length / looks.length;
    expect(share(l => l.style === 'dress')).toBeGreaterThan(0.28); expect(share(l => l.style === 'dress')).toBeLessThan(0.48);
    expect(share(l => l.style === 'boubou')).toBeGreaterThan(0.1); expect(share(l => l.style === 'boubou')).toBeLessThan(0.28);
    expect(share(l => l.style === 'tee')).toBeGreaterThan(0.3);
    expect(share(l => !!l.print && l.print <= 3)).toBeGreaterThan(0.1);    // wax
    expect(share(l => l.head === 'cap')).toBeGreaterThan(0.02); expect(share(l => l.head === 'cap')).toBeLessThan(0.12);
    expect(share(l => l.head === 'wrap')).toBeLessThan(0.2);               // a headwrap now and then, never on everyone
    expect(share(l => l.style === 'jersey')).toBeLessThan(0.05);
  });

  it('dancing harder after a drop keeps to the club\'s tempo', () => {
    const p = poseFor('dance', true, 0, 'dance', VAGUE_BPM);
    expect(p.freq).toBeCloseTo((Math.PI * VAGUE_BPM) / 60, 6);
    expect(p.freq).toBeCloseTo(dancePose(VAGUE_BPM).freq, 6);
    expect(p.pitch).toBe(REACTIONS.dance.up.pitch);                        // arms higher than the plain dance
    expect(poseFor('dance', true, 0, 'rest', VAGUE_BPM)).toEqual(REACTIONS.dance.up);   // the arena's fête keeps its own
  });
});

describe('La Vague: the crowd at work', () => {
  const site = { x: -36, z: -144 };
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 400);
  const setup = (yaw = 0, quality: 'low' | 'medium' | 'high' = 'high') => {
    const fr = frame(site.x, site.z, yaw), parent = new THREE.Group(), vc = new VagueCrowd(fr, quality, parent);
    const c = fr.w(0, 12); cam.position.set(c.x, 6, c.z); const f = fr.w(F.x, F.z); cam.lookAt(f.x, 0, f.z); cam.updateMatrixWorld();
    const now = (o: Partial<ClubNow> = {}): ClubNow => ({ night: 3, hour: 1, moment: 'peak', open: true, contest: false, t: 0, from: { x: -12, z: 19.7 }, players: [], me: null, camera: cam, visible: true, ...o });
    const run = (seconds: number, o: Partial<ClubNow> = {}, dt = 0.1, t0 = 0) => { let drops = 0; for (let t = 0; t < seconds; t += dt) if (vc.update(dt, now({ t: t0 + t, ...o })) === 'drop') drops++; return drops; };
    return { fr, parent, vc, now, run };
  };
  type Inner = { who: { id: string; kind: string; i: number; on: boolean; sx: number; sz: number }[] };

  it('by the hour: nobody by day (nothing drawn), the floor full at the peak with the bar, the edge, the table and the queue', () => {
    const { vc, run } = setup();
    run(0.5, { hour: 13, moment: 'closed', open: false, visible: false });
    expect(vc.present()).toBe(0);
    expect(vc.info(null).drawCalls).toBe(0);
    const counts: Record<string, number> = {};
    for (const [m, h] of [['early', 21.5], ['warm', 23.5], ['peak', 1], ['dawn', 4.2]] as const) { run(0.5, { hour: h, moment: m }); counts[m] = vc.present(); }
    expect(counts.early).toBeLessThan(counts.warm); expect(counts.warm).toBeLessThan(counts.peak); expect(counts.dawn).toBeLessThan(counts.peak);
    run(20, { hour: 1, moment: 'peak' });
    const i = vc.info(null);
    expect(i.floor).toBe(60); expect(i.stand).toBe(11); expect(i.queue).toBeGreaterThanOrEqual(VAGUE_CROWD.high.queue);
    expect(i.drawn.floor).toBe(60);
    vc.dispose();
  });

  it('draw calls: one or two batches for the whole room (no player near), the few full bodies only round the player', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const { vc, fr, run } = setup(0, q);
      run(1);
      const rest = vc.info(null);
      expect(rest.drawCalls).toBeGreaterThan(0);
      expect(rest.drawCalls).toBeLessThanOrEqual(q === 'low' ? 2 : 3);       // standing figures (mid, far) + their shadows
      const me = fr.w(F.x + 1.5, F.z + 1.5);
      run(1.2, { me, players: [me] });
      const near = vc.info(me);
      expect(near.near).toBeLessThanOrEqual(VAGUE_CROWD[q].near);
      expect(near.drawCalls).toBeLessThanOrEqual(rest.drawCalls + 10 * VAGUE_CROWD[q].near);
      // before: 4 / 7 / 10 cast dancers as full humanoids (10 calls each by the same count)
      expect(near.drawCalls).toBeLessThan(10 * { low: 4, medium: 7, high: 10 }[q]);
      vc.dispose();
    }
  });

  it('never on a player: dancers step aside for the player and a friend, even standing on their places, also with the club turned', () => {
    for (const yaw of [0, 0.7]) {
      const { vc, fr, run } = setup(yaw);
      const homes = floorSpots(60, 3);
      const me = fr.w(homes[0].x, homes[0].z), friend = fr.w(homes[5].x + 0.1, homes[5].z), gate = fr.w(queueSpot(1).x, queueSpot(1).z);
      run(25, { me, players: [me, friend, gate] });
      const i = vc.info(me);
      expect(i.minToPlayer!).toBeGreaterThanOrEqual(PLAYER_ROOM - 0.06);
      expect(i.minToPlayers!).toBeGreaterThanOrEqual(PLAYER_ROOM - 0.06);
      expect(i.drawn.floor).toBeGreaterThanOrEqual(57);                     // they step aside, not away
      // a player walking across the floor
      for (let s = 0; s < 60; s++) {
        const p = fr.w(F.x - 3.5 + s * 0.12, F.z - 2 + s * 0.06);
        vc.update(0.05, { night: 3, hour: 1, moment: 'peak', open: true, contest: false, t: 30 + s * 0.05, from: { x: -12, z: 19.7 }, players: [p], me: p, camera: cam, visible: true });
        expect(vc.info(p).minToPlayer!).toBeGreaterThanOrEqual(PLAYER_ROOM - 0.06);
      }
      vc.dispose();
    }
  });

  it('the sabar night after 23 h: the floor makes a ring, a soloist in the middle in turn, the ring claps', () => {
    const { vc, fr, run } = setup();
    const h = 23.1;                                                         // a quarter with a soloist (soloAt)
    expect(soloAt(3, h)).toBeGreaterThanOrEqual(0);
    run(9, { hour: h, moment: 'warm', contest: true });
    const inner = (vc as unknown as Inner).who.filter(w => w.kind === 'floor' && w.on), ring = ringSpots(), plan = ringPlan(floorSpots(60, 3));
    const i = vc.info(null);
    expect(i.ring).toBe(floorCount('warm', 60));
    expect(i.solo).toBeGreaterThanOrEqual(0);
    for (const w of inner) {
      const l = fr.local(w.sx, w.sz);
      if (w.i === i.solo) expect(dist(l, F)).toBeLessThan(0.5);
      else expect(dist(l, ring[plan.get(w.i)!])).toBeLessThan(0.05);
    }
    const kinds = inner.map(w => vc.crowd!.reactionOf(w.id));
    expect(kinds.filter(k => k === 'applause').length).toBeGreaterThan(5);
    expect(vc.crowd!.reactionOf(`vague:floor:${i.solo}`)).toBe('dance');
    // a player in the middle: no soloist steps in
    const mid = fr.w(F.x, F.z);
    run(3, { hour: h, moment: 'warm', contest: true, players: [mid], me: mid }, 0.1, 9);
    expect(vc.info(mid).solo).toBe(-1);
    // not on other nights
    run(3, { hour: h, moment: 'warm', contest: false }, 0.1, 12);
    expect(vc.info(null).ring).toBe(0);
    vc.dispose();
  });

  it('drops: arms up and a shout on the floor, then they dance harder; the same night gives the same drops; a song request too', () => {
    const { vc, run } = setup();
    const a = setup().vc;
    let heard = 0, heardB = 0;
    for (let s = 0; s < 8 * 60; s += 0.25) {                              // 21 h → 5 h on the city's clock (an hour a minute)
      const hour = (21 + s / 60) % 24, moment = clubCrowd(hour) as ClubMoment;
      if (vc.update(0.25, { night: 3, hour, moment, open: true, contest: false, t: s, from: { x: -12, z: 19.7 }, players: [], me: null, camera: cam, visible: true }) === 'drop') heard++;
      if (a.update(0.25, { night: 3, hour, moment, open: true, contest: false, t: s, from: { x: -12, z: 19.7 }, players: [], me: null, camera: cam, visible: true }) === 'drop') heardB++;
    }
    expect(heard).toBeGreaterThanOrEqual(4);
    expect(heardB).toBe(heard);
    a.dispose();
    // a song request at the peak: arms up, then harder
    run(2);
    vc.request();
    const floor = () => (vc as unknown as Inner).who.filter(w => w.kind === 'floor' && w.on).map(w => vc.crowd!.reactionOf(w.id));
    run(0.3, {}, 0.1, 2);
    expect(floor().filter(k => k === 'celebrate').length).toBeGreaterThan(30);
    expect(floor().filter(k => k === 'shout').length).toBeGreaterThan(3);
    run(3.6, {}, 0.1, 2.3);
    expect(floor().filter(k => k === 'dance').length).toBeGreaterThan(20);
    expect(vc.info(null).requests).toBe(1);
    vc.dispose();
  });

  it('a good dance: the dancers nearest the player cheer', () => {
    const { vc, fr, run } = setup();
    const me = fr.w(F.x, F.z);
    run(2, { me, players: [me] });
    vc.cheer(me, 3);
    const i = vc.info(me);
    expect(i.dancers.slice(0, 3).every(d => d.clip === 'Celebrate')).toBe(true);
    vc.dispose();
  });

  it('far away nothing moves and nothing is drawn; the same night is rebuilt the same', () => {
    const { vc, parent, run } = setup();
    run(1);
    expect(parent.children.length).toBe(1);
    run(1, { visible: false }, 0.1, 1);
    expect(vc.crowd!.group.visible).toBe(false);
    expect(vc.info(null).drawCalls).toBe(0);
    run(0.2, { night: 4 }, 0.1, 2);                                        // the next night: rebuilt, still one group
    expect(parent.children.length).toBe(1);
    vc.dispose();
    expect(parent.children.length).toBe(0);
  });
});
