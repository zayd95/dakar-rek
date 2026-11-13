import type * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Collider } from '../world/types';
import { NavGrid, type Area } from '../world/navgrid';
import { Crowd, LIVE_CROWDS, defaultLook, type CrowdLook, type CrowdSlot } from '../crowd/crowd';
import { lookRng } from '../crowd/looks';
import { STREET_BODIES } from '../social/ambientLife';
import { BODY_BUDGET, CLEAR_ANCHOR, Routines, lifeBudget, shareAt, stepAside, type KeepOut, type LifePlan, type LifeSpot, type Person, type Pt } from './routine';

/**
 * The scene side of a living place (1.0.1; the routine itself: src/venues/routine.ts, who stands where: src/venues/lifePlans.ts). One per venue:
 *
 *  - the people are the reusable crowd's instanced figures (src/crowd/crowd.ts: one draw call per posture for all of them, walking, talking with
 *    their hands, dancing on the place's tempo), and the few nearest the player its full animated bodies — as many as the shared body budget has
 *    left once the street's bodies and the other crowds' are counted (`lifeBudget`), never more;
 *  - they walk round the furniture on the place's own walking map (src/world/navgrid.ts, made from its colliders the first time it is seen), sit on
 *    seats of the shared registry (held while they sit: the player and the others never take the same one), and step aside when the player walks
 *    up to them: they have no collider, so they never stop the player anywhere;
 *  - nothing is simulated while the place is out of sight: when the player comes back (or the hour jumps) it is settled as the hour has it.
 *
 * Local to the device: nothing here is sent to or read from the network.
 */
export interface VenueLifeOptions {
  ctx: GameCtx;
  /** The plan in the scene's own metres (src/venues/lifePlans.ts `placed`). */
  plan: LifePlan;
  name: string;
  /** Where the figures go: the hub's per-load group, or an interior's. */
  parent: THREE.Object3D;
  /** The solids people walk round, and the ground they walk on. */
  colliders(): readonly Collider[];
  area: Area;
  /** The ground under someone's feet. */
  y(x: number, z: number): number;
  /** Seen now: the player's space is the place's and the camera near enough. While false nothing is drawn or simulated. */
  active(): boolean;
  /** Discs nobody stands in (anchors, doors, the people already there), in the scene's metres; a spot inside one is left out. */
  keep?: readonly KeepOut[];
  /** Animated bodies of the place's own in view beside the street's (a hostess in an interior). */
  extraBodies?(): number;
  /** The street's bodies are in view too (false in an interior: only `extraBodies` count). */
  street?: boolean;
}

const SEATED = ':s';
/** Clothes for an evening out or a day at the beach: the crowd's ordinary mix, the same person every time for an id. */
const lookOf = (id: string): CrowdLook => defaultLook(lookRng(`life:${id}`));
/** Debug only: `?debug&nolife` builds the living places inert (nobody), to measure what they cost (scripts/check-living-venues.mjs). */
const disabled = (() => { try { const q = new URLSearchParams(location.search); return q.has('debug') && q.has('nolife'); } catch { return false; } })();
const LIVES = new Set<VenueLife>();
/** Every living place of the hub, for `__dakar.venueLife()` (src/venues/index.ts). */
export const venueLifeInfo = () => [...LIVES].map(l => l.info());

export class VenueLife {
  readonly crowd: Crowd;
  private routines: Routines | null = null;
  private grid: NavGrid | null = null;
  private wasActive = false;
  private lastHour = -1;
  private budgetT = 0;
  private bodies = 0; private others = 0;
  private dropped: string[] = [];
  /** What each person's figure was last told (so a frame only moves the ones who moved). */
  private shown = new Map<string, { on: boolean; seated: boolean; x: number; z: number; yaw: number; speed: number; mood: string }>();

  constructor(private o: VenueLifeOptions) {
    const q = o.ctx.quality(), n = o.plan.capacity[q], slots: CrowdSlot[] = [];
    for (let i = 0; i < n; i++) {
      const id = `${o.plan.id}:p${i}`;
      slots.push({ id, x: 0, y: 0, z: 0, yaw: 0, seated: false }, { id: id + SEATED, x: 0, y: 0, z: 0, yaw: 0, seated: true });
    }
    this.crowd = new Crowd(slots, { quality: q, near: 0, nearRadius: 9, name: `life-${o.name}`, seed: 409, fidget: 0.03, blobs: q !== 'low', look: s => lookOf(s.id.endsWith(SEATED) ? s.id.slice(0, -SEATED.length) : s.id) });
    this.crowd.group.name = `life_${o.name}`;
    this.crowd.group.visible = false;
    o.parent.add(this.crowd.group);
    // the crowd's instanced meshes are this place's to free (dispose): a terrace's crowd sits in its interior's group, which the hub's own disposal
    // walks on a hub change (src/world/builder.ts disposeGroup) — it must not dispose the crowd's material, which every crowd of the city shares
    this.crowd.group.traverse(m => { if ((m as THREE.Mesh).isMesh) m.userData.shared = true; });
    LIVES.add(this);
  }

  /** The walking map and the routines, the first time the place is seen (its colliders and seats are all there by then). */
  private start() {
    const o = this.o, seats = o.ctx.seats;
    this.grid = new NavGrid(o.area, o.colliders(), 0.4, 0.25);
    const grid = this.grid, keep = o.keep ?? [];
    const ok = (s: LifeSpot): LifeSpot | null => {
      if (s.seat) {                                                          // where the seat is, facing as it faces
        const st = seats.get(s.seat); if (!st) { this.dropped.push(`${s.id} (no seat)`); return null; }
        const back = st.kind === 'bed' ? 0.55 : 0;                           // on a sun bed: sitting up at its head, as the beach's own sunbathers do
        return { ...s, x: st.x - Math.sin(st.yaw) * back, z: st.z - Math.cos(st.yaw) * back, yaw: st.yaw };
      }
      if (!grid.free(s)) { this.dropped.push(`${s.id} (solid)`); return null; }
      const k = keep.find(c => Math.hypot(s.x - c.x, s.z - c.z) < c.r);
      if (k) { this.dropped.push(`${s.id} (${k.why})`); return null; }
      return s;
    };
    const keepOnly = (l: readonly LifeSpot[]) => l.map(ok).filter((s): s is LifeSpot => !!s);
    const plan: LifePlan = { ...o.plan, gathers: keepOnly(o.plan.gathers), spots: keepOnly(o.plan.spots) };
    this.routines = new Routines(plan, o.ctx.quality(), {
      route: (a, b) => grid.path(a, b),
      claim: (s, who) => {
        if (s.seat) return seats.occupy(s.seat, `life:${who}`);
        const p = o.ctx.player.pos;
        return Math.hypot(p.x - s.x, p.z - s.z) > CLEAR_ANCHOR;              // never walks to where the player stands
      },
      release: (s, who) => { if (s.seat) seats.release(s.seat, `life:${who}`); },
    });
  }

  update(dt: number) {
    const o = this.o, ctx = o.ctx, on = !disabled && o.active();
    this.crowd.group.visible = on;
    if (!on) { if (this.wasActive) { this.routines?.clear(); this.sync(); this.wasActive = false; } return; }
    if (!this.routines) this.start();
    const r = this.routines!, hour = ctx.hour();
    const jump = this.lastHour >= 0 && Math.abs(((hour - this.lastHour + 36) % 24) - 12) > 0.2;
    if (!this.wasActive || jump) r.settle(hour);
    this.wasActive = true; this.lastHour = hour;
    r.step(Math.min(dt, 0.5), hour);
    if ((this.budgetT -= dt) <= 0) {
      this.budgetT = 1;
      // what the shared budget has given out already: the street's bodies and the other crowds' near ones (in an interior: the place's own only)
      let others = o.extraBodies?.() ?? 0;
      if (o.street !== false) {
        others += STREET_BODIES.full;
        for (const c of LIVE_CROWDS) if (c !== this.crowd && c.group.visible) others += c.people().length;
      }
      this.others = others;
      this.bodies = lifeBudget(o.plan, ctx.quality(), hour, others).bodies;
      this.crowd.setNearMax(this.bodies);
    }
    this.sync();
    this.crowd.setCamera(ctx.camera);
    this.crowd.update(dt, true);
  }

  /** The figures as the routines have their people now. */
  private sync() {
    const r = this.routines; if (!r) return;
    const o = this.o, c = this.crowd, me = o.ctx.player.pos, bpm = o.plan.bpm ?? 110;
    for (const p of r.people) {
      const on = p.phase !== 'off', seated = on && p.seated, sid = p.id + SEATED;
      let was = this.shown.get(p.id);
      if (!was) { was = { on: false, seated: false, x: NaN, z: NaN, yaw: NaN, speed: 0, mood: '' }; this.shown.set(p.id, was); }
      if (on !== was.on || seated !== was.seated) { c.setPresent(p.id, on && !seated); c.setPresent(sid, seated); was.x = NaN; }
      was.on = on; was.seated = seated;
      if (!on) continue;
      const mood = p.doing === 'dance' ? 'dance' : p.doing === 'talk' || p.doing === 'sit' ? 'chat' : 'rest';
      if (mood !== was.mood) { c.setMemberMood(p.id, mood, bpm); c.setMemberMood(sid, mood === 'dance' ? 'rest' : mood, bpm); was.mood = mood; }
      // standing or walking: a step aside when the player comes right up; seated: on the seat
      const at = seated ? p : stepAside(p.x, p.z, me.x, me.z);
      if (at.x === was.x && at.z === was.z && p.yaw === was.yaw && p.speed === was.speed) continue;
      was.x = at.x; was.z = at.z; was.yaw = p.yaw; was.speed = p.speed;
      if (seated) c.move(sid, at.x, this.seatY(p), at.z, p.yaw, 0);
      else c.move(p.id, at.x, o.y(at.x, at.z), at.z, p.yaw, p.speed);
    }
  }
  /** The sitting surface under a seated person (a sun bed's sunbather sits up on its mattress). */
  private seatY(p: Person) {
    const st = p.spot?.seat ? this.o.ctx.seats.get(p.spot.seat) : null;
    return st ? (st.kind === 'bed' ? 0.5 : st.top) : this.o.y(p.x, p.z);
  }

  /** Debug and the checks: who is there, doing what, where; the bodies against the budget. */
  info() {
    const r = this.routines, q = this.o.ctx.quality(), hour = this.o.ctx.hour(), st = this.crowd.stats();
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      name: this.o.name, plan: this.o.plan.id, quality: q, hour: round(hour), active: this.wasActive, share: shareAt(this.o.plan, hour),
      target: lifeBudget(this.o.plan, q, hour).people, capacity: this.o.plan.capacity[q],
      present: r?.live ?? 0, phases: r?.counts() ?? null,
      bodies: this.crowd.people().length, bodiesAllowed: this.bodies, others: this.others, bodyBudget: BODY_BUDGET[q],
      figures: st.mid + st.far, drawCalls: this.crowd.group.visible ? this.crowd.drawCalls() : 0,
      dropped: this.dropped, spots: r ? r.plan.spots.length + r.plan.gathers.length : 0,
      people: (r?.people ?? []).filter(p => p.phase !== 'off').map(p => ({ id: p.id, phase: p.phase, doing: p.doing, seated: p.seated, spot: p.spot?.id ?? null, x: round(p.x), z: round(p.z), trail: p.trail.join('>') })),
    };
  }
  /** The way on foot between two points on the place's walking map (the checks: the player's way to an anchor is never shut). */
  way(a: Pt, b: Pt) { return this.grid?.path(a, b) ?? null; }

  dispose() { this.routines?.clear(); this.crowd.dispose(); LIVES.delete(this); }
}
