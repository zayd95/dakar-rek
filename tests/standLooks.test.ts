import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { standSeats, fillOrder, seatRadius } from '../src/arena/program';
import { SECTIONS, standOpen } from '../src/world/geew';
import { ArenaStands, sectionOf, sideOf } from '../src/crowd/arenaStands';
import { Crowd, personLook, type CrowdSlot } from '../src/crowd/crowd';
import { ECURIE_LOOK, SIDE_SHARE, childLook, defaultLook, headShape, printCode, standLook, wearsSide, type CrowdLook } from '../src/crowd/looks';
import { BANNER, BANNERS } from '../src/crowd/banners';
import { LAP_EVERY, RAIL_R, bannerPlan, companionPlan } from '../src/crowd/standPlan';
import { PART, figureGeometry, figureBoxes } from '../src/crowd/rig';
import { rng } from '../src/core/rng';

const seats = standSeats(0, 0, 'pikine:arena:stand');
const side = (a: number) => { const s = sideOf(a); return s === 'left' || s === 'right' ? s : 'ends'; };
const share = (list: CrowdLook[], f: (l: CrowdLook) => boolean) => list.filter(f).length / Math.max(1, list.length);

describe('the stands\' looks', () => {
  it('a seat always gets the same person, whatever the order or the crowd around', () => {
    for (const s of seats.slice(0, 60)) expect(standLook(s.id, side(s.a))).toEqual(standLook(s.id, side(s.a)));
    // two stands built from the seats in different orders give every seat the same look
    const a = new ArenaStands(fillOrder(seats.length, 7).map(i => seats[i]), 0, { quality: 'low' });
    const b = new ArenaStands([...seats].reverse(), 0, { quality: 'low' });
    for (const s of seats.filter((_, i) => i % 7 === 0)) expect(a.crowd.lookOf(s.id)).toEqual(b.crowd.lookOf(s.id));
    a.dispose(); b.dispose();
  });

  it('a Dakar làmb crowd: boubous and long dresses in wax, headwraps, caps and kufis, invented football shirts', () => {
    const ends = seats.filter(s => side(s.a) === 'ends').map(s => standLook(s.id, 'ends'));
    const all = seats.map(s => standLook(s.id, side(s.a)));
    for (const list of [ends, all]) {
      expect(share(list, l => l.style === 'dress')).toBeGreaterThan(0.18);
      expect(share(list, l => l.style === 'dress')).toBeLessThan(0.38);
      expect(share(list, l => l.style === 'boubou')).toBeGreaterThan(0.12);
      expect(share(list, l => l.style === 'jersey')).toBeGreaterThan(0.04);
      expect(share(list, l => l.style === 'tee')).toBeGreaterThan(0.25);
      expect(share(list, l => l.head === 'wrap')).toBeGreaterThan(0.14);
      expect(share(list, l => l.head === 'cap')).toBeGreaterThan(0.04);
      expect(share(list, l => l.head === 'kufi')).toBeGreaterThan(0.04);
      expect(share(list, l => !!l.print && l.print <= 3)).toBeGreaterThan(0.15);                 // wax prints
      expect(share(list, l => l.style === 'dress' && !!l.print)).toBeGreaterThan(0.1);
    }
    // football shirts carry a stripe, hoop or sash print in their accent colour; wax covers a whole boubou or dress
    for (const l of all) {
      if (l.style === 'jersey') { expect(l.print).toBeGreaterThanOrEqual(4); expect(l.print).toBeLessThanOrEqual(6); }
      if ((l.style === 'boubou' || l.style === 'dress') && l.print) expect(printCode(l)).toBe(l.print + 8);
      if (l.style === 'tee' || l.style === 'jersey') expect(printCode(l)).toBeLessThan(8);
    }
  });

  it('heights and builds vary: not all the same size', () => {
    const all = seats.map(s => standLook(s.id, side(s.a)));
    const h = all.map(l => l.height!), b = all.map(l => l.build!);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(0.92); expect(Math.max(...h)).toBeLessThanOrEqual(1.07);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(0.11);
    expect(Math.min(...b)).toBeGreaterThanOrEqual(0.88); expect(Math.max(...b)).toBeLessThanOrEqual(1.18);
    expect(Math.max(...b) - Math.min(...b)).toBeGreaterThan(0.22);
    const kids = Array.from({ length: 80 }, (_, i) => childLook(rng(i + 1)));
    for (const k of kids) { expect(k.child).toBe(true); expect(k.height!).toBeGreaterThanOrEqual(0.55); expect(k.height!).toBeLessThanOrEqual(0.68); }
    // the street keeps its variety too (the default look has a height and a build)
    const r = rng(5), street = Array.from({ length: 200 }, () => defaultLook(r));
    expect(new Set(street.map(l => l.style)).size).toBe(4);
    expect(new Set(street.map(l => Math.round(l.height! * 50))).size).toBeGreaterThan(4);
  });

  it('Baobab\'s side and Teranga\'s side read at a glance; the end sections are mixed', () => {
    const by = (sec: string[]) => seats.filter(s => sec.includes(sectionOf(s.a) ?? '')).map(s => standLook(s.id, side(s.a)));
    const left = by(['B', 'C']), right = by(['F', 'G']), ends = by(['A', 'D', 'E', 'H']);
    expect(share(left, l => wearsSide(l, 'left'))).toBeGreaterThan(SIDE_SHARE - 0.1);
    expect(share(right, l => wearsSide(l, 'right'))).toBeGreaterThan(SIDE_SHARE - 0.1);
    expect(share(left, l => wearsSide(l, 'right'))).toBeLessThan(0.08);
    expect(share(right, l => wearsSide(l, 'left'))).toBeLessThan(0.08);
    for (const s of ['left', 'right'] as const) expect(share(ends, l => wearsSide(l, s))).toBeLessThan(0.2);
    // headwraps and caps in the écurie's colour count too: the colour mass is more than the shirts
    expect(share(left, l => l.head === 'wrap' && ECURIE_LOOK.left.shades.includes(l.headColour!))).toBeGreaterThan(0.08);
  });

  it('banners at ringside: the two sides\' slogans in their sections, a neutral one by the tunnel, spaced along the parapet', () => {
    const plan = bannerPlan(seats, seatRadius(0));
    expect(plan.size).toBeGreaterThanOrEqual(8);
    const byId = new Map(seats.map(s => [s.id, s]));
    const placed: { a: number; sec: string }[] = [];
    for (const [id, b] of plan) {
      const s = byId.get(id)!, sec = sectionOf(s.a)!;
      expect(s.tier).toBe(0);
      expect(['D', 'E']).not.toContain(sec);
      const want = sec === 'B' || sec === 'C' ? 'left' : sec === 'F' || sec === 'G' ? 'right' : 'ends';
      expect(BANNERS[b].side).toBe(want);
      placed.push({ a: s.a, sec });
    }
    for (const p of placed) for (const q of placed) if (p !== q) {
      const d = Math.abs(Math.atan2(Math.sin(p.a - q.a), Math.cos(p.a - q.a))) * (seatRadius(0) - BANNER.z);
      expect(d).toBeGreaterThan(BANNER.w);
    }
    // the banner never hangs over an aisle's gap in the parapet
    for (const [id] of plan) {
      const s = byId.get(id)!, half = (BANNER.w / 2) / (seatRadius(0) - BANNER.z);
      expect(standOpen(s.a - half) && standOpen(s.a + half)).toBe(true);
    }
    expect([...bannerPlan(seats, seatRadius(0))]).toEqual([...plan]);
    // every slogan says it in Wolof and in French
    for (const b of BANNERS) { expect(b.wo.length).toBeGreaterThan(4); expect(b.fr.length).toBeGreaterThan(4); }
  });

  it('children on laps here and there, people at the barrier by the ring in each section', () => {
    const holders = bannerPlan(seats, seatRadius(0)), list = companionPlan(seats, 0, 0, holders);
    const laps = list.filter(c => c.kind === 'lap'), rail = list.filter(c => c.kind === 'rail');
    const upper = seats.filter(s => s.tier > 0).length;
    expect(laps.length).toBeGreaterThan(upper / LAP_EVERY / 2);
    expect(laps.length).toBeLessThan((upper / LAP_EVERY) * 2);
    const ids = new Set(seats.map(s => s.id)), byId = new Map(seats.map(s => [s.id, s]));
    for (const c of laps) { expect(c.child).toBe(true); expect(byId.get(c.with)!.tier).toBeGreaterThan(0); expect(holders.has(c.with)).toBe(false); }
    expect(rail.length).toBe(16);
    expect(rail.filter(c => c.child).length).toBe(6);
    for (const c of rail) {
      expect(ids.has(c.with)).toBe(true);
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(RAIL_R, 5);
      const a = Math.atan2(c.x, c.z);
      expect(standOpen(a)).toBe(true);                                            // not in an aisle, the gate or the tunnel
      expect(['D', 'E']).not.toContain(sectionOf(a));
      expect(sectionOf(byId.get(c.with)!.a)).toBe(sectionOf(a));                 // with someone of the same section
    }
    expect(companionPlan(seats, 0, 0, holders)).toEqual(list);
  });
});

describe('the stands drawn from one look per instance', () => {
  it('every figure kind carries the look parts: the crown, a brim on the mid figures, the banner; prints on the mid figures only', () => {
    for (const k of ['midSeated', 'midStanding', 'farSeated', 'farStanding'] as const) {
      const g = figureGeometry(k), part = g.attributes.aPart.array as Float32Array, parts = new Set<number>(), cloth = new Set<number>();
      expect(g.attributes.aPart.itemSize).toBe(4);
      for (let i = 0; i < part.length; i += 4) {
        parts.add(part[i]); cloth.add(part[i + 3]);
        if (part[i] === PART.banner) for (const t of [part[i + 1], part[i + 2]]) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }   // its atlas coordinates
      }
      expect(parts.has(PART.crown)).toBe(true);
      expect(parts.has(PART.banner)).toBe(true);
      expect(parts.has(PART.brim)).toBe(k.startsWith('mid'));
      expect(parts.has(PART.thigh) && parts.has(PART.shin)).toBe(k.endsWith('Seated'));
      expect(cloth.has(1) && cloth.has(2)).toBe(k.startsWith('mid'));
      expect(g.attributes.position.count).toBe(24 * figureBoxes(k));
      g.dispose();
    }
  });

  it('the headwear\'s shape and the near humanoid follow the look', () => {
    const wrap: CrowdLook = { style: 'dress', shirt: 0xe58a2f, legs: 0xe58a2f, skin: 0x5b3420, wrap: 0x1f7a44, head: 'wrap', headColour: 0x1f7a44, print: 2, accent: 0x1f3f8a };
    expect(headShape(wrap)).toEqual({ crown: 1, brim: false, colour: 0x1f7a44 });
    expect(headShape({ ...wrap, style: 'tee', head: 'cap', headColour: 0xd9322b }).brim).toBe(true);
    expect(headShape({ ...wrap, head: 'hair' }).crown).toBeLessThan(0.4);
    const p = personLook(wrap);
    expect(p).toMatchObject({ style: 'dress', female: true, hat: 'headwrap', hatColor: 0x1f7a44, pattern: 'wax', accent: 0x1f3f8a });
    expect(personLook({ ...wrap, style: 'jersey', print: 5 }).pattern).toBe('rayure');
    // an old street look (no head field) still wears its dress's headwrap
    expect(headShape({ style: 'dress', shirt: 1, legs: 1, skin: 1, wrap: 0x123456 })).toMatchObject({ crown: 1, colour: 0x123456 });
  });

  it('banners, people at the rail and children cost no draw call: at rest the stands are still two', () => {
    const order = fillOrder(seats.length, 7).map(i => seats[i]);
    const s = new ArenaStands(order, 0, { quality: 'medium' });
    s.fill(order.length, () => false);
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    cam.position.set(0, 9, -26); cam.lookAt(0, 1, 0); cam.updateMatrixWorld();
    s.cull(cam); s.update(0.3, true);
    const st = s.stats();
    expect(st.companions).toBeGreaterThan(20);
    expect(st.companionsDrawn).toBeGreaterThan(20);
    expect(s.crowd.drawCalls()).toBeLessThanOrEqual(2);                         // the seated figures, near and far
    // the instances say who holds a banner and who stands at the rail
    const mid = s.group.children.find(c => c.name === 'crowd_midSeated') as THREE.InstancedMesh, far = s.group.children.find(c => c.name === 'crowd_farSeated') as THREE.InstancedMesh;
    let banners = 0, upright = 0;
    for (const m of [mid, far]) {
      const look = m.geometry.attributes.iLook.array as Float32Array;
      for (let i = 0; i < m.count; i++) { if (look[i * 4 + 3] > 0.5) banners++; if (Math.floor(look[i * 4 + 1] / 2) % 2 === 1) upright++; }
    }
    const holders = bannerPlan(order, seatRadius(0));
    expect(banners).toBe(holders.size);
    expect(upright).toBe(16);
    // a big moment: everyone stands, the children on laps are not drawn while their parent is up
    s.react('all', 'fall', { share: 1 });
    s.update(1, true);
    const lap = order.map(o => `${o.id}:enfant`).filter(id => s.crowd.lookOf(id));
    expect(lap.length).toBeGreaterThan(5);
    for (const id of lap) expect(s.crowd.drawn(id)).toBe(false);
    expect(s.crowd.drawCalls()).toBeLessThanOrEqual(5);
    s.dispose();
  });

  it('each figure carries its own look: four packed colours, the headwear, the print and the build', () => {
    const look: CrowdLook = { style: 'boubou', shirt: 0x1a7a44, legs: 0x1a7a44, skin: 0x5b3420, wrap: null, head: 'cap', headColour: 0xf4c20d, print: 2, accent: 0xf2e2b0, height: 1, build: 1.12 };
    const c = new Crowd([{ id: 'x', x: 0, y: 1, z: 0, yaw: 0, seated: true, banner: 4 }], { quality: 'low', look: () => ({ ...look }) });
    c.fill(1); c.update(0.1);
    const mid = c.group.children.find(o => o.name === 'crowd_midSeated') as THREE.InstancedMesh;
    expect(mid.count).toBe(1);
    expect([...(mid.geometry.attributes.iCols.array as Float32Array).slice(0, 4)]).toEqual([0x5b3420, 0x1a7a44, 0xf4c20d, 0xf2e2b0]);
    const l = [...(mid.geometry.attributes.iLook.array as Float32Array).slice(0, 4)];
    expect(l[0]).toBeCloseTo(0.45, 5);                                         // a cap's crown
    expect(l[1]).toBe(1 + 4 * (2 + 8));                                        // a brim, a wax print over the whole boubou
    expect(l[2]).toBeCloseTo(1.12, 5);
    expect(l[3]).toBe(5);                                                      // banner 4 (+1)
    // colours survive the float packing exactly (24 bits)
    expect(Math.fround(0xffffff)).toBe(0xffffff);
    c.dispose();
  });

  it('companions come and go with their seat\'s spectator and are not counted as seats', () => {
    const slots: CrowdSlot[] = [
      { id: 'a', x: 0, y: 1, z: 0, yaw: 0, seated: true }, { id: 'b', x: 1, y: 1, z: 0, yaw: 0, seated: true },
      { id: 'a:enfant', x: 0, y: 1.14, z: 0.2, yaw: 0, seated: true, with: 'a', lap: true },
      { id: 'rail:b', x: 1, y: 0, z: 2, yaw: 0, seated: true, with: 'b', upright: true },
    ];
    const c = new Crowd(slots, { quality: 'low', seed: 2 });
    c.fill(1);
    expect(c.present).toBe(1);
    expect(c.has('a:enfant')).toBe(true);
    expect(c.has('rail:b')).toBe(false);
    c.fill(2, id => id === 'a');
    expect(c.present).toBe(1);
    expect(c.has('a:enfant')).toBe(false);
    expect(c.has('rail:b')).toBe(true);
    c.react('all', 'fall', { share: 1 }); c.update(1);
    expect(c.standingNow('a:enfant')).toBe(false);                             // a child on a lap never stands
    expect(c.standingNow('rail:b')).toBe(true);                                // at the rail: on their feet anyway
    c.dispose();
  });

  it('the grabs make the bout tense: many lean in on their knees, then it passes', () => {
    const order = fillOrder(seats.length, 7).map(i => seats[i]);
    const s = new ArenaStands(order, 0, { quality: 'low' });
    s.fill(order.length, () => false);
    s.moment('clinch');
    for (let k = 0; k < 24; k++) s.update(0.25, true);
    const tense = s.stats().fidgeting;
    expect(tense).toBeGreaterThan(order.length * 0.12);
    s.moment('fall');
    for (let k = 0; k < 48; k++) s.update(0.25, true);
    expect(s.stats().fidgeting).toBeLessThan(tense / 2);
    s.dispose();
  });
});

describe('sections used by the plans', () => {
  it('the plans only use the eight sections of the stands', () => {
    expect(SECTIONS.map(s => s.id).join('')).toBe('ABCDEFGH');
  });
});
