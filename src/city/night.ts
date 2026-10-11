import * as THREE from 'three';
import type { GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { VehicleSpec } from '../actors/vehicleKit';
import { daylight } from '../core/clock';
import { WALL_R } from '../world/geew';
import { FLOOD, LIGHTS_KEEP, flicker, floodlights, isStreetPool, kioskHours, kioskLit, lampState, lampWarmth, nightOf, poolsOf, shopWash, spotHash, vehicleLit, type LampState } from './nightRules';

/**
 * The city at night (spec: Habib's evening happens after dark — the arena 17–23 h, then going out), cheap on purpose:
 *  - street lamps: the hub's warm light pools and bulbs (src/world/builder.ts) get a glow round each bulb; about one
 *    lamp in fourteen is out and one in twenty flickers; those round the arena are brighter, the way to its gate all lit;
 *  - vehicles on the move show glowing headlights and red tail lights (the kit's own lamps and beams light up already);
 *  - the arena: from the doors to the close, its four floodlight masts blaze, their beams and a haze glow over the walls
 *    (seen from the street), the ring is washed in light — one real spot light over it (not on the low setting);
 *  - shops and kiosks: the stocked shops' open fronts show a lit interior and spill light onto the pavement, the kiosks
 *    glow at their counters while they are open.
 * Draw calls: about nine for all of it (merged meshes and point sprites), none by day. Groups under ctx.extra: `night_lamps`,
 * `night_vehicles`, `night_arena`, `night_shops`.
 */
const WARM = new THREE.Color(0xffc27a), HEAD = new THREE.Color(0xfff2d6), TAIL = new THREE.Color(0xff2a14), FLOODC = new THREE.Color(0xfff4e0);
const MAX_VEHICLES = 72;

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture | null {
  if (glowTex || typeof document === 'undefined') return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'); if (!c) return null;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
const pointsMat = (size: number) => new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
const additive = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });

// ------------------------------------------------------------------ street lamps
interface Lamp { i: number; x: number; z: number; state: LampState; warm: number; seed: number; first: number; bulb: number[] }
class StreetLamps {
  readonly group = new THREE.Group();
  readonly lamps: Lamp[] = [];
  private flick: Lamp[] = [];
  private poolColors: THREE.BufferAttribute | null = null;
  private bulbColors: THREE.BufferAttribute | null = null;
  private bulbBase: Float32Array | null = null;
  private halo: THREE.Points;
  private haloCol: Float32Array;
  private t = 0;
  constructor(world: HubWorld) {
    this.group.name = 'night_lamps';
    const arena = world.arena, gate = arena ? { x: arena.cx, z: arena.cz - WALL_R } : null;
    const geo = world.lampGlow.geometry as THREE.BufferGeometry, pos = geo.attributes.position;
    // per-pool brightness on the hub's merged light pools (one attribute; the material multiplies it)
    const cols = new Float32Array(pos.count * 3).fill(1);
    this.poolColors = new THREE.BufferAttribute(cols, 3);
    geo.setAttribute('color', this.poolColors);
    (world.lampGlow.material as THREE.MeshBasicMaterial).vertexColors = true;
    (world.lampGlow.material as THREE.MeshBasicMaterial).color.set(0xffad55);
    (world.lampGlow.material as THREE.MeshBasicMaterial).needsUpdate = true;
    // the bulbs (src/world/builder.ts lampBulbs, on the hub's lamp material)
    let bulbs: THREE.Mesh | null = null;
    world.group.traverse(o => { const m = o as THREE.Mesh; if (!bulbs && m.isMesh && m.material === world.lamps) bulbs = m; });
    const bulbMesh = bulbs as THREE.Mesh | null;
    const bg = bulbMesh?.geometry as THREE.BufferGeometry | undefined;
    const bpos = bg?.attributes.position, bcol = bg?.attributes.color as THREE.BufferAttribute | undefined;
    const near = new Map<string, number[]>();
    if (bpos && bcol) {
      this.bulbColors = bcol; this.bulbBase = Float32Array.from(bcol.array as Float32Array);
      for (let v = 0; v < bpos.count; v++) {
        const y = bpos.getY(v); if (y < 5.8 || y > 6.5) continue;
        const k = `${Math.round(bpos.getX(v))},${Math.round(bpos.getZ(v))}`;
        (near.get(k) ?? near.set(k, []).get(k)!).push(v);
      }
    }
    for (const p of poolsOf(pos.array as ArrayLike<number>)) {
      if (!isStreetPool(p.r)) continue;
      const nearArena = !!arena && Math.hypot(p.x - arena.cx, p.z - arena.cz) < 75;
      const keep = !!gate && Math.hypot(p.x - gate.x, p.z - gate.z) < 50;
      const bulb: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const v of near.get(`${Math.round(p.x) + dx},${Math.round(p.z) + dz}`) ?? []) {
        if (Math.abs(bpos!.getX(v) - p.x) < 0.45 && Math.abs(bpos!.getZ(v) - p.z) < 0.45) bulb.push(v);
      }
      const lamp: Lamp = { i: this.lamps.length, x: p.x, z: p.z, state: lampState(p.x, p.z, keep), warm: lampWarmth(p.x, p.z, nearArena), seed: spotHash(p.x, p.z, 3) * 10, first: p.first, bulb };
      this.lamps.push(lamp);
      if (lamp.state === 'flicker') this.flick.push(lamp);
      this.setLamp(lamp, lamp.state === 'out' ? 0 : lamp.warm);
    }
    this.poolColors.needsUpdate = true; if (this.bulbColors) this.bulbColors.needsUpdate = true;
    // a soft glow round each working bulb (one draw call)
    const on = this.lamps;
    const hp = new Float32Array(on.length * 3); this.haloCol = new Float32Array(on.length * 3);
    on.forEach((l, i) => { hp[i * 3] = l.x; hp[i * 3 + 1] = 6.05; hp[i * 3 + 2] = l.z; });
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.BufferAttribute(this.haloCol, 3));
    this.halo = new THREE.Points(hg, pointsMat(2.4)); this.halo.name = 'lamp_halos'; this.halo.frustumCulled = false;
    this.group.add(this.halo);
    this.paintHalos(1);
  }

  /** Brightness b of a lamp: its pool (4 vertices) and its bulb. */
  private setLamp(l: Lamp, b: number) {
    const pc = this.poolColors!.array as Float32Array;
    for (let k = 0; k < 4; k++) { const o = (l.first + k) * 3; pc[o] = pc[o + 1] = pc[o + 2] = b; }
    if (this.bulbColors && this.bulbBase) {
      const bc = this.bulbColors.array as Float32Array, dark = Math.max(0.12, Math.min(1, b));
      for (const v of l.bulb) { const o = v * 3; bc[o] = this.bulbBase[o] * dark; bc[o + 1] = this.bulbBase[o + 1] * dark; bc[o + 2] = this.bulbBase[o + 2] * dark; }
    }
  }
  private paintHalos(scale: number) {
    this.lamps.forEach((l, i) => { const b = (l.state === 'out' ? 0 : l.warm) * scale; this.haloCol[i * 3] = WARM.r * b; this.haloCol[i * 3 + 1] = WARM.g * b; this.haloCol[i * 3 + 2] = WARM.b * b; });
    (this.halo.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number, night: number) {
    this.halo.visible = night > 0.3;
    if (!this.halo.visible || !this.flick.length) return;
    this.t += dt;
    for (const l of this.flick) {
      const b = flicker(this.t, l.seed) * l.warm;
      this.setLamp(l, b);
      const i = l.i; this.haloCol[i * 3] = WARM.r * b; this.haloCol[i * 3 + 1] = WARM.g * b; this.haloCol[i * 3 + 2] = WARM.b * b;
    }
    this.poolColors!.needsUpdate = true; if (this.bulbColors) this.bulbColors.needsUpdate = true;
    (this.halo.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  info() { return { lamps: this.lamps.length, out: this.lamps.filter(l => l.state === 'out').length, flicker: this.flick.length, bulbsFound: this.lamps.filter(l => l.bulb.length).length }; }
  dispose() { this.halo.geometry.dispose(); (this.halo.material as THREE.Material).dispose(); this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ vehicle lights
interface Tracked { g: THREE.Object3D; spec: VehicleSpec; x: number; z: number; moved: number }
class VehicleLights {
  readonly group = new THREE.Group();
  private tracked = new Map<THREE.Object3D, Tracked>();
  private scanT = 0;
  private pts: THREE.Points;
  private pos: Float32Array; private col: Float32Array;
  private v = new THREE.Vector3();
  constructor() {
    this.group.name = 'night_vehicles';
    this.pos = new Float32Array(MAX_VEHICLES * 4 * 3); this.col = new Float32Array(MAX_VEHICLES * 4 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.pts = new THREE.Points(g, pointsMat(0.95)); this.pts.name = 'vehicle_lamps'; this.pts.frustumCulled = false;
    this.group.add(this.pts);
  }
  /** Finds the kit vehicles under `root` (traffic, car rapides, taxis, the fight-evening flows, owned vehicles). */
  private scan(root: THREE.Object3D) {
    const seen = new Set<THREE.Object3D>();
    const walk = (o: THREE.Object3D) => {
      const spec = o.userData.vehicleSpec as VehicleSpec | undefined;
      if (spec) { seen.add(o); if (!this.tracked.has(o)) { o.getWorldPosition(this.v); this.tracked.set(o, { g: o, spec, x: this.v.x, z: this.v.z, moved: 1e9 }); } return; }
      for (const c of o.children) walk(c);
    };
    walk(root);
    for (const k of [...this.tracked.keys()]) if (!seen.has(k)) this.tracked.delete(k);
  }
  private lit: Tracked[] = [];
  /** Which vehicles show their lights (moving lately, shown, within 140 m); called from the module's update. */
  update(dt: number, night: number, root: THREE.Object3D, cam: THREE.Vector3) {
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.scan(root); }
    this.lit.length = 0;
    for (const t of this.tracked.values()) {
      t.g.getWorldPosition(this.v);
      // moving, or standing with its engine running (`userData.engineOn`: the gala road's jam)
      if (Math.hypot(this.v.x - t.x, this.v.z - t.z) > 0.02 || t.g.userData.engineOn) t.moved = 0; else t.moved += dt;
      t.x = this.v.x; t.z = this.v.z;
      if (this.lit.length < MAX_VEHICLES && vehicleLit(night, t.moved) && shown(t.g, root) && Math.hypot(t.x - cam.x, t.z - cam.z) < 140) this.lit.push(t);
    }
    if (!this.lit.length) { this.pts.visible = false; this.pts.geometry.setDrawRange(0, 0); }
  }
  /**
   * Places the lamps on the lit vehicles from their world matrices just before the frame is drawn (scene.onBeforeRender:
   * the street traffic moves after the modules' update, so placing them there would leave the lights a frame behind).
   */
  fill() {
    if (!this.lit.length) return;
    let n = 0;
    for (const t of this.lit) {
      const m = t.g.matrixWorld;
      for (const [list, c] of [[t.spec.lights.head, HEAD], [t.spec.lights.tail, TAIL]] as const) for (const p of list) {
        if (n >= MAX_VEHICLES * 4) break;
        this.v.set(p[0], p[1], p[2] + (c === HEAD ? 0.06 : -0.06)).applyMatrix4(m);
        this.pos[n * 3] = this.v.x; this.pos[n * 3 + 1] = this.v.y; this.pos[n * 3 + 2] = this.v.z;
        this.col[n * 3] = c.r; this.col[n * 3 + 1] = c.g; this.col[n * 3 + 2] = c.b; n++;
      }
    }
    const g = this.pts.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.pts.visible = n > 0;
  }
  count() { let n = 0; for (const t of this.tracked.values()) if (t.moved < LIGHTS_KEEP) n++; return { tracked: this.tracked.size, moving: n, lit: this.lit.length, lamps: this.pts.visible ? this.pts.geometry.drawRange.count : 0 }; }
  dispose() { this.pts.geometry.dispose(); (this.pts.material as THREE.Material).dispose(); this.group.removeFromParent(); }
}
/** Shown, and still under `root` (a vehicle taken away since the last scan shows nothing). */
const shown = (o: THREE.Object3D | null, root: THREE.Object3D) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) return true; } return false; };

// ------------------------------------------------------------------ the arena's floodlights
class ArenaFlood {
  readonly group = new THREE.Group();
  private heads: THREE.Points; private beams: THREE.Mesh; private haze: THREE.Mesh; private ring: THREE.Mesh;
  private beamMat = additive({ color: FLOODC, opacity: 0, side: THREE.DoubleSide, vertexColors: true });
  private hazeMat = additive({ color: 0xffd9a0, opacity: 0, side: THREE.DoubleSide, vertexColors: true });
  private ringMat = additive({ color: FLOODC, opacity: 0, map: glowTexture() });
  level = 0;
  constructor(world: HubWorld, private spot: THREE.SpotLight | null) {
    this.group.name = 'night_arena';
    const a = world.arena!, cx = a.cx, cz = a.cz, R = WALL_R + 1.6, y = 15.6;
    const hp: number[] = [], hc: number[] = [], beams: THREE.BufferGeometry[] = [];
    for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const x = cx + Math.sin(ang) * (R - 0.62), z = cz + Math.cos(ang) * (R - 0.62);
      for (const k of [-0.9, 0, 0.9]) { hp.push(x + Math.cos(ang) * k, y, z - Math.sin(ang) * k); hc.push(1, 0.97, 0.9); }
      // a beam from the mast head down onto the ring, wider at the bottom; bright at the lamp, fading down (vertex colours)
      const tx = cx + Math.sin(ang) * 4, tz = cz + Math.cos(ang) * 4, len = Math.hypot(tx - x, tz - z, y);
      const cone = new THREE.CylinderGeometry(0.9, 7.5, len, 14, 1, true);
      const cols = new Float32Array(cone.attributes.position.count * 3);
      for (let v = 0; v < cone.attributes.position.count; v++) { const f = (cone.attributes.position.getY(v) + len / 2) / len; cols[v * 3] = cols[v * 3 + 1] = cols[v * 3 + 2] = 0.15 + 0.85 * f; }
      cone.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const dir = new THREE.Vector3(x - tx, y, z - tz).normalize();
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      cone.translate((x + tx) / 2, y / 2, (z + tz) / 2);
      beams.push(cone.toNonIndexed());
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
    this.heads = new THREE.Points(hg, pointsMat(6)); this.heads.name = 'flood_heads';
    this.beams = new THREE.Mesh(merge(beams), this.beamMat); this.beams.name = 'flood_beams'; this.beams.renderOrder = 3;
    // the haze over the arena (seen over the walls from the street): a dome, bright at the base, gone at the top
    const dome = new THREE.SphereGeometry(30, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.55, 1);
    const dc = new Float32Array(dome.attributes.position.count * 3);
    for (let v = 0; v < dome.attributes.position.count; v++) { const f = 1 - dome.attributes.position.getY(v) / 16.5; dc[v * 3] = dc[v * 3 + 1] = dc[v * 3 + 2] = Math.max(0, f) ** 2; }
    dome.setAttribute('color', new THREE.BufferAttribute(dc, 3)); dome.translate(cx, 0, cz);
    this.haze = new THREE.Mesh(dome, this.hazeMat); this.haze.name = 'flood_haze'; this.haze.renderOrder = 2;
    const disc = new THREE.PlaneGeometry(46, 46); disc.rotateX(-Math.PI / 2); disc.translate(cx, world.heightAt(cx, cz) + 0.18, cz);
    this.ring = new THREE.Mesh(disc, this.ringMat); this.ring.name = 'flood_ring'; this.ring.renderOrder = 2;
    this.group.add(this.heads, this.beams, this.haze, this.ring);
    if (spot) { spot.position.set(cx, 34, cz); spot.target.position.set(cx, 0, cz); spot.target.updateMatrixWorld(); }
    this.set(0);
  }
  set(level: number) {
    this.level = level;
    this.group.visible = level > 0.01;
    this.beamMat.opacity = 0.085 * level; this.hazeMat.opacity = 0.05 * level; this.ringMat.opacity = 0.32 * level;
    (this.heads.material as THREE.PointsMaterial).opacity = level;
    if (this.spot) this.spot.intensity = 2.2 * level;
  }
  dispose() {
    for (const m of [this.heads, this.beams, this.haze, this.ring]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    if (this.spot) this.spot.intensity = 0;
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------ shops and kiosks
interface Kiosk { id: string; first: number; count: number; glow: number }
const KIOSK_GLOW = [1, 0.78, 0.5] as const;
class ShopLights {
  readonly group = new THREE.Group();
  private washMat = additive({ color: 0xffc98a, opacity: 0, side: THREE.BackSide });
  private spillMat = additive({ color: 0xffb860, opacity: 0, map: glowTexture(), vertexColors: true });
  private glows: THREE.Points | null = null;
  private spillCol: THREE.BufferAttribute | null = null;
  private kiosk: Kiosk[] = [];
  private quarter = -1;
  shops = 0; open = 0;
  get kiosks() { return this.kiosk.length; }
  constructor(world: HubWorld) {
    this.group.name = 'night_shops';
    const boxes: THREE.BufferGeometry[] = [], spills: THREE.BufferGeometry[] = [], gp: number[] = [], gc: number[] = [];
    let spillVerts = 0;
    const spill = (x: number, z: number, r: number) => {
      const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.translate(x, 0.17, z);
      const flat = g.toNonIndexed(); g.dispose(); spills.push(flat);
      const first = spillVerts; spillVerts += flat.attributes.position.count; return { first, count: flat.attributes.position.count };
    };
    // the stocked shops of the city (src/world/city.ts): a lit room behind the open front, light on the pavement
    world.group.traverse(o => {
      const s = o.userData.shop as { bounds?: { x0: number; x1: number; z0: number; z1: number }; front?: { x: number; z: number }; room?: boolean } | undefined;
      if (!s?.bounds || !s.front || s.room) return;
      const w = shopWash(s.bounds, s.front);
      const b = new THREE.BoxGeometry(w.box.w, w.box.h, w.box.d); b.translate(w.box.x, 0.2 + w.box.h / 2, w.box.z);
      boxes.push(b.toNonIndexed()); b.dispose();
      spill(w.spill.x, w.spill.z, w.spill.r);
      this.shops++;
    });
    // the kiosks, gargotes, cafés and the Dibi: a glow at the counter while they are open
    for (const it of world.interactables) {
      if (!kioskHours(it.id)) continue;
      const sp = spill(it.x, it.z, 2.6);
      this.kiosk.push({ id: it.id, ...sp, glow: gp.length / 3 });
      gp.push(it.x, 2.3, it.z); gc.push(...KIOSK_GLOW);
    }
    if (boxes.length) { const m = new THREE.Mesh(merge(boxes), this.washMat); m.name = 'shop_wash'; m.renderOrder = 2; this.group.add(m); }
    if (spills.length) {
      const g = merge(spills, true);
      this.spillCol = new THREE.BufferAttribute(new Float32Array(spillVerts * 3).fill(1), 3); g.setAttribute('color', this.spillCol);
      const m = new THREE.Mesh(g, this.spillMat); m.name = 'shop_spill'; m.renderOrder = 1; this.group.add(m);
    }
    if (gp.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
      this.glows = new THREE.Points(g, pointsMat(1.8)); this.glows.name = 'kiosk_glows'; this.group.add(this.glows);
    }
  }
  /** Which kiosks are open at this hour (re-read every quarter of an hour). */
  private paintKiosks(hour: number) {
    const sc = this.spillCol?.array as Float32Array | undefined, gcol = this.glows?.geometry.attributes.color as THREE.BufferAttribute | undefined;
    this.open = 0;
    for (const k of this.kiosk) {
      const on = kioskLit(k.id, hour) ? 1 : 0; this.open += on;
      if (sc) sc.fill(on, k.first * 3, (k.first + k.count) * 3);
      if (gcol) for (let c = 0; c < 3; c++) (gcol.array as Float32Array)[k.glow * 3 + c] = KIOSK_GLOW[c] * on;
    }
    if (this.spillCol) this.spillCol.needsUpdate = true;
    if (gcol) gcol.needsUpdate = true;
  }
  set(night: number, hour: number) {
    this.group.visible = night > 0.2;
    if (!this.group.visible) return;
    const q = Math.floor(hour * 4);
    if (q !== this.quarter) { this.quarter = q; this.paintKiosks(hour); }
    this.washMat.opacity = 0.16 * night; this.spillMat.opacity = 0.42 * night;
    if (this.glows) (this.glows.material as THREE.PointsMaterial).opacity = night;
  }
  dispose() { this.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.Points).isPoints) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); this.group.removeFromParent(); }
}

/** Concatenates non-indexed geometries (position, colour and uv when present). */
function merge(parts: THREE.BufferGeometry[], uv = false): THREE.BufferGeometry {
  const n = parts.reduce((t, p) => t + p.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = parts.some(p => p.attributes.color) ? new Float32Array(n * 3).fill(1) : null, uvs = uv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const p of parts) {
    const c = p.attributes.position.count;
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    if (col && p.attributes.color) col.set(p.attributes.color.array as Float32Array, o * 3);
    if (uvs && p.attributes.uv) uvs.set(p.attributes.uv.array as Float32Array, o * 2);
    o += c; p.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// ------------------------------------------------------------------ module
let lamps: StreetLamps | null = null, vehicles: VehicleLights | null = null, flood: ArenaFlood | null = null, shops: ShopLights | null = null;
let spot: THREE.SpotLight | null = null;
/** Debug only: play the night lights at this darkness (0–1) and hour, or null for the clock's. */
let force: { night: number; hour: number } | null = null;

export const nightModule: GameModule = {
  name: 'night',
  init(ctx) {
    // one real light for the whole game (made once: adding lights later would recompile every material)
    if (ctx.quality() !== 'low') {
      spot = new THREE.SpotLight(0xfff1d6, 0, 0, 0.7, 0.45, 0);
      spot.name = 'arena_spot'; spot.target.name = 'arena_spot_target'; spot.castShadow = false;
      ctx.scene.add(spot, spot.target);
    }
    const before = ctx.scene.onBeforeRender.bind(ctx.scene);
    ctx.scene.onBeforeRender = (r, s, c, g, m, gr) => { before(r, s, c, g, m, gr); vehicles?.fill(); };
  },
  hubLoaded(ctx, hub) {
    lamps?.dispose(); vehicles?.dispose(); flood?.dispose(); shops?.dispose();
    lamps = new StreetLamps(hub); vehicles = new VehicleLights(); shops = new ShopLights(hub);
    flood = hub.arena ? new ArenaFlood(hub, spot) : null;
    ctx.extra.add(lamps.group, vehicles.group, shops.group);
    if (flood) ctx.extra.add(flood.group);
    if (!flood && spot) spot.intensity = 0;
  },
  update(ctx, dt) {
    const hour = force?.hour ?? ctx.hour(), night = force?.night ?? nightOf(daylight(hour));
    const indoors = !!ctx.inside();
    lamps?.update(dt, indoors ? 0 : night);
    vehicles?.update(dt, indoors ? 0 : night, ctx.extra, ctx.camera.position);
    shops?.set(indoors ? 0 : night, hour);
    if (flood) {
      const want = indoors ? 0 : floodlights(hour, night);
      flood.set(flood.level + (want - flood.level) * Math.min(1, dt * 1.5));   // the masts warm up over a second or two
    }
  },
  debug: ctx => ({
    night: {
      info: () => ({ lamps: lamps?.info() ?? null, vehicles: vehicles?.count() ?? null, flood: flood ? { level: flood.level, window: FLOOD } : null, shops: shops ? { shops: shops.shops, kiosks: shops.kiosks, open: shops.open } : null, spot: spot ? spot.intensity : null }),
      /** Force the darkness (0–1) and the hour, or null to follow the clock. */
      force: (night: number | null, hour?: number) => { force = night === null ? null : { night, hour: hour ?? ctx.hour() }; },
    },
  }),
};
