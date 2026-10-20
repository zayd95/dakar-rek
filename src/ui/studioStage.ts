import * as THREE from 'three';
import type { Avatar } from '../core/types';
import { Humanoid } from '../actors/humanoid';
import { loadPlayerBody } from '../actors/playerBody';
import type { Appearance } from '../actors/appearance';
import { renderPortrait, type PortraitFocus } from '../actors/portrait';
import { STUDIO_LIGHT } from '../actors/studioLight';

export { STUDIO_LIGHT, gameLight } from '../actors/studioLight';

export type Focus = 'body' | 'face' | 'hair';
/** Where the camera looks and how much it shows (metres of the body, before its draw scale), per focus: the whole body with room for a tall style, the face, the hair. */
const FRAMES: Record<Focus, { y: number; h: number; w: number }> = {
  body: { y: 0.99, h: 2.12, w: 0.98 },
  face: { y: 1.665, h: 0.52, w: 0.44 },
  hair: { y: 1.71, h: 0.7, w: 0.6 },
};
/** The angle the studio shows a body at by default: three-quarters, the face toward the key light. */
export const THREE_QUARTER = -0.42;

/**
 * The studio's live stage: the real Humanoid of the chosen identity (same GLB, rig and shader as in the game) on a soft floor, under the studio's light, with its own
 * renderer while the studio is open (disposed with it, context released). Dragging turns the body, with a little inertia; at rest it sways gently around the angle it
 * was left at. The camera eases between the whole body, the face and the hair, and centres the body in the part of the screen the panels leave free.
 */
export class StudioStage {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.05, 40);
  private bodies = new Map<Avatar, Humanoid>();
  private loading = new Map<Avatar, Promise<Humanoid | null>>();
  private body: Humanoid | null = null;
  private look: Appearance | null = null;
  private yaw = THREE_QUARTER; private yawVel = 0; private yawTo: number | null = null; private drag: { x: number; t: number; id: number } | null = null; private idleT = 0; private swayT = 0;
  private focus: Focus = 'body'; private cam = { y: FRAMES.body.y, d: 5 }; private camTo = { y: FRAMES.body.y, d: 5 }; private snap = true;
  private free = { top: 0, bottom: 0, left: 0, right: 0 };
  private raf = 0; private last = 0; private alive = true; private ro: ResizeObserver | null = null; private ticket = 0;
  /** Checks: hold the idle animation and the sway still (the camera still eases to its focus). */
  frozen = false;
  /** While true nothing is drawn (the stage waits behind the name step). */
  paused = false;
  /** Fires on the first touch that turns the body. */
  onTurn: (() => void) | null = null;
  /** Milliseconds from the stage's creation to its first drawn body (the checks' load time). */
  firstBodyMs: number | null = null;
  private born = performance.now();

  constructor(private canvas: HTMLCanvasElement, private low: boolean) {
    try { this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' }); }
    catch { this.renderer = null; return; }
    const r = this.renderer; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
    for (const l of STUDIO_LIGHT()) this.scene.add(l);
    // a contact shadow under the feet and a faint pool of light on the floor
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.6)'], [0.42, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; shadow.renderOrder = -1; this.scene.add(shadow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(255,236,210,0.2)'], [0.55, 'rgba(255,236,210,0.07)'], [1, 'rgba(255,236,210,0)']]), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; floor.renderOrder = -2; this.scene.add(floor);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.up);
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); }
    this.resize();
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }

  get ok() { return !!this.renderer; }
  /** The body drawn ('meshy_m' | 'meshy_f' | 'v4'), for the checks. */
  get drawn() { return this.body?.body ?? null; }
  get info() { const r = this.renderer?.info; return r ? { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length ?? 0 } : null; }
  /** What the stage's body wears right now (the checks: the last choice wins, whatever the order things loaded in). */
  get shown() { return this.body ? { body: this.body.body, look: this.body.appearance } : null; }
  get view() { return { yaw: this.yaw, focus: this.focus, d: this.cam.d, settled: Math.abs(this.cam.d - this.camTo.d) < 0.01 && this.yawTo === null }; }
  /** The checks: where the soles and the top of the head are drawn (CSS px from the canvas's top), and the band the panels leave free. */
  get extent() {
    const sc = this.body?.group.scale.x ?? 1, h = this.canvas.clientHeight, y = (m: number) => ((1 - new THREE.Vector3(0, m * sc, 0).project(this.camera).y) / 2) * h;
    return { feet: y(0), crown: y(1.9), top: this.free.top, bottom: h - this.free.bottom };
  }

  private down = (e: PointerEvent) => { this.drag = { x: e.clientX, t: performance.now(), id: e.pointerId }; this.yawTo = null; this.yawVel = 0; try { this.canvas.setPointerCapture(e.pointerId); } catch { /* */ } };
  private move = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const now = performance.now(), dx = e.clientX - this.drag.x, dt = Math.max(1, now - this.drag.t);
    this.yaw += dx * 0.011; this.yawVel = (dx * 0.011) / (dt / 1000); this.drag.x = e.clientX; this.drag.t = now; this.idleT = 0;
    if (Math.abs(dx) > 0) this.onTurn?.();
  };
  private up = (e: PointerEvent) => { if (this.drag?.id === e.pointerId) { this.drag = null; this.idleT = 0; } };

  /** The parts of the canvas (CSS px) that panels cover: the body is centred, and fitted, in what is left. */
  setFree(f: { top: number; bottom: number; left?: number; right?: number }) { this.free = { left: 0, right: 0, ...f }; this.resize(); }
  private resize() {
    const r = this.renderer; if (!r) return;
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight), fr = this.free;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setSize(w, h, false);
    // the projection's centre moved to the middle of the free area: a view offset into a bigger virtual picture
    const cx = fr.left + (w - fr.left - fr.right) / 2, cy = fr.top + (h - fr.top - fr.bottom) / 2;
    const FW = 2 * Math.max(cx, w - cx), FH = 2 * Math.max(cy, h - cy);
    this.camera.aspect = FW / FH; this.camera.setViewOffset(FW, FH, FW / 2 - cx, FH / 2 - cy, w, h); this.camera.updateProjectionMatrix();
    this.fit();
  }
  /** The camera distance that shows the focus's height and width inside the free area. */
  private fit() {
    const sc = this.body?.group.scale.x ?? 1, f = FRAMES[this.focus], fr = this.free;
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    const bandH = Math.max(80, h - fr.top - fr.bottom), bandW = Math.max(80, w - fr.left - fr.right), FH = this.camera.view?.fullHeight ?? h, t = Math.tan((this.camera.fov * Math.PI) / 360);
    // at distance d one metre is FH / (2·d·tan(fov/2)) px
    const d = Math.max((f.h * sc * FH) / (2 * t * bandH), (f.w * sc * FH) / (2 * t * bandW));
    this.camTo = { y: f.y * sc, d };
    if (this.snap) this.cam = { ...this.camTo };
  }
  setFocus(f: Focus) {
    if (f === this.focus) return;
    this.focus = f; this.fit();
    if (f !== 'body') { const a = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); if (Math.abs(a) > 0.95) this.yawTo = this.yaw - a + THREE_QUARTER; }   // turn the face back into view
  }
  /** Back to the starting three-quarter view (the way out of the studio). */
  home() { this.setFocus('body'); const a = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); this.yawTo = this.yaw - a + THREE_QUARTER; }

  /** The Humanoid of an identity, loaded once (both requests for it share the load). */
  load(avatar: Avatar): Promise<Humanoid | null> {
    const have = this.bodies.get(avatar); if (have) return Promise.resolve(have);
    if (!this.alive) return Promise.resolve(null);                                         // closed meanwhile: nothing more is fetched
    let p = this.loading.get(avatar);
    if (!p) {
      p = loadPlayerBody(avatar, this.low).then(id => {
        if (!this.alive || id === 'v4') return null;
        const h = new Humanoid(undefined, id); h.fullRate = true; h.play('Idle', 0);
        this.bodies.set(avatar, h); return h;
      }).catch(() => null).then(h => { if (!h) this.loading.delete(avatar); return h; });  // a failed load is tried again on the next choice
      this.loading.set(avatar, p);
    }
    return p;
  }
  /** Shows an identity with a look. Bodies are kept once loaded, so switching is immediate; a newer call always wins over a slower older one. */
  async show(avatar: Avatar, look: Appearance | null): Promise<boolean> {
    if (!this.renderer || !this.alive) return false;
    this.look = look; const ticket = ++this.ticket;
    const b = this.bodies.get(avatar) ?? await this.load(avatar);
    if (!b || !this.alive || ticket !== this.ticket) return !!b;                         // a newer choice came in while this body loaded
    if (this.body !== b) {
      this.body?.group.removeFromParent(); this.scene.add(b.group); this.body = b;
      b.group.rotation.y = this.yaw; for (let i = 0; i < 3; i++) b.animate(1 / 60, 0);     // already in its idle pose on its first frame
      this.fit();
    }
    b.setAppearance(this.look);
    if (this.snap) { this.snap = false; this.firstBodyMs = performance.now() - this.born; }
    return true;
  }

  private jobs: { avatar: Avatar; look: Appearance; focus: PortraitFocus; w: number; h: number; bg: number | null; ticket: number; done: (c: HTMLCanvasElement | null) => void }[] = [];
  private thumbTicket = 0;
  /** Cancels the stills not drawn yet (their callers get null). */
  cancelThumbs() { this.thumbTicket++; for (const j of this.jobs.splice(0)) j.done(null); }
  /**
   * A still of a body with a look (a choice card, the Profile picture): drawn by this stage's renderer at the start of a frame, just before the stage itself, two a
   * frame, so a row of cards fills in without a hitch. The body is borrowed for it and given its own look back before the stage is drawn.
   */
  still(avatar: Avatar, look: Appearance, focus: PortraitFocus, w: number, h: number, bg: number | null = null): Promise<HTMLCanvasElement | null> {
    return new Promise(done => this.jobs.push({ avatar, look, focus, w, h, bg, ticket: this.thumbTicket, done }));
  }
  private runStills() {
    const r = this.renderer; if (!r) return;
    for (let n = 0; n < 2 && this.jobs.length; n++) {
      const j = this.jobs.shift()!, b = this.bodies.get(j.avatar);
      if (j.ticket !== this.thumbTicket || !b) { j.done(null); continue; }
      const was = b.appearance;                                                            // (what it wears on the stage, or wore last)
      let c: HTMLCanvasElement | null = null;
      try { b.setAppearance(j.look); c = renderPortrait(r, b, { width: j.w, height: j.h, focus: j.focus, yaw: THREE_QUARTER, bg: j.bg }); }
      catch { c = null; }                                                                  // (no 2D canvas under memory pressure: no picture, never a stuck caller)
      finally { b.setAppearance(was); j.done(c); }
    }
  }

  private frame = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.frame);
    const r = this.renderer; if (!r) return;
    const real = Math.min(0.05, (now - this.last) / 1000), dt = this.frozen ? 0 : real; this.last = now;
    if (this.paused) return;
    if (this.yawTo !== null) { this.yaw += (this.yawTo - this.yaw) * (1 - Math.exp(-real * 6)); if (Math.abs(this.yawTo - this.yaw) < 0.004) { this.yaw = this.yawTo; this.yawTo = null; } }
    else if (!this.drag) {
      if (Math.abs(this.yawVel) > 0.01) { this.yaw += this.yawVel * real; this.yawVel *= Math.exp(-real * 4.5); }                     // inertia after a flick
      this.idleT += dt; this.swayT += dt;
    }
    const sway = this.drag || this.frozen ? 0 : 0.07 * Math.sin(this.swayT * 0.45) * Math.min(1, this.idleT / 2);
    const k = 1 - Math.exp(-real * 5.5); this.cam.y += (this.camTo.y - this.cam.y) * k; this.cam.d += (this.camTo.d - this.cam.d) * k;
    this.camera.position.set(0, this.cam.y + Math.min(0.12, this.cam.d * 0.03), this.cam.d); this.camera.lookAt(0, this.cam.y, 0);
    if (this.body) { this.body.group.rotation.y = this.yaw + sway; this.body.animate(dt, 0); }
    if (this.jobs.length) this.runStills();
    r.render(this.scene, this.camera);
  };

  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.cancelThumbs();
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.up);
    for (const b of this.bodies.values()) b.dispose();
    this.bodies.clear(); this.body = null;
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); } });
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = null;
  }
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
