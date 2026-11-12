import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { TRAVERSEE_SITE as S } from '../src/sea/traverseeSite';
import { ngorGroundY } from '../src/world/ngor';
import {
  DANCE_FROM, DJ_FROM, MUSIC_FULL, MUSIC_SILENT, ROOFTOP_COUNTS, ROOFTOP_ROLES, ROOFTOP_SEAT, ROOF_CENTRE, djPlays, musicFalloff, musicLevel,
  roofDistance, rooftopDay, rooftopLook, rooftopMusic, rooftopPeriod, rooftopPlan, type RooftopPeriod, type RooftopRole,
} from '../src/venues/rooftopPlan';
import { buildIslandRooftop, DRAW_FAR } from '../src/venues/islandRooftop';
import type { VenueEnv } from '../src/venues/venue';
import { isMuted, setMuted } from '../src/core/audioSettings';

stubCanvas();
const R = S.island.rooftop;
const DAYS = [0, 1, 2, 3, 6, 13, 40, 365];
/** Every quarter hour from a to b (b excluded), wrapping past midnight. */
const hours = (a: number, b: number, step = 0.25) => { const out: number[] = []; for (let h = a; h < (b > a ? b : b + 24) - 1e-9; h += step) out.push(h % 24); return out; };
const CONTRACT: Record<RooftopRole, readonly { x: number; z: number; yaw?: number }[]> = { dining: R.dining, lounge: R.lounge, bar: R.bar, barman: [R.barman], dj: [R.dj], dance: R.dance };

describe('the island rooftop: its hours', () => {
  it('closed from 1 h to 11 h: nobody on the roof, the music off', () => {
    for (const day of DAYS) for (const h of hours(1, 11)) {
      const p = rooftopPlan(day, h);
      expect(p.open, `${day} ${h}`).toBe(false);
      expect(p.period).toBe('closed');
      expect(p.people).toEqual([]);
      expect(Object.values(p.counts).every(n => n === 0)).toBe(true);
      expect(musicLevel(h)).toBe(0);
      expect(rooftopMusic(h, 0).gain).toBe(0);
      expect(rooftopMusic(h, 30).gain).toBe(0);
    }
  });

  it('open from 11 h to 1 h, the barman always behind the counter', () => {
    for (const day of DAYS) for (const h of hours(11, 1)) {
      const p = rooftopPlan(day, h);
      expect(p.open, `${day} ${h}`).toBe(true);
      expect(p.counts.barman).toBe(1);
      expect(musicLevel(h)).toBeGreaterThan(0);
    }
    expect([10.99, 11, 11.5, 12, 14.99, 15, 17.9, 18, 22.9, 23, 0.5, 0.99, 1].map(rooftopPeriod))
      .toEqual(['closed', 'opening', 'opening', 'lunch', 'lunch', 'afternoon', 'afternoon', 'evening', 'evening', 'late', 'late', 'late', 'closed']);
  });

  it('its night runs past midnight: 0–1 h is the day before\'s, with the same people', () => {
    expect(rooftopDay(5, 0.5)).toBe(4);
    expect(rooftopDay(4, 23.5)).toBe(4);
    expect(rooftopDay(4, 11)).toBe(4);
    const before = rooftopPlan(4, 23.75), after = rooftopPlan(5, 0.25);
    expect(after.day).toBe(4);
    for (const q of after.people) {
      const same = before.people.find(o => o.id === q.id);
      if (same) expect(q.look).toEqual(same.look);                          // the same person at that seat
    }
  });
});

describe('the island rooftop: who is there by the time of day', () => {
  const span = (p: RooftopPeriod, role: 'dining' | 'lounge' | 'bar' | 'dance') => ROOFTOP_COUNTS[p as Exclude<RooftopPeriod, 'closed'>][role];
  const within = (n: number, [lo, hi]: readonly [number, number], what: string) => { expect(n, what).toBeGreaterThanOrEqual(lo); expect(n, what).toBeLessThanOrEqual(hi); };

  it('the ranges asked for, within the seats there are', () => {
    expect(span('lunch', 'dining')).toEqual([5, 9]);
    expect(span('evening', 'dining')[0]).toBeGreaterThanOrEqual(10);       // nearly full
    expect(span('evening', 'lounge')).toEqual([R.lounge.length, R.lounge.length]);   // full
    expect(span('evening', 'bar')).toEqual([2, 4]);
    expect(span('evening', 'dance')).toEqual([2, 4]);
    expect(span('late', 'dining')[1]).toBeLessThan(span('evening', 'dining')[0]);   // fewer diners late
    for (const p of ['opening', 'lunch', 'afternoon', 'evening', 'late'] as const) {
      expect(span(p, 'dining')[1]).toBeLessThanOrEqual(R.dining.length);
      expect(span(p, 'lounge')[1]).toBeLessThanOrEqual(R.lounge.length);
      expect(span(p, 'bar')[1]).toBeLessThanOrEqual(R.bar.length);
      expect(span(p, 'dance')[1]).toBeLessThanOrEqual(R.dance.length);
    }
  });

  it('lunch: 5–9 diners and the barman; nobody else', () => {
    for (const day of DAYS) for (const h of hours(12, 15)) {
      const c = rooftopPlan(day, h).counts, at = `day ${day} ${h} h`;
      within(c.dining, [5, 9], at);
      expect(c, at).toMatchObject({ barman: 1, lounge: 0, bar: 0, dj: 0, dance: 0 });
    }
  });

  it('the afternoon: a few at the lounge and the bar, a late table at most', () => {
    for (const day of DAYS) for (const h of hours(15, 18)) {
      const c = rooftopPlan(day, h).counts, at = `day ${day} ${h} h`;
      within(c.lounge, [2, 4], at); within(c.bar, [1, 3], at); within(c.dining, [0, 3], at);
      expect(c, at).toMatchObject({ barman: 1, dj: 0, dance: 0 });
    }
  });

  it('the evening: tables nearly full, the lounge full, 2–4 at the bar, the DJ from 19 h, 2–4 dancers from 20 h', () => {
    for (const day of DAYS) for (const h of hours(18, 23)) {
      const c = rooftopPlan(day, h).counts, at = `day ${day} ${h} h`;
      within(c.dining, [10, 12], at); expect(c.lounge, at).toBe(R.lounge.length); within(c.bar, [2, 4], at);
      expect(c.dj, at).toBe(h >= DJ_FROM ? 1 : 0);
      if (h >= DANCE_FROM) within(c.dance, [2, 4], at); else expect(c.dance, at).toBe(0);
      expect(c.barman).toBe(1);
    }
    expect([18.5, 18.99, 19, 22.9, 23.5, 0.9, 1, 13].map(djPlays)).toEqual([false, false, true, true, true, true, false, false]);
  });

  it('late night: the lounge, the bar and the dancers, fewer diners, the DJ till closing', () => {
    for (const day of DAYS) for (const h of hours(23, 1)) {
      const c = rooftopPlan(day, h).counts, at = `day ${day} ${h} h`;
      within(c.lounge, [3, 5], at); within(c.bar, [2, 4], at); within(c.dance, [2, 4], at); within(c.dining, [2, 6], at);
      expect(c, at).toMatchObject({ dj: 1, barman: 1 });
    }
  });

  it('the counts move by the half hour, a couple of people at a time', () => {
    for (const day of DAYS) {
      let last: Record<string, number> | null = null, lastP = '';
      for (const h of hours(11, 1, 0.5)) {
        const city = h < 11 ? day + 1 : day, p = rooftopPlan(city, h);      // past midnight the city's day is the next one
        expect(rooftopPlan(city, h + 0.2).counts).toEqual(p.counts);         // the same within the half hour
        if (last && p.period === lastP) for (const r of ['dining', 'lounge', 'bar'] as const) expect(Math.abs(p.counts[r] - last[r]), `${day} ${h} ${r}`).toBeLessThanOrEqual(2);
        last = p.counts; lastP = p.period;
      }
    }
  });
});

describe('the island rooftop: the same people for everyone, each at a pose of the contract', () => {
  it('the same day and hour give the same people; another day another mix', () => {
    let differs = 0;
    for (const day of DAYS) for (const h of [11.5, 13, 16.5, 19.25, 21, 23.5, 0.5]) {
      expect(rooftopPlan(day, h)).toEqual(rooftopPlan(day, h));
      const a = rooftopPlan(day, h), b = rooftopPlan(day + 1, h);
      if (JSON.stringify(a.people.map(p => [p.id, p.look])) !== JSON.stringify(b.people.map(p => [p.id, p.look]))) differs++;
    }
    expect(differs).toBeGreaterThan(DAYS.length * 5);
  });

  it('every pose used once at most, every person at a contract pose (the dancers facing the DJ)', () => {
    for (const day of DAYS) for (const h of hours(11, 1, 0.5)) {
      const p = rooftopPlan(day, h), ids = new Set<string>(), spots = new Set<string>();
      for (const q of p.people) {
        expect(ids.has(q.id), q.id).toBe(false); ids.add(q.id);
        const k = `${q.x},${q.z}`; expect(spots.has(k), k).toBe(false); spots.add(k);
        const c = CONTRACT[q.role][q.i];
        expect(c, `${q.role} ${q.i}`).toBeDefined();
        expect([q.x, q.z]).toEqual([c.x, c.z]);
        if (q.role === 'dance') expect(q.yaw).toBeCloseTo(Math.atan2(R.dj.x - q.x, R.dj.z - q.z), 9);
        else expect(q.yaw).toBe(c.yaw);
        expect(q.seated).toBe(q.role === 'dining' || q.role === 'lounge');
      }
      for (const r of ROOFTOP_ROLES) expect(p.people.filter(q => q.role === r).length).toBe(p.counts[r]);
    }
  });

  it('the dining tables fill by the pair across a table: no one sits facing an empty chair while another pair is split', () => {
    for (const day of DAYS) for (const h of [12.5, 13.5, 19, 21, 23.5]) {
      const seats = new Set(rooftopPlan(day, h).people.filter(q => q.role === 'dining').map(q => q.i));
      const alone = [...seats].filter(i => !seats.has(i % 4 < 2 ? i + 2 : i - 2));
      expect(alone.length, `${day} ${h}`).toBeLessThanOrEqual(1);
    }
  });

  it('looks: the day and the seat decide them; lunch\'s customers are not dinner\'s; the barman in white', () => {
    expect(rooftopLook('dining', 3, 7, 'day')).toEqual(rooftopLook('dining', 3, 7, 'day'));
    let changed = 0;
    for (let i = 0; i < R.dining.length; i++) if (JSON.stringify(rooftopLook('dining', i, 7, 'day')) !== JSON.stringify(rooftopLook('dining', i, 7, 'night'))) changed++;
    expect(changed).toBeGreaterThan(R.dining.length / 2);
    for (const d of DAYS) expect(rooftopLook('barman', 0, d, 'day').shirt).toBe(0xf2f2ec);
  });
});

describe('the island rooftop: its music', () => {
  it('the gain curve: 1 within 40 m, falling, 0 from 110 m; 0 when closed', () => {
    expect(MUSIC_FULL).toBe(40); expect(MUSIC_SILENT).toBe(110);
    expect(musicFalloff(0)).toBe(1);
    expect(musicFalloff(40)).toBe(1);
    expect(musicFalloff(110)).toBe(0);
    expect(musicFalloff(110.5)).toBe(0);
    expect(musicFalloff(170)).toBe(0);                                      // the mainland's beach
    let last = 1;
    for (let d = 40; d <= 120; d += 0.5) { const g = musicFalloff(d); expect(g).toBeLessThanOrEqual(last + 1e-12); expect(g).toBeGreaterThanOrEqual(0); last = g; }
    expect(musicFalloff(40.5)).toBeGreaterThan(0.95);                        // no step at 40 m
    expect(musicFalloff(109)).toBeLessThan(0.01);                            // nor at 110 m
    for (const h of [1, 3, 6, 9, 10.9]) for (const d of [0, 20, 40]) expect(rooftopMusic(h, d).gain).toBe(0);
  });

  it('louder in the evening, louder and clearer once the DJ plays', () => {
    const at = (h: number) => rooftopMusic(h, 20);
    expect(at(13).gain).toBeGreaterThan(0);
    expect(at(18.5).gain).toBeGreaterThan(at(13).gain);
    expect(at(21).gain).toBeGreaterThan(at(18.5).gain);
    expect(at(21).muffle).toBeLessThan(at(18.5).muffle);
    expect(at(13).gain).toBe(musicLevel(13));
    for (const h of hours(11, 1)) expect(musicLevel(h)).toBeLessThanOrEqual(0.6);   // well under a club's floor
  });

  it('heard from the boat beached at the island, not on the mainland beach', () => {
    const floor = ngorGroundY(ROOF_CENTRE.x, ROOF_CENTRE.z) + R.roofY;
    const arriving = roofDistance({ x: 41, y: 3.2, z: -276 }, floor), beside = roofDistance({ x: 45.5, y: 1.6, z: -289 }, floor);
    const boat = roofDistance({ x: S.island.beached.x, y: 2.5, z: S.island.beached.z }, floor);
    const mainland = roofDistance({ x: 48.5, y: 2, z: -154.5 }, floor);
    expect(beside).toBeLessThan(MUSIC_FULL);
    expect(rooftopMusic(21, beside).falloff).toBe(1);
    expect(rooftopMusic(21, boat).falloff).toBe(1);
    expect(rooftopMusic(21, arriving).falloff).toBeGreaterThan(0.9);
    expect(mainland).toBeGreaterThan(MUSIC_SILENT);
    expect(rooftopMusic(21, mainland).gain).toBe(0);
    expect(roofDistance({ x: 43, y: floor + 1.5, z: -325 }, floor)).toBe(0);
  });
});

describe('the island rooftop venue: its people on the crowd', () => {
  /** A game for the venue: its clock, its camera, the hub's group. */
  function game(hour: number, day = 12) {
    const camera = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 2000), extra = new THREE.Group();
    const ctx = { camera, extra, hour: () => hour, day: () => day, inside: () => null, quality: () => 'medium' as const };
    const v = buildIslandRooftop({ ctx, lite: false } as unknown as VenueEnv);
    const look = (p: [number, number, number], t: [number, number, number]) => { camera.position.set(...p); camera.lookAt(...t); camera.updateMatrixWorld(); };
    return { v, extra, camera, look, set: (h: number) => { hour = h; } };
  }
  const crowdOf = (extra: THREE.Group) => extra.getObjectByName('ngor_rooftop_crowd');
  const info = (v: ReturnType<typeof buildIslandRooftop>) => v.debug() as unknown as { drawn: boolean; drawCalls: number; near: number; counts: Record<string, number>; shown: number; floorY: number; people: { id: string; standing: boolean }[] };

  it('drawn from the boat arriving at 13 h and 21 h: everyone planned, at most 3 draw calls, no full humanoid', () => {
    for (const h of [13, 21]) {
      const g = game(h);
      g.look([41, 3.2, -276], [42, 5, -325]);
      for (let i = 0; i < 30; i++) g.v.update(1 / 30);
      const d = info(g.v), plan = rooftopPlan(12, h);
      expect(d.drawn).toBe(true);
      expect(d.near).toBe(0);
      expect(d.drawCalls).toBeGreaterThan(0);
      expect(d.drawCalls).toBeLessThanOrEqual(3);
      expect(d.counts).toEqual(plan.counts);
      expect(d.shown).toBe(plan.people.length);
      expect(d.floorY).toBeCloseTo(ngorGroundY(ROOF_CENTRE.x, ROOF_CENTRE.z) + R.roofY, 3);
      expect(crowdOf(g.extra)?.visible).toBe(true);
      g.v.dispose();
      expect(crowdOf(g.extra)).toBeUndefined();
    }
  });

  it('the first night of a game too, past midnight (its rooftop day is −1)', () => {
    const g = game(0.5, 0);
    g.look([41, 3.2, -276], [42, 5, -325]);
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(true);
    expect(info(g.v).shown).toBe(rooftopPlan(0, 0.5).people.length);
    g.v.dispose();
  });

  it('the seated sit on a seat at the crowd\'s seated height above the roof\'s floor; the others stand on it', () => {
    const g = game(21);
    g.look([41, 3.2, -276], [42, 5, -325]);
    g.v.update(1 / 30);
    const floor = ngorGroundY(ROOF_CENTRE.x, ROOF_CENTRE.z) + R.roofY, c = crowdOf(g.extra)!;
    const meshes = c.children.filter(o => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count > 0) as THREE.InstancedMesh[];
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const mesh of meshes) for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m);
      const want = mesh.name.includes('Seated') ? floor + ROOFTOP_SEAT.dining : floor;
      expect(p.y).toBeCloseTo(want, 4);                                     // (float32 matrices)
    }
    g.v.dispose();
  });

  it('its music: asked for beside the beached bow, none on the mainland beach, with the sound off or while closed; nothing before a gesture', () => {
    const g = game(21), music = () => (g.v.debug() as unknown as { music: { on: boolean; gain: number; distance: number; playing: boolean } }).music;
    g.look([45.5, 1.6, -289], [43, 5, -325]);
    g.v.update(1 / 30);
    expect(music().distance).toBeLessThan(MUSIC_FULL);
    expect(music().gain).toBeCloseTo(musicLevel(21), 9);
    expect(music().on).toBe(false);                                         // no gesture yet (and no audio in node): nothing plays
    expect(music().playing).toBe(false);
    const was = isMuted();
    setMuted(true); g.v.update(1 / 30);
    expect(music().gain).toBe(0);
    setMuted(false); g.v.update(1 / 30);
    expect(music().gain).toBeGreaterThan(0);
    setMuted(was);
    g.look([48.5, 2, -154.5], [48, 1, -320]); g.v.update(1 / 30);
    expect(music().gain).toBe(0);
    g.look([45.5, 1.6, -289], [43, 5, -325]); g.set(6); g.v.update(1 / 30);
    expect(music().gain).toBe(0);
    g.v.dispose();
  });

  it('not drawn when the camera is far, looks away, or it is closed (and nothing is kept while closed)', () => {
    const g = game(21);
    g.look([48.5, 2, -154.5], [48, 1, -320]);                              // the mainland beach, looking at the island: ~170 m, drawn
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(true);
    g.look([48.5, 2, -154.5], [48, 1, -100]);                              // the same place, looking at the city
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(false);
    expect(info(g.v).drawCalls).toBe(0);
    g.look([43, 2, -325.5 + DRAW_FAR + 20], [43, 4, -325.5]);              // beyond the draw distance
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(false);
    g.look([41, 3.2, -276], [42, 5, -325]);
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(true);
    g.set(5);                                                               // closed
    g.v.update(1 / 30);
    expect(info(g.v).drawn).toBe(false);
    expect(crowdOf(g.extra)).toBeUndefined();
    g.v.dispose();
  });
});
