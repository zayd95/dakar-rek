import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Humanoid } from '../actors/humanoid';
import type { ArenaStands } from '../crowd/arenaStands';
import { crowdCheer, paChime } from '../lamb/audio';
import { drumRhythm, hasGestured } from './exteriorAudio';
import { drawAt, loserAt, winnerAt, type PartyCue, type PartyPlan, type Pose } from './celebration';
import type { FightNightPeople } from './people';
import type { Who } from './ceremony';

/** The drums play louder while a fête is on (src/arena/exterior.ts reads it, as for a wrestler of tonight). */
export const partyDrums = { loud: false };

/**
 * The fête after a result, played from its plan (src/arena/celebration.ts) on the arena's own pieces: the duel's two
 * wrestlers (the winner carried round the ring, the loser back to his corner, or the handshake of a draw), the
 * entourages (src/arena/people.ts `party`), the stands and the supporters on the sand (src/crowd/arenaStands.ts),
 * the drums and the microphone. Driven by the result phase's time, so a jump forward (a friend further on) lands on
 * the same picture: the lines it passed are not said, the drums and the stands' long reactions are taken up.
 */
export class ResultParty {
  private next = 0;
  private from: Record<Who, { x: number; z: number }>;
  private lastPose: Pose | null = null;

  constructor(private ctx: GameCtx, readonly plan: PartyPlan, private cx: number, private cz: number, private stands: ArenaStands,
    private people: FightNightPeople | null, private bodies: Record<Who, Humanoid | null> = { left: null, right: null }) {
    const at = (h: Humanoid | null, s: number) => (h ? { x: h.group.position.x, z: h.group.position.z } : { x: cx + s * 3, z: cz });
    this.from = { left: at(bodies.left, 1), right: at(bodies.right, -1) };
  }

  /** `t`: seconds of the result phase (or since the player's own result); `dt`: this frame's step. */
  update(t: number, dt: number) {
    const p = this.plan;
    while (this.next < p.cues.length && p.cues[this.next].t <= t) { const c = p.cues[this.next++]; this.fire(c, t - c.t > 1.5, t); }
    if (p.kind === 'main') {
      if (p.winner) {
        const lose: Who = p.winner === 'left' ? 'right' : 'left';
        this.lastPose = winnerAt(p, t, this.cx, this.cz, this.from[p.winner]);
        pose(this.bodies[p.winner], this.lastPose, dt);
        pose(this.bodies[lose], loserAt(p, t, this.cx, this.cz, this.from[lose]), dt);
        this.people?.party(p, t, this.from[p.winner]);
      } else for (const who of ['left', 'right'] as const) pose(this.bodies[who], drawAt(p, t, this.cx, this.cz, who, this.from[who]), dt);
      this.stands.party(p, t);
    }
    partyDrums.loud = !!p.loud && t >= p.loud[0] && t < p.loud[1];
  }

  private fire(c: PartyCue, missed: boolean, t: number) {
    switch (c.kind) {
      case 'drums': if (c.rhythm) drumRhythm(c.rhythm); return;                       // the state, even when jumped over
      case 'stands': {
        const left = c.t + (c.seconds ?? 3) - t;                                       // a long reaction is taken up where it is
        if (c.group && c.reaction && left > 0.5) this.stands.react(c.group, c.reaction, { share: c.share, seconds: missed ? left : c.seconds });
        return;
      }
      case 'cheer': if (!missed) crowdCheer(3.5, 0.25 * (0.7 + 0.5 * this.stands.level())); return;
      default:
        if (missed || !c.text) return;
        if ((c.kind === 'announce' || c.kind === 'griot') && hasGestured()) paChime();
        this.ctx.toast(c.text);
    }
  }

  /** Where the seat's camera looks: the winner riding round, or the middle of the ring. */
  focus(out: THREE.Vector3): THREE.Vector3 {
    const w = this.lastPose;
    return w ? out.set(w.x, 1.2 + w.y, w.z) : out.set(this.cx, 1.0, this.cz);
  }
  info(t: number) {
    return { kind: this.plan.kind, winner: this.plan.winner, lift: this.plan.lift, length: this.plan.length, t: Math.round(t * 10) / 10, cues: this.next, of: this.plan.cues.length,
      part: this.lastPose?.part ?? null, winnerAt: this.lastPose ? { x: this.lastPose.x, y: this.lastPose.y, z: this.lastPose.z } : null,
      sand: this.stands.sandNow(), rhythm: drumRhythm(), loud: partyDrums.loud };
  }
  dispose() {
    drumRhythm('gala'); partyDrums.loud = false;
    this.stands.party(null, 0);
  }
}

/** A wrestler's body at a pose of the fête (the duel no longer moves it): place, a smooth turn, the clip. */
function pose(h: Humanoid | null, p: Pose, dt: number) {
  if (!h) return;
  h.group.position.set(p.x, 0.1 + p.y, p.z);
  const d = Math.atan2(Math.sin(p.yaw - h.group.rotation.y), Math.cos(p.yaw - h.group.rotation.y));
  h.group.rotation.y += d * Math.min(1, dt * 8);
  if (p.clip === 'walk') { h.hold = null; h.animate(dt, p.speed); }
  else { h.hold = p.clip; h.animate(dt, 0); }
}
