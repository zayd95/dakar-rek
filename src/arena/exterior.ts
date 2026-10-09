import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import { Humanoid, humanoidReady, randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { Batch } from '../world/batch';
import { ECURIES, gateOf, isFightEvening, stallsOf, vendorPlaces, VENDORS, weekday, WEEKDAY_FR, type ArenaGate } from './exteriorRules';

/**
 * Outside the Pikine arena: on fight evenings the surroundings come alive — fans walking in
 * from the street in their écurie's colours, a queue moving through the gate, sabar drummers and dancers beside it,
 * and vendors at the four stalls who are real places of the shared registry (drinks, grilled peanuts and brochettes,
 * scarves and flags, water). Quiet otherwise: nobody is drawn and the stalls sell nothing. Everything stays outside the
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
type FanState = 'walk' | 'wait' | 'queue' | 'enter' | 'away';
interface Fan { h: Humanoid; state: FanState; path: Pt[]; x: number; z: number; speed: number; timer: number; slot: number; jitter: number; moving: boolean }
interface Still { h: Humanoid }

let scheduled: ((day: number, hour: number) => boolean) | null = null;
let gate: ArenaGate | null = null;

/** The API shared with the arena visit (see the module comment). */
export const arenaExterior = {
  /** Fight evening (Friday–Sunday from 16 h, city clock) or a bout the arena scheduled. */
  isEventDay(day: number, hour: number): boolean { return isFightEvening(day, hour) || !!scheduled?.(day, hour); },
  /** Gate of the arena of the current hub and its queue lane (Pikine), or null. */
  gate(): ArenaGate | null { return gate; },
  /** The arena's own bouts: the exterior is alive whenever `fn(day, hour)` is true (null removes it). */
  schedule(fn: ((day: number, hour: number) => boolean) | null) { scheduled = fn; },
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

  constructor(ctx: GameCtx, readonly hub: HubWorld, readonly arena: { cx: number; cz: number }, readonly g: ArenaGate, quality: 'low' | 'medium' | 'high') {
    const d = EXTERIOR_DENSITY[quality], R = this.rand, q = g.queue;
    this.group.name = 'arena_exterior'; this.group.visible = false;
    // walking in from both ends of the street in front of the gate, round the last barrier, into the lane
    for (const sx of [-1, 1]) this.spawns.push([{ x: g.x + sx * 34, z: g.z - 8 }, { x: g.x + sx * 3.7, z: q.z1 - 0.35 }, { x: g.x, z: q.z1 - 0.35 }]);
    const fanLook = (): PersonLook => {
      const l = randomLook(R), e = ECURIES[Math.floor(R() * ECURIES.length)];
      return R() < 0.65 ? { ...l, top: e.colour, pattern: 'uni' } : l;
    };
    if (humanoidReady()) {
      for (let n = 0; n < d.fans; n++) {
        const h = new Humanoid(fanLook()); h.group.visible = false; this.group.add(h.group);
        this.fans.push({ h, state: 'away', path: [], x: g.x, z: g.z, speed: 1.15 + R() * 0.5, timer: 0, slot: -1, jitter: (R() - 0.5) * 0.6, moving: false });
      }
      // vendors behind their stalls (the street side is the customers')
      const stalls = stallsOf(arena);
      for (const v of VENDORS) {
        const s = stalls[v.stall], h = new Humanoid({ ...randomLook(R), female: v.seller === 'Ndèye' || v.seller === 'Fatou' });
        h.group.position.set(s.x, 0.1, s.z + 0.8); h.group.rotation.y = Math.PI; h.hold = v.stall % 2 ? 'Talk' : 'Idle';
        this.group.add(h.group); this.still.push({ h });
      }
      // sabar drummers beside the gate, dancers in a ring in front of them
      const drums = new Batch();
      for (let k = 0; k < d.drummers; k++) {
        const x = g.x + 4.4 + k * 0.95, z = g.z - 2.4;
        const h = new Humanoid({ ...randomLook(R), style: 'boubou', pattern: 'wax' }); h.hold = 'Talk';
        h.group.position.set(x, 0.1, z); h.group.rotation.y = Math.PI; this.group.add(h.group); this.still.push({ h });
        drums.cyl(0.17, 0.11, 0.78, x + 0.05, 0.1, z - 0.42, 0x7a4a24, 10);           // sabar body
        drums.cyl(0.18, 0.18, 0.04, x + 0.05, 0.88, z - 0.42, 0xe8dcc0, 10);          // skin
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

  setActive(on: boolean) {
    this.active = on; this.group.visible = on;
    if (on) this.fill();
    for (const f of this.fans) if (!on) f.h.group.visible = false;
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
    const first = this.queue[0];
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
          f.timer -= dt; if (f.timer <= 0) this.respawn(f);
          break;
      }
      const vis = draw && f.state !== 'away' && Math.hypot(f.x - viewer.x, f.z - viewer.z) <= VIEW;
      f.h.group.visible = vis;
      if (vis) { f.h.group.position.set(f.x, 0.1, f.z); f.h.animate(dt, f.moving ? f.speed : 0); }
    }
    for (const s of this.still) {
      const p = s.h.group.position, vis = draw && Math.hypot(p.x - viewer.x, p.z - viewer.z) <= VIEW;
      s.h.group.visible = vis;
      if (vis) s.h.animate(dt, 0);
    }
  }

  counts() {
    const present = this.fans.filter(f => f.state !== 'away').length + this.still.length;
    const drawn = [...this.fans.map(f => f.h), ...this.still.map(s => s.h)].filter(h => h.group.visible).length;
    return { present: this.active ? present : 0, drawn, queue: this.queue.length, fans: this.fans.length, still: this.still.length };
  }

  dispose() { for (const f of this.fans) f.h.dispose(); for (const s of this.still) s.h.dispose(); this.group.removeFromParent(); }
}

let ext: Exterior | null = null;
let forced: boolean | null = null;
let dayOverride: number | null = null;

function setActive(ctx: GameCtx, on: boolean) {
  if (!ext) return;
  ext.setActive(on);
  for (const p of vendorPlaces(ext.hub.id, ext.arena)) {
    if (on) ctx.places.add(p); else ctx.places.remove(p.id);
  }
}
const eventNow = (ctx: GameCtx) => forced ?? arenaExterior.isEventDay(dayOverride ?? ctx.day(), ctx.hour());

export const arenaExteriorModule: GameModule = {
  name: 'arenaExterior',
  hubLoaded(ctx, hub) {
    ext?.dispose(); ext = null; gate = null;
    if (!hub.arena) return;
    gate = gateOf(hub.arena);
    ext = new Exterior(ctx, hub, hub.arena, gate, ctx.quality());
    setActive(ctx, eventNow(ctx));
  },
  update(ctx, dt) {
    if (!ext) return;
    const on = eventNow(ctx);
    if (on !== ext.active) setActive(ctx, on);
    ext.update(dt, ctx.player.pos, !ctx.inside());
  },
  debug: ctx => ({
    /** State of the arena's surroundings: event on, people present / drawn, queue, vendors, the gate. */
    arenaOut: () => {
      const day = dayOverride ?? ctx.day();
      return { event: ext?.active ?? false, day, weekday: WEEKDAY_FR[weekday(day)], hour: ctx.hour(), gate, quality: ctx.quality(),
        ...(ext?.counts() ?? { present: 0, drawn: 0, queue: 0, fans: 0, still: 0 }),
        vendors: ctx.places.all().filter(p => p.id.includes(':arena-out:')).map(p => ({ id: p.id, name: p.name, anchor: p.anchors[0], offers: p.offers.stall.map(o => `${o.label} · ${o.price ?? 0}`) })) };
    },
    /** Force the event on / off (null: back to the city clock), or pretend the city day is `day`. */
    arenaOutForce: (v: boolean | null) => { forced = v; },
    arenaOutDay: (d: number | null) => { dayOverride = d; },
  }),
};
