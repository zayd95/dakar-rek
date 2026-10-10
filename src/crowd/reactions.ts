/**
 * Crowd reactions (docs/CROWD.md): pure data and functions, no Three.js, no DOM (tested in tests/crowd.test.ts).
 *
 * A crowd is a set of people on slots (seats on the tiers, places along a street…), tagged in groups ('left' supporters,
 * 'tier0', 'queue'…). Events make a group react: `crowd.react(group, kind)`. Each member who joins in (a share of the
 * group, the keen ones more often) starts after a short stagger, holds the reaction a few seconds, then settles back.
 * A stronger reaction overrides a weaker one (the fall over a grab), never the other way round while it lasts.
 *
 * The same body pose drives every level of detail: the instanced figures' vertex rig (src/crowd/rig.ts) and the arms of
 * the full humanoids next to the player (src/crowd/crowd.ts), so a person keeps the same gesture when the LOD changes.
 */
export type ReactionKind = 'applause' | 'shout' | 'standUp' | 'grab' | 'fall' | 'celebrate';
export const REACTION_KINDS: readonly ReactionKind[] = ['applause', 'shout', 'standUp', 'grab', 'fall', 'celebrate'];

/**
 * A pose of the crowd rig. Arms hang from the shoulders in the rest geometry; the rig turns each arm by `spread` (away
 * from the body), then `pitch` (raised forward: 0 hanging, π/2 forward, π straight up), then `yaw` (towards the middle,
 * for clapping), and bends the forearm forward at the elbow by `elbow`. Character space: +x the person's left, +y up,
 * +z forward. Oscillations: `yawAmp` (clapping), `pitchAmp` (pumping, waving, swinging while walking) at `freq` rad/s,
 * the two arms `sideOff` apart; `bounce` (m, hops), `lean` (rad, upper body forward), `walk` (rad, leg swing).
 */
export interface RigPose {
  pitch: number; spread: number; yaw: number; elbow: number;
  yawAmp: number; pitchAmp: number; freq: number; sideOff: number;
  bounce: number; lean: number; walk: number;
}
const P = (o: Partial<RigPose>): RigPose => ({ pitch: 0.06, spread: 0.1, yaw: 0, elbow: 0.12, yawAmp: 0, pitchAmp: 0, freq: 6, sideOff: 0, bounce: 0, lean: 0, walk: 0, ...o });

/** Seated at rest: hands on the knees. */
export const REST_SIT: RigPose = P({ pitch: 0.35, spread: 0.1, elbow: 0.9 });
/** Standing at rest: arms along the body. */
export const REST_STAND: RigPose = P({});
/** Walking at `speed` m/s: legs and arms swing in opposition, a small bob each step. */
export function walkPose(speed: number): RigPose {
  const k = Math.min(1, speed / 1.4);
  return P({ pitchAmp: 0.32 * k, sideOff: Math.PI / 2, walk: 0.36 * k, bounce: 0.025 * k, freq: Math.max(2, 4.4 * speed) });
}

export interface ReactionDef {
  /** Share of the group that joins in by default. */
  share: number;
  /** How long a member holds it (s, each ×0.75–1.25). */
  seconds: number;
  /** Members start within this many seconds (a ripple, not a single jolt). */
  stagger: number;
  /** Seated members stand up for it. */
  stand: boolean;
  /** Precedence over a running reaction (higher wins). */
  rank: number;
  /** Loudness 0–1 (crowd sound, excitement). */
  voice: number;
  /** The pose seated and standing. */
  sit: RigPose;
  up: RigPose;
}

const CLAP = { pitch: 0.95, spread: 0, yaw: 0.25, elbow: 0.95, yawAmp: 0.28, freq: 15 };
const FISTS = { pitch: 0.75, spread: 0.05, yaw: 0.35, elbow: 1.9 };
const HEAD = { pitch: 2.55, spread: 0.55, yaw: 0.15, elbow: 2.0 };
export const REACTIONS: Record<ReactionKind, ReactionDef> = {
  /** Clapping, seated or standing. */
  applause: { share: 0.7, seconds: 3.5, stagger: 0.5, stand: false, rank: 2, voice: 0.5, sit: P(CLAP), up: P(CLAP) },
  /** On their feet, fists pumping (supporters calling their wrestler). */
  shout: {
    share: 0.5, seconds: 2.4, stagger: 0.4, stand: true, rank: 3, voice: 0.7,
    sit: P({ pitch: 2.3, spread: 0.25, yaw: 0.1, elbow: 0.7, pitchAmp: 0.35, freq: 9, sideOff: 0.6, lean: 0.08 }),
    up: P({ pitch: 2.3, spread: 0.25, yaw: 0.1, elbow: 0.7, pitchAmp: 0.35, freq: 9, sideOff: 0.6, lean: 0.08, bounce: 0.04 }),
  },
  /** Up to see better, craning forward. */
  standUp: { share: 0.6, seconds: 4, stagger: 0.8, stand: true, rank: 2, voice: 0.3, sit: P({ pitch: 0.15, elbow: 0.4, lean: 0.12 }), up: P({ pitch: 0.15, elbow: 0.4, lean: 0.12 }) },
  /** The wrestlers grab each other: leaning in, fists at the chin. */
  grab: { share: 0.55, seconds: 2.2, stagger: 0.25, stand: false, rank: 1, voice: 0.25, sit: P({ ...FISTS, lean: 0.22 }), up: P({ ...FISTS, lean: 0.15 }) },
  /** A wrestler goes down: everyone leaps up, hands on the head. */
  fall: { share: 0.85, seconds: 3.5, stagger: 0.3, stand: true, rank: 4, voice: 0.9, sit: P({ ...HEAD, lean: -0.05 }), up: P({ ...HEAD, lean: -0.05 }) },
  /** Victory: arms up, waving, hopping. */
  celebrate: {
    share: 0.85, seconds: 6, stagger: 0.5, stand: true, rank: 5, voice: 1,
    sit: P({ pitch: 2.75, spread: 0.4, elbow: 0.25, pitchAmp: 0.25, sideOff: 1.2, freq: 7 }),
    up: P({ pitch: 2.75, spread: 0.4, elbow: 0.25, pitchAmp: 0.25, sideOff: 1.2, freq: 7, bounce: 0.12 }),
  },
};

// ------------------------------------------------------------------ one member's reaction
export interface ReactState {
  /** The reaction shown now (null: at rest). */
  kind: ReactionKind | null;
  left: number;
  /** A reaction waiting for its stagger delay. */
  next: ReactionKind | null;
  wait: number;
  nextLeft: number;
}
export const restState = (): ReactState => ({ kind: null, left: 0, next: null, wait: 0, nextLeft: 0 });

/** Offer a reaction; refused while a stronger one is shown (with more than a moment left) or already queued. */
export function offer(s: ReactState, kind: ReactionKind, delay: number, seconds: number): boolean {
  const r = REACTIONS[kind].rank;
  if (s.kind && s.left > 0.6 && REACTIONS[s.kind].rank > r) return false;
  if (s.next && REACTIONS[s.next].rank > r) return false;
  if (delay <= 0) { s.kind = kind; s.left = seconds; s.next = null; s.wait = 0; }
  else { s.next = kind; s.wait = delay; s.nextLeft = seconds; }
  return true;
}
/** Advance by dt; true when the shown reaction changed (started, replaced or ended). */
export function step(s: ReactState, dt: number): boolean {
  let changed = false;
  if (s.kind) { s.left -= dt; if (s.left <= 0) { s.kind = null; s.left = 0; changed = true; } }
  if (s.next) { s.wait -= dt; if (s.wait <= 0) { s.kind = s.next; s.left = s.nextLeft; s.next = null; s.wait = 0; changed = true; } }
  return changed;
}
export function calm(s: ReactState) { const was = !!s.kind; s.kind = null; s.left = 0; s.next = null; s.wait = 0; return was; }

/** Standing or seated now: people without a seat always stand; seated ones stand for some reactions. */
export const standingFor = (seatedSlot: boolean, kind: ReactionKind | null) => !seatedSlot || (!!kind && REACTIONS[kind].stand);

/** The pose to show: the reaction's, the walk, or rest. */
export function poseFor(kind: ReactionKind | null, standing: boolean, speed = 0, mood: Mood = 'rest', bpm = 120): RigPose {
  if (speed > 0.2) return walkPose(speed);
  if (kind) return standing ? REACTIONS[kind].up : REACTIONS[kind].sit;
  if (mood === 'dance' && standing) return dancePose(bpm);
  return standing ? REST_STAND : REST_SIT;
}

/** What a member does between reactions: rest, or dance (a dance floor, sabar dancers by the drums). */
export type Mood = 'rest' | 'dance';
/** Dancing on the beat: one hop per beat, the arms pumping in turn, a small step. */
export function dancePose(bpm: number): RigPose {
  return P({ pitch: 1.1, spread: 0.3, elbow: 1.3, pitchAmp: 0.5, sideOff: Math.PI / 2, bounce: 0.07, lean: 0.06, walk: 0.12, freq: (Math.PI * bpm) / 60 });
}

/** Ease `cur` towards `to` (k in 0–1); true while still moving. */
export function easePose(cur: RigPose, to: RigPose, k: number): boolean {
  let moving = false;
  for (const key in to) {
    const a = cur[key as keyof RigPose], b = to[key as keyof RigPose];
    if (key === 'freq' || key === 'sideOff') { cur[key] = b; continue; }   // rates switch at once (amplitudes ease)
    const v = Math.abs(b - a) < 0.004 ? b : a + (b - a) * k;
    cur[key as keyof RigPose] = v; if (v !== b) moving = true;
  }
  return moving;
}

/**
 * Who joins in: for each of `n` members (keenness `temper[i]`, around 1), a delay and a duration, or null.
 * `rand` is the crowd's seeded generator, so a reaction is reproducible in the tests.
 */
export function plan(n: number, kind: ReactionKind, rand: () => number, o: { share?: number; seconds?: number; temper?: (i: number) => number } = {}) {
  const def = REACTIONS[kind], share = o.share ?? def.share, seconds = o.seconds ?? def.seconds;
  const out: ({ delay: number; seconds: number } | null)[] = [];
  for (let i = 0; i < n; i++) {
    const p = share >= 1 ? 1 : Math.min(1, share * (o.temper?.(i) ?? 1));     // share 1: everyone
    out.push(rand() < p ? { delay: def.stagger * Math.pow(rand(), 1.6), seconds: seconds * (0.75 + 0.5 * rand()) } : null);
  }
  return out;
}

// ------------------------------------------------------------------ arm directions (the rig's maths, for the near bodies)
type V = [number, number, number];
const rotX = (v: V, a: number): V => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const rotY = (v: V, a: number): V => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const rotZ = (v: V, a: number): V => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };

/** The angles of one arm at time t (side +1 left, −1 right), exactly as the vertex rig computes them. */
export function armAngles(p: RigPose, side: 1 | -1, t: number, phase: number) {
  const w = t * p.freq + phase;
  return {
    pitch: p.pitch + p.pitchAmp * Math.sin(w + side * p.sideOff),
    yaw: p.yaw + p.yawAmp * (0.5 + 0.5 * Math.sin(w)),
    spread: p.spread, elbow: p.elbow,
  };
}
/** Unit directions of the upper arm and the forearm (shoulder → elbow → hand) in character space. */
export function armDirs(p: RigPose, side: 1 | -1, t: number, phase: number): { upper: V; fore: V } {
  const a = armAngles(p, side, t, phase);
  const chain = (v: V) => rotY(rotX(rotZ(v, side * a.spread), -a.pitch), -side * a.yaw);
  return { upper: chain([0, -1, 0]), fore: chain(rotX([0, -1, 0], -a.elbow)) };
}

// ------------------------------------------------------------------ how loud a group is
/** Excitement per group: each reaction adds its voice × the share who joined in; it fades over a few seconds. */
export class Excitement {
  private m = new Map<string, number>();
  add(group: string, v: number) { this.m.set(group, Math.min(1, (this.m.get(group) ?? 0) + v)); }
  level(group: string) { return this.m.get(group) ?? 0; }
  decay(dt: number) { const k = Math.exp(-dt / 2.5); for (const [g, v] of this.m) this.m.set(g, v * k < 0.01 ? 0 : v * k); }
}
