import { describe, expect, it } from 'vitest';
import {
  AISLES, AISLE_HALF, GATE_HALF, PARAPET_R, SECTIONS, STAND_GAPS, TUNNEL_A, TUNNEL_HALF, TUNNEL_MOUTH_R, WALL_R, angleDiff, inAisle, inGate, inTunnel,
  standExits, standOpen, tierRadius, tierTop,
} from '../src/world/geew';
import { Batch } from '../src/world/batch';
import {
  ARENA_FLOOR, CLIMB_HALF, WALKWAY_R, aisleProfile, aisleStairs, climbHeight, drummersStand, fightersGate, interiorSpots, mediaZone, prepCorner,
  standSection, tunnel, type ArenaKit, type Climb,
} from '../src/world/arenaModules';
import { standSeats } from '../src/arena/program';

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
  const climbs: Climb[] = [];
  const kit: ArenaKit = {
    plain: new Batch(), concrete: new Batch(), base: ARENA_FLOOR, lite: false,
    solid: (x, z, w, d, h) => cols.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h }),
    sign: text => { signs.push(text); },
    climb: c => { climbs.push(c); },
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
  it('every aisle can be climbed from the walkway to the top tier: nothing in the way, the steps rise', () => {
    expect(climbs).toHaveLength(AISLES.length);
    const PLAYER_R = 0.5;
    const clearance = (x: number, z: number) => Math.min(...cols.map(c => Math.hypot(x - Math.min(Math.max(x, c.x0), c.x1), z - Math.min(Math.max(z, c.z0), c.z1))));
    for (const c of climbs) {
      let last = -1;
      for (let u = WALKWAY_R; u <= 21.0; u += 0.1) {
        const x = cx + Math.sin(c.a) * u, z = cz + Math.cos(c.a) * u;
        expect(clearance(x, z), `aisle ${c.a.toFixed(2)} at ${u.toFixed(1)} m`).toBeGreaterThan(PLAYER_R);
        const h = climbHeight(c, x, z) ?? 0;
        expect(h).toBeGreaterThanOrEqual(last); last = h;
      }
      expect(last).toBeGreaterThan(2.7);                                             // standing on the top tier
      expect(climbHeight(c, cx + Math.sin(c.a + 0.3) * 19, cz + Math.cos(c.a + 0.3) * 19)).toBeNull();   // only in the aisle
    }
    expect(CLIMB_HALF).toBeGreaterThan(0.8);
    const steps = aisleProfile();
    for (let i = 1; i < steps.length; i++) { expect(steps[i][2]).toBeGreaterThan(steps[i - 1][2]); expect(steps[i][2] - steps[i - 1][2]).toBeLessThan(0.65); }
  });
  it('from an aisle, the places of every tier next to it can be taken, and standing up leads back into the aisle', () => {
    const seats = standSeats(cx, cz, 't');
    expect(seats.length).toBeGreaterThan(200);
    for (const s of seats) {
      const [exit] = standExits(cx, cz, s.a, s.tier);
      // the exit is in an aisle, clear for the player, at the tier's height
      const c = climbs.find(k => climbHeight(k, exit.x, exit.z) !== null)!;
      expect(c, `seat ${s.id}`).toBeTruthy();
      expect(climbHeight(c, exit.x, exit.z)! + 0.1).toBeCloseTo(tierTop(s.tier), 6);
      expect(cols.every(k => Math.hypot(exit.x - Math.min(Math.max(exit.x, k.x0), k.x1), exit.z - Math.min(Math.max(exit.z, k.z0), k.z1)) >= 0.5)).toBe(true);
    }
    // the places nearest an aisle on its tier are within the seats' reach (3.4 m) of the aisle's tread
    for (const al of AISLES) for (let t = 0; t < 3; t++) {
      const [exit] = standExits(cx, cz, al, t);
      const near = seats.filter(s => s.tier === t && Math.abs(angleDiff(s.a, al)) < 0.2);
      expect(near.length).toBeGreaterThan(0);
      expect(Math.min(...near.map(s => Math.hypot(s.x - exit.x, s.z - exit.z)))).toBeLessThan(3.4);
    }
  });
});
