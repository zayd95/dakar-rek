import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import { daylight } from '../src/core/clock';
import { GALA } from '../src/arena/program';
import {
  FLOOD, LAMPS_FLICKER, LAMPS_OUT, LIGHTS_KEEP, STREET_POOL_R, flicker, floodlights, isStreetPool, kioskHours, kioskLit, lampState, lampWarmth,
  nightOf, poolsOf, shopWash, vehicleLit,
} from '../src/city/nightRules';

const nightAt = (h: number) => nightOf(daylight(h));

describe('the street lamps at night', () => {
  it('most are on, about 7 % are out and 5 % flicker, the same for everyone', () => {
    const n = { on: 0, out: 0, flicker: 0 };
    for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) n[lampState(i * 7.3 - 300, j * 5.9 - 250)]++;
    expect(n.out / 1e4).toBeGreaterThan(LAMPS_OUT - 0.02); expect(n.out / 1e4).toBeLessThan(LAMPS_OUT + 0.02);
    expect(n.flicker / 1e4).toBeGreaterThan(LAMPS_FLICKER - 0.02); expect(n.flicker / 1e4).toBeLessThan(LAMPS_FLICKER + 0.02);
    expect(lampState(12.5, -40)).toBe(lampState(12.5, -40));
  });
  it('the way to the arena gate stays lit', () => {
    for (let i = 0; i < 400; i++) expect(lampState(i * 3.1, i * -2.7, true)).toBe('on');
  });
  it('each lamp has its own warmth, brighter round the arena', () => {
    for (let i = 0; i < 200; i++) {
      const w = lampWarmth(i * 4.1, i * 1.3, false);
      expect(w).toBeGreaterThanOrEqual(0.85); expect(w).toBeLessThanOrEqual(1.05);
      expect(lampWarmth(i * 4.1, i * 1.3, true)).toBeCloseTo(w * 1.3);
    }
  });
  it('a flickering lamp is mostly lit, with cut-outs, each on its own rhythm', () => {
    let sum = 0, min = 1, max = 0, same = 0;
    const N = 60000;
    for (let k = 0; k < N; k++) {
      const t = k * 0.01, b = flicker(t, 3.7);
      sum += b; min = Math.min(min, b); max = Math.max(max, b);
      if (Math.abs(b - flicker(t, 6.1)) < 1e-6) same++;
    }
    expect(min).toBeCloseTo(0.1); expect(max).toBeLessThanOrEqual(1);
    expect(sum / N).toBeGreaterThan(0.7);
    expect(same / N).toBeLessThan(0.5);
    expect(flicker(12.34, 3.7)).toBe(flicker(12.34, 3.7));
  });
  it('the night follows the sky: day at noon, dark from about 19 h to dawn', () => {
    expect(nightAt(12)).toBe(0); expect(nightAt(15)).toBe(0);
    expect(nightAt(21)).toBe(1); expect(nightAt(2)).toBe(1); expect(nightAt(5.5)).toBe(1);
    expect(nightAt(18.5)).toBeGreaterThan(0.3); expect(nightAt(18.5)).toBeLessThan(1);
  });
});

describe('the light pools of the hub', () => {
  it('reads the centre and the radius of each 4-vertex pool', () => {
    const a = new THREE.PlaneGeometry(11, 11); a.rotateX(-Math.PI / 2); a.translate(10, 0.1, -4);
    const b = new THREE.PlaneGeometry(9, 9); b.rotateX(-Math.PI / 2); b.translate(-3, 0.1, 20);
    const pos = [...a.attributes.position.array, ...b.attributes.position.array];
    const p = poolsOf(pos);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ x: 10, z: -4, first: 0 }); expect(p[0].r).toBeCloseTo(5.5);
    expect(p[1]).toMatchObject({ x: -3, z: 20, first: 4 }); expect(p[1].r).toBeCloseTo(4.5);
    expect(isStreetPool(p[0].r)).toBe(true); expect(isStreetPool(p[1].r)).toBe(false);
    expect(isStreetPool(STREET_POOL_R)).toBe(true); expect(isStreetPool(7)).toBe(false);
  });
});

describe('vehicles at night', () => {
  it('moving vehicles show their lights; one stopped at a stop or in a jam keeps them; parked ones do not', () => {
    expect(vehicleLit(1, 0)).toBe(true);
    expect(vehicleLit(1, LIGHTS_KEEP - 1)).toBe(true);
    expect(vehicleLit(1, LIGHTS_KEEP + 1)).toBe(false);
    expect(vehicleLit(1, 1e9)).toBe(false);
    expect(vehicleLit(0, 0)).toBe(false);
    expect(vehicleLit(nightAt(13), 0)).toBe(false);
    expect(vehicleLit(nightAt(22), 0)).toBe(true);
  });
});

describe('the arena floodlights', () => {
  it('burn from the doors to just after the close, once it is dark', () => {
    expect(FLOOD.from).toBe(GALA.doors); expect(FLOOD.to).toBeGreaterThan(GALA.close);
    expect(floodlights(20, 1)).toBe(1); expect(floodlights(23.4, 1)).toBe(1);
    expect(floodlights(16.9, 1)).toBe(0); expect(floodlights(23.6, 1)).toBe(0); expect(floodlights(3, 1)).toBe(0);
    expect(floodlights(17.5, 0)).toBe(0);
  });
  it('on the city clock: off in daylight at the doors, coming on at dusk, full through the evening', () => {
    const at = (h: number) => floodlights(h, nightAt(h));
    expect(at(17)).toBe(0);
    expect(at(18.5)).toBeGreaterThan(0.5);
    for (const h of [19.5, 20, 21, 22, 23]) expect(at(h)).toBe(1);
    expect(at(0.5)).toBe(0);
    let prev = 0;
    for (let h = 17; h < 20; h += 0.1) { const v = at(h); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
  });
});

describe('shops and kiosks at night', () => {
  it('the wash sits inside the shop, the spill on the pavement before its open front', () => {
    const bounds = { x0: 10, x1: 20, z0: -4, z1: 4 }, front = { x: 15, z: 4 };
    const w = shopWash(bounds, front);
    expect(w.box.x).toBe(15); expect(w.box.z).toBe(0);
    expect(w.box.w).toBeLessThan(10); expect(w.box.d).toBeLessThan(8);
    expect(w.spill.x).toBeCloseTo(15); expect(w.spill.z).toBeCloseTo(6.2);
    const side = shopWash(bounds, { x: 10, z: 0 });
    expect(side.spill.x).toBeCloseTo(7.8); expect(side.spill.z).toBeCloseTo(0);
  });
  it('the kiosks glow while they are open: the Dibi late, the cafés go dark at 22 h', () => {
    expect(kioskHours('pikine:dibiterie:01')).toEqual([11, 2]);
    expect(kioskLit('pikine:dibiterie:01', 23)).toBe(true); expect(kioskLit('pikine:dibiterie:01', 1.5)).toBe(true);
    expect(kioskLit('pikine:dibiterie:01', 3)).toBe(false);
    expect(kioskLit('medina:cafe:12', 21)).toBe(true); expect(kioskLit('medina:cafe:12', 22.5)).toBe(false);
    expect(kioskLit('medina:gargote:3', 22.5)).toBe(true);
    expect(kioskHours('pikine:garage:01')).toBeNull();
    expect(kioskHours('pikine:city:boutique')).toBeNull();
  });
});

describe('the night module on the Pikine hub', () => {
  it('finds the lamps, shops, kiosks and the arena, in a handful of draw calls', async () => {
    stubCanvas();
    const { buildHub } = await import('../src/world/builder');
    const { nightModule } = await import('../src/city/night');
    const hub = buildHub('pikine', true);
    let hour = 21;
    const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 700);
    const ctx = { quality: () => 'medium', hour: () => hour, day: () => 4, scene: new THREE.Scene(), extra: new THREE.Group(), camera, inside: () => null } as unknown as GameCtx;
    ctx.scene.add(ctx.extra, hub.group);
    nightModule.init!(ctx);
    nightModule.hubLoaded!(ctx, hub);
    for (let k = 0; k < 120; k++) nightModule.update!(ctx, 1 / 30);
    const dbg = nightModule.debug!(ctx) as { night: { info(): { lamps: { lamps: number; out: number; flicker: number; bulbsFound: number }; flood: { level: number } | null; shops: { shops: number; kiosks: number; open: number }; spot: number | null } } };
    const info = dbg.night.info();
    expect(info.lamps.lamps).toBeGreaterThan(20);
    expect(info.lamps.bulbsFound).toBeGreaterThan(info.lamps.lamps * 0.8);
    expect(info.lamps.out).toBeLessThan(info.lamps.lamps * 0.2);
    expect(info.flood?.level).toBeGreaterThan(0.95);
    expect(info.spot).toBeGreaterThan(2);
    expect(info.shops.kiosks).toBeGreaterThan(0);
    // the named groups under ctx.extra, and the draw calls they can cost at most
    const names = ctx.extra.children.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['night_lamps', 'night_vehicles', 'night_arena', 'night_shops']));
    let draws = 0;
    for (const g of ctx.extra.children) g.traverse(o => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) draws++; });
    expect(draws).toBeLessThanOrEqual(10);
    // one real light, made once
    const lights: THREE.Light[] = []; ctx.scene.traverse(o => { if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); });
    expect(lights.map(l => l.name)).toEqual(['arena_spot']);
    // by day: all of it off
    hour = 12;
    for (let k = 0; k < 240; k++) nightModule.update!(ctx, 1 / 30);
    const day = dbg.night.info();
    expect(day.flood?.level).toBeLessThan(0.01);
    expect(ctx.extra.children.find(c => c.name === 'night_arena')!.visible).toBe(false);
    expect(ctx.extra.children.find(c => c.name === 'night_shops')!.visible).toBe(false);
  });
});
