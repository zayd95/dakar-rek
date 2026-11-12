import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PRAYER_TIMES } from '../src/venues/prayer';
import { CongregationClock, LAST_CALL, LINGER, RAKAAT, SOLO_RAKAAT, followerLag, salat, salatOf, stepAt } from '../src/venues/salat';
import { PRAY_FEET_Z, prayerPresence } from '../src/actors/prayerPoses';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, floorSeatTop, type Seat } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import * as T from '../src/activity/templates';
import { extent, prayerRig } from './prayerRig';

const phases = (n: number) => salat(n).steps.map(s => s.phase);
const RAKA = ['qiyam', 'ruku', 'itidal', 'down', 'sujud', 'jalsa', 'sujud'];

describe('the prayer: postures in order', () => {
  it('two rak‘as: rise, takbir, then standing → bowing → upright → prostration → sitting → prostration, twice, the last sitting and the salutation right then left', () => {
    expect(phases(2)).toEqual(['rise', 'stand', 'takbir', ...RAKA, 'up', ...RAKA, 'tashahhud', 'salamR', 'salamL', 'end']);
  });
  it('three and four rak‘as: the middle sitting after the second only, the salutation once at the very end', () => {
    expect(phases(3)).toEqual(['rise', 'stand', 'takbir', ...RAKA, 'up', ...RAKA, 'tashahhud', 'up', ...RAKA, 'tashahhud', 'salamR', 'salamL', 'end']);
    const four = phases(4);
    expect(four.filter(p => p === 'tashahhud')).toHaveLength(2);
    expect(four.filter(p => p === 'qiyam')).toHaveLength(4);
    expect(four.filter(p => p === 'ruku')).toHaveLength(4);
    expect(four.filter(p => p === 'sujud')).toHaveLength(8);
    expect(four.filter(p => p === 'takbir')).toHaveLength(1);                         // the hands are raised at the opening only
    expect(four.slice(-4)).toEqual(['tashahhud', 'salamR', 'salamL', 'end']);
    for (let r = 1; r <= 4; r++) expect(salat(4).steps.filter(s => s.rakaa === r && RAKA.includes(s.phase)).map(s => s.phase)).toEqual(RAKA);
  });
  it('each step holds the posture its name says', () => {
    const pose: Record<string, string> = { rise: 'PrayDown', stand: 'PrayStand', takbir: 'PrayTakbir', qiyam: 'PrayStand', ruku: 'PrayBow', itidal: 'PrayStand', down: 'PrayDown',
      sujud: 'PraySujud', jalsa: 'PraySit', up: 'PrayDown', tashahhud: 'PraySit', salamR: 'PraySalamR', salamL: 'PraySalamL', end: 'PraySit' };
    for (const s of salat(4).steps) expect(s.pose, s.phase).toBe(pose[s.phase]);
  });
  it('timing: steps follow each other without a gap, every blend (0.6–1.2 s) ends inside its step, the postures are held long enough to be read', () => {
    for (const n of [2, 3, 4]) {
      const s = salat(n);
      let t = 0;
      for (const st of s.steps) {
        expect(st.t0).toBeCloseTo(t, 9); t += st.dur;
        expect(st.fade).toBeGreaterThanOrEqual(0.6); expect(st.fade).toBeLessThanOrEqual(1.2);
        expect(st.dur).toBeGreaterThanOrEqual(st.fade);
        if (st.phase === 'sujud' || st.phase === 'ruku') expect(st.dur).toBeGreaterThanOrEqual(2.5);
        if (st.phase === 'qiyam') expect(st.dur).toBeGreaterThanOrEqual(3);
      }
      expect(s.total).toBeCloseTo(t, 9);
    }
    expect(salat(2).total).toBeGreaterThan(40); expect(salat(2).total).toBeLessThan(60);
    expect(salat(4).total).toBeLessThan(90);
  });
  it('the step under way: none before the start or after the end, the right one on each boundary', () => {
    const s = salatOf(2);
    expect(stepAt(s, -0.01)).toBeNull(); expect(stepAt(s, s.total)).toBeNull(); expect(stepAt(s, NaN)).toBeNull();
    for (const st of s.steps) { expect(stepAt(s, st.t0)).toBe(st); expect(stepAt(s, st.t0 + st.dur - 1e-6)).toBe(st); }
    expect(salatOf(2)).toBe(s);                                                       // built once
  });
  it('each daily prayer has its rak‘as; one’s own prayer is two', () => {
    expect(PRAYER_TIMES.map(p => RAKAAT[p.id])).toEqual([2, 4, 4, 3, 4]);           // Fajar, Tisbaar, Takusaan, Timis, Gee
    expect(SOLO_RAKAAT).toBe(2);
  });
});

describe('the congregation follows the imam', () => {
  it('its clock is the city’s: seconds since the time of the prayer, the same for every client', () => {
    const c = new CongregationClock();
    c.update(0, 12); expect(c.prayer).toBeNull(); expect(c.present).toBe(false);
    c.update(0, 13.9); expect(c.prayer?.name).toBe('Tisbaar'); expect(c.t).toBeCloseTo(-6, 6); expect(c.running).toBe(false); expect(c.open).toBe(true);
    c.update(1, 13.9 + 2 / 60); expect(c.t).toBeCloseTo(-4, 6);                         // two city minutes = two seconds (a moving hour is followed, not the frames)
    c.update(0.016, 14.05); expect(c.t).toBeCloseTo(3, 6); expect(c.running).toBe(true); expect(c.step?.phase).toBe('takbir');
  });
  it('a held hour (the checks) runs on the frames; a prayer under way outlives its window, then the rows empty', () => {
    const c = new CongregationClock();
    c.update(0, 14.5); const t0 = c.t;
    for (let i = 0; i < 10; i++) c.update(0.5, 14.5);
    expect(c.t).toBeCloseTo(t0 + 5, 6);
    const m = new CongregationClock(), total = salatOf(4).total;
    m.update(0, 14.99); m.update(0, 15.05);                                             // the window closed at 15 h, the four rak‘as go on
    expect(m.prayer?.name).toBe('Tisbaar'); expect(m.running).toBe(true);
    m.update(0, 14 + (total + LINGER - 1) / 60); expect(m.present).toBe(true); expect(m.running).toBe(false); expect(m.open).toBe(false);
    m.update(0, 14 + (total + LINGER + 1) / 60); expect(m.prayer).toBeNull(); expect(m.present).toBe(false);
    m.update(0, 20.6); expect(m.prayer?.name).toBe('Gee');                              // the next one when its window opens
  });
  it('joining is offered until shortly before the end', () => {
    const c = new CongregationClock(), total = salatOf(2).total;
    c.update(0, 6 + (total - LAST_CALL - 0.5) / 60); expect(c.open).toBe(true);
    c.update(0, 6 + (total - LAST_CALL + 0.5) / 60); expect(c.open).toBe(false); expect(c.running).toBe(true);
  });
  it('each worshipper is a fraction of a second behind the imam, so the rows move together', () => {
    const s = salatOf(4), lags = Array.from({ length: 13 }, (_, i) => followerLag(i + 1));
    for (const l of lags) { expect(l.delay).toBeGreaterThanOrEqual(0.12); expect(l.delay).toBeLessThanOrEqual(0.45); expect(l.fadeK).toBeGreaterThanOrEqual(0.9); expect(l.fadeK).toBeLessThanOrEqual(1.15); }
    expect(new Set(lags.map(l => l.delay.toFixed(3))).size).toBeGreaterThan(8);           // not in lockstep
    expect(followerLag(3)).toEqual(followerLag(3));                                      // stable per person
    // never more than one step behind the imam, and in his very posture most of the time (the rest: the instant after he moves)
    const index = (t: number) => { const st = stepAt(s, t); return st ? s.steps.indexOf(st) : t < 0 ? -1 : s.steps.length; };
    let same = 0, n = 0;
    for (let t = 0; t < s.total; t += 0.1) for (const l of lags) {
      const d = index(t) - index(t - l.delay); n++;
      expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(1);
      if (stepAt(s, t)?.pose === stepAt(s, t - l.delay)?.pose) same++;
    }
    expect(same / n).toBeGreaterThan(0.85);
  });
});

describe('the postures on the shipped rig (v4 skin)', () => {
  const R = prayerRig();
  const low = (list: THREE.Vector3[]) => Math.min(...list.map(v => v.y));
  it('sujud: forehead and nose on the carpet and never through it; knees, toes and hands down; elbows raised', () => {
    R.pose('PraySujud');
    const m = R.mesh(), head = m.get('head')!, hmin = low(head);
    expect(hmin).toBeGreaterThan(-0.005); expect(hmin).toBeLessThan(0.02);
    // what touches is the face's front, from the forehead to the nose: not the chin, not the top of the head
    const inv = R.root.getObjectByName('head')!.matrixWorld.clone().invert();
    const touch = head.filter(v => v.y < hmin + 0.012).map(v => v.clone().applyMatrix4(inv));
    expect(touch.length).toBeGreaterThan(3);
    for (const v of touch) { expect(v.z).toBeGreaterThan(0.09); expect(v.y).toBeGreaterThan(-0.03); expect(v.y).toBeLessThan(0.1); }
    for (const s of ['L', 'R']) {
      expect(R.joint(`shin${s}`).y).toBeGreaterThan(0.05); expect(R.joint(`shin${s}`).y).toBeLessThan(0.1);   // the knee on the floor
      expect(low(m.get(`shin${s}`)!)).toBeLessThan(0.02); expect(low(m.get(`shin${s}`)!)).toBeGreaterThan(-0.01);
      expect(low(m.get(`foot${s}`)!)).toBeLessThan(0.02); expect(low(m.get(`foot${s}`)!)).toBeGreaterThan(-0.01);   // toes on the floor
      expect(R.axis(`foot${s}`, new THREE.Vector3(0, 1, 0)).y).toBeLessThan(-0.6);                                    // tucked, pointing down to the qibla side
      expect(low(m.get(`hand${s}`)!)).toBeLessThan(0.04); expect(low(m.get(`hand${s}`)!)).toBeGreaterThan(-0.01);   // hands flat beside the head
      expect(R.joint(`forearm${s}`).y).toBeGreaterThan(0.06);                                                        // the elbow off the floor
      expect(R.joint(`hand${s}`).z).toBeGreaterThan(R.joint(`shin${s}`).z + 0.3);
    }
    expect(extent(m.values()).y0).toBeGreaterThan(-0.01);
  });
  it('neighbours never overlap: every posture stays inside its place of the row (0.9 m wide, rows 1.4 m apart)', () => {
    let z0 = Infinity, z1 = -Infinity;
    for (const c of R.clips) {
      R.pose(c.name); const e = extent(R.mesh().values());
      expect(e.x1, c.name).toBeLessThan(0.45); expect(e.x0, c.name).toBeGreaterThan(-0.45);
      z0 = Math.min(z0, e.z0); z1 = Math.max(z1, e.z1);
    }
    expect(z1 - z0).toBeLessThan(1.35);                                  // the frontmost point of one row never reaches the back of the next
    expect(z1).toBeLessThan(1.4 + z0);
  });
  it('ruku: the back level, the head in line, the hands on the knees, the legs straight', () => {
    R.pose('PrayBow');
    const back = R.joint('neck').sub(R.joint('spine'));
    expect(Math.abs(back.y) / back.length()).toBeLessThan(0.15);
    expect(Math.abs(R.joint('head').y - R.joint('neck').y)).toBeLessThan(0.06);
    for (const s of ['L', 'R']) {
      expect(R.joint(`hand${s}`).distanceTo(R.joint(`shin${s}`))).toBeLessThan(0.16);
      expect(R.axis(`thigh${s}`, new THREE.Vector3(0, 1, 0)).dot(R.axis(`shin${s}`, new THREE.Vector3(0, 1, 0)))).toBeGreaterThan(0.95);
    }
  });
  it('one footprint: the standing feet, the toes in prostration and the knees when sitting stay in place (no sliding)', () => {
    R.pose('PrayStand'); const stand = R.joint('footL'); expect(stand.z).toBeCloseTo(PRAY_FEET_Z, 2); expect(stand.y).toBeLessThan(0.1);
    R.pose('PraySujud'); const toes = R.joint('footL'), kneeS = R.joint('shinL');
    R.pose('PraySit'); const kneeJ = R.joint('shinL');
    R.pose('PrayDown'); const toesD = R.joint('footL');
    expect(Math.abs(toes.z - stand.z)).toBeLessThan(0.12);
    expect(toesD.distanceTo(toes)).toBeLessThan(0.03);
    expect(Math.abs(kneeJ.z - kneeS.z)).toBeLessThan(0.05);
  });
  it('the sitting: on the feet, knees on the floor, hands on the thighs; the salutation turns the head to the right, then to the left', () => {
    R.pose('PraySit');
    expect(R.joint('hips').y).toBeGreaterThan(0.15); expect(R.joint('hips').y).toBeLessThan(0.3);
    for (const s of ['L', 'R']) { expect(R.joint(`shin${s}`).y).toBeLessThan(0.12); expect(R.joint(`hand${s}`).y).toBeLessThan(0.3); }
    const face = (c: string) => { R.pose(c); return R.axis('head', new THREE.Vector3(0, 0, 1)); };
    expect(face('PraySit').z).toBeGreaterThan(0.9);
    expect(face('PraySalamR').x).toBeLessThan(-0.6);                     // the worshipper's right is −x
    expect(face('PraySalamL').x).toBeGreaterThan(0.6);
  });
  it('from one posture to the next nothing goes through the floor (the ground guard keeps the blends above it)', () => {
    const seq = salatOf(4).steps.map(s => s.pose), pairs = new Set<string>();
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) pairs.add(`${seq[i - 1]}>${seq[i]}`);
    expect(pairs.size).toBeGreaterThanOrEqual(10);
    for (const p of pairs) {
      const [a, b] = p.split('>');
      for (const w of [0.25, 0.5, 0.75]) { R.pose(a, b, w, true); expect(extent(R.mesh().values()).y0, `${p} ${w}`).toBeGreaterThan(-0.03); }
    }
    R.pose('PrayStand', 'PrayDown', 0.5, false);                          // (why it is there: the bare cross-fade sinks the feet)
    expect(extent(R.mesh().values()).y0).toBeLessThan(-0.05);
  });
});

describe('the prayer is free: no score, no bar, no reward, no streak', () => {
  const setup = () => {
    const state = new GameState(newSave()); state.data.wallet = 1234;
    const seats = new Seats(); const log: string[] = []; let seated: Seat | null = null;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) seats.add({ id: `rang:${r}:${c}`, x: 1000 - 1.8 + c * 0.9, z: -4.4 + r * 1.4, top: floorSeatTop(0.1), yaw: Math.PI, kind: 'prayer', space: 'salle', occupant: null, clip: 'PraySit' });
    const s: ActivityServices = {
      state, seats, space: () => 'salle', player: () => ({ x: 1000 + 1.8, z: -1.6 }), seated: () => seated,
      sit: x => { if (!seats.occupy(x.id, 'player')) return false; seated = x; log.push('sit:' + x.id); return true; },
      clip: c => log.push('clip:' + c), busy: () => {}, progress: (on, pct) => { if (on) log.push(`progress:${pct}`); }, toast: m => log.push('toast:' + m), save: () => {},
      rel: () => log.push('rel'), flag: () => log.push('flag'), item: () => log.push('item'), category: c => log.push('cat:' + c),
      pay: (m) => { log.push('pay:' + m); return m; },
    };
    let prayed = false, gathering: string | null = null;
    const rank = (x: Seat) => { const [, r, c] = x.id.split(':').map(Number); return r * 100 + Math.abs(c - 2) * 2 + (c < 2 ? 1 : 0); };
    const place = T.mosque({ id: 'm', name: 'Grande Mosquée', space: 'street', anchors: [
      { id: 'ablutions', kind: 'spot', x: -5, z: 0 }, { id: 'hall', kind: 'place', x: 1000, z: -1.2, radius: 9, space: 'salle' }, { id: 'imam', kind: 'person', x: 998, z: -5, space: 'salle' },
    ] }, { prayReady: () => null, congregation: () => gathering, rowRank: rank, prayed: () => prayed });
    return { state, seats, log, runner: new ActivityRunner(s), place, seated: () => seated, done: () => { prayed = true; }, gather: (g: string | null) => { gathering = g; } };
  };
  const tick = (r: ActivityRunner, seconds: number) => { for (let t = 0; t < seconds; t += 0.25) r.update(0.25); };
  it('alone: it lasts as long as its postures (not a timer), shows no progress, ends without a « ✓ », changes nothing in the save', () => {
    const w = setup(), before = JSON.stringify(w.state.data);
    const pray = w.place.offers.hall.find(o => o.id === 'priere')!;
    expect(pray.quiet).toBe(true);
    expect(pray.steps.every(s => !s.effects && (s.primitive !== 'pray' || s.calm))).toBe(true);
    w.runner.start(pray);
    tick(w.runner, 120);
    expect(w.runner.running).toBe(true);                                // still praying: the postures say when it ends
    w.done(); tick(w.runner, 0.5);
    expect(w.runner.running).toBe(false);
    expect(w.seated()?.kind).toBe('prayer');
    expect(w.log.filter(l => l.startsWith('progress') || l.includes('✓') || /^(pay|cat|rel|flag|item)/.test(l))).toEqual([]);
    expect(JSON.stringify(w.state.data)).toBe(before);                 // money, needs, counters, the streak of days worked: all unchanged
  });
  it('with the congregation: the next place of the front row, from behind the imam outward (not the nearest one)', () => {
    const w = setup(); w.gather('Tisbaar');
    w.seats.occupy('rang:0:2', 'npc'); w.seats.occupy('rang:0:3', 'npc');
    const group = w.place.offers.hall.find(o => o.id === 'priere_groupe')!;
    expect(w.runner.start(group)).toBe(true);
    expect(w.seated()?.id).toBe('rang:0:1');                            // the gap beside the imam's line, though rang:1:4 is nearer
    w.runner.cancel(); expect(w.runner.running).toBe(false);           // voluntary: leave at any moment
    expect(w.log.filter(l => l.startsWith('progress') || /^(pay|cat)/.test(l))).toEqual([]);
  });
  it('other players see a worshipper standing or kneeling (the presence protocol’s own clips)', () => {
    expect(prayerPresence('PraySujud')).toBe('Kneel'); expect(prayerPresence('PraySit')).toBe('Kneel'); expect(prayerPresence('PraySalamL')).toBe('Kneel');
    expect(prayerPresence('PrayStand')).toBe('Idle'); expect(prayerPresence('PrayBow')).toBe('Idle');
    expect(prayerPresence('Walk')).toBeNull();
  });
});
