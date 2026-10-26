import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Seat } from '../interact/seats';
import type { Affordance, Target } from '../interact/types';
import { POOL } from '../housing/villa';
import type { VillaHold } from './gate';

/**
 * LD2.0-D lane V-E: the swim in the villa's pool (docs/ld2/LD2_D.md, decision 7). The basin is the interior's (lane V-S builds it on the ground
 * floor's back garden); the swim only reads the contract's numbers (src/housing/villa.ts POOL): the interior's level 0 stands at the home's origin
 * (src/economy/placement.ts homeOrigin), a plan point (x, z) at origin + (x, 0.1, z).
 *
 *  - « Se baigner » at the pool's edge (within 1.4 m of it, on the deck) for the villa's owner or renter in their own villa.
 *  - In the water up to the shoulders: the body leans forward into a slow swim (no swim clip exists: the walking clip held, the body tilted 66°, read
 *    from above as a breaststroke), its head and shoulders out, a ripple round it; it goes round the pool on a scripted loop (a stadium 1 m inside
 *    the walls), its camera the usual one.
 *  - « Sortir de l'eau » at any time, or after SWIM_SECONDS: out at the nearest edge, on the deck. Hygiene and moral up, in proportion to the time
 *    in the water (a full swim: +22 hygiene, +15 moral; a dip of a few seconds still counts a quarter).
 * The rules are pure (unit-tested); `VillaSwim` runs them in the game (src/villa/module.ts).
 */
export const SWIM_SECONDS = 22;
export const SWIM_GAINS = { hygiene: 22, moral: 15, energie: -4 } as const;
/** The water's surface below the deck (m, interior y), and the body's lean into the swim (rad from upright). */
export const WATER_Y = -0.03, SWIM_LEAN = 1.15;
/** Hip-to-shoulder height of the standing body (m): the shoulders at the water line. */
const SHOULDERS = 1.36;
/** How far from the pool the edge offers the swim (m, from the water's rectangle, outside it). */
export const EDGE_REACH = 1.4;
/** The loop: 1.05 m inside the walls, swum at this pace (m/s). */
const INSET = 1.05, PACE = 0.72;

/** Distance (m) from a plan point to the pool's rectangle (0 inside it). */
export function poolDistance(px: number, pz: number): number {
  const dx = Math.max(POOL.x0 - px, 0, px - POOL.x1), dz = Math.max(POOL.z0 - pz, 0, pz - POOL.z1);
  return Math.hypot(dx, dz);
}
/** At the edge, on the deck: out of the water and within reach of it. */
export const atEdge = (px: number, pz: number) => { const d = poolDistance(px, pz); return d > 0 && d <= EDGE_REACH; };
/** Who may swim: the villa's owner or renter, in their own villa (a guest or a visit of the empty house does not). */
export const maySwim = (hold: VillaHold, own: boolean) => own && (hold === 'owned' || hold === 'rented');

const cx = (POOL.x0 + POOL.x1) / 2, cz = (POOL.z0 + POOL.z1) / 2;
const hx = (POOL.x1 - POOL.x0) / 2 - INSET, hz = (POOL.z1 - POOL.z0) / 2 - INSET;
/** The loop is a stadium: two straights of 2·(hx − hz) along x, two half circles of radius hz. Its length (m). */
export const LOOP = 4 * (hx - hz) + 2 * Math.PI * hz;
/** The swimmer's chest at arc length s of the loop (plan coordinates) and the way it heads (yaw: 0 faces +z). Anticlockwise seen from above. */
export interface Pose { x: number; z: number; yaw: number }
export function swimPose(s: number, out: Pose = { x: 0, z: 0, yaw: 0 }): Pose {
  const L = LOOP, a = ((s % L) + L) % L, st = 2 * (hx - hz), arc = Math.PI * hz;
  let t = 0;
  if (a < st) { out.x = cx - (hx - hz) + a; out.z = cz + hz; out.yaw = Math.PI / 2; }                                 // the near straight, toward +x
  else if (a < st + arc) { t = (a - st) / hz; out.x = cx + (hx - hz) + hz * Math.sin(t); out.z = cz + hz * Math.cos(t); out.yaw = Math.PI / 2 + t; }   // round the east end
  else if (a < 2 * st + arc) { out.x = cx + (hx - hz) - (a - st - arc); out.z = cz - hz; out.yaw = -Math.PI / 2; }    // back along the far side
  else { t = (a - 2 * st - arc) / hz; out.x = cx - (hx - hz) - hz * Math.sin(t); out.z = cz - hz * Math.cos(t); out.yaw = -Math.PI / 2 + t; }   // round the west end
  return out;
}
/** The arc length of the loop's point nearest to a plan point (where the swim starts from the edge the player stands at). */
export function nearestOnLoop(px: number, pz: number): number {
  let best = 0, bd = Infinity;
  for (let s = 0; s < LOOP; s += 0.1) { const p = swimPose(s), d = (p.x - px) ** 2 + (p.z - pz) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
}
/** The deck's point where the swimmer climbs out: the nearest edge, 0.55 m out of the water. */
export function exitPoint(px: number, pz: number): { x: number; z: number } {
  const ex = Math.min(px - POOL.x0, POOL.x1 - px), ez = Math.min(pz - POOL.z0, POOL.z1 - pz), out = 0.55;
  if (ez <= ex) return { x: Math.max(POOL.x0 + 0.4, Math.min(POOL.x1 - 0.4, px)), z: pz - POOL.z0 < POOL.z1 - pz ? POOL.z0 - out : POOL.z1 + out };
  return { x: px - POOL.x0 < POOL.x1 - px ? POOL.x0 - out : POOL.x1 + out, z: Math.max(POOL.z0 + 0.4, Math.min(POOL.z1 - 0.4, pz)) };
}
/** What a swim of `seconds` gives (in proportion, at least a quarter, at most the full swim). */
export function swimGains(seconds: number): { hygiene: number; moral: number; energie: number } {
  const k = Math.max(0.25, Math.min(1, seconds / SWIM_SECONDS));
  return { hygiene: Math.round(SWIM_GAINS.hygiene * k), moral: Math.round(SWIM_GAINS.moral * k), energie: Math.round(SWIM_GAINS.energie * k) };
}
/**
 * The body's origin (its feet: the seat's hips less SIT_HIPS) for the chest at (x, z) heading `yaw`, tilted by SWIM_LEAN: the shoulders at the water
 * line, the head and shoulders out; the feet trail behind and below.
 */
export function bodyOrigin(x: number, z: number, yaw: number, out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const back = Math.sin(SWIM_LEAN) * 0.95;
  out.x = x - Math.sin(yaw) * back; out.y = WATER_Y - Math.cos(SWIM_LEAN) * SHOULDERS; out.z = z - Math.cos(yaw) * back;
  return out;
}

// ------------------------------------------------------------------------------------------------ in the game
const SIT_HIPS = 0.48;
export class VillaSwim {
  private seat: Seat | null = null;
  private t = 0; private s0 = 0;
  private origin = { x: 0, z: 0 };
  private readonly c: Pose = { x: 0, z: 0, yaw: 0 }; private readonly o = { x: 0, y: 0, z: 0 };
  private wake: THREE.Mesh | null = null;
  private target: Target;
  private outTarget: Target;
  private readonly inAff: Affordance[];
  private readonly outAff: Affordance[];
  /** For the checks: swims begun and ended (full or not), the last gains. */
  readonly log = { started: 0, ended: 0, full: 0, gains: null as null | ReturnType<typeof swimGains> };

  constructor(private ctx: GameCtx, private room: THREE.Group, private hold: () => VillaHold, private where: () => { x: number; z: number } | null) {
    this.inAff = [{ id: 'baignade', verb: 'use', label: 'Se baigner', icon: '🏊', detail: `Quelques longueurs · hygiène +${SWIM_GAINS.hygiene}, moral +${SWIM_GAINS.moral}`, run: () => this.start() }];
    this.outAff = [{ id: 'sortir', verb: 'stand', label: 'Sortir de l’eau', icon: '🧍', run: () => this.stop() }];
    this.target = { id: 'villa:piscine', name: 'La piscine', kind: 'spot', space: 'home', x: 0, z: 0, y: 0.6, radius: EDGE_REACH + 0.4, bias: -0.3, affordances: () => this.inAff };
    this.outTarget = { id: 'villa:piscine:sortir', name: 'Dans la piscine', kind: 'self', space: 'home', x: 0, z: 0, radius: 2, bias: -1.5, affordances: () => this.outAff };
  }
  get swimming() { return !!this.seat; }

  /** The targets at the pool: « Se baigner » at its edge, « Sortir de l'eau » in the water. */
  collect(space: string, x: number, z: number, out: Target[]) {
    if (space !== 'home') return;
    const o = this.where(); if (!o) return;
    if (this.seat) { this.outTarget.x = x; this.outTarget.z = z; out.push(this.outTarget); return; }
    if (!maySwim(this.hold(), true) || this.ctx.player.seated() || this.ctx.player.pos.y > 1.2) return;
    const px = x - o.x, pz = z - o.z;
    if (!atEdge(px, pz)) return;
    // the target on the water's edge nearest to the player
    this.target.x = o.x + Math.max(POOL.x0, Math.min(POOL.x1, px)); this.target.z = o.z + Math.max(POOL.z0, Math.min(POOL.z1, pz));
    out.push(this.target);
  }

  start(): boolean {
    const ctx = this.ctx, o = this.where();
    if (this.seat || !o || ctx.player.seated() || ctx.activities.running || !maySwim(this.hold(), true)) return false;
    const p = ctx.player.pos, px = p.x - o.x, pz = p.z - o.z;
    if (!atEdge(px, pz)) return false;
    this.origin = { x: o.x, z: o.z };
    this.s0 = nearestOnLoop(px, pz); this.t = 0;
    const seat: Seat = { id: 'villa:baignade', x: p.x, z: p.z, top: 0, yaw: ctx.player.facing(), kind: 'floor', space: 'home', occupant: null, locked: true, clip: 'Walk', exits: [] };
    this.place(seat, 0);
    ctx.seats.add(seat);
    ctx.player.sit(seat);
    if (ctx.player.seated()?.id !== seat.id) { ctx.seats.remove(seat.id); return false; }
    this.seat = seat;
    const b = ctx.player.body(); if (b) { b.group.rotation.order = 'YXZ'; b.group.rotation.x = SWIM_LEAN; }
    this.showWake(true);
    this.log.started++;
    ctx.toast('Dans l’eau : quelques longueurs tranquilles.');
    return true;
  }

  /** Every frame: along the loop; out by itself after SWIM_SECONDS. */
  update(dt: number) {
    const seat = this.seat; if (!seat) return;
    if (this.ctx.player.seated()?.id !== seat.id) { this.end(false); return; }      // taken out by a door, a trip…
    this.t += dt;
    this.place(seat, this.t);
    const b = this.ctx.player.body(); if (b && b.group.rotation.x !== SWIM_LEAN) { b.group.rotation.order = 'YXZ'; b.group.rotation.x = SWIM_LEAN; }
    if (this.wake) {
      const c = swimPose(this.s0 + this.t * PACE, this.c), k = (this.t * 0.9) % 1;
      this.wake.position.set(this.origin.x + c.x, 0.1 + WATER_Y + 0.012, this.origin.z + c.z);
      this.wake.scale.setScalar(0.6 + k * 1.2);
      (this.wake.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k);
    }
    if (this.t >= SWIM_SECONDS) this.stop();
  }

  /** « Sortir de l'eau »: out at the nearest edge, the gains of the time spent in the water. */
  stop() { if (this.seat) this.end(true); }

  private end(climb: boolean) {
    const ctx = this.ctx, seat = this.seat!; this.seat = null;
    const c = swimPose(this.s0 + this.t * PACE), e = exitPoint(c.x, c.z);
    seat.exits = [{ x: this.origin.x + e.x, z: this.origin.z + e.z }];
    const b = ctx.player.body(); if (b) { b.group.rotation.x = 0; b.group.rotation.order = 'XYZ'; }
    if (ctx.player.seated()?.id === seat.id) ctx.player.standUp(!climb);
    ctx.seats.remove(seat.id);
    this.showWake(false);
    const g = swimGains(this.t);
    ctx.state.adjust(g);
    ctx.state.count('baignades');
    this.log.ended++; if (this.t >= SWIM_SECONDS - 0.05) this.log.full++; this.log.gains = g;
    ctx.toast(`Baignade ✓  hygiène +${g.hygiene} · moral +${g.moral}`);
    ctx.save();
  }

  /** The seat follows the loop: the hips placed so the body's origin is where `bodyOrigin` says. */
  private place(seat: Seat, t: number) {
    const c = swimPose(this.s0 + t * PACE, this.c), o = bodyOrigin(c.x, c.z, c.yaw, this.o);
    seat.x = this.origin.x + o.x; seat.z = this.origin.z + o.z; seat.yaw = c.yaw; seat.top = 0.1 + o.y + SIT_HIPS;
  }

  private showWake(on: boolean) {
    if (on && !this.wake) {
      const g = new THREE.RingGeometry(0.5, 0.58, 28); g.rotateX(-Math.PI / 2);
      this.wake = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
      this.wake.name = 'villa-swim-wake'; this.wake.renderOrder = 3;
      this.room.add(this.wake);
    }
    if (this.wake) this.wake.visible = on;
  }
  /** The hub is being rebuilt: forget the swim without touching the player. */
  reset() {
    if (this.seat) { this.ctx.seats.remove(this.seat.id); this.seat = null; const b = this.ctx.player.body(); if (b) { b.group.rotation.x = 0; b.group.rotation.order = 'XYZ'; } }
    if (this.wake) { this.wake.geometry.dispose(); (this.wake.material as THREE.Material).dispose(); this.wake.removeFromParent(); this.wake = null; }
  }
  info() { return { swimming: !!this.seat, t: Math.round(this.t * 10) / 10, seat: this.seat ? { x: this.seat.x, z: this.seat.z, top: this.seat.top, yaw: this.seat.yaw } : null, log: { ...this.log } }; }
}
