import * as THREE from 'three';
import { KitBuilder, paintAtlas, seeded, type Paint, type Rect, type V3 } from '../world/kitGeometry';
import { AW, AH, UV, PLAIN_UV, sub, drawVehicleAtlas } from './vehicleAtlas';
import type { Seat } from '../interact/seats';

/**
 * Vehicle kit: believable low-poly Dakar vehicles, procedural and our own (docs/ASSET_REGISTER.md).
 *
 *   const { group, spec } = buildVehicle('carRapide', { seed: 7 });
 *
 * Local frame: origin on the ground at the middle of the vehicle, front = +z, up = +y, left = +x (the driver's side:
 * Senegal drives on the right, left-hand drive). Rotating the group by `yaw` makes it face (sin yaw, cos yaw), like
 * every other actor of the game.
 *
 * Cost: every vehicle is ONE opaque mesh (vertex colours + the shared paint atlas, lamps lit by the atlas' emissive
 * map at night) + one transparent glass mesh for vehicles with glazing + one additive headlight-beam quad that only
 * renders at night: 1–3 draw calls, all sharing three materials across the whole fleet. A THREE.LOD swaps to a
 * 60–150-triangle silhouette beyond `spec.lodDistance`. Geometry is cached per variant and marked `userData.shared`
 * (the hub cleanup keeps it).
 *
 * The spec gives what the transport and ownership lanes need: dimensions, wheels, seats (local offsets, facing, seat
 * height, role), doors (side, opening, boarding point, seats served), camera anchors (chase, driver, passenger,
 * side; `step` on the car rapide), head/tail lamp positions, the apprentice's step and the cargo area.
 */
export type VehicleKind = 'carRapide' | 'bus' | 'taxi' | 'moto' | 'sedan' | 'suv' | 'luxury' | 'pickup' | 'truck';
export const VEHICLE_KINDS: readonly VehicleKind[] = ['carRapide', 'bus', 'taxi', 'moto', 'sedan', 'suv', 'luxury', 'pickup', 'truck'];
export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  carRapide: 'Car rapide', bus: 'Bus urbain', taxi: 'Taxi', moto: 'Moto Jakarta', sedan: 'Berline', suv: '4×4', luxury: 'Berline de luxe', pickup: 'Pick-up', truck: 'Camion',
};

export type SeatRole = 'driver' | 'passenger' | 'bench';
export interface VehicleSeat {
  id: string;
  /** Hips on the floor plan, local metres. */
  x: number; z: number;
  /** Height of the sitting surface above the vehicle origin (character origin = top − SIT_HIPS). */
  top: number;
  /** Facing relative to the vehicle (0 = forward). */
  yaw: number;
  kind: SeatRole;
  /** Door used to reach it. */
  door: string;
  /** Pose held there when it is not the chair Sit (motorbikes: 'Ride'); copied to the interaction seat. */
  clip?: 'Ride';
}
export interface VehicleDoor {
  id: string;
  side: 'left' | 'right' | 'rear';
  /** Centre of the opening at floor level (local). */
  x: number; y: number; z: number;
  width: number; height: number;
  /** Where a person stands on the ground to get in (local). */
  board: V3;
  seats: string[];
  /** Always open (the car rapide's rear doorway) or a door that has to be opened. */
  open: boolean;
}
export interface CameraAnchor { pos: V3; look: V3; fov?: number }
export interface VehicleSpec {
  kind: VehicleKind;
  label: string;
  seed: number;
  /** Livery / body variant index and the colour actually used. */
  variant: number;
  colors: { body: number; accent: number };
  length: number; width: number; height: number; wheelbase: number;
  wheels: { x: number; y: number; z: number; r: number; width: number; steer: boolean }[];
  seats: VehicleSeat[];
  doors: VehicleDoor[];
  cameras: { chase: CameraAnchor; driver: CameraAnchor; passenger: CameraAnchor; side: CameraAnchor; step?: CameraAnchor };
  lights: { head: V3[]; tail: V3[] };
  /** Drive mode: steering wheel / handlebar centre and the two hand grips (local); footpegs on two-wheelers. */
  controls: { steering: V3; grips: [V3, V3]; pegs?: [V3, V3] };
  /**
   * animateVehicle: wheel radius (spin = distance / radius), steering limit (rad), largest lean in turns (rad, motos
   * only) and, for motos, the steering axis (pivot on the head tube, axis along the fork) the front end turns about.
   */
  drive: { wheelRadius: number; steerMax: number; lean: number; pivot?: V3; axis?: V3 };
  /** Car rapide: where the apprentice rides (on the step) and stands (parked, calling passengers). */
  step?: { riding: { x: number; y: number; z: number; yaw: number }; standing: { x: number; y: number; z: number; yaw: number } };
  /** Open load area (pickup bed, truck body): centre on the floor and size. */
  cargo?: { x: number; y: number; z: number; w: number; d: number; h: number };
  /** Typical speed in town traffic, m/s. */
  speed: number;
  /** Distance where the far model takes over. */
  lodDistance: number;
  budget: { near: { tris: number; drawCalls: number; nightDrawCalls: number }; far: { tris: number; drawCalls: number } };
  /** Seats with a baked person in this build (car rapide; empty when unknown). */
  occupied?: string[];
}
export interface VehicleOpts {
  /** Picks colour, livery, load and who is on board; same seed, same vehicle. */
  seed?: number;
  /** Force a body colour (cars). */
  color?: number;
  /** 'auto' (default): LOD near/far; 'near' or 'far' alone. */
  lod?: 'auto' | 'near' | 'far';
  lodDistance?: number;
  /** Low quality: the far model takes over closer. */
  lite?: boolean;
  /** Baked passengers in the seats (default true). The transport lane passes false and seats real people. */
  passengers?: boolean;
  /**
   * Exactly these seats get a baked passenger (overrides the seeded pattern; the driver still follows `driver`).
   * The transport lane uses it so the people drawn in a car rapide are the seats its passengers hold.
   * Each distinct list is a cached geometry: callers keep to a few patterns.
   */
  seated?: readonly string[];
  /** Baked driver / rider (default true; false for parked vehicles). */
  driver?: boolean;
}
export interface VehicleBuild { group: THREE.Group; spec: VehicleSpec; lod: THREE.LOD | null }

// ------------------------------------------------------------------------------------------------------------ materials
let mats: { body: THREE.MeshLambertMaterial; glass: THREE.MeshLambertMaterial; beam: THREE.MeshBasicMaterial } | null = null;
function beamTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d'); if (!c) return null;
  for (let y = 0; y < 128; y++) {                     // bright at the bottom (the lamps), fading forward, soft sides
    const k = Math.pow(1 - y / 128, 1.6);
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 127 - y, 64, 1);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** The three materials shared by every kit vehicle. */
export function vehicleMaterials() {
  if (mats) return mats;
  const { map, glow } = paintAtlas(AW, AH, 2, drawVehicleAtlas);
  const body = new THREE.MeshLambertMaterial({ vertexColors: true, map, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow, emissiveIntensity: 0 });
  installWheelShader(body, animUniforms());                                       // the shared material stays at rest
  const glass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xffe3b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  beam.visible = false;
  mats = { body, glass, beam };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
// ------------------------------------------------------------------------------------------------------------ animation
type AnimUniforms = { uSpin: { value: number }; uSteer: { value: number }; uPivot: { value: THREE.Vector3 }; uAxis: { value: THREE.Vector3 } };
const animUniforms = (): AnimUniforms => ({ uSpin: { value: 0 }, uSteer: { value: 0 }, uPivot: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 1, 0) } });
/** Spins tagged wheels about their axle (x), turns steered ones about the vertical, turns a moto's front end about its fork. */
const WHEEL_GLSL = `
attribute vec4 wheel;
uniform float uSpin; uniform float uSteer; uniform vec3 uPivot; uniform vec3 uAxis;
vec3 kitRot(vec3 v, vec3 a, float t) { float c = cos(t), s = sin(t); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
vec3 kitAnim(vec3 v, float isPos) {
  float m = wheel.w;
  if (m < 0.5) return v;
  vec3 c = wheel.xyz * isPos;
  if (m < 3.5) v = kitRot(v - c, vec3(1.0, 0.0, 0.0), uSpin) + c;
  if (m > 1.5 && m < 2.5) v = kitRot(v - c, vec3(0.0, 1.0, 0.0), uSteer) + c;
  if (m > 2.5) { vec3 p = uPivot * isPos; v = kitRot(v - p, uAxis, uSteer) + p; }
  return v;
}
`;
function installWheelShader(m: THREE.MeshLambertMaterial, u: AnimUniforms) {
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = WHEEL_GLSL + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = kitAnim(objectNormal, 0.0);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = kitAnim(transformed, 1.0);');
  };
  m.customProgramCacheKey = () => 'kitVehicleWheels';
  m.userData.anim = u;
}
interface AnimState { spin: number; lean: number; lod: THREE.LOD | null; body: THREE.Mesh | null; u: AnimUniforms | null }
/**
 * Animates a kit vehicle for one frame: wheels spin with `speed` (m/s, negative = reversing), front wheels — or a
 * motorbike's whole front end — turn with `steer` (rad, + = to the left, clamped to spec.drive.steerMax), and motos
 * lean into turns (up to spec.drive.lean). Cheap: only the near model is animated; the first call gives that vehicle
 * its own copy of the body material (same program and textures, same draw calls) to carry its wheel angles.
 */
export function animateVehicle(group: THREE.Object3D, speed: number, steer: number, dt: number) {
  const spec = group.userData.vehicleSpec as VehicleSpec | undefined; if (!spec) return;
  let st = group.userData.kitAnim as AnimState | undefined;
  if (!st) {
    const lod = (group.children.find(c => (c as THREE.LOD).isLOD) as THREE.LOD | undefined) ?? null;
    const near = lod ? lod.levels[0].object : group.children.find(c => c.name === 'near') ?? null;
    st = { spin: 0, lean: 0, lod, body: (near?.getObjectByName('body') as THREE.Mesh | undefined) ?? null, u: null };
    group.userData.kitAnim = st;
  }
  const d = spec.drive, s = THREE.MathUtils.clamp(steer, -d.steerMax, d.steerMax);
  if (d.lean > 0) {                                                              // lean into the turn, about the ground line
    const target = THREE.MathUtils.clamp(-s * Math.abs(speed) * 0.09, -d.lean, d.lean);
    st.lean += (target - st.lean) * Math.min(1, dt * 5);
    (st.lod ?? group).rotation.z = st.lean;
  }
  if (!st.body || (st.lod && st.lod.getCurrentLevel() !== 0)) return;            // far model: nothing to turn
  if (!st.u) {
    const base = vehicleMaterials().body, own = base.clone();
    const u = animUniforms();
    installWheelShader(own, u);
    own.userData.shared = true; own.userData.kitAnimClone = true;
    own.onBeforeRender = () => { own.emissiveIntensity = base.emissiveIntensity; };   // lamps follow the night
    if (d.pivot) u.uPivot.value.set(...d.pivot);
    if (d.axis) u.uAxis.value.set(...d.axis);
    st.body.material = own; st.u = u;
  }
  st.spin = (st.spin + (speed * dt) / d.wheelRadius) % (Math.PI * 2);
  st.u.uSpin.value = st.spin; st.u.uSteer.value = s;
}

/** Night factor 0 (day) … 1 (night): lamps glow and headlight beams light the road. Called every frame by the kit module. */
export function setVehicleNight(f: number) {
  const m = vehicleMaterials();
  m.body.emissiveIntensity = f * 1.5;
  m.beam.visible = f > 0.2;
  m.beam.opacity = 0.42 * f;
}

// ------------------------------------------------------------------------------------------------------------ helpers
const T = { SILL: 1, ARCH: 2, FRONT: 3, BONNET: 4, BELT: 5, DECK: 6, REAR: 7, CAB: 8, BED: 9, TOP: 10, UNDER: 11, CEIL: 12 } as const;
const SKIN = [0x3b2216, 0x5b3420, 0x6b3f25, 0x4e2e1c, 0x7a4a2c];
const SHIRT = [0xf2f2ec, 0x2f6fb3, 0x1a9d54, 0xd9482b, 0x8a5a3a, 0x6b3fa0, 0xf4c20d, 0x222326, 0xe8742c, 0x9fc3e0];
const WRAP = [0xd9322b, 0xf4c20d, 0x1a9d54, 0x6b3fa0, 0xe8742c, 0x2f6fb3, 0xc2417f];
const TYRE = 0x1a1a1a, DARK = 0x18181a, CHROME = 0xc9cdd2, INTERIOR = 0x2b2b2e;
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(k, 0, 1)).getHex();
const dim = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
/** Sky reflection on glass: dark below, light blue above. */
const glassGrad = (y0: number, y1: number): Paint => (_x, y) => mix(0x141b22, 0x86a3bb, (y - y0) / (y1 - y0));
const flipU = (r: Rect): Rect => [r[2], r[1], r[0], r[3]];
/** Hash in [0, 1) of two integers (who sits where, for a given occupancy pattern). */
const h2 = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

interface Look { skin: number; shirt: number; hat: number | null; wrap: boolean }
const lookOf = (i: number, p: number): Look => {
  const k = h2(i, p + 3);
  return { skin: SKIN[Math.floor(h2(i, p) * SKIN.length)], shirt: SHIRT[Math.floor(h2(p, i) * SHIRT.length)], hat: k < 0.45 ? WRAP[Math.floor(h2(i + 7, p) * WRAP.length)] : null, wrap: k < 0.25 };
};
/** Seated bust (torso, head, hair or headwrap/cap), optionally with arms to a steering wheel or handlebar. */
function person(b: KitBuilder, x: number, top: number, z: number, lk: Look, grips?: [V3, V3], yaw = 0) {
  if (yaw) { b.at(x, 0, z, yaw, () => person(b, 0, top, 0, lk)); return; }
  b.box(0.36, 0.5, 0.21, x, top + 0.02, z - 0.03, lk.shirt);
  b.blob(0.105, x, top + 0.7, z, lk.skin, [0.9, 1.12, 1.0]);
  if (lk.hat !== null && lk.wrap) b.box(0.23, 0.11, 0.25, x, top + 0.74, z - 0.01, lk.hat);
  else b.box(0.2, 0.07, 0.22, x, top + 0.77, z - 0.015, lk.hat ?? 0x161210);
  if (grips) [-1, 1].forEach((s, k) => b.beam([x + s * 0.18, top + 0.46, z - 0.02], grips[k], 0.075, 0.075, lk.shirt));
}
function tyre(b: KitBuilder, w: { x: number; y: number; z: number; r: number; width: number; steer?: boolean }, rim: Rect, seg = 12) {
  b.tag = [w.x, w.y, w.z, w.steer ? ANIM.spinSteer : ANIM.spin];               // spins (and steers) in the vertex shader
  b.cyl('x', w.r, w.r, w.width, w.x, w.y, w.z, TYRE, seg, w.x > 0 ? { pos: rim, neg: true, capPaint: TYRE } : { neg: rim, pos: true, capPaint: TYRE });
  b.tag = null;
}
/** Vertex animation modes (KitBuilder.tag w): wheels spin, steered wheels also turn, moto front end turns about the fork. */
const ANIM = { none: 0, spin: 1, spinSteer: 2, spinFork: 3, fork: 4 } as const;
/** Points of a side outline from y0 to y1 between z0 and z1 with wheel arches cut into its bottom edge. */
function outline(z0: number, z1: number, y0: number, y1: number, arches: { z: number; r: number; y: number }[], top?: [number, number, number?][]): [number, number, number?][] {
  const pts: [number, number, number?][] = [[z0, y0, T.SILL]];
  for (const a of arches.slice().sort((p, q) => p.z - q.z)) {
    if (a.z - a.r < z0 || a.z + a.r > z1) continue;
    const dy = y0 - a.y; if (Math.abs(dy) >= a.r) continue;
    const dz = Math.sqrt(a.r * a.r - dy * dy);
    pts.push([a.z - dz, y0, T.ARCH]);
    for (let k = 1; k < 8; k++) { const t = Math.PI - (Math.PI * k) / 8, py = a.y + a.r * Math.sin(t); if (py > y0 + 0.01) pts.push([a.z + a.r * Math.cos(t), py, T.ARCH]); }
    pts.push([a.z + dz, y0, T.SILL]);
  }
  pts.push([z1, y0, T.FRONT]);
  if (top) pts.push(...top); else pts.push([z1, y1, T.TOP], [z0, y1, T.REAR]);
  return pts;
}
/** Intervals of [z0, z1] outside the cut ranges (livery strips around wheel arches and doors). */
function spans(z0: number, z1: number, cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [[z0, z1]];
  for (const [a, b] of cuts) out = out.flatMap(([p, q]) => (b <= p || a >= q) ? [[p, q]] : [...(a > p ? [[p, a]] : []), ...(b < q ? [[b, q]] : [])] as [number, number][]);
  return out.filter(([p, q]) => q - p > 0.05);
}
/** Flat strip on a vertical side (x = ±xs), z0..z1, y0..y1, facing out. */
function sideStrip(b: KitBuilder, s: number, xs: number, z0: number, z1: number, y0: number, y1: number, paint: Paint, rect?: Rect) {
  const r: Rect | undefined = rect ? (s > 0 ? rect : rect) : undefined;
  if (s > 0) b.quad([xs, y0, z1], [xs, y0, z0], [xs, y1, z0], [xs, y1, z1], paint, r);
  else b.quad([-xs, y0, z0], [-xs, y0, z1], [-xs, y1, z1], [-xs, y1, z0], paint, r);
}
/** Decal on the side so that its text reads left-to-right from outside on both sides. */
function sideDecal(b: KitBuilder, s: number, xs: number, zc: number, yc: number, w: number, h: number, rect: Rect) {
  b.decal([s * xs, yc, zc], s > 0 ? [0, 0, -1] : [0, 0, 1], [0, 1, 0], w, h, rect);
}
const frontDecal = (b: KitBuilder, x: number, y: number, z: number, w: number, h: number, rect: Rect) => b.decal([x, y, z], [1, 0, 0], [0, 1, 0], w, h, rect);
const rearDecal = (b: KitBuilder, x: number, y: number, z: number, w: number, h: number, rect: Rect) => b.decal([x, y, z], [-1, 0, 0], [0, 1, 0], w, h, rect);
function beamQuad(b: KitBuilder, z0: number, len: number, w0: number, w1: number) {
  b.quad([w0 / 2, 0.05, z0], [-w0 / 2, 0.05, z0], [-w1 / 2, 0.05, z0 + len], [w1 / 2, 0.05, z0 + len], 0xffffff, [0, 0, 1, 1]);
}

/** Steering wheel at c (x, y, z) of radius r: centre and the two grips. */
const wheelControls = (c: V3, r: number): VehicleSpec['controls'] => ({ steering: c, grips: [[c[0] + r, c[1], c[2]], [c[0] - r, c[1], c[2]]] });
interface Wheel { x: number; y: number; z: number; r: number; width: number; steer: boolean }
interface Layout {
  L: number; W: number; H: number; wheelbase: number; wheels: Wheel[]; seats: VehicleSeat[]; doors: VehicleDoor[];
  head: V3[]; tail: V3[]; controls: VehicleSpec['controls']; step?: VehicleSpec['step']; cargo?: VehicleSpec['cargo'];
  drive?: Partial<VehicleSpec['drive']>;
}
interface Model {
  key: string; variant: number; colors: { body: number; accent: number }; layout: Layout;
  /** Seats with a baked person (reported in the spec). */
  occupied?: string[];
  speed: number; lod: number;
  near(b: KitBuilder, g: KitBuilder): void;
  far(b: KitBuilder): void;
  beam(b: KitBuilder): void;
}
type Pick = (r: () => number, o: VehicleOpts) => Model;
const wheelSet = (x: number, r: number, width: number, zs: number[], steerZ: number): Wheel[] => zs.flatMap(z => [1, -1].map(s => ({ x: s * x, y: r, z, r, width, steer: z === steerZ })));
const seat = (id: string, x: number, z: number, top: number, kind: SeatRole, door: string, yaw = 0): VehicleSeat => ({ id, x, z, top, yaw, kind, door });
/** Which seats get a baked passenger (≈ fraction of them), stable per pattern. */
const occupied = (seats: VehicleSeat[], o: VehicleOpts, p: number, fraction: number) =>
  seats.filter((s, i) => s.kind === 'driver' ? o.driver !== false : o.passengers !== false && (o.seated ? o.seated.includes(s.id) : h2(i + 1, p + 11) < fraction));

// ------------------------------------------------------------------------------------------------------------ cars
interface CarDims {
  L: number; W: number; r: number; tw: number; fz: number; rz: number; sill: number; nose: number; cowl: number; tail: number;
  zWs: number; zRf: number; zRr: number; zDeck: number; zB: number; cw: number; roof: number; inG: number; inR: number;
  seatTop: number; frontZ: number; rearZ: number | null; bed?: { floor: number };
  /** How far the top of the front / rear face leans back (m): modern noses and tails. */
  rake?: number; tailRake?: number;
}
/** Point and up vector on the (raked) front face at height y; same for the rear face. */
function frontFace(d: CarDims, y: number): { z: number; up: V3 } {
  const y0 = d.sill + 0.12, y1 = d.nose - 0.07, r = d.rake ?? 0, k = (y - y0) / (y1 - y0), n = Math.hypot(y1 - y0, r);
  return { z: d.L / 2 - r * k, up: [0, (y1 - y0) / n, -r / n] };
}
function rearFace(d: CarDims, y: number): { z: number; up: V3 } {
  const y0 = d.sill + 0.12, y1 = d.tail - 0.08, r = d.tailRake ?? 0, k = (y - y0) / (y1 - y0), n = Math.hypot(y1 - y0, r);
  return { z: -d.L / 2 + r * k, up: [0, (y1 - y0) / n, r / n] };
}
function onFront(b: KitBuilder, d: CarDims, x: number, y: number, w: number, h: number, rect: Rect) {
  const f = frontFace(d, y); b.decal([x, y + f.up[2] * -0.004, f.z + f.up[1] * 0.004], [1, 0, 0], f.up, w, h, rect);
}
function onRear(b: KitBuilder, d: CarDims, x: number, y: number, w: number, h: number, rect: Rect) {
  const f = rearFace(d, y); b.decal([x, y + f.up[2] * 0.004, f.z - f.up[1] * 0.004], [-1, 0, 0], f.up, w, h, rect);
}
interface CarPaint { body: number; roof: number; bonnet: number; deck: number; bumper: number; trim: number; bPillar: number; seat: number; rim: Rect; grille: Rect; head: Rect }

function carLayout(d: CarDims, extraSeats: VehicleSeat[] = []): Layout {
  const ws = wheelSet(d.W / 2 - d.tw / 2 - 0.03, d.r, d.tw, [d.fz, d.rz], d.fz);
  const seats = [seat('driver', 0.36, d.frontZ, d.seatTop, 'driver', 'fl'), seat('front', -0.36, d.frontZ, d.seatTop, 'passenger', 'fr')];
  if (d.rearZ !== null) seats.push(seat('rearL', 0.42, d.rearZ, d.seatTop + 0.02, 'passenger', 'rl'), seat('rearM', 0, d.rearZ, d.seatTop + 0.02, 'passenger', 'rl'), seat('rearR', -0.42, d.rearZ, d.seatTop + 0.02, 'passenger', 'rr'));
  seats.push(...extraSeats);
  const dz = (d.zWs + d.zB) / 2, rzd = d.rearZ ?? 0;
  const door = (id: string, s: number, z: number, ids: string[]): VehicleDoor => ({ id, side: s > 0 ? 'left' : 'right', x: s * d.W / 2, y: d.sill, z, width: 0.95, height: d.roof - d.sill - 0.05, board: [s * (d.W / 2 + 0.6), 0, z], seats: ids, open: false });
  const doors = [door('fl', 1, dz, ['driver']), door('fr', -1, dz, ['front'])];
  if (d.rearZ !== null) doors.push(door('rl', 1, rzd + 0.1, ['rearL', 'rearM']), door('rr', -1, rzd + 0.1, ['rearR']));
  if (extraSeats.length) doors.push({ id: 'tailgate', side: 'rear', x: 0, y: d.bed?.floor ?? d.sill, z: -d.L / 2, width: d.W - 0.2, height: 0.6, board: [0, 0, -d.L / 2 - 0.7], seats: extraSeats.map(s => s.id), open: true });
  return {
    L: d.L, W: d.W, H: d.roof, wheelbase: d.fz - d.rz, wheels: ws, seats, doors,
    head: [[d.W / 2 - 0.26, d.nose - 0.13, d.L / 2], [-(d.W / 2 - 0.26), d.nose - 0.13, d.L / 2]],
    tail: [[d.W / 2 - 0.2, d.tail - 0.16, -d.L / 2], [-(d.W / 2 - 0.2), d.tail - 0.16, -d.L / 2]],
    controls: wheelControls([0.36, d.cowl + 0.08, d.zWs - 0.42], 0.17),
  };
}

/** Saloon / hatch / SUV / pickup body: side profile with wheel arches, glasshouse with pillars and tinted glass, people inside. */
function carNear(b: KitBuilder, g: KitBuilder, d: CarDims, P: CarPaint, people: { seat: VehicleSeat; look: Look }[]) {
  const zr = -d.L / 2, zf = d.L / 2, hw = d.W / 2, ar = d.r + 0.06;
  const arches = [{ z: d.rz, r: ar, y: d.r }, { z: d.fz, r: ar, y: d.r }];
  b.shade = { lo: 0.62, y0: d.sill - 0.1, h: d.cowl - d.sill + 0.2 };
  const rk = d.rake ?? 0, tr = d.tailRake ?? 0;
  const top: [number, number, number?][] = [[zf - rk, d.nose - 0.07, T.FRONT], [zf - rk - 0.08, d.nose, T.BONNET], [d.zWs, d.cowl, T.BELT]];
  if (d.bed) top.push([d.zDeck, d.cowl, T.CAB], [d.zDeck, d.bed.floor, T.BED], [zr, d.bed.floor, T.REAR]);
  else top.push([d.zDeck, d.cowl, T.DECK], [zr + tr + 0.08, d.tail, T.REAR], [zr + tr, d.tail - 0.08, T.REAR]);
  const pts = outline(zr + 0.05, zf - 0.05, d.sill, d.cowl, arches, [[zf, d.sill + 0.12, T.FRONT], ...top, [zr, d.sill + 0.12, T.REAR]]);
  const hwAt = (y: number) => hw - 0.035 * (y - d.sill) / (d.cowl - d.sill);
  b.prism(pts, {
    hw: [d.sill, hw, d.cowl, hw - 0.035], paint: P.body,
    band: (_i, t) => t === T.ARCH ? 0x121212 : t === T.SILL ? dim(P.body, 0.35) : t === T.BELT ? INTERIOR : t === T.BONNET ? P.bonnet : t === T.DECK ? P.deck : t === T.BED ? 0x2e2e30 : P.body,
  });
  b.shade = null;
  // glasshouse: roof, pillars, glass
  const hwG = hw - d.inG, hwR = hw - d.inR, yR = d.roof - 0.05, zC = d.zDeck + d.cw;
  b.prism([[d.zRr - 0.02, yR, T.CEIL], [d.zRf + 0.02, yR, T.FRONT], [d.zRf - 0.07, d.roof, T.TOP], [d.zRr + 0.08, d.roof, T.REAR]], { hw: hwR + 0.015, paint: P.roof, band: (_i, t) => t === T.CEIL ? 0xcfc9bd : P.roof });
  for (const s of [1, -1]) {
    b.beam([s * (hwG - 0.03), d.cowl - 0.01, d.zWs - 0.02], [s * (hwR - 0.01), yR, d.zRf + 0.01], 0.07, 0.06, P.body);
    b.beam([s * (hwG - 0.025), d.cowl - 0.01, d.zB], [s * (hwR - 0.012), yR, d.zB - 0.07], 0.08, 0.05, P.bPillar);
    b.toward([[s * hwG, d.cowl, d.zDeck - 0.01], [s * hwG, d.cowl, zC], [s * hwR, yR, d.zRr + Math.max(0.08, d.cw * 0.45)], [s * hwR, yR, d.zRr - 0.01]], [s, 0, 0], P.body);
    if (d.bed || d.cw < 0.2) b.beam([s * (hwG - 0.02), d.cowl - 0.01, d.zDeck + 0.02], [s * (hwR - 0.01), yR, d.zRr + 0.02], 0.07, 0.06, P.body);
    // side glass
    const gx = (y: number) => s * (hwG + (hwR - hwG) * (y - d.cowl) / (yR - d.cowl) - 0.006);
    g.toward([[gx(d.cowl + 0.01), d.cowl + 0.01, zC], [gx(d.cowl + 0.01), d.cowl + 0.01, d.zWs + 0.03], [gx(yR - 0.01), yR - 0.01, d.zRf - 0.02], [gx(yR - 0.01), yR - 0.01, d.zRr + Math.max(0.08, d.cw * 0.45)]], [s, 0, 0], glassGrad(d.cowl, yR));
    // mirror, door seams, handles
    b.beam([s * hwG, d.cowl + 0.02, d.zWs - 0.06], [s * (hwG + 0.1), d.cowl + 0.06, d.zWs - 0.1], 0.03, 0.03, P.trim);
    b.box(0.07, 0.1, 0.15, s * (hwG + 0.13), d.cowl + 0.02, d.zWs - 0.12, P.body);
    const seams = [d.zWs + 0.06, d.zB]; if (d.rearZ !== null && !d.bed) seams.push(Math.max(d.rz + ar + 0.04, d.zDeck + 0.1));
    for (const z of seams) b.toward([[s * (hwAt(d.sill + 0.1) + 0.003), d.sill + 0.1, z - 0.006], [s * (hwAt(d.sill + 0.1) + 0.003), d.sill + 0.1, z + 0.006], [s * (hwAt(d.cowl - 0.03) + 0.003), d.cowl - 0.03, z + 0.006], [s * (hwAt(d.cowl - 0.03) + 0.003), d.cowl - 0.03, z - 0.006]], [s, 0, 0], dim(P.body, 0.3));
    for (const z of seams.slice(1)) b.box(0.025, 0.035, 0.13, s * (hwAt(d.cowl - 0.15) + 0.012), d.cowl - 0.17, z - 0.17, P.trim);
  }
  g.toward([[-hwG + 0.03, d.cowl + 0.01, d.zWs], [hwG - 0.03, d.cowl + 0.01, d.zWs], [hwR - 0.03, yR, d.zRf], [-hwR + 0.03, yR, d.zRf]], [0, 0.6, 1], glassGrad(d.cowl, yR));
  g.toward([[-hwG + 0.03, d.cowl + 0.01, d.zDeck], [hwG - 0.03, d.cowl + 0.01, d.zDeck], [hwR - 0.03, yR, d.zRr], [-hwR + 0.03, yR, d.zRr]], [0, 0.6, -1], glassGrad(d.cowl, yR));
  // interior: dashboard, wheel, seat backs, headrests
  b.box(2 * hwG - 0.08, 0.16, 0.38, 0, d.cowl - 0.1, d.zWs - 0.17, 0x202022);
  b.at(0.36, d.cowl + 0.08, d.zWs - 0.42, 0, () => b.cyl('z', 0.17, 0.17, 0.03, 0, 0, 0, 0x151515, 10), -0.45);
  const st = d.seatTop;
  for (const s of [1, -1]) { b.box(0.48, 0.62, 0.12, s * 0.36, st - 0.05, d.frontZ - 0.3, P.seat); b.box(0.24, 0.16, 0.1, s * 0.36, st + 0.58, d.frontZ - 0.31, P.seat); }
  if (d.rearZ !== null) { b.box(2 * hwG - 0.12, 0.6, 0.14, 0, st - 0.03, d.rearZ - 0.3, P.seat); for (const s of [1, -1]) b.box(0.24, 0.14, 0.1, s * 0.42, st + 0.58, d.rearZ - 0.31, P.seat); }
  for (const p of people) {
    const s = p.seat;
    // seated bust above the belt line (hips are inside the body: the torso starts at the seat)
    person(b, s.x, s.top, s.z, p.look, s.kind === 'driver' ? [[0.22, d.cowl + 0.12, d.zWs - 0.45], [0.5, d.cowl + 0.12, d.zWs - 0.45]] : undefined);
  }
  // front: bumper, grille, lamps, plate
  b.box(d.W + 0.02, 0.2, 0.16, 0, d.sill + 0.02, zf - 0.04, P.bumper);
  onFront(b, d, 0, (d.sill + 0.22 + d.nose - 0.06) / 2, d.W * 0.42, (d.nose - d.sill - 0.28) * 0.85, P.grille);
  for (const s of [1, -1]) onFront(b, d, s * (hw - 0.26), d.nose - 0.14, 0.36, 0.15, s > 0 ? flipU(P.head) : P.head);
  frontDecal(b, 0, d.sill + 0.12, zf + 0.045, 0.36, 0.09, UV.plate);
  // rear: bumper, lamps, plate
  b.box(d.W + 0.02, 0.2, 0.14, 0, d.sill + 0.02, zr + 0.03, P.bumper);
  for (const s of [1, -1]) onRear(b, d, s * (hw - 0.2), d.tail - 0.17, 0.32, 0.14, s > 0 ? UV.tail : flipU(UV.tail));
  if (d.bed) rearDecal(b, 0, d.sill + 0.13, zr - 0.045, 0.36, 0.09, UV.plate); else onRear(b, d, 0, (d.tail + d.sill) / 2 + 0.05, 0.36, 0.09, UV.plate);
  for (const w of carLayout(d).wheels) tyre(b, w, P.rim);
}
function carFar(b: KitBuilder, d: CarDims, P: CarPaint) {
  const zr = -d.L / 2, zf = d.L / 2, hw = d.W / 2;
  const profile: [number, number, number?][] = d.bed
    ? [[zr, d.sill, T.SILL], [zf, d.sill, T.FRONT], [zf, d.nose, T.BONNET], [d.zWs, d.cowl, T.BELT], [d.zDeck, d.cowl, T.BED], [zr, d.cowl, T.REAR]]
    : [[zr, d.sill, T.SILL], [zf, d.sill, T.FRONT], [zf - (d.rake ?? 0), d.nose, T.BONNET], [d.zWs, d.cowl, T.BELT], [d.zDeck, d.cowl, T.DECK], [zr + (d.tailRake ?? 0), d.tail, T.REAR]];
  b.prism(profile, { hw, paint: P.body, band: (_i, t) => t === T.SILL ? 0x151515 : t === T.BONNET ? P.bonnet : t === T.BED ? 0x2a2a2a : t === T.DECK ? P.deck : P.body });
  const hwG = hw - d.inG, hwR = hw - d.inR;
  b.prism([[d.zDeck, d.cowl, T.UNDER], [d.zWs, d.cowl, T.FRONT], [d.zRf, d.roof, T.TOP], [d.zRr, d.roof, T.REAR]], { hw: [d.cowl, hwG, d.roof, hwR], paint: 0x26323d, band: (_i, t) => t === T.TOP ? P.roof : t === T.UNDER ? null : 0x26323d });
  for (const w of carLayout(d).wheels) b.box(w.width, w.r * 1.8, w.r * 2, w.x, 0.02, w.z, TYRE);
  for (const s of [1, -1]) { onFront(b, d, s * (hw - 0.26), d.nose - 0.14, 0.36, 0.15, P.head); onRear(b, d, s * (hw - 0.2), d.tail - 0.17, 0.32, 0.14, UV.tail); }
}
function carModel(kind: VehicleKind, d: CarDims, P: CarPaint, key: string, variant: number, o: VehicleOpts, p: number, extra?: { near?: (b: KitBuilder, g: KitBuilder) => void; far?: (b: KitBuilder) => void; seats?: VehicleSeat[]; cargo?: Layout['cargo'] }, speed = 7): Model {
  const layout = carLayout(d, extra?.seats);
  if (extra?.cargo) layout.cargo = extra.cargo;
  const people = occupied(layout.seats, o, p, 0.35).map((s, i) => ({ seat: s, look: lookOf(i + 1, p + variant * 3) }));
  const occKey = people.map(q => q.seat.id).join('.');
  return {
    key: `${kind}|${key}|${occKey}`, variant, colors: { body: P.body, accent: P.roof }, layout, speed, lod: 40,
    near: (b, g) => { carNear(b, g, d, P, people.filter(q => q.seat.kind !== 'bench')); for (const q of people) if (q.seat.kind === 'bench') person(b, q.seat.x, q.seat.top, q.seat.z, q.look, undefined, q.seat.yaw); extra?.near?.(b, g); },
    far: b => { carFar(b, d, P); extra?.far?.(b); },
    beam: b => beamQuad(b, d.L / 2 + 0.3, 8, 1.7, 4.2),
  };
}
const basePaint = (body: number, rim: Rect): CarPaint => ({ body, roof: body, bonnet: body, deck: body, bumper: body, trim: DARK, bPillar: DARK, seat: 0x2a2a2c, rim, grille: UV.grille, head: UV.headRect });

const SEDAN_COLORS = [0xf2f2f0, 0xf2f2f0, 0xeeeeea, 0xb9bdc2, 0xa9adb2, 0x2a2c30, 0x1f3f78, 0x8c1c1c, 0xc9b48f, 0x3e5f3a];
const LUX_COLORS = [0x111214, 0x111214, 0x16181b, 0xf4f4f2, 0xeeeeec, 0x9da3a9, 0x1b2a4a, 0x4a1520];
const SUV_COLORS = [0xf2f2f0, 0xf2f2f0, 0x1a1b1d, 0x1a1b1d, 0xa7abb0, 0xc8b48a, 0x2f4a33];
const PICKUP_COLORS = [0xf2f2f0, 0xf2f2f0, 0xb9bdc2, 0x9b1d1d, 0x264d8a, 0x2a2a2a];
const TAXI_YELLOW = 0xf5c400, TAXI_BLACK = 0x141414;

const pickSedan: Pick = (r, o) => {
  const ci = Math.floor(r() * SEDAN_COLORS.length), body = o.color ?? SEDAN_COLORS[ci], p = Math.floor(r() * 3);
  const d: CarDims = { L: 4.5, W: 1.78, r: 0.31, tw: 0.2, fz: 1.36, rz: -1.32, sill: 0.27, nose: 0.74, cowl: 0.95, tail: 1.0, zWs: 0.95, zRf: 0.08, zRr: -0.9, zDeck: -1.52, zB: -0.25, cw: 0.32, roof: 1.43, inG: 0.07, inR: 0.22, seatTop: 0.52, frontZ: 0.0, rearZ: -0.92, rake: 0.14, tailRake: 0.1 };
  const P = { ...basePaint(body, UV.rimHubcap), bumper: body, trim: DARK };
  return carModel('sedan', d, P, `${body.toString(16)}`, ci, o, p);
};
const pickTaxi: Pick = (r, o) => {
  const v = Math.floor(r() * 2), p = Math.floor(r() * 3);
  // Dakar taxi: yellow body with black roof (and black bonnet and boot on the older ones), roof sign
  const d: CarDims = { L: 4.3, W: 1.7, r: 0.3, tw: 0.19, fz: 1.3, rz: -1.26, sill: 0.28, nose: 0.8, cowl: 0.96, tail: 0.98, zWs: 0.8, zRf: 0.28, zRr: -0.82, zDeck: -1.3, zB: -0.22, cw: 0.26, roof: 1.43, inG: 0.06, inR: 0.16, seatTop: 0.52, frontZ: 0.05, rearZ: -0.9 };
  const P: CarPaint = { ...basePaint(TAXI_YELLOW, UV.rimSteel), roof: TAXI_BLACK, bonnet: v ? TAXI_BLACK : TAXI_YELLOW, deck: v ? TAXI_BLACK : TAXI_YELLOW, bumper: 0x2a2a2a, bPillar: TAXI_BLACK, trim: 0x2a2a2a, seat: 0x3a2f28 };
  const sign = (b: KitBuilder) => b.box(0.5, 0.17, 0.19, 0, d.roof - 0.005, d.zRf - 0.32, TAXI_BLACK, { pz: { rect: UV.taxiSign }, nz: { rect: UV.taxiSign } });
  return carModel('taxi', d, P, `${v}`, v, o, p, {
    near: b => { sign(b); for (const s of [1, -1]) sideStrip(b, s, d.W / 2 - 0.02 + 0.006, -1.6, 1.85, d.sill + 0.24, d.sill + 0.3, TAXI_BLACK); },
    far: sign,
  });
};
const pickLuxury: Pick = (r, o) => {
  const ci = Math.floor(r() * LUX_COLORS.length), body = o.color ?? LUX_COLORS[ci], p = Math.floor(r() * 3);
  const d: CarDims = { L: 5.15, W: 1.92, r: 0.35, tw: 0.25, fz: 1.68, rz: -1.52, sill: 0.28, nose: 0.76, cowl: 0.98, tail: 1.02, zWs: 1.08, zRf: 0.12, zRr: -1.1, zDeck: -1.78, zB: -0.35, cw: 0.38, roof: 1.45, inG: 0.08, inR: 0.24, seatTop: 0.52, frontZ: 0.0, rearZ: -1.1, rake: 0.12, tailRake: 0.08 };
  const P: CarPaint = { ...basePaint(body, UV.rimAlloy), trim: CHROME, seat: 0xb9a68a, grille: UV.grilleChrome, bumper: body };
  return carModel('luxury', d, P, `${body.toString(16)}`, ci, o, p, {
    near: b => {
      const hwG = d.W / 2 - d.inG;
      for (const s of [1, -1]) {
        b.beam([s * (hwG + 0.006), d.cowl + 0.005, d.zDeck + 0.05], [s * (hwG + 0.006), d.cowl + 0.005, d.zWs - 0.02], 0.022, 0.022, CHROME);
        sideStrip(b, s, d.W / 2 - 0.02 + 0.006, -1.95, 1.95, d.sill + 0.1, d.sill + 0.125, CHROME);
      }
      b.box(d.W - 0.3, 0.035, 0.05, 0, d.sill + 0.21, d.L / 2 + 0.03, CHROME);
    },
  }, 8);
};
const pickSuv: Pick = (r, o) => {
  const ci = Math.floor(r() * SUV_COLORS.length), body = o.color ?? SUV_COLORS[ci], v = Math.floor(r() * 2), p = Math.floor(r() * 3);
  const d: CarDims = { L: 4.85, W: 1.94, r: 0.39, tw: 0.27, fz: 1.47, rz: -1.42, sill: 0.42, nose: 1.06, cowl: 1.2, tail: 1.22, zWs: 1.1, zRf: 0.55, zRr: -2.24, zDeck: -2.36, zB: -0.15, cw: 0.12, roof: 1.9, inG: 0.06, inR: 0.14, seatTop: 0.72, frontZ: 0.2, rearZ: -0.85, rake: 0.06 };
  const P: CarPaint = { ...basePaint(body, UV.rimSteel), bumper: 0x2a2a2c, trim: 0x2a2a2c, seat: 0x3a3530, grille: UV.grille };
  const rails = (b: KitBuilder) => { const x = d.W / 2 - d.inR - 0.06; for (const s of [1, -1]) { b.beam([s * x, d.roof + 0.07, d.zRr + 0.12], [s * x, d.roof + 0.07, d.zRf - 0.1], 0.04, 0.04, 0x2a2a2c); for (const z of [d.zRr + 0.15, d.zRf - 0.15]) b.box(0.04, 0.07, 0.06, s * x, d.roof - 0.005, z, 0x2a2a2c); } };
  return carModel('suv', d, P, `${body.toString(16)}|${v}`, ci, o, p, {
    near: b => {
      rails(b);
      // spare wheel on the tailgate, black wheel-arch flares and sills, bull bar on some
      b.cyl('z', 0.37, 0.37, 0.24, 0.25, 0.98, -d.L / 2 - 0.12, TYRE, 12, { neg: UV.rimSteel, pos: true, capPaint: TYRE });
      for (const s of [1, -1]) {
        sideStrip(b, s, d.W / 2 + 0.006, -1.0, 1.06, d.sill, d.sill + 0.1, 0x2a2a2c);
        for (const z of [d.fz, d.rz]) b.beam([s * (d.W / 2 - 0.01), d.r + 0.42, z - 0.5], [s * (d.W / 2 - 0.01), d.r + 0.42, z + 0.5], 0.07, 0.06, 0x2a2a2c);
      }
      if (v) {
        const z = d.L / 2 + 0.16;
        for (const s of [1, -1]) b.beam([s * 0.5, d.sill + 0.05, z], [s * 0.5, d.nose - 0.05, z], 0.06, 0.06, 0x202020);
        b.beam([-0.62, d.nose - 0.08, z], [0.62, d.nose - 0.08, z], 0.06, 0.06, 0x202020);
        b.beam([-0.62, d.sill + 0.3, z], [0.62, d.sill + 0.3, z], 0.06, 0.06, 0x202020);
      }
    },
    far: rails,
  }, 7);
};
const pickPickup: Pick = (r, o) => {
  const ci = Math.floor(r() * PICKUP_COLORS.length), body = o.color ?? PICKUP_COLORS[ci], load = Math.floor(r() * 3), p = Math.floor(r() * 3);
  const d: CarDims = { L: 5.2, W: 1.82, r: 0.36, tw: 0.24, fz: 1.78, rz: -1.38, sill: 0.42, nose: 1.0, cowl: 1.12, tail: 1.12, zWs: 1.02, zRf: 0.45, zRr: -0.44, zDeck: -0.5, zB: 0.0, cw: 0.06, roof: 1.8, inG: 0.06, inR: 0.15, seatTop: 0.68, frontZ: 0.2, rearZ: null, bed: { floor: 0.84 } };
  const P: CarPaint = { ...basePaint(body, UV.rimSteel), bumper: 0x8f959b, trim: 0x2a2a2c, seat: 0x3a3530 };
  const zr = -d.L / 2, bedSeats = [-1.25, -2.05].flatMap((z, k) => [1, -1].map(s => seat(`bed${k}${s > 0 ? 'L' : 'R'}`, s * (d.W / 2 - 0.12), z, d.cowl + 0.04, 'bench', 'tailgate', s * -Math.PI / 2)));
  const walls = (b: KitBuilder) => {
    for (const s of [1, -1]) b.box(0.06, d.cowl - d.bed!.floor, d.zDeck - zr - 0.02, s * (d.W / 2 - 0.03), d.bed!.floor, (d.zDeck + zr) / 2 - 0.01, body, s > 0 ? { nx: { paint: dim(body, 0.7) } } : { px: { paint: dim(body, 0.7) } });
    b.box(d.W - 0.12, d.cowl - d.bed!.floor - 0.02, 0.06, 0, d.bed!.floor, zr + 0.03, body, { pz: { paint: dim(body, 0.7) } });
    for (const s of [1, -1]) rearDecal(b, s * (d.W / 2 - 0.08), d.cowl - 0.12, zr - 0.004, 0.12, 0.2, UV.tail);
  };
  return carModel('pickup', d, P, `${body.toString(16)}|${load}`, ci, o, p, {
    seats: bedSeats,
    cargo: { x: 0, y: d.bed!.floor, z: (d.zDeck + zr) / 2, w: d.W - 0.12, d: d.zDeck - zr - 0.1, h: 0.6 },
    near: b => {
      walls(b);
      b.beam([d.W / 2 - 0.1, d.cowl + 0.02, d.zDeck - 0.1], [d.W / 2 - 0.1, d.roof + 0.02, d.zDeck - 0.1], 0.05, 0.05, 0x2a2a2c);
      b.beam([-(d.W / 2 - 0.1), d.cowl + 0.02, d.zDeck - 0.1], [-(d.W / 2 - 0.1), d.roof + 0.02, d.zDeck - 0.1], 0.05, 0.05, 0x2a2a2c);
      b.beam([-(d.W / 2 - 0.1), d.roof + 0.02, d.zDeck - 0.1], [d.W / 2 - 0.1, d.roof + 0.02, d.zDeck - 0.1], 0.05, 0.05, 0x2a2a2c);
      const f = d.bed!.floor;
      if (load === 0) for (let k = 0; k < 6; k++) b.box(0.55, 0.26, 0.42, (k % 2 ? -0.3 : 0.3), f + (k > 3 ? 0.26 : 0), -0.9 - Math.floor(k / 2) * 0.5, [0xe8dfc8, 0xd9cfb4, 0xf1ece0][k % 3], { rotY: (k % 3 - 1) * 0.08 });
      else if (load === 1) for (let k = 0; k < 8; k++) b.box(0.22, 0.34, 0.3, -0.6 + (k % 4) * 0.4, f, -0.95 - Math.floor(k / 4) * 0.45, 0xf2c21a);
    },
    far: b => { walls(b); },
  }, 7);
};

// ------------------------------------------------------------------------------------------------------------ car rapide
const CRC = { Y: 0xf2b705, BL: 0x1d4f9c, W: 0xf2efe6, IN: 0xd9cfb8, FLOOR: 0x3a3632, BENCH: 0x6b3a26 };
const pickCarRapide: Pick = (r, o) => {
  const livery = Math.floor(r() * 3), luggage = Math.floor(r() * 3), rack = r() < 0.6 ? 0xb8bcc0 : 0xe9b31c, p = Math.floor(r() * 3);
  const { Y, BL, W, IN } = CRC;
  const L = 6.0, hw = 1.05, sill = 0.42, floor = 0.62, belt = 1.32, winTop = 2.0, roofY = 2.4, fz = 1.95, rz = -1.7, wr = 0.38, ar = 0.45;
  const zr = -L / 2, zf = L / 2, zCab = 2.55;
  const wheels = wheelSet(hw - 0.14, wr, 0.24, [fz, rz], fz);
  const rows = [-2.38, -1.55, -0.72, 0.11];
  const seats: VehicleSeat[] = [seat('driver', 0.55, 1.78, 1.05, 'driver', 'driver'), seat('cab1', -0.05, 1.78, 1.05, 'passenger', 'cab'), seat('cab2', -0.6, 1.78, 1.05, 'passenger', 'cab')];
  rows.forEach((z, k) => (k === 0 ? [0.36, 0.8] : [-0.62, 0, 0.62]).forEach((x, j) => seats.push(seat(`b${k}${j}`, x, z, 0.98, 'bench', 'rear'))));
  const layout: Layout = {
    L: L + 0.3, W: 2.1, H: 2.95, wheelbase: fz - rz, wheels, seats,
    doors: [
      { id: 'rear', side: 'rear', x: -0.3, y: floor, z: zr, width: 0.9, height: winTop - floor, board: [-0.3, 0, zr - 0.75], seats: seats.filter(s => s.kind === 'bench').map(s => s.id), open: true },
      { id: 'driver', side: 'left', x: hw, y: floor, z: 1.95, width: 0.95, height: 1.45, board: [hw + 0.65, 0, 1.95], seats: ['driver'], open: false },
      { id: 'cab', side: 'right', x: -hw, y: floor, z: 1.95, width: 0.95, height: 1.45, board: [-hw - 0.65, 0, 1.95], seats: ['cab1', 'cab2'], open: false },
    ],
    head: [[0.72, 0.86, zf], [-0.72, 0.86, zf]], tail: [[0.95, 0.92, zr], [-0.92, 0.92, zr]],
    controls: wheelControls([0.55, 1.36, 2.18], 0.2),
    step: { riding: { x: -0.3, y: 0.43, z: zr - 0.2, yaw: Math.PI - 0.9 }, standing: { x: -1.55, y: 0, z: zr - 0.8, yaw: -Math.PI / 2 - 0.5 } },
  };
  // looks follow the seat (not the order), so a passenger keeps their look when others get on or off
  const people = occupied(seats, o, p, 0.62).map(s => ({ s, lk: lookOf(seats.indexOf(s) + 2, p + livery * 5) }));
  const occKey = people.map(q => q.s.id).join('.');
  const arches = [{ z: rz, r: ar, y: wr }, { z: fz, r: ar, y: wr }];
  const name = [UV.name0, UV.name1, UV.name2][livery], panel = [UV.panel0, UV.panel1, UV.panel2][livery];

  const near = (b: KitBuilder, g: KitBuilder) => {
    b.shade = { lo: 0.7, y0: 0.3, h: 1.4 };
    // lower side plates with wheel arches (outer: yellow, inner: cream), wheel housings, floor
    for (const s of [1, -1]) {
      b.prism(outline(zr, zCab, sill, belt, arches), { hw: 0.025, xc: s * (hw - 0.025), paint: Y, capPos: s > 0 ? Y : IN, capNeg: s > 0 ? IN : Y, band: (_i, t) => t === T.ARCH ? 0x161616 : Y });
      for (const z of [fz, rz]) b.box(0.16, 0.6, 2 * ar, s * 0.69, 0.3, z, 0x1c1c1c);
    }
    b.slab(2.02, 0.07, zCab - zr, 0, floor - 0.07, (zr + zCab) / 2, CRC.FLOOR);
    // window band: pillars, rear quarter panels, upper frieze plates
    const pill = (s: number, z: number, w: number, y0 = belt, y1 = winTop, col = Y) => b.box(0.05, y1 - y0, w, s * (hw - 0.025), y0, z, col, s > 0 ? { nx: { paint: IN } } : { px: { paint: IN } });
    for (const s of [1, -1]) {
      pill(s, (zr - 1.92) / 2, -1.92 - zr);                                // rear quarter, painted
      for (let k = 1; k < 5; k++) pill(s, -1.92 + k * 0.644, 0.08);
      pill(s, 1.36, 0.12);                                                 // B pillar
      pill(s, (zr + 2.3) / 2, 2.3 - zr, winTop, roofY);                    // upper band
    }
    // roof with the rounded front over the windscreen header (white top, cream ceiling)
    b.prism([[zr - 0.03, roofY, T.CEIL], [2.3, roofY, T.CAB], [2.3, 2.12, T.UNDER], [2.45, 2.12, T.FRONT], [2.48, 2.27, T.FRONT], [2.42, 2.4, T.TOP], [2.28, 2.48, T.TOP], [zr - 0.03, 2.48, T.REAR]], {
      hw: hw + 0.01, paint: Y, band: (_i, t) => t === T.CEIL || t === T.UNDER || t === T.CAB ? 0xe6e0d2 : t === T.TOP ? W : Y,
    });
    // nose and cab: bonnet, painted front, round lamps, chrome bumper and bull-bar, windscreen, mirrors
    b.prism([[zCab, sill, T.UNDER], [zf, sill, T.FRONT], [zf, 1.12, T.BONNET], [zf - 0.06, 1.2, T.BONNET], [zCab, belt, T.CAB]], { hw: [sill, hw, belt, hw - 0.03], paint: Y, band: (_i, t) => t === T.UNDER ? 0x1a1a1a : t === T.FRONT ? BL : t === T.CAB ? 0x2a2a2a : Y });
    b.shade = null;
    frontDecal(b, 0, 0.77, zf + 0.004, 2.06, 0.7, UV.front);
    for (const s of [1, -1]) frontDecal(b, s * 0.72, 0.86, zf + 0.008, 0.27, 0.27, UV.head);
    b.box(2.16, 0.15, 0.14, 0, 0.32, zf + 0.06, CHROME);
    frontDecal(b, 0, 0.395, zf + 0.132, 0.4, 0.1, UV.plate);
    for (const s of [1, -1]) { b.beam([s * 0.55, 0.32, zf + 0.15], [s * 0.55, 0.66, zf + 0.15], 0.05, 0.05, CHROME); b.beam([s * 0.55, 0.66, zf + 0.15], [s * 0.55, 0.66, zf + 0.02], 0.05, 0.05, CHROME); }
    g.toward([[-1.0, 1.33, 2.555], [1.0, 1.33, 2.555], [0.98, 2.12, 2.445], [-0.98, 2.12, 2.445]], [0, 0.3, 1], glassGrad(1.33, 2.12));
    frontDecal(b, 0, 2.2, 2.49, 1.7, 0.15, name);
    for (const s of [1, -1]) {
      b.beam([s * 1.02, 1.32, 2.56], [s * 1.0, 2.13, 2.45], 0.07, 0.07, Y);
      b.beam([s * 0.08, 1.36, 2.57], [s * 0.62, 1.4, 2.56], 0.02, 0.02, DARK);
      b.beam([s * 1.05, 1.72, 2.4], [s * 1.26, 1.72, 2.47], 0.04, 0.04, DARK);
      b.box(0.06, 0.32, 0.2, s * 1.28, 1.45, 2.48, DARK);
      // cab door window (glass) and door seams
      g.toward([[s * 1.04, 1.34, 1.44], [s * 1.04, 1.34, 2.5], [s * 1.04, 1.98, 2.41], [s * 1.04, 1.98, 1.44]], [s, 0, 0], glassGrad(1.34, 2.0));
      for (const z of [1.42, 2.52]) sideStrip(b, s, hw + 0.004, z - 0.008, z + 0.008, 0.66, belt, 0x3a3020);
      b.box(0.03, 0.04, 0.14, s * (hw + 0.012), 1.2, 1.6, CHROME);
    }
    // sliding windows: glass on the rear half of each passenger window
    for (const s of [1, -1]) for (let k = 0; k < 5; k++) { const z0 = -1.88 + k * 0.644; g.toward([[s * 1.03, belt + 0.02, z0], [s * 1.03, belt + 0.02, z0 + 0.27], [s * 1.03, winTop - 0.02, z0 + 0.27], [s * 1.03, winTop - 0.02, z0]], [s, 0, 0], glassGrad(belt, winTop)); }
    // livery: blue skirt, chevron band, white pinstripe, blue waist, frieze, rear quarter art
    for (const s of [1, -1]) {
      const xs = hw + 0.004;
      for (const [a, c] of spans(zr, zf, [[rz - ar, rz + ar], [fz - ar, fz + ar]])) sideStrip(b, s, xs, a, c, sill, 0.64, BL);
      sideDecal(b, s, xs, (zr + zCab) / 2, 1.06, zCab - zr - 0.04, 0.16, UV.band);
      sideStrip(b, s, xs, zr, zCab, 1.14, 1.18, W); sideStrip(b, s, xs, zr, zCab, 1.18, belt, BL);
      sideDecal(b, s, xs, (zr + 2.3) / 2, 2.2, 2.3 - zr - 0.06, 0.34, UV.frieze);
      sideDecal(b, s, xs, (zr - 1.92) / 2, 1.66, -1.92 - zr - 0.06, 0.62, panel);
    }
    // interior: front bench and dashboard, passenger benches (the last one leaves the doorway free)
    b.box(1.9, 0.18, 0.34, 0, 1.08, 2.38, 0x2a2622);
    b.at(0.55, 1.36, 2.18, 0, () => b.cyl('z', 0.2, 0.2, 0.03, 0, 0, 0, 0x151515, 10), -0.55);
    b.box(1.95, 1.05 - floor, 0.44, 0, floor, 1.8, CRC.BENCH); b.box(1.95, 0.55, 0.08, 0, 1.05, 1.54, CRC.BENCH);
    rows.forEach((z, k) => { const x0 = k === 0 ? 0.15 : -0.98, x1 = 0.98; b.box(x1 - x0, 0.98 - floor, 0.42, (x0 + x1) / 2, floor, z, CRC.BENCH); b.box(x1 - x0, 0.5, 0.07, (x0 + x1) / 2, 0.98, z - 0.25, CRC.BENCH); });
    for (const { s, lk } of people) person(b, s.x, s.top, s.z, lk, s.kind === 'driver' ? [[0.42, 1.42, 2.2], [0.68, 1.42, 2.2]] : undefined);
    // rear: walls around the open doorway, header with the nickname, lamps, window, open door, step, grab bars, ladder, bumpers
    const rw = (x0: number, x1: number, y0: number, y1: number, col = Y) => b.box(x1 - x0, y1 - y0, 0.05, (x0 + x1) / 2, y0, zr + 0.025, col, { pz: { paint: IN } });
    rw(-hw, hw, sill, floor, BL); rw(-hw, -0.76, floor, winTop); rw(0.16, hw, floor, winTop); rw(-hw, hw, winTop, roofY);
    for (const [x0, x1] of [[-hw, -0.76], [0.16, hw]] as const) b.quad([x1, sill, zr - 0.004], [x0, sill, zr - 0.004], [x0, 0.9, zr - 0.004], [x1, 0.9, zr - 0.004], BL);
    rearDecal(b, 0, 2.2, zr - 0.004, 1.7, 0.24, name);
    rearDecal(b, 0.6, 1.2, zr - 0.004, 0.8, 0.5, sub(UV.rear, 0, 0, 1, 1));
    g.toward([[0.95, 1.5, zr - 0.006], [0.3, 1.5, zr - 0.006], [0.3, 1.94, zr - 0.006], [0.95, 1.94, zr - 0.006]], [0, 0, -1], glassGrad(1.5, 1.94));
    rearDecal(b, 0.95, 0.92, zr - 0.006, 0.13, 0.3, UV.tail); rearDecal(b, -0.92, 0.92, zr - 0.006, 0.13, 0.3, UV.tail);
    b.at(-0.76, floor + 0.02, zr - 0.02, 1.95, () => b.box(0.9, 1.34, 0.04, 0.45, 0, 0, Y, { nz: { paint: IN } }));
    b.box(0.95, 0.05, 0.34, -0.3, 0.38, zr - 0.16, 0xaeb3b8); for (const x of [-0.7, 0.1]) b.beam([x, 0.4, zr - 0.3], [x, 0.6, zr], 0.04, 0.04, DARK);
    for (const x of [-0.79, 0.19]) b.beam([x, 0.75, zr - 0.05], [x, 1.95, zr - 0.05], 0.035, 0.035, CHROME);
    b.beam([-0.79, 2.06, zr - 0.06], [0.19, 2.06, zr - 0.06], 0.035, 0.035, CHROME);
    for (const x of [0.6, 0.93]) b.beam([x, 0.66, zr - 0.07], [x, 2.8, zr - 0.07], 0.04, 0.04, rack);
    for (let k = 0; k < 7; k++) b.beam([0.6, 0.95 + k * 0.3, zr - 0.07], [0.93, 0.95 + k * 0.3, zr - 0.07], 0.03, 0.03, rack);
    for (const [x0, x1] of [[-1.06, -0.8], [0.2, 1.06]] as const) b.box(x1 - x0, 0.14, 0.12, (x0 + x1) / 2, 0.36, zr - 0.05, CHROME);
    // roof rack with luggage
    const ry = 2.78;
    for (const s of [1, -1]) { b.beam([s * 0.98, ry, -2.92], [s * 0.98, ry, 2.12], 0.05, 0.05, rack); for (let k = 0; k < 6; k++) b.beam([s * 0.98, 2.48, -2.85 + k * 0.98], [s * 0.98, ry, -2.85 + k * 0.98], 0.04, 0.04, rack); }
    for (let k = 0; k < 7; k++) b.beam([-0.98, 2.56, -2.92 + k * 0.84], [0.98, 2.56, -2.92 + k * 0.84], 0.04, 0.04, rack);
    for (const z of [-2.92, 2.12]) b.beam([-0.98, ry, z], [0.98, ry, z], 0.05, 0.05, rack);
    const bags: [number, number, number, number, number, number, number][] = [
      [[-0.4, -2.3, 1.0, 0.42, 0.8, 0x6b3fa0, 0], [0.45, -1.55, 0.8, 0.5, 0.7, 0x8b6a47, 0.2], [-0.35, -0.6, 0.9, 0.36, 0.6, 0x1a9d54, 0], [0.35, 0.35, 0.9, 0.34, 0.6, 0x3a8fd1, -0.1], [-0.3, 1.25, 0.7, 0.4, 0.9, 0xd9482b, 0.1]],
      [[0, -2.0, 1.7, 0.3, 1.3, 0x2f6fb3, 0], [-0.4, -0.4, 0.8, 0.45, 0.7, 0xf2f2ec, 0.3], [0.45, 0.4, 0.7, 0.3, 0.6, 0xe8742c, 0], [0, 1.4, 1.6, 0.25, 0.9, 0x8b6a47, 0]],
      [[-0.35, -2.2, 0.9, 0.5, 0.9, 0xc2417f, 0.1], [0.4, -1.1, 0.9, 0.35, 1.2, 0x1a9d54, 0], [-0.3, 0.2, 1.0, 0.3, 0.8, 0x6b3fa0, -0.2]],
    ][luggage].map(a => a as [number, number, number, number, number, number, number]);
    for (const [x, z, w, h, dd, c, rot] of bags) b.box(w, h, dd, x, 2.5, z, c, { rotY: rot });
    if (luggage !== 1) { b.cyl('y', 0.42, 0.3, 0.26, 0.4, 2.63, 1.3, 0x3a8fd1, 10, { pos: true, neg: false }); }
    for (const w of wheels) tyre(b, w, UV.rimHubcap);
  };
  const far = (b: KitBuilder) => {
    b.prism([[zr, sill, T.UNDER], [zf, sill, T.FRONT], [zf, 1.15, T.BONNET], [zCab, belt, T.FRONT], [2.42, 2.15, T.TOP], [2.2, 2.48, T.TOP], [zr, 2.48, T.REAR]], { hw, paint: Y, band: (_i, t) => t === T.UNDER ? 0x151515 : t === T.TOP ? W : Y });
    for (const s of [1, -1]) {
      sideStrip(b, s, hw + 0.004, -1.92, 2.45, belt + 0.02, winTop, 0x1d232a);
      sideStrip(b, s, hw + 0.004, zr, zf, sill, 0.64, BL); sideStrip(b, s, hw + 0.004, zr, zCab, 1.18, belt, BL);
      sideDecal(b, s, hw + 0.004, (zr - 1.92) / 2, 1.66, -1.92 - zr - 0.06, 0.62, panel);
    }
    frontDecal(b, 0, 0.77, zf + 0.004, 2.06, 0.7, UV.front);
    for (const s of [1, -1]) frontDecal(b, s * 0.72, 0.86, zf + 0.008, 0.27, 0.27, UV.head);
    rearDecal(b, 0.95, 0.92, zr - 0.006, 0.13, 0.3, UV.tail); rearDecal(b, -0.92, 0.92, zr - 0.006, 0.13, 0.3, UV.tail);
    rearDecal(b, -0.3, 1.3, zr - 0.004, 0.9, 1.36, [PLAIN_UV[0], PLAIN_UV[1], PLAIN_UV[0], PLAIN_UV[1]]);
    b.quad([0.15, floor, zr - 0.006], [-0.75, floor, zr - 0.006], [-0.75, winTop, zr - 0.006], [0.15, winTop, zr - 0.006], 0x1a1a1a);
    b.box(1.96, 0.3, 4.9, 0, 2.48, -0.4, rack); b.box(1.5, 0.35, 3.0, 0, 2.6, -0.6, 0x6b3fa0);
    for (const w of wheels) b.box(w.width, w.r * 1.8, w.r * 2, w.x, 0.02, w.z, TYRE);
  };
  return { key: `carRapide|${livery}|${luggage}|${rack}|${occKey}`, occupied: people.map(q => q.s.id), variant: livery, colors: { body: Y, accent: BL }, layout, speed: 6, lod: 60, near, far, beam: b => beamQuad(b, zf + 0.3, 9, 2.0, 4.6) };
};

// ------------------------------------------------------------------------------------------------------------ city bus
const pickBus: Pick = (r, o) => {
  const line = Math.floor(r() * 3), p = Math.floor(r() * 3);
  const WH = 0xf4f4f2, BLUE = 0x1a3f8f, NAVY = 0x16233f, IN = 0xe4e1d8;
  const L = 11.6, hw = 1.25, sill = 0.36, floor = 0.72, belt = 1.28, winTop = 2.36, roofY = 2.96, fz = 3.65, rz = -2.55, wr = 0.5, ar = 0.6;
  const zr = -L / 2, zf = L / 2;
  const doorF: [number, number] = [4.35, 5.45], doorM: [number, number] = [0.1, 1.3];
  const wheels = wheelSet(hw - 0.17, wr, 0.3, [fz, rz], fz);
  const seats: VehicleSeat[] = [seat('driver', 0.68, 4.75, 1.16, 'driver', 'front')];
  const rowsZ: number[] = []; for (let z = -5.15; z < 3.1; z += 0.82) rowsZ.push(z);
  rowsZ.forEach((z, k) => {
    for (const s of [1, -1]) {
      if (s < 0 && z > doorM[0] - 0.5 && z < doorM[1] + 0.3) continue;
      for (const [j, x] of [0.98, 0.54].entries()) seats.push(seat(`r${k}${s > 0 ? 'L' : 'R'}${j}`, s * x, z, 1.14, 'passenger', z > 0.7 ? 'front' : 'middle'));
    }
  });
  const layout: Layout = {
    L, W: 2.5, H: 3.25, wheelbase: fz - rz, wheels, seats,
    doors: [
      { id: 'front', side: 'right', x: -hw, y: 0.4, z: (doorF[0] + doorF[1]) / 2, width: doorF[1] - doorF[0], height: 1.95, board: [-hw - 0.7, 0, (doorF[0] + doorF[1]) / 2], seats: seats.filter(s => s.door === 'front').map(s => s.id), open: false },
      { id: 'middle', side: 'right', x: -hw, y: 0.4, z: (doorM[0] + doorM[1]) / 2, width: doorM[1] - doorM[0], height: 1.95, board: [-hw - 0.7, 0, (doorM[0] + doorM[1]) / 2], seats: seats.filter(s => s.door === 'middle').map(s => s.id), open: false },
    ],
    head: [[0.88, 0.72, zf], [-0.88, 0.72, zf]], tail: [[1.0, 1.0, zr], [-1.0, 1.0, zr]],
    controls: wheelControls([0.68, 1.42, 5.15], 0.24),
  };
  const people = occupied(seats, o, p, 0.45).map((s, i) => ({ s, lk: lookOf(i + 5, p + line * 7) }));
  const arches = [{ z: rz, r: ar, y: wr }, { z: fz, r: ar, y: wr }];
  const dest = [UV.dest0, UV.dest1, UV.dest2][line];
  const near = (b: KitBuilder, g: KitBuilder) => {
    b.shade = { lo: 0.72, y0: 0.2, h: 1.6 };
    const plate = (s: number, z0: number, z1: number) => b.prism(outline(z0, z1, sill, belt, arches), { hw: 0.025, xc: s * (hw - 0.025), paint: WH, capPos: s > 0 ? WH : IN, capNeg: s > 0 ? IN : WH, band: (_i, t) => t === T.ARCH ? 0x151515 : WH });
    plate(1, zr, zf);
    for (const [a, c] of spans(zr, zf, [doorF, doorM])) plate(-1, a, c);
    for (const s of [1, -1]) for (const z of [fz, rz]) b.box(0.18, 0.75, 2 * ar, s * 0.8, 0.3, z, 0x1c1c1c);
    b.slab(2.42, 0.08, L - 0.1, 0, floor - 0.08, 0, 0x4a4a50);
    b.shade = null;
    // window band: navy pillars and glass; doors (glass leaves with dark frames); white upper band
    for (const s of [1, -1]) {
      const segs = s > 0 ? [[zr + 0.25, 5.3]] as [number, number][] : spans(zr + 0.25, 5.3, [doorF, doorM]);
      for (const [a, c] of segs) {
        const n = Math.max(1, Math.round((c - a) / 1.35));
        for (let k = 0; k <= n; k++) b.box(0.05, winTop - belt, 0.1, s * (hw - 0.025), belt, a + (k * (c - a)) / n, NAVY);
        g.toward([[s * (hw - 0.02), belt, a], [s * (hw - 0.02), belt, c], [s * (hw - 0.02), winTop, c], [s * (hw - 0.02), winTop, a]], [s, 0, 0], glassGrad(belt, winTop));
      }
      b.box(0.06, 0.06, L - 0.3, s * (hw - 0.02), belt - 0.03, -0.1, NAVY);
      b.box(0.05, roofY - winTop, L - 0.2, s * (hw - 0.025), winTop, -0.05, WH, s > 0 ? { nx: { paint: IN } } : { px: { paint: IN } });
      if (s > 0) b.box(0.05, winTop - belt, zf - 5.3, hw - 0.025, belt, (5.3 + zf) / 2, NAVY);
    }
    for (const [a, c] of [doorF, doorM]) {
      g.toward([[-hw + 0.02, 0.42, a], [-hw + 0.02, 0.42, c], [-hw + 0.02, 2.3, c], [-hw + 0.02, 2.3, a]], [-1, 0, 0], glassGrad(0.42, 2.3));
      for (const z of [a, (a + c) / 2, c]) b.box(0.05, 1.92, 0.07, -hw + 0.03, 0.4, z, DARK);
      for (const y of [0.4, 1.3, 2.3]) b.box(0.05, 0.06, c - a, -hw + 0.03, y, (a + c) / 2, DARK);
      b.box(0.3, 0.08, c - a, -hw + 0.2, 0.36, (a + c) / 2, 0x555555);
    }
    // roof, air-conditioning unit; ceiling light strips and handrails inside
    b.prism([[zr, roofY, T.CEIL], [zf - 0.05, roofY, T.FRONT], [zf - 0.1, 3.02, T.TOP], [zf - 0.3, 3.05, T.TOP], [zr, 3.05, T.REAR]], { hw: hw + 0.01, paint: WH, band: (_i, t) => t === T.CEIL ? IN : WH });
    b.box(1.6, 0.26, 2.3, 0, 3.05, -1.0, 0xdcdcd6);
    for (const s of [1, -1]) {
      b.decal([s * 0.62, roofY - 0.005, -0.3], [1, 0, 0], [0, 0, 1], 0.12, 9.6, UV.light);
      b.beam([s * 0.75, 2.35, -5.2], [s * 0.75, 2.35, 4.2], 0.035, 0.035, CHROME);
    }
    for (const z of [-3.3, -0.9, 1.6, 3.4]) for (const s of [1, -1]) b.beam([s * 0.3, floor, z], [s * 0.3, roofY, z], 0.04, 0.04, 0xf2c21a);
    // seats (patterned backs), driver, passengers
    rowsZ.forEach(z => {
      for (const s of [1, -1]) {
        if (s < 0 && z > doorM[0] - 0.5 && z < doorM[1] + 0.3) continue;
        b.box(0.9, 1.14 - floor, 0.42, s * 0.76, floor, z, 0x2a2f44);
        b.box(0.9, 0.52, 0.07, s * 0.76, 1.14, z - 0.23, 0x2b3f7a, { pz: { rect: UV.seatFabric } });
      }
    });
    b.box(0.5, 1.16 - floor, 0.45, 0.68, floor, 4.75, 0x222222); b.box(0.5, 0.6, 0.08, 0.68, 1.16, 4.5, 0x222222);
    b.box(2.3, 0.3, 0.45, 0, 1.0, 5.45, 0x232326);
    b.at(0.68, 1.42, 5.15, 0, () => b.cyl('y', 0.24, 0.24, 0.03, 0, 0, 0, 0x151515, 10), 0.35);
    for (const { s, lk } of people) person(b, s.x, s.top, s.z, lk, s.kind === 'driver' ? [[0.5, 1.45, 5.18], [0.86, 1.45, 5.18]] : undefined);
    // front: blue mask, big windscreen, destination board, grille, lamps, bumper, mirrors
    b.box(2.5, belt - sill, 0.06, 0, sill, zf - 0.03, WH, { nz: { paint: IN } });
    b.quad([-hw, sill, zf + 0.004], [hw, sill, zf + 0.004], [hw, 0.98, zf + 0.004], [-hw, 0.98, zf + 0.004], BLUE);
    frontDecal(b, 0, 0.6, zf + 0.008, 1.0, 0.26, UV.grille);
    for (const s of [1, -1]) frontDecal(b, s * 0.88, 0.72, zf + 0.008, 0.42, 0.2, s > 0 ? flipU(UV.headRect) : UV.headRect);
    frontDecal(b, 0, 0.36, zf + 0.085, 0.42, 0.1, UV.plate);
    b.box(2.54, 0.28, 0.14, 0, 0.18, zf + 0.01, 0x3a3a3c);
    g.toward([[-1.2, belt + 0.02, zf - 0.01], [1.2, belt + 0.02, zf - 0.01], [1.18, 2.55, zf - 0.08], [-1.18, 2.55, zf - 0.08]], [0, 0.2, 1], glassGrad(belt, 2.55));
    for (const s of [1, -1]) b.beam([s * 1.22, belt, zf - 0.02], [s * 1.2, 2.58, zf - 0.09], 0.07, 0.07, NAVY);
    b.beam([0, belt, zf - 0.02], [0, 2.58, zf - 0.09], 0.05, 0.05, NAVY);
    b.box(2.5, 0.42, 0.2, 0, 2.56, zf - 0.15, NAVY, { pz: { rect: dest } });
    for (const s of [1, -1]) { b.beam([s * 1.24, 2.6, zf - 0.2], [s * 1.38, 2.2, zf + 0.25], 0.04, 0.04, DARK); b.box(0.07, 0.36, 0.22, s * 1.4, 1.9, zf + 0.26, DARK); }
    // rear: engine grille, lamps, window, route number
    b.box(2.5, roofY - sill, 0.06, 0, sill, zr + 0.03, WH, { pz: { paint: IN } });
    b.quad([hw, sill, zr - 0.004], [-hw, sill, zr - 0.004], [-hw, 0.98, zr - 0.004], [hw, 0.98, zr - 0.004], BLUE);
    rearDecal(b, 0, 0.62, zr - 0.008, 1.3, 0.3, UV.grille);
    for (const s of [1, -1]) rearDecal(b, s * 1.0, 1.05, zr - 0.008, 0.36, 0.2, UV.tail);
    g.toward([[1.0, 1.7, zr - 0.01], [-1.0, 1.7, zr - 0.01], [-1.0, 2.4, zr - 0.01], [1.0, 2.4, zr - 0.01]], [0, 0, -1], glassGrad(1.7, 2.4));
    rearDecal(b, 0, 2.66, zr - 0.008, 1.1, 0.16, dest);
    b.box(2.54, 0.26, 0.12, 0, 0.18, zr - 0.02, 0x3a3a3c);
    // livery: blue skirt and yellow line, side strip with the line name
    for (const s of [1, -1]) {
      const cuts: [number, number][] = [[rz - ar, rz + ar], [fz - ar, fz + ar], ...(s < 0 ? [doorF, doorM] : [])];
      for (const [a, c] of spans(zr, zf, cuts)) { sideStrip(b, s, hw + 0.004, a, c, sill, 0.94, BLUE); sideStrip(b, s, hw + 0.004, a, c, 0.94, 1.0, 0xf2c21a); }
      sideDecal(b, s, hw + 0.004, -0.6, 2.66, 5.2, 0.48, UV.busSide);
    }
    for (const w of wheels) tyre(b, w, UV.rimSteel, 14);
  };
  const far = (b: KitBuilder) => {
    b.prism([[zr, sill, T.UNDER], [zf, sill, T.FRONT], [zf, belt, T.FRONT], [zf - 0.08, 2.6, T.FRONT], [zf - 0.2, 3.05, T.TOP], [zr, 3.05, T.REAR]], { hw, paint: WH, band: (_i, t) => t === T.UNDER ? 0x151515 : WH });
    for (const s of [1, -1]) { sideStrip(b, s, hw + 0.004, zr + 0.25, 5.3, belt, winTop, 0x1d2630); sideStrip(b, s, hw + 0.004, zr, zf, sill, 0.94, BLUE); }
    b.quad([-1.2, belt, zf + 0.004], [1.2, belt, zf + 0.004], [1.18, 2.55, zf - 0.07], [-1.18, 2.55, zf - 0.07], 0x1d2630);
    frontDecal(b, 0, 2.77, zf - 0.07, 2.2, 0.3, dest);
    for (const s of [1, -1]) { frontDecal(b, s * 0.88, 0.72, zf + 0.008, 0.42, 0.2, UV.headRect); rearDecal(b, s * 1.0, 1.05, zr - 0.008, 0.36, 0.2, UV.tail); }
    for (const w of wheels) b.box(w.width, w.r * 1.8, w.r * 2, w.x, 0.02, w.z, TYRE);
  };
  return { key: `bus|${line}|${people.map(q => q.s.id).join('.')}`, variant: line, colors: { body: WH, accent: BLUE }, layout, speed: 5, lod: 70, near, far, beam: b => beamQuad(b, zf + 0.3, 9, 2.2, 5) };
};

// ------------------------------------------------------------------------------------------------------------ truck
const TRUCK_CABS = [0xd23a2a, 0x1f6fb8, 0x2e8b3c, 0xf2c20f, 0xf2f2f0];
const pickTruck: Pick = (r, o) => {
  const ci = Math.floor(r() * TRUCK_CABS.length), cab = o.color ?? TRUCK_CABS[ci], load = Math.floor(r() * 3), p = Math.floor(r() * 3);
  const L = 7.4, hw = 1.15, zr = -L / 2, zf = L / 2, fz = 2.75, rz = -1.9, wr = 0.48, cab0 = 1.95, beltT = 1.62, roofT = 2.78, bedF = 1.15;
  const wheels: Wheel[] = [...[1, -1].map(s => ({ x: s * 0.98, y: wr, z: fz, r: wr, width: 0.28, steer: true })), ...[1, -1].flatMap(s => [0.98, 0.69].map(x => ({ x: s * x, y: wr, z: rz, r: wr, width: 0.26, steer: false })))];
  const seats = [seat('driver', 0.6, 2.9, 1.5, 'driver', 'left'), seat('cab1', 0, 2.9, 1.5, 'passenger', 'right'), seat('cab2', -0.6, 2.9, 1.5, 'passenger', 'right')];
  const layout: Layout = {
    L, W: 2.3, H: 2.9, wheelbase: fz - rz, wheels, seats,
    doors: [1, -1].map(s => ({ id: s > 0 ? 'left' : 'right', side: s > 0 ? 'left' as const : 'right' as const, x: s * hw, y: 1.05, z: 2.95, width: 0.95, height: 1.6, board: [s * (hw + 0.7), 0, 2.95] as V3, seats: s > 0 ? ['driver'] : ['cab1', 'cab2'], open: false })),
    head: [[0.85, 1.15, zf], [-0.85, 1.15, zf]], tail: [[1.0, 1.0, zr], [-1.0, 1.0, zr]],
    controls: wheelControls([0.6, 1.8, zf - 0.55], 0.22),
    cargo: { x: 0, y: bedF + 0.05, z: (zr + 1.85) / 2, w: 2.2, d: 1.85 - zr - 0.1, h: 0.9 },
  };
  const people = occupied(seats, o, p, 0.4).map((s, i) => ({ s, lk: lookOf(i + 9, p + ci) }));
  const near = (b: KitBuilder, g: KitBuilder) => {
    b.shade = { lo: 0.7, y0: 0.6, h: 1.6 };
    b.prism([[cab0, 0.95, T.UNDER], [zf, 0.95, T.FRONT], [zf, beltT, T.BELT], [cab0, beltT, T.CAB]], { hw, paint: cab, band: (_i, t) => t === T.UNDER ? 0x1a1a1a : t === T.BELT ? INTERIOR : cab });
    b.shade = null;
    b.box(2.3, roofT - beltT, 0.06, 0, beltT, cab0 + 0.03, cab);
    b.prism([[cab0, roofT - 0.06, T.CEIL], [zf - 0.08, roofT - 0.06, T.FRONT], [zf - 0.12, roofT + 0.04, T.TOP], [cab0, roofT + 0.04, T.REAR]], { hw: hw + 0.01, paint: cab, band: (_i, t) => t === T.CEIL ? 0xd9d3c4 : cab });
    for (const s of [1, -1]) {
      b.beam([s * (hw - 0.04), beltT, zf - 0.02], [s * (hw - 0.04), roofT - 0.05, zf - 0.1], 0.08, 0.08, cab);
      b.box(0.06, roofT - beltT, 0.55, s * (hw - 0.03), beltT, cab0 + 0.3, cab);
      g.toward([[s * (hw - 0.02), beltT + 0.02, cab0 + 0.58], [s * (hw - 0.02), beltT + 0.02, zf - 0.08], [s * (hw - 0.02), roofT - 0.08, zf - 0.14], [s * (hw - 0.02), roofT - 0.08, cab0 + 0.58]], [s, 0, 0], glassGrad(beltT, roofT));
      sideStrip(b, s, hw + 0.004, cab0 + 0.56, cab0 + 0.58, 1.0, beltT, dim(cab, 0.35));
      b.box(0.3, 0.06, 0.4, s * (hw - 0.05), 0.65, 2.95, 0x444444);
      b.beam([s * hw, 2.3, zf - 0.1], [s * (hw + 0.2), 2.3, zf - 0.05], 0.04, 0.04, DARK); b.box(0.07, 0.36, 0.2, s * (hw + 0.22), 1.95, zf - 0.05, DARK);
    }
    g.toward([[-1.08, beltT + 0.02, zf + 0.002], [1.08, beltT + 0.02, zf + 0.002], [1.06, roofT - 0.1, zf - 0.08], [-1.06, roofT - 0.1, zf - 0.08]], [0, 0.1, 1], glassGrad(beltT, roofT));
    b.box(2.2, 0.26, 0.12, 0, roofT - 0.1, zf - 0.02, cab, { pz: { rect: UV.truckBoard } });
    frontDecal(b, 0, 1.25, zf + 0.004, 1.1, 0.42, UV.grille);
    for (const s of [1, -1]) frontDecal(b, s * 0.85, 1.15, zf + 0.008, 0.26, 0.26, UV.head);
    b.box(2.36, 0.24, 0.16, 0, 0.72, zf + 0.04, 0x2a2a2a); frontDecal(b, 0, 0.84, zf + 0.122, 0.42, 0.1, UV.plate);
    b.box(1.9, 0.16, 0.38, 0, 1.52, zf - 0.3, 0x232326);
    b.at(0.6, 1.8, zf - 0.55, 0, () => b.cyl('y', 0.22, 0.22, 0.03, 0, 0, 0, 0x151515, 10), 0.5);
    b.box(2.1, 0.45, 0.45, 0, 1.05, 2.9, 0x5a3a2a); b.box(2.1, 0.55, 0.08, 0, 1.5, 2.62, 0x5a3a2a);
    for (const { s, lk } of people) person(b, s.x, s.top, s.z, lk, s.kind === 'driver' ? [[0.45, 1.78, 3.25], [0.75, 1.78, 3.25]] : undefined);
    // chassis, tank, mudguards; slatted wooden body painted in stripes, tailgate, load
    for (const s of [1, -1]) b.beam([s * 0.45, 0.85, zr + 0.1], [s * 0.45, 0.85, zf - 0.2], 0.12, 0.18, 0x222222);
    b.cyl('z', 0.24, 0.24, 0.9, 0.82, 0.78, 1.0, 0x8f959b, 10);
    for (const s of [1, -1]) { b.box(0.7, 0.06, 1.25, s * 0.84, 1.08, rz, 0x1a1a1a); b.box(0.5, 0.4, 0.03, s * 0.84, 0.35, rz - 0.66, 0x1a1a1a); }
    b.slab(2.3, 0.12, 1.85 - zr, 0, bedF - 0.12, (zr + 1.85) / 2, 0x6b4a2e, { py: { paint: 0x8a6a48 } });
    for (const s of [1, -1]) b.box(0.05, 0.95, 1.85 - zr, s * (hw - 0.025), bedF, (zr + 1.85) / 2, 0x7a5a3c, s > 0 ? { px: { rect: UV.slats } } : { nx: { rect: UV.slats } });
    b.box(2.3, 1.35, 0.06, 0, bedF, 1.82, 0x7a5a3c, { pz: { paint: cab } });
    b.box(2.3, 0.95, 0.05, 0, bedF, zr + 0.025, 0x7a5a3c, { nz: { rect: UV.slats } });
    for (const s of [1, -1]) rearDecal(b, s * 1.0, 1.0, zr - 0.006, 0.3, 0.16, UV.tail);
    b.box(2.3, 0.14, 0.1, 0, 0.82, zr + 0.02, 0x2a2a2a); rearDecal(b, 0, 0.6, zr - 0.006, 0.4, 0.1, UV.plate);
    if (load === 0) for (let k = 0; k < 12; k++) b.box(0.62, 0.3, 0.46, (k % 3 - 1) * 0.68, bedF + Math.floor(k / 6) * 0.3, -0.4 - (k % 6 >= 3 ? 0.5 : 0) - Math.floor(k / 6) * 0.25 + (k % 6 >= 3 ? 0 : 0.6), [0xe8dfc8, 0xd9cfb4, 0xf1ece0][k % 3], { rotY: ((k * 7) % 5 - 2) * 0.04 });
    else if (load === 1) b.prism([[zr + 0.2, bedF, T.UNDER], [1.7, bedF, T.FRONT], [1.6, bedF + 1.1, T.TOP], [zr + 0.3, bedF + 1.1, T.REAR]], { hw: [bedF, 1.1, bedF + 1.1, 0.95], paint: 0x2f6f4f, band: (_i, t) => t === T.UNDER ? null : 0x2f6f4f });
    for (const w of wheels) tyre(b, w, UV.rimTruck);
  };
  const far = (b: KitBuilder) => {
    b.prism([[cab0, 0.95, T.UNDER], [zf, 0.95, T.FRONT], [zf, roofT - 0.1, T.TOP], [zf - 0.12, roofT + 0.04, T.TOP], [cab0, roofT + 0.04, T.REAR]], { hw, paint: cab });
    for (const s of [1, -1]) sideStrip(b, s, hw + 0.004, cab0 + 0.58, zf - 0.08, beltT, roofT - 0.1, 0x1d232a);
    b.quad([-1.08, beltT, zf + 0.004], [1.08, beltT, zf + 0.004], [1.06, roofT - 0.1, zf + 0.004], [-1.06, roofT - 0.1, zf + 0.004], 0x1d232a);
    b.box(2.3, bedF + 0.95 - 0.8, 1.85 - zr, 0, 0.8, (zr + 1.85) / 2, 0x7a5a3c, { px: { rect: UV.slats }, nx: { rect: UV.slats } });
    for (const s of [1, -1]) { frontDecal(b, s * 0.85, 1.15, zf + 0.008, 0.26, 0.26, UV.head); rearDecal(b, s * 1.0, 1.0, zr - 0.006, 0.3, 0.16, UV.tail); }
    for (const w of wheels) if (Math.abs(w.x) > 0.9) b.box(0.5, w.r * 1.8, w.r * 2, w.x * 0.86, 0.02, w.z, TYRE);
  };
  return { key: `truck|${cab.toString(16)}|${load}|${people.map(q => q.s.id).join('.')}`, variant: ci, colors: { body: cab, accent: 0x7a5a3c }, layout, speed: 5, lod: 60, near, far, beam: b => beamQuad(b, zf + 0.3, 9, 2.0, 4.6) };
};

// ------------------------------------------------------------------------------------------------------------ motorbike
const MOTO_COLORS = [0xc0392b, 0x1f3f78, 0x111214, 0xe8e8e4, 0x2e8b3c, 0x6b3fa0];
const HELMET = [0xc0392b, 0x111214, 0xf2f2ec, 0x2f6fb3, 0xf4c20d];
const pickMoto: Pick = (r, o) => {
  const ci = Math.floor(r() * MOTO_COLORS.length), body = o.color ?? MOTO_COLORS[ci], scooter = r() < 0.3, p = Math.floor(r() * 3);
  const wr = scooter ? 0.23 : 0.3, fz = scooter ? 0.6 : 0.63, rz = scooter ? -0.62 : -0.64;
  const seatTop = scooter ? 0.78 : 0.9;
  const headY = scooter ? 1.0 : 0.96, headZ = fz - (scooter ? 0.12 : 0.2), hbY = headY + 0.12, hbZ = headZ - 0.1;
  const wheels: Wheel[] = [{ x: 0, y: wr, z: fz, r: wr, width: 0.1, steer: true }, { x: 0, y: wr, z: rz, r: wr, width: 0.1, steer: false }];
  const seats: VehicleSeat[] = [{ ...seat('driver', 0, -0.22, seatTop, 'driver', 'left'), clip: 'Ride' }, { ...seat('pillion', 0, -0.58, seatTop + 0.03, 'passenger', 'left'), clip: 'Ride' }];
  const layout: Layout = {
    L: 1.95, W: 0.75, H: 1.15, wheelbase: fz - rz, wheels, seats,
    doors: [{ id: 'left', side: 'left', x: 0.35, y: 0, z: -0.3, width: 0.8, height: 1.2, board: [0.7, 0, -0.3], seats: ['driver', 'pillion'], open: true }],
    head: [[0, scooter ? 1.0 : 0.98, 0.56]], tail: [[0, seatTop - 0.04, -0.9]],
    controls: { steering: [0, hbY, hbZ], grips: [[0.36, hbY, hbZ], [-0.36, hbY, hbZ]], pegs: scooter ? [[0.12, 0.37, 0.05], [-0.12, 0.37, 0.05]] : [[0.16, 0.37, -0.05], [-0.16, 0.37, -0.05]] },
    drive: { steerMax: 0.6, lean: 0.45, pivot: [0, headY, headZ], axis: (() => { const a = new THREE.Vector3(0, headY - 0.02 - wr, headZ - 0.06 - fz).normalize(); return [a.x, a.y, a.z] as V3; })() },
  };
  const rider = o.driver !== false, pillion = rider && o.passengers !== false && h2(p, ci) < 0.35, helmet = h2(ci, p + 1) < 0.5 ? HELMET[Math.floor(h2(p, 3) * HELMET.length)] : null;
  const near = (b: KitBuilder) => {
    for (const w of wheels) { b.tag = [0, w.y, w.z, w.steer ? ANIM.spinFork : ANIM.spin]; b.cyl('x', w.r, w.r, w.width, 0, w.y, w.z, TYRE, 12, { pos: UV.rimMoto, neg: UV.rimMoto }); }
    b.tag = [0, 0, 0, ANIM.fork];                                                   // fork, handlebar, lamp and mudguard turn with the steering
    const head: V3 = [0, headY, headZ];
    for (const s of [1, -1]) b.beam([s * 0.075, wr, fz], [s * 0.075, head[1] - 0.02, head[2] - 0.06], 0.035, 0.035, CHROME);
    b.beam([-0.36, head[1] + 0.12, head[2] - 0.1], [0.36, head[1] + 0.12, head[2] - 0.1], 0.03, 0.03, DARK);
    for (const s of [1, -1]) { b.box(0.08, 0.04, 0.04, s * 0.36, head[1] + 0.1, head[2] - 0.1, 0x111111); b.beam([s * 0.22, head[1] + 0.12, head[2] - 0.12], [s * 0.28, head[1] + 0.38, head[2] - 0.14], 0.015, 0.015, DARK); b.box(0.1, 0.07, 0.02, s * 0.29, head[1] + 0.38, head[2] - 0.14, DARK); }
    b.cyl('z', 0.085, 0.1, 0.12, 0, head[1], head[2] + 0.06, body, 10, { pos: UV.head, neg: true });
    b.beam([0, wr + 0.24, fz + 0.22], [0, wr + 0.32, fz - 0.02], 0.12, 0.02, body); b.beam([0, wr + 0.32, fz - 0.02], [0, wr + 0.26, fz - 0.22], 0.12, 0.02, body);
    b.tag = null;
    if (scooter) {
      b.prism([[0.25, 0.32, T.UNDER], [0.42, 0.34, T.FRONT], [0.5, 0.95, T.TOP], [0.42, 1.0, T.TOP], [0.36, 0.42, T.REAR]], { hw: [0.3, 0.2, 1.0, 0.16], paint: body });
      b.box(0.3, 0.06, 0.62, 0, 0.3, 0.0, 0x2a2a2a);
      b.prism([[-0.92, 0.42, T.UNDER], [-0.1, 0.36, T.FRONT], [-0.15, 0.74, T.TOP], [-0.95, 0.76, T.TOP], [-1.0, 0.6, T.REAR]], { hw: [0.36, 0.13, 0.76, 0.17], paint: body });
    } else {
      b.beam(head, [0, 0.42, 0.05], 0.06, 0.06, DARK); b.beam([0, 0.85, 0.3], [0, 0.82, -0.62], 0.05, 0.05, DARK);
      b.prism([[0.38, 0.8], [0.46, 0.9], [0.28, 1.0], [-0.02, 0.98], [-0.1, 0.84], [0.1, 0.76]], { hw: [0.76, 0.09, 1.0, 0.14], paint: body });
      b.box(0.24, 0.3, 0.38, 0, 0.24, 0.02, 0x6a6e73); b.box(0.2, 0.18, 0.2, 0, 0.5, 0.12, 0x8a8e93, { rotY: 0 });
      b.box(0.22, 0.2, 0.32, 0, 0.6, -0.32, body);
      b.cyl('z', 0.035, 0.035, 0.6, -0.15, 0.3, -0.25, CHROME, 6); b.cyl('z', 0.055, 0.045, 0.32, -0.15, 0.36, -0.68, CHROME, 8);
      for (const s of [1, -1]) { b.beam([s * 0.11, wr, rz], [s * 0.1, 0.36, 0.0], 0.04, 0.05, DARK); b.beam([s * 0.11, wr + 0.05, rz + 0.08], [s * 0.11, 0.84, -0.46], 0.035, 0.035, CHROME); }
    }
    b.prism([[-0.06, seatTop - 0.06], [-0.1, seatTop + 0.02], [-0.72, seatTop + 0.04], [-0.82, seatTop - 0.01], [-0.76, seatTop - 0.07]], { hw: 0.13, paint: 0x161616 });
    b.beam([0, seatTop - 0.06, -0.72], [0, seatTop - 0.18, -0.98], 0.13, 0.03, body);
    b.box(0.12, 0.06, 0.04, 0, seatTop - 0.1, -0.92, 0x2a0b0b, { nz: { rect: UV.tail } });
    for (const s of [1, -1]) b.beam([s * 0.11, seatTop - 0.02, -0.55], [s * 0.11, seatTop - 0.02, -0.95], 0.02, 0.02, CHROME);
    for (const s of [1, -1]) b.beam([s * 0.08, 0.36, -0.05], [s * 0.2, 0.36, -0.05], 0.03, 0.03, DARK);
    if (rider) {
      const lk = lookOf(ci + 1, p + 4), hipZ = -0.24, hipY = seatTop + 0.06, shY = seatTop + 0.6, grip = head[2] - 0.1;
      b.box(0.34, 0.18, 0.28, 0, seatTop - 0.02, hipZ, 0x2b2f3a);
      b.beam([0, hipY, hipZ - 0.02], [0, shY, hipZ + 0.14], 0.36, 0.22, lk.shirt);
      for (const s of [1, -1]) {
        b.beam([s * 0.19, shY - 0.04, hipZ + 0.13], [s * 0.27, shY - 0.26, hipZ + 0.36], 0.08, 0.08, lk.shirt);
        b.beam([s * 0.27, shY - 0.26, hipZ + 0.36], [s * 0.34, head[1] + 0.12, grip], 0.07, 0.07, lk.skin);
        b.beam([s * 0.12, hipY, hipZ + 0.02], [s * 0.18, hipY - 0.02, hipZ + 0.42], 0.13, 0.13, 0x2b2f3a);
        b.beam([s * 0.18, hipY - 0.02, hipZ + 0.42], [s * 0.18, 0.36, hipZ + 0.2], 0.1, 0.1, 0x2b2f3a);
        b.box(0.09, 0.07, 0.22, s * 0.18, 0.31, hipZ + 0.26, 0x1a1a1a);
      }
      b.blob(0.105, 0, shY + 0.19, hipZ + 0.2, lk.skin, [0.9, 1.1, 1], 1);
      if (helmet !== null) b.blob(0.135, 0, shY + 0.23, hipZ + 0.19, helmet, [0.95, 0.9, 1.05], 1);
      else b.blob(0.108, 0, shY + 0.24, hipZ + 0.19, lk.hat ?? 0x161210, [0.95, 0.6, 1.02], 1);
      if (pillion) {
        const lk2 = lookOf(ci + 3, p + 9), z2 = -0.6;
        b.box(0.34, 0.16, 0.26, 0, seatTop, z2, 0x3a2f4a);
        b.beam([0, seatTop + 0.08, z2], [0, seatTop + 0.62, z2 + 0.08], 0.36, 0.22, lk2.shirt);
        b.blob(0.105, 0, seatTop + 0.8, z2 + 0.12, lk2.skin, [0.9, 1.1, 1], 1);
        b.blob(0.118, 0, seatTop + 0.86, z2 + 0.11, lk2.hat ?? WRAP[p % WRAP.length], [1.05, 0.6, 1.1], 1);
        for (const s of [1, -1]) { b.beam([s * 0.13, seatTop + 0.06, z2], [s * 0.2, seatTop - 0.05, z2 + 0.35], 0.12, 0.12, 0x3a2f4a); b.beam([s * 0.2, seatTop - 0.05, z2 + 0.35], [s * 0.21, 0.38, z2 + 0.25], 0.1, 0.1, 0x3a2f4a); b.beam([s * 0.19, seatTop + 0.5, z2 + 0.08], [s * 0.15, seatTop + 0.3, z2 + 0.32], 0.07, 0.07, lk2.shirt); }
      }
    } else b.beam([0.1, 0.32, -0.1], [0.28, 0.02, -0.18], 0.025, 0.025, DARK);   // side stand down
  };
  const far = (b: KitBuilder) => {
    for (const w of wheels) b.box(0.1, w.r * 2, w.r * 2, 0, 0, w.z, TYRE);
    b.box(0.26, 0.4, 1.3, 0, wr + 0.1, -0.02, body);
    if (rider) { b.box(0.38, 0.62, 0.3, 0, seatTop, -0.18, SHIRT[ci % SHIRT.length]); b.blob(0.12, 0, seatTop + 0.78, -0.05, helmet ?? SKIN[ci % SKIN.length]); }
    frontDecal(b, 0, layout.head[0][1], 0.62, 0.16, 0.16, UV.head); rearDecal(b, 0, seatTop - 0.07, -0.95, 0.12, 0.06, UV.tail);
  };
  return { key: `moto|${body.toString(16)}|${scooter ? 1 : 0}|${rider ? 1 : 0}|${pillion ? 1 : 0}|${helmet ?? 'n'}|${p}`, variant: (scooter ? 10 : 0) + ci, colors: { body, accent: DARK }, layout, speed: 7.5, lod: 32, near, far, beam: b => beamQuad(b, 0.7, 6.5, 0.7, 2.6) };
};

const PICK: Record<VehicleKind, Pick> = { carRapide: pickCarRapide, bus: pickBus, taxi: pickTaxi, moto: pickMoto, sedan: pickSedan, suv: pickSuv, luxury: pickLuxury, pickup: pickPickup, truck: pickTruck };

// ------------------------------------------------------------------------------------------------------------ API
const geoCache = new Map<string, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null }>();
const beamCache = new Map<VehicleKind, THREE.BufferGeometry>();
const plainB = () => new KitBuilder(PLAIN_UV);
function geometryOf(key: string, build: (b: KitBuilder, g: KitBuilder) => void) {
  let hit = geoCache.get(key);
  if (!hit) {
    const b = plainB(), g = plainB();
    b.withTags = true;                                                              // the body material reads `wheel`
    build(b, g);
    hit = { body: b.build(), glass: g.triangles ? g.build() : null };
    geoCache.set(key, hit);
  }
  return hit;
}
const triCount = (g: THREE.BufferGeometry | null) => (g ? g.attributes.position.count / 3 : 0);
const rnd = () => Math.floor(Math.random() * 0x7fffffff);

function cameras(L: Layout): VehicleSpec['cameras'] {
  const drv = L.seats.find(s => s.kind === 'driver') ?? L.seats[0];
  const pas = L.seats.filter(s => s.kind !== 'driver').sort((a, b) => (a.x - b.x) || Math.abs(a.z) - Math.abs(b.z))[0] ?? drv;
  const side = pas.x < 0 ? -1 : pas.x > 0 ? 1 : -1;
  return {
    chase: { pos: [0, L.H + 1.5, -L.L / 2 - 4.2 - L.L * 0.25], look: [0, L.H * 0.55, L.L * 0.3], fov: 60 },
    driver: { pos: [drv.x, drv.top + 0.74, drv.z + 0.05], look: [drv.x, drv.top + 0.55, drv.z + 12], fov: 70 },
    passenger: { pos: [pas.x, pas.top + 0.72, pas.z], look: [pas.x + side * 6, pas.top + 0.45, pas.z + 2.5], fov: 70 },
    side: { pos: [L.W / 2 + 3.5 + L.L * 0.35, 1.6, L.L * 0.1], look: [0, L.H * 0.45, 0], fov: 50 },
  };
}

/** Spec only (no geometry): seats, doors, anchors… for adapters and tests. Same seed as buildVehicle → same spec. */
export function vehicleSpec(kind: VehicleKind, opts: VehicleOpts = {}): VehicleSpec {
  return buildVehicle(kind, { ...opts, lod: 'far' }).spec;
}

/** Builds a kit vehicle: a group (LOD near/far) named `kit_<kind>` (`kit_car_rapide` for the car rapide) and its spec. */
export function buildVehicle(kind: VehicleKind, opts: VehicleOpts = {}): VehicleBuild {
  const seed = opts.seed ?? rnd();
  const m = PICK[kind](seeded(seed), opts);
  const M = vehicleMaterials();
  const L = m.layout;
  const lodDistance = (opts.lodDistance ?? m.lod) * (opts.lite ? 0.65 : 1);
  const wantNear = opts.lod !== 'far', wantFar = opts.lod !== 'near';
  const near = wantNear ? geometryOf(m.key + '|near', m.near) : null;
  const far = wantFar ? geometryOf(m.key + '|far', b => m.far(b)) : null;
  let beam = beamCache.get(kind);
  if (!beam) { const b = plainB(); m.beam(b); beam = b.build(); beamCache.set(kind, beam); }

  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, name: string, cast: boolean) => { const x = new THREE.Mesh(g, mat); x.name = name; x.castShadow = cast; x.receiveShadow = false; x.userData.shared = true; return x; };
  const group = new THREE.Group(); group.name = kind === 'carRapide' ? 'kit_car_rapide' : `kit_${kind}`;
  let lod: THREE.LOD | null = null;
  const nearGroup = new THREE.Group();
  if (near) {
    nearGroup.name = 'near';
    nearGroup.add(mesh(near.body, M.body, 'body', true));
    if (near.glass) nearGroup.add(mesh(near.glass, M.glass, 'glass', false));
    nearGroup.add(mesh(beam, M.beam, 'beam', false));
  }
  const farMesh = far ? mesh(far.body, M.body, 'far', false) : null;
  if (near && farMesh) { lod = new THREE.LOD(); lod.name = 'lod'; lod.addLevel(nearGroup, 0, 0.08); lod.addLevel(farMesh, lodDistance, 0.08); lod.userData.kitBase = lodDistance; group.add(lod); }
  else if (near) group.add(nearGroup);
  else if (farMesh) group.add(farMesh);

  const spec: VehicleSpec = {
    kind, label: VEHICLE_LABEL[kind], seed, variant: m.variant, colors: m.colors,
    length: L.L, width: L.W, height: L.H, wheelbase: L.wheelbase, wheels: L.wheels.map(w => ({ ...w })),
    seats: L.seats.map(s => ({ ...s })), doors: L.doors.map(d => ({ ...d, seats: [...d.seats] })),
    cameras: cameras(L), lights: { head: L.head, tail: L.tail }, controls: L.controls, speed: m.speed, lodDistance,
    drive: { wheelRadius: L.wheels[0].r, steerMax: 0.6, lean: 0, ...L.drive },
    budget: {
      near: { tris: near ? triCount(near.body) + triCount(near.glass) : 0, drawCalls: near ? 1 + (near.glass ? 1 : 0) : 0, nightDrawCalls: near ? 2 + (near.glass ? 1 : 0) : 0 },
      far: { tris: far ? triCount(far.body) : 0, drawCalls: far ? 1 : 0 },
    },
  };
  if (L.step) { spec.step = L.step; spec.cameras.step = { pos: [L.step.riding.x - 0.2, 1.95, L.step.riding.z - 0.2], look: [-4, 1.3, L.step.riding.z - 6], fov: 70 }; }
  if (L.cargo) spec.cargo = { ...L.cargo };
  if (m.occupied) spec.occupied = [...m.occupied];
  group.userData.vehicleSpec = spec;
  return { group, spec, lod };
}

/** World yaw of an object (game convention: facing (sin yaw, cos yaw)). */
export function worldYaw(obj: THREE.Object3D) {
  const q = obj.getWorldQuaternion(new THREE.Quaternion()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return Math.atan2(f.x, f.z);
}
/** A local point of the vehicle (seat, door, anchor) in world coordinates. */
export function vehicleToWorld(obj: THREE.Object3D, p: V3, out = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  return out.set(p[0], p[1], p[2]).applyMatrix4(obj.matrixWorld);
}
/**
 * The vehicle's seats as interaction seats (src/interact/seats.ts) at its current world position: `top` is the
 * world height of the sitting surface, `space` usually the vehicle id. Moving vehicles recompute them each frame.
 */
export function vehicleSeats(obj: THREE.Object3D, spec: VehicleSpec, space: string, prefix = space): Seat[] {
  const yaw = worldYaw(obj), v = new THREE.Vector3();
  return spec.seats.map(s => { vehicleToWorld(obj, [s.x, s.top, s.z], v); return { id: `${prefix}:${s.id}`, x: v.x, z: v.z, top: v.y, yaw: yaw + s.yaw, kind: 'vehicle' as const, space, occupant: null, ...(s.clip ? { clip: s.clip } : {}) }; });
}
/** Camera anchor in world coordinates. */
export function vehicleCamera(obj: THREE.Object3D, a: CameraAnchor) {
  return { pos: vehicleToWorld(obj, a.pos), look: vehicleToWorld(obj, a.look), fov: a.fov };
}
/** Scales the far-model distance of every kit LOD under `root` (graphics quality: Low switches closer). */
export function scaleVehicleLods(root: THREE.Object3D, scale: number) {
  root.traverse(o => { const l = o as THREE.LOD; if (l.isLOD && typeof l.userData.kitBase === 'number') l.levels[1].distance = l.userData.kitBase * scale; });
}
/** Number of cached geometries (tests, debug). */
export const vehicleCacheSize = () => geoCache.size;
