import * as THREE from 'three';
import type { Avatar } from '../core/types';
import { Humanoid, humanoidReady } from '../actors/humanoid';
import { loadPlayerBody } from '../actors/playerBody';
import type { Appearance } from '../actors/appearance';

/**
 * The live 3D preview of the character creator: the real Humanoid of the chosen identity (same GLB, same rig, same shader as in the game), idling on
 * a small stage with its own renderer, turning slowly, draggable. `focus('head')` brings the face close for the skin and the hair, `focus('body')` shows the whole outfit.
 */
export type Focus = 'head' | 'body';
export class CreatorPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  private body: Humanoid | null = null;
  private avatar: Avatar | null = null;
  private appearance: Appearance | null = null;
  private yaw = 0.35; private yawTarget: number | null = null; private spin = 0.5; private drag: { x: number; yaw: number; id: number } | null = null;
  private focusing: Focus = 'body'; private cam = { y: 0.98, d: 6.2 }; private camTo = { y: 0.98, d: 6.2 };
  private raf = 0; private last = 0; private alive = true; private ro: ResizeObserver | null = null; private loading = 0;
  /** Checks: holds the turntable and the idle animation still (the stage is then the same picture until a choice changes it; the camera still moves to its focus). */
  frozen = false;
  /** The body currently drawn, for the checks ('meshy_m' | 'meshy_f' | 'v4'). */
  get drawn() { return this.body?.body ?? null; }
  get humanoid() { return this.body; }

  constructor(private canvas: HTMLCanvasElement, private low: boolean) {
    try { this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default', preserveDrawingBuffer: false }); }
    catch { this.renderer = null; return; }
    const r = this.renderer; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.0));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.15); sun.position.set(2.2, 3.4, 2.8); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.35); rim.position.set(-2.5, 2, -3); this.scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.004; this.scene.add(disc);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.up);
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); }
    this.resize();
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }

  get ok() { return !!this.renderer; }

  private down = (e: PointerEvent) => { this.drag = { x: e.clientX, yaw: this.yaw, id: e.pointerId }; this.yawTarget = null; try { this.canvas.setPointerCapture(e.pointerId); } catch { /* */ } };
  private move = (e: PointerEvent) => { if (this.drag && e.pointerId === this.drag.id) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; };
  private up = (e: PointerEvent) => { if (this.drag?.id === e.pointerId) this.drag = null; };

  private resize() {
    const r = this.renderer; if (!r) return;
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fit();
  }

  /** Camera distance for the focus: the whole body (1.95 m) or the head and shoulders (0.62 m), whichever of the height and the width of the stage binds. */
  private fit() {
    const sc = this.body?.group.scale.x ?? 1, fov = this.camera.fov * Math.PI / 180, a = this.camera.aspect;
    const need = (h: number, w: number) => Math.max(h / (2 * Math.tan(fov / 2)), w / (2 * Math.tan(fov / 2) * a));
    this.camTo = this.focusing === 'head' ? { y: 1.74 * sc, d: need(0.62 * sc, 0.5) } : { y: 0.98 * sc, d: need(2.22 * sc, 0.95) };
  }
  focus(f: Focus) { this.focusing = f; this.fit(); if (f === 'head') this.faceFront(); }
  /** Turns the body to show its face (the nearest way). */
  faceFront() { const t = Math.PI * 2; this.yawTarget = Math.round(this.yaw / t) * t; }

  /** Loads the identity's body (cached after the first time) and shows it with the look; the previous body goes. */
  async show(avatar: Avatar, appearance: Appearance | null) {
    if (!this.renderer || !this.alive) return;
    this.appearance = appearance;
    if (avatar === this.avatar && this.body) { this.body.setAppearance(appearance); return; }
    const ticket = ++this.loading;
    const id = await loadPlayerBody(avatar, this.low);
    if (!this.alive || ticket !== this.loading || !humanoidReady()) return;
    const old = this.body;
    const b = new Humanoid(undefined, id); b.fullRate = true; b.group.rotation.y = this.yaw; b.play('Idle', 0);
    b.setAppearance(this.appearance); this.scene.add(b.group); this.body = b; this.avatar = avatar;
    if (old) { old.group.removeFromParent(); old.dispose(); }
    this.fit(); this.cam = { ...this.camTo };
  }
  setAppearance(a: Appearance | null) { this.appearance = a; this.body?.setAppearance(a); }

  private frame = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.frame);
    const real = Math.min(0.05, (now - this.last) / 1000), dt = this.frozen ? 0 : real; this.last = now;
    const r = this.renderer; if (!r) return;
    if (this.yawTarget !== null) { this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-real * 7)); if (Math.abs(this.yawTarget - this.yaw) < 0.01) { this.yaw = this.yawTarget; this.yawTarget = null; this.spin = 0; } }
    else if (!this.drag) this.spin = this.focusing === 'head' ? 0 : Math.min(0.45, this.spin + dt * 0.3);
    if (!this.drag && this.yawTarget === null && this.spin) this.yaw += this.spin * dt;
    const k = 1 - Math.exp(-real * 6); this.cam.y += (this.camTo.y - this.cam.y) * k; this.cam.d += (this.camTo.d - this.cam.d) * k;
    this.camera.position.set(0, this.cam.y + (this.focusing === 'head' ? 0.04 : 0.1), this.cam.d); this.camera.lookAt(0, this.cam.y, 0);
    if (this.body) { this.body.group.rotation.y = this.yaw; this.body.animate(dt, 0); }
    r.render(this.scene, this.camera);
  };

  dispose() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro?.disconnect();
    this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.up);
    this.body?.dispose(); this.body = null;
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = null;
  }
}
