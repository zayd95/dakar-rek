import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import { Humanoid, humanoidReady, randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { Batch } from '../world/batch';
import { trafficClosures, trafficPositions } from '../actors/npc';
import { isMuted } from '../core/audioSettings';
import {
  ECURIES, crossesQueue, drummerAt, drumsCentre, drumVolume, fighterDrumVolume, gateOf, isFightEvening, murmurVolume, queueDistance, stallsOf, vendorPlaces,
  VENDORS, exteriorPhase, outflowDestinations, stallFronts, weekday, WEEKDAY_FR, type ArenaGate, type ExteriorPhase,
} from './exteriorRules';
import { GALA_DONE_COUNTER, streetAt } from './program';
import { say } from '../i18n/wolof';
import { arenaFighter } from './fighter';
/** How much louder the drums play while a wrestler of tonight gets ready and walks out. */
export const FIGHTER_DRUMS = 1.3;
import { ExteriorAudio, listenForGesture } from './exteriorAudio';
import { deckCentre } from '../world/arenaModules';
import { WALL_R } from '../world/geew';
import { transport } from '../transport/module';
import { flagGeometry, gearColours, scarfGeometry } from './supporterGear';
import { takeGear } from '../economy/wear';
import { holds } from '../economy/assets';
import { signTexture } from '../world/batch';

/**
 * Outside the Pikine arena: on fight evenings the surroundings come alive — fans walking in
 * from the street in their écurie's colours, a queue moving through the gate, sabar drummers and dancers beside it,
 * and vendors at the four stalls who are real places of the shared registry (drinks, grilled peanuts and brochettes,
 * scarves and flags, water). Supporters carry a scarf or a small flag of their écurie (two instanced meshes for every
 * fan). The drummers are heard by distance, with a soft murmur near the queue (src/arena/exteriorAudio.ts), and the
 * decorative traffic keeps off the road in front of the gate. Quiet otherwise: nobody is drawn and the stalls sell nothing. Everything stays outside the
 * arena wall; the visit itself (ticket, stands, bout) belongs to the arena flow.
 *
 * For the arena side: `arenaExterior.isEventDay(day, hour)` (the same rule both sides use) and `arenaExterior.gate()`
 * (gate position and queue lane of the current hub, or null away from Pikine). `arenaExterior.schedule(fn)` lets the
 * arena add its own bouts (a predicate on day and hour) so the exterior is alive whenever a bout is on.
 */

/** People per graphics quality, in step with the street crowd of main.ts (8 / 12 / 16 walkers). */
export const EXTERIOR_DENSITY = {
  low: { fans: 8, drummers: 2, dancers: 2 },
  medium: { fans: 14, drummers: 3, dancers: 4 },
  high: { fans: 20, drummers: 3, dancers: 6 },
} as const;
/** People are drawn and animated within this distance of the player only. */
const VIEW = 70;
/** Queue spacing and capacity, and how often the gate lets the first one in (seconds). */
const SLOT = 0.8, CAP = 16, GATE_EVERY = 2.4;

type Pt = { x: number; z: number };
type FanState = 'walk' | 'wait' | 'queue' | 'enter' | 'away' | 'leave' | 'gone';
/** A point of a fan's way; `wait`: seconds spent there (a last bissap at a stall on the way out). */
type Step = Pt & { wait?: number };
interface Fan {
  h: Humanoid; state: FanState; path: Step[]; x: number; z: number; speed: number; timer: number; slot: number; jitter: number; moving: boolean;
  /** What the supporter carries in the écurie's colour (null: not a supporter). */
  item: 'flag' | 'scarf' | null; hand: THREE.Object3D | null; neck: THREE.Object3D | null;
}

const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), P3 = new THREE.Vector3(), E3 = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
interface Still { h: Humanoid }

let scheduled: ((day: number, hour: number) => boolean) | null = null;
let gate: ArenaGate | null = null;
let activeNow = false;

/** The API shared with the arena visit (see the module comment). */
/** Weekday evenings bring a small neighbourhood card (fewer fans); Friday–Sunday is the big gala (the full street). */
export type EveningSize = 'gala' | 'card';
export const eveningSize = (day: number, hour: number): EveningSize => (isFightEvening(day, hour) ? 'gala' : 'card');
/** Share of the fans who come to a weekday card. */
const CARD_SHARE = 0.4;

export const arenaExterior = {
  /** Fight evening (Friday–Sunday from 16 h, city clock) or a bout the arena scheduled. */
  isEventDay(day: number, hour: number): boolean { return isFightEvening(day, hour) || !!scheduled?.(day, hour); },
  /** Gate of the arena of the current hub and its queue lane (Pikine), or null. */
  gate(): ArenaGate | null { return gate; },
  /** The arena's own bouts: the exterior is alive whenever `fn(day, hour)` is true (null removes it). */
  schedule(fn: ((day: number, hour: number) => boolean) | null) { scheduled = fn; },
  /** Whether the fight evening is on in the current hub right now (debug overrides included): the interior follows it. */
  active(): boolean { return activeNow; },
};

class Exterior {
  readonly group = new THREE.Group();
  private fans: Fan[] = [];
  private still: Still[] = [];
  private queue: Fan[] = [];
  private gateT = 0;
  private spawns: Pt[][] = [];
  active = false;
  private rand = rng(4242);
  private scarves: THREE.InstancedMesh | null = null;
  private flags: THREE.InstancedMesh | null = null;
  /** Arriving and queueing, or pouring out after the gala (src/arena/exteriorRules.ts exteriorPhase). */
  phase: ExteriorPhase = 'quiet';
  private exitQueue: Fan[] = [];
  /** People who left so far tonight: every third one stops for a last bissap (not left to chance). */
  private leavers = 0;
  private emitT = 0;
  private dests: Pt[] = [];
  private vendorsH: { h: Humanoid; clip: Clip }[] = [];
  /** The vendors' last call was heard this evening. */
  lastCall = false;

  constructor(ctx: GameCtx, readonly hub: HubWorld, readonly arena: { cx: number; cz: number }, readonly g: ArenaGate, quality: 'low' | 'medium' | 'high') {
    const d = EXTERIOR_DENSITY[quality], R = this.rand, q = g.queue;
    this.group.name = 'arena_exterior'; this.group.visible = false;
    // walking in from both ends of the street in front of the gate, round the last barrier, into the lane
    for (const sx of [-1, 1]) this.spawns.push([{ x: g.x + sx * 34, z: g.z - 8 }, { x: g.x + sx * 3.7, z: q.z1 - 0.35 }, { x: g.x, z: q.z1 - 0.35 }]);
    const supporter = () => { const e = ECURIES[Math.floor(R() * ECURIES.length)]; return R() < 0.65 ? e : null; };
    const fanLook = (e = supporter()): PersonLook => { const l = randomLook(R); return e ? { ...l, top: e.colour, pattern: 'uni' } : l; };
    if (humanoidReady()) {
      // supporters wear their écurie's colour and carry its scarf or a small flag: two instanced meshes for all the fans
      this.scarves = new THREE.InstancedMesh(scarfGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), d.fans);
      this.flags = new THREE.InstancedMesh(flagGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), d.fans);
      for (const m of [this.scarves, this.flags]) { m.frustumCulled = false; m.name = 'arena_fan_' + (m === this.scarves ? 'scarves' : 'flags'); this.group.add(m); }
      const white = new THREE.Color(0xffffff);
      for (let n = 0; n < d.fans; n++) {
        const e = supporter(), h = new Humanoid(fanLook(e)); h.group.visible = false; this.group.add(h.group);
        const item = e ? (n % 2 ? 'flag' : 'scarf') : null, colour = new THREE.Color(e?.colour ?? 0xffffff);
        this.scarves.setColorAt(n, item === 'scarf' ? colour : white); this.flags.setColorAt(n, item === 'flag' ? colour : white);
        this.scarves.setMatrixAt(n, HIDDEN); this.flags.setMatrixAt(n, HIDDEN);
        this.fans.push({ h, state: 'away', path: [], x: g.x, z: g.z, speed: 1.15 + R() * 0.5, timer: 0, slot: -1, jitter: (R() - 0.5) * 0.6, moving: false,
          item, hand: h.group.getObjectByName('handR') ?? null, neck: h.group.getObjectByName('socket_neck') ?? null });
      }
      // vendors behind their stalls (the street side is the customers')
      const stalls = stallsOf(arena);
      for (const v of VENDORS) {
        const s = stalls[v.stall], h = new Humanoid({ ...randomLook(R), female: v.seller === 'Ndèye' || v.seller === 'Fatou' });
        h.group.position.set(s.x, 0.1, s.z + 0.8); h.group.rotation.y = Math.PI; h.hold = v.stall % 2 ? 'Talk' : 'Idle';
        this.group.add(h.group); this.still.push({ h }); this.vendorsH.push({ h, clip: h.hold });
      }
      // sabar drummers beside the gate, dancers in a ring in front of them
      const drums = new Batch();
      for (let k = 0; k < d.drummers; k++) {
        const { x, z } = drummerAt(g, k);
        const h = new Humanoid({ ...randomLook(R), style: 'boubou', pattern: 'wax' }); h.hold = 'Talk';
        h.group.position.set(x, 0.1, z); h.group.rotation.y = Math.PI; this.group.add(h.group); this.still.push({ h });
        drums.cyl(0.17, 0.11, 0.78, x + 0.05, 0.1, z - 0.42, 0x7a4a24, 10);           // sabar body
        drums.cyl(0.18, 0.18, 0.04, x + 0.05, 0.88, z - 0.42, 0xe8dcc0, 10);          // skin
      }
      // the supporters' stall « Couleurs du Géew » (stall 2): a rail behind Aliou with the écuries' scarves and tees
      // hanging from it, a small flag of each on the parasol (in the same merged mesh as the drums)
      {
        const s = stalls[2], z = s.z + 1.45, cols = [gearColours('baobab'), gearColours('teranga')];
        for (const dx of [-0.85, 0.85]) drums.box(0.05, 1.9, 0.05, s.x + dx, 0.1, z, 0x5b4a3a);
        drums.box(1.8, 0.04, 0.04, s.x, 1.95, z, 0x5b4a3a);
        for (let n = 0; n < 6; n++) {
          const c = cols[n % 2], x = s.x - 0.7 + n * 0.28;
          if (n < 4) { drums.box(0.09, 0.6, 0.02, x, 1.33, z, c.main); drums.box(0.092, 0.07, 0.022, x, 1.27, z, c.accent); }   // scarves
          else { drums.box(0.4, 0.5, 0.03, x + (n - 4) * 0.12, 1.38, z, c.main); for (let k = 0; k < 3; k++) drums.box(0.06, 0.5, 0.032, x + (n - 4) * 0.12 - 0.12 + k * 0.12, 1.38, z, c.accent); }   // tees
        }
        for (const [k, c] of cols.entries()) { drums.box(0.3, 0.2, 0.01, s.x + 0.9 + (k ? -0.32 : 0.02) + 0.15, 2.0 + k * 0.24, s.z, c.main); drums.box(0.3, 0.06, 0.012, s.x + 0.9 + (k ? -0.32 : 0.02) + 0.15, 2.0 + k * 0.24, s.z, c.accent); }
        const tex = signTexture('COULEURS DU GÉEW', '#1a7a44', '#f4c20d', 512, 96);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshLambertMaterial({ map: tex }));
        sign.position.set(s.x, 2.17, z - 0.03); sign.rotation.y = Math.PI; sign.name = 'arena_supporters_sign';
        this.group.add(sign);
      }
      const mesh = drums.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, false);
      if (mesh) this.group.add(mesh);
      const centre = { x: g.x + 5.2, z: g.z - 4.8 };
      for (let k = 0; k < d.dancers; k++) {
        const a = (k / d.dancers) * Math.PI * 2, r = 1.0 + R() * 0.3;
        const h = new Humanoid(fanLook()); h.hold = (['Dance_A', 'Dance_B', 'Celebrate'] as Clip[])[k % 3];
        h.group.position.set(centre.x + Math.sin(a) * r, 0.1, centre.z + Math.cos(a) * r);
        h.group.rotation.y = Math.atan2(centre.x - h.group.position.x, centre.z - h.group.position.z);
        this.group.add(h.group); this.still.push({ h });
      }
    }
    ctx.extra.add(this.group);
  }

  private slotAt(i: number): Pt { const q = this.g.queue; return { x: q.x, z: q.z0 - i * SLOT }; }

  /** Fans on their way (from a street end) or already in the queue, so the place looks busy the moment it opens. */
  private fill() {
    this.queue = [];
    this.fans.forEach((f, i) => {
      if (i >= this.limit) { f.state = 'away'; f.timer = Infinity; f.h.group.visible = false; return; }   // stays home tonight
      if (i % 2 === 0 && this.queue.length < CAP) { f.state = 'queue'; f.slot = this.queue.length; this.queue.push(f); const p = this.slotAt(f.slot); f.x = p.x + f.jitter; f.z = p.z; }
      else this.respawn(f, this.rand());
      f.h.group.visible = false;
    });
  }
  private respawn(f: Fan, progress = 0) {
    const path = this.spawns[Math.floor(this.rand() * this.spawns.length)].map(p => ({ ...p }));
    path[0].z += (this.rand() - 0.5) * 5;
    f.state = 'walk'; f.path = path.slice(1); f.x = path[0].x; f.z = path[0].z;
    if (progress > 0) { f.x += (path[1].x - path[0].x) * progress * 0.8; f.z += (path[1].z - path[0].z) * progress * 0.8; }
  }

  /** Fans who come this evening (all of them on a gala night, fewer for a weekday card). */
  private limit = 0;
  size: EveningSize = 'gala';

  setActive(on: boolean, size: EveningSize = 'gala') {
    this.active = on; this.group.visible = on; this.size = size;
    this.limit = size === 'gala' ? this.fans.length : Math.max(3, Math.ceil(this.fans.length * CARD_SHARE));
    if (on) this.fill();
    else for (const h of [...this.fans.map(f => f.h), ...this.still.map(s => s.h)]) h.group.visible = false;   // quiet: nobody drawn
  }

  /**
   * Quiet, arriving (the fans of tonight walk in and queue), or the end of the evening: the queue dissolves and everyone
   * inside comes out of the public gate in a stream, down the lane, toward the stops and the taxis; some stop for a last
   * bissap; the vendors call the last customers.
   */
  setPhase(phase: ExteriorPhase, size: EveningSize, dests: Pt[]) {
    const was = this.phase; this.phase = phase;
    if (phase !== 'outflow') {
      for (const v of this.vendorsH) v.h.hold = v.clip;
      if (phase === 'arrive' && was === 'outflow') this.lastCall = false;
      this.setActive(phase === 'arrive', size); return;
    }
    if (!this.active) {                                                  // the evening was already under way: everyone is inside
      this.active = true; this.group.visible = true; this.size = size;
      this.limit = size === 'gala' ? this.fans.length : Math.max(3, Math.ceil(this.fans.length * CARD_SHARE));
      for (const f of this.fans) { f.state = 'away'; f.timer = Infinity; f.h.group.visible = false; }
    }
    this.dests = dests; this.queue = []; this.exitQueue = [];
    this.fans.forEach((f, i) => {
      if (i >= this.limit) { f.state = 'gone'; return; }
      if (f.state === 'queue' || f.state === 'wait' || f.state === 'walk') this.leave(f);
      else if (f.state !== 'leave' && f.state !== 'gone') { f.state = 'away'; f.timer = Infinity; this.exitQueue.push(f); }
    });
    for (let i = this.exitQueue.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.exitQueue[i], this.exitQueue[j]] = [this.exitQueue[j], this.exitQueue[i]]; }
    this.emitT = 0.4;
    for (const v of this.vendorsH) v.h.hold = 'Talk';                 // the last rush
  }
  /** On the way out: down the lane if in it, maybe a last stop at a stall, then a stop, a taxi corner or a street end. */
  private leave(f: Fan, fromGate = false) {
    const q = this.g.queue, R = this.rand, path: Step[] = [];
    if (fromGate || (Math.abs(f.x - q.x) < q.half && f.z > q.z1 - 0.3)) path.push({ x: q.x + (R() - 0.5) * 3, z: q.z1 - 0.8 });
    const dest = this.dests[Math.floor(R() * this.dests.length)] ?? { x: q.x + 34, z: q.z1 };
    if (this.leavers++ % 3 === 0) {
      const s = stallFronts(this.arena).reduce((b, p) => (Math.hypot(p.x - dest.x, p.z - dest.z) < Math.hypot(b.x - dest.x, b.z - dest.z) ? p : b));
      path.push({ x: s.x + (R() - 0.5) * 1.4, z: s.z - 0.2 - R() * 0.6, wait: 3 + R() * 3 });
    }
    path.push({ x: dest.x + (R() - 0.5) * 3, z: dest.z + (R() - 0.5) * 3 });
    f.state = 'leave'; f.path = path; f.timer = 0;
  }

  /** Moves toward a point at the fan's pace; true when there. */
  private stepTo(f: Fan, p: Pt, dt: number, pace = 1): boolean {
    const dx = p.x - f.x, dz = p.z - f.z, dist = Math.hypot(dx, dz);
    if (dist < 0.06) { f.moving = false; return true; }
    const s = Math.min(dist, f.speed * pace * dt);
    f.x += (dx / dist) * s; f.z += (dz / dist) * s; f.moving = true;
    f.h.group.rotation.y = Math.atan2(dx, dz);
    return dist - s < 0.06;
  }

  update(dt: number, viewer: Pt, draw: boolean) {
    if (!this.active) return;
    // the gate lets the first of the queue in now and then; everyone behind moves up one place
    this.gateT += dt;
    if (this.phase === 'outflow' && this.exitQueue.length) {                // out of the gate, a few at a time
      this.emitT -= dt;
      while (this.emitT <= 0 && this.exitQueue.length) {
        const f = this.exitQueue.shift()!;
        f.x = this.g.x + (this.rand() - 0.5) * 2.4; f.z = this.g.z + 0.6; this.leave(f, true);
        this.emitT += 0.3 + this.rand() * 0.45;
      }
    }
    const first = this.phase === 'arrive' ? this.queue[0] : undefined;
    if (first && this.gateT >= GATE_EVERY && Math.hypot(first.x - (this.slotAt(0).x + first.jitter), first.z - this.slotAt(0).z) < 0.3) {
      this.gateT = 0; this.queue.shift();
      first.state = 'enter'; first.slot = -1; first.path = [{ x: this.g.x, z: this.g.z + 2.2 }];
      this.queue.forEach((f, i) => { f.slot = i; });
    }
    for (const f of this.fans) {
      switch (f.state) {
        case 'walk':
          if (this.stepTo(f, f.path[0], dt)) { f.path.shift(); if (!f.path.length) f.state = 'wait'; }
          break;
        case 'wait':                                                         // at the end of the lane: in when there is room
          f.moving = false;
          if (this.queue.length < CAP) { f.state = 'queue'; f.slot = this.queue.length; this.queue.push(f); }
          break;
        case 'queue': {
          const p = this.slotAt(f.slot);
          this.stepTo(f, { x: p.x + f.jitter, z: p.z }, dt, 0.7);
          if (!f.moving) f.h.group.rotation.y = 0;                           // facing the gate (+z)
          break;
        }
        case 'enter':
          if (this.stepTo(f, f.path[0], dt)) { f.state = 'away'; f.timer = 3 + this.rand() * 6; }
          break;
        case 'away':
          f.moving = false;
          f.timer -= dt; if (f.timer <= 0 && this.phase === 'arrive') this.respawn(f);
          break;
        case 'leave': {
          if (f.timer > 0) { f.timer -= dt; f.moving = false; f.h.group.rotation.y = 0; break; }   // a last bissap at the stall
          const p = f.path[0];
          if (!p) { f.state = 'gone'; break; }
          if (this.stepTo(f, p, dt)) { f.path.shift(); if (p.wait) f.timer = p.wait; }
          break;
        }
        case 'gone':
          f.moving = false;
          break;
      }
      const vis = draw && f.state !== 'away' && f.state !== 'gone' && Math.hypot(f.x - viewer.x, f.z - viewer.z) <= VIEW;
      f.h.group.visible = vis;
      if (vis) { f.h.group.position.set(f.x, 0.1, f.z); f.h.animate(dt, f.moving ? f.speed : 0); }
    }
    this.placeItems();
    for (const s of this.still) {
      const p = s.h.group.position, vis = draw && Math.hypot(p.x - viewer.x, p.z - viewer.z) <= VIEW;
      s.h.group.visible = vis;
      if (vis) s.h.animate(dt, 0);
    }
  }

  /** Scarves on the necks and flags in the right hands of the fans drawn this frame (hidden for the others). */
  private placeItems() {
    if (!this.scarves || !this.flags) return;
    this.fans.forEach((f, i) => {
      const show = f.h.group.visible && f.item;
      this.scarves!.setMatrixAt(i, HIDDEN); this.flags!.setMatrixAt(i, HIDDEN);
      if (!show) return;
      const yaw = f.h.group.rotation.y, node = f.item === 'scarf' ? f.neck : f.hand;
      if (node) { node.updateWorldMatrix(true, false); node.getWorldPosition(P3); }
      else P3.set(f.x + (f.item === 'flag' ? Math.cos(yaw) * -0.22 : 0), f.item === 'flag' ? 1.0 : 1.45, f.z);
      if (f.item === 'scarf') { P3.y -= 0.03; Q4.setFromEuler(E3.set(0, yaw, 0)); this.scarves!.setMatrixAt(i, M4.compose(P3, Q4, ONE)); }
      else { Q4.setFromEuler(E3.set(0, yaw + Math.PI / 2, f.moving ? 0.25 : 0.1)); this.flags!.setMatrixAt(i, M4.compose(P3, Q4, ONE)); }
    });
    this.scarves.instanceMatrix.needsUpdate = true; this.flags.instanceMatrix.needsUpdate = true;
  }

  /** Supporters by item, and the fans showing one now. */
  items() {
    const shown = this.fans.filter(f => f.item && f.h.group.visible).length;
    return { scarves: this.fans.filter(f => f.item === 'scarf').length, flags: this.fans.filter(f => f.item === 'flag').length, shown,
      meshes: [this.scarves, this.flags].filter(Boolean).length };
  }

  counts() {
    const present = this.fans.filter(f => f.state !== 'away' && f.state !== 'gone').length + this.still.length;
    const drawn = [...this.fans.map(f => f.h), ...this.still.map(s => s.h)].filter(h => h.group.visible).length;
    return { present: this.active ? present : 0, drawn, queue: this.queue.length, fans: this.fans.length, still: this.still.length, coming: this.active ? this.limit : 0, size: this.size,
      phase: this.phase, leaving: this.fans.filter(f => f.state === 'leave').length, gone: this.fans.filter(f => f.state === 'gone').length, inside: this.exitQueue.length,
      atStalls: this.fans.filter(f => f.state === 'leave' && f.timer > 0).length };
  }

  dispose() {
    for (const f of this.fans) f.h.dispose(); for (const s of this.still) s.h.dispose();
    for (const m of [this.scarves, this.flags]) if (m) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); }
    this.group.removeFromParent();
  }
}

let ext: Exterior | null = null;
let forced: boolean | null = null;
let dayOverride: number | null = null;
const audio = new ExteriorAudio();

/** The road segments in front of the gate are closed to the decorative traffic while the queue is there. */
function closeRoads(g: ArenaGate | null) {
  if (!g) { trafficClosures.closed = null; return; }
  const memo = new Map<string, boolean>();
  trafficClosures.closed = (ax, az, bx, bz) => {
    const k = `${ax},${az},${bx},${bz}`;
    let v = memo.get(k);
    if (v === undefined) { v = crossesQueue(g, ax, az, bx, bz); memo.set(k, v); }
    return v;
  };
}
/**
 * Transport stops of the hub that are served now (where the crowd heads after the gala): on fight evenings Ligne 23's
 * day stops are parked and its evening route `23s` serves the arena (transport.served), so nobody walks to a parked stop.
 */
const stopsOf = (ctx: GameCtx) => ctx.places.all().filter(p => p.type === 'stop' && p.anchors[0] && transport.served(p.id)).map(p => ({ x: p.anchors[0].x, z: p.anchors[0].z }));
function setPhase(ctx: GameCtx, phase: ExteriorPhase) {
  if (!ext) return;
  ext.setPhase(phase, eveningSize(dayOverride ?? ctx.day(), ctx.hour()), outflowDestinations(ext.g, stopsOf(ctx)));
  const on = phase !== 'quiet'; activeNow = on;
  closeRoads(on ? ext.g : null);
  // the supporters' stall: a piece paid there is the player's (« Biens ») and worn at once (src/economy/wear.ts)
  const hooks = {
    gear: (id: string) => { const sp = takeGear(ctx.state, id); if (sp) { ctx.toast(`Tu portes : ${sp.name} · en ville et dans la tribune ${sp.ecurie === 'baobab' ? 'B–C' : 'F–G'}`); ctx.save(); } },
    owns: (id: string) => holds(ctx.state, id),
  };
  for (const p of vendorPlaces(ext.hub.id, ext.arena, hooks)) {
    if (on) ctx.places.add(p); else ctx.places.remove(p.id);
  }
}
/** Quiet, arriving or pouring out: the fight evening's rule, then the arena's after-gala window (src/arena/program.ts). */
function phaseNow(ctx: GameCtx): ExteriorPhase {
  if (forced !== null) return forced ? (forcedOut ? 'outflow' : 'arrive') : 'quiet';
  const day = dayOverride ?? ctx.day(), hour = ctx.hour();
  const after = streetAt(hour, ctx.state.data.counters[GALA_DONE_COUNTER] === day) === 'after';
  return exteriorPhase(arenaExterior.isEventDay(day, hour), after);
}
let forcedOut = false;
/** Loudness of the drums and of the murmur where the player stands (0 when the evening is quiet). */
function loudness(ctx: GameCtx) {
  if (!ext?.active) return { drums: 0, murmur: 0 };
  // one rhythm for the evening, as loud as the nearer drummers: the group by the gate or the deck inside, by the tunnel
  const p = ctx.player.pos, inside = !!ctx.inside(), muted = isMuted(), c = drumsCentre(ext.g), dk = deckCentre(ext.arena.cx, ext.arena.cz);
  const dist = Math.min(Math.hypot(p.x - c.x, p.z - c.z), Math.hypot(p.x - dk.x, p.z - dk.z));
  // a wrestler of tonight in his corner or walking out: the drummers play louder, for him (src/arena/fighter.ts), over the
  // whole arena (his écurie's corner may be across the ring from their deck)
  const moment = arenaFighter.phase() === 'prep' || arenaFighter.phase() === 'ring';
  const within = Math.hypot(p.x - ext.arena.cx, p.z - ext.arena.cz) < WALL_R;
  const drums = moment ? fighterDrumVolume(dist, within, inside, muted, FIGHTER_DRUMS) : drumVolume(dist, inside, muted);
  return { drums, murmur: murmurVolume(queueDistance(ext.g, p.x, p.z), inside, muted) };
}

export const arenaExteriorModule: GameModule = {
  name: 'arenaExterior',
  init() { listenForGesture(); },
  hubLoaded(ctx, hub) {
    ext?.dispose(); ext = null; gate = null; activeNow = false;
    closeRoads(null); audio.stop();                                     // a new hub: no closure, no drums
    if (!hub.arena) return;
    gate = gateOf(hub.arena);
    ext = new Exterior(ctx, hub, hub.arena, gate, ctx.quality());
    setPhase(ctx, phaseNow(ctx));
  },
  update(ctx, dt) {
    if (!ext) { audio.set(0, 0); return; }
    const ph = phaseNow(ctx);
    if (ph !== ext.phase || (ph === 'arrive' && ext.size !== eveningSize(dayOverride ?? ctx.day(), ctx.hour()))) setPhase(ctx, ph);   // a gala night fills up
    if (ph === 'outflow' && !ext.lastCall && !ctx.inside()) {              // the vendors call the last customers
      const p = ctx.player.pos, fronts = stallFronts(ext.arena), i = fronts.findIndex(s => Math.hypot(s.x - p.x, s.z - p.z) < 7);
      if (i >= 0) { const v = VENDORS.find(x => x.stall === i)!; ext.lastCall = true; ctx.toast(`${v.seller} : « Les derniers avant de rentrer ! ${say('Ñibbil ak jàmm')} ! »`); }
    }
    ext.update(dt, ctx.player.pos, !ctx.inside());
    const v = loudness(ctx);
    audio.set(v.drums, v.murmur);
  },
  debug: ctx => ({
    /** State of the arena's surroundings: event on, people present / drawn, queue, vendors, the gate, sound, traffic. */
    arenaOut: () => {
      const day = dayOverride ?? ctx.day(), g = ext?.g ?? null;
      const cars = trafficPositions();
      return { event: ext?.active ?? false, day, weekday: WEEKDAY_FR[weekday(day)], hour: ctx.hour(), gate, quality: ctx.quality(),
        ...(ext?.counts() ?? { present: 0, drawn: 0, queue: 0, fans: 0, still: 0, coming: 0, size: 'gala' }),
        items: ext?.items() ?? null,
        audio: { ...audio.info(), want: loudness(ctx), muted: isMuted() },
        traffic: { cars: cars.length, inLane: g ? cars.filter(c => queueDistance(g, c.x, c.z) < 1.5).length : 0, closed: !!trafficClosures.closed },
        drums: g ? drumsCentre(g) : null,
        vendors: ctx.places.all().filter(p => p.id.includes(':arena-out:')).map(p => ({ id: p.id, name: p.name, anchor: p.anchors[0], offers: p.offers.stall.map(o => `${o.label} · ${o.price ?? 0}`) })) };
    },
    /** Force the event on / off (null: back to the city clock), or pretend the city day is `day`. */
    arenaOutForce: (v: boolean | null) => { forced = v; },
    /** With arenaOutForce(true): the end of the evening (the crowd pours out) instead of the arrivals. */
    arenaOutOutflow: (v: boolean) => { forcedOut = v; },
    arenaOutDay: (d: number | null) => { dayOverride = d; },
  }),
};
