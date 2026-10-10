import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  REACTIONS, REACTION_KINDS, REST_SIT, REST_STAND, armDirs, dancePose, easePose, offer, plan, poseFor, restState, standingFor, step, walkPose,
  type RigPose,
} from '../src/crowd/reactions';
import { SHOULDER_X, UPPER_ARM, figureBoxes, figureGeometry } from '../src/crowd/rig';
import { CROWD_LOD, Crowd, type CrowdSlot } from '../src/crowd/crowd';
import { ArenaStands, momentPlan, sectionOf, sideOf } from '../src/crowd/arenaStands';
import { TUNNEL_MOUTH_R } from '../src/world/geew';
import { fillOrder, standSeats } from '../src/arena/program';
import { rng } from '../src/core/rng';
import { cabRoutes } from '../src/crowd/arrivals';
import { gateOf } from '../src/arena/exteriorRules';
import { KERB } from '../src/transport/lines';

const FORE = 0.33;
/** Where the hand ends up (character space), from the shoulder of a figure whose shoulder is at height `j`. */
function hand(p: RigPose, side: 1 | -1, t = 0, phase = 0, j = 0.63) {
  const d = armDirs(p, side, t, phase);
  return [side * SHOULDER_X + UPPER_ARM * d.upper[0] + FORE * d.fore[0], j + UPPER_ARM * d.upper[1] + FORE * d.fore[1], UPPER_ARM * d.upper[2] + FORE * d.fore[2]];
}

describe('crowd reactions', () => {
  it('defines the six reactions, stronger ones ranked higher', () => {
    expect([...REACTION_KINDS].sort()).toEqual(['applause', 'celebrate', 'fall', 'grab', 'shout', 'standUp']);
    const r = (k: keyof typeof REACTIONS) => REACTIONS[k].rank;
    expect(r('celebrate')).toBeGreaterThan(r('fall'));
    expect(r('fall')).toBeGreaterThan(r('shout'));
    expect(r('shout')).toBeGreaterThan(r('applause'));
    expect(r('applause')).toBeGreaterThan(r('grab'));
    for (const k of REACTION_KINDS) { expect(REACTIONS[k].share).toBeGreaterThan(0); expect(REACTIONS[k].seconds).toBeGreaterThan(1); }
  });

  it('a stronger reaction overrides a weaker one, never the other way while it lasts', () => {
    const s = restState();
    expect(offer(s, 'grab', 0, 2)).toBe(true);
    expect(s.kind).toBe('grab');
    expect(offer(s, 'fall', 0, 3)).toBe(true);
    expect(s.kind).toBe('fall');
    expect(offer(s, 'applause', 0, 3)).toBe(false);                // the fall goes on
    step(s, 2.6);                                                   // 0.4 s left: a weaker one may take over
    expect(offer(s, 'applause', 0, 3)).toBe(true);
    expect(s.kind).toBe('applause');
  });

  it('a staggered reaction starts after its delay, keeps the current one meanwhile, and ends at rest', () => {
    const s = restState();
    offer(s, 'applause', 0, 5);
    expect(offer(s, 'celebrate', 0.5, 2)).toBe(true);
    expect(s.kind).toBe('applause');
    expect(step(s, 0.3)).toBe(false);
    expect(step(s, 0.3)).toBe(true);
    expect(s.kind).toBe('celebrate');
    expect(step(s, 2.1)).toBe(true);
    expect(s.kind).toBeNull();
  });

  it('plans about the share of a group, within the stagger and the duration spread', () => {
    const r = rng(5), n = 4000, p = plan(n, 'standUp', r, { share: 0.5 });
    const joined = p.filter(Boolean) as { delay: number; seconds: number }[];
    expect(joined.length / n).toBeGreaterThan(0.46);
    expect(joined.length / n).toBeLessThan(0.54);
    for (const j of joined) {
      expect(j.delay).toBeGreaterThanOrEqual(0); expect(j.delay).toBeLessThanOrEqual(REACTIONS.standUp.stagger);
      expect(j.seconds).toBeGreaterThanOrEqual(REACTIONS.standUp.seconds * 0.75); expect(j.seconds).toBeLessThanOrEqual(REACTIONS.standUp.seconds * 1.25);
    }
    const keen = plan(n, 'standUp', rng(6), { share: 0.5, temper: () => 1.4 }).filter(Boolean).length;
    expect(keen).toBeGreaterThan(joined.length);
  });

  it('seated people stand for shouts, falls, wins and to see; clap and tense in their seat', () => {
    for (const k of ['shout', 'standUp', 'fall', 'celebrate'] as const) expect(standingFor(true, k)).toBe(true);
    for (const k of ['applause', 'grab'] as const) expect(standingFor(true, k)).toBe(false);
    expect(standingFor(true, null)).toBe(false);
    expect(standingFor(false, null)).toBe(true);
    expect(poseFor(null, false)).toBe(REST_SIT);
    expect(poseFor(null, true)).toBe(REST_STAND);
    expect(poseFor('fall', true)).toBe(REACTIONS.fall.up);
    expect(poseFor('fall', true, 1.4).walk).toBeGreaterThan(0.3);
  });

  it('eases a pose towards its target and stops there', () => {
    const cur = { ...REST_SIT };
    let moving = true, k = 0;
    while (moving && k++ < 200) moving = easePose(cur, REACTIONS.celebrate.sit, 0.2);
    expect(moving).toBe(false);
    expect(cur).toEqual(REACTIONS.celebrate.sit);
  });
});

describe('crowd rig poses', () => {
  it('seated at rest: hands on the knees, in front, below the shoulders', () => {
    for (const side of [1, -1] as const) {
      const [x, y, z] = hand(REST_SIT, side);
      expect(Math.sign(x)).toBe(side);
      expect(y).toBeGreaterThan(0.1); expect(y).toBeLessThan(0.35);   // the knees are at 0.16 on the seat
      expect(z).toBeGreaterThan(0.3); expect(z).toBeLessThan(0.55);
    }
  });

  it('celebrate: arms up and apart, both sides mirrored', () => {
    const l = armDirs(REACTIONS.celebrate.up, 1, 0, 0), r = armDirs({ ...REACTIONS.celebrate.up, sideOff: 0 }, -1, 0, 0);
    expect(l.upper[1]).toBeGreaterThan(0.8);
    expect(l.upper[0]).toBeGreaterThan(0.1);
    const l0 = armDirs({ ...REACTIONS.celebrate.up, sideOff: 0 }, 1, 0, 0);
    expect(r.upper[0]).toBeCloseTo(-l0.upper[0], 6); expect(r.upper[1]).toBeCloseTo(l0.upper[1], 6); expect(r.upper[2]).toBeCloseTo(l0.upper[2], 6);
    const [, y] = hand(REACTIONS.celebrate.up, 1, 0, 0, 1.44);
    expect(y).toBeGreaterThan(1.9);                                  // hands above the head (1.75)
  });

  it('applause: the hands meet in front of the chest, then part', () => {
    const p = REACTIONS.applause.sit;
    // sin(w) = 1 at w = π/2: the yaw is at its widest (hands together); sin(w) = −1: apart
    const t1 = (Math.PI / 2) / p.freq, t0 = (3 * Math.PI / 2) / p.freq;
    const shut = [hand(p, 1, t1), hand(p, -1, t1)], open = [hand(p, 1, t0), hand(p, -1, t0)];
    expect(Math.abs(shut[0][0] - shut[1][0])).toBeLessThan(0.08);
    expect(Math.abs(open[0][0] - open[1][0])).toBeGreaterThan(0.15);
    expect(shut[0][2]).toBeGreaterThan(0.3);                         // in front
    expect(shut[0][1]).toBeGreaterThan(0.45);                        // at chest height (shoulders 0.63)
  });

  it('fall: hands up at the head, elbows out', () => {
    const p = REACTIONS.fall.up, J = 1.44;
    for (const side of [1, -1] as const) {
      const [x, y] = hand(p, side, 0, 0, J), d = armDirs(p, side, 0, 0);
      expect(y).toBeGreaterThan(1.5); expect(y).toBeLessThan(2.05);
      expect(Math.abs(x)).toBeLessThan(0.45);
      expect(Math.sign(d.upper[0])).toBe(side);                      // the upper arm goes out to the side
    }
  });

  it('walking swings the arms in opposition', () => {
    const p = walkPose(1.4), t = 0;                                  // w = 0: the swing is widest
    const l = armDirs(p, 1, t, 0), r = armDirs(p, -1, t, 0);
    expect(l.upper[2] * r.upper[2]).toBeLessThan(0);                 // one forward, one back
  });
});

describe('crowd figures', () => {
  it('builds the four figure kinds with the rig attributes and colour marks', () => {
    for (const k of ['midSeated', 'midStanding', 'farSeated', 'farStanding'] as const) {
      const g = figureGeometry(k);
      expect(g.attributes.position.count).toBe(24 * figureBoxes(k));
      expect(g.attributes.aRig.itemSize).toBe(4);
      expect(g.attributes.color.itemSize).toBe(3);
      const segs = new Set<number>(), rig = g.attributes.aRig.array, col = g.attributes.color.array;
      for (let i = 0; i < rig.length; i += 4) segs.add(rig[i + 1]);
      expect(segs.has(2)).toBe(true);                                // arms
      let shirt = 0, skin = 0;
      for (let i = 0; i < col.length; i += 3) { if (col[i] === 1 && col[i + 1] === 1 && col[i + 2] === 1) shirt++; if (col[i] === 0 && col[i + 1] === 0 && col[i + 2] === 0) skin++; }
      expect(shirt).toBeGreaterThan(0); expect(skin).toBeGreaterThan(0);
      g.dispose();
    }
    expect(figureBoxes('farSeated')).toBeLessThan(figureBoxes('midSeated'));
    // forearms hang from the elbow, one upper arm below the shoulder
    const g = figureGeometry('midStanding'), rig = g.attributes.aRig.array, pos = g.attributes.position.array;
    let top = -Infinity;
    for (let i = 0, v = 0; i < rig.length; i += 4, v++) if (rig[i + 1] === 3) top = Math.max(top, pos[v * 3 + 1]);
    expect(top).toBeCloseTo(1.44 - UPPER_ARM, 5);
    g.dispose();
  });
});

const slots = (n: number, tag = (i: number) => (i % 2 ? 'odd' : 'even')): CrowdSlot[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, x: i * 0.7, y: 1, z: 0, yaw: 0, seated: true, tags: [tag(i)] }));

describe('Crowd', () => {
  it('fills in order, skips seats held by others, and reacts by group', () => {
    const c = new Crowd(slots(20), { quality: 'medium', seed: 3 });
    c.fill(10, id => id === 's3');
    expect(c.present).toBe(9);
    expect(c.has('s3')).toBe(false);
    expect(c.has('s12')).toBe(false);
    const n = c.react('odd', 'celebrate', { share: 1 });
    expect(n).toBe(4);                                               // s1, s5, s7, s9 (s3 is not there)
    c.update(1);
    expect(c.reacting).toBe(4);
    expect(c.reactionOf('s1')).toBe('celebrate');
    expect(c.reactionOf('s2')).toBeNull();
    expect(c.standingNow('s1')).toBe(true);
    expect(c.standingNow('s2')).toBe(false);
    expect(c.level('odd')).toBeGreaterThan(0.5);
    for (let k = 0; k < 40; k++) c.update(0.25);
    expect(c.reacting).toBe(0);
    expect(c.standingNow('s1')).toBe(false);
    c.dispose();
  });

  it('draws mid figures near the camera and silhouettes beyond, nobody past the far range', () => {
    const L = CROWD_LOD.low;
    const far: CrowdSlot[] = [
      { id: 'a', x: 5, y: 0, z: 0, yaw: 0, seated: false }, { id: 'b', x: L.mid + 5, y: 0, z: 0, yaw: 0, seated: false },
      { id: 'c', x: L.far + 5, y: 0, z: 0, yaw: 0, seated: false },
    ];
    const c = new Crowd(far, { quality: 'low' });
    c.fill(3);
    const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.6, 0); cam.updateMatrixWorld();
    c.setCamera(cam); c.update(0.1);
    expect(c.stats()).toMatchObject({ present: 3, near: 0, mid: 1, far: 1, hidden: 1, standing: 3 });
    expect(c.drawCalls()).toBe(2);
    c.dispose();
  });

  it('walkers walk and do not join reactions until they stop', () => {
    const c = new Crowd([{ id: 'w', x: 0, y: 0, z: 0, yaw: 0, seated: false }], { quality: 'high' });
    c.fill(1);
    c.move('w', 1, 0, 1, 0.5, 1.4);
    expect(c.react('all', 'shout', { share: 1 })).toBe(0);
    c.move('w', 1, 0, 1, 0.5, 0);
    expect(c.react('all', 'shout', { share: 1 })).toBe(1);
    c.dispose();
  });
});

describe('arena stands', () => {
  const seats = standSeats(0, 0, 'test:stand');
  const order = fillOrder(seats.length, 7).map(i => seats[i]);

  it('splits the tiers into supporters by side, mixed ends by the gate and opposite it', () => {
    expect(sideOf(Math.PI / 2)).toBe('left');
    expect(sideOf(3 * Math.PI / 2)).toBe('right');
    expect(sideOf(0)).toBe('ends');
    expect(sideOf(Math.PI)).toBe('ends');
  });

  it('every place on the tiers is in a section (A–H); B–C and F–G hold the two sides\' supporters', () => {
    const count: Record<string, number> = {};
    for (const o of seats) { const sec = sectionOf(o.a); expect(sec).not.toBeNull(); count[sec!] = (count[sec!] ?? 0) + 1; }
    expect(Object.keys(count).sort().join('')).toBe('ABCDEFGH');
    for (const o of seats) {
      const sec = sectionOf(o.a)!, side = sideOf(o.a);
      expect(side).toBe('BC'.includes(sec) ? 'left' : 'FG'.includes(sec) ? 'right' : 'ends');
    }
  });

  it('a wrestler\'s entrance ripples out from the tunnel mouth', () => {
    const s = new ArenaStands(order, 0, { quality: 'medium', seed: 4 });
    s.fill(order.length, () => false);
    const tunnelD = (id: string) => { const o = order.find(x => x.id === id)!; return Math.hypot(o.x, o.z - TUNNEL_MOUTH_R); };
    s.moment('entrance', { side: 'left' });
    const meanD = () => { let n = 0, t = 0; for (const o of order) if (s.crowd.reactionOf(o.id)) { n++; t += tunnelD(o.id); } return { n, d: t / Math.max(1, n) }; };
    s.update(0.35, true);
    const early = meanD();
    s.update(2, true);
    const late = meanD();
    expect(early.n).toBeGreaterThan(5);
    expect(late.n).toBeGreaterThan(early.n);
    expect(early.d).toBeLessThan(late.d - 4);
    s.dispose();
  });

  it('turns the gala moments into group reactions', () => {
    expect(momentPlan('entrance', { side: 'left' }).map(r => r.slice(0, 2))).toEqual([['left', 'shout'], ['right', 'applause'], ['ends', 'applause']]);
    expect(momentPlan('clinch')[0].slice(0, 2)).toEqual(['all', 'grab']);
    expect(momentPlan('fall')[0].slice(0, 2)).toEqual(['all', 'fall']);
    expect(momentPlan('result', { winner: 'right' })[0].slice(0, 2)).toEqual(['right', 'celebrate']);
    expect(momentPlan('result', {}).every(r => r[1] === 'applause')).toBe(true);
  });

  it('is a drop-in for the stands: fill, taken, present, cheering, the old react(share, seconds)', () => {
    const s = new ArenaStands(order.slice(0, 200), 0, { quality: 'low' });
    s.fill(150, id => id === order[0].id);
    expect(s.present).toBe(149);
    expect(s.taken().length).toBe(149);
    expect(s.taken().some(t => t.id === order[0].id)).toBe(false);
    expect(s.react(0.5, 3)).toBeGreaterThan(40);
    s.update(1, true);
    expect(s.cheering).toBeGreaterThan(40);
    s.dispose();
  });

  it('the side walking in shouts, the other side applauds; the winner side celebrates', () => {
    const s = new ArenaStands(order, 0, { quality: 'medium' });
    s.fill(order.length, () => false);
    s.moment('entrance', { side: 'left' });
    s.update(2.2, true);                                             // the ripple from the tunnel has reached the gate
    const st = s.stats();
    expect(st.kinds.shout ?? 0).toBeGreaterThan(50);
    expect(st.kinds.applause ?? 0).toBeGreaterThan(30);
    const sideOfId = new Map(order.map(o => [o.id, sideOf(o.a)]));
    for (const o of order) {
      const k = s.crowd.reactionOf(o.id);
      if (k === 'shout') expect(sideOfId.get(o.id)).toBe('left');
    }
    for (let k = 0; k < 30; k++) s.update(0.25, true);
    s.moment('fall');
    s.update(0.5, true);
    s.moment('result', { winner: 'right' });
    s.update(1, true);
    let celebrating = 0;
    for (const o of order) if (s.crowd.reactionOf(o.id) === 'celebrate') { celebrating++; expect(sideOfId.get(o.id)).toBe('right'); }
    expect(celebrating).toBeGreaterThan(0.7 * order.filter(o => sideOf(o.a) === 'right').length);
    expect(s.level()).toBeGreaterThan(0.5);
    s.dispose();
  });
});

describe('dancing and arrivals', () => {
  it('a dancing group hops on the beat between reactions, and celebrates when asked', () => {
    const p = dancePose(124);
    expect(p.bounce).toBeGreaterThan(0.04);
    expect(Math.PI / p.freq).toBeCloseTo(60 / 124, 6);              // one hop (|sin| period) per beat
    const c = new Crowd(slots(6).map(s => ({ ...s, seated: false })), { quality: 'medium' });
    c.fill(6);
    c.setMood('all', 'dance', 124);
    c.update(0.1);
    expect(c.stats().standing).toBe(6);
    expect(c.react('all', 'celebrate', { share: 1 })).toBe(6);
    c.dispose();
  });

  it('taxis drop fans on the pavement at the two corners nearest the gate; every walk ends at the queue tail', () => {
    const g = gateOf({ cx: 30, cz: -30 }), tail = { x: g.x, z: g.queue.z1 - 0.35 };
    const routes = cabRoutes(g);
    expect(routes.length).toBe(2);
    for (const r of routes) {
      const dir = Math.sign(r.z1 - r.z0), roadX = Math.round(r.x / 60) * 60;
      // driving on the right: heading -z the lane is on +x of the centre line, heading +z on -x
      expect(Math.sign(r.x - roadX)).toBe(dir < 0 ? 1 : -1);
      expect(Math.abs(r.alight.x - roadX)).toBeGreaterThan(KERB);         // on the pavement
      expect(Math.abs(r.alight.x - roadX)).toBeLessThan(KERB + 2);
      expect((r.zs - r.z0) * dir).toBeGreaterThan(0);
      expect((r.z1 - r.zs) * dir).toBeGreaterThan(0);
      expect(r.walk[r.walk.length - 1]).toEqual(tail);
      // the arena block (x 7-53, z -53 to -7) and the block south of the street (z -113 to -67) are never crossed
      const pts = [r.alight, ...r.walk];
      for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 20; k++) {
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / 20, z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k / 20;
        expect(x > 7 && x < 53 && ((z > -53 && z < -7) || (z < -67 && z > -113))).toBe(false);
      }
    }
  });
});
