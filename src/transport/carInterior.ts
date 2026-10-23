import * as THREE from 'three';
import { CAR_MODELS, carModelDims, type CarModelId, type VehicleSpec as KitSpec } from '../actors/vehicleKit';

/**
 * The inside of a car at the wheel (« Au volant »): a real, physical interior in the CAR's own frame (a child of the vehicle's body, so it sways,
 * bounces and turns with the car), never in the camera's. Built from the car's own numbers (src/actors/vehicleKit.ts: the windscreen, the roof, the
 * doors, the seats), so every model gets its own proportions: the dashboard from the foot of the windscreen back to the driver, the instrument cluster
 * under its hood behind the wheel, a centre screen, the steering wheel where the driver's hands are (it turns with the steering), the door cards and
 * their window sills, the pillars, the windscreen header and the headliner, the rear-view mirror and the sun visors, the seats beside and behind.
 * The camera sits at the driver's eye (`eye`), fixed in the car, and only the head turns (src/transport/camera.ts `seat`): looking around moves the
 * view across a still interior, the street is seen through the glass, everything is depth-tested like the rest of the world.
 *
 * An authored body (scripts/vehicles/author: Teranga, Rafet, Lamane Sport, Gaïndé) keeps its shell in this view: from inside its faces turn away
 * (the glass, the roof, the doors) but its bonnet and its mirrors show through the windscreen and the side windows. Any other body (the generated
 * shell of the Berline moderne, the kit's procedural cars) is not drawn from inside, and the interior adds a bonnet in the car's paint.
 *
 * Budget: three meshes (the shell, the wheel, the two screens on one canvas), one shared vertex-coloured Lambert material for the first two; about
 * 1 600 triangles; the screens are redrawn at most four times a second, only when what they show has changed; nothing is allocated per frame.
 * Two trims: « city » (grey plastics and fabric: the Teranga, the Rafet, the saloons) and « premium » (black leather, tan seats and door inserts,
 * a metal strip, a wider screen: the Lamane Sport, the Gaïndé, the berline).
 */
export type Trim = 'city' | 'premium';
export interface InteriorState { kmh: number; rpm: number; nav: { glyph: string; dist: string; text: string } | null; radio: string | null; clock: string }

/** The car's numbers the interior is built from (metres, the vehicle's frame: x to the left, y up, z forward; the driver sits on the left, +x). */
export interface Cabin {
  L: number; W: number; roof: number; sill: number; nose: number;
  /** Foot of the windscreen: its height (the belt line) and z; top of the windscreen (the roof's front edge) and the roof's back edge; the B pillar. */
  cowl: number; zWs: number; zRf: number; zRr: number; zB: number;
  /** How far the glass stands in from the body side at the belt and at the roof. */
  inG: number; inR: number;
  /** The driver's seat (top of the cushion, x, z); the rear bench's z (null: no rear seats). */
  seatTop: number; driverX: number; frontZ: number; rearZ: number | null;
}

/** The kit's proportions of the bodies with no model of their own (src/actors/vehicleKit.ts: its saloon, luxury saloon and SUV). */
const KIND_CABIN: Record<string, Omit<Cabin, 'driverX'>> = {
  sedan: { L: 4.5, W: 1.78, roof: 1.43, sill: 0.27, nose: 0.74, cowl: 0.95, zWs: 0.95, zRf: 0.08, zRr: -0.9, zB: -0.25, inG: 0.07, inR: 0.22, seatTop: 0.52, frontZ: 0, rearZ: -0.92 },
  luxury: { L: 5.15, W: 1.92, roof: 1.45, sill: 0.28, nose: 0.76, cowl: 0.98, zWs: 1.08, zRf: 0.12, zRr: -1.1, zB: -0.35, inG: 0.08, inR: 0.24, seatTop: 0.52, frontZ: 0, rearZ: -1.1 },
  suv: { L: 4.85, W: 1.94, roof: 1.9, sill: 0.42, nose: 1.06, cowl: 1.2, zWs: 1.1, zRf: 0.55, zRr: -2.24, zB: -0.15, inG: 0.06, inR: 0.14, seatTop: 0.72, frontZ: 0.2, rearZ: -0.85 },
};

/**
 * The cabin of a kit car spec: its seats, doors, steering and size are read from the spec; the windscreen's top and the glass insets, which the spec
 * does not carry, from the body it was built as (a car model of its own, else the kit kind of the same size).
 */
export function cabinOf(k: KitSpec): Cabin {
  const st = k.controls.steering, cowl = st[1] - 0.08, zWs = st[2] + 0.42;                 // the kit puts the wheel at (0.36, cowl + 0.08, zWs − 0.42)
  const drv = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const rear = k.seats.filter(s => s.z < drv.z - 0.4);
  const door = k.doors.find(d => d.seats.includes(drv.id));
  const cands: Omit<Cabin, 'driverX'>[] = [...(Object.keys(CAR_MODELS) as CarModelId[]).map(id => { const d = carModelDims(id); return { ...d, rearZ: d.rearZ }; }), ...Object.values(KIND_CABIN)];
  const miss = (c: Omit<Cabin, 'driverX'>) => Math.abs(c.L - k.length) + Math.abs(c.W - k.width) + Math.abs(c.roof - k.height) + Math.abs(c.cowl - cowl) + Math.abs(c.zWs - zWs);
  const best = cands.reduce((a, b) => (miss(b) < miss(a) ? b : a));
  const base: Omit<Cabin, 'driverX'> = miss(best) < 0.05 ? best : {
    L: k.length, W: k.width, roof: k.height, sill: door?.y ?? 0.3, nose: cowl - 0.2, cowl, zWs,
    zRf: zWs - 1.4 * (k.height - cowl), zRr: -k.length / 2 + 1.1, zB: door ? 2 * door.z - zWs : zWs - 1.1, inG: 0.07, inR: 0.2, seatTop: drv.top, frontZ: drv.z, rearZ: null,
  };
  return { ...base, L: k.length, W: k.width, roof: k.height, cowl, zWs, seatTop: drv.top, driverX: drv.x, frontZ: drv.z, rearZ: rear.length ? rear[0].z : null };
}

// ------------------------------------------------------------------------------------------------ colours
interface Palette { dash: number; dashTop: number; trim: number; strip: number; door: number; insert: number; sill: number; liner: number; seat: number; console: number; wheel: number; hub: number; vent: number; floor: number }
const PALETTES: Record<Trim, Palette> = {
  city: { dash: 0x5f636b, dashTop: 0x6f737b, trim: 0x8c9098, strip: 0xa4a8b0, door: 0x6c7078, insert: 0x8f939b, sill: 0x50545b, liner: 0xd2cec4, seat: 0x5a5e66, console: 0x4c4f56, wheel: 0x3a3c42, hub: 0x7a7d84, vent: 0x1a1b1f, floor: 0x3a3c40 },
  premium: { dash: 0x403936, dashTop: 0x4d4541, trim: 0x5e5550, strip: 0xd0d3d8, door: 0x51463f, insert: 0xb88459, sill: 0x3a332f, liner: 0xc2bab0, seat: 0xa8754d, console: 0x37302d, wheel: 0x2c2826, hub: 0xa5a8ae, vent: 0x161515, floor: 0x302b28 },
};

// ------------------------------------------------------------------------------------------------ geometry
type V3 = [number, number, number];
const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();

/** Triangles with flat normals and a colour per vertex, merged into one non-indexed geometry. */
class Soup {
  pos: number[] = []; nor: number[] = []; col: number[] = []; uv: number[] = [];
  private c = new THREE.Color();
  /** One triangle facing `out` (its winding is turned round if it faced the other way), lit with its own normal or `lit`. */
  tri(a: V3, b: V3, c: V3, color: number, out?: V3, lit?: V3) {
    v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); w.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); n.crossVectors(v, w);
    if (out && n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) { [b, c] = [c, b]; n.negate(); }
    n.normalize(); if (lit) n.set(lit[0], lit[1], lit[2]).normalize();
    this.c.setHex(color);
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n.x, n.y, n.z); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: number, out?: V3, lit?: V3) { this.tri(a, b, c, color, out, lit); this.tri(a, c, d, color, out, lit); }
  /** A three.js geometry, transformed, in one colour. */
  geo(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4) {
    const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
    if (m) flat.applyMatrix4(m);
    const P = flat.getAttribute('position'), N = flat.getAttribute('normal'); this.c.setHex(color);
    for (let i = 0; i < P.count; i++) { this.pos.push(P.getX(i), P.getY(i), P.getZ(i)); this.nor.push(N.getX(i), N.getY(i), N.getZ(i)); this.col.push(this.c.r, this.c.g, this.c.b); }
    flat.dispose();
  }
  /** A box `size` centred at `at`, turned by `rot` (x, y, z Euler) about its centre. */
  box(size: V3, at: V3, color: number, rot: V3 = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
    this.geo(new THREE.BoxGeometry(...size), color, m);
  }
  /** A bar from a to b, `wide` across (kept level) and `thick` the other way. */
  beam(a: V3, b: V3, wide: number, thick: number, color: number) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const m = new THREE.Matrix4().lookAt(A, B, new THREE.Vector3(0, 1, 0)); m.setPosition(A.add(B).multiplyScalar(0.5));
    this.geo(new THREE.BoxGeometry(wide, thick, len), color, m);
  }
  /** A cross-section in the (z, y) plane drawn out along x from x0 to x1, closed at both ends. */
  prism(profile: [number, number][], x0: number, x1: number, color: number, top?: { color: number; below: number }) {
    let p = profile; let area = 0;
    for (let i = 0; i < p.length; i++) { const [z0, y0] = p[i], [z1, y1] = p[(i + 1) % p.length]; area += z0 * y1 - z1 * y0; }
    if (area < 0) p = [...p].reverse();                                        // counter-clockwise in (z, y): each edge's outward normal is (dz → y, −dz…)
    for (let i = 0; i < p.length; i++) {
      const [za, ya] = p[i], [zb, yb] = p[(i + 1) % p.length], out: V3 = [0, -(zb - za), yb - ya];
      const col = top && out[1] > 0.3 * Math.hypot(out[1], out[2]) && Math.min(ya, yb) > top.below ? top.color : color;   // the upward faces of the top in their own colour
      this.quad([x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], col, out);
    }
    const tris = THREE.ShapeUtils.triangulateShape(p.map(([z, y]) => new THREE.Vector2(z, y)), []);
    for (const [a, b, c] of tris) for (const [x, s] of [[x0, -1], [x1, 1]] as const) this.tri([x, p[a][1], p[a][0]], [x, p[b][1], p[b][0]], [x, p[c][1], p[c][0]], color, [s, 0, 0]);
  }
  build(uv = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    else { g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); }
    g.computeBoundingSphere();
    return g;
  }
}

let shared: THREE.MeshLambertMaterial | null = null;
/** One material for every car's interior (the colours are in the vertices); kept across districts. */
const material = () => shared ??= Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1c1d21 }), { name: 'car_interior', userData: { shared: true } });

/** The canvas the two screens share: the cluster in the left half's top, the centre screen in the right half. */
const CW = 512, CH = 160, CLUSTER = { x: 0, y: 0, w: 256, h: 80 }, SCREEN = { x: 256, y: 0, w: 256, h: 160 };
/** How far the steering wheel turns at full lock (rad). */
export const WHEEL_LOCK = 2.2;

export class CarInterior {
  /** In the vehicle's frame: add it to the vehicle's body (Vehicle.body) and it moves with the car. */
  readonly group = new THREE.Group();
  /** The driver's eye, in the same frame. */
  readonly eye: THREE.Vector3;
  /** The centre of the steering wheel and its column's angle above the horizontal. */
  readonly wheelAt: THREE.Vector3;
  readonly column = 0.42;
  /** Triangles drawn (all three meshes). */
  readonly tris: number;
  private spin: THREE.Mesh;
  private cv: HTMLCanvasElement | null = null; private tex: THREE.CanvasTexture | null = null;
  private drawT = 0; private key = '';
  /** Where the bonnet's colours start in the shell's colour attribute (−1: none), and the paint drawn now. */
  private bonnetAt = -1; private bonnetN = 0; private scuttleAt = -1; private paint = -1; private bonnetPos: Float32Array | null = null; private readonly tint = new THREE.Color();
  private shell: THREE.Mesh;
  private own: { dispose(): void }[] = [];

  constructor(readonly cabin: Cabin, readonly trim: Trim) {
    const c = cabin, P = PALETTES[trim], g = this.group; g.name = 'car_interior'; g.visible = false;
    const dx = c.driverX, hw = c.W / 2 - 0.075, hwG = c.W / 2 - c.inG, hwR = c.W / 2 - c.inR, floor = c.sill + 0.06;
    this.eye = new THREE.Vector3(dx, c.seatTop + 0.72, c.frontZ - 0.17);
    const E = this.eye, C = this.wheelAt = new THREE.Vector3(dx, E.y - 0.31, E.z + 0.42);
    const zLip = C.z + 0.12, yLip = Math.max(c.cowl + 0.04, E.y - 0.21), zF = c.zWs + 0.04;      // the dash's rear edge, a little above the foot of the glass, at a set height under the eye
    const s = new Soup();

    // ---- the dashboard: across the car under the windscreen, its top rising a little toward the driver, a face leaning back (screens, vents), the lower part
    // sloping away over the knees; a strip of trim along the face; the hood over the cluster in front of the driver
    const faceZ = (y: number) => zLip + 0.015 - ((yLip - 0.01 - y) / 0.14) * 0.025;            // the face's z at height y (its foot is nearer the driver: it looks up at the eye)
    s.prism([[zF, c.cowl - 0.015], [zLip + 0.05, yLip], [faceZ(yLip - 0.01), yLip - 0.01], [faceZ(yLip - 0.2), yLip - 0.2], [zLip + 0.1, c.cowl - 0.36], [zF, c.cowl - 0.36]], -hw, hw, P.dash, { color: P.dashTop, below: c.cowl - 0.05 });
    s.prism([[zLip + 0.2, yLip - 0.004], [zLip + 0.06, yLip + 0.06], [zLip - 0.03, yLip + 0.05], [zLip - 0.024, yLip + 0.03], [zLip + 0.03, yLip - 0.004]], dx - 0.165, dx + 0.165, P.dash, { color: P.dashTop, below: yLip });
    s.box([dx - 0.24 + hw, 0.012, 0.012], [(-hw + dx - 0.24) / 2, yLip - 0.022, faceZ(yLip - 0.022) - 0.004], P.strip);
    for (const vx of [-hw + 0.12, -0.17, 0.17]) s.box([0.12, 0.035, 0.012], [vx, yLip - 0.05, faceZ(yLip - 0.05) - 0.005], P.vent);   // air vents
    s.box([0.07, 0.11, 0.012], [hw - 0.07, yLip - 0.06, faceZ(yLip - 0.06) - 0.005], P.vent);
    // the centre stack down to the floor and the console between the seats, a gear selector on it
    s.box([0.26, c.cowl - 0.36 - floor, 0.3], [0, (c.cowl - 0.36 + floor) / 2, zLip + 0.2], P.console);
    const conZ0 = c.frontZ - 0.25, conZ1 = zLip + 0.12;
    s.box([0.22, c.seatTop + 0.08 - floor, conZ1 - conZ0], [0, (c.seatTop + 0.08 + floor) / 2, (conZ0 + conZ1) / 2], P.console);
    s.box([0.05, 0.07, 0.07], [0, c.seatTop + 0.115, c.frontZ + 0.28], P.trim);
    // the steering column into the dash
    const col = new THREE.Vector3(0, -Math.sin(this.column), Math.cos(this.column));
    const c0 = C.clone().addScaledVector(col, 0.06), c1 = C.clone().addScaledVector(col, 0.26);
    s.beam([c0.x, c0.y, c0.z], [c1.x, c1.y, c1.z], 0.07, 0.07, P.console);
    s.beam([dx, c1.y + 0.01, c1.z - 0.07], [dx, c1.y - 0.02, c1.z + 0.08], 0.13, 0.1, P.dash);

    // ---- the doors (both sides): a card from the dash back past the rear seats, its window sill (the belt line), an armrest and a pull, an insert
    const zDoor0 = c.zWs - 0.02, zDoor1 = (c.rearZ ?? c.frontZ - 0.6) - 0.35, belt = c.cowl + 0.015;
    for (const sx of [1, -1]) {
      const x = sx * hw;
      s.box([0.05, belt - floor, zDoor1 - zDoor0], [x + sx * 0.02, (belt + floor) / 2, (zDoor0 + zDoor1) / 2], P.door);
      s.box([0.07, 0.03, zDoor1 - zDoor0], [x + sx * 0.01, belt + 0.005, (zDoor0 + zDoor1) / 2], P.sill);
      s.box([0.012, 0.16, 0.62], [x - sx * 0.006, belt - 0.14, c.frontZ + 0.15], P.insert);
      s.box([0.07, 0.04, 0.34], [x - sx * 0.035, c.seatTop + 0.2, c.frontZ + 0.08], P.trim);
      s.box([0.03, 0.03, 0.12], [x - sx * 0.02, belt - 0.05, c.frontZ + 0.42], P.strip);
      if (c.rearZ !== null) s.box([0.012, 0.14, 0.5], [x - sx * 0.006, belt - 0.14, c.rearZ + 0.05], P.insert);
    }

    // ---- the roof structure: A pillars from the dash's corners to the roof, the header over the windscreen, the side rails, the B pillars, the headliner
    const yR = c.roof - 0.055;
    for (const sx of [1, -1]) {
      s.beam([sx * (hwG - 0.03), c.cowl - 0.01, c.zWs + 0.01], [sx * (hwR - 0.02), yR, c.zRf + 0.02], 0.065, 0.05, P.trim);
      s.beam([sx * (hwR - 0.02), yR, c.zRf], [sx * (hwR - 0.02), yR, c.zRr], 0.06, 0.05, P.trim);
      s.beam([sx * (hwG - 0.035), belt, c.zB], [sx * (hwR - 0.025), yR, c.zB - 0.04], 0.07, 0.11, P.trim);
    }
    s.box([2 * hwR, 0.05, 0.08], [0, yR - 0.005, c.zRf - 0.005], P.trim);
    const ln = (x: number, z: number): V3 => [x, c.roof - 0.04, z];
    s.quad(ln(-hwR, c.zRf), ln(hwR, c.zRf), ln(hwR, c.zRr), ln(-hwR, c.zRr), P.liner, [0, -1, 0], [0, 1, 0]);   // lit as if it faced the sky (the light the windows let in), not the ground
    // the rear-view mirror on its stalk, the sun visors folded up
    const kG = (z: number) => c.cowl + ((c.zWs - z) / (c.zWs - c.zRf)) * (yR + 0.005 - c.cowl);   // the glass's height at z
    const mz = c.zRf + 0.1, my = Math.min(kG(mz + 0.03), yR) - 0.085;
    s.beam([0, yR - 0.02, c.zRf + 0.02], [0, my + 0.02, mz], 0.025, 0.02, P.trim);
    s.box([0.22, 0.06, 0.025], [0, my, mz], P.dash, [-0.15, 0, 0]);
    s.box([0.2, 0.045, 0.004], [0, my - 0.002, mz - 0.013], 0x7c8a96, [-0.15, 0, 0]);
    for (const sx of [1, -1]) s.box([0.34, 0.016, 0.15], [sx * 0.37, yR - 0.03, c.zRf - 0.1], P.liner);

    // ---- the seats: the driver's and the passenger's (cushion, back, headrest on the passenger's), the rear bench; the floor
    for (const sx of [1, -1]) {
      const x = sx * Math.abs(dx);
      s.box([0.5, 0.13, 0.52], [x, c.seatTop - 0.065, c.frontZ], P.seat);
      s.box([0.5, 0.62, 0.12], [x, c.seatTop + 0.29, c.frontZ - 0.3], P.seat, [-0.2, 0, 0]);
      if (sx < 0) s.box([0.26, 0.17, 0.1], [x, c.seatTop + 0.7, c.frontZ - 0.39], P.seat, [-0.2, 0, 0]);
    }
    if (c.rearZ !== null) {
      s.box([c.W - 0.36, 0.13, 0.5], [0, c.seatTop - 0.045, c.rearZ], P.seat);
      s.box([c.W - 0.36, 0.6, 0.12], [0, c.seatTop + 0.3, c.rearZ - 0.28], P.seat, [-0.18, 0, 0]);
    }
    s.box([2 * hw, 0.02, c.zWs - (c.rearZ ?? c.frontZ) + 0.3], [0, floor - 0.01, (c.zWs + (c.rearZ ?? c.frontZ) - 0.3) / 2], P.floor);

    // ---- a bonnet for a body that is not drawn from inside (setPaint gives it the car's colour): from the foot of the windscreen to the nose, crowned
    this.bonnetAt = s.pos.length / 3;
    const zN = c.L / 2 - 0.3, bw0 = c.W / 2 - 0.1, bw1 = c.W / 2 - 0.28, crown = 0.035;
    const bp = (k: number, t: number): V3 => {                                                   // k: −1 … 1 across, t: 0 at the windscreen … 1 at the nose
      const half = bw0 + (bw1 - bw0) * t, y = c.cowl - 0.02 + (c.nose - c.cowl + 0.02) * t - crown * k * k;
      return [k * half, y, c.zWs + 0.03 + (zN - c.zWs - 0.03) * t];
    };
    for (const [k0, k1] of [[-1, -0.4], [-0.4, 0.4], [0.4, 1]]) for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) s.quad(bp(k0, t0), bp(k1, t0), bp(k1, t1), bp(k0, t1), 0x888888, [0, 1, 0]);
    this.scuttleAt = s.pos.length / 3;
    s.box([2 * bw0, 0.03, 0.09], [0, c.cowl - 0.01, c.zWs + 0.05], 0x111214);                  // the scuttle and its wipers, at the glass
    this.bonnetN = s.pos.length / 3 - this.bonnetAt;

    const shell = this.shell = new THREE.Mesh(s.build(), material()); shell.name = 'car_interior_shell';
    g.add(shell);

    // ---- the steering wheel: a rim, three spokes (the top half open: the cluster is read through it), a hub with its pad; it turns about the column
    const R = c.W > 1.9 ? 0.18 : 0.17, ws = new Soup();
    ws.geo(new THREE.TorusGeometry(R, 0.016, 8, 28), P.wheel);
    ws.geo(new THREE.CylinderGeometry(0.062, 0.07, 0.06, 14).rotateX(Math.PI / 2), P.wheel);
    ws.box([0.11, 0.08, 0.02], [0, -0.004, -0.035], P.hub);
    for (const a of [-0.2, Math.PI + 0.2]) ws.geo(new THREE.BoxGeometry(R - 0.05, 0.034, 0.016).translate((R - 0.05) / 2 + 0.05, 0, 0).rotateZ(a), P.wheel);
    ws.geo(new THREE.BoxGeometry(0.03, R - 0.06, 0.016).translate(0, -(R - 0.06) / 2 - 0.055, 0), P.wheel);
    this.spin = new THREE.Mesh(ws.build(), material()); this.spin.name = 'car_interior_wheel';
    const tilt = new THREE.Group(); tilt.position.copy(C); tilt.rotation.x = this.column;     // its back (−z) faces the driver, its top leans toward the glass
    tilt.add(this.spin); g.add(tilt);

    // ---- the screens: the cluster on the face under the hood, behind the wheel; the centre screen in the middle of the face (a wider one on the premium trim)
    const doc = typeof document !== 'undefined';
    if (doc) { this.cv = document.createElement('canvas'); this.cv.width = CW; this.cv.height = CH; this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; }
    const sm = new THREE.MeshBasicMaterial({ map: this.tex, color: doc ? 0xffffff : 0x111111 });
    const sc = new Soup();
    const panel = (x: number, wdt: number, y0: number, y1: number, r: { x: number; y: number; w: number; h: number }) => {
      const z0 = faceZ(y0) - 0.006, z1 = faceZ(y1) - 0.006, u0 = r.x / CW, u1 = (r.x + r.w) / CW, v0 = 1 - (r.y + r.h) / CH, v1 = 1 - r.y / CH;
      const a: V3 = [x + wdt / 2, y0, z0], b: V3 = [x - wdt / 2, y0, z0], cc: V3 = [x - wdt / 2, y1, z1], d: V3 = [x + wdt / 2, y1, z1];   // +x is the driver's left
      sc.pos.push(...a, ...b, ...cc, ...a, ...cc, ...d); sc.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    panel(dx, 0.26, yLip - 0.094, yLip - 0.012, CLUSTER);
    const sw = trim === 'premium' ? 0.25 : 0.2;
    panel(0.02, sw, yLip - 0.025 - sw * 0.625, yLip - 0.025, SCREEN);
    const screens = new THREE.Mesh(sc.build(true), sm); screens.name = 'car_interior_screens';
    g.add(screens);

    for (const m of [shell, this.spin, screens]) { m.castShadow = false; m.receiveShadow = false; }
    this.tris = [shell, this.spin, screens].reduce((t, m) => t + m.geometry.getAttribute('position').count / 3, 0);
    this.own.push(shell.geometry, this.spin.geometry, screens.geometry, sm, ...(this.tex ? [this.tex] : []));
  }

  /** The bonnet in the car's paint (`hex`), or none (null: the car's own shell is drawn from inside and shows its bonnet). */
  setPaint(hex: number | null) {
    const key = hex ?? -2; if (key === this.paint) return; this.paint = key;
    const g = this.shell.geometry, col = g.getAttribute('color') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute;
    const keep = this.bonnetPos ??= (pos.array as Float32Array).slice(this.bonnetAt * 3, (this.bonnetAt + this.bonnetN) * 3);
    for (let i = 0; i < this.bonnetN; i++) {
      const j = this.bonnetAt + i, k = hex === null ? 0 : i * 3;                                 // no bonnet: its triangles folded onto one point (nothing drawn, still one draw)
      pos.setXYZ(j, keep[k], keep[k + 1], keep[k + 2]);
      const t = this.tint.setHex(j < this.scuttleAt ? hex ?? 0 : 0x111214); col.setXYZ(j, t.r, t.g, t.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  /** The wheel follows the steering (−1 full left … 1 full right, drive.ts). */
  steer(s: number) { this.spin.rotation.z = s * WHEEL_LOCK; }

  /** True at most four times a second: then `draw` with what the screens show. */
  due(dt: number) { this.drawT -= dt; if (this.drawT > 0) return false; this.drawT = 0.25; return true; }

  /** Redraws the screens when what they show has changed. */
  draw(s: InteriorState) {
    const key = `${Math.round(s.kmh)}|${Math.round(s.rpm * 12)}|${s.nav ? `${s.nav.glyph}${s.nav.dist}` : ''}|${s.radio ?? ''}|${s.clock}`;
    if (key === this.key) return; this.key = key;
    const cv = this.cv, t = this.tex; if (!cv || !t) return;
    const c = cv.getContext('2d'); if (!c) return;
    this.drawCluster(c, s); this.drawScreen(c, s);
    t.needsUpdate = true;
  }

  private drawCluster(c: CanvasRenderingContext2D, s: InteriorState) {
    const { x, y, w, h } = CLUSTER, prem = this.trim === 'premium';
    c.fillStyle = '#07080a'; c.fillRect(x, y, w, h);
    // the revs: a row of amber segments, red at the top
    const nSeg = 12, on = Math.round(Math.max(0, Math.min(1, s.rpm)) * nSeg);
    for (let i = 0; i < nSeg; i++) { c.fillStyle = i < on ? (i > 9 ? '#ef4444' : prem ? '#e8d3a3' : '#f59e0b') : '#24262b'; c.fillRect(x + 12 + i * 15, y + 7, 12, 6); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff'; c.font = '800 44px system-ui, sans-serif'; c.fillText(String(Math.round(s.kmh)), x + 98, y + 48);
    c.fillStyle = '#9aa3ad'; c.font = '700 14px system-ui, sans-serif'; c.fillText('km/h', x + 98, y + 72);
    // the right of the cluster: the next turn when there are directions, else the time
    if (s.nav) {
      c.fillStyle = '#ffd23f'; c.font = '800 30px system-ui, sans-serif'; c.fillText(s.nav.glyph, x + 210, y + 36);
      c.fillStyle = '#ffffff'; c.font = '700 15px system-ui, sans-serif'; c.fillText(s.nav.dist, x + 210, y + 64);
    } else { c.fillStyle = '#c9d1d9'; c.font = '700 20px system-ui, sans-serif'; c.fillText(s.clock, x + 210, y + 46); }
  }

  private drawScreen(c: CanvasRenderingContext2D, s: InteriorState) {
    const { x, y, w, h } = SCREEN, prem = this.trim === 'premium', cx = x + w / 2;
    c.fillStyle = prem ? '#0b1220' : '#0d1117'; c.fillRect(x, y, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s.nav) {
      c.fillStyle = '#ffd23f'; c.font = '800 60px system-ui, sans-serif'; c.fillText(s.nav.glyph, cx, y + 56);
      c.fillStyle = '#ffffff'; c.font = '800 28px system-ui, sans-serif'; c.fillText(s.nav.dist, cx, y + 108);
      c.fillStyle = '#9aa3ad'; c.font = '600 15px system-ui, sans-serif'; c.fillText(s.nav.text.split(' · ').pop()!.slice(0, 26), cx, y + 140);
    } else if (s.radio) {
      c.fillStyle = '#ffd23f'; c.font = '700 22px system-ui, sans-serif'; c.fillText('RADIO', cx, y + 40);
      c.fillStyle = '#ffffff'; c.font = '800 27px system-ui, sans-serif'; c.fillText(s.radio.slice(0, 18), cx, y + 86);
      c.fillStyle = '#9aa3ad'; c.font = '600 16px system-ui, sans-serif'; c.fillText(s.clock, cx, y + 128);
    } else {
      c.fillStyle = '#ffffff'; c.font = '800 44px system-ui, sans-serif'; c.fillText(s.clock, cx, y + 68);
      c.fillStyle = '#9aa3ad'; c.font = '600 18px system-ui, sans-serif'; c.fillText('Dakar Rek', cx, y + 116);
    }
  }

  dispose() { for (const o of this.own) o.dispose(); this.group.removeFromParent(); }
}
