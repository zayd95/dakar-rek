import * as THREE from 'three';
import { LambDuel } from '../lamb/duel';
import { STYLES } from '../lamb/rules';
import type { Input } from '../core/input';
import type { WrestlerLook } from '../core/types';
import { pilot, type BoutView } from './program';

/**
 * The gala's bout: the existing làmb duel (src/lamb/duel.ts, rules untouched) played by two NPC wrestlers. The duel's
 * « player » side is driven by `pilot()` with the same buttons a player has; the other side is the duel's own opponent
 * AI. Watched from the stands: no duel HUD, no keys, the city HUD stays.
 */
export class WatchedBout {
  readonly duel: LambDuel;
  private steer = { x: 0, y: 0 };
  private rand: () => number;
  /** Last phase seen, to tell the show about moments (empoignade, fall, decision). */
  private last = '';
  onMoment: (phase: string, info: ReturnType<LambDuel['info']>) => void = () => {};

  constructor(origin: { x: number; z: number }, left: WrestlerLook, rand: () => number) {
    this.rand = rand;
    const steer = this.steer;
    const input = { enabled: false, move: () => ({ x: steer.x, y: steer.y }), takeAction: () => false } as unknown as Input;
    this.duel = new LambDuel({ origin, look: left, input, crowdSize: 0, mode: 'amical', style: STYLES.rapide, level: 2, ring: 7.6, spectate: true });
  }

  get group(): THREE.Group { return this.duel.group; }
  get over() { return this.duel.phase === 'result' || this.duel.done; }
  get result() { return this.duel.result; }
  info() { return this.duel.info(); }
  /** Points on both wrestlers (feet, waist, head), for the camera. */
  focus(): THREE.Vector3 {
    const p = this.duel.fighterPoints();
    return new THREE.Vector3((p[1][0] + p[4][0]) / 2, 1.1, (p[1][2] + p[4][2]) / 2);
  }

  update(dt: number) {
    const v = this.duel.info() as unknown as BoutView;
    const o = pilot(v, this.rand(), dt);
    // approach the opponent: world direction → the duel's screen axes (how input.move() is read)
    const pts = this.duel.fighterPoints(), me = { x: pts[1][0], z: pts[1][2] }, ai = { x: pts[4][0], z: pts[4][2] };
    const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1, ax = this.duel.axes();
    const wx = (dx / len) * o.approach, wz = (dz / len) * o.approach;
    this.steer.x = wx * ax.right.x + wz * ax.right.z; this.steer.y = wx * ax.fwd.x + wz * ax.fwd.z;
    this.duel.setGuard(o.guard);
    if (o.grab) this.duel.pressGrab();
    for (let k = 0; k < o.taps; k++) this.duel.pressGrab();
    if (o.brk) this.duel.pressBreak();
    this.duel.update(dt);
    const now = this.duel.info();
    if (now.phase !== this.last) { this.last = now.phase; this.onMoment(now.phase, now); }
  }

  dispose() { this.duel.dispose(); }
}
