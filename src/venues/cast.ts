import * as THREE from 'three';
import { Humanoid, humanoidReady, type Clip, type PersonLook } from '../actors/humanoid';
import { seatClip, sitOriginY, type Seat, type Seats } from '../interact/seats';

/**
 * The people who make a venue live: the cook at the grill, the owner at the counter, the imam, clients at the tables,
 * worshippers on the rows. Each one is shown only in the venue's matching moment (open, evening, prayer time…), sits on a
 * real seat of the shared registry when given one (so the player and other NPCs never take it at the same time), and
 * is drawn and animated only near the camera.
 */
export interface Role {
  id: string;
  look: PersonLook;
  /** World position and facing (ignored when `seat` is set). */
  x?: number; z?: number; yaw?: number;
  /** Floor height under the feet (0.1 = street and interiors). */
  y?: number;
  clip?: Clip;
  seat?: Seat;
  /**
   * The seat stays this role's while it is away (the judges' chairs at the arena): nobody else — passer-by or player —
   * takes it between two shows. Without it the seat is free whenever the role is not there.
   */
  keep?: boolean;
  /** When the role is present (venue moment → shown). */
  when: (moment: string) => boolean;
  /** No shoes (inside the mosque). */
  barefoot?: boolean;
  /** Start the clip at this fraction of its loop (dancers do not move in step with each other). */
  phase?: number;
  /** A standing role steps aside when the player comes closer than this (dancers on a floor the player dances on). */
  yieldR?: number;
}

const WP = new THREE.Vector3();

export function hideShoes(h: Humanoid, hide = true) {
  h.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name.startsWith('Cloth_Shoes')) o.visible = !hide; });
}

export class Cast {
  private list: { r: Role; h: Humanoid; shown: boolean }[] = [];
  private cheer = new Map<string, number>();
  /** Roles walking somewhere (a waiter to a table): the points left, then the facing and the clip once there. */
  private walks = new Map<string, { path: { x: number; z: number }[]; yaw: number; clip: Clip; speed: number }>();
  private moment = '';

  constructor(roles: Role[], private seats: Seats, parent: THREE.Object3D, private owner: string) {
    if (!humanoidReady()) return;
    for (const r of roles) {
      const h = new Humanoid(r.look);
      if (r.seat) { h.group.position.set(r.seat.x, sitOriginY(r.seat), r.seat.z); h.group.rotation.y = r.seat.yaw; h.hold = seatClip(r.seat); }
      else { h.group.position.set(r.x ?? 0, r.y ?? 0.1, r.z ?? 0); h.group.rotation.y = r.yaw ?? 0; h.hold = r.clip ?? 'Idle'; }
      if (r.barefoot) hideShoes(h);
      if (r.phase && h.hold) h.play(h.hold, 0, r.phase);
      h.group.visible = false; parent.add(h.group);
      if (r.seat && r.keep) seats.occupy(r.seat.id, `${owner}:${r.id}`);
      this.list.push({ r, h, shown: false });
    }
  }

  /** Show the roles of this moment, release the seats of the others. */
  setMoment(moment: string) {
    if (moment === this.moment) return;
    this.moment = moment;
    for (const e of this.list) {
      const want = e.r.when(moment);
      if (want === e.shown) continue;
      const who = `${this.owner}:${e.r.id}`;
      if (want && e.r.seat && !this.seats.occupy(e.r.seat.id, who)) continue;   // the player (or someone) sits there now
      if (!want && e.r.seat && !e.r.keep) this.seats.release(e.r.seat.id, who);
      e.shown = want;
    }
  }

  /** Distance culling and animation (only the shown roles near the viewer). `player`: who the yielding roles step aside for. */
  update(dt: number, viewer: { x: number; z: number }, limit: number, active = true, player?: { x: number; z: number }) {
    for (const [id, t] of this.cheer) {
      const left = t - dt; if (left > 0) { this.cheer.set(id, left); continue; }
      this.cheer.delete(id); const e = this.list.find(x => x.r.id === id); if (e) e.h.hold = e.r.clip ?? 'Idle';
    }
    for (const e of this.list) {
      if (this.walks.has(e.r.id)) this.step(e, dt);
      else if (player && e.r.yieldR && !e.r.seat) this.yieldTo(e, player, dt);
      const p = e.h.group.getWorldPosition(WP);                              // roles may ride a moving parent (a pirogue)
      const vis = active && e.shown && Math.hypot(p.x - viewer.x, p.z - viewer.z) <= limit;
      e.h.group.visible = vis;
      if (vis) e.h.animate(dt, 0);
    }
  }
  /** Step aside from the player (to `yieldR` from them), then back to the role's own spot. */
  private yieldTo(e: { r: Role; h: Humanoid }, p: { x: number; z: number }, dt: number) {
    const hx = e.r.x ?? 0, hz = e.r.z ?? 0, R = e.r.yieldR!;
    const dx = hx - p.x, dz = hz - p.z, d = Math.hypot(dx, dz);
    let tx = hx, tz = hz;
    if (d < R) { const ux = d < 1e-3 ? 1 : dx / d, uz = d < 1e-3 ? 0 : dz / d; tx = p.x + ux * R; tz = p.z + uz * R; }
    const g = e.h.group.position, a = Math.min(1, dt * 5);
    g.x += (tx - g.x) * a; g.z += (tz - g.z) * a;
  }

  /** One walking step toward the next point, then the role's facing and clip at the end. */
  private step(e: { r: Role; h: Humanoid }, dt: number) {
    const w = this.walks.get(e.r.id)!, g = e.h.group.position, to = w.path[0];
    if (!to) { e.h.hold = w.clip; e.h.group.rotation.y = w.yaw; this.walks.delete(e.r.id); return; }
    const dx = to.x - g.x, dz = to.z - g.z, d = Math.hypot(dx, dz), s = w.speed * dt;
    if (d <= s) { g.x = to.x; g.z = to.z; w.path.shift(); return; }
    g.x += (dx / d) * s; g.z += (dz / d) * s; e.h.group.rotation.y = Math.atan2(dx, dz); e.h.hold = 'Walk';
  }
  /** Walk a standing role along `path` (world points), then face `yaw` and hold `clip`. */
  walkTo(id: string, path: { x: number; z: number }[], yaw: number, clip: Clip, speed = 1.5) {
    const e = this.list.find(x => x.r.id === id); if (!e || e.r.seat) return;
    this.walks.set(id, { path: path.map(p => ({ ...p })), yaw, clip, speed });
  }
  /** True while a role is still walking. */
  walking(id: string) { return this.walks.has(id); }
  /** Put a standing role at a spot now (stops a walk): someone the venue moves itself, a vendor along the stands. */
  place(id: string, x: number, z: number, yaw: number, y?: number) {
    const e = this.list.find(v => v.r.id === id); if (!e || e.r.seat) return;
    this.walks.delete(id); e.h.group.position.set(x, y ?? e.h.group.position.y, z); e.h.group.rotation.y = yaw;
  }
  /** Something carried by a role (a basin on the head, a flag, a bucket), in the body's own space. */
  attach(id: string, obj: THREE.Object3D) { const e = this.list.find(v => v.r.id === id); if (e) e.h.group.add(obj); }

  /**
   * A role's weight in the shared humanoid budget (src/actors/crowdLod.ts, src/social/ambientLife.ts): its distance to
   * the camera is multiplied by it when the full bodies are handed out — 1 for someone in the spotlight, more for the
   * people in the background (they become cheap figures sooner).
   */
  setLodPrio(id: string, prio: number) { const e = this.list.find(x => x.r.id === id); if (e) e.h.group.userData.lodPrio = prio; }
  /** Dress a role differently (an entourage in tonight's écurie colour). */
  setLook(id: string, look: PersonLook) { const e = this.list.find(x => x.r.id === id); if (e) { e.r.look = look; e.h.setLook(look); } }
  /** Change what a standing role is doing (the stylist works while a client sits). */
  setClip(id: string, clip: Clip) { const e = this.list.find(x => x.r.id === id); if (e && !e.r.seat) e.h.hold = clip; }
  /** A standing role plays `clip` for `seconds`, then goes back to its own (the crowd cheers a good dancer). */
  burst(id: string, clip: Clip, seconds: number) { const e = this.list.find(x => x.r.id === id); if (!e || e.r.seat) return; e.h.hold = clip; this.cheer.set(id, seconds); }
  /** Where a role stands now (tests and debug). */
  where(id: string) { const e = this.list.find(x => x.r.id === id); return e ? { x: e.h.group.position.x, z: e.h.group.position.z, shown: e.shown, drawn: e.h.group.visible, clip: e.h.hold } : null; }

  /** Bodies for the greeting system (src/interact/people.ts): street roles only. */
  bodies() {
    return this.list.filter(e => e.shown).map(e => ({ id: `${this.owner}:${e.r.id}`, obj: e.h.group, h: e.h, seated: !!e.r.seat, female: !!e.r.look.female }));
  }
  get shownCount() { return this.list.filter(e => e.shown && e.h.group.visible).length; }
  get presentCount() { return this.list.filter(e => e.shown).length; }

  dispose() {
    for (const e of this.list) { if ((e.shown || e.r.keep) && e.r.seat) this.seats.release(e.r.seat.id, `${this.owner}:${e.r.id}`); e.h.dispose(); }
    this.list = [];
  }
}
