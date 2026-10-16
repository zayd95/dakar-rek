import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Interior } from '../world/interiors';
import type { Collider, Interactable } from '../world/types';
import type { Placement } from '../core/types';
import { furnitureSpec, type HomeSpec } from './catalog';
import { furnitureIn, holding, placedIn, setPlacement, touchAssets } from './assets';
import { autoPlace, footprint, layoutOf, nudge, snap, turn, whyNot, yawOf } from './placement';
import { furnitureModel, footprintMarker } from './furnitureModels';

/** A home of the current hub as the ownership module shows it (src/economy/estate.ts). */
export interface HomeView {
  spec: HomeSpec;
  door: Interactable;
  /** Interior centre in the world (furniture placements are relative to it). */
  ox: number; oz: number;
  int: Interior;
  /** The shell's own colliders (walls, built-in pieces); furniture colliders are added after them. */
  base: Collider[];
  spots: { kitchen: { x: number; z: number }; shower: { x: number; z: number } } | null;
  /** Ceiling fixtures hidden while placing (the camera looks from above). */
  ceiling: THREE.Object3D[];
  shellKey: string;
  /** Furniture and upgrade pieces, inside the interior's group. */
  furniture: THREE.Group;
  pieces: Map<string, { obj: THREE.Object3D; spec: string }>;
  seatIds: string[];
}
const FLOOR = 0.1;
/** Camera pitch presets (radians above the floor): the angled view that shows the walls, and straight down. */
const ANGLED = 0.8, HIGH = 1.2, OVERHEAD = 1.53, MIN_PITCH = 0.42;
const clampZoom = (z: number) => Math.min(1.6, Math.max(0.4, z));

/**
 * Placement mode inside the player's home: pick a piece (a chip, or a tap on it), move it on a 25 cm grid (arrows, keys,
 * or a tap on the floor), turn it, then « Poser » where it fits (green footprint) or « Ranger » it. The camera looks
 * down on the whole room meanwhile. Every change is saved at once (src/economy/assets.ts setPlacement).
 */
export class HomeEditor {
  private el: HTMLElement;
  private view: HomeView | null = null;
  private sel: string | null = null;
  private pending: Placement | null = null;
  private ghost: THREE.Object3D | null = null;
  private marker = footprintMarker();
  private ray = new THREE.Raycaster();
  private onKey = (e: KeyboardEvent) => this.key(e);
  private onDown = (e: PointerEvent) => this.down(e);
  private onMove = (e: PointerEvent) => this.moved(e);
  private onUp = (e: PointerEvent) => this.up(e);
  private onWheel = (e: WheelEvent) => { if (!this.view) return; e.preventDefault(); this.look.zoom = clampZoom(this.look.zoom * Math.exp(e.deltaY * 0.0012)); };
  /** The room camera: orbit (yaw/pitch around the room), zoom (× the distance that fits the room), and the overhead preset. */
  private look = { yaw: 0, pitch: HIGH, zoom: 1 };
  private expanded = false;
  private ptrs = new Map<number, { x: number; y: number }>();
  private gest: { kind: 'orbit' | 'drag' | 'pinch'; x0: number; y0: number; t0: number; moved: boolean; grab?: { x: number; z: number }; d0?: number; zoom0?: number } | null = null;

  constructor(private ctx: GameCtx) {
    this.el = document.createElement('div'); this.el.id = 'placer'; this.el.className = 'card';
    this.el.addEventListener('pointerdown', e => e.stopPropagation());
    (document.getElementById('ui') ?? document.body).appendChild(this.el);
  }

  get isOpen() { return !!this.view; }
  private get s() { return this.ctx.state; }
  private homeUid() { return this.view ? holding(this.s, this.view.spec.id)?.uid ?? null : null; }
  private items() { const h = this.homeUid(); return h ? furnitureIn(this.s, h).filter(f => !furnitureSpec(f.spec)?.fixed) : []; }

  open(v: HomeView): boolean {
    if (this.view) return true;
    if (!holding(this.s, v.spec.id)) { this.ctx.toast('Ce n’est pas chez toi'); return false; }
    this.view = v;
    if (!this.items().length) { this.view = null; this.ctx.toast('Aucun meuble pour l’instant : Keur Meubles (Cité Jàmm) livre chez toi'); return false; }
    this.ctx.player.standUp(true);
    this.ctx.setMode('busy');
    document.body.classList.add('placing');
    for (const c of v.ceiling) c.visible = false;
    v.furniture.add(this.marker);
    const first = this.items().find(f => f.at) ?? this.items()[0];
    this.select(first.uid);
    this.look = { yaw: 0, pitch: HIGH, zoom: 1 }; this.ptrs.clear(); this.gest = null;
    addEventListener('keydown', this.onKey, true);
    const c = document.getElementById('c');
    c?.addEventListener('pointerdown', this.onDown); c?.addEventListener('pointermove', this.onMove); c?.addEventListener('pointerup', this.onUp); c?.addEventListener('pointercancel', this.onUp);
    c?.addEventListener('wheel', this.onWheel, { passive: false });
    this.render();
    return true;
  }

  close() {
    const v = this.view; if (!v) return;
    this.drop();
    v.furniture.remove(this.marker);
    for (const c of v.ceiling) c.visible = true;
    this.view = null; this.sel = null; this.pending = null;
    const me = this.ctx.player.body()?.group; if (me) me.visible = true;
    removeEventListener('keydown', this.onKey, true);
    const c = document.getElementById('c');
    c?.removeEventListener('pointerdown', this.onDown); c?.removeEventListener('pointermove', this.onMove); c?.removeEventListener('pointerup', this.onUp); c?.removeEventListener('pointercancel', this.onUp);
    c?.removeEventListener('wheel', this.onWheel);
    this.ptrs.clear(); this.gest = null;
    document.body.classList.remove('placing');
    this.el.classList.remove('on');
    touchAssets();                                                     // every piece back where it is saved
    // never leave the player inside a piece of furniture
    const p = this.ctx.player.pos;
    if (v.int.colliders.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1)) this.ctx.player.place(v.int.spawn.x, v.int.spawn.z, v.int.spawn.yaw);
    this.ctx.setMode('play');
    this.ctx.save();
  }

  /** Per frame: the selected piece (or its ghost) follows the pending spot; the footprint shows if it fits. */
  update() {
    const v = this.view; if (!v || !this.sel || !this.pending) return;
    const f = this.s.data.assets.list.find(a => a.uid === this.sel), fs = f && furnitureSpec(f.spec);
    if (!f || !fs) { this.close(); return; }
    const obj = this.ghost ?? v.pieces.get(this.sel)?.obj;
    if (obj) { obj.position.set(v.ox + this.pending.x, FLOOR, v.oz + this.pending.z); obj.rotation.y = yawOf(this.pending); }
    const r = footprint(fs, this.pending), ok = !this.why();
    this.marker.scale.set(r.x1 - r.x0, r.z1 - r.z0, 1);
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x34d399 : 0xf87171);
    this.marker.position.set(v.ox + (r.x0 + r.x1) / 2, FLOOR + 0.015, v.oz + (r.z0 + r.z1) / 2);   // the furniture group is in world coordinates
  }

  /** Why the selected piece cannot be put at the pending spot (null: it fits). */
  why(): string | null {
    const v = this.view, h = this.homeUid(); if (!v || !h || !this.sel || !this.pending) return 'Aucun meuble choisi';
    const f = this.s.data.assets.list.find(a => a.uid === this.sel)!, fs = furnitureSpec(f.spec)!;
    return whyNot(layoutOf(v.spec), fs, this.pending, placedIn(this.s, h, this.sel));
  }

  select(uid: string) {
    if (!this.view) return;
    this.drop();
    const f = this.items().find(x => x.uid === uid); if (!f) return;
    const fs = furnitureSpec(f.spec)!, h = this.homeUid()!;
    this.sel = uid;
    this.pending = f.at ? { ...f.at } : autoPlace(layoutOf(this.view.spec), fs, placedIn(this.s, h, uid)) ?? { x: 0, z: 0, rot: 0 };
    if (!f.at) { this.ghost = furnitureModel(fs); this.view.furniture.add(this.ghost); }
    this.render();
  }
  /** Leaves the current piece (unsaved moves are undone at the next refresh). */
  private drop() {
    if (this.ghost && this.view) { this.view.furniture.remove(this.ghost); this.ghost.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
    this.ghost = null;
    touchAssets();
  }
  move(dx: number, dz: number) { if (this.pending) { this.pending = nudge(this.pending, dx, dz); this.status(); } }
  rotate() { if (this.pending) { this.pending = turn(this.pending); this.status(); } }
  /** Moves the selected piece to a point of the room (home coordinates), on the grid. */
  moveTo(x: number, z: number) { if (this.pending) { this.pending = snap(x, z, this.pending.rot); this.status(); } }
  put(): boolean {
    const why = this.why();
    if (why || !this.sel || !this.pending) { this.ctx.toast(why ?? 'Choisis un meuble'); this.render(); return false; }
    const uid = this.sel, at = { ...this.pending };
    this.drop();
    setPlacement(this.s, uid, at); this.ctx.save();
    this.sel = uid;                                                       // stays selected, now as a placed piece
    this.ctx.toast('Posé ✓');
    this.render();
    return true;
  }
  stash() {
    if (!this.sel) return;
    const uid = this.sel;
    this.drop();
    setPlacement(this.s, uid, null); this.ctx.save();
    this.ctx.toast('Rangé : il t’attend dans la liste');
    this.select(uid);
  }
  next() { const list = this.items(); if (!list.length) return; const i = list.findIndex(f => f.uid === this.sel); this.select(list[(i + 1) % list.length].uid); }

  info() {
    return {
      open: this.isOpen, selected: this.sel, gesture: this.gest?.kind ?? null, pointers: this.ptrs.size, cam: this.ctx.camera.position.toArray().map(n => +n.toFixed(2)), avatar: this.ctx.player.body()?.group.visible ?? null, pending: this.pending ? { ...this.pending } : null, why: this.isOpen ? this.why() : null,
      items: this.items().map(f => ({ uid: f.uid, spec: f.spec, at: f.at ? { ...f.at } : null })),
    };
  }

  // ---------------------------------------------------------------- camera, input, panel
  /** The room camera while placing (the module's camera hook): orbits the room, zooms, or looks straight down; false when closed. */
  camera(): boolean {
    const v = this.view; if (!v) return false;
    const cam = this.ctx.camera, L = layoutOf(v.spec), { yaw, pitch, zoom } = this.look;
    const me = this.ctx.player.body()?.group; if (me) me.visible = false;                // the avatar would hide the room while decorating
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect;
    const portrait = cam.aspect < 1;
    const fit = Math.max((L.w / 2 + 0.5) / tanH, (L.d / 2 + 0.8) / tanV) * (portrait ? 1.12 : 1.2);
    const dist = fit * zoom, shift = L.d * (portrait ? 0.07 : 0.14);          // lifts the room clear of the slim toolbar at the bottom edge
    const tx = v.ox, ty = FLOOR, tz = v.oz + shift;
    cam.position.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + dist * Math.cos(yaw) * Math.cos(pitch) + (pitch > 1.5 ? dist * 0.01 : 0));
    cam.lookAt(tx, ty, tz);
    return true;
  }
  /** Debug/checks: the orbit state, and a way to set it. */
  cameraLook(set?: Partial<{ yaw: number; pitch: number; zoom: number }>) { if (set) { Object.assign(this.look, set); this.look.pitch = Math.min(OVERHEAD, Math.max(MIN_PITCH, this.look.pitch)); this.look.zoom = clampZoom(this.look.zoom); } return { ...this.look }; }
  /** Checks: where the selected piece (or the room's centre when none) is on the screen, in client pixels. */
  screenOf(uid?: string): { x: number; y: number } | null {
    const v = this.view; if (!v) return null;
    const obj = (uid ? v.pieces.get(uid)?.obj : null) ?? (this.sel ? v.pieces.get(this.sel)?.obj : null) ?? this.ghost; if (!obj) return null;
    const p = new THREE.Vector3(obj.position.x, FLOOR + 0.3, obj.position.z).project(this.ctx.camera), r = document.getElementById('c')!.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  toggleView() { this.look.pitch = this.look.pitch > 1.45 ? ANGLED : OVERHEAD; this.look.yaw = 0; this.render(); }

  // One finger: on a piece it drags it (the grab keeps its offset, snapped to the grid); anywhere else it orbits the room, and a
  // short tap on the floor moves the piece there. Two fingers pinch to zoom (a drag in progress is dropped, never put).
  private ndc(e: PointerEvent) { const r = (e.target as HTMLElement).getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  private floorAt(e: PointerEvent): THREE.Vector3 | null {
    this.ray.setFromCamera(this.ndc(e), this.ctx.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR), p) ? p : null;
  }
  /** The uid of the piece under the pointer (the ghost counts as the selected piece). */
  private pieceAt(e: PointerEvent): string | null {
    const v = this.view; if (!v) return null;
    this.ray.setFromCamera(this.ndc(e), this.ctx.camera);
    const objs = [...v.pieces.values()].map(p => p.obj); if (this.ghost) objs.push(this.ghost);
    for (const h of this.ray.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = h.object; while (o && !o.userData.uid && o !== this.ghost) o = o.parent;
      if (o === this.ghost) return this.sel;
      if (o?.userData.uid) return o.userData.uid as string;
    }
    return null;
  }
  private down(e: PointerEvent) {
    const v = this.view; if (!v || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      this.gest = { kind: 'pinch', x0: 0, y0: 0, t0: performance.now(), moved: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: this.look.zoom };
      this.status(); return;
    }
    const hit = this.pieceAt(e);
    if (hit) {
      if (hit !== this.sel) this.select(hit);
      const f = this.floorAt(e), p = this.pending;
      this.gest = { kind: 'drag', x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, grab: f && p ? { x: p.x - (f.x - v.ox), z: p.z - (f.z - v.oz) } : { x: 0, z: 0 } };
    } else this.gest = { kind: 'orbit', x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
  }
  private moved(e: PointerEvent) {
    const v = this.view, g = this.gest, prev = this.ptrs.get(e.pointerId); if (!v || !g || !prev) return;
    prev.x = e.clientX; prev.y = e.clientY;
    if (g.kind === 'pinch') {
      if (this.ptrs.size < 2) return;
      const [a, b] = [...this.ptrs.values()];
      this.look.zoom = clampZoom(g.zoom0! * g.d0! / (Math.hypot(a.x - b.x, a.y - b.y) || 1)); return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 8) return;
    g.moved = true;
    if (g.kind === 'orbit') {
      const k = 0.0075, dx = e.clientX - g.x0, dy = e.clientY - g.y0; g.x0 = e.clientX; g.y0 = e.clientY;
      this.look.yaw -= dx * k; this.look.pitch = Math.min(OVERHEAD, Math.max(MIN_PITCH, this.look.pitch + dy * k)); return;
    }
    const f = this.floorAt(e); if (f && g.grab) this.moveTo(f.x - v.ox + g.grab.x, f.z - v.oz + g.grab.z);
  }
  private up(e: PointerEvent) {
    const v = this.view, g = this.gest; this.ptrs.delete(e.pointerId);
    if (!v || !g) return;
    if (g.kind === 'pinch') { if (this.ptrs.size < 2) this.gest = null; return; }
    this.gest = null;
    if (g.kind === 'drag') { if (g.moved && !this.why()) this.put(); return; }              // dropped where it fits: placed and saved
    if (!g.moved && performance.now() - g.t0 < 400) { const f = this.floorAt(e); if (f) this.moveTo(f.x - v.ox, f.z - v.oz); }
  }
  private key(e: KeyboardEvent) {
    if (!this.view) return;
    const k = e.code, act: Record<string, () => void> = {
      ArrowUp: () => this.move(0, -1), KeyW: () => this.move(0, -1), KeyZ: () => this.move(0, -1),
      ArrowDown: () => this.move(0, 1), KeyS: () => this.move(0, 1),
      ArrowLeft: () => this.move(-1, 0), KeyA: () => this.move(-1, 0), KeyQ: () => this.move(-1, 0),
      ArrowRight: () => this.move(1, 0), KeyD: () => this.move(1, 0),
      KeyR: () => this.rotate(), Enter: () => this.put(), Space: () => this.put(), KeyE: () => this.put(),
      Delete: () => this.stash(), Backspace: () => this.stash(), Tab: () => this.next(), Escape: () => this.close(),
    };
    const fn = act[k]; if (!fn) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat || k.startsWith('Arrow')) fn();
  }

  /** Status line and the Poser button state only: cheap enough to run on every drag step. */
  private status() {
    const v = this.view; if (!v) return;
    const cur = this.items().find(f => f.uid === this.sel), fs = cur && furnitureSpec(cur.spec), why = this.why();
    const st = this.el.querySelector<HTMLElement>('.pl-status'); if (!st) return;
    st.className = `pl-status ${why ? 'bad' : 'ok'}`;
    st.textContent = `${fs ? fs.emoji + ' ' + fs.name + ' · ' : ''}${why ?? (cur?.at ? 'bien placé ✓' : 'la place est libre ✓')}`;
    this.el.querySelector('[data-a="put"]')?.classList.toggle('blocked', !!why);
  }
  private render() {
    const v = this.view; if (!v) { this.el.classList.remove('on'); return; }
    const items = this.items();
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    this.el.innerHTML = `<small class="pl-status"></small>
      <div class="pl-more">
        <div class="pl-items">${items.map(f => { const s = furnitureSpec(f.spec)!; return `<button type="button" data-uid="${f.uid}" class="${f.uid === this.sel ? 'on' : ''} ${f.at ? '' : 'stored'}">${s.emoji} ${esc(s.name)}${f.at ? '' : '<small>rangé</small>'}</button>`; }).join('')}</div>
        <div class="pl-pad"><button type="button" data-a="left" aria-label="Gauche">◀</button><button type="button" data-a="up" aria-label="Haut">▲</button><button type="button" data-a="down" aria-label="Bas">▼</button><button type="button" data-a="right" aria-label="Droite">▶</button></div>
      </div>
      <div class="pl-bar">
        <button type="button" data-a="more" aria-label="Liste des meubles" aria-expanded="${this.expanded}">☰</button>
        <button type="button" data-a="rot">⟳<span>Tourner</span></button><button type="button" data-a="put" class="go">✓<span>Poser</span></button>
        <button type="button" data-a="stash">📦<span>Ranger</span></button><button type="button" data-a="view">${this.look.pitch > 1.45 ? '🎥' : '⬇️'}<span>${this.look.pitch > 1.45 ? 'Angle' : 'Dessus'}</span></button>
        <button type="button" data-a="done">Terminé</button>
      </div>`;
    this.el.classList.toggle('open', this.expanded);
    this.el.querySelectorAll<HTMLElement>('[data-uid]').forEach(b => b.addEventListener('click', () => this.select(b.dataset.uid!)));
    const A: Record<string, () => void> = { done: () => this.close(), left: () => this.move(-1, 0), right: () => this.move(1, 0), up: () => this.move(0, -1), down: () => this.move(0, 1), rot: () => this.rotate(), put: () => this.put(), stash: () => this.stash(),
      view: () => this.toggleView(), more: () => { this.expanded = !this.expanded; this.el.classList.toggle('open', this.expanded); this.el.querySelector('[data-a="more"]')?.setAttribute('aria-expanded', String(this.expanded)); } };
    this.el.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => A[b.dataset.a!]?.()));
    this.el.classList.add('on');
    this.status();
  }
}
