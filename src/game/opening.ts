import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import { FollowCamera } from '../actors/camera';
import { phoneHooks } from '../ui/phoneHooks';
import { OPENING_FADE_SECONDS, OPENING_SECONDS, PIKINE_KEYS, SKIP_IN_SECONDS, SKIP_OUT_SECONDS, openingPose, type Pose } from './openingPath';
import '../ui/opening.css';

/**
 * 1.0.1: the opening fly-in. On the first launch of the game on a device — a new game, right after the character is made (src/main.ts) —
 * the camera flies low over Pikine at the hour the game starts and lands on the play camera behind the player (src/game/openingPath.ts),
 * the city going on under it. The HUD steps aside meanwhile and comes back at the end, with the welcome. A tap, a click or a key skips it
 * (« Passer »): the screen dips to the dark and comes back on the same play camera. With `prefers-reduced-motion: reduce` there is no
 * flight: a short fade from the arrival card's dark to the play camera. Seen once per device (`localStorage`), never forced again;
 * Réglages › Caméra › « Revoir l'ouverture » plays it again, on foot in Pikine's streets. A `?debug` run skips it (the checks keep their
 * timing); `?intro` on a test host forces it (scripts/check-opening.mjs).
 *
 * The camera is this module's (`camera` hook) while it flies; the play camera it lands on is the follow camera itself, updated every frame
 * under the flight, so the player takes over without a cut. Times are the wall clock's: a slow device draws fewer frames of the same
 * 14 s (a frame counts for one second at most: a stall does not throw the camera to the end), and a hidden page's gap is not counted.
 */
const SEEN_KEY = 'dakarrek.opening';
/** Whether this device has seen the opening (a storage that cannot be read: not seen). */
export function openingSeen(): boolean { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* no storage: nothing is kept between visits anyway */ } }
/** Whether the opening plays at this start: a new game whose character was just made, outside a ?debug run, never seen on this device; or forced (`?intro`, test hosts). */
export function openingWanted(o: { made: boolean; debug: boolean; forced: boolean; seen: boolean }): boolean { return o.forced || (o.made && !o.debug && !o.seen); }
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

type Phase = 'flight' | 'fade' | 'out' | 'in';
interface Run {
  phase: Phase;
  /** Seconds into the flight; `k`: into the fade or the dip. */
  t: number; k: number;
  /** The player stands where the flight lands (the New Game spawn): it ends on their play camera. Otherwise (a replay elsewhere in Pikine) it ends on the spawn's and dips back to theirs. */
  live: boolean;
  /** The checks' still frame (`openingHold`): the flight held at this second. */
  hold: number | null;
  done?: () => void;
}
const NO_DRAG = { yaw: 0, pitch: 0 };
const V = new THREE.Vector3();
/** A camera's pose as a flight key: where it is, and a point ahead at the distance of what it frames. */
function poseOf(cam: THREE.Camera, framed: THREE.Vector3): Pose {
  const d = Math.max(4, cam.position.distanceTo(framed)), dir = cam.getWorldDirection(V);
  return { pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, look: { x: cam.position.x + dir.x * d, y: cam.position.y + dir.y * d, z: cam.position.z + dir.z * d } };
}

class Opening implements GameModule {
  name = 'opening';
  private run: Run | null = null;
  private last = 0;
  private layer: HTMLElement | null = null;
  private veil: HTMLElement | null = null;
  /** The New Game spawn's play camera, for a replay that does not end on the player (a follow camera of its own: the same framing rules). */
  private spawnCam = new THREE.PerspectiveCamera();
  private spawnFollow = new FollowCamera(this.spawnCam);
  private spawnAt = new THREE.Vector3();
  /** Back from another app or tab: the time away is not flight time. */
  private onVisible = () => { if (!document.hidden) this.last = performance.now(); };
  private onKey = (e: KeyboardEvent) => {
    const r = this.run;
    if (!r || (r.phase !== 'flight' && r.phase !== 'fade') || e.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();                       // the skip key is not also the game's action or the phone's key
    this.skip();
  };

  init(ctx: GameCtx) { phoneHooks.replayOpening = () => this.replay(ctx); }

  /** Starts the opening now (the district is built and the player placed). `done` runs once the player has the controls back. */
  play(ctx: GameCtx, o: { done?: () => void; reduced?: boolean } = {}): boolean {
    const w = ctx.world();
    if (this.run || !w || ctx.inside()) { o.done?.(); return false; }
    markSeen();                                                    // seen as soon as it starts: a reload in the middle does not play it again
    const fade = (o.reduced ?? reducedMotion()) || w.id !== 'pikine';   // (a new game opened on an invitation to another district: the fade)
    const live = Math.hypot(ctx.player.pos.x - w.spawn.x, ctx.player.pos.z - w.spawn.z) < 3;
    this.run = { phase: fade ? 'fade' : 'flight', t: 0, k: 0, live, hold: null, done: o.done };
    this.last = performance.now();
    ctx.setMode('busy');                                           // the controls are off while it plays
    document.body.classList.add('opening');
    this.mount(fade);
    if (!live) { this.spawnAt.set(w.spawn.x, 0.1 + w.heightAt(w.spawn.x, w.spawn.z), w.spawn.z); this.spawnFollow.snapBehind(w.spawn.yaw); }
    if (!fade) {
      // the camera is where the flight starts before the first frame: what the frame's updates size by their distance to the camera (people, bodies'
      // animation) is sized for the flight's view from that first frame on, not for wherever the camera stood before (the middle of the district at a start)
      const k = PIKINE_KEYS[0];
      ctx.camera.position.set(k.pos.x, k.pos.y, k.pos.z); ctx.camera.lookAt(k.look.x, k.look.y, k.look.z); ctx.camera.updateMatrixWorld();
    }
    return true;
  }

  /** Réglages › « Revoir l'ouverture »: on foot, in Pikine's streets. */
  private replay(ctx: GameCtx) {
    if (ctx.world()?.id !== 'pikine' || ctx.space() !== 'street' || ctx.player.seated() || ctx.mode() !== 'play') { ctx.toast('L’ouverture se revoit à pied, dans les rues de Pikine.'); return; }
    this.play(ctx);
  }

  /** A tap, a click or a key: the flight dips to the dark and comes back on the play camera; the fade ends now. */
  skip() {
    const r = this.run; if (!r) return;
    if (r.phase === 'flight') { r.phase = 'out'; r.k = 0; }
    else if (r.phase === 'fade') r.k = OPENING_FADE_SECONDS;
  }

  update(ctx: GameCtx) {
    const r = this.run; if (!r) return;
    const now = performance.now(), dt = Math.min(1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (!ctx.world() || ctx.inside()) { this.release(ctx); this.unmount(); return; }      // (nothing else should take the player meanwhile)
    if (r.phase === 'flight') {
      if (r.hold === null) r.t = Math.min(OPENING_SECONDS, r.t + dt);
      if (r.t >= OPENING_SECONDS && r.hold === null) { if (r.live) { this.release(ctx); this.unmount(); } else { r.phase = 'out'; r.k = 0; } }
    } else if (r.phase === 'fade') {
      r.k += dt; this.shade(1 - r.k / OPENING_FADE_SECONDS);
      if (r.k >= OPENING_FADE_SECONDS) { this.release(ctx); this.unmount(); }
    } else if (r.phase === 'out') {
      r.k += dt; this.shade(r.k / SKIP_OUT_SECONDS);
      if (r.k >= SKIP_OUT_SECONDS) { r.phase = 'in'; r.k = 0; this.layer?.classList.add('in'); this.release(ctx); }   // in the dark: the play camera, the HUD, the controls
    } else {
      r.k += dt; this.shade(1 - r.k / SKIP_IN_SECONDS);
      if (r.k >= SKIP_IN_SECONDS) this.unmount();
    }
  }

  camera(ctx: GameCtx, dt: number): boolean {
    const r = this.run, w = ctx.world();
    if (!r || !w || (r.phase !== 'flight' && r.phase !== 'out')) return false;
    // the play camera this flight lands on: the follow camera behind the player, kept up to date under the flight (as src/main.ts updates it outdoors)
    const portrait = innerHeight > innerWidth, groundAt = (x: number, z: number) => w.heightAt(x, z);
    let end: Pose;
    if (r.live) { ctx.follow.update(dt, ctx.player.pos, ctx.player.facing(), NO_DRAG, w.colliders, portrait, false, undefined, groundAt, w.canopies, w.roofs ?? []); end = poseOf(ctx.camera, ctx.player.pos); }
    else { this.spawnFollow.update(dt, this.spawnAt, w.spawn.yaw, NO_DRAG, w.colliders, portrait, false, undefined, groundAt, w.canopies, w.roofs ?? []); end = poseOf(this.spawnCam, this.spawnAt); }
    const p = openingPose(r.t, end);
    ctx.camera.position.set(p.pos.x, p.pos.y, p.pos.z); ctx.camera.lookAt(p.look.x, p.look.y, p.look.z);
    return true;
  }

  /** The player takes over: the play camera (the camera hook lets go), the HUD back, the controls on, the welcome (once). */
  private release(ctx: GameCtx) {
    const r = this.run; if (!r) return;
    document.body.classList.remove('opening');
    if (ctx.mode() === 'busy') ctx.setMode('play');
    ctx.input.reset();
    const done = r.done; r.done = undefined; done?.();
  }

  private mount(fade: boolean) {
    const el = document.createElement('div');
    el.id = 'opening'; el.className = fade ? 'fade' : '';
    el.innerHTML = '<i class="op-veil"></i><button type="button" class="op-skip" aria-label="Passer l’ouverture">Passer<span aria-hidden="true"> ›</span></button>';
    el.addEventListener('pointerdown', e => { e.preventDefault(); this.skip(); });
    document.body.appendChild(el);
    this.layer = el; this.veil = el.querySelector('.op-veil');
    this.shade(fade ? 1 : 0);
    addEventListener('keydown', this.onKey, true);
    document.addEventListener('visibilitychange', this.onVisible);
  }
  private unmount() {
    removeEventListener('keydown', this.onKey, true); document.removeEventListener('visibilitychange', this.onVisible);
    this.layer?.remove(); this.layer = this.veil = null;
    this.run = null;
  }
  private shade(v: number) { if (this.veil) this.veil.style.opacity = String(Math.max(0, Math.min(1, v))); }

  debug(ctx: GameCtx): Record<string, unknown> {
    return {
      /** Checks: the opening now (null phase: not playing), whether this device has seen it, whether the HUD is shown. */
      opening: () => ({ phase: this.run?.phase ?? null, t: this.run ? +this.run.t.toFixed(2) : null, seconds: OPENING_SECONDS, live: this.run?.live ?? null, seen: openingSeen(),
        hud: !document.body.classList.contains('opening') }),
      /** Checks: play it now (`reduced`: as with reduced motion). */
      openingPlay: (o?: { reduced?: boolean }) => this.play(ctx, o ?? {}),
      /** Checks: hold the flight at second `t` (the proof's stills), null to let it fly on. */
      openingHold: (t: number | null) => { const r = this.run; if (!r) return false; r.hold = t; if (t !== null) r.t = Math.max(0, Math.min(OPENING_SECONDS, t)); return true; },
    };
  }
}

export const opening = new Opening();
