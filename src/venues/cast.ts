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
  /** When the role is present (venue moment → shown). */
  when: (moment: string) => boolean;
  /** No shoes (inside the mosque). */
  barefoot?: boolean;
}

const WP = new THREE.Vector3();

export function hideShoes(h: Humanoid, hide = true) {
  h.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name.startsWith('Cloth_Shoes')) o.visible = !hide; });
}

export class Cast {
  private list: { r: Role; h: Humanoid; shown: boolean }[] = [];
  private moment = '';

  constructor(roles: Role[], private seats: Seats, parent: THREE.Object3D, private owner: string) {
    if (!humanoidReady()) return;
    for (const r of roles) {
      const h = new Humanoid(r.look);
      if (r.seat) { h.group.position.set(r.seat.x, sitOriginY(r.seat), r.seat.z); h.group.rotation.y = r.seat.yaw; h.hold = seatClip(r.seat); }
      else { h.group.position.set(r.x ?? 0, r.y ?? 0.1, r.z ?? 0); h.group.rotation.y = r.yaw ?? 0; h.hold = r.clip ?? 'Idle'; }
      if (r.barefoot) hideShoes(h);
      h.group.visible = false; parent.add(h.group);
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
      if (!want && e.r.seat) this.seats.release(e.r.seat.id, who);
      e.shown = want;
    }
  }

  /** Distance culling and animation (only the shown roles near the viewer). */
  update(dt: number, viewer: { x: number; z: number }, limit: number, active = true) {
    for (const e of this.list) {
      const p = e.h.group.getWorldPosition(WP);                              // roles may ride a moving parent (a pirogue)
      const vis = active && e.shown && Math.hypot(p.x - viewer.x, p.z - viewer.z) <= limit;
      e.h.group.visible = vis;
      if (vis) e.h.animate(dt, 0);
    }
  }

  /** Bodies for the greeting system (src/interact/people.ts): street roles only. */
  bodies() {
    return this.list.filter(e => e.shown).map(e => ({ id: `${this.owner}:${e.r.id}`, obj: e.h.group, h: e.h, seated: !!e.r.seat, female: !!e.r.look.female }));
  }
  get shownCount() { return this.list.filter(e => e.shown && e.h.group.visible).length; }
  get presentCount() { return this.list.filter(e => e.shown).length; }

  dispose() {
    for (const e of this.list) { if (e.shown && e.r.seat) this.seats.release(e.r.seat.id, `${this.owner}:${e.r.id}`); e.h.dispose(); }
    this.list = [];
  }
}
