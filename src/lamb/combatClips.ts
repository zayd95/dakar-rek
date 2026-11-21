import * as THREE from 'three';

/**
 * The bout's motion clips (docs/wrestling/COMBAT.md « Les clips »): the wrestling animations made with Meshy (its library
 * — the fight walks, the falls, the stagger, the get-up, two throws — and its text-to-motion — the stance, the hip throw,
 * the lift and drop, the drive, the man thrown on his back, the sprawl, the victory), retargeted offline onto the 20-bone
 * rig by scripts/wrestlers/retarget-meshy.mjs (v4's body and the Roi des Arènes' share the bones and their rest) into
 * public/assets/wrestlers/combat_clips.json: per clip, Int16 quaternions per bone (one key when the bone does not move)
 * and the hips' path in millimetres (the rig's root space). Only the converted clips ship; the Meshy files stay out of git.
 *
 * A ClipPlayer is the base layer of a body: a clip (looped, played back and forth, or time-warped onto the rules' own
 * clock: a throw's wind-up, a fall's time) with a short cross-fade from the last one. The procedural layer goes on top
 * (src/lamb/combatRig.ts: the feet planted, the hands on the hold, the springs). Sampling allocates nothing.
 */
export type ClipId = 'walk_fwd' | 'walk_back' | 'crouch_walk' | 'knock_down' | 'fall_back' | 'fall_fwd' | 'stand_up' | 'stagger'
  | 'shoulder_throw' | 'grip_throw' | 'stance' | 'hip_throw' | 'lift_drop' | 'push_drive' | 'thrown_back' | 'resist_sprawl' | 'victory';

export interface ClipData {
  id: ClipId; fps: number; frames: number; dur: number;
  /** m/s along his forward over the clip (in place: from the stride), for matching the steps to the body's own speed. */
  speed: number;
  /** Per bone: frames × 4 (x, y, z, w), or 4 when the bone holds still. */
  q: Map<string, Float32Array>;
  /** The hips' local position per frame (root space), frames × 3. */
  hips: Float32Array;
}

interface Packed { bones: string[]; restHips: [number, number, number]; clips: Record<string, { fps: number; frames: number; speed: number; bones: Record<string, string>; hips: string }> }

let lib: Map<ClipId, ClipData> | null = null;
/** The rig's hips at rest (root space) the clips' paths are given against. */
export const CLIP_REST_HIPS = new THREE.Vector3(0, 0, 0.95);
let loading: Promise<boolean> | null = null;
/** The bones the clips write (the shoulders included). */
export let CLIP_BONES: readonly string[] = [];

const i16 = (b64: string): Int16Array => {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Int16Array(u.buffer);
};

/** Unpacks the file's JSON (also used by the tests, from the file on disk). */
export function unpackClips(p: Packed): Map<ClipId, ClipData> {
  const out = new Map<ClipId, ClipData>();
  CLIP_BONES = p.bones;
  if (p.restHips) CLIP_REST_HIPS.fromArray(p.restHips);
  for (const [id, c] of Object.entries(p.clips)) {
    const q = new Map<string, Float32Array>();
    for (const n of p.bones) {
      const a = i16(c.bones[n]), f = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 4) {
        const x = a[i] / 32767, y = a[i + 1] / 32767, z = a[i + 2] / 32767, w = a[i + 3] / 32767, l = Math.hypot(x, y, z, w) || 1;
        f[i] = x / l; f[i + 1] = y / l; f[i + 2] = z / l; f[i + 3] = w / l;
      }
      q.set(n, f);
    }
    const h = i16(c.hips), hips = new Float32Array(h.length);
    for (let i = 0; i < h.length; i++) hips[i] = h[i] / 1000;
    out.set(id as ClipId, { id: id as ClipId, fps: c.fps, frames: c.frames, dur: (c.frames - 1) / c.fps, speed: c.speed, q, hips });
  }
  return out;
}

/** Fetches the clips once (the bout plays its procedural bodies until they are in). Resolves false when they cannot be had. */
export function loadCombatClips(base = import.meta.env.BASE_URL): Promise<boolean> {
  if (lib) return Promise.resolve(true);
  if (!loading) {
    loading = (async () => {
      try {
        if (typeof fetch === 'undefined') return false;
        const r = await fetch(`${base}assets/wrestlers/combat_clips.json`);
        if (!r.ok) return false;
        lib = unpackClips(await r.json() as Packed);
        return true;
      } catch { return false; }
    })();
  }
  return loading;
}
export const combatClips = (): Map<ClipId, ClipData> | null => lib;
/** Tests: the clips given directly. */
export function setCombatClips(m: Map<ClipId, ClipData> | null) { lib = m; }

/** How a clip runs: looped, back and forth over [from, to], or held at a time given each frame (`at`). */
export interface PlayOpts { mode?: 'loop' | 'pingpong' | 'once' | 'driven'; rate?: number; from?: number; to?: number; fade?: number }

interface Slot { clip: ClipData | null; t: number; dir: number; mode: NonNullable<PlayOpts['mode']>; rate: number; from: number; to: number }
const blank = (): Slot => ({ clip: null, t: 0, dir: 1, mode: 'loop', rate: 1, from: 0, to: 0 });

const QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), VA = new THREE.Vector3(), VB = new THREE.Vector3();

export class ClipPlayer {
  private cur: Slot = blank();
  private old: Slot = blank();
  /** The cross-fade: 0 → 1 from the old clip to the current one. */
  private mix = 1; private fadeT = 0.15;
  /** What plays now (checks). */
  get id(): ClipId | null { return this.cur.clip?.id ?? null; }
  get time(): number { return this.cur.t; }

  /** Starts `id` (no-op when it already plays in the same way), cross-fading from what played. */
  play(id: ClipId, o: PlayOpts = {}): boolean {
    const c = lib?.get(id); if (!c) return false;
    const mode = o.mode ?? 'loop', from = Math.max(0, o.from ?? 0), to = Math.min(c.dur, o.to ?? c.dur);
    const s = this.cur;
    if (s.clip === c && s.mode === mode && s.from === from && s.to === to) { s.rate = o.rate ?? s.rate; return true; }
    if (s.clip) { const t = this.old; t.clip = s.clip; t.t = s.t; t.dir = s.dir; t.mode = s.mode; t.rate = s.rate; t.from = s.from; t.to = s.to; this.mix = 0; }
    else this.mix = 1;
    this.fadeT = o.fade ?? 0.15;
    s.clip = c; s.mode = mode; s.rate = o.rate ?? 1; s.from = from; s.to = to; s.t = from; s.dir = 1;
    return true;
  }
  /** A driven clip's time: `k` (0…1) across [from, to] (the rules' clock: a wind-up's progress, a fall's time). */
  at(k: number) { const s = this.cur; if (s.clip) s.t = s.from + (s.to - s.from) * Math.max(0, Math.min(1, k)); }
  /** A playing clip's rate (a walk matched to the body's speed). */
  rate(r: number) { this.cur.rate = r; }
  stop() { this.cur.clip = null; this.old.clip = null; }

  tick(dt: number) {
    for (const s of [this.cur, this.old]) {
      if (!s.clip || s.mode === 'driven') continue;
      const span = Math.max(1e-3, s.to - s.from);
      s.t += dt * s.rate * s.dir;
      if (s.mode === 'loop') { while (s.t > s.to) s.t -= span; while (s.t < s.from) s.t += span; }
      else if (s.mode === 'pingpong') {
        if (s.t > s.to) { s.t = 2 * s.to - s.t; s.dir = -1; }
        if (s.t < s.from) { s.t = 2 * s.from - s.t; s.dir = 1; }
        s.t = Math.max(s.from, Math.min(s.to, s.t));
      } else s.t = Math.min(s.to, s.t);
    }
    if (this.mix < 1) { this.mix = Math.min(1, this.mix + dt / Math.max(1e-3, this.fadeT)); if (this.mix >= 1) this.old.clip = null; }
  }

  /** One slot's rotation of bone `n` into `out`. */
  private sampleQ(s: Slot, n: string, out: number[]): boolean {
    const a = s.clip!.q.get(n); if (!a) return false;
    if (a.length === 4) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; return true; }
    const x = s.t * s.clip!.fps, i = Math.min(s.clip!.frames - 1, Math.max(0, Math.floor(x))), j = Math.min(s.clip!.frames - 1, i + 1), u = Math.max(0, Math.min(1, x - i));
    THREE.Quaternion.slerpFlat(out, 0, a as unknown as number[], i * 4, a as unknown as number[], j * 4, u);
    return true;
  }
  private sampleP(s: Slot, out: THREE.Vector3) {
    const c = s.clip!, a = c.hips, x = s.t * c.fps, i = Math.min(c.frames - 1, Math.max(0, Math.floor(x))), j = Math.min(c.frames - 1, i + 1), u = Math.max(0, Math.min(1, x - i));
    out.set(a[i * 3] + (a[j * 3] - a[i * 3]) * u, a[i * 3 + 1] + (a[j * 3 + 1] - a[i * 3 + 1]) * u, a[i * 3 + 2] + (a[j * 3 + 2] - a[i * 3 + 2]) * u);
  }

  /**
   * Writes the pose (the cross-fade done) onto `bones` by name, blended with what they hold by `w`, the bones in `skip`
   * left alone; the hips' position too, as the clip's offset from the rig's rest (`restHips`) added to this body's rest.
   */
  apply(bones: Record<string, THREE.Object3D | undefined>, w: number, restHips: THREE.Vector3, bodyRestHips: THREE.Vector3, skip?: ReadonlySet<string>, hipsW = w) {
    const s = this.cur; if (!s.clip || w <= 0.001) return;
    const o = this.old.clip && this.mix < 1 ? this.old : null;
    for (const n of CLIP_BONES) {
      const b = bones[n]; if (!b || skip?.has(n)) continue;
      if (!this.sampleQ(s, n, SCR)) continue;
      QA.set(SCR[0], SCR[1], SCR[2], SCR[3]);
      if (o && this.sampleQ(o, n, SCR)) { QB.set(SCR[0], SCR[1], SCR[2], SCR[3]); QA.copy(QB.slerp(QA, this.mix)); }
      b.quaternion.slerp(QA, Math.min(1, w));
    }
    const hips = bones.hips;
    if (hips && hipsW > 0.001) {
      this.sampleP(s, VA);
      if (o) { this.sampleP(o, VB); VA.lerpVectors(VB, VA, this.mix); }
      VA.sub(restHips).add(bodyRestHips);
      hips.position.lerp(VA, Math.min(1, hipsW));
    }
  }
}
const SCR: number[] = [0, 0, 0, 1];
