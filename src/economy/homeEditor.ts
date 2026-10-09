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
  private onTap = (e: PointerEvent) => this.tap(e);

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
    addEventListener('keydown', this.onKey, true);
    document.getElementById('c')?.addEventListener('pointerdown', this.onTap);
    this.render();
    return true;
  }

  close() {
    const v = this.view; if (!v) return;
    this.drop();
    v.furniture.remove(this.marker);
    for (const c of v.ceiling) c.visible = true;
    this.view = null; this.sel = null; this.pending = null;
    removeEventListener('keydown', this.onKey, true);
    document.getElementById('c')?.removeEventListener('pointerdown', this.onTap);
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
  move(dx: number, dz: number) { if (this.pending) { this.pending = nudge(this.pending, dx, dz); this.render(); } }
  rotate() { if (this.pending) { this.pending = turn(this.pending); this.render(); } }
  /** Moves the selected piece to a point of the room (home coordinates), on the grid. */
  moveTo(x: number, z: number) { if (this.pending) { this.pending = snap(x, z, this.pending.rot); this.render(); } }
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
      open: this.isOpen, selected: this.sel, pending: this.pending ? { ...this.pending } : null, why: this.isOpen ? this.why() : null,
      items: this.items().map(f => ({ uid: f.uid, spec: f.spec, at: f.at ? { ...f.at } : null })),
    };
  }

  // ---------------------------------------------------------------- camera, input, panel
  /** The view from above the room while placing (the module's camera hook); false when the editor is closed. */
  camera(): boolean {
    const v = this.view; if (!v) return false;
    const cam = this.ctx.camera, L = layoutOf(v.spec);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect;
    const portrait = cam.aspect < 1;
    const dist = Math.max((L.w / 2 + 0.5) / tanH, (L.d / 2 + 0.8) / tanV) * (portrait ? 1.18 : 1.05);
    const shift = L.d * (portrait ? 0.22 : 0.14);                         // the panel covers the bottom of the screen
    cam.position.set(v.ox, FLOOR + dist, v.oz + shift + dist * 0.16);
    cam.lookAt(v.ox, FLOOR, v.oz + shift);
    return true;
  }
  private tap(e: PointerEvent) {
    const v = this.view; if (!v) return;
    const cam = this.ctx.camera, rect = (e.target as HTMLElement).getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cam);
    const hits = this.ray.intersectObjects([...v.pieces.values()].map(p => p.obj), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object; while (o && !o.userData.uid) o = o.parent;
      if (o?.userData.uid && o.userData.uid !== this.sel) { this.select(o.userData.uid); return; }
      if (o?.userData.uid) break;
    }
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR), p)) this.moveTo(p.x - v.ox, p.z - v.oz);
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

  private render() {
    const v = this.view; if (!v) { this.el.classList.remove('on'); return; }
    const items = this.items(), why = this.why();
    const cur = items.find(f => f.uid === this.sel), fs = cur && furnitureSpec(cur.spec);
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    this.el.innerHTML = `<div class="pl-head"><b>Aménager · ${esc(v.spec.name.split(' · ')[0])}</b><button type="button" data-a="done">Terminé</button></div>
      <div class="pl-items">${items.map(f => { const s = furnitureSpec(f.spec)!; return `<button type="button" data-uid="${f.uid}" class="${f.uid === this.sel ? 'on' : ''} ${f.at ? '' : 'stored'}">${s.emoji} ${esc(s.name)}${f.at ? '' : '<small>rangé</small>'}</button>`; }).join('')}</div>
      <div class="pl-ctrl">
        <button type="button" data-a="left" aria-label="Gauche">◀</button><button type="button" data-a="up" aria-label="Haut">▲</button><button type="button" data-a="down" aria-label="Bas">▼</button><button type="button" data-a="right" aria-label="Droite">▶</button>
        <button type="button" data-a="rot">⟳ Tourner</button><button type="button" data-a="put" class="go">Poser</button><button type="button" data-a="stash">Ranger</button>
      </div>
      <small class="pl-status ${why ? 'bad' : 'ok'}">${fs ? esc(fs.name) + ' : ' : ''}${why ? esc(why) : 'la place est libre ✓'} · touche le sol pour le déplacer</small>`;
    this.el.querySelectorAll<HTMLElement>('[data-uid]').forEach(b => b.addEventListener('click', () => this.select(b.dataset.uid!)));
    const A: Record<string, () => void> = { done: () => this.close(), left: () => this.move(-1, 0), right: () => this.move(1, 0), up: () => this.move(0, -1), down: () => this.move(0, 1), rot: () => this.rotate(), put: () => this.put(), stash: () => this.stash() };
    this.el.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => A[b.dataset.a!]?.()));
    this.el.classList.add('on');
  }
}
