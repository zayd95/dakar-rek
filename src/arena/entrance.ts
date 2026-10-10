import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { WrestlerLook } from '../core/types';
import { Wrestler, humanoidReady } from '../actors/humanoid';
import { paChime } from '../lamb/audio';
import { drumRhythm, hasGestured } from './exteriorAudio';
import { cornerSides, entranceCues, poseAt, wrestlerPlan, type Cue, type Fighter, type Leg, type Who } from './ceremony';

/**
 * The wrestlers' entrance of a gala, played from src/arena/ceremony.ts: each wrestler walks out of the tunnel, does his
 * bàkk on the sand, goes to his corner, then both jog to the ring. The announcer and the griots speak through the
 * arena's microphone (a public-address chime, then the line), the drums switch to the bàkk's rhythm and back, and the
 * stands on the dancer's side rise (`react`). The entourages and griots themselves are src/arena/people.ts.
 */
export class EntranceCeremony {
  readonly wrestlers: { who: Who; h: Wrestler; plan: Leg[] }[] = [];
  private cues: Cue[];
  private next = 0;

  constructor(private ctx: GameCtx, parent: THREE.Object3D, private cx: number, private cz: number,
    bill: { left: Fighter; right: Fighter }, looks: Record<Who, WrestlerLook>, private react: (who: Who) => void) {
    this.cues = entranceCues(bill, ctx.day());
    if (!humanoidReady()) return;
    const cs = cornerSides(bill);
    for (const [who, skin, cut] of [['left', 0x5b3420, 'B'], ['right', 0x4e2e1c, 'A']] as const) {
      const h = new Wrestler(skin); h.setLook(looks[who], cut);
      const plan = wrestlerPlan(cx, cz, who, cs[who]), p = plan[0].path[0];
      h.group.position.set(p.x, 0.1, p.z); parent.add(h.group);
      this.wrestlers.push({ who, h, plan });
    }
  }

  /** `t`: seconds of the entrance phase; `dt`: its time step (the checks may fast-forward it). */
  update(t: number, dt: number) {
    for (const w of this.wrestlers) {
      const s = poseAt(w.plan, t, this.cx, this.cz, w.who);
      w.h.group.position.set(s.x, 0.1, s.z);
      // turn smoothly towards the heading (a bàkk turns from the stands to the ring)
      const d = Math.atan2(Math.sin(s.yaw - w.h.group.rotation.y), Math.cos(s.yaw - w.h.group.rotation.y));
      w.h.group.rotation.y += d * Math.min(1, dt * 8);
      if (s.clip === 'walk') { w.h.hold = null; w.h.animate(dt, s.speed); }
      else { w.h.hold = s.clip; w.h.animate(dt, 0); }
    }
    // a jump forward (joining a friend's show further on) plays the drums' state, not the lines it missed
    while (this.next < this.cues.length && this.cues[this.next].t <= t) { const c = this.cues[this.next++]; this.fire(c, t - c.t > 1.5); }
  }

  private fire(c: Cue, missed = false) {
    if (missed && c.kind !== 'bakk' && c.kind !== 'drums') return;
    if (missed) { drumRhythm(c.kind === 'bakk' ? 'bakk' : 'gala'); return; }
    switch (c.kind) {
      case 'bakk': drumRhythm('bakk'); this.react(c.who); break;
      case 'drums': drumRhythm('gala'); break;
      case 'announce': case 'griot': if (hasGestured()) paChime(); if (c.text) this.ctx.toast(c.text); break;
      default: if (c.text) this.ctx.toast(c.text);
    }
  }

  /** Where the seat's camera looks: between the two wrestlers, or the one doing his bàkk. */
  focus(out: THREE.Vector3, t: number): THREE.Vector3 | null {
    if (!this.wrestlers.length) return null;
    const dancing = this.wrestlers.find(w => poseAt(w.plan, t, this.cx, this.cz, w.who).part === 'bakk');
    if (dancing) return out.copy(dancing.h.group.position).setY(1.2);
    out.set(0, 0, 0); for (const w of this.wrestlers) out.add(w.h.group.position);
    return out.multiplyScalar(1 / this.wrestlers.length).setY(1.2);
  }
  /** For the debug view: what each wrestler is doing, and how many cues have played. */
  info(t: number) {
    return { cues: this.next, of: this.cues.length, rhythm: drumRhythm(), wrestlers: this.wrestlers.map(w => ({ who: w.who, ...poseAt(w.plan, t, this.cx, this.cz, w.who) })) };
  }

  dispose() {
    for (const w of this.wrestlers) w.h.dispose();
    this.wrestlers.length = 0;
    drumRhythm('gala');
  }
}
