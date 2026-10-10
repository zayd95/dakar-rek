import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import type { Step } from '../activity/types';
import { Humanoid, humanoidReady } from '../actors/humanoid';
import { bend, bodyPoint, grip, mouth, nod, reach } from '../actors/gesture';
import { segClear, type Rect } from '../interact/approach';

/**
 * Actions are done in the world, not only shown as a progress bar: while an activity step runs, the player carries
 * the crates from the pirogue to the pile, sorts the parts on the counter, drinks the café Touba from a cup, runs on
 * the Corniche, washes at the basin, has their hair cut by the hairdresser… and the progress is visible in what
 * changes (the pile that grows, the cup that empties, the basket filled). One performance per kind of action; the
 * runner (src/activity/runner.ts) keeps the timing, the price and the effects.
 *
 * Gestures are procedural (src/actors/gesture.ts: arm reach, torso bend, nod) on top of the rig's clips; props are
 * plain shapes in the game's own design (no brand).
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
  touba: ['drink', 'coffee'], bouye: ['drink', 'juice'], attaya: ['drink', 'attaya'], 'attaya-place': ['drink', 'attaya'], soda: ['drink', 'juice'],
  brochettes: ['eat', 'skewer'], 'pain-lait': ['eat', 'bread'],
  galerie: ['look'], 'maison-idees': ['look'], 'savoir-faire': ['look'], dames: ['watch'],
  laver: ['wash'], ablutions: ['wash'], preparer: ['groom'], tapis: ['stretch'], radio: ['listen'], tele: ['tv'], dormir: ['sleep'], coiffure: ['haircut'],
};

function kindOf(id: string, step: Step, seated: boolean): [Kind, string?] | null {
  const k = BY_ID[id];
  if (k) return k;
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
    default: return step.effects?.counters?.chats ? ['talk'] : ['watch'];
  }
}

// ------------------------------------------------------------------ props
const mats = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number, opacity = 1) => { const k = c * 10 + Math.round(opacity * 9); let m = mats.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, transparent: opacity < 1, opacity }); mats.set(k, m); } return m; };
const box = (w: number, h: number, d: number, c: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.castShadow = true; return m; };
const cyl = (r1: number, r2: number, h: number, c: number, o = 1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), mat(c, o)); m.castShadow = true; return m; };
const ball = (r: number, c: number, sy = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), mat(c)); m.scale.y = sy; m.castShadow = true; return m; };

/** A carried load and its height in a pile. */
function load(type: string): [THREE.Object3D, number] {
  const g = new THREE.Group();
  if (type === 'crate') {                                               // blue fish crate with the catch on top
    const c = box(0.52, 0.26, 0.36, 0x2a6fb3); c.position.y = 0.13; g.add(c);
    for (let i = 0; i < 3; i++) { const f = ball(0.06, 0xb8c6cc, 0.45); f.scale.x = 3; f.position.set(-0.12 + i * 0.12, 0.27, (i % 2 ? 0.07 : -0.06)); f.rotation.y = 0.3 * i; g.add(f); }
    return [g, 0.28];
  }
  if (type === 'panel') { const p = box(0.8, 0.6, 0.05, 0xeee8dc); p.position.y = 0.3; g.add(p); const f = box(0.6, 0.4, 0.052, 0x3e8d87); f.position.y = 0.3; g.add(f); return [g, 0.06]; }
  if (type === 'files') { for (let i = 0; i < 3; i++) { const f = box(0.3, 0.025, 0.23, [0xd9b46a, 0x5d8fb8, 0xc85a4a][i]); f.position.y = 0.0125 + i * 0.026; g.add(f); } return [g, 0.08]; }
  const c = box(0.46, 0.34, 0.34, 0xb08a5a); c.position.y = 0.17; g.add(c);   // carton
  const t = box(0.47, 0.02, 0.06, 0xd8c08a); t.position.y = 0.34; g.add(t);
  return [g, 0.34];
}

/** An item worked by hand: [before, after] (after = sorted, cleaned, packed…). */
function piece(type: string, done: boolean): THREE.Object3D {
  switch (type) {
    case 'fish': { const f = ball(0.05, done ? 0xe8ecee : 0x8fa3ab, 0.4); f.scale.x = 3; return f; }
    case 'basket': { const g = new THREE.Group(); const b = cyl(0.09, 0.06, 0.07, 0xcda55c); b.position.y = 0.035; g.add(b); if (done) { const l = cyl(0.095, 0.095, 0.015, 0x8a5a2a); l.position.y = 0.075; g.add(l); } return g; }
    case 'phone': { const g = new THREE.Group(); const p = box(0.07, 0.015, 0.14, 0x1d1d1f); g.add(p); if (done) { const b = box(0.1, 0.05, 0.17, 0xe8e8ea); b.position.y = 0.02; g.add(b); } else { const s = box(0.06, 0.004, 0.12, 0x4c98ba); s.position.y = 0.009; g.add(s); } return g; }
    case 'fabric': return box(done ? 0.2 : 0.24, done ? 0.04 : 0.025, done ? 0.15 : 0.2, [0xd34c3c, 0xe9be43, 0x3e8d87, 0x566aba][Math.floor(Math.random() * 4)]);
    case 'produce': return ball(0.045, done ? 0xd9322b : 0xc4472b, 0.9);
    case 'skewer': { const g = new THREE.Group(); const s = box(0.24, 0.01, 0.01, 0xd8c8a0); g.add(s); for (let i = 0; i < 3; i++) { const m = box(0.04, 0.035, 0.035, done ? 0x5a2c12 : 0xa0523a); m.position.x = -0.06 + i * 0.05; g.add(m); } return g; }
    case 'net': { const n = box(done ? 0.16 : 0.22, done ? 0.05 : 0.03, done ? 0.12 : 0.18, done ? 0x2f6f4a : 0x4f8a5c); return n; }
    default: { const g = new THREE.Group(); const p = cyl(0.035, 0.035, 0.04, done ? 0xc0c6cc : 0x6a6a6a); g.add(p); return g; }   // parts
  }
}

function held(type: string): { obj: THREE.Object3D; fill: THREE.Object3D } {
  const g = new THREE.Group();
  if (type === 'coffee') { const c = cyl(0.03, 0.025, 0.06, 0xf2f2ec); c.position.y = 0.03; g.add(c); const f = cyl(0.027, 0.027, 0.045, 0x4a2a14); f.position.y = 0.03; g.add(f); return { obj: g, fill: f }; }
  if (type === 'attaya') { const c = cyl(0.025, 0.02, 0.07, 0xdfe8ee, 0.45); c.position.y = 0.035; g.add(c); const f = cyl(0.022, 0.018, 0.05, 0x9a4a12); f.position.y = 0.028; g.add(f); const foam = cyl(0.023, 0.023, 0.012, 0xf0e0b8); foam.position.y = 0.058; f.add(foam); foam.position.y = 0.03; return { obj: g, fill: f }; }
  if (type === 'bread') { const b = ball(0.045, 0xd9a35a, 0.8); b.scale.x = 3; return { obj: b, fill: b }; }
  if (type === 'skewer') { const s = piece('skewer', true); return { obj: s, fill: s }; }
  const c = cyl(0.035, 0.03, 0.12, 0xdfe8ee, 0.45); c.position.y = 0.06; g.add(c);                   // juice glass
  const f = cyl(0.032, 0.027, 0.09, type === 'juice' ? 0xe0cfae : 0x8b1a2b); f.position.y = 0.05; g.add(f);
  return { obj: g, fill: f };
}

// ------------------------------------------------------------------ helpers
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const angleTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

interface Env {
  ctx: GameCtx; body: Humanoid | null; scene: THREE.Group;
  /** Start position and the way the player faces the place. */
  O: THREE.Vector3; f: number;
  seconds: number;
  colliders: Rect[]; bounds: Rect | null;
  ground(x: number, z: number): number;
  /** Is the straight walk from a to b free of furniture and walls? */
  clear(a: { x: number; z: number }, b: { x: number; z: number }): boolean;
}
interface Perf { update(t: number, dt: number): void; pose?(h: Humanoid): void; dispose?(): void; info?(): Record<string, unknown> }

/** Free straight direction from O (relative to f), up to `len` m: the first of `tries` angles that is clear. */
function freeDir(e: Env, len: number, tries: number[]): { dir: THREE.Vector3; len: number } | null {
  for (const l of [len, len * 0.6, len * 0.35]) for (const a of tries) {
    const y = e.f + a, dir = V(Math.sin(y), 0, Math.cos(y));
    const end = { x: e.O.x + dir.x * (l + 0.6), z: e.O.z + dir.z * (l + 0.6) };
    if (e.bounds && (end.x < e.bounds.x0 || end.x > e.bounds.x1 || end.z < e.bounds.z0 || end.z > e.bounds.z1)) continue;
    if (e.clear(e.O, end)) return { dir, len: l };
  }
  return null;
}

/** Top of the solid right in front (counter, table, stall), or null when there is none. */
function surfaceAhead(e: Env, d = 0.55): number | null {
  const x = e.O.x + Math.sin(e.f) * d, z = e.O.z + Math.cos(e.f) * d;
  for (const c of e.colliders) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && (c as Rect & { h: number }).h <= 1.25) return (c as Rect & { h: number }).h;
  return null;
}

// ------------------------------------------------------------------ performances
/** Carry loads one by one from the pile in front of the player to a pile a few steps away; the new pile grows. */
function carry(e: Env, type: string): Perf {
  const n = Math.max(1, Math.min(4, Math.round(e.seconds / 2.3))), trip = e.seconds / n;
  const way = freeDir(e, Math.min(3, Math.max(0.8, (trip * 0.38) * 1.7)), [Math.PI / 2, -Math.PI / 2, Math.PI, 3 * Math.PI / 4, -3 * Math.PI / 4]);
  const dir = way?.dir ?? V(Math.sin(e.f + Math.PI / 2), 0, Math.cos(e.f + Math.PI / 2)), L = way?.len ?? 0;
  const fwd = V(Math.sin(e.f), 0, Math.cos(e.f));
  const src = e.O.clone().addScaledVector(fwd, 0.6), dst = e.O.clone().addScaledVector(dir, L + 0.6);
  src.y = e.ground(src.x, src.z) - 0.1; dst.y = e.ground(dst.x, dst.z) - 0.1;
  const loads = Array.from({ length: n }, () => load(type));
  const hgt = loads[0][1];
  loads.forEach(([o], i) => { o.position.copy(src).add(V(0, i * hgt, 0)); o.rotation.y = e.f; e.scene.add(o); });
  let moved = 0, inHands: THREE.Object3D | null = null, phase = 0, bendTo = 0;
  return {
    update(t) {
      const i = Math.min(n - 1, Math.floor(t / trip)), p = (t - i * trip) / trip;
      phase = p;
      // where the player is along the trip: out (carrying) then back (empty)
      const s = p < 0.12 ? 0 : p < 0.5 ? smooth((p - 0.12) / 0.38) : p < 0.62 ? 1 : 1 - smooth((p - 0.62) / 0.38);
      const pos = e.O.clone().addScaledVector(dir, L * s);
      e.ctx.player.pos.set(pos.x, e.ground(pos.x, pos.z), pos.z);
      const walking = (p > 0.12 && p < 0.5) || p > 0.62;
      const face = p < 0.12 ? e.f : p < 0.62 ? Math.atan2(dir.x, dir.z) : p < 0.97 ? Math.atan2(-dir.x, -dir.z) : e.f;
      e.ctx.player.drive({ speed: walking && L > 0.1 ? 1.6 : 0, facing: face });
      bendTo = p < 0.12 ? Math.sin(Math.PI * p / 0.12) * 0.55 : p > 0.5 && p < 0.62 ? Math.sin(Math.PI * (p - 0.5) / 0.12) * 0.55 : 0;
      // pick up the top load at 6 %, put it on the new pile at 56 %
      if (!inHands && moved === i && p >= 0.06 && p < 0.56) { inHands = loads[n - 1 - i][0]; }
      if (inHands && p >= 0.56) { inHands.position.copy(dst).add(V(0, moved * hgt, 0)); inHands.rotation.y = Math.atan2(dir.x, dir.z); inHands = null; moved++; }
    },
    pose(h) {
      bend(h, bendTo);
      const front = bodyPoint(h, 0.34, 1.0 - bendTo * 0.45, 0, tmp);
      if (inHands) {
        inHands.position.copy(front).add(V(0, -hgt / 2, 0)); inHands.rotation.y = h.group.rotation.y;
        const y = h.group.rotation.y, r = V(-Math.cos(y), 0, Math.sin(y));
        reach(h, 'R', tmp2.copy(front).addScaledVector(r, 0.22), V(0, -1, 0).addScaledVector(r, 0.6));
        reach(h, 'L', tmp2.copy(front).addScaledVector(r, -0.22), V(0, -1, 0).addScaledVector(r, -0.6));
      } else if (bendTo > 0.05) {
        const y = h.group.rotation.y, r = V(-Math.cos(y), 0, Math.sin(y)), at = phase < 0.3 ? src : dst;
        const top = V(at.x, at.y + Math.max(0.3, (phase < 0.3 ? n - moved : moved) * hgt) , at.z);
        reach(h, 'R', tmp2.copy(top).addScaledVector(r, 0.2), V(0, -1, 0).addScaledVector(r, 0.6), bendTo / 0.55);
        reach(h, 'L', tmp2.copy(top).addScaledVector(r, -0.2), V(0, -1, 0).addScaledVector(r, -0.6), bendTo / 0.55);
      }
    },
    info: () => ({ kind: 'carry', moved, of: n, trip: +phase.toFixed(2), carrying: !!inHands, leg: +L.toFixed(2) }),
  };
}

/** Items pass through the hands, from one pile to the other on the counter (or a trestle when there is none). */
function handwork(e: Env, type: string): Perf {
  const n = Math.max(3, Math.min(8, Math.round(e.seconds * 1.1))), each = e.seconds / n;
  const top = surfaceAhead(e);
  const fwd = V(Math.sin(e.f), 0, Math.cos(e.f)), right = V(-Math.cos(e.f), 0, Math.sin(e.f));
  const g0 = e.ground(e.O.x, e.O.z) - 0.1;
  let y = top !== null ? g0 + top : g0 + 0.82;
  const at = e.O.clone().addScaledVector(fwd, top !== null ? 0.5 : 0.5);
  if (top === null) {                                                   // a trestle to work on
    const t = box(0.8, 0.04, 0.45, 0x8b6a47); t.position.set(at.x, y - 0.02, at.z); t.rotation.y = e.f; e.scene.add(t);
    for (const s of [-1, 1]) { const l = box(0.04, 0.8, 0.4, 0x5a3f2a); l.position.set(at.x + right.x * s * 0.35, g0 + 0.4, at.z + right.z * s * 0.35); l.rotation.y = e.f; e.scene.add(l); }
  }
  y = Math.min(y, g0 + 1.25);
  const left = at.clone().addScaledVector(right, -0.28), done = at.clone().addScaledVector(right, 0.28);
  const todo = Array.from({ length: n }, (_, i) => { const o = piece(type, false); o.position.set(left.x + (i % 2) * 0.05, y + 0.02 + Math.floor(i / 2) * 0.04, left.z + (i % 3) * 0.03); o.rotation.y = e.f + i; e.scene.add(o); return o; });
  const finished: THREE.Object3D[] = [];
  let cur = -1, inHand: THREE.Object3D | null = null, p = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) {
      const i = Math.min(n - 1, Math.floor(t / each)); p = (t - i * each) / each;
      if (i !== cur) {                                                  // the previous one is done: on the other pile
        if (inHand) { inHand.removeFromParent(); const d = piece(type, true); d.position.set(done.x + (finished.length % 2) * 0.05, y + 0.02 + Math.floor(finished.length / 2) * 0.045, done.z); d.rotation.y = e.f; e.scene.add(d); finished.push(d); }
        cur = i; inHand = null;
      }
      if (!inHand && p > 0.25 && todo.length) inHand = todo.pop()!;
    },
    pose(h) {
      bend(h, 0.18);
      const work = V(at.x, y + 0.12, at.z);
      // right hand: to the pile, then the item in the middle, then to the finished pile; left hand steadies it
      const target = p < 0.25 ? tmp.copy(left).setY(y + 0.08) : p < 0.8 ? tmp.copy(work).addScaledVector(right, Math.sin(p * 18) * 0.04) : tmp.copy(done).setY(y + 0.1);
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      reach(h, 'R', target, V(0, -1, 0).addScaledVector(r, 0.7));
      reach(h, 'L', tmp2.copy(work).addScaledVector(r, -0.16), V(0, -1, 0).addScaledVector(r, -0.7), p > 0.25 && p < 0.8 ? 1 : 0.6);
      if (inHand) inHand.position.copy(grip(h, 'R', tmp2));
    },
    info: () => ({ kind: 'handwork', done: finished.length, left: todo.length, of: n, surface: top !== null }),
  };
}

/** Out and back along the clearest straight line, at a run. */
function run(e: Env): Perf {
  const way = freeDir(e, 10, [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4]);
  const dir = way?.dir ?? V(Math.sin(e.f), 0, Math.cos(e.f)), L = way?.len ?? 0;
  const lap = Math.max(1.5, (2 * L) / 4.2);
  let dist = 0;
  return {
    update(t, dt) {
      const p = (t % lap) / lap, s = p < 0.5 ? smooth(p * 2) : 1 - smooth((p - 0.5) * 2);
      const pos = e.O.clone().addScaledVector(dir, L * s);
      dist += Math.hypot(pos.x - e.ctx.player.pos.x, pos.z - e.ctx.player.pos.z) * (t > dt ? 1 : 0);
      e.ctx.player.pos.set(pos.x, e.ground(pos.x, pos.z), pos.z);
      const out = p < 0.5;
      e.ctx.player.drive({ speed: L > 0.5 ? 4.2 * Math.sin(Math.PI * ((p * 2) % 1)) + 1 : 0, facing: Math.atan2(out ? dir.x : -dir.x, out ? dir.z : -dir.z) });
    },
    info: () => ({ kind: 'run', metres: Math.round(dist), line: +L.toFixed(1) }),
  };
}

/** A bar overhead: hands on it, the body goes up and down. */
function pullups(e: Env): Perf {
  const g0 = e.ground(e.O.x, e.O.z), right = V(-Math.cos(e.f), 0, Math.sin(e.f));
  const barY = g0 + 2.15;
  const bar = cyl(0.025, 0.025, 1.4, 0x9aa0a6); bar.rotation.z = Math.PI / 2; bar.rotation.y = e.f; bar.position.set(e.O.x, barY, e.O.z); e.scene.add(bar);
  for (const s of [-1, 1]) { const post = cyl(0.04, 0.04, barY - g0 + 0.05, 0x333333); post.position.set(e.O.x + right.x * s * 0.7, g0 + (barY - g0) / 2, e.O.z + right.z * s * 0.7); e.scene.add(post); }
  let reps = 0, lift = 0, last = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) {
      const c = t / 1.7; lift = 0.38 * (0.5 - 0.5 * Math.cos(2 * Math.PI * c)) + 0.12;
      if (Math.floor(c + 0.5) > last) { last = Math.floor(c + 0.5); reps = last; }
      e.ctx.player.pos.y = g0 + lift;
    },
    pose(h) {
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      reach(h, 'R', V(e.O.x, barY, e.O.z).addScaledVector(r, 0.22), V(0, 0, 0).addScaledVector(r, 1).add(V(Math.sin(yaw) * -0.3, -0.5, Math.cos(yaw) * -0.3)));
      reach(h, 'L', V(e.O.x, barY, e.O.z).addScaledVector(r, -0.22), V(0, 0, 0).addScaledVector(r, -1).add(V(Math.sin(yaw) * -0.3, -0.5, Math.cos(yaw) * -0.3)));
    },
    dispose() { e.ctx.player.pos.y = g0; },
    info: () => ({ kind: 'pullups', reps }),
  };
}

/** Facing the person or the place: talking (the clip moves the hands). */
function talk(e: Env, alternate = false): Perf {
  const b = e.body;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) { if (b) b.hold = alternate ? (Math.floor(t / 1.8) % 2 ? 'Talk' : 'Idle') : 'Talk'; },
    pose(h) { if (alternate && h.hold === 'Idle') nod(h, 0.12 + 0.05 * Math.sin(performance.now() / 300)); },
    info: () => ({ kind: alternate ? 'watch' : 'talk' }),
  };
}

/** A slow walk round the place: two stops, looking, then back. */
function look(e: Env): Perf {
  const a = freeDir(e, 2.2, [Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, 0]);
  const b = freeDir(e, 2.2, [-Math.PI / 3, Math.PI / 3, -Math.PI / 2, Math.PI / 2, Math.PI]);
  const pts = [e.O.clone(), a ? e.O.clone().addScaledVector(a.dir, a.len) : e.O.clone(), b ? e.O.clone().addScaledVector(b.dir, b.len) : e.O.clone(), e.O.clone()];
  const seg = e.seconds / 3;
  let stops = 0;
  return {
    update(t) {
      const i = Math.min(2, Math.floor(t / seg)), p = (t - i * seg) / seg;
      const from = pts[i], to = pts[i + 1], s = smooth(p / 0.55);
      const pos = from.clone().lerp(to, s);
      e.ctx.player.pos.set(pos.x, e.ground(pos.x, pos.z), pos.z);
      const moving = p < 0.55 && from.distanceTo(to) > 0.2;
      e.ctx.player.drive({ speed: moving ? 1.1 : 0, facing: moving ? angleTo(from, to) : e.f });
      stops = i + (p > 0.55 ? 1 : 0);
    },
    pose(h) { nod(h, 0.08); },
    info: () => ({ kind: 'look', stops }),
  };
}

/** Something held in the right hand, brought to the mouth now and then; it empties. */
function sip(e: Env, type: string, eat: boolean): Perf {
  const { obj, fill } = held(type); e.scene.add(obj);
  const full = fill.scale.y;
  let k = 0, raise = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  if (type === 'attaya' && e.body) e.body.hold = 'Idle';
  return {
    update(t) {
      k = Math.min(1, t / e.seconds);
      const c = (t % 2.4) / 2.4; raise = c < 0.45 ? 0 : c < 0.6 ? smooth((c - 0.45) / 0.15) : c < 0.85 ? 1 : 1 - smooth((c - 0.85) / 0.15);
      if (eat) { const s = 1 - 0.7 * k; obj.scale.set(s, 1, 1); }
      else { fill.scale.y = full * (1 - 0.85 * k); }
    },
    pose(h) {
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      const rest = bodyPoint(h, 0.3, 1.05, 0.14, tmp), m = mouth(h, tmp2); m.y -= 0.06;
      reach(h, 'R', rest.lerp(m, raise), V(0, -1, 0).addScaledVector(r, 0.6));
      obj.position.copy(grip(h, 'R', tmp)); obj.rotation.set(0, yaw, 0);
      if (raise > 0.5) nod(h, -0.15 * raise);
    },
    info: () => ({ kind: eat ? 'eat' : 'drink', left: +(1 - k).toFixed(2), raised: raise > 0.9 }),
  };
}

/** Paying or handing over: the right hand goes to the counter with a note and comes back. */
function pay(e: Env): Perf {
  const note = box(0.14, 0.004, 0.07, 0x5f9e5a); e.scene.add(note);
  let out = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) { const p = Math.min(1, t / Math.max(0.6, e.seconds)); out = Math.sin(Math.PI * p); note.visible = p < 0.55; },
    pose(h) {
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      reach(h, 'R', bodyPoint(h, 0.25 + 0.35 * out, 1.0 + 0.1 * out, 0.12, tmp), V(0, -1, 0).addScaledVector(r, 0.6), Math.min(1, out * 2));
      note.position.copy(grip(h, 'R', tmp2)); note.rotation.y = yaw;
    },
    info: () => ({ kind: 'pay', handed: !note.visible }),
  };
}

/** Bending over a basin: water to the face, splashes; the basin empties. */
function wash(e: Env): Perf {
  const fwd = V(Math.sin(e.f), 0, Math.cos(e.f)), g0 = e.ground(e.O.x, e.O.z) - 0.1;
  const at = e.O.clone().addScaledVector(fwd, 0.5); at.y = g0 + 0.1;
  const basin = cyl(0.26, 0.2, 0.14, 0x2a8fd1); basin.position.set(at.x, at.y + 0.07, at.z); e.scene.add(basin);
  const water = cyl(0.24, 0.24, 0.02, 0x8fd0f0, 0.8); water.position.set(at.x, at.y + 0.12, at.z); e.scene.add(water);
  const drops: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  let k = 0, c = 0, lastSplash = -1;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t, dt) {
      k = Math.min(1, t / e.seconds); c = (t % 1.4) / 1.4;
      water.position.y = at.y + 0.12 - 0.09 * k; water.scale.setScalar(1 - 0.15 * k);
      const n = Math.floor(t / 1.4);
      if (c > 0.55 && n !== lastSplash && e.body) {                    // water thrown on the face
        lastSplash = n; const m = mouth(e.body, tmp);
        for (let i = 0; i < 6; i++) { const d = ball(0.015, 0x9fd8f5); d.position.copy(m); e.scene.add(d); drops.push({ m: d, v: V((Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2), life: 0.6 }); }
      }
      for (const d of drops) { d.life -= dt; d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt); d.m.visible = d.life > 0; }
    },
    pose(h) {
      const down = c < 0.45, lean = down ? 0.75 : 0.35;
      bend(h, lean);
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      const t = down ? V(at.x, at.y + 0.14, at.z) : mouth(h, tmp2);
      reach(h, 'R', tmp.copy(t).addScaledVector(r, 0.08), V(0, -1, 0).addScaledVector(r, 0.6));
      reach(h, 'L', tmp.copy(t).addScaledVector(r, -0.08), V(0, -1, 0).addScaledVector(r, -0.6));
    },
    info: () => ({ kind: 'wash', water: +(1 - k).toFixed(2), splashes: lastSplash + 1 }),
  };
}

/** In front of the mirror: combing strokes over the head. */
function groom(e: Env): Perf {
  const comb = box(0.14, 0.012, 0.03, 0x1d1d1f); e.scene.add(comb);
  let c = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) { c = t; },
    pose(h) {
      const head = h.bone('head'); if (!head) return;
      const top = head.getWorldPosition(tmp).add(V(0, 0.17, 0));
      const yaw = h.group.rotation.y, f = V(Math.sin(yaw), 0, Math.cos(yaw)), r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      top.addScaledVector(f, 0.06 * Math.sin(c * 5)).addScaledVector(r, 0.06);
      reach(h, 'R', top, V(0, 0, 0).addScaledVector(r, 1).add(V(0, -0.3, 0)));
      comb.position.copy(grip(h, 'R', tmp2)); comb.rotation.y = yaw;
    },
    info: () => ({ kind: 'groom' }),
  };
}

/** Arms up, a long stretch, then down again. */
function stretch(e: Env): Perf {
  let w = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
  return {
    update(t) { w = Math.sin(Math.PI * Math.min(1, t / e.seconds)); },
    pose(h) {
      const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
      for (const [side, s] of [['R', 1], ['L', -1]] as const) reach(h, side, bodyPoint(h, 0.05, 2.25, 0.25 * s, tmp), V(0, 0, 0).addScaledVector(r, s), Math.min(1, w * 1.3));
      bend(h, -0.12 * w);
    },
    info: () => ({ kind: 'stretch', up: +w.toFixed(2) }),
  };
}

/** Listening to the radio: the head goes with the music. */
function listen(e: Env): Perf {
  let c = 0;
  e.ctx.player.drive({ speed: 0, facing: e.f });
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

/** The hairdresser stands behind the chair and works on the player's head with scissors. */
let barber: Humanoid | null = null;
function haircut(e: Env): Perf {
  const seat = e.ctx.player.seated();
  if (!seat || !humanoidReady()) return { update() {}, info: () => ({ kind: 'haircut', barber: false }) };
  if (!barber) barber = new Humanoid({ skin: 0x5b3420, style: 'dress', top: 0xc2417f, bottom: 0xc2417f, female: true, pattern: 'wax', accent: 0xf4c20d, hat: 'headwrap', hatColor: 0xf4c20d });
  const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
  barber.group.position.set(seat.x - fx * 0.55, e.ground(seat.x, seat.z), seat.z - fz * 0.55);
  barber.group.rotation.set(0, seat.yaw, 0); barber.hold = 'Idle'; barber.group.visible = true;
  e.scene.add(barber.group);
  const scissors = box(0.12, 0.01, 0.025, 0x9aa0a6); e.scene.add(scissors);
  let c = 0, cuts = 0;
  const player = e.body;
  barber.overlay = h => {
    if (!player) return;
    const head = player.bone('head'); if (!head) return;
    const top = head.getWorldPosition(tmp).add(V(0, 0.16, 0));
    const yaw = h.group.rotation.y, r = V(-Math.cos(yaw), 0, Math.sin(yaw));
    reach(h, 'R', tmp2.copy(top).addScaledVector(r, 0.1 + 0.05 * Math.sin(c * 3)).add(V(0, 0.03 * Math.sin(c * 11), 0)), V(0, -1, 0).addScaledVector(r, 1));
    scissors.position.copy(grip(h, 'R', tmp2)); scissors.rotation.y = yaw + Math.sin(c * 20) * 0.3;
    reach(h, 'L', top.addScaledVector(r, -0.12), V(0, -1, 0).addScaledVector(r, -1));
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
  ctx.player.drive(null);
  cur = null;
}

function begin(ctx: GameCtx, id: string, step: Step, at: { x: number; z: number } | undefined, key: string) {
  const seated = !!ctx.player.seated();
  const kind = kindOf(id, step, seated);
  if (!kind) return;
  const [k, type] = kind;
  if (seated && !['tv', 'sleep', 'haircut'].includes(k)) return;      // seated: the meal module does the rest
  const w = ctx.world(), inside = ctx.inside();
  const p = ctx.player.pos;
  const root = new THREE.Group(); ctx.scene.add(root);
  const colliders = (inside ? inside.int.colliders : w?.colliders ?? []) as (Rect & { h: number })[];
  const near = colliders.filter(c => c.x1 > p.x - 14 && c.x0 < p.x + 14 && c.z1 > p.z - 14 && c.z0 < p.z + 14);
  const grown = near.map(c => ({ x0: c.x0 - 0.35, z0: c.z0 - 0.35, x1: c.x1 + 0.35, z1: c.z1 + 0.35 }));
  const f = at && Math.hypot(at.x - p.x, at.z - p.z) > 0.3 ? angleTo(p, at) : ctx.player.facing();
  const env: Env = {
    ctx, body: ctx.player.body(), scene: root, O: p.clone(), f, seconds: Math.max(0.5, step.seconds ?? 1),
    colliders: near, bounds: inside ? inside.int.bounds : w?.bounds ?? null,
    ground: (x, z) => 0.1 + (inside || !w ? 0 : w.heightAt(x, z)),
    clear: (a, b) => segClear(a, b, grown),
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
    const c = ctx.activities.current;
    const timed = c && !c.walking && (c.step.seconds ?? 0) > 0 && ctx.mode() === 'busy';
    const key = c ? `${c.spec.id}:${c.index}` : '';
    if (cur && (!timed || cur.key !== key)) stop(ctx);
    if (!timed || !c) return;
    if (!cur) begin(ctx, c.spec.id, c.step, c.ctx.at, key);
    if (!cur) return;
    cur.perf.update(c.t, dt);
  },
  debug: () => ({ performing: () => cur ? { key: cur.key, ...(cur.perf.info?.() ?? {}) } : null }),
};
