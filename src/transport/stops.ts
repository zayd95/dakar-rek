import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from '../world/batch';
import { benchSeats, type Seat } from '../interact/seats';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import type { Collider } from '../world/types';
import { KERB, stopOnLeg, type LineDef, type StopDef } from './lines';

/** Top of the pavement slabs (builder G): people stand at 0.1, seats sit on it. */
const PAVE = 0.12;
const BENCH_TOP = PAVE + 0.5;
/** The stop's spot on the pavement: metres from the road's centre line (pavement from KERB to KERB + 2). */
export const STOP_OFFSET = KERB + 1.25;

/** A stop placed in the hub: its spot on the pavement, the road direction, and where the vehicle's door stops. */
export interface StopSite {
  def: StopDef;
  index: number;
  /** Spot on the pavement (shelter, waiting people, where you land when you get off). */
  x: number; z: number;
  /** Road direction (unit), right-hand side (towards the pavement). */
  dx: number; dz: number; rx: number; rz: number;
  /** Facing the road (yaw), for the bench and the people waiting. */
  yaw: number;
  seats: Seat[];
}

const blocked = (x: number, z: number, r: number, cols: readonly Collider[]) => cols.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

/** Stop sites of a line: on the pavement at the right of the leg, slid along the kerb if a wall or a stall is in the way. */
export function placeStops(line: LineDef, colliders: readonly Collider[], space = 'street'): StopSite[] {
  return line.stops.map((def, index) => {
    const leg = stopOnLeg(line, def), rx = -leg.dz, rz = leg.dx;
    let along = 0;
    for (const d of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) {
      const x = leg.x + leg.dx * d + rx * STOP_OFFSET, z = leg.z + leg.dz * d + rz * STOP_OFFSET;
      if (!blocked(x, z, 1.4, colliders)) { along = d; break; }
    }
    const x = leg.x + leg.dx * along + rx * STOP_OFFSET, z = leg.z + leg.dz * along + rz * STOP_OFFSET;
    const yaw = Math.atan2(-rx, -rz);
    const bx = x + rx * 0.25, bz = z + rz * 0.25;
    const seats = benchSeats(`stop:${line.hub}:${line.id}:${def.id}`, bx, bz, yaw, BENCH_TOP, space, 1.9, 2);
    return { def, index, x, z, dx: leg.dx, dz: leg.dz, rx, rz, yaw, seats };
  });
}

const BLUE = 0x1e3a8a, YELLOW = 0xf4c20d, POST = 0x3b3f46, WOOD = 0x8b5a2b;
const shared = new THREE.MeshLambertMaterial({ vertexColors: true });
shared.userData.shared = true;

/** Sign texture: one row per stop — « ARRÊT · Gare » on yellow, the line and its termini on blue. */
function signAtlas(line: LineDef, rows: number): THREE.CanvasTexture {
  const H = 128, cv = document.createElement('canvas'); cv.width = 256; cv.height = H * rows;
  const c = cv.getContext('2d')!;
  line.stops.forEach((s, i) => {
    const y = i * H;
    c.fillStyle = '#f4c20d'; c.fillRect(0, y, 256, 72);
    c.fillStyle = '#1e3a8a'; c.fillRect(0, y + 72, 256, 56);
    c.fillStyle = '#d9322b'; c.fillRect(0, y + 68, 256, 6);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#1b2a7a'; c.font = '800 17px system-ui, sans-serif'; c.fillText('ARRÊT · CAR RAPIDE', 128, y + 18);
    let size = 34; c.font = `900 ${size}px system-ui, sans-serif`;
    while (c.measureText(s.name).width > 236 && size > 16) { size -= 2; c.font = `900 ${size}px system-ui, sans-serif`; }
    c.fillText(s.name, 128, y + 47);
    c.fillStyle = '#fde68a'; c.font = '800 19px system-ui, sans-serif'; c.fillText(`${line.number} · ${line.from} ⇄ ${line.to}`, 128, y + 101, 240);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/**
 * Street furniture of a line's stops, merged per hub: shelters, benches, poles and the kerb mark in one draw call, the
 * sign plates (both faces readable) in a second one.
 */
export function buildStops(line: LineDef, sites: readonly StopSite[], lite: boolean): { group: THREE.Group; dispose(): void } {
  const b = new Batch(), plates: THREE.BufferGeometry[] = [];
  const atlas = signAtlas(line, sites.length);
  for (const s of sites) {
    const along = Math.atan2(-s.dz, s.dx);                               // box local x along the road
    const at = (a: number, r: number) => ({ x: s.x + s.dx * a + s.rx * r, z: s.z + s.dz * a + s.rz * r });
    for (const a of [-1.25, 1.25]) { const p = at(a, 0.5); b.box(0.1, 2.45, 0.1, p.x, PAVE, p.z, POST); }
    { const p = at(0, 0.15); b.box(2.9, 0.08, 1.25, p.x, PAVE + 2.42, p.z, BLUE, along); }
    { const p = at(0, -0.45); b.box(2.9, 0.12, 0.06, p.x, PAVE + 2.32, p.z, YELLOW, along); }
    { const p = at(0, 0.58); b.box(2.5, 1.05, 0.05, p.x, PAVE + 0.8, p.z, BLUE, along); b.box(2.5, 0.1, 0.06, p.x, PAVE + 1.85, p.z, YELLOW, along); }
    { const p = at(0, 0.25); b.box(1.95, 0.07, 0.42, p.x, BENCH_TOP - 0.07, p.z, WOOD, along); }
    for (const a of [-0.85, 0.85]) { const p = at(a, 0.25); b.box(0.07, BENCH_TOP - PAVE - 0.07, 0.36, p.x, PAVE, p.z, POST, along); }
    // pole with the sign plate at the back of the pavement ahead of the shelter, plate across the road direction
    // (clear of the vehicle's side and of the passengers' window view)
    const pole = at(1.9, 0.35);
    b.box(0.09, 2.95, 0.09, pole.x, PAVE, pole.z, POST);
    const g = new THREE.BoxGeometry(0.8, 0.42, 0.04);
    const uv = g.attributes.uv as THREE.BufferAttribute, v0 = 1 - (s.index + 1) / sites.length, v1 = 1 - s.index / sites.length;
    for (let i = 0; i < uv.count; i++) {
      if (i >= 16) uv.setXY(i, uv.getX(i), v0 + uv.getY(i) * (v1 - v0));     // the two large faces show the row
      else uv.setXY(i, 0.5, v0 + 0.1 * (v1 - v0));                            // edges: the blue band
    }
    g.rotateY(Math.atan2(s.dx, s.dz)); g.translate(pole.x, PAVE + 2.7, pole.z); plates.push(g);
    if (!lite) { const k = at(0, -1.25 - 0.12); b.flat(9, 0.22, k.x, 0.086, k.z, YELLOW, along); }   // yellow mark on the carriageway edge
  }
  const group = new THREE.Group(); group.name = 'transport:stops:' + line.id;
  const mesh = b.build(shared); if (mesh) group.add(mesh);
  const plateMat = new THREE.MeshLambertMaterial({ map: atlas });
  const merged = mergeGeometries(plates, false);
  if (merged) { const m = new THREE.Mesh(merged, plateMat); m.castShadow = true; group.add(m); }
  for (const g of plates) g.dispose();
  return { group, dispose() { mesh?.geometry.dispose(); merged?.dispose(); plateMat.dispose(); atlas.dispose(); group.removeFromParent(); } };
}

/** A person at a stop: waits (standing or on the bench), boards the car rapide, or steps out of it and walks off. */
interface Rider { h: Humanoid; seat: Seat | null; home: { x: number; z: number; yaw: number }; state: 'wait' | 'board' | 'gone' | 'off' | 'idle'; from: { x: number; z: number }; to: { x: number; z: number }; t: number; dur: number }

/**
 * People waiting at the stops. When a car rapide stands at their stop they walk to its door and get in; someone gets
 * out and walks off along the pavement. Out of sight, everything quietly resets so the stop is never empty for long.
 * Bodies far from the camera are hidden and not animated.
 */
export class StopPeople {
  private riders: Rider[][] = [];
  /** Something happened at the stop since its last reset (people walked, got in or out). */
  private dirty: boolean[] = [];
  constructor(private sites: readonly StopSite[], perStop: number, rand: () => number, add: (o: THREE.Object3D) => void) {
    this.dirty = sites.map(() => false);
    if (!humanoidReady()) { this.riders = sites.map(() => []); return; }
    for (const s of sites) {
      const list: Rider[] = [];
      for (let k = 0; k < perStop + 1; k++) {
        const h = new Humanoid(randomLook(rand)); add(h.group);
        const seat = k === 0 && perStop > 1 ? s.seats[1] : null;
        const stand = { x: s.x + s.dx * (-0.6 - k * 0.9) - s.rx * 0.7, z: s.z + s.dz * (-0.6 - k * 0.9) - s.rz * 0.7 };
        const home = seat ? { x: seat.x, z: seat.z, yaw: seat.yaw } : { x: stand.x, z: stand.z, yaw: Math.atan2(-s.dx, -s.dz) + (rand() - 0.5) * 0.8 };
        if (seat) seat.occupant = 'npc';
        list.push({ h, seat, home, state: k < perStop ? 'wait' : 'gone', from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, t: 0, dur: 1 });
      }
      this.riders.push(list);
    }
    this.resetAll();
  }

  /** Bumped whenever someone starts or stops waiting (the greetable list changes). */
  version = 0;
  private list: { id: string; obj: THREE.Object3D; h: Humanoid; seated: boolean }[] = [];
  private listVersion = -1;
  /** Bodies for the « Saluer » system (people waiting at the stops); rebuilt only when it changed. */
  bodies() {
    if (this.listVersion === this.version) return this.list;
    this.listVersion = this.version; this.list = [];
    this.riders.forEach((list, i) => list.forEach((r, k) => { if (r.state === 'wait' || r.state === 'idle') this.list.push({ id: `stop:${i}:${k}`, obj: r.h.group, h: r.h, seated: !!r.seat }); }));
    return this.list;
  }

  private place(r: Rider) {
    const y = r.seat ? r.seat.top - 0.48 : 0.1;
    r.h.group.position.set(r.home.x, y, r.home.z); r.h.group.rotation.y = r.home.yaw;
    r.h.hold = r.seat ? 'Sit' : Math.random() < 0.5 ? 'Talk' : 'Idle';
  }
  private resetStop(i: number) {
    const list = this.riders[i], waiting = list.length - 1;
    list.forEach((r, k) => { r.state = k < waiting ? 'wait' : 'gone'; r.h.group.visible = r.state === 'wait'; this.place(r); });
    this.version++;
    this.dirty[i] = false;
  }
  resetAll() { this.riders.forEach((_, i) => this.resetStop(i)); }

  /**
   * `door(i)`: world point of the door of a vehicle standing at stop i with time left (null when none).
   * `viewer`: camera position, for culling and for resetting stops out of sight.
   */
  update(dt: number, viewer: { x: number; z: number }, range: number, door: (i: number) => { x: number; z: number } | null) {
    for (let i = 0; i < this.riders.length; i++) {
      const s = this.sites[i], list = this.riders[i];
      const far = Math.hypot(s.x - viewer.x, s.z - viewer.z) > range;
      const d = door(i);
      if (far) {
        if (this.dirty[i] && !d) this.resetStop(i);
        for (const r of list) r.h.group.visible = false;
        continue;
      }
      if (d) {
        this.dirty[i] = true;
        // the standing ones get in; one passenger gets out and walks off along the pavement
        for (const r of list) if (r.state === 'wait' && !r.seat) this.walk(r, 'board', r.h.group.position, d, 1.8);
        const out = list.find(r => r.state === 'gone');
        if (out && !list.some(r => r.state === 'off' || r.state === 'idle')) {
          this.walk(out, 'off', d, { x: s.x + s.dx * -5.5 - s.rx * 0.2, z: s.z + s.dz * -5.5 - s.rz * 0.2 }, 3.2);
        }
      }
      for (const r of list) {
        if (r.state === 'gone') { r.h.group.visible = false; continue; }
        r.h.group.visible = true;
        if (r.state === 'board' || r.state === 'off') {
          r.t += dt; const f = Math.min(1, r.t / r.dur);
          r.h.group.position.set(r.from.x + (r.to.x - r.from.x) * f, 0.1, r.from.z + (r.to.z - r.from.z) * f);
          r.h.group.rotation.y = Math.atan2(r.to.x - r.from.x, r.to.z - r.from.z);
          r.h.animate(dt, 1.2);
          if (f >= 1) { if (r.state === 'board') { r.state = 'gone'; r.h.group.visible = false; } else { r.state = 'idle'; r.h.hold = 'Talk'; } this.version++; }
        } else r.h.animate(dt, 0);
      }
    }
  }

  private walk(r: Rider, state: 'board' | 'off', from: { x: number; z: number }, to: { x: number; z: number }, speed: number) {
    if (r.seat) { r.seat.occupant = null; r.seat = null; }
    r.state = state; r.h.hold = null; r.t = 0; this.version++;
    r.from = { x: from.x, z: from.z }; r.to = { x: to.x, z: to.z };
    r.dur = Math.max(0.6, Math.hypot(to.x - from.x, to.z - from.z) / speed);
    if (state === 'off') { r.h.group.position.set(from.x, 0.1, from.z); r.h.group.visible = true; }
  }

  dispose() { for (const list of this.riders) for (const r of list) r.h.dispose(); this.riders = []; }
}
