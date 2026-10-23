import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameCtx } from '../game/modules';
import type { Gesture } from '../activity/types';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { bend, bodyAxes, crouch, forearmDir, grip, nod, reach } from '../actors/gesture';
import { focusActivity, type InWorldPlayer } from '../activity/inWorld';
import { GRILL_RULES, cook, cue, customerLine, newSkewer, orderLine, orderScore, servable, sideColor, skewerScore, turn, type Skewer } from '../activity/grillRules';
import { audioBus } from '../lamb/audio';
import { hasGestured } from '../arena/exteriorAudio';
import { glowTexture, type VenueKit } from './kit';
import { FrameCam, Layer, esc } from './inWorldKit';

/**
 * Grilling at a Dibi, in the world (the grill jobs of src/activity/templates.ts dibi(), their gesture G.grill): the player
 * stands at the grill beside the dibi master, the camera across the coals. The brochettes are laid raw on the grate one by
 * one; the side on the coals browns (its colour changes, smoke rises and thickens if it is left too long), the side up
 * stays pale until it is turned. Tap (or swipe) a brochette to turn it: the right hand takes it by the ring and rolls it
 * over. Once every side is cooked enough, « Servir »: the brochettes go onto the plate on the side table, the plate to the
 * customer waiting there, who says how it is; a small card says how well the order was grilled. The left hand fans the coals.
 * Forgiving (src/activity/grillRules.ts): a wide golden window, slow overcooking, and the order is served by the owner after
 * GRILL_RULES.maxSeconds whatever its state. The runner pays as before (gesturePay of the score), counts the shift on the
 * ladder, and the day worked for the streak (src/main.ts `pay`): nothing about the job itself changed.
 */
export interface GrillEnv {
  ctx: GameCtx;
  kit: VenueKit;
  /** The grill's centre (local) and the top of its grate. */
  grill: { x: number; z: number; top: number };
  /** Where the player stands, the side table with the plate, the customer's spot (local). */
  stand: { x: number; z: number };
  table: { x: number; z: number; top: number };
  customer: { x: number; z: number; yaw: number };
  /** The player is at this grill now. */
  here(): boolean;
  /** The night layer's own brochettes: the dibi master keeps the left of the grate while the player has the right. */
  reserve(on: boolean): void;
  owner: string;
  seed: number;
}

interface Piece { meat: boolean; side: 0 | 1; from: number; to: number }
interface Stick {
  s: Skewer; mesh: THREE.Mesh; colors: THREE.BufferAttribute; pieces: Piece[];
  x: number; laid: boolean; layT: number; angle: number; target: number; chip: HTMLElement; served: boolean; flyT: number;
  from: THREE.Vector3; to: THREE.Vector3;
}
interface Run {
  g: Extract<Gesture, { kind: 'grill' }>; label: string; done: (score: number) => void;
  t: number; sticks: Stick[]; queue: number[]; hand: { i: number; t: number } | null;
  phase: 'lay' | 'cook' | 'serve' | 'hand' | 'over'; serveT: number; served: number; ended: boolean; auto: boolean; score: number;
}

const WORLD = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), Q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const SPACING = 0.19, LEN = 0.96;

export class GrillPlay implements InWorldPlayer {
  readonly kind = 'grill' as const;
  private run: Run | null = null;
  private layer: Layer | null = null;
  private els: { head: HTMLElement; say: HTMLElement; serve: HTMLElement } | null = null;
  private readonly cam = new FrameCam();
  private group: THREE.Group | null = null;
  private plate: THREE.Mesh | null = null;
  private fan: THREE.Mesh | null = null;
  private smoke: THREE.Points | null = null;
  private puffs: { x: number; y: number; z: number; t: number; life: number; i: number; dark: number }[] = [];
  private customer: Humanoid | null = null;
  private custT = 0; private custWalk = 0; private holding = false;
  private sayT = 0;
  private linger = 0;
  private fanT = 0;
  private sizzle: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  private overlay = (h: Humanoid) => this.pose(h);
  private rand: () => number;

  constructor(private readonly env: GrillEnv) {
    let a = env.seed >>> 0;
    this.rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  accepts(g: Gesture) { return g.kind === 'grill' && this.env.here(); }

  /** Local → world. */
  private w(x: number, y: number, z: number, out = WORLD) { this.env.kit.group.updateMatrixWorld(); return out.set(x, y, z).applyMatrix4(this.env.kit.group.matrixWorld); }

  // ------------------------------------------------------------------------------------------------ play / stop
  play(g: Gesture, label: string, done: (score: number) => void): () => void {
    if (g.kind !== 'grill') throw new Error('not a grill');
    const { ctx, kit } = this.env;
    if (this.layer) this.teardown();
    const n = Math.max(1, Math.min(8, g.skewers));
    const st = kit.w(this.env.stand.x, this.env.stand.z);
    ctx.player.place(st.x, st.z, kit.yaw);
    this.build(n);
    const r: Run = { g, label, done, t: 0, sticks: [], queue: [], hand: null, phase: 'lay', serveT: 0, served: 0, ended: false, auto: false, score: 0 };
    r.sticks = this.makeSticks(n);
    this.run = r;
    const body = ctx.player.body(); if (body) body.overlay = this.overlay;
    this.env.reserve(true);
    focusActivity(true);
    this.say(`<b>Client</b> « ${esc(orderLine(n))} »`, 3.4);
    this.startSizzle();
    return () => { if (this.run === r) { this.run = null; this.teardown(); } };
  }

  finishNow(score: number) {
    const r = this.run; if (!r || r.ended) return false;
    this.finish(r, score);
    return true;
  }

  private finish(r: Run, forced?: number) {
    if (r.ended) return;
    r.ended = true; r.phase = 'over';
    const score = forced ?? orderScore(r.sticks.map(s => s.s));
    r.score = score;
    const line = customerLine(score);
    this.say(`<b>${r.auto ? esc(this.env.owner) : 'Client'}</b> « ${esc(r.auto ? 'Je m’en occupe, la commande attendait !' : line.text)} »`, 3.2);
    this.layer?.showCard({ title: r.label, pct: score, line: r.auto ? `${this.env.owner} a servi la commande à ta place.` : `${line.mood === 'top' ? 'Pourboire du client · ' : ''}${score >= 0.62 ? 'Brochettes bien servies' : 'Un peu inégal'}`, top: line.mood === 'top',
      marks: r.sticks.map(s => skewerScore(s.s) >= 0.8) });
    this.custT = 0; this.custWalk = 0;
    this.linger = 3.2;
    if (this.run === r) this.run = null;
    this.stopSizzle();
    r.done(score);
  }

  private teardown() {
    const { ctx } = this.env;
    const body = ctx.player.body(); if (body && body.overlay === this.overlay) body.overlay = null;
    this.layer?.dispose(); this.layer = null; this.els = null;
    for (const o of [this.group, this.fan]) {
      if (!o) continue;
      o.removeFromParent();
      o.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });   // (the shared glow texture is kept)
    }
    this.group = null; this.plate = null; this.fan = null; this.smoke = null; this.puffs = [];
    if (this.customer) { this.customer.dispose(); this.customer = null; }
    this.cam.release(); this.env.reserve(false); this.stopSizzle();
    this.linger = 0; this.holding = false;
    focusActivity(false);
  }

  // ------------------------------------------------------------------------------------------------ the scene: brochettes, plate, fan, smoke, the customer
  private build(n: number) {
    const L = this.layer = new Layer('iw-grill');
    this.els = { head: L.add('iw-head', ''), say: L.add('iw-say', ''), serve: L.add('iw-btn', 'Servir', 'button') };
    this.els.serve.style.visibility = 'hidden'; this.els.say.style.visibility = 'hidden';
    this.els.serve.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.serve(); });
    // a touch on a brochette turns it (a swipe starting on it too: it is taken as it lands)
    L.el.addEventListener('pointerdown', e => { e.preventDefault(); this.tap(e.clientX, e.clientY); });
    const g = this.group = new THREE.Group(); g.name = 'grill_play';
    this.env.kit.group.add(g);
    // the plate on the side table
    const plate = this.plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.025, 20), new THREE.MeshLambertMaterial({ color: 0xf4f1e8 }));
    plate.position.set(this.env.table.x, this.env.table.top + 0.013, this.env.table.z); g.add(plate);
    const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 3, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe0b46a }));
    bread.position.set(0.02, 0.04, -0.07); plate.add(bread);
    // the fan of woven straw in the left hand
    const fan = this.fan = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.17), new THREE.MeshLambertMaterial({ color: 0xc9a45c }));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.12), new THREE.MeshLambertMaterial({ color: 0x7a5a32 })); handle.position.set(0, 0, -0.13); fan.add(handle);
    this.env.ctx.extra.add(fan);
    // smoke: one cloud of soft points over the brochettes
    const np = 26, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(np * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(np * 4), 4));
    const pm = new THREE.PointsMaterial({ size: 0.34, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false });
    this.smoke = new THREE.Points(geo, pm); this.smoke.renderOrder = 4; this.smoke.frustumCulled = false; g.add(this.smoke);
    for (let i = 0; i < np; i++) this.puffs.push({ x: 0, y: -10, z: 0, t: 1, life: 1, i: i % Math.max(1, n), dark: 0 });
    // the customer, waiting by the side table
    if (humanoidReady()) {
      const c = this.customer = new Humanoid(randomLook(this.rand));
      const p = this.env.kit.w(this.env.customer.x, this.env.customer.z);
      c.group.position.set(p.x, this.env.ctx.player.pos.y, p.z); c.group.rotation.y = this.env.kit.yaw + this.env.customer.yaw; c.hold = 'Talk';
      this.env.ctx.extra.add(c.group);
    }
  }

  private makeSticks(n: number): Stick[] {
    const out: Stick[] = [];
    const { grill, table } = this.env;
    for (let i = 0; i < n; i++) {
      const x = this.env.stand.x + 0.12 + (i - (n - 1) / 2) * SPACING;
      const { geo, pieces } = skewerGeometry(this.rand);
      const colors = geo.getAttribute('color') as THREE.BufferAttribute;
      // lit from below by the coals: a warm glow of their own, so the colour reads at night too
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a2a10, emissiveIntensity: 0.55 }));
      mesh.castShadow = true;
      // raw, stacked on the plate's side of the table until laid
      mesh.position.set(table.x - 0.05 + (i % 2) * 0.03, table.top + 0.05 + i * 0.03, table.z); mesh.rotation.set(0, 0.25, 0);
      this.group!.add(mesh);
      const chip = this.layer!.add('iw-chip wait', '');
      chip.style.visibility = 'hidden';
      out.push({ s: newSkewer(), mesh, colors, pieces, x, laid: false, layT: -i * GRILL_RULES.layEvery, angle: 0, target: 0, chip, served: false, flyT: 0,
        from: mesh.position.clone(), to: new THREE.Vector3(x, grill.top + 0.035, grill.z) });
      this.paintStick(out[i]);
    }
    return out;
  }

  private paintStick(st: Stick) {
    // side 0 is the half that starts on the coals; after an odd number of turns it is the one facing up
    const odd = st.s.turns % 2 === 1, d0 = odd ? st.s.up : st.s.down, d1 = odd ? st.s.down : st.s.up;
    const c = new THREE.Color(), arr = st.colors.array as Float32Array;
    for (const p of st.pieces) {
      c.setHex(sideColor(p.side === 0 ? d0 : d1, !p.meat));
      for (let v = p.from; v < p.to; v++) { arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b; }
    }
    st.colors.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------------ the player's touches
  private tap(px: number, py: number) {
    const r = this.run; if (!r || r.ended || r.phase === 'serve' || r.phase === 'hand') return;
    const cam = this.env.ctx.camera;
    let best = -1, bd = 56;
    r.sticks.forEach((st, i) => {
      if (!st.laid || st.served) return;
      // distance from the touch to the brochette's segment on screen
      const a = this.screen(this.w(st.mesh.position.x, st.mesh.position.y, st.mesh.position.z - LEN * 0.45, A).clone(), cam);
      const b = this.screen(this.w(st.mesh.position.x, st.mesh.position.y, st.mesh.position.z + LEN * 0.45, B).clone(), cam);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2)) : 0;
      const d = Math.hypot(a.x + dx * u - px, a.y + dy * u - py);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0 && !r.queue.includes(best) && r.hand?.i !== best) r.queue.push(best);
    else if (best < 0 && servable(r.sticks.map(s => s.s))) {
      // a touch near the plate serves too
      const p = this.screen(this.w(this.env.table.x, this.env.table.top, this.env.table.z, A).clone(), cam);
      if (p && Math.hypot(p.x - px, p.y - py) < 70) this.serve();
    }
  }

  private screen(v: THREE.Vector3, cam: THREE.Camera) { v.project(cam); return v.z > 1 ? null : { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }

  private serve(auto = false) {
    const r = this.run; if (!r || r.ended || r.phase === 'serve' || r.phase === 'hand') return;
    if (!auto && !servable(r.sticks.map(s => s.s))) return;
    r.phase = 'serve'; r.auto = auto; r.serveT = 0; r.queue = []; r.hand = null;
    this.els!.serve.dataset.on = '';
    for (const st of r.sticks) st.chip.style.visibility = 'hidden';
    this.stopSizzle();
  }

  // ------------------------------------------------------------------------------------------------ every frame (the Dibi's update)
  update(dt: number) {
    const r = this.run;
    this.layer?.tick(dt);
    this.stepCustomer(dt);
    this.stepSmoke(dt, r);
    if (this.sayT > 0 && (this.sayT -= dt) <= 0 && this.els) this.els.say.style.visibility = 'hidden';
    if (!r) {
      if (this.linger > 0) {
        this.linger -= dt;
        const p = this.env.ctx.player.pos, s = this.env.kit.w(this.env.stand.x, this.env.stand.z);
        if (this.linger <= 0 || Math.hypot(p.x - s.x, p.z - s.z) > 0.5) this.teardown();
      }
      return;
    }
    r.t += dt; this.fanT += dt;
    const heat = r.g.heat ?? 1;
    // laying the brochettes, one after the other
    for (const st of r.sticks) {
      if (st.laid) continue;
      st.layT += dt;
      if (st.layT < 0) continue;
      const k = Math.min(1, st.layT / 0.4), e = k * k * (3 - 2 * k);
      st.mesh.position.lerpVectors(st.from, st.to, e); st.mesh.position.y += Math.sin(Math.PI * k) * 0.12;
      st.mesh.rotation.y = 0.25 * (1 - e);
      if (k >= 1) { st.laid = true; st.mesh.rotation.y = 0; }
    }
    if (r.phase === 'lay' && r.sticks.every(s => s.laid)) r.phase = 'cook';
    // cooking: the side on the coals browns
    if (r.phase === 'cook' || r.phase === 'lay') for (const st of r.sticks) if (st.laid) cook(st.s, dt, heat);
    // the hand: one turn at a time (reach 0.14 s, roll 0.3 s, back 0.16 s)
    if (!r.hand && r.queue.length) { r.hand = { i: r.queue.shift()!, t: 0 }; }
    if (r.hand) {
      const h = r.hand, st = r.sticks[h.i];
      const before = h.t; h.t += dt;
      if (before < 0.14 && h.t >= 0.14) { turn(st.s); st.target += Math.PI; this.hiss(); }
      if (h.t >= 0.6) r.hand = null;
    }
    for (const st of r.sticks) {
      const d = st.target - st.angle;
      if (Math.abs(d) > 1e-3) st.angle += Math.sign(d) * Math.min(Math.abs(d), dt * Math.PI / 0.3);
      if (st.laid && !st.served) { st.mesh.rotation.z = st.angle; }
    }
    // colours, a few times a second
    if (Math.floor(r.t * 8) !== Math.floor((r.t - dt) * 8)) for (const st of r.sticks) this.paintStick(st);
    // serving: each brochette onto the plate, then the plate to the customer
    if (r.phase === 'serve') {
      r.serveT += dt;
      const each = r.auto ? 0.12 : 0.32;
      const i = Math.floor(r.serveT / each);
      r.sticks.forEach((st, k) => {
        if (k > i || st.served) return;
        st.flyT += dt / each;
        const p = this.plate!.position, to = C.set(p.x + (k - (r.sticks.length - 1) / 2) * 0.03, p.y + 0.03 + k * 0.012, p.z);
        const from = A.set(st.x, this.env.grill.top + 0.035, this.env.grill.z), e = Math.min(1, st.flyT);
        st.mesh.position.lerpVectors(from, to, e * e * (3 - 2 * e)); st.mesh.position.y += Math.sin(Math.PI * e) * 0.14;
        st.mesh.rotation.z = st.angle * (1 - e); st.mesh.rotation.y = e * 0.5;
        if (e >= 1) { st.served = true; st.mesh.removeFromParent(); this.plate!.attach(st.mesh); }
      });
      if (r.sticks.every(s => s.served)) { r.phase = 'hand'; r.serveT = 0; }
    } else if (r.phase === 'hand') {
      r.serveT += dt;
      if (r.serveT > 0.7 && !this.holding) { this.holding = true; }
      if (r.serveT > 1.0) this.finish(r);
    } else {
      const ready = servable(r.sticks.map(s => s.s));
      if (this.els) this.els.serve.dataset.on = ready ? '1' : '';
      if (r.t >= GRILL_RULES.maxSeconds) this.serve(true);
      const turns = r.sticks.filter(s => s.s.turns > 0).length, done = r.sticks.filter(s => cue(s.s) === 'done').length;
      const head = r.t < 5 ? `Touche une brochette pour la retourner<small>Le dessous doit être doré · puis « Servir »</small>`
        : ready ? `Tout est cuit · sers la commande<small>${done}/${r.sticks.length} brochettes dorées</small>` : `${turns}/${r.sticks.length} retournées<small>Retourne quand le dessous est doré</small>`;
      if (this.els && this.els.head.dataset.k !== head) { this.els.head.dataset.k = head; this.els.head.innerHTML = head; }
    }
    this.setSizzle(r.phase === 'cook' || r.phase === 'lay' ? r.sticks.filter(s => s.laid && !s.served).length : 0);
  }

  /** The player's arms (Humanoid.overlay): the left hand fans the coals, the right turns the brochettes, both carry the plate. */
  private pose(h: Humanoid) {
    const r = this.run, holding = this.holding && !r;
    const { fwd: F, right: R } = bodyAxes(h, new THREE.Vector3(), new THREE.Vector3());
    const at = (f: number, u: number, s: number, out: THREE.Vector3) => out.copy(h.group.position).addScaledVector(F, f).addScaledVector(R, s).setY(h.group.position.y + u);
    const pole = (side: 1 | -1) => C.copy(Y).multiplyScalar(-1).addScaledVector(R, side * 0.8).addScaledVector(F, -0.3).normalize();
    const serving = r && (r.phase === 'serve' || r.phase === 'hand');
    // the body first (the arms then work from it): knees a little bent, leaning over the grill, eyes on the brochettes
    const hd0 = !serving && !holding ? r?.hand : null;
    const k0 = hd0 ? (hd0.t < 0.14 ? hd0.t / 0.14 : hd0.t < 0.44 ? 1 : Math.max(0, 1 - (hd0.t - 0.44) / 0.16)) : 0;
    crouch(h, 0.03);
    bend(h, serving || holding ? 0.12 : 0.1 + 0.12 * k0); nod(h, serving || holding ? 0.3 : 0.35 + 0.15 * k0);
    if (serving || holding) {
      // both hands: picking the brochettes onto the plate, then giving it to the customer
      const p = this.w(this.plate!.position.x, this.plate!.position.y + 0.04, this.plate!.position.z, B).clone();
      const give = r?.phase === 'hand' || holding ? Math.min(1, (r?.serveT ?? 1) / 0.7) : 0;
      const cust = this.customer ? A.copy(this.customer.group.position).setY(h.group.position.y + 1.05) : p;
      const target = new THREE.Vector3().lerpVectors(p, cust, 0.45 * give).setY(p.y + 0.12 * give);
      if (r?.phase === 'serve') {
        const i = Math.min(r.sticks.length - 1, Math.floor(r.serveT / (r.auto ? 0.12 : 0.32))), st = r.sticks[i];
        const sp = this.w(st.mesh.position.x, st.mesh.position.y, st.mesh.position.z, A).clone();
        reach(h, 'R', sp.add(new THREE.Vector3(0, 0.03, 0)), pole(1), 1);
        reach(h, 'L', p, pole(-1), 0.85);
      } else { reach(h, 'R', target.clone().addScaledVector(R, 0.09), pole(1), 1); reach(h, 'L', target.clone().addScaledVector(R, -0.09), pole(-1), 1); }
    } else {
      // the left hand fans the coals
      const k = Math.sin(this.fanT * 9);
      reach(h, 'L', at(0.44, 1.02 + 0.05 * k, -0.24 + 0.05 * k, B), pole(-1), 1);
      // the right hand: on the brochette being turned, else ready over the grill
      const hd = r?.hand;
      if (hd) {
        const st = r!.sticks[hd.i];
        const ring = this.w(st.x, this.env.grill.top + 0.05, this.env.grill.z - LEN * 0.47, A).clone();
        const rest = at(0.38, 1.08, 0.2, B).clone();
        const k2 = hd.t < 0.14 ? hd.t / 0.14 : hd.t < 0.44 ? 1 : Math.max(0, 1 - (hd.t - 0.44) / 0.16);
        const e = k2 * k2 * (3 - 2 * k2);
        // the wrist rolls with the brochette: a small circle round its axis while turning
        if (hd.t >= 0.14 && hd.t < 0.44) { const a = (hd.t - 0.14) / 0.3 * Math.PI; ring.y += Math.sin(a) * 0.03; ring.addScaledVector(R, Math.cos(a) * 0.02); }
        reach(h, 'R', rest.lerp(ring, e), pole(1), 1);
      } else reach(h, 'R', at(0.36, 1.06 + 0.015 * Math.sin(this.fanT * 2.3), 0.2, B), pole(1), 1);
    }
    // the fan follows the left hand
    if (this.fan) {
      const visible = !(serving || holding);
      this.fan.visible = visible;
      if (visible) {
        grip(h, 'L', this.fan.position);
        const dir = forearmDir(h, 'L', A);
        Q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir); this.fan.quaternion.copy(Q);
        this.fan.rotateZ(Math.sin(this.fanT * 9) * 0.5);
      }
    }
    // the plate held by the customer once given
    if (holding && this.customer && this.plate) {
      const cp = this.customer.group.position, cy = this.customer.group.rotation.y;
      const wpos = A.set(cp.x + Math.sin(cy) * 0.32, cp.y + 1.0, cp.z + Math.cos(cy) * 0.32);
      this.env.kit.group.worldToLocal(wpos); this.plate.position.copy(wpos);
    }
  }

  private stepCustomer(dt: number) {
    const c = this.customer; if (!c) return;
    this.custT += dt;
    let speed = 0;
    if (!this.run && this.holding && this.linger > 0) {
      // served: a word, then off to the tables with the plate
      if (this.linger < 2.2) {
        this.custWalk += dt;
        const yaw = this.env.kit.yaw + this.env.customer.yaw + Math.PI * 0.85;
        c.group.rotation.y = yaw; speed = 1.1;
        c.group.position.x += Math.sin(yaw) * speed * dt; c.group.position.z += Math.cos(yaw) * speed * dt;
      }
    }
    c.hold = speed > 0 ? null : this.holding ? 'Idle' : 'Talk';
    c.animate(dt, speed);
  }

  private stepSmoke(dt: number, r: Run | null) {
    const pts = this.smoke; if (!pts) return;
    const P = pts.geometry.attributes.position as THREE.BufferAttribute, Cc = pts.geometry.attributes.color as THREE.BufferAttribute;
    const sticks = r?.sticks.filter(s => s.laid && !s.served) ?? [];
    this.puffs.forEach((p, k) => {
      p.t += dt / p.life;
      if (p.t >= 1) {
        if (!sticks.length) { P.setXYZ(k, 0, -10, 0); Cc.setXYZW(k, 0, 0, 0, 0); return; }
        const st = sticks[k % sticks.length];
        p.t = this.rand() * 0.15; p.life = 1.1 + this.rand() * 0.9;
        p.x = st.x + (this.rand() - 0.5) * 0.08; p.y = this.env.grill.top + 0.08; p.z = this.env.grill.z + (this.rand() - 0.5) * 0.7;
        p.dark = Math.max(0, Math.min(1, (st.s.down - 1.0) / 0.8));
        p.i = 0.25 + 0.75 * Math.min(1, st.s.down);
      }
      p.y += dt * 0.55; p.x += dt * 0.08; p.z += dt * 0.05;
      P.setXYZ(k, p.x, p.y, p.z);
      const a = (1 - p.t) * Math.min(1, p.t * 5) * 0.32 * p.i, g = 0.86 - 0.5 * p.dark;
      Cc.setXYZW(k, g, g, g * 0.98, a);
    });
    P.needsUpdate = true; Cc.needsUpdate = true;
  }

  private say(html: string, seconds: number) {
    if (!this.els) return;
    this.els.say.innerHTML = html; this.els.say.style.visibility = ''; this.sayT = seconds;
  }

  // ------------------------------------------------------------------------------------------------ the sound of the grill: a soft sizzle, a hiss on each turn
  private startSizzle() {
    if (this.sizzle || !hasGestured()) return;
    const b = audioBus(); if (!b) return;
    const c = b.ctx, len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const crackle = Math.random() < 0.0016 ? (Math.random() * 2 - 1) * 0.9 : 0; last = 0.6 * last + (Math.random() * 2 - 1) * 0.4; d[i] = last * 0.25 + crackle; }
    const src = c.createBufferSource(), hp = c.createBiquadFilter();
    src.buffer = buf; src.loop = true; hp.type = 'highpass'; hp.frequency.value = 1800;
    src.connect(hp).connect(b.gain); src.start();
    this.sizzle = { gain: b.gain, src };
  }
  private setSizzle(n: number) { const s = this.sizzle; if (s) s.gain.gain.setTargetAtTime(Math.min(0.16, 0.035 * n), s.gain.context.currentTime, 0.3); }
  private hiss() {
    const s = this.sizzle; if (!s) return;
    const c = s.gain.context, len = Math.round(c.sampleRate * 0.35), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = 2600; g.gain.value = 0.9;
    src.connect(f).connect(g).connect(s.gain); src.start();
  }
  private stopSizzle() {
    const s = this.sizzle; if (!s) return;
    this.sizzle = null;
    s.gain.gain.setTargetAtTime(0, s.gain.context.currentTime, 0.15);
    setTimeout(() => { try { s.src.stop(); } catch { /* stopped */ } s.gain.disconnect(); }, 800);
  }

  // ------------------------------------------------------------------------------------------------ the camera: across the coals, a little above
  camera(dt: number): boolean {
    if (!this.layer) return false;
    // high over the street side of the grill, looking down across it: the brochettes long and big on a phone held upright,
    // the helper behind them, the plate and the customer at the side table on the right
    const { stand, grill } = this.env;
    const pos = this.w(stand.x + 0.42, grill.top + 2.2, grill.z + 1.1, A).clone(), look = this.w(stand.x + 0.27, grill.top - 0.04, grill.z - 0.42, B).clone();
    this.cam.frame(this.env.ctx.camera, pos, look, dt);
    // chips over the brochettes, the order's bubble over the customer, « Servir » over the plate
    const cam = this.env.ctx.camera, r = this.run;
    if (r && this.layer) for (const st of r.sticks) {
      if (!st.laid || st.served || r.phase === 'serve' || r.phase === 'hand') { st.chip.style.visibility = 'hidden'; continue; }
      const q = cue(st.s), cls = q === 'turn' ? 'turn' : q === 'done' ? 'done' : q === 'burning' ? 'burn' : 'wait';
      if (st.chip.dataset.q !== q) { st.chip.dataset.q = q; st.chip.className = `iw-chip ${cls}`; st.chip.textContent = q === 'turn' ? '↻' : q === 'done' ? '✓' : q === 'burning' ? '🔥' : '·'; }
      this.layer.pin(st.chip, cam, this.w(st.mesh.position.x, st.mesh.position.y + 0.1, st.mesh.position.z + LEN * 0.42, A));
    }
    if (this.els && this.plate) { if (this.els.serve.dataset.on) this.layer.pin(this.els.serve, cam, this.w(this.plate.position.x, this.plate.position.y + 0.22, this.plate.position.z, A)); else this.els.serve.style.visibility = 'hidden'; }
    if (this.els && this.customer && this.els.say.style.visibility !== 'hidden') this.layer.pin(this.els.say, cam, A.copy(this.customer.group.position).setY(this.customer.group.position.y + 2.05));
    return true;
  }

  info() {
    const r = this.run;
    if (!r && !this.layer) return null;
    const cam = this.env.ctx.camera;
    return {
      phase: r?.phase ?? 'linger', t: r ? +r.t.toFixed(2) : null, heat: r?.g.heat ?? null, servable: r ? servable(r.sticks.map(s => s.s)) : false,
      score: r ? +orderScore(r.sticks.map(s => s.s)).toFixed(3) : null, customer: !!this.customer, holding: this.holding, card: this.layer?.cardShown ?? false,
      sticks: r?.sticks.map(st => {
        const p = this.screen(this.w(st.mesh.position.x, st.mesh.position.y, st.mesh.position.z, A).clone(), cam);
        return { laid: st.laid, down: +st.s.down.toFixed(2), up: +st.s.up.toFixed(2), turns: st.s.turns, cue: cue(st.s), served: st.served, x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null };
      }) ?? [],
      serve: r && this.plate ? (() => { const p = this.screen(this.w(this.plate!.position.x, this.plate!.position.y + 0.22, this.plate!.position.z, A).clone(), cam); return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; })() : null,
    };
  }

  dispose() { this.run = null; if (this.layer) this.teardown(); }
}

/** One brochette: the skewer, its ring, three pieces of meat and two of onion, each in two halves (the side on the coals, the side up) with their own vertex colours. */
function skewerGeometry(rand: () => number): { geo: THREE.BufferGeometry; pieces: Piece[] } {
  const parts: THREE.BufferGeometry[] = [], pieces: Piece[] = [];
  let at = 0;
  const add = (g: THREE.BufferGeometry, hex: number, piece?: Omit<Piece, 'from' | 'to'>) => {
    const n = (g = g.index ? g.toNonIndexed() : g).attributes.position.count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g);
    if (piece) pieces.push({ ...piece, from: at, to: at + n });
    at += n;
  };
  add(new THREE.BoxGeometry(0.011, 0.011, LEN), 0xb8bcc0);
  add(new THREE.TorusGeometry(0.024, 0.005, 5, 10).translate(0, 0, -LEN / 2 - 0.02), 0xa8acb0);
  for (let k = 0; k < 5; k++) {
    const meat = k % 2 === 0, w = meat ? 0.072 + rand() * 0.012 : 0.058, h = meat ? 0.066 + rand() * 0.01 : 0.05, d = meat ? 0.07 : 0.042, z = -0.3 + k * 0.15;
    for (const side of [0, 1] as const) {
      const g = new THREE.BoxGeometry(w, h / 2, d).translate(0, (side === 0 ? -1 : 1) * h / 4, z);
      g.rotateZ((rand() - 0.5) * 0.12);
      add(g, meat ? 0xb4464e : 0xefe6cf, { meat, side });
    }
  }
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return { geo, pieces };
}
