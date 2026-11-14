import { AMBIENT_BUDGET } from '../social/ambientData';

/**
 * The routine of the people who make a venue feel inhabited (1.0.1 « living places »: Le Patio, the rooftop terraces, Ngor's beach): each one
 *
 *   arrives (steps in at one of the place's ways in, looks around) → walks → gathers (joins the others at a meeting point, a word) → walks →
 *   interacts (dances, sits, talks, looks at the sea: what the place is for), once or a few times → leaves (walks back out) → is gone a while.
 *
 * How many are there follows the place's hour windows (the beach in the afternoon, the club and the roofs in the evening) and the graphics quality.
 * Pure and deterministic: each person has a random stream of their own, seeded from the place's id and their index (never the hub builder's stream,
 * never Math.random), and nothing here knows about the scene, so tests/venueRoutine.test.ts can hold it to its promises. Everything is simulated on
 * the device; nothing of it is ever sent over the network (two players do not see the same strangers, as with the street's ambient people).
 * The scene side — figures, seats, paths round the furniture — is src/venues/venueLife.ts.
 */
export type LifeQuality = 'low' | 'medium' | 'high';
export type Phase = 'off' | 'arrive' | 'walk' | 'gather' | 'interact' | 'leave';
/** What someone does at a spot: a word standing, sitting (a seat of the registry), dancing, looking at the sea (or the city), standing by, a short halt on a stroll. */
export type Doing = 'talk' | 'sit' | 'dance' | 'sea' | 'stand' | 'stroll';
export interface Pt { x: number; z: number }
export interface LifeSpot extends Pt {
  id: string;
  yaw: number;
  kind: Doing;
  /** A seat of the shared registry (its id): the person sits on it, and nobody else — player or NPC — takes it meanwhile. */
  seat?: string;
  /** Only from this hour (wraps midnight with `until`): a roof's dancers come out late. */
  from?: number; until?: number;
}
export interface LifePlan {
  id: string;
  /** Where people come in and go out (never a spot to stand on). */
  entries: readonly Pt[];
  /** The meeting points: one person each, standing. */
  gathers: readonly LifeSpot[];
  /** What the place is for: one person each. */
  spots: readonly LifeSpot[];
  /** Hour windows [from, to, share of the capacity] (to < from wraps midnight); outside every window nobody is there. */
  windows: readonly (readonly [number, number, number])[];
  /** People at a full window, by graphics quality (they are instanced figures; the full bodies among them: `near`). */
  capacity: Record<LifeQuality, number>;
  /** Full animated bodies among them at most, by quality, before the shared budget (lifeBudget). */
  near: Record<LifeQuality, number>;
  /** Beats a minute of the place's music (the dancers' step). */
  bpm?: number;
}

/** Seconds spent at a spot, by what is done there [least, most]; a stroll's halt is short, so strollers keep walking. */
export const STAY: Record<Doing, readonly [number, number]> = {
  talk: [12, 30], sit: [35, 80], dance: [22, 55], sea: [16, 40], stand: [10, 22], stroll: [2, 5],
};
export const ARRIVE_BEAT: readonly [number, number] = [0.8, 2.4], GATHER_STAY: readonly [number, number] = [6, 16];
/** Seconds someone stays gone before coming back, and between two arrivals (the place fills over a minute or so, never all at once). */
export const AWAY: readonly [number, number] = [8, 30], ARRIVE_EVERY: readonly [number, number] = [1.2, 4.5], LEAVE_EVERY = 2.2;
export const WALK_SPEED: readonly [number, number] = [1.05, 1.45];

/** The phases one may follow another (tests: no person ever makes another step). */
export const NEXT: Record<Phase, readonly Phase[]> = {
  off: ['arrive'], arrive: ['walk', 'leave'], walk: ['gather', 'interact', 'leave'], gather: ['walk', 'leave'], interact: ['walk', 'leave'], leave: ['off'],
};

// ------------------------------------------------------------------ hours and density
const wrap = (h: number) => ((h % 24) + 24) % 24;
export const inWindow = (h: number, from: number, to: number) => { const x = wrap(h); return from <= to ? x >= from && x < to : x >= from || x < to; };
/** The share of the capacity at this hour (0: nobody). */
export function shareAt(plan: Pick<LifePlan, 'windows'>, hour: number): number {
  let s = 0;
  for (const [a, b, share] of plan.windows) if (inWindow(hour, a, b)) s = Math.max(s, share);
  return s;
}
/** People a spot can hold at this hour: its own hours, when it has some. */
export const spotOpen = (s: LifeSpot, hour: number) => s.from === undefined || inWindow(hour, s.from, s.until ?? s.from);

/**
 * The frame's draw calls the game allows itself, and the animated NPC bodies under it, by quality (docs/PERF_EVENING.md; the audit of 1.0.1 quotes
 * 12 / 20 / 30 bodies, the code's cap has since been lowered to BODY_CALL_BUDGET / BODY_CALLS = 10 / 16 / 26: the stricter one is kept).
 */
export const FRAME_CALLS: Record<LifeQuality, number> = { low: 180, medium: 300, high: 420 };
export const BODY_BUDGET: Record<LifeQuality, number> = { low: AMBIENT_BUDGET.low.totalFull, medium: AMBIENT_BUDGET.medium.totalFull, high: AMBIENT_BUDGET.high.totalFull };

/**
 * The density rule. `people`: how many are there at this hour on this quality (figures, one instanced draw call per posture for all of them);
 * `bodies`: how many of them may be full animated bodies — the plan's share for the quality, and never more than what the shared budget has left
 * once the street's and the other crowds' bodies in view are counted (`others`). Everyone beyond it stays an instanced figure.
 */
export function lifeBudget(plan: Pick<LifePlan, 'windows' | 'capacity' | 'near'>, q: LifeQuality, hour: number, others = 0): { people: number; bodies: number } {
  const share = shareAt(plan, hour), people = share > 0 ? Math.max(1, Math.round(plan.capacity[q] * share)) : 0;
  const bodies = Math.max(0, Math.min(plan.near[q], people, BODY_BUDGET[q] - Math.max(0, Math.round(others))));
  return { people, bodies };
}

// ------------------------------------------------------------------ a random stream per person (mulberry32 on a string hash)
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function streamOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ the people
export interface Person extends Pt {
  id: string; i: number;
  phase: Phase;
  yaw: number;
  /** Ground speed now (m/s; 0 standing or seated). */
  speed: number;
  /** What they are doing where they stand (null while walking, arriving or gone). */
  doing: Doing | null;
  /** The spot held (a meeting point or an activity), kept from the moment they set off for it. */
  spot: LifeSpot | null;
  /** On the spot's seat. */
  seated: boolean;
  /** Seconds left in the phase (standing phases), the points left to walk through (walking ones). */
  t: number; path: Pt[];
  /** Activities left before leaving, seconds here since arriving, the phases gone through this visit (tests, debug). */
  rounds: number; stay: number; trail: Phase[];
  pace: number;
  rand: () => number;
}
export interface Host {
  /** The way on foot from a to b, as points to walk through (the last is b); default: straight there. */
  route?(a: Pt, b: Pt): Pt[] | null;
  /** May this person take this spot now (a seat somebody sits on, a spot the player stands on)? Default: yes. */
  claim?(spot: LifeSpot, who: string): boolean;
  release?(spot: LifeSpot, who: string): void;
}

const between = (r: () => number, [a, b]: readonly [number, number]) => a + (b - a) * r();

export class Routines {
  readonly people: Person[] = [];
  private taken = new Map<string, string>();
  private arriveT = 0; private leaveT = 0;
  private life: () => number;

  constructor(readonly plan: LifePlan, readonly quality: LifeQuality, private host: Host = {}) {
    // as many people as the best window asks for, one stream each: who they are never depends on the order things happen in
    for (let i = 0; i < plan.capacity[quality]; i++) {
      const id = `${plan.id}:p${i}`, rand = streamOf(hashOf(id));
      this.people.push({ id, i, phase: 'off', x: 0, z: 0, yaw: 0, speed: 0, doing: null, spot: null, seated: false, t: between(rand, AWAY) * rand(), path: [], rounds: 0, stay: 0, trail: [], pace: between(rand, WALK_SPEED), rand });
    }
    this.life = streamOf(hashOf(`${plan.id}:life`));
  }

  get live() { let n = 0; for (const p of this.people) if (p.phase !== 'off') n++; return n; }
  /** People who count toward the hour's number (those already on their way out do not). */
  private get staying() { let n = 0; for (const p of this.people) if (p.phase !== 'off' && p.phase !== 'leave') n++; return n; }
  target(hour: number) { return Math.min(this.people.length, lifeBudget(this.plan, this.quality, hour).people); }

  private set(p: Person, phase: Phase) { p.phase = phase; p.trail.push(phase); }
  private free(p: Person) { if (!p.spot) return; this.taken.delete(p.spot.id); this.host.release?.(p.spot, p.id); p.spot = null; p.seated = false; }
  /** A free spot for this person (their own order of preference, so the same people like the same corners), held from now. */
  private pick(p: Person, list: readonly LifeSpot[], hour: number, not?: Doing | null): LifeSpot | null {
    const n = list.length; if (!n) return null;
    const start = Math.floor(p.rand() * n);
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < n; k++) {
      const s = list[(start + k) % n];
      if (this.taken.has(s.id) || !spotOpen(s, hour) || (pass === 0 && not && s.kind === not)) continue;
      if (this.host.claim && !this.host.claim(s, p.id)) continue;
      this.taken.set(s.id, p.id);
      return s;
    }
    return null;
  }
  private walk(p: Person, to: Pt, phase: 'walk' | 'leave') {
    const path = this.host.route?.(p, to) ?? [{ x: to.x, z: to.z }];
    p.path = path.map(q => ({ x: q.x, z: q.z })); p.doing = null; p.speed = p.pace; p.seated = false;
    this.set(p, phase);
  }
  private entry(p: Person): Pt { const e = this.plan.entries; return e[Math.floor(p.rand() * e.length) % e.length]; }
  private gone(p: Person) { this.free(p); this.set(p, 'off'); p.speed = 0; p.doing = null; p.path = []; p.t = between(p.rand, AWAY); p.stay = 0; }
  private leave(p: Person) {
    this.free(p);
    // out by the nearest way
    let best = this.plan.entries[0], bd = Infinity;
    for (const e of this.plan.entries) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
    this.walk(p, best, 'leave');
  }
  private arrive(p: Person) {
    const e = this.entry(p);
    p.x = e.x; p.z = e.z; p.speed = 0; p.doing = null; p.trail = []; p.stay = 0;
    p.rounds = 1 + Math.floor(p.rand() * 3); p.t = between(p.rand, ARRIVE_BEAT);
    this.set(p, 'arrive');
  }
  /** At the end of a walk: on the spot, doing what it is for. */
  private settleOn(p: Person, s: LifeSpot, gather: boolean) {
    p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.speed = 0; p.path = [];
    p.doing = gather ? 'talk' : s.kind; p.seated = !gather && s.kind === 'sit';
    p.t = between(p.rand, gather ? GATHER_STAY : STAY[s.kind]);
    this.set(p, gather ? 'gather' : 'interact');
  }
  /** Off to the next thing: an activity while some are left and a spot is free, else out. */
  private next(p: Person, hour: number) {
    const was = p.spot?.kind ?? null, gathered = p.phase === 'gather';
    this.free(p);
    if (p.rounds <= 0) { this.leave(p); return; }
    const s = this.pick(p, this.plan.spots, hour, gathered ? null : was);
    if (!s) { this.leave(p); return; }
    p.rounds--; p.spot = s;
    this.walk(p, s, 'walk');
  }

  /**
   * One step of everyone's routine. `hour`: the city's; `dt`: real seconds (a city hour is a real minute, a visit a couple of them).
   * People come one at a time while fewer than the hour asks for are there, and the ones who have been there longest are sent home, one at a
   * time, when more are.
   */
  step(dt: number, hour: number) {
    const want = this.target(hour);
    this.arriveT -= dt; this.leaveT -= dt;
    let staying = this.staying;
    if (staying > want && this.leaveT <= 0) {
      let old: Person | null = null;
      for (const p of this.people) if ((p.phase === 'gather' || p.phase === 'interact') && (!old || p.stay > old.stay)) old = p;
      if (old) { this.leave(old); this.leaveT = LEAVE_EVERY; staying--; }
    }
    for (const p of this.people) {
      if (p.phase === 'off') {
        p.t -= dt;
        if (p.t <= 0 && staying < want && this.arriveT <= 0) { this.arrive(p); this.arriveT = between(this.life, ARRIVE_EVERY); staying++; }
        continue;
      }
      p.stay += dt;
      if (p.phase === 'arrive') {
        if ((p.t -= dt) > 0) continue;
        const g = this.pick(p, this.plan.gathers, hour);
        if (g) { p.spot = g; this.walk(p, g, 'walk'); } else this.next(p, hour);
      } else if (p.phase === 'walk' || p.phase === 'leave') {
        if (!this.advance(p, dt)) continue;
        if (p.phase === 'leave') this.gone(p);
        else if (p.spot) this.settleOn(p, p.spot, this.plan.gathers.includes(p.spot));
        else this.leave(p);
      } else if ((p.t -= dt) <= 0) this.next(p, hour);                       // gather, interact
    }
  }
  /** Walks a person along their path; true once at its end. */
  private advance(p: Person, dt: number): boolean {
    let left = p.pace * dt;
    p.speed = p.pace;
    while (p.path.length) {
      const to = p.path[0], dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) p.yaw = Math.atan2(dx, dz);
      if (d > left) { p.x += (dx / d) * left; p.z += (dz / d) * left; return false; }
      p.x = to.x; p.z = to.z; left -= d; p.path.shift();
    }
    p.speed = 0;
    return true;
  }

  /**
   * The place as it is at this hour, at once (the player walks in, the hour is set): the hour's people already at a meeting point or busy, part
   * of the way through what they do; nobody walks in all together and nobody stays when the place is empty.
   */
  settle(hour: number) {
    for (const p of this.people) if (p.phase !== 'off') { this.free(p); p.phase = 'off'; p.speed = 0; p.doing = null; p.path = []; p.t = between(p.rand, AWAY) * p.rand(); }
    const want = this.target(hour);
    let n = 0;
    for (const p of this.people) {
      if (n >= want) break;
      const gather = p.rand() < 0.25, s = this.pick(p, gather ? this.plan.gathers : this.plan.spots, hour) ?? this.pick(p, gather ? this.plan.spots : this.plan.gathers, hour);
      if (!s) continue;
      const g = this.plan.gathers.includes(s);
      p.spot = s; p.trail = ['arrive', 'walk']; p.stay = 20 + p.rand() * 60; p.rounds = Math.floor(p.rand() * 3);
      this.settleOn(p, s, g);
      p.t *= 0.15 + 0.85 * p.rand();
      n++;
    }
    this.arriveT = between(this.life, ARRIVE_EVERY); this.leaveT = LEAVE_EVERY;
  }
  /** Everybody gone, every spot and seat given back (the venue is taken down). */
  clear() { for (const p of this.people) { this.free(p); p.phase = 'off'; p.speed = 0; p.doing = null; p.path = []; } this.taken.clear(); }
  /** Who holds a spot (debug, tests). */
  holder(spotId: string) { return this.taken.get(spotId) ?? null; }
  counts(): Record<Phase, number> {
    const c: Record<Phase, number> = { off: 0, arrive: 0, walk: 0, gather: 0, interact: 0, leave: 0 };
    for (const p of this.people) c[p.phase]++;
    return c;
  }
}

// ------------------------------------------------------------------ keeping out of the way
export interface KeepOut extends Pt { r: number; why: string }
/** Nobody stands within this of a door or a way in or out (m), of any other anchor the player walks to, or of another spot. */
export const CLEAR_DOOR = 1.7, CLEAR_ANCHOR = 1.25, CLEAR_SPOT = 0.75;
/** The spots of a plan that stand in something's way: a keep-out disc (doors, anchors, the people already there), each other, or a way in. Seats are where the furniture is: only the standing spots are held to it. */
export function spotsInTheWay(plan: Pick<LifePlan, 'gathers' | 'spots' | 'entries'>, keep: readonly KeepOut[]): { id: string; why: string }[] {
  const out: { id: string; why: string }[] = [], all = [...plan.gathers, ...plan.spots].filter(s => !s.seat);
  for (const s of all) {
    for (const k of keep) if (Math.hypot(s.x - k.x, s.z - k.z) < k.r) out.push({ id: s.id, why: k.why });
    for (const e of plan.entries) if (Math.hypot(s.x - e.x, s.z - e.z) < CLEAR_DOOR) out.push({ id: s.id, why: 'entry' });
    for (const o of all) if (o !== s && o.id > s.id && Math.hypot(s.x - o.x, s.z - o.z) < CLEAR_SPOT) out.push({ id: s.id, why: `spot ${o.id}` });
  }
  return out;
}
/** Where a standing person is drawn when the player comes within `r` of them: pushed out to `r` from the player (they step aside and come back). */
export function stepAside(x: number, z: number, px: number, pz: number, r = 0.85): Pt {
  const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
  if (d >= r) return { x, z };
  const ux = d < 1e-3 ? 1 : dx / d, uz = d < 1e-3 ? 0 : dz / d;
  return { x: px + ux * r, z: pz + uz * r };
}
