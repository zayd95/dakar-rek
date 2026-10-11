/**
 * A node host for the evening performance budget (docs/PERF_EVENING.md): the real Pikine hub with the real humanoid
 * (public/assets/character_v4.glb, parsed in node: it has no textures), every gameplay module of src/game/modules.ts
 * and the main loop's own systems (the cast's routines, the walkers, the traffic, the placed people, the apprentices,
 * the interaction focus, the follow camera), run in the order of main.ts `frameStep` and timed with the same sections as
 * its debug profiler (`module:<name>`, `npcLife`, `walkers+traffic+life+world`, `ambient(npc.ts)`, `rest of update`).
 *
 * It also counts the draw calls a frame would issue, the way three r169's WebGLRenderer does (frustum culling, the
 * sun's shadow pass on medium and high, transparent double-sided materials drawn twice, empty instanced meshes skipped),
 * per top-level group (children of ctx.extra and of the scene), like `__dakar.renderBreakdown()`.
 *
 * Node is not the browser: no WebGL upload, no audio, blank canvas textures, and the JIT differs. The numbers compare
 * builds on this machine; the browser check (scripts/check-perf-evening.mjs) stays the reference.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import type { GameCtx, GameModule, GameMode } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import type { Seat } from '../src/interact/seats';

export type Quality = 'low' | 'medium' | 'high';
export const MOMENTS = ['17:30 arrivals', '19:00 bout', '23:00 outflow'] as const;
export type MomentName = (typeof MOMENTS)[number];

// ------------------------------------------------------------------ a DOM good enough for the modules' UI bits
const ctx2d: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4 * 64 * 64), width: 64, height: 64 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
function element(tag = 'div'): unknown {
  const own: Record<string | symbol, unknown> = { tagName: tag.toUpperCase(), style: {}, dataset: {}, textContent: '', innerHTML: '', className: '', id: '', width: 64, height: 64, hidden: false, value: '' };
  const classes = new Set<string>();
  const classList = { add: (...c: string[]) => { for (const x of c) classes.add(x); }, remove: (...c: string[]) => { for (const x of c) classes.delete(x); },
    toggle: (c: string, on?: boolean) => { const v = on ?? !classes.has(c); if (v) classes.add(c); else classes.delete(c); return v; }, contains: (c: string) => classes.has(c) };
  return new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      switch (k) {
        case 'classList': return classList;
        case 'getContext': return () => ctx2d;
        case 'toDataURL': return () => '';
        case 'querySelector': return () => element();
        case 'querySelectorAll': case 'getElementsByTagName': case 'getElementsByClassName': return () => [];
        case 'children': case 'childNodes': return [];
        case 'parentNode': case 'parentElement': case 'firstChild': case 'lastChild': case 'nextSibling': case 'firstElementChild': return null;
        case 'getBoundingClientRect': return () => ({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 });
        case 'appendChild': case 'append': case 'prepend': case 'insertBefore': case 'replaceChildren': return (c: unknown) => c;
        case 'offsetWidth': case 'offsetHeight': case 'clientWidth': case 'clientHeight': case 'scrollHeight': case 'scrollTop': return 0;
        case 'contains': return () => false;
        default: return () => {};
      }
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
let domReady = false;
function stubDom() {
  if (domReady) return;
  domReady = true;
  const g = globalThis as Record<string, unknown>;
  const ui = element('div');
  if (!g.document) {
    g.document = {
      createElement: (t: string) => element(t), createElementNS: (_n: string, t: string) => element(t), createTextNode: () => element('#text'),
      getElementById: (id: string) => (id === 'ui' ? ui : null), querySelector: () => null, querySelectorAll: () => [],
      body: element('body'), head: element('head'), documentElement: element('html'), addEventListener() {}, removeEventListener() {}, hidden: false,
    };
  }
  g.window ??= g;
  g.innerWidth ??= 1280; g.innerHeight ??= 720;
  g.addEventListener ??= () => {}; g.removeEventListener ??= () => {};
  g.requestAnimationFrame ??= () => 0;
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  g.MutationObserver ??= Observer; g.ResizeObserver ??= Observer; g.IntersectionObserver ??= Observer;
}

// ------------------------------------------------------------------ the humanoid, parsed in node
let humanoid = false;
/** Loads the shipped humanoid through the game's own preloadHumanoid (the GLB has no textures: it parses in node). */
export async function loadHumanoid() {
  if (humanoid) return;
  stubDom();
  const { preloadHumanoid, humanoidReady } = await import('../src/actors/humanoid');
  const bytes = readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url));
  const g = globalThis as unknown as { fetch: (u: unknown) => Promise<Response> };
  const real = g.fetch;
  g.fetch = async (u: unknown) => (String(u).endsWith('character_v4.glb') ? new Response(bytes as unknown as ArrayBuffer) : real(u));
  try { await preloadHumanoid('/'); } finally { g.fetch = real; }
  humanoid = humanoidReady();
  if (!humanoid) throw new Error('the humanoid did not load in node');
}

// ------------------------------------------------------------------ draw calls, as three r169 counts them
const _frustum = new THREE.Frustum(), _proj = new THREE.Matrix4();
type Drawable = THREE.Mesh | THREE.Points | THREE.Line;
function callsOf(o: Drawable, mainPass: boolean): number {
  const geo = o.geometry as THREE.BufferGeometry, mats = o.material as THREE.Material | THREE.Material[];
  const index = geo.index, position = geo.attributes.position as THREE.BufferAttribute | undefined;
  const one = (m: THREE.Material | undefined, group: { start: number; count: number } | null) => {
    if (!m || !m.visible) return 0;
    let s = geo.drawRange.start, e = geo.drawRange.start + geo.drawRange.count;
    if (group) { s = Math.max(s, group.start); e = Math.min(e, group.start + group.count); }
    if (index) { s = Math.max(s, 0); e = Math.min(e, index.count); } else if (position) { s = Math.max(s, 0); e = Math.min(e, position.count); }
    const n = e - s;
    if (n < 0 || n === Infinity) return 0;
    if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0) return 0;   // renderInstances: no primitive, no call
    return mainPass && m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1;      // back faces, then front faces
  };
  if (Array.isArray(mats)) { let n = 0; for (const g of geo.groups) n += one(mats[g.materialIndex ?? 0], g); return n; }
  return one(mats, null);
}
/** What the renderer's projectObject does to a THREE.LOD it reaches (visible, on the camera's layers): picks the level. */
function updateLods(o: THREE.Object3D, camera: THREE.Camera) {
  if (!o.visible) return;
  if ((o as THREE.LOD).isLOD && (o as THREE.LOD).autoUpdate && o.layers.test(camera.layers)) (o as THREE.LOD).update(camera);
  for (const c of o.children) updateLods(c, camera);
}
function cameraFrustum(cam: THREE.Camera) {
  cam.updateMatrixWorld();
  _proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return new THREE.Frustum().setFromProjectionMatrix(_proj);
}
/**
 * Draw calls of one frame per top-level group: the main pass (what `renderer.info.render.calls` reports: three resets
 * its counters after the shadow pass) and the sun's shadow pass (on medium and high), counted apart.
 */
export function countCalls(scene: THREE.Scene, extra: THREE.Object3D, camera: THREE.Camera, shadow: THREE.Camera | null) {
  const by: Record<string, number> = {}, byShadow: Record<string, number> = {};
  let main = 0, shade = 0;
  const top = (o: THREE.Object3D, t: THREE.Object3D | null) => (o.parent === extra || (o.parent === scene && o !== extra) ? o : t);
  const key = (t: THREE.Object3D | null) => (t ? t.name || t.type : 'scene');
  const mainF = cameraFrustum(camera);
  const walk = (o: THREE.Object3D, t: THREE.Object3D | null) => {
    if (!o.visible) return;
    t = top(o, t);
    if (o.layers.test(camera.layers)) {
      if ((o as THREE.LOD).isLOD) { if ((o as THREE.LOD).autoUpdate) (o as THREE.LOD).update(camera); }
      else if ((o as THREE.Sprite).isSprite) {
        if ((!o.frustumCulled || mainF.intersectsSprite(o as THREE.Sprite)) && ((o as THREE.Sprite).material as THREE.Material).visible) { main++; by[key(t)] = (by[key(t)] ?? 0) + 1; }
      } else if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
        if (!o.frustumCulled || mainF.intersectsObject(o)) { const n = callsOf(o as Drawable, true); main += n; if (n) by[key(t)] = (by[key(t)] ?? 0) + n; }
      }
    }
    for (const c of o.children) walk(c, t);
  };
  walk(scene, null);
  if (shadow) {
    _frustum.copy(cameraFrustum(shadow));
    const sw = (o: THREE.Object3D, t: THREE.Object3D | null) => {
      if (!o.visible) return;
      t = top(o, t);
      if (o.layers.test(camera.layers) && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && o.castShadow && (!o.frustumCulled || _frustum.intersectsObject(o))) {
        const n = callsOf(o as Drawable, false); shade += n; if (n) byShadow[key(t)] = (byShadow[key(t)] ?? 0) + n;
      }
      for (const c of o.children) sw(c, t);
    };
    sw(scene, null);
  }
  return { calls: main, shadow: shade, by, byShadow };
}

/** The process's CPU time (ms), or wall time where there is no process (never in node). */
const cpuNow = () => { const p = (globalThis as { process?: { cpuUsage(): { user: number; system: number } } }).process; if (!p) return performance.now(); const u = p.cpuUsage(); return (u.user + u.system) / 1000; };

// ------------------------------------------------------------------ the host
const VIEW: Record<Quality, { aspect: number; fov: number; portrait: boolean; shadows: boolean }> = {
  low: { aspect: 390 / 844, fov: 66, portrait: true, shadows: false },
  medium: { aspect: 1280 / 720, fov: 58, portrait: false, shadows: true },
  high: { aspect: 1280 / 720, fov: 58, portrait: false, shadows: true },
};
const QUAL = { low: { crowd: 8, traffic: 4 }, medium: { crowd: 12, traffic: 7 }, high: { crowd: 16, traffic: 10 } };
/** A Friday: the big gala (src/arena/exterior.ts eveningSize), as the browser check picks. */
export const GALA_DAY = 4;

type Mod = Awaited<ReturnType<typeof loadModules>>;
async function loadModules() {
  stubDom();
  await loadHumanoid();
  return {
    builder: await import('../src/world/builder'),
    modules: await import('../src/game/modules'),
    humanoid: await import('../src/actors/humanoid'),
    npc: await import('../src/actors/npc'),
    life: await import('../src/actors/life'),
    placed: await import('../src/actors/placedPeople'),
    apprenti: await import('../src/actors/apprenti'),
    camera: await import('../src/actors/camera'),
    npcLife: await import('../src/social/npcLife'),
    relations: await import('../src/social/relations'),
    state: await import('../src/core/state'),
    save: await import('../src/core/save'),
    clock: await import('../src/core/clock'),
    rng: await import('../src/core/rng'),
    system: await import('../src/interact/system'),
    seats: await import('../src/interact/seats'),
    people: await import('../src/interact/people'),
    runner: await import('../src/activity/runner'),
    places: await import('../src/activity/places'),
    inventory: await import('../src/activity/inventory'),
  };
}
let mods: Promise<Mod> | null = null;

const noop = () => {};
/** Every member a no-op that returns undefined (the HUD, the input): the modules call them, nothing is shown. */
function inert<T>(own: Record<string, unknown> = {}): T {
  return new Proxy(own, { get: (t, k) => (typeof k === 'symbol' ? undefined : k in t ? t[k] : noop), set: (t, k, v) => { t[k as string] = v; return true; } }) as T;
}

export interface FrameTimes { [section: string]: number }

export class PerfHost {
  readonly scene = new THREE.Scene();
  readonly extra = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly shadowCam = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.5, 220);
  readonly pos = new THREE.Vector3();
  facing = 0; speed = 0;
  hour = 12; day = GALA_DAY;
  mode: GameMode = 'play';
  seated: Seat | null = null;
  world!: HubWorld;
  ctx!: GameCtx;
  modules!: GameModule[];
  private now = Date.now();
  private sys!: {
    npcLife: { update(dt: number, p: { x: number; z: number }, v: { x: number; z: number }): void };
    crowd: { update(dt: number): void }; traffic: { update(dt: number): void }; life: { update(dt: number): void } | null;
    ambient: { update(dt: number, v: { x: number; z: number }, d: number): void };
    apprentices: { h: { group: THREE.Object3D }; update(dt: number, near: boolean): void }[];
    interactions: { update(space: string, x: number, z: number, facing: number): unknown };
    seats: InstanceType<Mod['seats']['Seats']>;
    activities: { update(dt: number): void };
    follow: InstanceType<Mod['camera']['FollowCamera']>;
    body: { group: THREE.Object3D; hold: unknown; animate(dt: number, speed: number): void } | null;
    daylight: (h: number) => number;
    sitY: (s: Seat) => number;
    view?: (camera: THREE.Camera) => void;
  };

  constructor(readonly q: Quality) {
    const v = VIEW[q];
    this.camera = new THREE.PerspectiveCamera(v.fov, v.aspect, 0.3, 700);
    this.scene.add(this.extra);
  }

  /** Builds the hub and every module, as main.ts start() and loadHub() do. */
  async load(at: { x: number; z: number; yaw: number }, hour: number) {
    const M = await (mods ??= loadModules());
    this.hour = hour;
    const q = this.q, rand = M.rng.rng(0x5eed);
    const state = new M.state.GameState(M.save.newSave(this.now));
    const hud = inert<GameCtx['hud']>({ modalOpen: false });
    const input = inert<GameCtx['input']>({ keys: new Set(), move: () => ({ x: 0, y: 0 }), enabled: true });
    const interactions = new M.system.Interactions(), seats = new M.seats.Seats();
    const activities = new M.runner.ActivityRunner({
      state, seats, space: () => this.ctx.space(), player: () => ({ x: this.pos.x, z: this.pos.z }), seated: () => this.seated,
      sit: (s: Seat) => { this.sit(s); return this.seated?.id === s.id; }, clip: noop, stand: () => this.stand(), busy: noop, progress: noop, toast: noop, save: noop,
      rel: noop, flag: noop, item: noop, hasItem: () => false, category: noop, pay: (m: number) => m, payPreview: (m: number) => m,
    } as unknown as ConstructorParameters<typeof M.runner.ActivityRunner>[0]);
    const places = new M.places.Places(activities, () => this.hour);
    interactions.add(places);
    const people = interactions.add(new M.people.People(() => [], activities, noop, () => ({ x: this.pos.x, z: this.pos.z }))) as GameCtx['people'];
    const inventory = new M.inventory.Inventory(state);
    const follow = new M.camera.FollowCamera(this.camera);
    const world = this.world = M.builder.buildHub('pikine', q === 'low', q);
    world.group.name ||= 'hub';                                            // (the breakdown's name for the hub's own meshes)
    this.scene.add(world.group);
    const moduleSpace = () => { for (const m of this.modules) { const s = m.space?.(this.ctx); if (s) return s; } return null; };
    const ctx: GameCtx = this.ctx = {
      scene: this.scene, camera: this.camera, follow, extra: this.extra, state, hud, input, interactions, seats, people, places, activities, inventory,
      quality: () => q, world: () => this.world, inside: () => null, space: () => moduleSpace() ?? 'street',
      hour: () => this.hour, day: () => this.day, now: () => this.now,
      player: {
        pos: this.pos, facing: () => this.facing, body: () => this.sys?.body as never, seated: () => this.seated,
        sit: s => this.sit(s), standUp: () => this.stand(), place: (x, z, yaw) => this.place(x, z, yaw), cheer: () => false,
      },
      peers: () => [], mode: () => this.mode, setMode: m => { this.mode = m; },
      menu: () => { /* a sheet would open: the player keeps playing here */ }, guide: () => null, toast: noop, save: noop,
      addInterior: (_door, int) => { world.group.add(int.group); int.group.visible = false; seats.addAll(int.seats.map(s => ({ ...s, space: _door.id }))); },
      enter: noop, exit: noop, startBout: () => false, walkTo: noop, setPublicRecord: noop, travel: noop,
    };
    this.modules = M.modules.MODULES;
    for (const m of this.modules) m.init?.(ctx);
    const H = M.humanoid;
    const body = new H.Humanoid(H.randomLook(rand)); this.scene.add(body.group);
    (body as { fullRate?: boolean }).fullRate = true;                       // main.ts: the player's own body, always in full
    // loadHub: the walkers, the traffic, the apprentices, the placed people, the cast, the seats, then the modules
    const crowd = new M.npc.Crowd(world, rand, QUAL[q].crowd), traffic = new M.npc.DecorativeTraffic(world, rand, QUAL[q].traffic);
    this.extra.add(crowd.group, traffic.group);
    const apprentices = world.rapides.map(car => { const a = new M.apprenti.Apprentice('pikine', rand); a.attach(car); return a; });
    for (const car of traffic.rapides()) { const a = new M.apprenti.Apprentice('pikine', rand, true); a.attach(car); apprentices.push(a); }
    const ambient = new M.placed.PlacedPeople(world, rand, h => this.extra.add(h.group));
    const life = world.monument ? new M.life.MonumentLife(world.monument, rand, QUAL[q].crowd) : null;
    if (life) this.extra.add(life.group);
    const rel = new M.relations.Relations(state.data);
    const npcLife = new M.npcLife.NpcLife({ hud, rel, state, clock: () => ({ hour: this.hour, day: this.day }), menuMode: noop, save: noop, openBeat: noop });
    npcLife.load(world, this.extra);
    seats.addAll(world.seats);
    for (const p of world.people) if (p.clip === 'Sit') seats.occupyNear('street', p.x, p.z, 'npc');
    for (const m of this.modules) m.hubLoaded?.(ctx, world);
    this.sys = { npcLife, crowd, traffic, life, ambient, apprentices, interactions, seats, activities, follow, body, daylight: M.clock.daylight, sitY: M.seats.sitOriginY,
      view: (M.humanoid as { setHumanoidView?: (c: THREE.Camera) => void }).setHumanoidView };
    this.place(at.x, at.z, at.yaw);
  }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0.1 + this.world.heightAt(x, z), z); this.facing = yaw;
    this.sys?.follow.snapBehind(yaw);
  }
  sit(s: Seat) {
    if (this.seated || !this.sys.seats.occupy(s.id, 'player')) return;
    this.seated = s; this.speed = 0;
    this.pos.set(s.x, this.sys.sitY(s), s.z); this.facing = s.yaw;
  }
  seat(id: string): Seat { const s = this.sys.seats.get(id); if (!s) throw new Error('no seat ' + id); return s; }
  stand() {
    const s = this.seated; if (!s) return;
    this.sys.seats.release(s.id, 'player'); this.seated = null;
    if (this.sys.body) this.sys.body.hold = null;
  }
  /** A module's debug hooks (window.__dakar in the browser). */
  debug<T>(name: string): T {
    for (const m of this.modules) { const d = m.debug?.(this.ctx); if (d && name in d) return d[name] as T; }
    throw new Error('no debug hook ' + name);
  }

  /** One frame of main.ts frameStep (without input, presence, chat, the economy and the HUD). `times`: per section (ms). */
  frame(dt: number, times?: FrameTimes) {
    const ctx = this.ctx, S = this.sys, now = performance.now.bind(performance);
    this.now += dt * 1000;
    const cpu0 = times ? cpuNow() : 0;
    S.view?.(this.camera);                                   // the camera as last rendered: the humanoids' animation detail
    const mark = (k: string, t0: number) => { if (times) times[k] = (times[k] ?? 0) + now() - t0; return now(); };
    S.activities.update(dt);
    for (const m of this.modules) { const t = now(); m.update?.(ctx, dt); mark('module:' + m.name, t); }
    // the player: seated on the tiers, or standing in the street (no input here)
    const body = S.body;
    if (this.seated) {
      this.pos.set(this.seated.x, S.sitY(this.seated), this.seated.z); this.facing = this.seated.yaw;
      if (body) body.hold = this.seated.clip ?? 'Sit';
    } else this.speed *= 0.8;
    if (body) { body.group.visible = true; body.group.position.copy(this.pos); body.group.rotation.y = this.facing; body.animate(dt, this.speed); }
    let t = now();
    S.npcLife.update(dt, this.pos, this.camera.position);
    t = mark('npcLife', t);
    S.crowd.update(dt); S.traffic.update(dt); S.life?.update(dt); this.world.tick(dt);
    t = mark('walkers+traffic+life+world', t);
    S.ambient.update(dt, this.camera.position, this.q === 'low' ? 55 : 90);
    t = mark('ambient(npc.ts)', t);
    for (const a of S.apprentices) { const wp = a.h.group.getWorldPosition(new THREE.Vector3()); a.update(dt, Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 22); }
    if (this.mode === 'play') S.interactions.update(ctx.space(), this.pos.x, this.pos.z, this.facing);
    const drag = { yaw: 0, pitch: 0 };
    if (!this.modules.some(m => m.camera?.(ctx, dt, drag))) {
      S.follow.update(dt, this.pos, this.facing, drag, this.world.colliders, VIEW[this.q].portrait, this.speed > 0.5, undefined, (x, z) => this.world.heightAt(x, z), this.world.canopies);
    }
    // the lighting's share that changes what is drawn (main.ts updateLighting)
    const d = S.daylight(this.hour), night = 1 - Math.min(1, Math.max(0, d * 3.2));
    this.world.lampGlow.visible = night > 0.3;
    t = mark('rest of update', t);
    if (times) times['cpu'] = (times['cpu'] ?? 0) + cpuNow() - cpu0;     // the update's CPU time (preemption left out)
    // renderer.render: every world matrix, the scene's hook (the vehicle lamps), the LODs' levels for this camera
    this.scene.updateMatrixWorld();
    this.scene.onBeforeRender(null as never, this.scene, this.camera, null as never, null as never, null as never);
    updateLods(this.scene, this.camera);
    if (times) times['render prep (not update)'] = (times['render prep (not update)'] ?? 0) + now() - t;
  }

  /** The sun's (or the moon's) shadow camera of main.ts updateLighting, round the player; null on low (no shadow map). */
  shadowCamera(): THREE.Camera | null {
    if (!VIEW[this.q].shadows) return null;
    const h = this.hour, isNight = h < 6 || h >= 19, a = Math.min(1, Math.max(0, (h - 6) / 13)) * Math.PI;
    const sun = new THREE.Vector3(Math.cos(a) * 0.85, Math.sin(a) * 0.95, 0.42).normalize();
    const ld = isNight ? new THREE.Vector3(-0.35, 0.85, 0.3).normalize() : new THREE.Vector3(sun.x, Math.max(0.22, sun.y), sun.z).normalize();
    this.shadowCam.position.copy(this.pos).addScaledVector(ld, 90); this.shadowCam.lookAt(this.pos);
    this.shadowCam.updateMatrixWorld();
    return this.shadowCam;
  }
  calls() { return countCalls(this.scene, this.extra, this.camera, this.shadowCamera()); }
}

export interface MomentResult {
  q: Quality; moment: MomentName; frames: number;
  /** Mean ms per frame of the update (all sections but the render prep), and per section. */
  update: number; sections: Record<string, number>;
  /** The update's CPU time (ms a frame, the process's: steadier than wall time when other processes share the cores). */
  cpu: number;
  /** Draw calls of the main pass (as the browser's `renderer.info`) and of the shadow pass, averaged over the measured
   *  frames (sampled), and the last sample's breakdown per group. */
  calls: number; shadow: number; by: Record<string, number>; byShadow: Record<string, number>;
  /** The most draw calls of the main pass seen on a sample, and per group (a moment's spike: a body budget catching up). */
  callsMax: number; byMax: Record<string, number>;
  arena: { phase: string; street: string } | null;
}

/**
 * The browser check's evening (scripts/check-perf-evening.mjs) in node: 17:30 in front of the gate, 19:00 seated on the
 * tiers during the main bout, 23:00 in front of the gate after standing up. `frames` measured per moment at `dt`.
 */
export async function runEvening(q: Quality, o: { frames?: number; dt?: number; warm?: number; around?: (moment: MomentName, at: 'start' | 'end') => void } = {}): Promise<MomentResult[]> {
  const frames = o.frames ?? 300, dt = o.dt ?? 1 / 30, warm = o.warm ?? 240;
  const host = new PerfHost(q);
  await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
  const out: MomentResult[] = [];
  type ArenaDbg = { info(): { phase: string; street: string; centre: { x: number; z: number }; day: number } | null; go(p: string): void; freeSeat(x: number, z: number): { id: string; x: number; z: number; yaw: number } | null; day(d: number | null): void };
  const arena = host.debug<ArenaDbg>('arena');
  arena.day(GALA_DAY);
  /** `frames` frames (fewer when `still` stops holding: the bout's own frames only). */
  const measure = (moment: MomentName, still: () => boolean = () => true) => {
    const sum: FrameTimes = {};
    let calls = 0, shadow = 0, samples = 0, by: Record<string, number> = {}, byShadow: Record<string, number> = {}, n = 0, callsMax = 0;
    const byMax: Record<string, number> = {};
    const a0 = arena.info();
    o.around?.(moment, 'start');
    for (; n < frames && (n % 10 || still()); n++) {
      host.frame(dt, sum);
      if (n % 10 === 9) {
        const c = host.calls(); calls += c.calls; shadow += c.shadow; samples++; by = c.by; byShadow = c.byShadow;
        callsMax = Math.max(callsMax, c.calls);
        for (const [k, v] of Object.entries(c.by)) byMax[k] = Math.max(byMax[k] ?? 0, v);
      }
    }
    o.around?.(moment, 'end');
    const sections: Record<string, number> = {};
    let update = 0;
    for (const [k, v] of Object.entries(sum)) { if (k === 'cpu') continue; sections[k] = v / n; if (!k.startsWith('render prep')) update += v / n; }
    out.push({ q, moment, frames: n, update, cpu: (sum.cpu ?? 0) / n, sections, calls: calls / Math.max(1, samples), shadow: shadow / Math.max(1, samples), by, byShadow, callsMax, byMax, arena: a0 ? { phase: a0.phase, street: a0.street } : null });
  };
  // 1. 17:30: the fans arrive and queue; the player in front of the gate
  for (let k = 0; k < warm; k++) host.frame(dt);
  measure('17:30 arrivals');
  // 2. 19:00: a ticket, a place on the tiers, the main bout (the preliminaries skipped, as the browser check does)
  host.hour = 19;
  const a0 = arena.info()!;
  host.ctx.state.data.counters.arena_ticket_day = a0.day;
  const C = a0.centre, seat = arena.freeSeat(C.x + 9, C.z - 14)!;
  host.sit(host.seat(seat.id));
  const phase = () => arena.info()!.phase;
  for (let k = 0; k < 600 && (k % 5 || !['prelims', 'entrance', 'bout'].includes(phase())); k++) host.frame(dt);
  if (['filling', 'prelims'].includes(phase())) arena.go('entrance');
  for (let k = 0; k < 3000 && phase() !== 'bout'; k++) host.frame(dt);
  for (let k = 0; k < 20; k++) host.frame(dt);
  measure('19:00 bout', () => arena.info()!.phase === 'bout');
  // 3. 23:00: the bout over (its result and fête under way: the outflow begins), up from the place, in front of the gate
  type Speed = (n: number) => void;
  host.debug<{ speed: Speed }>('arena').speed(10);
  for (let k = 0; k < 3000 && phase() === 'bout'; k++) host.frame(dt);
  host.debug<{ speed: Speed }>('arena').speed(1);
  host.stand();
  host.hour = 23;
  host.place(6, -66.3, 1.0);
  for (let k = 0; k < Math.max(30, warm / 2); k++) host.frame(dt);
  measure('23:00 outflow');
  return out;
}
