import * as THREE from 'three';
import { CAR_MODELS, carModelDims, type CarModelId, type VehicleSpec as KitSpec } from '../actors/vehicleKit';

/**
 * The inside of a car at the wheel (« Au volant »): a real, physical interior in the CAR's own frame (a child of the vehicle's body, so it sways,
 * bounces and turns with the car), never in the camera's. Built from the car's own numbers (src/actors/vehicleKit.ts: the windscreen, the roof, the
 * doors, the seats), so every model gets its own proportions: the dashboard from the foot of the windscreen back to the driver (a padded top with a
 * rolled lip, the binnacle's hood over the instrument cluster behind the wheel, a centre screen in its frame, air vents with their louvres, the climate
 * dials, the glovebox on the passenger's side, the scuttle under the foot of the glass), the steering wheel where the driver's hands are (spokes, the
 * airbag's padded cover; it turns with the steering), the centre console between the seats (the gear lever in its gaiter, the cup holders, the
 * handbrake, the armrest), sport seats (bolstered cushions and backs, inserts with ribs or stitching), the door cards (an insert, the armrest and its
 * pull, the opening lever, a speaker, the map pocket), the pillars, the windscreen header and the headliner, the rear-view mirror and the sun visors.
 * The camera sits at the driver's eye (`eye`), fixed in the car, and only the head turns (src/transport/camera.ts `seat`): looking around moves the
 * view across a still interior, the street is seen through the glass, everything is depth-tested like the rest of the world.
 *
 * An authored body (scripts/vehicles/author: Teranga, Rafet, Lamane Sport, Gaïndé) keeps its shell in this view: from inside its faces turn away
 * (the glass, the roof, the doors) but its bonnet and its mirrors show through the windscreen and the side windows. Any other body (the generated
 * shell of the Berline moderne, the kit's procedural cars) is not drawn from inside, and the interior adds a bonnet in the car's paint.
 *
 * Budget: three meshes (the shell, the wheel, the two screens on one canvas: three draw calls), one shared vertex-coloured Lambert material for the
 * first two; about 3 300 triangles (tests/carInterior.test.ts holds it under 4 000); the screens are redrawn at most four times a second, only when
 * what they show has changed; nothing is allocated per frame. The parts read apart by their colours alone: the dash's pad, its face and its lower
 * part in three tones, the console darker with a piano-black top, the seats' bolsters against their inserts, metal or satin-silver accents.
 * Two trims: « city » (grey plastics, charcoal fabric seats with ribbed grey inserts, satin-silver accents: the Teranga, the Rafet, the saloons) and
 * « premium » (black leather with tan inserts and tan stitching, brushed metal, a wider screen, a red mark on the wheel: the Lamane Sport, the
 * Gaïndé, the berline).
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
interface Palette {
  /** The dash: its top pad (`padTop` its upward faces), the face round the screens and the vents, the lower part over the knees and the glovebox's lid in
   * it; the line along the pad's lip. */
  padTop: number; pad: number; face: number; lower: number; lid: number; stitch: number;
  /** The pillars and roof rails, the headliner; the door cards, their inserts, the window sills. */
  trim: number; liner: number; door: number; doorInsert: number; sill: number;
  /** The accents: brushed metal or satin silver (strips, bezels, handles, the gear's surround), piano black (the console's top, the screen's frame). */
  accent: number; gloss: number;
  /** The vents' mouths and every dark gap; their louvres. */
  vent: number; louvre: number;
  /** The seats: the bolsters, shells and armrests; the centre inserts; the ribs (fabric) or the stitching (leather) across them. */
  bolster: number; insert: number; rib: number;
  console: number; floor: number;
  /** The wheel's rim, its airbag pad, the mark at the top of the rim; the gear knob; the scuttle under the bonnet. */
  wheel: number; hub: number; marker: number; knob: number; scuttle: number;
}
const PALETTES: Record<Trim, Palette> = {
  city: {
    padTop: 0x55585f, pad: 0x45484e, face: 0x666a71, lower: 0x4b4e54, lid: 0x70747b, stitch: 0x55585f, trim: 0x8c9098, liner: 0xd2cec4, door: 0x5a5e65, doorInsert: 0x80848c,
    sill: 0x44474d, accent: 0xb9bdc4, gloss: 0x1a1b1e, vent: 0x16171a, louvre: 0x4a4d53, bolster: 0x2f3136, insert: 0x777b83, rib: 0x999da5, console: 0x2b2d31,
    floor: 0x2c2e31, wheel: 0x26272b, hub: 0x3d3f45, marker: 0xa3a8b0, knob: 0x232427, scuttle: 0x141517,
  },
  premium: {
    padTop: 0x2c2725, pad: 0x221e1c, face: 0x3b3431, lower: 0x8a5f40, lid: 0x9c6d49, stitch: 0xc9975f, trim: 0x5e5550, liner: 0xc2bab0, door: 0x2b2624, doorInsert: 0xa8754d,
    sill: 0x3a332f, accent: 0xd0d3d8, gloss: 0x121111, vent: 0x121111, louvre: 0x4a4542, bolster: 0x211d1c, insert: 0xa8754d, rib: 0xd9b48a, console: 0x1f1b1a,
    floor: 0x2a2624, wheel: 0x1e1b1a, hub: 0x342e2c, marker: 0xc0392b, knob: 0x1e1b1a, scuttle: 0x141517,
  },
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
  /**
   * Cross-sections in the (z, y) plane, each at its own x (increasing), joined into one solid: a shape that changes along its length (a pad whose lip
   * rolls further out here than there, a hood highest in its middle). Every section has as many points, in the same order; the first and the last are
   * capped (in `cap`). `color(j)`: the colour of the faces from point j to point j + 1.
   */
  loft(sections: { x: number; p: [number, number][] }[], color: (j: number) => number, cap: number) {
    const n = sections[0].p.length; let area = 0;
    for (let j = 0; j < n; j++) { const [z0, y0] = sections[0].p[j], [z1, y1] = sections[0].p[(j + 1) % n]; area += z0 * y1 - z1 * y0; }
    const at = (i: number, j: number): V3 => { const q = sections[i].p[j % n]; return [sections[i].x, q[1], q[0]]; };
    for (let i = 0; i + 1 < sections.length; i++) for (let j = 0; j < n; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1), col = color(j);
      if (area > 0) { this.tri(a, b, c, col); this.tri(a, c, d, col); } else { this.tri(a, c, b, col); this.tri(a, d, c, col); }   // (counter-clockwise in (z, y): a b c faces out)
    }
    const tris = THREE.ShapeUtils.triangulateShape(sections[0].p.map(([z, y]) => new THREE.Vector2(z, y)), []);
    for (const [i, s] of [[0, -1], [sections.length - 1, 1]] as const) for (const [a, b, c] of tris) this.tri(at(i, a), at(i, b), at(i, c), cap, [s, 0, 0]);
  }
  /** Another soup's triangles, placed by `m` (a rotation and a move: its faces keep their sides). */
  add(o: Soup, m: THREE.Matrix4) {
    const nm = new THREE.Matrix3().getNormalMatrix(m), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < o.pos.length; i += 3) {
      p.set(o.pos[i], o.pos[i + 1], o.pos[i + 2]).applyMatrix4(m); q.set(o.nor[i], o.nor[i + 1], o.nor[i + 2]).applyMatrix3(nm).normalize();
      this.pos.push(p.x, p.y, p.z); this.nor.push(q.x, q.y, q.z); this.col.push(o.col[i], o.col[i + 1], o.col[i + 2]);
    }
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

// ------------------------------------------------------------------------------------------------ the driver's eye
/** The eye of a body sitting in a car seat: this far under the top of its head (m, at the body's drawn scale: crown to eyes, hair included). */
export const EYE_BELOW_CROWN = 0.125;
/**
 * How far the eye may sit above or below the car's design eye (m): a driver whose eye would sit lower raises the seat to it, as a seat-height lever
 * does (below it the cluster's hood would cut into the road over the bonnet); one whose eye sits higher keeps it, up to 4 cm, under the headliner.
 */
export const SEAT_RAISE = { down: 0, up: 0.04 } as const;
/** The least room between the eye and the headliner (m: the camera's near plane at the wheel is 0.1 m, src/transport/ownedModule.ts SEAT_NEAR). */
export const HEADROOM = 0.15;
/** The height of the hood over the instrument cluster, above the dash's rear edge (m). */
const HOOD = 0.04;
/** The car's design eye: where the wheel, the dash and the pillars are built round (the interior's own numbers). */
export const designEye = (c: Cabin): V3 => [c.driverX, c.seatTop + 0.72, c.frontZ - 0.17];
/** The headliner's underside (the interior draws it 4 cm under the roof's outer line). */
const linerY = (c: Cabin) => c.roof - 0.04;
/**
 * Where the camera sits at the wheel for the body in the driver's seat (`head`: the top of its head and its drawn scale in the seat, car frame, from
 * src/transport/cabinFit.ts; null: the design eye). The eye is the body's own, EYE_BELOW_CROWN under its crown, then held within the seat's travel
 * round the design eye (SEAT_RAISE: everyone sees the road over the bonnet and the wheel low in the frame, the homme and the femme alike) and under
 * the headliner by HEADROOM. Pure (tests/ld2Drive.test.ts).
 */
export function driverEye(c: Cabin, head: { top: number; scale: number } | null): V3 {
  const d = designEye(c);
  let y = head ? head.top - EYE_BELOW_CROWN * head.scale : d[1];
  y = Math.max(d[1] - SEAT_RAISE.down, Math.min(d[1] + SEAT_RAISE.up, y));
  y = Math.min(y, linerY(c) - HEADROOM);
  return [+d[0].toFixed(4), +y.toFixed(4), +d[2].toFixed(4)];
}

/**
 * The view at the wheel: how far down the eye looks at rest (rad: a phone held upright, on its side), the vertical field of view on a phone held
 * upright (deg; on its side the page's own, src/core/view.ts fovFor), the camera's near plane (m: the roof lining and the wheel are nearer than the
 * street's 0.3).
 */
export const SEAT_VIEW = { pitchPortrait: -0.17, pitch: -0.16, fovPortrait: 78, near: 0.1 } as const;
/**
 * Where the horizon, the sightline over the bonnet's nose, the top of the wheel's rim and the dash's edge fall on the screen (0 the top … 1 the
 * bottom) for a camera pitched `pitch` (rad) with a vertical field of view `vfov` (deg). The road is the band from `horizon` to `nose`. Pure.
 */
export function screenRows(s: CockpitSight, pitch: number, vfov: number) {
  const t = Math.tan((vfov * Math.PI) / 360), row = (below: number) => +(0.5 + (0.5 * Math.tan((below * Math.PI) / 180 + pitch)) / t).toFixed(4);
  return { horizon: row(0), nose: row(s.overNose), wheel: row(s.wheelTop), dash: row(s.dashLip) };
}

/** What the driver sees from `eye` (car frame), measured on the interior's own geometry: angles below the horizontal (deg), distances (m). Pure. */
export interface CockpitSight {
  /** The steepest look ahead that clears the bonnet's nose and the foot of the windscreen: the road is seen from `nearRoad` m ahead of the eye on. */
  overNose: number; nearRoad: number;
  /** The rim's top and the dash's rear edge: both below the sightline over the nose (they never hide the road). */
  wheelTop: number; dashLip: number;
  /** Room to the headliner over the eye, the nearest A pillar, the windscreen's header, the steering wheel's centre. */
  headroom: number; pillar: number; header: number; wheel: number;
}
const segDist = (p: V3, a: V3, b: V3) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};
export function cockpitSight(c: Cabin, eye: V3, groundY = 0): CockpitSight {
  const geo = interiorGeometry(c), deg = (dy: number, dz: number) => (Math.atan2(dy, dz) * 180) / Math.PI;
  const below = (p: [number, number]) => deg(eye[1] - p[0], p[1] - eye[2]);          // [y, z] → degrees under the horizontal
  const overNose = Math.min(below([c.nose, c.L / 2 - 0.3]), below([c.cowl, c.zWs]));
  const pillar = Math.min(...[1, -1].map(sx => segDist(eye, [sx * (geo.hwG - 0.03), c.cowl - 0.01, c.zWs + 0.01], [sx * (geo.hwR - 0.02), geo.yR, c.zRf + 0.02])));
  return {
    overNose: +overNose.toFixed(2), nearRoad: +((eye[1] - groundY) / Math.tan((overNose * Math.PI) / 180)).toFixed(2),
    wheelTop: +below([geo.wheel[1] + geo.R * Math.cos(geo.column), geo.wheel[2] + geo.R * Math.sin(geo.column)]).toFixed(2), dashLip: +below([geo.yLip + HOOD, geo.zLip + 0.06]).toFixed(2),
    headroom: +(linerY(c) - eye[1]).toFixed(3), pillar: +pillar.toFixed(3),
    header: +Math.hypot(eye[1] - geo.yR, c.zRf - eye[2]).toFixed(3), wheel: +Math.hypot(eye[0] - geo.wheel[0], eye[1] - geo.wheel[1], eye[2] - geo.wheel[2]).toFixed(3),
  };
}
/** The interior's fixed numbers, from the cabin and its design eye (what the constructor builds with). */
function interiorGeometry(c: Cabin) {
  const E = designEye(c), wheel: V3 = [c.driverX, E[1] - 0.31, E[2] + 0.42];
  return { hwG: c.W / 2 - c.inG, hwR: c.W / 2 - c.inR, yR: c.roof - 0.055, wheel, zLip: wheel[2] + 0.12, yLip: Math.max(c.cowl + 0.04, E[1] - 0.21), R: c.W > 1.9 ? 0.18 : 0.17, column: 0.42 };
}

/**
 * A front sport seat in its own frame (the top of the cushion's insert at the origin, x across, z forward): the cushion and the backrest each a centre
 * insert between side bolsters that stand proud and lean in, a rolled front edge to the cushion; ribs across the inserts (fabric) or stitching along
 * and across them (leather); `head`: a headrest made one with the back (the driver's has none: the camera's eye is just in front of it).
 */
function sportSeat(P: Palette, leather: boolean, head: boolean): Soup {
  const s = new Soup(), line = P.rib;
  s.box([0.46, 0.09, 0.47], [0, -0.115, -0.01], P.bolster);                                     // the base under the cushion
  s.box([0.27, 0.07, 0.42], [0, -0.035, -0.02], P.insert);
  for (const sx of [1, -1]) s.box([0.1, 0.11, 0.46], [sx * 0.185, -0.03, -0.01], P.bolster, [0, 0, sx * 0.2]);   // the bolsters: their tops slope into the seat
  s.box([0.28, 0.07, 0.07], [0, -0.03, 0.21], P.bolster, [0.25, 0, 0]);                         // the rolled front edge
  for (const z of leather ? [-0.13, -0.03, 0.07] : [-0.15, -0.09, -0.03, 0.03, 0.09]) s.box([0.27, 0.004, leather ? 0.004 : 0.022], [0, 0.002, z], line);
  if (leather) for (const sx of [1, -1]) s.box([0.004, 0.004, 0.4], [sx * 0.125, 0.002, -0.02], P.rib);
  // the backrest, reclined about the back of the cushion: its shell, the insert, the bolsters turned in toward the back's middle, the shoulders
  const b = new Soup();
  b.box([0.48, 0.6, 0.07], [0, 0.3, -0.055], P.bolster);
  b.box([0.26, 0.46, 0.05], [0, 0.27, -0.005], P.insert);
  for (const sx of [1, -1]) b.box([0.1, 0.5, 0.12], [sx * 0.19, 0.27, 0], P.bolster, [0, -sx * 0.35, 0]);
  b.box([0.42, 0.1, 0.1], [0, 0.55, -0.025], P.bolster);
  for (const y of leather ? [0.12, 0.24, 0.36] : [0.08, 0.15, 0.22, 0.29, 0.36, 0.43]) b.box([0.26, leather ? 0.004 : 0.024, 0.004], [0, y, 0.021], line);
  if (leather) for (const sx of [1, -1]) b.box([0.004, 0.44, 0.004], [sx * 0.118, 0.27, 0.021], P.rib);
  if (head) {
    b.box([0.17, 0.07, 0.08], [0, 0.63, -0.04], P.bolster);
    b.box([0.27, 0.17, 0.1], [0, 0.74, -0.035], P.bolster);
    b.box([0.17, 0.08, 0.008], [0, 0.735, 0.018], P.insert);
  }
  s.add(b, new THREE.Matrix4().makeRotationX(-0.2).setPosition(0, 0, -0.25));
  return s;
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
  /** The driver's eye, in the same frame: the design eye until `fitEye` puts it at the eye of the body in the seat. */
  readonly eye: THREE.Vector3;
  /** The design eye the wheel, the dash and the pillars are built round (the car's; it does not move with the driver). */
  readonly design: THREE.Vector3;
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
    const c = cabin, P = PALETTES[trim], prem = trim === 'premium', g = this.group; g.name = 'car_interior'; g.visible = false;
    const dx = c.driverX, hw = c.W / 2 - 0.075, hwG = c.W / 2 - c.inG, hwR = c.W / 2 - c.inR, floor = c.sill + 0.06;
    this.design = new THREE.Vector3(...designEye(c)); this.eye = this.design.clone();
    const E = this.design, C = this.wheelAt = new THREE.Vector3(dx, E.y - 0.31, E.z + 0.42);
    const zLip = C.z + 0.12, yLip = Math.max(c.cowl + 0.04, E.y - 0.21), zF = c.zWs + 0.04;      // the dash's rear edge, a little above the foot of the glass, at a set height under the eye
    const yBot = c.cowl - 0.36;                                                                     // the dash's underside (the console's top comes up to it)
    const s = new Soup();
    // the bonnet's shape (src/actors/vehicleKit.ts's bodies; the authored ones' bonnets stand 3 to 5 cm above it): k −1 … 1 across, t 0 at the windscreen … 1 at the nose
    const zN = c.L / 2 - 0.3, bw0 = c.W / 2 - 0.1, bw1 = c.W / 2 - 0.28, crown = 0.035;
    const bp = (k: number, t: number): V3 => {
      const half = bw0 + (bw1 - bw0) * t, y = c.cowl - 0.02 + (c.nose - c.cowl + 0.02) * t - crown * k * k;
      return [k * half, y, c.zWs + 0.03 + (zN - c.zWs - 0.03) * t];
    };

    // ---- the dashboard: across the car under the windscreen, its padded top rising a little toward the driver and rolling over at its lip, a face leaning back
    // (screens, vents), the lower part sloping away over the knees; three tones (the pad, the face, the lower part), a line of stitching along the lip
    const faceZ = (y: number) => zLip + 0.015 - ((yLip - 0.01 - y) / 0.14) * 0.025;            // the face's z at height y (its foot is nearer the driver: it looks up at the eye)
    const padY = (z: number) => yLip + ((z - zLip - 0.06) / (zF - zLip - 0.06)) * (c.cowl - 0.015 - yLip);   // the pad's top, from its crown at the lip to the glass
    const lowA: [number, number] = [faceZ(yLip - 0.2), yLip - 0.2], lowB: [number, number] = [zLip + 0.1, yBot];
    const lowZ = (y: number) => lowA[0] + ((lowA[1] - y) / (lowA[1] - lowB[1])) * (lowB[0] - lowA[0]);   // the lower part's z at height y
    const FACE = Math.atan2(0.025, 0.14), LOW = -Math.atan2(lowB[0] - lowA[0], lowA[1] - lowB[1]);   // the face's and the lower part's lean (a box's tilt about x)
    // the lip's overhang: none over the cluster and the centre screen (the screen tucks under it), a fuller roll over the passenger's side
    const lip = (x: number) => (x < -0.16 ? 0.024 * Math.min(1, (-0.16 - x) / 0.12) * Math.min(1, (x + hw) / 0.1 + 0.3) : x > hw - 0.06 ? 0.012 * Math.min(1, (hw - x) / 0.05 + 0.4) : 0);
    const pad = (x: number) => {
      const o = lip(x);
      return { x, p: [[zF, c.cowl - 0.015], [zLip + 0.06, yLip], [zLip + 0.052, yLip - 0.0006], [zLip + 0.044, yLip - 0.0016], [zLip + 0.02 - o, yLip - 0.009], [zLip + 0.004 - o, yLip - 0.024],
        [faceZ(yLip - 0.036), yLip - 0.036], lowA, lowB, [zF, yBot]] as [number, number][] };
    };
    const PAD = [P.padTop, P.padTop, P.stitch, P.pad, P.pad, P.pad, P.face, P.lower, P.vent, P.vent];
    s.loft([-hw, -hw + 0.05, -0.5, -0.28, -0.16, hw - 0.06, hw - 0.03, hw].map(pad), j => PAD[j], P.pad);
    // the instrument binnacle: a hood over the cluster, highest over its middle (its top 4 cm over the dash: at 6 cm it stood within a degree of the
    // sightline over the bonnet and cut into the road there, tests/ld2Drive.test.ts), its visor rounding down into the pad at both ends, dark beneath
    const hood = (u: number) => {
      const h = 0.2 + 0.8 * Math.sqrt(Math.max(0, 1 - u * u)), zf = zLip + 0.2;
      return { x: dx + 0.2 * u, p: [[zf, padY(zf) - 0.006], [zLip + 0.06, yLip + HOOD * h], [zLip - 0.03 * h, yLip + (HOOD - 0.008) * h], [zLip - 0.024 * h, yLip + 0.022 * h], [zLip + 0.03, yLip - 0.008]] as [number, number][] };
    };
    s.loft([-1, -0.88, -0.62, -0.25, 0.25, 0.62, 0.88, 1].map(hood), j => [P.padTop, P.padTop, P.pad, P.vent, P.vent][j], P.pad);
    /** A quad on the face (`off` in front of it), x from x0 to x1, y from y0 to y1. */
    const onFace = (x0: number, x1: number, y0: number, y1: number, off: number, col: number) =>
      s.quad([x0, y0, faceZ(y0) - off], [x1, y0, faceZ(y0) - off], [x1, y1, faceZ(y1) - off], [x0, y1, faceZ(y1) - off], col, [0, 0.2, -1]);
    const onLow = (x0: number, x1: number, y0: number, y1: number, off: number, col: number, lit?: V3) =>
      s.quad([x0, y0, lowZ(y0) - off], [x1, y0, lowZ(y0) - off], [x1, y1, lowZ(y1) - off], [x0, y1, lowZ(y1) - off], col, [0, -0.3, -1], lit);
    onFace(dx - 0.15, dx + 0.15, yLip - 0.105, yLip - 0.006, 0.003, P.vent);                     // the binnacle's dark back round the cluster
    const sw = trim === 'premium' ? 0.25 : 0.2, sx0 = 0.02 - sw / 2, sx1 = 0.02 + sw / 2, sy0 = yLip - 0.025 - sw * 0.625, sy1 = yLip - 0.025;
    onFace(sx0 - 0.012, sx1 + 0.012, sy0 - 0.012, sy1 + 0.006, 0.004, P.gloss);                  // the centre screen's frame
    /** An air vent on the face: a bezel, its dark mouth, `n` louvres across it; `w` wide, `h` tall, its middle at (x, y). */
    const vent = (x: number, y: number, w: number, h: number, n: number) => {
      const z = faceZ(y), t: V3 = [FACE, 0, 0];
      s.box([w + 0.014, h + 0.014, 0.01], [x, y, z - 0.003], prem ? P.accent : P.gloss, t);
      s.box([w, h, 0.002], [x, y, z - 0.0095], P.vent, t);
      for (let i = 0; i < n; i++) s.box([w - 0.004, 0.005, 0.006], [x, y - h / 2 + ((i + 0.5) * h) / n, z - 0.012], P.louvre, t);
    };
    vent(hw - 0.075, yLip - 0.08, 0.075, 0.1, 3);                                                // the driver's, by the door
    vent(-hw + 0.105, yLip - 0.08, 0.11, 0.075, 3);                                              // the passenger's
    vent(sx0 - 0.042, yLip - 0.085, 0.055, 0.09, 3); vent(sx1 + 0.042, yLip - 0.085, 0.055, 0.09, 3);   // either side of the screen
    // a strip of trim across the passenger's side, level with the vents
    s.box([sx0 - 0.1 - (-hw + 0.18), 0.02, 0.008], [(sx0 - 0.1 - hw + 0.18) / 2, yLip - 0.075, faceZ(yLip - 0.075) - 0.004], P.accent, [FACE, 0, 0]);
    // the glovebox on the lower part, the passenger's side: its lid a shade lighter in its dark seam, the handle at its top
    const gx0 = -hw + 0.16, gx1 = -0.17, gy0 = yBot + 0.035, gy1 = yLip - 0.215;
    onLow(gx0 - 0.006, gx1 + 0.006, gy0 - 0.006, gy1 + 0.006, 0.002, P.vent);
    onLow(gx0, gx1, gy0, gy1, 0.004, P.lid, [0, 0.6, -1]);                                       // (lit as a face turned up to the cabin: the lower part looks down, into its own shade)
    s.box([0.1, 0.016, 0.014], [(gx0 + gx1) / 2, gy1 - 0.025, lowZ(gy1 - 0.025) - 0.009], P.accent, [LOW, 0, 0]);
    // the climate controls under the screen: a piano-black panel, two dials, a row of buttons, the hazard switch
    const cy = yLip - 0.25;
    onLow(-0.1, 0.14, cy - 0.04, cy + 0.035, 0.003, P.gloss);
    for (const kx of [-0.055, 0.095]) s.geo(new THREE.CylinderGeometry(0.021, 0.023, 0.02, 10).rotateX(-Math.PI / 2 + LOW).translate(kx, cy, lowZ(cy) - 0.012), P.accent);
    for (const bx of [-0.01, 0.02, 0.05]) s.box([0.022, 0.014, 0.008], [bx, cy - 0.012, lowZ(cy - 0.012) - 0.006], P.louvre, [LOW, 0, 0]);
    s.box([0.024, 0.016, 0.008], [0.02, cy + 0.017, lowZ(cy + 0.017) - 0.006], 0xc0392b, [LOW, 0, 0]);
    // where the dash meets the windscreen: the demister's dark grille along the pad's front; beyond it, under the foot of the glass and on under the
    // bonnet, the scuttle. An authored body's faces there (the wipers' strip, the bonnet's first few centimetres) slope more steeply than the driver's
    // sightline and turn away from the eye: without the scuttle the eye looked down past them into the hollow bonnet, at the ground under the car (the
    // pale speckled band of the 25 Oct playtest, the ground's grain in the low sun). It stays 12 mm under the bonnet's shape, under the paint, and
    // reaches 40 % of the way to the nose (from every eye the sightline past those faces meets it within the first quarter).
    const dz0 = zF - 0.075, dz1 = zF - 0.025;
    s.quad([-hw + 0.12, padY(dz0) + 0.0015, dz0], [hw - 0.12, padY(dz0) + 0.0015, dz0], [hw - 0.12, padY(dz1) + 0.0015, dz1], [-hw + 0.12, padY(dz1) + 0.0015, dz1], P.vent, [0, 1, 0]);
    const tray = (k: number, t: number): V3 => { const p = bp(k, t); return [p[0], p[1] - 0.012, p[2]]; };
    for (const [k0, k1] of [[-1, -0.4], [-0.4, 0.4], [0.4, 1]]) for (const [t0, t1] of [[-0.03, 0.2], [0.2, 0.4]]) s.quad(tray(k0, t0), tray(k1, t0), tray(k1, t1), tray(k0, t1), P.scuttle, [0, 1, 0]);

    // ---- the centre: the stack down to the floor under the dash's middle; the console between the seats, its body from the dash back to the rear seats,
    // a piano-black top edged in metal; on it, from the front: a tray, the gear lever in its gaiter on a metal surround (the knob on a short shaft, leaning
    // back toward the driver), two cup holders, the handbrake lever, the padded armrest
    s.box([0.26, yBot - floor, 0.3], [0, (yBot + floor) / 2, zLip + 0.2], P.console);
    const top = c.seatTop + 0.08, conZ0 = c.frontZ - 0.5, conZ1 = zLip + 0.12, conM = (conZ0 + conZ1) / 2, zG = c.frontZ + 0.28;
    s.box([0.22, top - floor, conZ1 - conZ0], [0, (top + floor) / 2, conM], P.console);
    s.box([0.17, 0.008, conZ1 - conZ0 - 0.03], [0, top + 0.004, conM], P.gloss);
    for (const sx of [1, -1]) s.box([0.008, 0.01, conZ1 - conZ0 - 0.03], [sx * 0.09, top + 0.005, conM], P.accent);
    if (conZ1 - 0.025 - (zG + 0.075) > 0.04) s.box([0.14, 0.004, conZ1 - 0.025 - (zG + 0.075)], [0, top + 0.0095, (conZ1 - 0.025 + zG + 0.075) / 2], P.vent);
    const at = (x: number, y: number, z: number, rx = 0) => new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
    const gear = new Soup(), lever = new Soup();
    gear.box([0.12, 0.012, 0.13], [0, 0.014, 0], P.accent);
    gear.box([0.1, 0.004, 0.11], [0, 0.021, 0], P.gloss);
    lever.geo(new THREE.CylinderGeometry(0.024, 0.05, 0.065, 8).translate(0, 0.0545, 0), P.bolster);           // the gaiter
    lever.geo(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 6).translate(0, 0.115, 0), P.vent);                 // the shaft
    lever.geo(new THREE.SphereGeometry(0.027, 10, 8).scale(1, 1.12, 1.05).translate(0, 0.165, 0), P.knob);      // the knob
    lever.geo(new THREE.CylinderGeometry(0.017, 0.019, 0.006, 10).translate(0, 0.195, 0), prem ? P.accent : P.marker);   // its cap (the gears' pattern)
    gear.add(lever, at(0, 0.022, 0, -0.18));
    s.add(gear, at(0, top, zG));
    const zC = zG - 0.13;
    for (const sx of [1, -1]) {
      s.geo(new THREE.CylinderGeometry(0.037, 0.037, 0.004, 10).translate(sx * 0.045, top + 0.01, zC), P.accent);
      s.geo(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 10).translate(sx * 0.045, top + 0.0125, zC), P.vent);
    }
    const h0: V3 = [0, top + 0.022, zG - 0.21], h1: V3 = [0, top + 0.075, c.frontZ - 0.17], hk = (k: number): V3 => [0, h0[1] + (h1[1] - h0[1]) * k, h0[2] + (h1[2] - h0[2]) * k];
    s.box([0.05, 0.02, 0.07], [0, top + 0.016, h0[2]], P.bolster);                                // the handbrake's boot
    s.beam(h0, hk(0.6), 0.032, 0.024, P.console);
    s.beam(hk(0.55), h1, 0.038, 0.032, P.bolster);                                                 // its grip
    s.box([0.014, 0.012, 0.014], [0, h1[1] + 0.004, h1[2] - 0.006], P.accent);                     // the button
    const arm0 = c.frontZ - 0.2, arm1 = conZ0 + 0.02;
    s.box([0.19, 0.07, arm0 - arm1], [0, top + 0.065, (arm0 + arm1) / 2], P.bolster);              // the armrest
    for (const sx of [1, -1]) s.box([0.004, 0.003, arm0 - arm1 - 0.03], [sx * 0.07, top + 0.1015, (arm0 + arm1) / 2], prem ? P.rib : P.console);
    // the steering column into the dash, the indicator and wiper stalks behind the wheel
    const col = new THREE.Vector3(0, -Math.sin(this.column), Math.cos(this.column));
    const c0 = C.clone().addScaledVector(col, 0.06), c1 = C.clone().addScaledVector(col, 0.26);
    s.beam([c0.x, c0.y, c0.z], [c1.x, c1.y, c1.z], 0.07, 0.07, P.console);
    s.beam([dx, c1.y + 0.01, c1.z - 0.07], [dx, c1.y - 0.02, c1.z + 0.08], 0.13, 0.1, P.pad);
    for (const sx of [1, -1]) s.box([0.1, 0.012, 0.014], [dx + sx * 0.085, c0.y - 0.012, c0.z + 0.035], P.console, [0, 0, sx * -0.12]);
    // the pedals in the driver's footwell on their arms (alloy on the premium trim; a clutch on the city trim's), seen down through the wheel; the floor
    // carried forward under the dash, the toe board up to its underside (without them the eye looked past the dash's foot at the ground)
    for (const [px, pw, ph] of prem ? [[0.02, 0.09, 0.065], [-0.13, 0.05, 0.12]] : [[0.02, 0.08, 0.06], [-0.13, 0.05, 0.12], [0.17, 0.07, 0.06]]) {
      s.box([pw, ph, 0.012], [dx + px, floor + 0.12, zF - 0.22], prem ? P.accent : P.louvre, [0.6, 0, 0]);
      s.beam([dx + px, floor + 0.12 + 0.4 * ph, zF - 0.2], [dx + px, yBot + 0.01, zF - 0.1], 0.018, 0.014, P.vent);
    }
    const back = (c.rearZ ?? c.frontZ) - 0.3;
    s.box([2 * hw, 0.02, zF - back], [0, floor - 0.01, (zF + back) / 2], P.floor);
    s.quad([-hw, floor, zF - 0.2], [hw, floor, zF - 0.2], [hw, yBot, zF], [-hw, yBot, zF], P.floor, [0, 0.5, -1]);

    // ---- the doors (both sides): a card from the dash back past the rear seats, its window sill (the belt line); on the front door an insert (stitched on
    // the premium trim), the armrest with its pull rising to the card and the window switches at its front, the opening lever in its dark cup, a speaker
    // grille in a ring low down, the map pocket along the bottom; an insert and an armrest on the rear door
    const zDoor0 = c.zWs - 0.02, zDoor1 = (c.rearZ ?? c.frontZ - 0.6) - 0.35, belt = c.cowl + 0.015, zf = c.frontZ;
    for (const sx of [1, -1]) {
      const x = sx * hw, inX = (d: number) => x - sx * (0.005 + d);                               // d m in from the card's face
      s.box([0.05, belt - floor, zDoor1 - zDoor0], [x + sx * 0.02, (belt + floor) / 2, (zDoor0 + zDoor1) / 2], P.door);
      s.box([0.07, 0.03, zDoor1 - zDoor0], [x + sx * 0.01, belt + 0.005, (zDoor0 + zDoor1) / 2], P.sill);
      s.box([0.012, 0.15, 0.55], [inX(0.006), belt - 0.13, zf + 0.125], P.doorInsert);
      if (prem) for (const dy of [-0.06, 0.06]) s.box([0.003, 0.004, 0.53], [inX(0.013), belt - 0.13 + dy, zf + 0.125], P.rib);
      s.box([0.085, 0.035, 0.42], [inX(0.0425), c.seatTop + 0.21, zf + 0.1], P.bolster);
      s.box([0.05, 0.09, 0.42], [inX(0.025), c.seatTop + 0.15, zf + 0.1], P.door);
      s.beam([inX(0.035), c.seatTop + 0.235, zf - 0.04], [inX(0.035), belt - 0.075, zf + 0.2], 0.026, 0.03, P.sill);   // the pull
      s.box([0.045, 0.01, 0.09], [inX(0.045), c.seatTop + 0.2325, zf + 0.25], P.gloss);
      for (const dz of [-0.022, 0.022]) s.box([0.018, 0.007, 0.024], [inX(0.045), c.seatTop + 0.239, zf + 0.25 + dz], P.louvre);
      s.box([0.008, 0.05, 0.13], [inX(0.004), belt - 0.07, zf + 0.48], P.vent);
      s.box([0.012, 0.018, 0.09], [inX(0.012), belt - 0.07, zf + 0.48], P.accent);                // the opening lever
      s.box([0.006, 0.15, 0.17], [inX(0.003), floor + 0.17, zf + 0.38], P.sill);
      s.box([0.01, 0.13, 0.15], [inX(0.005), floor + 0.17, zf + 0.38], P.vent);                   // the speaker
      s.box([0.05, 0.08, 0.34], [inX(0.025), floor + 0.08, zf + 0.06], P.door);
      s.box([0.03, 0.004, 0.32], [inX(0.022), floor + 0.121, zf + 0.06], P.vent);                 // the map pocket
      if (c.rearZ !== null) { s.box([0.012, 0.14, 0.5], [inX(0.006), belt - 0.14, c.rearZ + 0.05], P.doorInsert); s.box([0.07, 0.035, 0.32], [inX(0.035), c.seatTop + 0.2, c.rearZ + 0.08], P.bolster); }
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
    s.box([0.22, 0.06, 0.025], [0, my, mz], P.pad, [-0.15, 0, 0]);
    s.box([0.2, 0.045, 0.004], [0, my - 0.002, mz - 0.013], 0x7c8a96, [-0.15, 0, 0]);
    for (const sx of [1, -1]) s.box([0.34, 0.016, 0.15], [sx * 0.37, yR - 0.03, c.zRf - 0.1], P.liner);

    // ---- the seats: the driver's and the passenger's sport seats (sportSeat; a headrest on the passenger's), the rear bench with its two outer places
    for (const sx of [1, -1]) s.add(sportSeat(P, prem, sx < 0), at(sx * Math.abs(dx), c.seatTop, c.frontZ));
    if (c.rearZ !== null) {
      const rw = c.W - 0.36, bench = new Soup();
      s.box([rw, 0.13, 0.5], [0, c.seatTop - 0.045, c.rearZ], P.bolster);
      bench.box([rw, 0.6, 0.12], [0, 0, 0], P.bolster);
      for (const sx of [1, -1]) {
        s.box([0.32, 0.01, 0.4], [sx * 0.36, c.seatTop + 0.025, c.rearZ + 0.01], P.insert);
        bench.box([0.32, 0.42, 0.01], [sx * 0.36, -0.03, 0.062], P.insert);
        bench.box([0.24, 0.14, 0.08], [sx * 0.36, 0.37, -0.01], P.bolster);
      }
      s.add(bench, at(0, c.seatTop + 0.3, c.rearZ - 0.28, -0.18));
    }

    // ---- a bonnet for a body that is not drawn from inside (setPaint gives it the car's colour): from the foot of the windscreen to the nose, crowned
    this.bonnetAt = s.pos.length / 3;
    for (const [k0, k1] of [[-1, -0.4], [-0.4, 0.4], [0.4, 1]]) for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) s.quad(bp(k0, t0), bp(k1, t0), bp(k1, t1), bp(k0, t1), 0x888888, [0, 1, 0]);
    this.scuttleAt = s.pos.length / 3;
    s.box([2 * bw0, 0.03, 0.09], [0, c.cowl - 0.01, c.zWs + 0.05], 0x111214);                  // the scuttle and its wipers, at the glass
    this.bonnetN = s.pos.length / 3 - this.bonnetAt;

    const shell = this.shell = new THREE.Mesh(s.build(), material()); shell.name = 'car_interior_shell';
    g.add(shell);

    // ---- the steering wheel: a leather rim with a mark at its top, two spokes across with their buttons and one below (two on the premium trim, a metal
    // insert between them), the hub's housing and the airbag's padded cover on it with a badge; the top half open (the cluster is read through it); it
    // turns about the column
    const R = c.W > 1.9 ? 0.18 : 0.17, ws = new Soup();
    ws.geo(new THREE.TorusGeometry(R, 0.017, 8, 28), P.wheel);
    ws.box([0.022, 0.04, 0.04], [0, R, 0], P.marker);
    ws.geo(new THREE.CylinderGeometry(0.058, 0.068, 0.05, 14).rotateX(Math.PI / 2).translate(0, 0, 0.012), P.wheel);
    const cover = (r0: number, r1: number, d: number, z: number) => new THREE.CylinderGeometry(r0, r1, d, 8).rotateY(Math.PI / 8).rotateX(-Math.PI / 2).scale(1.3, 0.92, 1).translate(0, -0.004, z);
    ws.geo(cover(0.054, 0.06, 0.024, -0.03), P.wheel);                                             // (its top toward the driver: −z)
    ws.geo(cover(0.045, 0.051, 0.01, -0.047), P.hub);
    ws.geo(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 10).rotateX(-Math.PI / 2).translate(0, 0.002, -0.054), P.accent);
    for (const a of [-0.2, Math.PI + 0.2]) {
      ws.geo(new THREE.BoxGeometry(0.06, 0.056, 0.022).translate(0.085, 0, -0.008).rotateZ(a), P.wheel);
      ws.geo(new THREE.BoxGeometry(R - 0.11, 0.034, 0.016).translate((R - 0.11) / 2 + 0.105, 0, -0.004).rotateZ(a), P.wheel);
      for (const by of [-0.013, 0.013]) ws.geo(new THREE.BoxGeometry(0.016, 0.012, 0.006).translate(0.083, by, -0.021).rotateZ(a), P.louvre);
    }
    if (prem) {
      for (const a of [-0.32, 0.32]) ws.geo(new THREE.BoxGeometry(0.026, R - 0.06, 0.016).translate(0, -(R - 0.06) / 2 - 0.055, -0.004).rotateZ(a), P.wheel);
      ws.box([0.034, 0.05, 0.006], [0, -R + 0.05, -0.012], P.accent);
    } else ws.geo(new THREE.BoxGeometry(0.034, R - 0.06, 0.016).translate(0, -(R - 0.06) / 2 - 0.055, -0.004), P.wheel);
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
    panel(0.02, sw, yLip - 0.025 - sw * 0.625, yLip - 0.025, SCREEN);
    const screens = new THREE.Mesh(sc.build(true), sm); screens.name = 'car_interior_screens';
    g.add(screens);

    for (const m of [shell, this.spin, screens]) { m.castShadow = false; m.receiveShadow = false; }
    this.tris = [shell, this.spin, screens].reduce((t, m) => t + m.geometry.getAttribute('position').count / 3, 0);
    this.own.push(shell.geometry, this.spin.geometry, screens.geometry, sm, ...(this.tex ? [this.tex] : []));
  }

  /** The camera's eye for the body in the driver's seat (driverEye): the top of its head and its scale there, or null for the design eye. */
  fitEye(head: { top: number; scale: number } | null) { const e = driverEye(this.cabin, head); this.eye.set(e[0], e[1], e[2]); }

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
