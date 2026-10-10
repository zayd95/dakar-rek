import { describe, expect, it } from 'vitest';
import {
  AISLES, AISLE_HALF, GATE_HALF, PARAPET_R, SECTIONS, STAND_GAPS, TUNNEL_A, TUNNEL_HALF, TUNNEL_MOUTH_R, WALL_R, angleDiff, inAisle, inGate, inTunnel,
  standOpen, tierRadius,
} from '../src/world/geew';
import { Batch } from '../src/world/batch';
import {
  ARENA_FLOOR, WALKWAY_R, aisleStairs, drummersStand, fightersGate, interiorSpots, mediaZone, prepCorner, standSection, tunnel, type ArenaKit,
} from '../src/world/arenaModules';
import { INTERIOR_DENSITY } from '../src/arena/interior';

const TAU = Math.PI * 2;

describe('arena interior: sections, aisles, tunnel', () => {
  it('eight sections A–H between the tunnel, six aisles and the public gate; they never overlap', () => {
    expect(SECTIONS.map(s => s.id).join('')).toBe('ABCDEFGH');
    let covered = 0;
    for (const s of SECTIONS) { expect(s.a1).toBeGreaterThan(s.a0 + 0.4); covered += s.a1 - s.a0; }
    const gaps = STAND_GAPS.reduce((t, [, h]) => t + 2 * h, 0);
    expect(covered + gaps).toBeCloseTo(TAU, 6);
    for (let i = 1; i < SECTIONS.length; i++) expect(SECTIONS[i].a0).toBeGreaterThan(SECTIONS[i - 1].a1);
  });
  it('the wrestlers enter opposite the public gate; aisles and tunnel are wide enough to walk', () => {
    expect(Math.abs(angleDiff(TUNNEL_A, Math.PI))).toBeCloseTo(Math.PI);
    expect(2 * Math.sin(TUNNEL_HALF) * tierRadius(0)).toBeGreaterThan(3.8);
    expect(2 * AISLE_HALF * tierRadius(0)).toBeGreaterThan(1.4);
    expect(AISLES).toHaveLength(6);
  });
  it('no spectator place in the gate, an aisle or the tunnel; every section centre is open', () => {
    for (const a of [Math.PI, TUNNEL_A, ...AISLES]) expect(standOpen(a)).toBe(false);
    for (const s of SECTIONS) expect(standOpen((s.a0 + s.a1) / 2)).toBe(true);
    let open = 0;
    for (let i = 0; i < 720; i++) { const a = (i / 720) * TAU; if (standOpen(a)) { open++; expect(inGate(a) || inAisle(a) || inTunnel(a)).toBe(false); } }
    expect(open / 720).toBeGreaterThan(0.68);                                     // gate, tunnel and six aisles take the rest
    expect(GATE_HALF).toBeGreaterThan(TUNNEL_HALF);
  });
});

describe('arena interior: modules', () => {
  const cx = 300, cz = -40;
  const cols: { x0: number; z0: number; x1: number; z1: number; h: number }[] = [];
  const signs: string[] = [];
  const kit: ArenaKit = {
    plain: new Batch(), concrete: new Batch(), base: ARENA_FLOOR, lite: false,
    solid: (x, z, w, d, h) => cols.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h }),
    sign: text => { signs.push(text); },
  };
  SECTIONS.forEach((s, i) => standSection(kit, cx, cz, s, i));
  for (const a of AISLES) aisleStairs(kit, cx, cz, a);
  tunnel(kit, cx, cz); fightersGate(kit, cx, cz); mediaZone(kit, cx, cz);
  const drums = drummersStand(kit, cx, cz);
  prepCorner(kit, cx, cz, -1, 0x1a7a44); prepCorner(kit, cx, cz, 1, 0xc8322a);
  const hit = (x: number, z: number) => cols.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);

  it('the stands and aisles are drawn and solid; the signs name the wrestlers\' entrance and the press', () => {
    expect(kit.concrete.count).toBeGreaterThan(SECTIONS.length * 3 * 6);
    expect(cols.length).toBeGreaterThan(100);
    expect(signs.filter(s => s === 'ENTRÉE DES LUTTEURS')).toHaveLength(2);
    expect(signs).toContain('PRESSE');
    for (const s of SECTIONS) { const a = (s.a0 + s.a1) / 2, r = tierRadius(1); expect(hit(cx + Math.sin(a) * r, cz + Math.cos(a) * r)).toBe(true); }
  });
  it('the tunnel is a clear passage from the wrestlers\' gate to the ring', () => {
    for (let z = 10; z <= WALL_R + 1.5; z += 0.25) for (const x of [-1.2, 0, 1.2]) expect(hit(cx + x, cz + z)).toBe(false);
  });
  it('the public gate and the walkway in front of the stands stay open', () => {
    for (let r = 12; r <= WALL_R + 1; r += 0.5) expect(hit(cx, cz - r)).toBe(false);
    expect(WALKWAY_R).toBeGreaterThan(16.4 + 0.2); expect(WALKWAY_R).toBeLessThan(PARAPET_R - 0.2);
    // (the tunnel's side walls close the walkway at the ends of sections A and H)
    for (const s of SECTIONS) for (let a = s.a0 + 0.08; a < s.a1 - 0.08; a += 0.05) expect(hit(cx + Math.sin(a) * WALKWAY_R, cz + Math.cos(a) * WALKWAY_R)).toBe(false);
  });
  it('the evening\'s people stand on their props, off the passage, inside the walls', () => {
    const spots = interiorSpots(cx, cz);
    expect(new Set(spots.map(s => s.role))).toEqual(new Set(['drummer', 'official', 'press', 'media', 'camp']));
    for (const s of spots) {
      const r = Math.hypot(s.x - cx, s.z - cz);
      expect(r).toBeLessThan(TUNNEL_MOUTH_R);
      expect(r).toBeGreaterThan(10.8);                                              // outside the ring and its boards
      expect(Math.abs(s.x - cx) < 2.2 && s.z > cz).toBe(false);                      // not in the wrestlers' passage
    }
    const ds = spots.filter(s => s.role === 'drummer');
    expect(ds).toHaveLength(drums.length);
    ds.forEach((d, i) => { expect(d.x).toBeCloseTo(drums[i].x, 6); expect(d.z).toBeCloseTo(drums[i].z, 6); expect(d.y).toBeCloseTo(drums[i].y, 6); });
    for (const s of spots.filter(s => s.role === 'camp' || s.role === 'media')) expect(hit(s.x, s.z)).toBe(false);
  });
  it('fewer people on lower quality', () => {
    const total = (q: keyof typeof INTERIOR_DENSITY) => Object.values(INTERIOR_DENSITY[q]).reduce((a, b) => a + b, 0);
    expect(total('low')).toBeLessThan(total('medium'));
    expect(total('medium')).toBeLessThanOrEqual(total('high'));
  });
});
