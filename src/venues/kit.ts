import * as THREE from 'three';
import { Batch, signTexture } from '../world/batch';
import { addGrain } from '../world/grain';
import { generatedTexture, plasterTexture } from '../world/textures';
import type { Collider } from '../world/types';
import type { Seat, SeatKind } from '../interact/seats';
import type { Clip } from '../actors/humanoid';

/**
 * Building kit of the venues: every venue is laid out in its own local frame (front toward +z, origin at the centre of
 * its site) and placed with one yaw, so the same plan serves a lot facing north in Pikine and south in the Médina.
 * Geometry goes into a few merged batches per material (one draw call each); colliders and seats come out in world
 * coordinates for the shared systems.
 */
export type MatKey = 'plain' | 'wall' | 'block' | 'tin' | 'wood' | 'floor' | 'paving' | 'metal' | 'glow';

/** Materials of one hub's venues (built after the hub, so Low quality's grain setting applies); textures are shared caches. */
export class VenueMaterials {
  readonly m: Record<MatKey, THREE.Material>;
  constructor() {
    const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    this.m = {
      plain: addGrain(lam(), 0.7, 1),
      wall: addGrain(lam(), 0.4, 1, false, plasterTexture(), 2),
      block: addGrain(lam(), 0.4, 1, false, generatedTexture('hollow_block'), 1.2, 0.02),
      tin: addGrain(lam(), 0.3, 1, false, generatedTexture('corrugated_rusty'), 1.2, 0.015),
      wood: addGrain(lam(), 0.2, 1, false, generatedTexture('wood'), 1),
      floor: addGrain(lam(), 0.5, 1, false, generatedTexture('concrete'), 2),
      paving: addGrain(lam(), 0.4, 1, false, generatedTexture('paving'), 2),
      metal: addGrain(lam(), 0.3, 1, false, generatedTexture('painted_metal'), 1.2),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
  }
  /** Bulbs, tubes and embers brighten at night (0 = day, 1 = night). */
  setNight(n: number) { (this.m.glow as THREE.MeshBasicMaterial).color.setScalar(0.45 + 0.55 * n); }
  dispose() { for (const m of Object.values(this.m)) m.dispose(); }
}

export class VenueKit {
  readonly group = new THREE.Group();
  readonly b: Record<MatKey, Batch>;
  readonly colliders: Collider[] = [];
  readonly seats: Seat[] = [];
  private own: { dispose(): void }[] = [];
  private c: number; private s: number;

  /** origin: world position of the local (0, 0); yaw: world yaw of the local +z (front); space: seats' space. */
  constructor(readonly origin: { x: number; z: number }, readonly yaw: number, readonly space = 'street', y = 0) {
    this.group.position.set(origin.x, y, origin.z); this.group.rotation.y = yaw;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
    this.b = { plain: new Batch(), wall: new Batch(), block: new Batch(), tin: new Batch(), wood: new Batch(), floor: new Batch(), paving: new Batch(), metal: new Batch(), glow: new Batch() };
  }

  /** Local (x, z) → world. */
  w(x: number, z: number) { return { x: this.origin.x + x * this.c + z * this.s, z: this.origin.z - x * this.s + z * this.c }; }
  /** Local facing → world facing. */
  yawW(localYaw: number) { return localYaw + this.yaw; }

  /** Solid box centred at local (x, z), w along local x, d along local z (world AABB; venues turn by quarter turns). */
  solid(x: number, z: number, w: number, d: number, h = 2) {
    const p = this.w(x, z), ac = Math.abs(this.c), as = Math.abs(this.s);
    const W = w * ac + d * as, D = w * as + d * ac;
    this.colliders.push({ x0: p.x - W / 2, x1: p.x + W / 2, z0: p.z - D / 2, z1: p.z + D / 2, h });
  }
  /** A seat at local (x, z) facing local yaw. */
  seat(id: string, x: number, z: number, localYaw: number, top: number, kind: SeatKind, clip?: Clip): Seat {
    const p = this.w(x, z);
    const s: Seat = { id, x: p.x, z: p.z, top, yaw: this.yawW(localYaw), kind, space: this.space, occupant: null, ...(clip ? { clip } : {}) };
    this.seats.push(s); return s;
  }
  /** Seats along a bench of length `len` at local (x, z), sitters facing local yaw. */
  bench(prefix: string, x: number, z: number, localYaw: number, len: number, count: number, top: number, kind: SeatKind = 'bench', clip?: Clip): Seat[] {
    const ax = Math.cos(localYaw), az = -Math.sin(localYaw);
    return Array.from({ length: count }, (_, i) => {
      const o = count === 1 ? 0 : (i / (count - 1) - 0.5) * (len - 0.8);
      return this.seat(`${prefix}:${i}`, x + ax * o, z + az * o, localYaw, top, kind, clip);
    });
  }

  /** A painted sign board (lit a little at night by `signs`). Local position and facing. */
  sign(text: string, bg: string, fg: string, x: number, y: number, z: number, localYaw: number, w: number, h: number, wide = 768): THREE.Mesh {
    const tex = signTexture(text, bg, fg, wide, Math.round((wide * h) / w));
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = localYaw; this.group.add(m);
    this.own.push(tex, mat, m.geometry);
    return m;
  }
  /** Any mesh with its own material (rugs, prints…), disposed with the venue. */
  mesh(g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.group) {
    const m = new THREE.Mesh(g, mat); parent.add(m); this.own.push(g, mat); return m;
  }
  /** Keep something to dispose with the venue (textures, materials made by the venue). */
  keep<T extends { dispose(): void }>(x: T): T { this.own.push(x); return x; }

  /** Merge the batches into the group (one draw call per used material). */
  build(mats: VenueMaterials) {
    const shadow: Partial<Record<MatKey, boolean>> = { plain: true, wall: true, block: true, tin: true, wood: true, metal: true };
    for (const k of Object.keys(this.b) as MatKey[]) {
      const mesh = this.b[k].build(mats.m[k], k !== 'glow', !!shadow[k]);
      if (mesh) { this.group.add(mesh); this.own.push(mesh.geometry); }
    }
  }
  dispose() { this.group.removeFromParent(); for (const o of this.own) o.dispose(); this.own = []; }
}

// ---------------------------------------------------------------- shapes
/** Wall piece over an opening: a rectangle `span` wide up to `top` above the springing line, a half-disc cut from it. */
export function archPiece(span: number, top: number, depth: number): THREE.BufferGeometry {
  const r = span / 2, s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(-r, top); s.lineTo(r, top); s.lineTo(r, 0);
  s.absarc(0, 0, r, 0, Math.PI, false);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Half-ring band over an arch (a trim, a frame): inner and outer radius, extruded `depth` along z. */
export function archBand(rIn: number, rOut: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(rOut, 0); s.absarc(0, 0, rOut, 0, Math.PI, false); s.lineTo(-rIn, 0); s.absarc(0, 0, rIn, Math.PI, 0, true); s.lineTo(rOut, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Thin crescent finial (a torus arc), in the XY plane. */
export function crescent(r: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, r * 0.16, 5, 14, Math.PI * 1.45);
  g.rotateZ(Math.PI / 2 - Math.PI * 0.725);
  return g;
}

// ---------------------------------------------------------------- smoke
let smokeTex: THREE.Texture | null = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!, gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(232,230,226,0.9)'); gr.addColorStop(0.55, 'rgba(214,212,206,0.35)'); gr.addColorStop(1, 'rgba(200,200,195,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(cv); smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}

/** Grill smoke: a few soft sprites rising, spreading and fading (world space). Off when the grill is cold. */
export class Smoke {
  readonly group = new THREE.Group();
  private puffs: { s: THREE.Sprite; t: number }[] = [];
  private mats: THREE.SpriteMaterial[] = [];
  on = true;
  constructor(private at: THREE.Vector3, n: number, private rise = 3.4, private spread = 1.9) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(mat); s.renderOrder = 2; this.group.add(s); this.mats.push(mat);
      this.puffs.push({ s, t: i / n });
    }
  }
  update(dt: number, night: number) {
    this.group.visible = this.on;
    if (!this.on) return;
    for (const p of this.puffs) {
      p.t = (p.t + dt * 0.26) % 1;
      const k = p.t, m = p.s.material as THREE.SpriteMaterial;
      p.s.position.set(this.at.x + Math.sin(k * 5 + p.t * 9) * 0.25 + k * 0.7, this.at.y + k * this.rise, this.at.z + Math.cos(k * 4) * 0.2 + k * 0.3);
      p.s.scale.setScalar(0.45 + k * this.spread);
      m.opacity = (0.5 - night * 0.18) * (1 - k) * Math.min(1, k * 6);
      m.color.setScalar(1 - night * 0.45);
    }
  }
  dispose() { this.group.removeFromParent(); for (const m of this.mats) m.dispose(); }
}

/** Soft radial texture for additive glows (ember light on the ground, bulbs at night). */
let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
/** Additive glow quad (lying on the ground, or upright facing local +z). */
export function glowQuad(kit: VenueKit, w: number, h: number, color: number, x: number, y: number, z: number, flat = true): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.PlaneGeometry(w, h); if (flat) g.rotateX(-Math.PI / 2);
  const m = kit.mesh(g, mat); m.position.set(x, y, z); m.renderOrder = 1;
  return m;
}
