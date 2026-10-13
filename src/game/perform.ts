import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import type { Step } from '../activity/types';
import type { Collider } from '../world/types';
import { Humanoid, humanoidReady } from '../actors/humanoid';
import { bend, bodyAxes, bodyPoint, crouch, forearmDir, grip, mouth, nod, reach } from '../actors/gesture';
import { segClear, type Rect } from '../interact/approach';

/**
 * Actions are done in the world, not only shown as a progress bar: while an activity step runs, the player carries
 * the crates from the pirogue to the pile, cleans the fish on the market table, drinks the café Touba from a cup, runs
 * on the Corniche, washes at the bucket, has their hair cut by the hairdresser… and the progress is visible in what
 * changes (the pile that grows, the cup that empties, the basin filled). One performance per kind of action; the
 * runner (src/activity/runner.ts) keeps the timing, the price and the effects.
 *
 * Gestures are procedural (src/actors/gesture.ts: arm reach, torso bend, nod, crouch) on top of the rig's clips; props
 * are plain shapes in the game's own design (no brand, no text). Walks only follow straight lines that are clear of
 * the space's colliders, and work happens on the real counter or table of the place when there is one at hand.
 */
type Kind = 'carry' | 'handwork' | 'run' | 'pullups' | 'talk' | 'watch' | 'look' | 'drink' | 'eat' | 'pay' | 'wash' | 'groom' | 'stretch' | 'listen' | 'tv' | 'sleep' | 'haircut';

/** Which performance an action gets (by action id), with the kind of object it handles. */
const BY_ID: Record<string, [Kind, string?]> = {
  pecheurs: ['carry', 'crate'], pirogue: ['carry', 'crate'], debarquement: ['carry', 'crate'], debarquer: ['carry', 'crate'],
  'boutique-stock': ['carry', 'carton'], 'maison-service': ['carry', 'carton'], expo: ['carry', 'panel'], courrier: ['carry', 'files'],
  meca: ['handwork', 'parts'], meca_conf: ['handwork', 'parts'], filets: ['handwork', 'net'], 'poisson-service': ['handwork', 'fish'],
  atelier: ['handwork', 'basket'], 'tech-service': ['handwork', 'phone'], couture: ['handwork', 'fabric'], vendre: ['handwork', 'produce'],
  grill: ['handwork', 'skewer'], peche: ['carry', 'crate'],
  courir: ['run'], barres: ['pullups'],
  touba: ['drink', 'coffee'], aida_tournee: ['drink', 'coffee'], bouye: ['drink', 'juice'], attaya: ['drink', 'attaya'], 'attaya-place': ['drink', 'attaya'], soda: ['drink', 'soda'],
  brochettes: ['eat', 'skewer'], 'pain-lait': ['eat', 'bread'],
  galerie: ['look'], 'maison-idees': ['look'], 'savoir-faire': ['look'], dames: ['watch'],
  laver: ['wash'], ablutions: ['wash'], preparer: ['groom'], tapis: ['stretch'], radio: ['listen'], tele: ['tv'], dormir: ['sleep'], coiffure: ['haircut'],
};

function kindOf(id: string, step: Step, seated: boolean, plain = false): [Kind, string?] | null {
  if (step.gesture) return null;                                        // the shared timing gesture shows itself (src/activity/gestures.ts)
  const k = BY_ID[id];
  if (k) return k;
  if (step.clip && !plain) return null;                                 // a venue's own pose (prayer, dance, a cook's Grab…): left to it
  if (step.primitive === 'sleep') return ['sleep'];
  if (seated) return null;                                              // meals at a table: src/game/meals.ts
  switch (step.primitive) {
    case 'talk': case 'greet': return ['talk'];
    case 'work': case 'fish': return ['handwork', 'parts'];
    case 'eat': return ['eat', 'bread'];
    case 'drink': return ['drink', 'juice'];
    case 'buy': case 'sell': return ['pay'];
    case 'wash': return ['wash'];
    case 'pray': case 'wait': return null;
    default: return !plain ? null : step.effects?.counters?.chats ? ['talk'] : ['watch'];
  }
}

// ------------------------------------------------------------------ props (plain shapes, own design)
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: number, opacity = 1) => {
  const k = `${c}/${opacity}`; let m = mats.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide }); mats.set(k, m); }
  return m;
};
const mesh = (g: THREE.BufferGeometry, c: number, o = 1) => { const m = new THREE.Mesh(g, mat(c, o)); m.castShadow = o >= 1; return m; };
const box = (w: number, h: number, d: number, c: number) => mesh(new THREE.BoxGeometry(w, h, d), c);
const cyl = (r1: number, r2: number, h: number, c: number, o = 1, open = false) => mesh(new THREE.CylinderGeometry(r1, r2, h, 14, 1, open), c, o);
const ball = (r: number, c: number, sy = 1) => { const m = mesh(new THREE.SphereGeometry(r, 12, 8), c); m.scale.y = sy; return m; };
const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
const grp = (...o: THREE.Object3D[]) => { const g = new THREE.Group(); if (o.length) g.add(...o); return g; };

/** A fish lying flat along x (body + tail), centred on its belly. */
function fish(c: number, s = 1) {
  const b = ball(0.05 * s, c, 0.42); b.scale.x = 3; b.position.y = 0.02 * s;
  const t = box(0.05 * s, 0.01, 0.08 * s, c); t.position.set(-0.17 * s, 0.02 * s, 0);
  return grp(b, t);
}

/** A carried load (origin at its bottom centre), its height in a pile and half its width (where the hands hold it). */
interface Load { obj: THREE.Object3D; h: number; w: number }
function load(type: string): Load {
  if (type === 'crate') {                                               // blue fish crate with the catch on top
    const g = grp(put(box(0.52, 0.22, 0.36, 0x2f7fc4), 0, 0.11, 0), put(box(0.54, 0.04, 0.38, 0x1f5f99), 0, 0.22, 0));
    for (let i = 0; i < 3; i++) { const f = fish(i % 2 ? 0xc4d2d8 : 0xa9bcc4, 0.9); f.position.set(-0.11 + i * 0.11, 0.2, i % 2 ? 0.08 : -0.07); f.rotation.y = 0.35 * i - 0.35; g.add(f); }
    return { obj: g, h: 0.24, w: 0.27 };
  }
  if (type === 'panel') {                                               // an exhibition panel: frame and a plain picture
    const g = grp(put(box(0.8, 0.6, 0.05, 0xeee8dc), 0, 0.3, 0), put(box(0.6, 0.4, 0.052, 0x3e8d87), 0, 0.3, 0), put(box(0.3, 0.2, 0.054, 0xe9be43), 0.1, 0.34, 0));
    return { obj: g, h: 0.06, w: 0.4 };
  }
  if (type === 'files') {                                               // a pile of folders
    const g = grp(); [0xd9b46a, 0x5d8fb8, 0xc85a4a, 0xe8e2d0].forEach((c, i) => g.add(put(box(0.32, 0.03, 0.24, c), 0, 0.015 + i * 0.031, 0)));
    return { obj: g, h: 0.125, w: 0.16 };
  }
  const g = grp(put(box(0.46, 0.32, 0.34, 0xb98c56), 0, 0.16, 0), put(box(0.47, 0.012, 0.07, 0xe0c890), 0, 0.322, 0), put(box(0.07, 0.2, 0.345, 0xa47a48), -0.12, 0.2, 0));
  return { obj: g, h: 0.32, w: 0.23 };                                  // carton
}

/** What a pile stands on: a wooden pallet (0.12 m) or, for papers, a small table (0.72 m). */
function pileBase(type: string): [THREE.Object3D, number] {
  if (type === 'files') {
    const g = grp(put(box(0.6, 0.04, 0.45, 0x8b6a47), 0, 0.7, 0));
    for (const [x, z] of [[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]]) g.add(put(box(0.04, 0.68, 0.04, 0x4a3424), x, 0.34, z));
    return [g, 0.72];
  }
  const g = grp(put(box(0.66, 0.03, 0.48, 0xb08d5e), 0, 0.105, 0));
  for (const z of [-0.19, 0, 0.19]) g.add(put(box(0.66, 0.09, 0.08, 0x7d5c3a), 0, 0.045, z));
  return [g, 0.12];
}

/** An item worked by hand, before and after (cleaned, repaired, packed…); origin at its bottom. */
function piece(type: string, done: boolean): THREE.Object3D {
  switch (type) {
    case 'fish': return fish(done ? 0xe4eaec : 0x8a9ea6);
    case 'basket': { const b = put(cyl(0.1, 0.07, 0.08, 0xcda55c), 0, 0.04, 0); const g = grp(b); if (done) g.add(put(cyl(0.105, 0.105, 0.015, 0x8a5a2a), 0, 0.085, 0)); return g; }
    case 'phone': { const g = grp(put(box(0.08, 0.016, 0.15, 0x1d1d1f), 0, 0.008, 0)); if (done) g.add(put(box(0.11, 0.05, 0.18, 0xe8e8ea), 0, 0.025, 0)); else g.add(put(box(0.066, 0.004, 0.125, 0x4c98ba), 0, 0.018, 0)); return g; }
    case 'fabric': { const c = [0xd34c3c, 0xe9be43, 0x3e8d87, 0x566aba][Math.floor(Math.random() * 4)]; return done ? grp(put(box(0.2, 0.05, 0.15, c), 0, 0.025, 0)) : grp(put(box(0.26, 0.02, 0.22, c), 0, 0.01, 0)); }
    case 'produce': return grp(put(ball(0.05, done ? 0xd9322b : 0xc4572b, 0.9), 0, 0.045, 0));
    case 'skewer': { const g = grp(put(box(0.26, 0.012, 0.012, 0xd8c8a0), 0, 0.025, 0)); for (let i = 0; i < 3; i++) g.add(put(box(0.05, 0.045, 0.045, done ? 0x5a2c12 : 0xa0523a), -0.06 + i * 0.06, 0.025, 0)); return g; }
    case 'net': return grp(put(box(done ? 0.18 : 0.24, done ? 0.06 : 0.035, done ? 0.14 : 0.2, done ? 0x2f6f4a : 0x4f8a5c), 0, done ? 0.03 : 0.018, 0));
    default: { const g = grp(put(cyl(0.045, 0.045, 0.05, done ? 0xc7ccd2 : 0x5f5a55), 0, 0.025, 0)); g.add(put(cyl(0.02, 0.02, 0.052, done ? 0x8a9096 : 0x3a3633), 0, 0.026, 0)); return g; }   // parts
  }
}

/** Where the finished items go on the table (a tub of water for the fish, a tray for the parts, a cloth for the produce), with its floor height. */
function container(type: string): [THREE.Object3D, number] | null {
  if (type === 'fish') {
    const g = grp(put(cyl(0.2, 0.16, 0.12, 0x2f86c8, 1, true), 0, 0.06, 0), put(cyl(0.16, 0.16, 0.01, 0x2f86c8), 0, 0.005, 0), put(cyl(0.185, 0.185, 0.01, 0x9fd4ee, 0.75), 0, 0.07, 0));
    return [g, 0.012];
  }
  if (type === 'parts' || type === 'phone') return [grp(put(box(0.34, 0.03, 0.26, type === 'parts' ? 0x7f8a96 : 0xe9e4d8), 0, 0.015, 0)), 0.03];
  if (type === 'produce') return [grp(put(box(0.36, 0.006, 0.3, 0xd9a14a), 0, 0.003, 0), put(box(0.36, 0.007, 0.06, 0x3e8d87), 0, 0.004, 0.08)), 0.007];
  return null;
}

/** The tool in the working hand, laid along +x from the grip (blade or head toward +x). */
function tool(type: string): THREE.Object3D | null {
  if (type === 'fish') return grp(put(box(0.09, 0.02, 0.022, 0x3a2a1e), 0, 0, 0), put(box(0.13, 0.006, 0.026, 0xd4d8dc), 0.11, 0, 0));
  if (type === 'parts') return grp(put(box(0.2, 0.014, 0.026, 0x9aa0a6), 0.06, 0, 0), put(box(0.04, 0.016, 0.06, 0x9aa0a6), 0.17, 0, 0));
  if (type === 'phone') return grp(put(box(0.08, 0.022, 0.022, 0xd9322b), 0, 0, 0), put(box(0.08, 0.006, 0.006, 0xc8ccd0), 0.08, 0, 0));
  if (type === 'net') return grp(put(box(0.16, 0.01, 0.035, 0xc8a46a), 0.04, 0, 0));
  if (type === 'fabric') return grp(put(box(0.12, 0.008, 0.012, 0xc8ccd0), 0.06, 0, 0.012), put(box(0.12, 0.008, 0.012, 0xc8ccd0), 0.06, 0, -0.012), put(box(0.04, 0.015, 0.05, 0x2a2a2a), -0.02, 0, 0));
  return null;
}

/** Held in the hand while drinking or eating (centred on the grip): the object, what empties, and what the other hand holds. */
function held(type: string): { obj: THREE.Object3D; fill: THREE.Object3D; other?: THREE.Object3D; long?: boolean } {
  if (type === 'coffee') {                                              // a white cup with a green band, the dark coffee near the brim
    const g = grp(put(cyl(0.046, 0.036, 0.095, 0xf4f1e6), 0, 0, 0), put(cyl(0.047, 0.044, 0.025, 0x2f8f4e), 0, 0.022, 0));
    const f = put(cyl(0.041, 0.041, 0.01, 0x3a1e0c), 0, 0.044, 0); g.add(f);
    return { obj: g, fill: f };
  }
  if (type === 'attaya') {                                              // small tea glass, amber tea and its foam
    const g = grp(put(cyl(0.034, 0.028, 0.085, 0xdfe8ee, 0.4), 0, 0, 0));
    const f = put(grp(put(cyl(0.031, 0.026, 0.055, 0x9a4a12), 0, 0, 0), put(cyl(0.032, 0.032, 0.016, 0xf0e0b8), 0, 0.034, 0)), 0, -0.012, 0); g.add(f);
    return { obj: g, fill: f };
  }
  if (type === 'bread') {                                               // half a baguette, and a sachet of milk in the other hand
    const b = cyl(0.04, 0.04, 0.3, 0xd9a05a); b.rotation.z = Math.PI / 2;
    const cut = cyl(0.037, 0.037, 0.004, 0xf2e3c0); cut.rotation.z = Math.PI / 2; cut.position.x = -0.151;
    const g = grp(b, cut, put(ball(0.04, 0xd9a05a), 0.15, 0, 0));
    for (let i = 0; i < 3; i++) { const s = box(0.045, 0.006, 0.05, 0xb5793a); s.position.set(-0.08 + i * 0.08, 0.038, 0); s.rotation.y = 0.5; g.add(s); }
    const milk = grp(put(box(0.075, 0.12, 0.05, 0xf6f6f2), 0, 0, 0), put(box(0.077, 0.03, 0.052, 0x2f6fb3), 0, 0.035, 0));
    return { obj: g, fill: g, other: milk, long: true };
  }
  if (type === 'skewer') { const s = piece('skewer', true); s.children.forEach(c => { c.position.y -= 0.025; }); return { obj: s, fill: s, long: true }; }
  // a plastic bottle: bouye (cream), bissap (deep red) or a soda (orange)
  const c = type === 'juice' ? 0xe6d6b2 : type === 'soda' ? 0xe0782a : 0x8b1a2b;
  const g = grp(put(cyl(0.038, 0.038, 0.15, 0xe8f0f4, 0.35), 0, 0, 0), put(cyl(0.018, 0.03, 0.03, 0xe8f0f4, 0.35), 0, 0.09, 0), put(cyl(0.016, 0.016, 0.02, 0x2f8f4e), 0, 0.112, 0));
  const f = put(cyl(0.035, 0.035, 0.13, c), 0, -0.008, 0); g.add(f);
  return { obj: g, fill: f };
}

// ------------------------------------------------------------------ helpers
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** Mostly linear with soft ends (walks: the legs' speed stays close to the real speed). */
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return 0.5 * t + 0.5 * smooth(t); };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
const angleTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dirOf = (yaw: number) => V(Math.sin(yaw), 0, Math.cos(yaw));
const rightOf = (yaw: number) => V(-Math.cos(yaw), 0, Math.sin(yaw));
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), AX = { f: new THREE.Vector3(), r: new THREE.Vector3() };
const MX = new THREE.Matrix4(), XA = new THREE.Vector3(), YA = new THREE.Vector3(), ZA = new THREE.Vector3();
/** Orients `o` so that its +x runs along `dir` (a tool in the hand), its +y as close to `up` as possible. */
function lay(o: THREE.Object3D, dir: THREE.Vector3, up = UP) {
  XA.copy(dir).normalize(); ZA.crossVectors(XA, up); if (ZA.lengthSq() < 1e-6) ZA.set(0, 0, 1); ZA.normalize(); YA.crossVectors(ZA, XA);
  o.quaternion.setFromRotationMatrix(MX.makeBasis(XA, YA, ZA));
}

interface Env {
  ctx: GameCtx; body: Humanoid | null; scene: THREE.Group;
  /** Start position (feet) and the way the player faces the place. */
  O: THREE.Vector3; f: number;
  seconds: number;
  colliders: Collider[]; bounds: Rect | null;
  /** Height the player's feet are set to at (x, z) (the game's own rule). */
  ground(x: number, z: number): number;
  /** Top of what is really there at (x, z), looking down from `from` (a counter, the sand, a floor), or null. */
  surface(x: number, z: number, from: number, depth?: number): number | null;
  /** Floor under (x, z): the first surface no higher than the knees. */
  floor(x: number, z: number): number;
  /** Is the straight walk from a to b free of furniture and walls (`ignore`: the counter the walk goes to)? */
  clear(a: { x: number; z: number }, b: { x: number; z: number }, ignore?: Rect): boolean;
  /** Is a disc of radius r at (x, z) inside the space and off every collider (but `ignore`)? */
  free(x: number, z: number, r: number, ignore?: Rect): boolean;
  /** Moves the player's feet to (x, z), facing `yaw`, with the legs at the speed the move really has. */
  move(x: number, z: number, yaw: number, dt: number): void;
}
interface Perf { update(t: number, dt: number): void; pose?(h: Humanoid): void; dispose?(): void; info?(): Record<string, unknown> }

/** Free straight direction from O (relative to f), up to `len` m: the first of `tries` angles that is clear. */
function freeDir(e: Env, len: number, tries: number[]): { dir: THREE.Vector3; len: number } | null {
  for (const l of [len, len * 0.6, len * 0.35]) for (const a of tries) {
    const dir = dirOf(e.f + a);
    const end = { x: e.O.x + dir.x * (l + 0.6), z: e.O.z + dir.z * (l + 0.6) };
    if (e.free(end.x, end.z, 0.3) && e.clear(e.O, end)) return { dir, len: l };
  }
  return null;
}

/** Where the hands work: a spot on a table top, the player standing in front of it facing it. */
interface Bench { stand: THREE.Vector3; face: number; at: THREE.Vector3; top: number; right: THREE.Vector3; fwd: THREE.Vector3; own: boolean }

/**
 * The place's own counter or table (a collider of table height near the player, its long side reachable on a clear
 * straight walk): the player steps in front of it and works on its top, next to what is already on it.
 */
function counterAt(e: Env, maxWalk: number): Bench | null {
  let best: Bench | null = null, bestD = maxWalk;
  for (const c of e.colliders) {
    if (c.h < 0.55 || c.h > 1.3) continue;
    if (e.O.x > c.x0 && e.O.x < c.x1 && e.O.z > c.z0 && e.O.z < c.z1) continue;
    const qx = clamp(e.O.x, c.x0, c.x1), qz = clamp(e.O.z, c.z0, c.z1), dx = e.O.x - qx, dz = e.O.z - qz;
    const sides: [number, number][] = Math.abs(dx) >= Math.abs(dz) ? [[Math.sign(dx), 0], [0, Math.sign(dz) || 1]] : [[0, Math.sign(dz)], [Math.sign(dx) || 1, 0]];
    for (const [nx, nz] of sides) {
      const alongX = nz !== 0, lo = alongX ? c.x0 : c.z0, hi = alongX ? c.x1 : c.z1;
      if (hi - lo < 0.7) continue;
      const u = clamp(alongX ? e.O.x : e.O.z, lo + 0.42, hi - 0.42);
      const ex = alongX ? u : nx > 0 ? c.x1 : c.x0, ez = alongX ? (nz > 0 ? c.z1 : c.z0) : u;
      // the belly almost against the edge, the hands just past it (the arms are 0.58 m long)
      const stand = V(ex + nx * 0.3, 0, ez + nz * 0.3), d = Math.hypot(stand.x - e.O.x, stand.z - e.O.z);
      if (d > bestD || !e.free(stand.x, stand.z, 0.2, c) || (d > 0.05 && !e.clear(e.O, stand, c))) continue;
      const at = V(ex - nx * 0.13, 0, ez - nz * 0.13);
      const top = e.surface(at.x, at.z, e.O.y + c.h + 0.25, c.h + 0.6);
      if (top === null || top - e.O.y < 0.55 || top - e.O.y > 1.25) continue;
      const face = Math.atan2(-nx, -nz);
      at.y = top; stand.y = e.ground(stand.x, stand.z);
      best = { stand, face, at, top, right: rightOf(face), fwd: dirOf(face), own: true }; bestD = d;
    }
  }
  return best;
}

/** No counter at hand: a small work table is set up in front of the player (or to a free side). */
function workTable(e: Env): Bench {
  for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const face = e.f + a, fwd = dirOf(face), right = rightOf(face), c = e.O.clone().addScaledVector(fwd, 0.56);
    const ok = [[0, 0], [-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].every(([u, v]) => e.free(c.x + right.x * u + fwd.x * v, c.z + right.z * u + fwd.z * v, 0.05));
    if (!ok && a !== Math.PI) continue;
    const g0 = e.floor(c.x, c.z), top = g0 + 0.84;
    const t = put(grp(put(box(0.95, 0.04, 0.52, 0x8b6a47), 0, 0.82, 0)), c.x, g0, c.z); t.rotation.y = face;
    for (const [u, v] of [[-0.42, -0.21], [0.42, -0.21], [-0.42, 0.21], [0.42, 0.21]]) t.add(put(box(0.04, 0.8, 0.04, 0x4a3424), u, 0.4, v));
    e.scene.add(t);
    const at = e.O.clone().addScaledVector(fwd, 0.43); at.y = top;
    return { stand: e.O.clone(), face, at, top, right, fwd, own: false };
  }
  throw new Error('unreachable');
}

// ------------------------------------------------------------------ performances
/**
 * Carry loads one by one from a pile next to the player to a new pile a few steps away; the new pile grows, the old
 * one shrinks. Fish crates go on the head (as on the beach), cartons and papers in front, held with both hands. The
 * player crouches and bends to the pile to take a load and to put it down.
 */
function carry(e: Env, type: string): Perf {
  const n = Math.max(1, Math.min(4, Math.round(e.seconds / 2.3))), trip = e.seconds / n;
  const onHead = type === 'crate';
  const way = freeDir(e, Math.min(2.6, Math.max(0.8, trip * 0.37 * 1.5)), [Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI]);
  const R = 0.58, fwd = dirOf(e.f);
  let dir = way?.dir, L = way?.len ?? 0;
  const spot = (d: THREE.Vector3, k = R) => e.O.clone().addScaledVector(d, k);
  if (!dir) { L = 0; dir = [rightOf(e.f), rightOf(e.f).negate(), fwd.clone().negate()].find(d => e.free(spot(d).x, spot(d).z, 0.32)) ?? rightOf(e.f); }
  // the pile to take from: in front if there is room, else behind the walk
  const srcDir = [fwd, dir.clone().negate(), fwd.clone().negate()].find(d => d.dot(dir!) < 0.9 && e.free(spot(d).x, spot(d).z, 0.32)) ?? fwd;
  const src = spot(srcDir), dst = e.O.clone().addScaledVector(dir, L + R);
  const faceSrc = angleTo(e.O, src), faceDir = Math.atan2(dir.x, dir.z), faceBack = Math.atan2(-dir.x, -dir.z);
  const [b0, base] = pileBase(type), [b1] = pileBase(type);
  src.y = e.floor(src.x, src.z); dst.y = e.floor(dst.x, dst.z);
  put(b0, src.x, src.y, src.z).rotation.y = faceSrc; put(b1, dst.x, dst.y, dst.z).rotation.y = faceDir;
  e.scene.add(b0, b1);
  const loads = Array.from({ length: n }, () => load(type)), hgt = loads[0].h, half = loads[0].w;
  loads.forEach((l, i) => { put(l.obj, src.x, src.y + base + i * hgt, src.z).rotation.y = faceSrc; e.scene.add(l.obj); });
  let moved = 0, inHands: Load | null = null, p = 0, low = 0, lift = 0, slot = V(), walk = 0;
  /** Height of the hands on the load being taken or put down, above the feet. */
  const grabY = () => slot.y + hgt * 0.75 - e.O.y;
  return {
    update(t, dt) {
      const i = Math.min(n - 1, Math.floor(t / trip)); p = Math.min(1, (t - i * trip) / trip);
      // out (carrying) then back (empty) along the free line
      const s = p < 0.13 ? 0 : p < 0.5 ? ease((p - 0.13) / 0.37) : p < 0.62 ? 1 : p < 0.97 ? 1 - ease((p - 0.62) / 0.35) : 0;
      const face = p < 0.11 ? faceSrc : p < 0.62 ? faceDir : p < 0.95 ? faceBack : faceSrc;
      const at = e.O.clone().addScaledVector(dir!, L * s);
      e.move(at.x, at.z, face, dt);
      walk = s;
      // down to the pile and up again: take at 7 %, put down at 56 %
      low = p < 0.13 ? Math.sin(Math.PI * p / 0.13) : p > 0.49 && p < 0.63 ? Math.sin(Math.PI * (p - 0.49) / 0.14) : 0;
      if (!inHands && moved === i && p >= 0.07 && p < 0.56) inHands = loads[n - 1 - i];
      if (inHands && p >= 0.56) { put(inHands.obj, dst.x, dst.y + base + moved * hgt, dst.z).rotation.y = faceDir; inHands = null; moved++; }
      // where the load is: 0 on the pile, 1 against the belly, 2 on the head
      if (!inHands) lift = 0;
      else if (p < 0.13) lift = ramp(p, 0.07, 0.13);
      else if (onHead) lift = p < 0.44 ? 1 + ramp(p, 0.13, 0.2) : p < 0.5 ? 2 - ramp(p, 0.44, 0.5) : 1 - ramp(p, 0.5, 0.56);
      else lift = p < 0.5 ? 1 : 1 - ramp(p, 0.5, 0.56);
      // the load being taken (top of the old pile) or its place on the new pile
      slot = p < 0.3 ? V(src.x, src.y + base + Math.max(0, n - moved - 1) * hgt, src.z) : V(dst.x, dst.y + base + (inHands ? moved : Math.max(0, moved - 1)) * hgt, dst.z);
    },
    pose(h) {
      const gy = clamp(grabY(), 0.15, 1.4);
      crouch(h, low * clamp((0.95 - gy) * 0.6, 0, 0.38));
      bend(h, low * clamp((1.3 - gy) * 0.75, 0.1, 0.75));
      const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r);
      const chest = h.bone('chest'), head = h.bone('head');
      if (inHands && chest && head) {
        const belly = chest.getWorldPosition(tmp).addScaledVector(F, 0.34).addScaledVector(UP, -0.46);
        const top = head.getWorldPosition(tmp2).addScaledVector(UP, 0.2);
        const at = lift <= 1 ? slot.clone().lerp(belly, lift) : belly.lerp(top, lift - 1);
        inHands.obj.position.copy(at); inHands.obj.rotation.y = h.group.rotation.y;
        const hold = onHead && lift > 1 ? 0.05 : inHands.h / 2;
        for (const [side, k] of [['R', 1], ['L', -1]] as const) {
          const hand = tmp3.copy(at).addScaledVector(UP, hold).addScaledVector(Rt, k * (half + 0.03));
          const pole = onHead && lift > 1 ? V().addScaledVector(Rt, k).addScaledVector(UP, -0.4) : V(0, -1, 0).addScaledVector(Rt, k * 0.8);
          reach(h, side, hand, pole);
        }
        if (onHead && lift > 1) nod(h, -0.05);
      } else if (low > 0.05) {
        const want = V(slot.x, slot.y + hgt * 0.75, slot.z);
        for (const [side, k] of [['R', 1], ['L', -1]] as const) reach(h, side, tmp3.copy(want).addScaledVector(Rt, k * (half + 0.03)), V(0, -1, 0).addScaledVector(Rt, k * 0.8), low);
        nod(h, 0.3 * low);
      }
    },
    info: () => ({ kind: 'carry', moved, of: n, trip: +p.toFixed(2), carrying: !!inHands, onHead: onHead && lift > 1.5, leg: +L.toFixed(2), walked: +walk.toFixed(2) }),
  };
}

/**
 * Items pass through the hands on the counter: the left hand takes one from the pile, the right hand works it with the
 * tool (scales the fish, tightens the part…), then puts it with the finished ones (in the tub, on the tray). The
 * place's own table is used when there is one close by, else a small work table is set up.
 */
function handwork(e: Env, type: string): Perf {
  // a brisk walk to the stall, at most 45 % of the step (the rest is work)
  const walkMax = Math.min(3.6, e.seconds * 0.45 * 1.8);
  const b = counterAt(e, walkMax) ?? workTable(e);
  const walkT = b.own ? Math.hypot(b.stand.x - e.O.x, b.stand.z - e.O.z) / 1.8 : 0;
  const workT = Math.max(0.5, e.seconds - walkT - 0.15);
  const n = Math.max(3, Math.min(8, Math.round(workT * 1.1))), each = workT / n;
  const left = b.at.clone().addScaledVector(b.right, -0.3), right = b.at.clone().addScaledVector(b.right, 0.3);
  const cap = (x: number, z: number) => Math.min(b.top + 0.3, e.surface(x, z, b.top + 0.3, 0.6) ?? b.top);
  left.y = cap(left.x, left.z); right.y = cap(right.x, right.z);
  const box0 = container(type);
  if (box0) { put(box0[0], right.x, right.y, right.z).rotation.y = b.face; e.scene.add(box0[0]); right.y += box0[1]; }
  const todo = Array.from({ length: n }, (_, i) => {
    const o = piece(type, false);
    put(o, left.x + b.right.x * ((i % 2) - 0.5) * 0.08 + b.fwd.x * (((i >> 1) % 2) - 0.5) * 0.08, left.y + Math.floor(i / 4) * 0.045, left.z + b.right.z * ((i % 2) - 0.5) * 0.08 + b.fwd.z * (((i >> 1) % 2) - 0.5) * 0.08);
    o.rotation.y = b.face + (i % 3) * 0.3; e.scene.add(o); return o;
  });
  const tl = tool(type); if (tl) e.scene.add(tl);
  const finished: THREE.Object3D[] = [];
  let cur = -1, item: THREE.Object3D | null = null, p = 0, working = false;
  const lean = clamp(1.25 - (b.top - e.O.y), 0.22, 0.6);
  return {
    update(t, dt) {
      if (t < walkT) {                                                   // a few steps to the counter
        const k = t / walkT, at = e.O.clone().lerp(b.stand, ease(k));
        e.move(at.x, at.z, k < 0.85 ? angleTo(e.O, b.stand) : b.face, dt); p = 0; working = false; return;
      }
      e.move(b.stand.x, b.stand.z, b.face, dt); working = true;
      const w = t - walkT, i = Math.min(n - 1, Math.floor(w / each)); p = Math.min(1, (w - i * each) / each);
      if (i !== cur) {                                                  // the previous one is done: with the others
        if (item) {
          item.removeFromParent(); const d = piece(type, true), k = finished.length;
          put(d, right.x + b.right.x * ((k % 2) - 0.5) * 0.09 + b.fwd.x * (((k >> 1) % 2) - 0.5) * 0.08, right.y + Math.floor(k / 4) * 0.04, right.z + b.right.z * ((k % 2) - 0.5) * 0.09 + b.fwd.z * (((k >> 1) % 2) - 0.5) * 0.08);
          d.rotation.y = b.face; e.scene.add(d); finished.push(d);
        }
        cur = i; item = null;
      }
      if (!item && p > 0.16 && todo.length) item = todo.pop()!;
    },
    pose(h) {
      if (!working) return;
      bend(h, lean); nod(h, 0.5);                                       // leaning over the work, eyes on the hands
      const { right: Rt } = bodyAxes(h, AX.f, AX.r);
      const work = tmp.copy(b.at).setY(b.top + 0.03);
      const stroke = Math.sin(p * Math.PI * 14);
      // left hand: to the pile, brings the item, then holds it while the right hand works
      const lt = p < 0.16 ? tmp2.copy(left).setY(left.y + 0.06) : p < 0.3 ? tmp2.copy(left).lerp(work, ramp(p, 0.16, 0.3)).setY(b.top + 0.07) : tmp2.copy(work).addScaledVector(Rt, -0.09).setY(b.top + 0.05);
      reach(h, 'L', lt, V(0, -1, 0).addScaledVector(Rt, -0.8));
      // right hand: works on the item, then takes it to the finished pile, then comes back
      const rt = p < 0.3 ? tmp3.copy(work).addScaledVector(Rt, 0.14).setY(b.top + 0.1)
        : p < 0.8 ? tmp3.copy(work).addScaledVector(Rt, 0.07 + 0.05 * stroke).addScaledVector(b.fwd, 0.02 * Math.cos(p * Math.PI * 14)).setY(b.top + 0.06 + 0.025 * Math.abs(stroke))
        : p < 0.94 ? tmp3.copy(work).lerp(right, ramp(p, 0.8, 0.92)).setY(Math.max(right.y, b.top) + 0.08) : tmp3.copy(right).lerp(work, ramp(p, 0.94, 1)).setY(b.top + 0.1);
      reach(h, 'R', rt, V(0, -1, 0).addScaledVector(Rt, 0.8));
      if (item) {
        if (p < 0.3) { item.position.copy(grip(h, 'L', tmp2)).addScaledVector(UP, -0.03); }
        else if (p < 0.8) { item.position.copy(work).setY(b.top); item.rotation.y = b.face; }
        else { item.position.copy(grip(h, 'R', tmp2)).addScaledVector(UP, -0.03); }
      }
      if (tl) {
        const g = grip(h, 'R', tmp2), d = forearmDir(h, 'R', tmp3);
        tl.position.copy(g); lay(tl, d.lerp(b.fwd, 0.4).setY(Math.min(d.y, -0.2)));
      }
    },
    info: () => ({ kind: 'handwork', done: finished.length, left: todo.length, of: n, surface: b.own, walk: +walkT.toFixed(2) }),
  };
}

/** Out and back along the clearest straight line, at a run. */
function run(e: Env): Perf {
  const way = freeDir(e, 10, [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4]);
  const dir = way?.dir ?? dirOf(e.f), L = way?.len ?? 0;
  const lap = Math.max(1.5, (2 * L) / 4.2);
  let dist = 0;
  return {
    update(t, dt) {
      const p = (t % lap) / lap, s = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
      const at = e.O.clone().addScaledVector(dir, L * s), was = e.ctx.player.pos;
      dist += Math.hypot(at.x - was.x, at.z - was.z) * (t > dt ? 1 : 0);
      const out = p < 0.5;
      e.move(at.x, at.z, Math.atan2(out ? dir.x : -dir.x, out ? dir.z : -dir.z), dt);
    },
    info: () => ({ kind: 'run', metres: Math.round(dist), line: +L.toFixed(1) }),
  };
}

/** A bar overhead: hands on it, the body goes up and down. */
function pullups(e: Env): Perf {
  const g0 = e.ground(e.O.x, e.O.z), right = rightOf(e.f), fl = e.floor(e.O.x, e.O.z);
  const barY = g0 + 2.15;
  const bar = cyl(0.025, 0.025, 1.5, 0xc8ccd0); bar.rotation.set(0, e.f, Math.PI / 2, 'YXZ'); bar.position.set(e.O.x, barY, e.O.z); e.scene.add(bar);
  for (const s of [-1, 1]) e.scene.add(put(cyl(0.045, 0.05, barY - fl + 0.06, 0x2d3748), e.O.x + right.x * s * 0.72, fl + (barY - fl + 0.06) / 2, e.O.z + right.z * s * 0.72));
  let reps = 0, lift = 0, last = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  return {
    update(t) {
      const c = t / 1.7; lift = 0.36 * (0.5 - 0.5 * Math.cos(2 * Math.PI * c)) + 0.14;
      if (Math.floor(c + 0.5) > last) { last = Math.floor(c + 0.5); reps = last; }
      e.ctx.player.pos.y = g0 + lift;
    },
    pose(h) {
      const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r);
      for (const [side, k] of [['R', 1], ['L', -1]] as const) reach(h, side, V(e.O.x, barY + 0.02, e.O.z).addScaledVector(Rt, k * 0.24), V().addScaledVector(Rt, k).addScaledVector(F, -0.3).add(V(0, -0.5, 0)));
      nod(h, -0.1);
    },
    dispose() { e.ctx.player.pos.y = g0; },
    info: () => ({ kind: 'pullups', reps }),
  };
}

/** Facing the person or the place: talking (the clip moves the hands), or watching (nods, comments now and then). */
function talk(e: Env, alternate = false): Perf {
  const b = e.body;
  e.move(e.O.x, e.O.z, e.f, 0);
  return {
    update(t) { if (b) b.hold = alternate ? (Math.floor(t / 1.8) % 2 ? 'Talk' : 'Idle') : 'Talk'; },
    pose(h) { if (alternate && h.hold === 'Idle') nod(h, 0.14 + 0.06 * Math.sin(performance.now() / 300)); },
    dispose() { if (b && (b.hold === 'Talk' || b.hold === 'Idle')) b.hold = null; },
    info: () => ({ kind: alternate ? 'watch' : 'talk' }),
  };
}

/** A slow walk round the place: two stops, looking, then back. */
function look(e: Env): Perf {
  const seg = e.seconds / 3, len = Math.min(2.2, 1.25 * 0.55 * seg);
  const a = freeDir(e, len, [Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, 0]);
  const b = freeDir(e, len, [-Math.PI / 3, Math.PI / 3, -Math.PI / 2, Math.PI / 2, Math.PI]);
  const pts = [e.O.clone(), a ? e.O.clone().addScaledVector(a.dir, a.len) : e.O.clone(), b ? e.O.clone().addScaledVector(b.dir, b.len) : e.O.clone(), e.O.clone()];
  // the second leg (a → b) must be clear too, else go back by the start
  if (!e.clear(pts[1], pts[2])) pts[2] = e.O.clone();
  let stops = 0, k = 0;
  return {
    update(t, dt) {
      const i = Math.min(2, Math.floor(t / seg)), p = (t - i * seg) / seg;
      const from = pts[i], to = pts[i + 1], s = ease(p / 0.55);
      const at = from.clone().lerp(to, s);
      const moving = p < 0.55 && from.distanceTo(to) > 0.2;
      e.move(at.x, at.z, moving ? angleTo(from, to) : e.f + (i - 1) * 0.5, dt);
      stops = i + (p > 0.55 ? 1 : 0); k = moving ? 0 : 1;
    },
    pose(h) { if (k) nod(h, -0.04); },
    info: () => ({ kind: 'look', stops }),
  };
}

/** Something held in the right hand, brought to the mouth now and then; it empties (or gets shorter, for bread). */
function sip(e: Env, type: string, eat: boolean): Perf {
  const { obj, fill, other, long } = held(type); e.scene.add(obj); if (other) e.scene.add(other);
  const full = fill.scale.clone(), base = fill.position.clone();
  // a whole number of sips (or bites) in the step, at least one even in a short one (a café Touba is 1.5 s)
  const cycle = e.seconds / Math.max(1, Math.round(e.seconds / 2.4));
  let k = 0, raise = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  if (e.body) e.body.hold = 'Idle';
  return {
    update(t) {
      k = Math.min(1, t / e.seconds);
      const c = (t % cycle) / cycle; raise = c < 0.4 ? 0 : c < 0.56 ? smooth((c - 0.4) / 0.16) : c < 0.82 ? 1 : 1 - smooth((c - 0.82) / 0.16);
      if (eat) { const s = 1 - 0.65 * k; obj.scale.set(s, 1, 1); }
      else { fill.scale.y = full.y * Math.max(0.08, 1 - 0.9 * k); fill.position.y = base.y - (1 - fill.scale.y / full.y) * (type === 'coffee' ? 0.035 : 0.06); }
    },
    pose(h) {
      const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r), yaw = h.group.rotation.y;
      const rest = bodyPoint(h, 0.3, 1.02, 0.16, tmp), m = mouth(h, tmp2).addScaledVector(F, 0.04); m.y -= 0.07;
      reach(h, 'R', rest.lerp(m, raise), V(0, -1, 0).addScaledVector(Rt, 0.7));
      const g = grip(h, 'R', tmp3);
      if (long) { obj.position.copy(g); lay(obj, tmp.copy(Rt).negate().addScaledVector(F, 0.45).addScaledVector(UP, 0.3 * raise)); }   // across the body
      else { obj.position.copy(g).addScaledVector(UP, 0.02); obj.rotation.set(-1.1 * raise, yaw, 0, 'YXZ'); }
      if (other) { reach(h, 'L', bodyPoint(h, 0.26, 1.0, -0.17, tmp), V(0, -1, 0).addScaledVector(Rt, -0.7)); other.position.copy(grip(h, 'L', tmp2)); other.rotation.set(0, yaw, 0); }
      nod(h, raise > 0.5 ? -0.12 * raise : 0.12);
    },
    dispose() { if (e.body?.hold === 'Idle') e.body.hold = null; },
    info: () => ({ kind: eat ? 'eat' : 'drink', left: +(1 - k).toFixed(2), raised: raise > 0.9 }),
  };
}

/** Paying or handing over: the right hand goes to the counter with a note and comes back. */
function pay(e: Env): Perf {
  const note = grp(put(box(0.15, 0.004, 0.075, 0x5f9e5a), 0, 0, 0), put(box(0.05, 0.005, 0.05, 0x8fc48a), 0.03, 0, 0)); e.scene.add(note);
  let out = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  return {
    update(t) { const p = Math.min(1, t / Math.max(0.6, e.seconds)); out = Math.sin(Math.PI * p); note.visible = p < 0.55; },
    pose(h) {
      const { right: Rt } = bodyAxes(h, AX.f, AX.r);
      reach(h, 'R', bodyPoint(h, 0.25 + 0.35 * out, 1.0 + 0.1 * out, 0.12, tmp), V(0, -1, 0).addScaledVector(Rt, 0.6), Math.min(1, out * 2));
      note.position.copy(grip(h, 'R', tmp2)); note.rotation.y = h.group.rotation.y;
    },
    info: () => ({ kind: 'pay', handed: !note.visible }),
  };
}

/**
 * Washing at the bucket, crouched: a plastic mug takes water from the bucket and pours it into the hands and on the
 * face, the drops fall back; the water in the bucket goes down. At home the room's own bucket is used.
 */
function wash(e: Env): Perf {
  const spot = e.ctx.inside()?.int.group.getObjectByName('wash-bucket');
  let bucket: THREE.Vector3, top: number, rim: number;
  if (spot) {
    bucket = spot.getWorldPosition(V()); top = bucket.y + (spot.userData.h ?? 0.32); rim = spot.userData.r ?? 0.14;
  } else {
    const fwd = dirOf(e.f); bucket = e.O.clone().addScaledVector(fwd, 0.5); bucket.y = e.floor(bucket.x, bucket.z);
    top = bucket.y + 0.32; rim = 0.15;
    e.scene.add(put(cyl(0.15, 0.12, 0.32, 0x2a8fd1, 1, true), bucket.x, bucket.y + 0.16, bucket.z), put(cyl(0.12, 0.12, 0.01, 0x2a8fd1), bucket.x, bucket.y + 0.005, bucket.z));
  }
  // stand a little back from the bucket, facing it
  const face = spot ? angleTo(e.O, bucket) : e.f, stand = bucket.clone().addScaledVector(dirOf(face), -0.5);
  if (!e.free(stand.x, stand.z, 0.2)) stand.copy(e.O);
  // the water in the bucket goes down (the room's bucket has its own water, put back afterwards)
  const roomWater = spot?.getObjectByName('water') ?? null, was = roomWater?.position.y ?? 0;
  const water = roomWater ?? put(cyl(rim - 0.012, rim - 0.012, 0.012, 0x8fd0f0, 0.85), bucket.x, top - 0.04, bucket.z);
  if (!roomWater) e.scene.add(water);
  const level0 = water.position.y;
  const mug = grp(put(cyl(0.045, 0.04, 0.09, 0xe9be43), 0, 0, 0), put(cyl(0.04, 0.04, 0.005, 0x8fd0f0, 0.9), 0, 0.04, 0)); e.scene.add(mug);
  const drops: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  let k = 0, c = 0, lastSplash = -1, settle = 0;
  return {
    update(t, dt) {
      settle = Math.min(1, t / 0.35);
      e.move(e.O.x + (stand.x - e.O.x) * settle, e.O.z + (stand.z - e.O.z) * settle, face, dt);
      k = Math.min(1, t / e.seconds); c = (t % 1.6) / 1.6;
      water.position.y = level0 - 0.15 * k;
      const r = 1 - 0.1 * k; water.scale.set(r, 1, r);
      const n = Math.floor(t / 1.6);
      if (c > 0.6 && n !== lastSplash && e.body) {                      // water poured on the face: drops fall back
        lastSplash = n; const m = mouth(e.body, tmp);
        for (let i = 0; i < 8; i++) { const d = ball(0.014, 0x9fd8f5); d.position.copy(m); e.scene.add(d); drops.push({ m: d, v: V((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), life: 0.7 }); }
      }
      for (const d of drops) { d.life -= dt; d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); d.m.visible = d.life > 0 && d.m.position.y > bucket.y; }
    },
    pose(h) {
      const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r);
      const dip = c < 0.35 ? 1 : c < 0.5 ? 1 - ramp(c, 0.35, 0.5) : c > 0.9 ? ramp(c, 0.9, 1) : 0;
      crouch(h, 0.36 * settle); bend(h, (0.3 + 0.45 * dip) * settle);
      const mf = mouth(h, tmp2);
      // right hand: the mug into the bucket, then up in front of the face, tipped
      const inB = V(bucket.x, top - 0.06, bucket.z).addScaledVector(Rt, 0.04);
      const up = mf.clone().addScaledVector(F, 0.12).addScaledVector(Rt, 0.05).addScaledVector(UP, 0.02);
      reach(h, 'R', inB.lerp(up, 1 - dip), V(0, -1, 0).addScaledVector(Rt, 0.8));
      // left hand: cupped under the face, rubbing
      reach(h, 'L', mf.clone().addScaledVector(F, 0.06).addScaledVector(UP, -0.06).addScaledVector(Rt, -0.04 + 0.03 * Math.sin(c * 30)), V(0, -1, 0).addScaledVector(Rt, -0.8), 1 - dip * 0.6);
      mug.position.copy(grip(h, 'R', tmp)); mug.rotation.set(dip > 0.5 ? 0 : 1.6 * ramp(c, 0.5, 0.65) * (1 - ramp(c, 0.85, 0.95)), h.group.rotation.y, 0, 'YXZ');
      nod(h, dip > 0.5 ? 0.35 : -0.1);
    },
    dispose() { if (roomWater) { roomWater.position.y = was; roomWater.scale.set(1, 1, 1); } },
    info: () => ({ kind: 'wash', water: +(1 - k).toFixed(2), splashes: lastSplash + 1, bucket: spot ? 'room' : 'own' }),
  };
}

/** In front of the mirror: combing strokes over the head. */
function groom(e: Env): Perf {
  const comb = grp(put(box(0.16, 0.012, 0.035, 0x1d1d1f), 0, 0, 0)); e.scene.add(comb);
  let c = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  return {
    update(t) { c = t; },
    pose(h) {
      const head = h.bone('head'); if (!head) return;
      const top = head.getWorldPosition(tmp).add(V(0, 0.17, 0));
      const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r);
      top.addScaledVector(F, 0.06 * Math.sin(c * 5)).addScaledVector(Rt, 0.07);
      reach(h, 'R', top, V().addScaledVector(Rt, 1).add(V(0, -0.3, 0)));
      comb.position.copy(grip(h, 'R', tmp2)); comb.rotation.y = h.group.rotation.y;
      nod(h, -0.08);
    },
    info: () => ({ kind: 'groom' }),
  };
}

/** Arms up, a long stretch, then down again. */
function stretch(e: Env): Perf {
  let w = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  return {
    update(t) { w = Math.sin(Math.PI * Math.min(1, t / e.seconds)); },
    pose(h) {
      const { right: Rt } = bodyAxes(h, AX.f, AX.r);
      for (const [side, s] of [['R', 1], ['L', -1]] as const) reach(h, side, bodyPoint(h, 0.05, 2.25, 0.25 * s, tmp), V().addScaledVector(Rt, s), Math.min(1, w * 1.3));
      bend(h, -0.12 * w); nod(h, -0.2 * w);
    },
    info: () => ({ kind: 'stretch', up: +w.toFixed(2) }),
  };
}

/** Listening to the radio: the head goes with the music. */
function listen(e: Env): Perf {
  let c = 0;
  e.move(e.O.x, e.O.z, e.f, 0);
  return { update(t) { c = t; }, pose(h) { nod(h, 0.1 * Math.sin(c * 2 * Math.PI * 1.6)); bend(h, 0.04 * Math.sin(c * Math.PI * 1.6)); }, info: () => ({ kind: 'listen' }) };
}

/** From the chair: the TV screen changes colour with the programme. */
function tv(e: Env): Perf {
  const screen = e.ctx.inside()?.int.group.getObjectByName('tv-screen') as THREE.Mesh | undefined;
  const m = screen?.material as THREE.MeshBasicMaterial | undefined;
  const base = m?.color.clone();
  const shows = [0x3b5f8a, 0x6a9a4a, 0xb0563a, 0xd8c070, 0x4a4a8a, 0x2f8f9a];
  return {
    update(t) { if (m) m.color.setHex(shows[Math.floor(t * 1.3) % shows.length]).multiplyScalar(0.85 + 0.15 * Math.sin(t * 23)); },
    dispose() { if (m && base) m.color.copy(base); },
    info: () => ({ kind: 'tv', screen: !!m }),
  };
}

/** Lying in bed: the room goes dark while the player sleeps, then the day comes back (the HUD stays above). */
function sleep(e: Env): Perf {
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#05070d;pointer-events:none;opacity:0';
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.after(veil); else document.body.prepend(veil);
  let o = 0;
  return {
    update(t) { const k = Math.min(1, t / e.seconds); o = 0.82 * Math.max(0, Math.min(1, k / 0.25, (1 - k) / 0.2)); veil.style.opacity = String(o); },
    dispose() { veil.remove(); },
    info: () => ({ kind: 'sleep', dark: +o.toFixed(2) }),
  };
}

/** The hairdresser stands behind the chair and works on the player's head with scissors and a comb. */
let barber: Humanoid | null = null;
function haircut(e: Env): Perf {
  const seat = e.ctx.player.seated();
  if (!seat || !humanoidReady()) return { update() {}, info: () => ({ kind: 'haircut', barber: false }) };
  if (!barber) barber = new Humanoid({ skin: 0x5b3420, style: 'dress', top: 0xc2417f, bottom: 0xc2417f, female: true, pattern: 'wax', accent: 0xf4c20d, hat: 'headwrap', hatColor: 0xf4c20d });
  const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
  barber.group.position.set(seat.x - fx * 0.55, e.ground(seat.x, seat.z), seat.z - fz * 0.55);
  barber.group.rotation.set(0, seat.yaw, 0); barber.hold = 'Idle'; barber.group.visible = true;
  e.scene.add(barber.group);
  const scissors = grp(put(box(0.11, 0.01, 0.014, 0xc8ccd0), 0.05, 0, 0.012), put(box(0.11, 0.01, 0.014, 0xc8ccd0), 0.05, 0, -0.012), put(box(0.035, 0.016, 0.05, 0xd9322b), -0.02, 0, 0));
  const comb = grp(put(box(0.14, 0.012, 0.03, 0x1d1d1f), 0, 0, 0));
  e.scene.add(scissors, comb);
  let c = 0, cuts = 0;
  const player = e.body;
  barber.overlay = h => {
    if (!player) return;
    const head = player.bone('head'); if (!head) return;
    const top = head.getWorldPosition(tmp).add(V(0, 0.15, 0));
    const { fwd: F, right: Rt } = bodyAxes(h, AX.f, AX.r);
    bend(h, 0.12); nod(h, 0.3);
    reach(h, 'R', tmp2.copy(top).addScaledVector(Rt, 0.11 + 0.05 * Math.sin(c * 3)).addScaledVector(F, -0.02).add(V(0, 0.03 * Math.sin(c * 11), 0)), V(0, -1, 0).addScaledVector(Rt, 1));
    scissors.position.copy(grip(h, 'R', tmp3)); lay(scissors, forearmDir(h, 'R', tmp2)); scissors.rotateX(Math.sin(c * 20) * 0.3);
    reach(h, 'L', top.addScaledVector(Rt, -0.12), V(0, -1, 0).addScaledVector(Rt, -1));
    comb.position.copy(grip(h, 'L', tmp3)); lay(comb, forearmDir(h, 'L', tmp2));
  };
  return {
    update(t, dt) { c = t; barber!.animate(dt, 0); cuts = Math.floor(t * 2); },
    dispose() { if (barber) { barber.overlay = null; barber.group.visible = false; barber.group.removeFromParent(); } },
    info: () => ({ kind: 'haircut', barber: true, cuts }),
  };
}

// ------------------------------------------------------------------ the module
let cur: { key: string; perf: Perf; root: THREE.Group; start: number; seconds: number } | null = null;

function stop(ctx: GameCtx) {
  if (!cur) return;
  cur.perf.dispose?.();
  cur.root.removeFromParent();
  cur.root.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && !(o.parent instanceof THREE.Bone)) m.geometry.dispose(); });
  const b = ctx.player.body(); if (b) b.overlay = null;
  ctx.player.drive?.(null);
  cur = null;
}

const ray = new THREE.Raycaster();
const shown = (o: THREE.Object3D | null, root: THREE.Object3D) => { for (; o && o !== root; o = o.parent) if (!o.visible) return false; return true; };
const grow = (c: Rect, m: number): Rect => ({ x0: c.x0 - m, z0: c.z0 - m, x1: c.x1 + m, z1: c.z1 + m });
const within = (p: { x: number; z: number }, c: Rect) => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1;

function begin(ctx: GameCtx, id: string, step: Step, at: { x: number; z: number } | undefined, key: string, plain = false) {
  const seated = !!ctx.player.seated();
  const kind = kindOf(id, step, seated, plain);
  if (!kind) return;
  const [k, type] = kind;
  if (seated && !['tv', 'sleep', 'haircut'].includes(k)) return;      // seated: the meal module does the rest
  const w = ctx.world(), inside = ctx.inside();
  const p = ctx.player.pos;
  const root = new THREE.Group(); ctx.scene.add(root);
  const colliders = (inside ? inside.int.colliders : w?.colliders ?? []) as Collider[];
  const near = colliders.filter(c => c.x1 > p.x - 14 && c.x0 < p.x + 14 && c.z1 > p.z - 14 && c.z0 < p.z + 14);
  const space = inside ? inside.int.group : w?.group ?? null;
  const bounds = inside ? inside.int.bounds : w?.bounds ?? null;
  let f = at && Math.hypot(at.x - p.x, at.z - p.z) > 0.3 ? angleTo(p, at) : ctx.player.facing();
  if ((!at || Math.hypot(at.x - p.x, at.z - p.z) <= 0.3) && ['drink', 'eat', 'pay', 'talk', 'watch'].includes(k)) {
    // standing on the place's own spot: turn to its counter when there is one close by
    let best = 3;
    for (const c of near) {
      if (c.h < 0.55 || c.h > 1.3) continue;
      const q = { x: clamp(p.x, c.x0, c.x1), z: clamp(p.z, c.z0, c.z1) }, dd = Math.hypot(q.x - p.x, q.z - p.z);
      if (dd > 0.2 && dd < best) { best = dd; f = angleTo(p, q); }
    }
  }
  let last: { x: number; z: number } | null = null;
  ray.camera = ctx.camera;                                              // signs are sprites: the ray needs the camera
  const env: Env = {
    ctx, body: ctx.player.body(), scene: root, O: p.clone(), f, seconds: Math.max(0.5, step.seconds ?? 1),
    colliders: near, bounds,
    ground: (x, z) => 0.1 + (inside || !w ? 0 : w.heightAt(x, z)),
    surface(x, z, from, depth = 2) {
      if (!space) return null;
      ray.set(V(x, from, z), DOWN); ray.far = depth;
      const hit = ray.intersectObject(space, true).find(i => shown(i.object, space));
      return hit ? hit.point.y : null;
    },
    floor(x, z) {
      const feet = env.ground(x, z);
      if (!space) return feet;
      // up to knee height: a deck or a pier the feet go through (not a collider) still carries the piles
      ray.set(V(x, feet + 0.8, z), DOWN); ray.far = 1.5;
      const hit = ray.intersectObject(space, true).find(i => shown(i.object, space) && i.point.y < feet + 0.5);
      return hit ? hit.point.y : feet;
    },
    // a collider the walk starts in (standing against a counter) only blocks if the walk goes into it
    // (the counter the walk goes to only counts with its own edges: the walk ends just before it)
    clear: (a, b, ignore) => segClear(a, b, near.map(c => { const g = grow(c, c === ignore ? 0 : 0.35); return within(a, g) ? grow(c, 0.02) : g; }).filter(g => !within(a, g))),
    free: (x, z, r, ignore) => (!bounds || (x - r > bounds.x0 && x + r < bounds.x1 && z - r > bounds.z0 && z + r < bounds.z1)) && near.every(c => c === ignore || !within({ x, z }, grow(c, r))),
    move(x, z, yaw, dt) {
      const v = last && dt > 0 ? Math.hypot(x - last.x, z - last.z) / dt : 0;
      last = { x, z };
      ctx.player.pos.set(x, env.ground(x, z), z);
      ctx.player.drive?.({ speed: v > 0.15 ? v : 0, facing: yaw });
    },
  };
  const perf: Perf = k === 'carry' ? carry(env, type ?? 'carton') : k === 'handwork' ? handwork(env, type ?? 'parts') : k === 'run' ? run(env)
    : k === 'pullups' ? pullups(env) : k === 'talk' ? talk(env) : k === 'watch' ? talk(env, true) : k === 'look' ? look(env)
    : k === 'drink' ? sip(env, type ?? 'juice', false) : k === 'eat' ? sip(env, type ?? 'bread', true) : k === 'pay' ? pay(env)
    : k === 'wash' ? wash(env) : k === 'groom' ? groom(env) : k === 'stretch' ? stretch(env) : k === 'listen' ? listen(env)
    : k === 'tv' ? tv(env) : k === 'sleep' ? sleep(env) : haircut(env);
  const b = env.body;
  if (b && perf.pose) b.overlay = h => perf.pose!(h);
  cur = { key, perf, root, start: performance.now(), seconds: env.seconds };
}

export const perform: GameModule = {
  name: 'perform',
  hubLoaded: ctx => { stop(ctx); if (barber) { barber.dispose(); barber = null; } },
  spaceChanged: ctx => stop(ctx),
  update(ctx, dt) {
    // a composed activity's step, or a plain content action (one timed step: shown even without its own pose)
    const a = ctx.activities.current;
    const c = a ? { id: a.spec.id, step: a.step, t: a.t, at: a.ctx.at, key: `${a.spec.id}:${a.index}`, walking: a.walking, plain: !!a.spec.plain } : null;
    const timed = c && !c.walking && (c.step.seconds ?? 0) > 0 && ctx.mode() === 'busy';
    const key = c ? c.key : '';
    if (cur && (!timed || cur.key !== key)) stop(ctx);
    if (!timed || !c) return;
    if (!cur) begin(ctx, c.id, c.step, c.at, key, c.plain);
    if (!cur) return;
    cur.perf.update(c.t, dt);
  },
  debug: () => ({ performing: () => cur ? { key: cur.key, ...(cur.perf.info?.() ?? {}) } : null, crouch }),
};
