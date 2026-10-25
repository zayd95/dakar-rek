import * as THREE from 'three';
import type { Batch } from '../world/batch';
import type { Collider } from '../world/types';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { HALF_GROUND, type Road } from './routes';

/**
 * The autopont at the way into Mermoz (RouteDef.autopont, the owner's ask after the M1 video): a flyover of the city's kind, a cross road carried over the road to Mermoz on a
 * concrete deck, its ramps coming down either side along that cross road. The road to Mermoz is driven under it; nothing turns off. A few cars cross on the deck (`AutopontTraffic`).
 *
 * Frames: the road's own (district a's). `ds` is along the road from the deck's middle, `t` across it along the cross road (positive to the left of a → b).
 */
export const AP = {
  /** The deck's road surface height over the flat part, and its underside (the clearance). */
  TOP: 6.4, UNDER: 5.6,
  /** The flat part of the deck either side of the road's centre line, and where the ramps reach the ground. */
  FLAT: 18, FOOT: 62,
  /** The deck's width along the road (two lanes, two kerbs, two parapets). */
  WIDTH: 12,
  /** The piers, either side of the road, just off its drivable ground. */
  PIER: HALF_GROUND + 1.6,
} as const;

export interface AutopontLayout {
  name: string; s: number; x: number; z: number; fx: number; fz: number; lx: number; lz: number;
  at(ds: number, t: number): { x: number; z: number };
}
export function autopontLayout(road: Road): AutopontLayout | null {
  const a = road.autopontS; if (!a) return null;
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
  return { name: a.name, s: a.s, x: a.x, z: a.z, fx, fz, lx, lz, at: (ds, t) => ({ x: a.x + fx * ds + lx * t, z: a.z + fz * ds + lz * t }) };
}
/** The deck's road surface height at `t` along the cross road (flat over the road, a straight ramp down to the ground beyond). */
export function deckHeight(t: number): number {
  const u = Math.abs(t);
  if (u <= AP.FLAT) return AP.TOP;
  if (u >= AP.FOOT) return 0.1;
  const k = (u - AP.FLAT) / (AP.FOOT - AP.FLAT), e = k * k * (3 - 2 * k);                      // eased at both ends, as a ramp's vertical curve
  return AP.TOP + (0.1 - AP.TOP) * e;
}
/** Is a road-frame point on the autopont's ramps or piers (its solid parts, off the road's ground)? */
export function onAutopont(lay: AutopontLayout | null, x: number, z: number): boolean {
  if (!lay) return false;
  const dx = x - lay.x, dz = z - lay.z, ds = dx * lay.fx + dz * lay.fz, t = dx * lay.lx + dz * lay.lz;
  return Math.abs(ds) < AP.WIDTH / 2 + 3 && Math.abs(t) > AP.PIER - 1.5 && Math.abs(t) < AP.FOOT + 4;
}

/**
 * The flyover's concrete: the deck (its slab, edge beams, parapets, lanes, lamps), its ramps and their retaining walls, the piers (two round columns and a cap each side), the
 * name board on the fascia each way, the darker asphalt in its shade under it. Built once, by the chunk that holds its middle.
 */
export function buildAutopontStatic(lay: AutopontLayout, b: { plain: Batch; asphalt: Batch }, colliders: Collider[], lite: boolean) {
  const { plain } = b, CONC = 0xcfc9bc, CONC_D = 0xa9a396, yaw = Math.atan2(lay.lx, lay.lz);                           // `yaw`: along the cross road (+t)
  const W = AP.WIDTH, STEP = 4;
  // the deck and its ramps, piece by piece along the cross road: the slab (its underside a little darker), the asphalt on it, the parapets, the white edge lines
  for (let t = -AP.FOOT; t < AP.FOOT; t += STEP) {
    const t0 = t, t1 = t + STEP, h0 = deckHeight(t0), h1 = deckHeight(t1), tm = (t0 + t1) / 2, hm = (h0 + h1) / 2, len = Math.hypot(STEP, h1 - h0), tilt = Math.atan2(h1 - h0, STEP);
    const c = lay.at(0, tm);
    const flat = Math.abs(tm) <= AP.FLAT + 1;
    if (flat) plain.slab(W, AP.TOP - AP.UNDER, len + 0.05, c.x, (AP.TOP + AP.UNDER) / 2, c.z, CONC_D, yaw, -tilt);
    else {                                                                                                // the ramp: a filled embankment between two retaining walls
      const fillH = Math.max(0.05, Math.min(h0, h1) - 0.05), wallH = Math.max(h0, h1) + 0.9;            // the fill under the sloping asphalt; the walls up to the parapet's height
      plain.box(W - 0.6, fillH, len + 0.05, c.x, 0, c.z, 0xb9ae98, yaw);
      for (const side of [-1, 1]) { const w = lay.at(side * (W / 2 - 0.15), tm); plain.box(0.3, wallH, len + 0.05, w.x, 0, w.z, CONC, yaw); }
      colliders.push(...boxCollider(lay, 0, tm, W, len, wallH));
    }
    const top = new THREE.PlaneGeometry(W - 1.2, len + 0.05); top.rotateX(-Math.PI / 2); top.rotateX(-tilt);
    b.asphalt.geometry(top, 0x4a4d53, c.x, hm + 0.02, c.z, yaw);
    if (flat) for (const side of [-1, 1]) {                                                              // the parapets on the flat part (on the ramps the walls rise above the fill)
      const p = lay.at(side * (W / 2 - 0.2), tm);
      plain.box(0.35, 0.95, len + 0.05, p.x, hm, p.z, CONC, yaw);
    }
    for (const side of [-1, 1]) { const m = lay.at(side * (W / 2 - 0.9), tm); plain.flat(0.15, len, m.x, hm + 0.04, m.z, 0xe8e4d8, yaw); }
    if (Math.round(tm) % 8 === 0) { const m = lay.at(0, tm); plain.flat(0.15, 2.2, m.x, hm + 0.04, m.z, 0xe8e4d8, yaw); }       // the centre dashes
  }
  // the fascias over the road (the reference: a grey steel edge beam with darker V panels), a railing of posts and rails on top, the name board each way
  const STEELG = 0x9ea4aa, VPANEL = 0x6c7278, n = Math.round((2 * AP.FLAT + 4) / 2.4);
  for (const side of [-1, 1]) {
    const e = lay.at(side * (W / 2 + 0.05), 0);
    plain.box(0.3, 1.5, 2 * AP.FLAT + 4, e.x, AP.UNDER - 0.45, e.z, STEELG, yaw);
    for (let k = 0; k < n; k++) {                                                                        // the V panels: dark triangles on the beam's face, alternately up and down
      const t = -AP.FLAT - 2 + (k + 0.5) * ((2 * AP.FLAT + 4) / n), p = lay.at(side * (W / 2 + 0.22), t), tri = new THREE.CircleGeometry(0.72, 3);
      tri.rotateZ(k % 2 ? Math.PI / 2 : -Math.PI / 2);                                                   // (its face out along the road: +f on the +1 side, −f on the other)
      plain.geometry(tri, VPANEL, p.x, AP.UNDER - 0.45, p.z, side > 0 ? yaw - Math.PI / 2 : yaw + Math.PI / 2);
    }
    for (let t = -AP.FLAT; t <= AP.FLAT; t += 1.5) { const p = lay.at(side * (W / 2 - 0.1), t); plain.box(0.06, 1.1, 0.06, p.x, AP.TOP, p.z, 0x5c6066, yaw); }
    const rl = lay.at(side * (W / 2 - 0.1), 0);
    plain.box(0.08, 0.08, 2 * AP.FLAT, rl.x, AP.TOP + 1.1, rl.z, 0x5c6066, yaw); plain.box(0.05, 0.05, 2 * AP.FLAT, rl.x, AP.TOP + 0.55, rl.z, 0x5c6066, yaw);
    const g = lay.at(side * (W / 2 + 0.34), -6);
    plain.box(0.06, 0.9, 6, g.x, AP.UNDER - 1.0, g.z, 0x1f6b3a, yaw);                                   // a green name board hung under the beam, toward the traffic coming in (4.6 m clear)
    plain.box(0.07, 0.1, 6.2, g.x, AP.UNDER - 0.13, g.z, 0xf2f2ec, yaw);
  }
  // the piers (the reference: ochre blades leaning out under a cap beam), two on each side of the road, just off its ground
  const OCHRE = 0xd9b45a, OCHRE_D = 0xb8923e;
  for (const side of [-1, 1]) {
    const cap = lay.at(0, side * AP.PIER);
    plain.box(W + 0.6, 0.8, 1.8, cap.x, AP.UNDER - 0.8, cap.z, OCHRE_D, yaw);
    for (const ds of [-W / 2 + 2.4, -1.0, 1.0, W / 2 - 2.4]) {
      const lean = ds < 0 ? -1 : 1, c = lay.at(ds, side * AP.PIER), hh = AP.UNDER - 0.8;
      const blade = new THREE.BoxGeometry(0.55, hh, 1.4); blade.translate(0, hh / 2, 0); blade.rotateZ(-lean * 0.16);   // leaning out toward the deck's edges
      plain.geometry(blade, Math.abs(ds) > 2 ? OCHRE : OCHRE_D, c.x, 0, c.z, yaw - Math.PI);                   // (its local x along the road: the lean is outward)
      colliders.push({ x0: c.x - 0.7, x1: c.x + 0.7, z0: c.z - 0.7, z1: c.z + 0.7, h: AP.UNDER });
    }
  }
  // lamps on the deck, each side, and the shade under it on the road (the asphalt a little darker, so the deck reads even without the sun's shadow)
  if (!lite) for (const t of [-12, 12]) for (const side of [-1, 1]) {
    const p = lay.at(side * (W / 2 - 0.3), t);
    plain.cyl(0.06, 0.08, 6, p.x, AP.TOP + 0.9, p.z, 0x3e4349, 6);
    plain.box(0.25, 0.12, 1.2, p.x - side * lay.fx * 0.5, AP.TOP + 6.8, p.z - side * lay.fz * 0.5, 0xfff1c0, yaw + Math.PI / 2);
  }
  const shade = new THREE.PlaneGeometry(W + 2, 2 * AP.PIER); shade.rotateX(-Math.PI / 2);
  b.plain.geometry(shade, 0x2e3035, lay.x, 0.086, lay.z, yaw);
}

/** Road-frame colliders for a box centred at (ds, t) of the autopont, `w` across the road's direction and `len` along the cross road, as a chain of small squares (the cross road may run at an angle). */
function boxCollider(lay: AutopontLayout, ds: number, t: number, w: number, len: number, h: number): Collider[] {
  const out: Collider[] = [], n = Math.max(1, Math.round(w / 2.4));
  for (let i = 0; i < n; i++) {
    const p = lay.at(ds - w / 2 + (i + 0.5) * (w / n), t), r = Math.max(w / n, len) / 2;
    out.push({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, h });
  }
  return out;
}

/** The cars crossing on the deck: two lanes, a car or two each way, at town speed, from one ramp's foot to the other; out of sight, back on later. */
export class AutopontTraffic {
  readonly group = new THREE.Group();
  private cars: { g: THREE.Group; dir: 1 | -1; t: number; v: number; wait: number }[] = [];
  constructor(readonly lay: AutopontLayout, lite: boolean, rand: () => number) {
    this.group.name = 'road:autopont-traffic';
    const kinds: VehicleKind[] = ['sedan', 'taxi', 'pickup', 'moto', 'sedan', 'taxi'];
    const n = lite ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const b = buildVehicle(kinds[Math.floor(rand() * kinds.length)], { seed: Math.floor(rand() * 1e6), lite });
      const dir: 1 | -1 = i % 2 ? 1 : -1;
      this.cars.push({ g: b.group, dir, t: -dir * (AP.FOOT - 2) + dir * rand() * AP.FOOT, v: 9 + rand() * 4, wait: 0 });
      this.group.add(b.group);
    }
  }
  update(dt: number, active: boolean) {
    this.group.visible = active;
    if (!active) return;
    for (const c of this.cars) {
      if (c.wait > 0) { c.wait -= dt; c.g.visible = false; if (c.wait <= 0) c.t = -c.dir * (AP.FOOT - 1); continue; }
      c.t += c.dir * c.v * dt;
      if (Math.abs(c.t) > AP.FOOT - 1) { c.wait = 2 + Math.random() * 6; continue; }
      const lane = -c.dir * 2.0;                                                                         // right-hand: the lane on the right of its way across
      const p = this.lay.at(lane, c.t), h = deckHeight(c.t), slope = (deckHeight(c.t + c.dir * 0.5) - deckHeight(c.t - c.dir * 0.5));
      c.g.visible = true;
      c.g.position.set(p.x, h + 0.02, p.z);
      c.g.rotation.set(0, Math.atan2(this.lay.lx * c.dir, this.lay.lz * c.dir), 0);
      c.g.rotateX(-Math.atan2(slope, 1));
    }
  }
  info() { return this.cars.map(c => ({ t: Math.round(c.t * 10) / 10, dir: c.dir, visible: c.g.visible, y: +c.g.position.y.toFixed(2) })); }
  dispose() { this.cars = []; this.group.removeFromParent(); }
}
