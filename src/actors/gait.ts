/**
 * Walking and running on foot for the shared humanoid (src/actors/humanoid.ts), computed on its rig instead of
 * replaying the exported Walk and Run clips (which slide on the ground at every speed but one, and whose Run bends the
 * knees backwards). Pure numbers, no Three.js: src/actors/gaitRig.ts turns them into the bones' rotations.
 *
 * - A foot is put down where the body will pass over it and stays on that spot of the ground while the body goes by
 *   (heel, flat, then up on the ball): no sliding, at any speed, while turning, starting or stopping.
 * - The cadence and the step follow the ground speed (`walkParams`, `runParams`): a walk up to 2.3 m/s, a run above
 *   2.6 m/s (the two are blended over 0.3 s, with some hysteresis in between).
 * - The swing foot lifts as the knee bends, then reaches forward and comes down heel first (walking) or under the knee
 *   (running, the heel kicked up behind first). Knee and hip flexion come from the feet's paths (two-bone IK).
 * - The pelvis turns, tilts and sways a little with the steps; the trunk turns the other way and leans with the speed;
 *   the arms swing against the legs with the elbows bent (a lot when running); the head stays level.
 * - Standing still, the feet stay planted: when the body turns on the spot or stops with the feet apart, a foot that
 *   ends up too far from its place steps back under the hip (no moonwalk).
 *
 * Character space: metres of the rig (before the body's scale), +x the character's left, +y up, +z forward, origin
 * under the hips on the ground of the rest pose. A foot's phase `lam` counts cycles since it last landed (0: it lands):
 * on the ground while lam < duty, swinging after. The two feet are half a cycle apart.
 */

/** The rig's legs and feet (public/assets/character_v4.glb, rest pose = Idle; checked against the GLB in tests/gait.test.ts). */
export const RIG = {
  thigh: 0.4301, shin: 0.4305,
  /** Hip joints: ±hipX from the pelvis centre, hipY above the ground origin when standing. */
  hipX: 0.1, hipY: 0.95,
  /** The ankle standing (the left one; the right one is mirrored). */
  ankle: { x: 0.11, y: 0.09, z: -0.02 },
  /** From the heel's and the ball's contact points to the ankle, the foot flat. */
  heelToAnkle: { z: 0.035, y: 0.1 }, ballToAnkle: { z: -0.12, y: 0.1 },
  heelToBall: 0.155,
  /** The foot bone points this much below the sole's line (rad). */
  footTilt: -0.3587,
} as const;
/** The sole's heel and ball contact points in the foot bone's own frame (either foot), for the checks' sliding measure. */
export const SOLE = { heel: [0, 0.0023, 0.1059], ball: [0, 0.1475, 0.0515] } as const;
/** Level of the soles in the rest pose (character space). */
export const GROUND = RIG.ankle.y - RIG.heelToAnkle.y;
/** Longest hip-to-ankle distance used (the knee never locks fully straight). */
export const REACH = (RIG.thigh + RIG.shin) * 0.999;
/** Above this ground speed (m/s) the body walks or runs; below the stop speed it stands. */
export const MOVE_FROM = 0.35, STOP_BELOW = 0.25;
/** Walk → run above RUN_ABOVE m/s, run → walk below WALK_BELOW. */
export const RUN_ABOVE = 2.6, WALK_BELOW = 2.3;

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ speed → gait

export interface GaitParams {
  /** Steps per second (both feet) and the step's length (m): cadence × step = speed. */
  cadence: number; step: number;
  /** Share of a cycle each foot spends on the ground. */
  duty: number;
  /** Middle of the ankle's travel under the body while on the ground (z, m; negative: behind the hips). */
  centre: number;
  /** Half the spacing of the feet (m). */
  width: number;
  /** Foot pitch on the ground (rad, + toes up): at the landing, flat from `footFlat` to `heelOff` (shares of the stance), then up on the ball to `toeOff`. */
  heelStrike: number; footFlat: number; heelOff: number; toeOff: number;
  /** Walking swing: early lift of the ankle as the knee bends, clearance at mid-swing (m). */
  lift: number; clear: number;
  /** Running swing: the heel's rise behind, how far forward the knee carries the foot (m). */
  kick: number; drive: number;
  /** The ankle's angle against the shin in mid-swing (rad, + toes down). */
  ankleSwing: number;
  /** Pelvis height and its oscillation (+: highest at mid-stance, walking; −: lowest at mid-stance, running), side sway (m). */
  hipY: number; bob: number; sway: number;
  /** Pelvis turn and tilt with the steps, the trunk's forward lean (rad). */
  yaw: number; roll: number; lean: number;
  /** Arm swing (rad, either way of `armBias`), elbow bend and its extra bend forward (rad). */
  arm: number; armBias: number; elbow: number; elbowSwing: number;
}
export const newParams = (): GaitParams => ({
  cadence: 0, step: 0, duty: 0, centre: 0, width: 0, heelStrike: 0, footFlat: 0, heelOff: 0, toeOff: 0, lift: 0, clear: 0, kick: 0, drive: 0,
  ankleSwing: 0, hipY: 0, bob: 0, sway: 0, yaw: 0, roll: 0, lean: 0, arm: 0, armBias: 0, elbow: 0, elbowSwing: 0,
});
const KEYS = Object.keys(newParams()) as (keyof GaitParams)[];

/**
 * Walking: the step grows with the speed's square root or so (0.70 m at 1.4 m/s, 120 steps a minute; 0.82 m at
 * 2.2 m/s, 161 a minute), the double support shortens, the arms and the pelvis move more.
 */
export function walkParams(v: number, o: GaitParams = newParams()): GaitParams {
  const w = clamp(v, 0, 2.6), k = Math.min(1, w / 1.4);
  const step = w <= 1.4 ? 0.7 * Math.pow(w / 1.4, 0.55) : 0.7 + (0.12 * (w - 1.4)) / 0.8;
  o.cadence = Math.max(0.9, w / Math.max(0.01, step)); o.step = w / o.cadence;
  o.duty = 0.64 - 0.04 * w;
  o.centre = -0.05 * k; o.width = 0.085 - 0.01 * w;
  o.heelStrike = (6 + 9 * Math.min(1, w / 1.6)) * DEG; o.footFlat = 0.16; o.heelOff = 0.55 - 0.08 * Math.min(1, w / 2.2);
  o.toeOff = -(14 + 26 * Math.min(1, w / 1.8)) * DEG;
  o.lift = 0.035 + 0.035 * Math.min(1, w / 1.6); o.clear = 0.022; o.kick = 0; o.drive = 0; o.ankleSwing = -6 * DEG;
  o.sway = 0.03 - 0.005 * w;
  // the hips ride highest over the planted foot and lowest when both feet are down: as low as the legs need then
  const D = w * o.duty * (2 / o.cadence), zh = landingZ(w, o);
  const hs = ankleOffset(o.heelStrike, OFF), hsz = zh + hs.z, hsy = GROUND + hs.y;
  const to = ankleOffset(o.toeOff, OFF2), toz = zh + RIG.heelToBall - D + to.z, toy = GROUND + to.y;
  const low = Math.min(hsy + Math.sqrt(Math.max(0, REACH * REACH - hsz * hsz)), toy + Math.sqrt(Math.max(0, REACH * REACH - toz * toz)));
  const top = 0.946, bottom = Math.min(top - 0.008, low);
  o.hipY = (top + bottom) / 2; o.bob = (top - bottom) / 2;
  o.yaw = (2 + 2.5 * k) * DEG; o.roll = (1.5 + 1.5 * k) * DEG; o.lean = (1.5 + 1.2 * w) * DEG;
  o.arm = (5 + 10 * w / 1.4) * DEG; o.armBias = -4 * DEG; o.elbow = (10 + 4 * w) * DEG; o.elbowSwing = 12 * DEG;
  return o;
}
/**
 * Running: 174 steps a minute and 1.45 m steps at 4.2 m/s (a light, relaxed run), 192 and 2.19 m at 7 m/s; a short
 * contact under the body (the foot lands just ahead of the hips, nearly flat), the heel kicked up behind, the knee
 * driven forward, elbows bent near 90°, the trunk leaning a little more with the speed.
 */
export function runParams(v: number, o: GaitParams = newParams()): GaitParams {
  const w = Math.max(v, 1.5);
  o.cadence = 2.45 + 0.107 * w; o.step = w / o.cadence;
  o.duty = clamp(((0.64 + 0.016 * w) / w) * o.cadence * 0.5, 0.16, 0.42);
  o.centre = -0.1 - 0.005 * w; o.width = 0.05 - 0.002 * w;
  o.heelStrike = Math.max(0, 8 - w) * DEG; o.footFlat = 0.2; o.heelOff = 0.4; o.toeOff = -(35 + 3 * w) * DEG;
  o.lift = 0; o.clear = 0; o.kick = 0.22 + 0.05 * w; o.drive = 0.12 + 0.03 * w; o.ankleSwing = 12 * DEG;
  o.hipY = 0.928; o.bob = -(0.016 + 0.003 * w); o.sway = 0.012;
  o.yaw = (5 + 0.4 * w) * DEG; o.roll = 3 * DEG; o.lean = (3 + 0.9 * w) * DEG;
  o.arm = (16 + 3.2 * w) * DEG; o.armBias = 2 * DEG; o.elbow = (74 + 2.2 * w) * DEG; o.elbowSwing = 14 * DEG;
  return o;
}
export function mixParams(a: GaitParams, b: GaitParams, t: number, o: GaitParams = newParams()): GaitParams {
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
/** The gait for a ground speed (the run share `run`: 0 walk … 1 run; by default from the speed). */
export function gaitParams(v: number, run = v > RUN_ABOVE ? 1 : v < WALK_BELOW ? 0 : (v - WALK_BELOW) / (RUN_ABOVE - WALK_BELOW), o: GaitParams = newParams()): GaitParams {
  return mixParams(walkParams(v), runParams(v), run, o);
}

/** Foot pitch on the ground at a share `q` (0…1) of the stance. */
export function stancePitch(q: number, p: GaitParams): number {
  if (q < p.footFlat) return p.heelStrike * (1 - smoothstep(0, p.footFlat, q));
  if (q < p.heelOff) return 0;
  return p.toeOff * Math.pow(clamp((q - p.heelOff) / (1 - p.heelOff), 0, 1), 1.6);
}
/** The ankle above a contact point of the sole (heel when the toes are up or flat, ball when the heel is up): [forward, up]. */
export function ankleOffset(pitch: number, out: { z: number; y: number }) {
  const o = pitch >= 0 ? RIG.heelToAnkle : RIG.ballToAnkle, c = Math.cos(pitch), s = Math.sin(pitch);
  out.z = o.z * c - o.y * s; out.y = o.z * s + o.y * c;
  return out;
}
const OFF = { z: 0, y: 0 }, OFF2 = { z: 0, y: 0 };
/**
 * Where the heel lands, ahead of the hips (z, m), for the ground speed `v`: the stance lasts duty × cycle, the body goes
 * v × that over the planted foot, and the ankle's travel is centred on `centre`.
 */
export function landingZ(v: number, p: GaitParams): number {
  const D = v * p.duty * (2 / p.cadence);
  const hs = ankleOffset(p.heelStrike, OFF).z, to = ankleOffset(Math.min(-1e-4, p.toeOff), OFF2).z;
  return p.centre - (hs + RIG.heelToBall - D + to) / 2;
}

// ------------------------------------------------------------------ two-bone IK

/**
 * The knee of a leg from the hip joint to the ankle, bending towards `fx, fz` (the foot's forward, horizontal). If the
 * ankle is out of reach the leg points at it, nearly straight, and the ankle written back is where the leg ends.
 */
export function solveKnee(hx: number, hy: number, hz: number, a: { x: number; y: number; z: number }, fx: number, fz: number, knee: { x: number; y: number; z: number }) {
  let dx = a.x - hx, dy = a.y - hy, dz = a.z - hz;
  let d = Math.hypot(dx, dy, dz);
  const A = RIG.thigh, B = RIG.shin;
  if (d < 1e-6) { dx = 0; dy = -1; dz = 0; d = 1e-6; }
  const ux = dx / d, uy = dy / d, uz = dz / d;
  if (d > REACH) { d = REACH; a.x = hx + ux * d; a.y = hy + uy * d; a.z = hz + uz * d; }
  if (d < Math.abs(A - B) + 0.05) { d = Math.abs(A - B) + 0.05; a.x = hx + ux * d; a.y = hy + uy * d; a.z = hz + uz * d; }
  // the bending direction: the foot's forward, made perpendicular to the hip-ankle line
  const dot = fx * ux + fz * uz;
  let nx = fx - dot * ux, ny = -dot * uy, nz = fz - dot * uz;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-6) { nx = 0; ny = 0; nz = 1; } else { nx /= nl; ny /= nl; nz /= nl; }
  const ca = (A * A + d * d - B * B) / (2 * A * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  knee.x = hx + A * (ca * ux + sa * nx); knee.y = hy + A * (ca * uy + sa * ny); knee.z = hz + A * (ca * uz + sa * nz);
  return knee;
}

// ------------------------------------------------------------------ the feet and the body over them

export class Foot {
  /** On the ground or swinging; a step taken while standing (back under the hip). */
  swing = false; settle = false;
  /** Phase since it last landed (cycles), its phase at toe-off; swing progress 0…1 and, when timed, its length (s). */
  lam = 0; lamTo = 0; s = 0; dur = 0.3;
  /** On the ground: the heel's contact point (parent space), the foot's heading (parent yaw), its pitch. */
  hx = 0; hz = 0; hyaw = 0; pitch = 0;
  /** Swing: where the ankle left from (character space), the foot's pitch and heading then; where it goes. */
  x0 = 0; y0 = 0; z0 = 0; p0 = 0; yaw0 = 0; tx = 0; ty = 0; tz = 0; tyaw = 0; tpitch = 0;
  /** Output, character space: the ankle, the foot's heading (rad), its pitch over the ground, the ankle's angle against the
   * shin and how much of it to use (swinging), whether it is down. */
  ax = 0; ay = 0; az = 0; yaw = 0; alpha = 0; shinW = 0; planted = true;
  /** Highest the hips may be for this leg to reach its ankle (last computed while planted, kept at toe-off). */
  lim = 1; limTo = 1;
  /** Checks: metres the contact point slid because the leg could not reach it. */
  slipped = 0;
  constructor(readonly side: 1 | -1) {}
}

export class GaitState {
  /** Left then right. */
  readonly feet: [Foot, Foot] = [new Foot(1), new Foot(-1)];
  readonly p = newParams();
  private pw = newParams(); private pr = newParams();
  private bx = 0; private bz = 0; private yaw = 0; private c = 1; private s = 0; private k = 1;
  private vx = 0; private vz = 0; private ready = false; private wait = 0;
  /** Ground speed (character space, m/s of the rig) and its direction; the run share; walking or running; how much (0…1). */
  v = 0; ux = 0; uz = 1; run = 0; private runTarget = 0; moving = false; m = 0;
  /** Pelvis (character space): centre, turn, tilt. Trunk: lean, turn (against the pelvis). Arms: swing and elbows (rad). */
  px = 0; py: number = RIG.hipY; pz = 0; pyaw = 0; proll = 0;
  lean = 0; twist = 0; armL = 0; armR = 0; elbowL = 0; elbowR = 0;
  /** How much the legs need the gait while standing still (0: feet at rest under the hips, the Idle clip is as good). */
  stand = 1;
  /** Checks: steps taken (landings) and settling steps. */
  steps = 0; settles = 0;

  /** The left foot's phase (cycles). */
  get phase() { return this.feet[0].lam; }

  /** Stand with the feet under the hips, the body at (x, z) facing `yaw` (parent space), scaled by `scale`. */
  reset(x: number, z: number, yaw: number, scale = 1) {
    this.body(x, z, yaw, scale);
    this.vx = this.vz = 0; this.v = 0; this.moving = false; this.m = 0; this.ready = true; this.wait = 0; this.stand = 1;
    for (const f of this.feet) {
      f.swing = false; f.settle = false; f.lam = 0; f.s = 0; f.pitch = 0; f.planted = true;
      const hz = RIG.ankle.z - RIG.heelToAnkle.z;
      f.hx = this.toParentX(f.side * RIG.ankle.x, hz); f.hz = this.toParentZ(f.side * RIG.ankle.x, hz); f.hyaw = yaw;
      f.ax = f.side * RIG.ankle.x; f.ay = RIG.ankle.y; f.az = RIG.ankle.z; f.yaw = 0; f.alpha = 0; f.shinW = 0;
    }
    this.px = this.pz = this.pyaw = this.proll = 0; this.py = RIG.hipY;
  }
  private body(x: number, z: number, yaw: number, scale: number) {
    this.bx = x; this.bz = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); this.k = scale > 0 ? scale : 1;
  }
  // character space ↔ the parent's (the body group's rotation.y and scale)
  private toParentX(x: number, z: number) { return this.bx + this.k * (x * this.c + z * this.s); }
  private toParentZ(x: number, z: number) { return this.bz + this.k * (-x * this.s + z * this.c); }
  private toCharX(X: number, Z: number) { return ((X - this.bx) * this.c - (Z - this.bz) * this.s) / this.k; }
  private toCharZ(X: number, Z: number) { return ((X - this.bx) * this.s + (Z - this.bz) * this.c) / this.k; }

  /**
   * One frame: the body is at (x, z) facing `yaw` in its parent's space (group.position, group.rotation.y), scaled by
   * `scale`. The ground speed is measured from the body's own motion; `intent` (the caller's speed) only says whether a
   * movement is meant as a run.
   */
  update(dt: number, x: number, z: number, yaw: number, scale = 1, intent = 0) {
    if (!(dt > 0)) return;
    const jump = Math.hypot(x - this.bx, z - this.bz);
    if (!this.ready || dt > 0.5 || jump > Math.max(0.5, 10 * dt)) this.reset(x, z, yaw, scale);       // a jump, not a step
    const a = 1 - Math.exp(-dt / 0.08);
    this.vx += ((x - this.bx) / dt - this.vx) * a; this.vz += ((z - this.bz) / dt - this.vz) * a;
    this.body(x, z, yaw, scale);
    const cvx = (this.vx * this.c - this.vz * this.s) / this.k, cvz = (this.vx * this.s + this.vz * this.c) / this.k;
    const v = Math.hypot(cvx, cvz); this.v = v;
    if (v > 0.05) { this.ux = cvx / v; this.uz = cvz / v; }
    // walk or run (with hysteresis), blended over 0.3 s
    const vs = Math.max(v, v > MOVE_FROM ? intent : 0);
    if (vs > RUN_ABOVE) this.runTarget = 1; else if (vs < WALK_BELOW) this.runTarget = 0;
    this.run += clamp(this.runTarget - this.run, -dt / 0.3, dt / 0.3);
    walkParams(v, this.pw); runParams(v, this.pr); mixParams(this.pw, this.pr, this.run, this.p);
    if (!this.moving && v > MOVE_FROM) this.start();
    else if (this.moving && v < STOP_BELOW) this.stop();
    this.m += clamp((this.moving ? smoothstep(STOP_BELOW, 0.8, v) : 0) - this.m, -dt / 0.25, dt / 0.25);
    const p = this.p, dl = this.moving ? Math.max((dt * p.cadence) / 2, this.hurry(dt)) : 0;
    for (const f of this.feet) this.foot(f, dt, dl);
    if (!this.moving) this.settleFeet(dt);
    this.posture();
    // standing at rest the gait has nothing to add to the Idle clip (skipped: cheaper)
    let off = 0;
    for (const f of this.feet) off = Math.max(off, f.swing ? 1 : Math.hypot(f.ax - f.side * RIG.ankle.x, f.az - RIG.ankle.z, f.ay - RIG.ankle.y) + 0.1 * Math.abs(f.yaw));
    const st = this.moving || this.m > 0 ? 1 : smoothstep(0.004, 0.035, off);
    this.stand = st >= this.stand ? st : Math.max(st, this.stand - dt / 0.15);          // on at once (the pose is the same), off gently
  }

  /**
   * Speeding up (or pushed along faster than the steps): a foot on the ground must leave it before the body has gone
   * past its reach, so the steps quicken — the phase this frame (cycles) that gets it off in time.
   */
  private hurry(dt: number) {
    const p = this.p, v = this.v;
    if (v < 0.05) return 0;
    // how far behind the hips the ankle can be at toe-off (up on the ball), the hips as low as 0.85 m
    const rise = 0.85 - (GROUND + ankleOffset(p.toeOff, OFF).y), behind = Math.sqrt(Math.max(0, REACH * REACH - rise * rise));
    let need = 0;
    for (const f of this.feet) {
      if (f.swing || f.lam >= p.duty) continue;
      const left = f.ax * this.ux + f.az * this.uz + behind;                                // metres before it is out of reach
      need = Math.max(need, ((p.duty - f.lam) * dt * v) / Math.max(0.02, left));
    }
    return need;
  }

  /** From standing: the foot further behind along the way goes first (a foot already stepping carries on). */
  private start() {
    this.moving = true;
    const [L, R] = this.feet, p = this.p;
    const first = L.swing ? L : R.swing ? R : L.ax * this.ux + L.az * this.uz <= R.ax * this.ux + R.az * this.uz ? L : R;
    const other = first === L ? R : L;
    if (first.swing) { first.settle = false; first.lamTo = p.duty; first.lam = p.duty + first.s * (1 - p.duty); }
    else { first.lam = p.duty; this.liftOff(first); }
    other.lam = first.lam - 0.5; if (other.lam < 0) other.lam += 1;
    if (!other.swing && other.lam >= p.duty) other.lam = Math.max(0, p.duty - 0.02);
  }
  /** Stopping: a foot in the air finishes its swing (beside the other one), then the feet stay put. */
  private stop() {
    this.moving = false;
    const p = this.p, T = 2 / p.cadence;
    for (const f of this.feet) if (f.swing) { const rest = clamp(Math.min((1 - f.s) * (1 - p.duty) * T, (1 - f.s) * 0.4), 0.12, 0.3); f.dur = rest / Math.max(0.05, 1 - f.s); }
    this.wait = 0.15;
  }
  private liftOff(f: Foot, settle = false, dur = 0.3) {
    f.swing = true; f.settle = settle; f.lamTo = f.lam; f.s = 0; f.dur = dur;
    f.x0 = f.ax; f.y0 = f.ay; f.z0 = f.az; f.p0 = f.pitch; f.yaw0 = f.yaw; f.limTo = f.lim;
    f.tx = f.ax; f.ty = f.ay; f.tz = f.az; f.tyaw = f.yaw; f.tpitch = f.pitch;
    f.planted = false;
  }
  /** Down: the heel's contact point under the ankle where it came down, `late` seconds ago (within this frame). */
  private land(f: Foot, late = 0) {
    f.swing = false; f.settle = false; f.planted = true; f.pitch = f.tpitch;
    ankleOffset(f.pitch, OFF);
    const off = f.pitch >= 0 ? OFF.z : OFF.z + RIG.heelToBall;
    const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw), back = this.v * late;
    const hx = f.ax - sy * off - this.ux * back, hz = f.az - cy * off - this.uz * back;
    f.hx = this.toParentX(hx, hz); f.hz = this.toParentZ(hx, hz); f.hyaw = this.yaw + f.yaw;
    this.steps++;
  }

  private foot(f: Foot, dt: number, dl: number) {
    const p = this.p;
    if (this.moving) f.lam += dl;
    if (!f.swing) {
      this.stance(f, dt);
      if (this.moving && f.lam >= p.duty) this.liftOff(f);
    } else if (!this.moving || f.settle) f.s = Math.min(1, f.s + dt / f.dur);
    if (!f.swing) return;
    if (this.moving && !f.settle) f.s = clamp((f.lam - f.lamTo) / Math.max(0.05, 1 - f.lamTo), 0, 1);
    this.target(f, dt);
    this.swingPose(f);
    if (this.moving && !f.settle ? f.lam >= 1 : f.s >= 1) {
      let late = 0;
      if (this.moving && !f.settle) { f.lam -= 1; late = (f.lam * 2) / p.cadence; }
      this.land(f, late);
      this.stance(f, dt);
    }
  }

  /** On the ground: the contact point stays where it was put down; the foot rolls from the heel onto the ball. */
  private stance(f: Foot, dt: number) {
    if (this.moving) f.pitch = stancePitch(f.lam / this.p.duty, this.p);
    else f.pitch *= Math.exp(-dt / 0.1);
    let yr = wrap(f.hyaw - this.yaw);
    if (Math.abs(yr) > 0.7) {
      // the body turned too far over it: the foot pivots, on the ball when the heel is up
      yr = Math.sign(yr) * 0.7;
      const yaw = this.yaw + yr, L = this.k * RIG.heelToBall;
      if (f.pitch < 0) { f.hx += L * (Math.sin(f.hyaw) - Math.sin(yaw)); f.hz += L * (Math.cos(f.hyaw) - Math.cos(yaw)); }
      f.hyaw = yaw;
    }
    f.yaw = yr;
    let X = f.hx, Z = f.hz;
    if (f.pitch < 0) { X += this.k * RIG.heelToBall * Math.sin(f.hyaw); Z += this.k * RIG.heelToBall * Math.cos(f.hyaw); }
    ankleOffset(f.pitch, OFF);
    const sy = Math.sin(yr), cy = Math.cos(yr);
    f.ax = this.toCharX(X, Z) + sy * OFF.z; f.az = this.toCharZ(X, Z) + cy * OFF.z; f.ay = GROUND + OFF.y;
    f.alpha = 0; f.shinW = 0; f.planted = true;
  }

  /** Where a swinging foot comes down: ahead along the way when moving, back under its hip when stopping or settling. */
  private target(f: Foot, dt: number) {
    const p = this.p;
    let hx: number, hz: number, yaw: number, pitch: number;
    if (this.moving && !f.settle) {
      const zh = landingZ(this.v, p);
      hx = f.side * p.width + this.ux * zh; hz = this.uz * zh;
      if (hx * f.side < 0.035) hx = 0.035 * f.side;                                         // never across the other leg
      yaw = f.side * 4 * DEG * (1 - 0.5 * this.run); pitch = p.heelStrike;
    } else {
      hx = f.side * RIG.ankle.x; hz = RIG.ankle.z - RIG.heelToAnkle.z; yaw = 0; pitch = 0;
    }
    ankleOffset(pitch, OFF);
    const tx = hx + Math.sin(yaw) * OFF.z, tz = hz + Math.cos(yaw) * OFF.z, ty = GROUND + OFF.y;
    const a = f.s <= 0 ? 1 : 1 - Math.exp(-dt / 0.06);
    f.tx += (tx - f.tx) * a; f.ty += (ty - f.ty) * a; f.tz += (tz - f.tz) * a; f.tyaw += (yaw - f.tyaw) * a; f.tpitch += (pitch - f.tpitch) * a;
  }

  /** In the air: walking, the foot lifts as the knee bends then skims forward; running, the heel kicks up behind and the knee carries the foot forward. */
  private swingPose(f: Foot) {
    const p = this.p, s = f.s, h = minJerk(s);
    const r = f.settle ? 0 : this.run;
    const lift = f.settle ? 0.04 : p.lift, clear = f.settle ? 0.015 : p.clear;
    let x = lerp(f.x0, f.tx, h), z = lerp(f.z0, f.tz, h);
    let y = lerp(f.y0, f.ty, h) + lift * smoothstep(0, 0.25, s) * (1 - smoothstep(0.25, 0.65, s)) + clear * Math.sin(Math.PI * s);
    if (r > 0) {
      // cubic Bézier: up behind (the heel kicked up), then forward under the knee, then down onto the ground
      const u = s, iu = 1 - u, b0 = iu * iu * iu, b1 = 3 * iu * iu * u, b2 = 3 * iu * u * u, b3 = u * u * u;
      const rz = b0 * f.z0 + b1 * (f.z0 + 0.08) + b2 * (f.tz + p.drive) + b3 * f.tz;
      const ry = b0 * f.y0 + b1 * (f.y0 + p.kick) + b2 * (f.ty + p.kick * 0.45) + b3 * f.ty;
      z = lerp(z, rz, r); y = lerp(y, ry, r); x = lerp(x, lerp(f.x0, f.tx, smoothstep(0, 1, s)), r);
    }
    if (this.moving && !f.settle) {
      // it leaves the ground and meets it at the ground's speed (no skid at toe-off or at the landing): it goes on back a
      // little after the toe-off and reaches a little ahead before coming back onto its spot
      const Tsw = (Math.max(0.05, 1 - f.lamTo) * 2) / p.cadence, v = this.v;
      const c0 = -(0.8 - 0.4 * r) * v * Tsw - 0.24 * r, c1 = -v * Tsw + 3 * p.drive * r;
      const s0 = 0.25, s1 = 0.7 + 0.1 * r;
      let d = 0;
      if (s < s0) { const q = s / s0; d += c0 * s0 * q * (1 - q) * (1 - q); }
      if (s > s1) { const q = (s - s1) / (1 - s1); d += c1 * (1 - s1) * q * q * (q - 1); }
      x += this.ux * d; z += this.uz * d;
    }
    f.ax = x; f.ay = Math.max(y, GROUND + 0.06); f.az = z;
    f.yaw = lerp(f.yaw0, f.tyaw, h);
    f.pitch = lerp(f.p0, f.tpitch, smoothstep(0.15, 1, s));
    f.alpha = f.settle ? 0 : p.ankleSwing;
    f.shinW = f.settle ? 0 : smoothstep(0, 0.35, s) * (1 - smoothstep(0.7, 1, s));
    f.planted = false;
  }

  /** Standing: a foot left too far from its place (the body turned on the spot, or stopped with the feet apart) steps back under its hip. */
  private settleFeet(dt: number) {
    const [L, R] = this.feet;
    if (L.swing || R.swing) { this.wait = 0.08; return; }
    if ((this.wait -= dt) > 0) return;
    const err = (f: Foot) => Math.hypot(f.ax - f.side * RIG.ankle.x, f.az - RIG.ankle.z) + 0.25 * Math.abs(f.yaw);
    const eL = err(L), eR = err(R), f = eL >= eR ? L : R;
    if (Math.max(eL, eR) > 0.12) { this.liftOff(f, true, 0.3); this.settles++; }
  }

  /** The pelvis over the feet (its height limited by the legs' reach), the trunk, the arms. */
  private posture() {
    const p = this.p, m = this.m, ph = this.feet[0].lam, d2 = p.duty / 2;
    this.pyaw = -p.yaw * Math.cos(TAU * ph) * m;
    if (!this.moving) this.pyaw += 0.3 * (this.feet[0].yaw + this.feet[1].yaw) * 0.5 * (1 - m);
    this.proll = p.roll * Math.cos(TAU * (ph - d2)) * m;
    this.px = p.sway * Math.cos(TAU * (ph - d2 - 0.04)) * m; this.pz = 0;
    let y = lerp(RIG.hipY, p.hipY + p.bob * Math.cos(2 * TAU * (ph - d2)), m);
    const cr = Math.cos(this.proll), sr = Math.sin(this.proll), cyw = Math.cos(this.pyaw), syw = Math.sin(this.pyaw);
    for (const f of this.feet) {
      const hx = this.px + f.side * RIG.hipX * cr * cyw, hz = this.pz - f.side * RIG.hipX * cr * syw;
      let dx = f.ax - hx, dz = f.az - hz, dh = Math.hypot(dx, dz);
      const most = REACH * 0.97;
      if (dh > most && !f.swing) {
        // out of the leg's reach: the contact point gives (it slides) — counted for the checks
        const e = dh - most, mx = (-dx / dh) * e, mz = (-dz / dh) * e;
        f.hx += this.k * (mx * this.c + mz * this.s); f.hz += this.k * (-mx * this.s + mz * this.c);
        f.ax += mx; f.az += mz; f.slipped += e * this.k; dx = f.ax - hx; dz = f.az - hz; dh = most;
      }
      let lim = f.ay + Math.sqrt(Math.max(0, REACH * REACH - Math.min(dh, most) ** 2)) - f.side * RIG.hipX * sr;
      // a swinging leg lets the hips rise gently after the toe-off and holds them down again as it reaches for the ground
      if (f.swing) lim = Math.min(f.limTo + 0.15 * smoothstep(0, 0.3, f.s), lim + 0.15 * (1 - smoothstep(0.55, 1, f.s)));
      else f.lim = lim;
      y = smin(y, lim, 0.005 + 0.025 * m);
    }
    this.py = Math.max(0.8, y);
    this.lean = p.lean; this.twist = 0.7 * p.yaw * Math.cos(TAU * ph);
    const aL = Math.cos(TAU * (ph - 0.54)), aR = Math.cos(TAU * (ph - 0.04));
    this.armL = p.arm * aL + p.armBias; this.armR = p.arm * aR + p.armBias;
    this.elbowL = p.elbow + p.elbowSwing * Math.max(0, aL); this.elbowR = p.elbow + p.elbowSwing * Math.max(0, aR);
  }
}
