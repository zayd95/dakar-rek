import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import type { HubWorld } from '../world/types';
import type { Humanoid, PersonLook } from '../actors/humanoid';
import { hubLayout } from '../world/builder';
import { ambientLife, type AmbientDrive, type AmbientPerson } from '../social/ambientLife';
import { bend, bodyPoint, crouch, footStrike, grip, legTo, pointFoot, reach } from '../actors/gesture';
import { AFTER, BALL_R, Match, PITCH, ballSpeed, type ContactRec, type Kick, type KickKind, type Player } from './footballSim';

/**
 * NPC football on the pitch of the Corniche hub (docs/VISION.md, decision 4), played by the city's own people: the
 * ambient life brings them at the match hours (src/social/ambientData.ts `foot`, `foot-dimanche`), this module makes two
 * teams of them (5 a side at most, a keeper from 3; the others wait by the halfway line) and plays the match of
 * src/game/footballSim.ts with their bodies. Spectators (`regarder-foot`) follow the ball from the touchlines and cheer
 * a goal.
 *
 * - Every touch is a contact planned by the match: at its frame the leg IK (src/actors/gesture.ts `legTo`) puts the
 *   foot's instep on the ball (a keeper's hands, `reach`) — the gap is measured on the bones and kept for the checks.
 *   Before it, the leg swings back and through; after it, it follows through and gives the gait its leg back.
 * - The feet stay planted and the legs keep the pace: the bodies walk and run with the gait of src/actors/gait.ts, from
 *   their own motion (the match limits their acceleration and speed).
 * - Level of detail: the match is played only while the player (or the camera) is within NEAR metres of the pitch; far
 *   away the people run about the pitch as before (the ambient life's own roaming) and this module costs one distance.
 *   Their bodies and far figures stay the ambient life's, under its shared budget (footballers come first).
 * - One ball and the two goals' nets: two draw calls.
 */
const NEAR = 60, NEAR_OUT = 66;
/** Top of the pitch's grass (world y, src/world/builder.ts `pitch`), the footballers' feet on it, the street's. */
const GRASS = 0.16, FEET = 0.155, STREET = 0.1;
const TEAM_MAX = 5;
export const KITS = [
  { name: 'Jaunes', top: 0xf2c12e, bottom: 0x1c1c1f, keeper: 0x1a9d54 },
  { name: 'Rouges', top: 0xc8302a, bottom: 0xf2f2ec, keeper: 0x2a2c33 },
] as const;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** How far the foot travels back and through (0–1), and how the foot is turned: out from the kick, pointed down (rad). */
const AMP: Record<KickKind, number> = { touch: 0.4, trap: 0.3, tackle: 0.55, pass: 0.7, shot: 1, save: 0.35 };
const TOE: Record<KickKind, readonly [number, number]> = { touch: [0.15, 0.8], trap: [0.95, 0.45], tackle: [0.35, 0.65], pass: [1.0, 0.42], shot: [0.05, 1.05], save: [0.8, 0.45] };

interface Entry {
  person: AmbientPerson; id: number;
  /** Its team, or −1 waiting to come on. */
  team: 0 | 1 | -1; keeper: boolean;
  drive: AmbientDrive; overlay: (h: Humanoid, dt: number) => void;
  /** The kick the overlay last posed and where the strike point was when its swing began. */
  k: Kick | null; s0: THREE.Vector3;
}
interface Fan { person: AmbientPerson; drive: AmbientDrive; cheer: number }

const UP = new THREE.Vector3(0, 1, 0);
const N = new THREE.Vector3(), RV = new THREE.Vector3(), BW = new THREE.Vector3(), CW = new THREE.Vector3(), AW = new THREE.Vector3(), FW = new THREE.Vector3();
const PW = new THREE.Vector3(), TW = new THREE.Vector3(), PL = new THREE.Vector3(), PL2 = new THREE.Vector3(), KW = new THREE.Vector3(), SW = new THREE.Vector3();
const TT = new THREE.Vector3(), HW = new THREE.Vector3(), G1 = new THREE.Vector3(), G2 = new THREE.Vector3(), AX = new THREE.Vector3();
const QB = new THREE.Quaternion();

/** A plain ball of the game's own design: white with dark patches. */
function ballMesh(shadows: boolean) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#1d1f24';
    for (const [x, y, r] of [[16, 32, 9], [48, 14, 8], [48, 50, 8], [80, 32, 9], [112, 14, 8], [112, 50, 8], [64, 2, 10], [64, 62, 10], [0, 2, 10], [128, 62, 10]]) {
      g.beginPath();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshLambertMaterial({ map: tex }));
  m.castShadow = shadows; m.name = 'football_ball';
  return m;
}

/** Both goals' nets in one mesh: the back, the sloping roof, the sides (a white mesh texture, cut out). */
function netsMesh(cx: number, cz: number) {
  const pos: number[] = [], uv: number[] = [];
  const S = 0.14;                                                                 // mesh size (m)
  const quad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const P = PITCH, top0 = GRASS + P.bar - 0.1, top1 = GRASS + P.back, y0 = GRASS;
  for (const e of [1, -1]) {
    const x0 = cx + e * P.hx, x1 = cx + e * (P.hx + P.net), zl = cz - P.post, zr = cz + P.post, W = (2 * P.post) / S, D = P.net / S;
    quad([x1, y0, zl], [x1, y0, zr], [x1, top1, zr], [x1, top1, zl], [0, 0], [W, 0], [W, P.back / S], [0, P.back / S]);                      // back
    quad([x0, top0, zl], [x0, top0, zr], [x1, top1, zr], [x1, top1, zl], [0, 0], [W, 0], [W, D], [0, D]);                                     // roof
    for (const z of [zl, zr]) quad([x0, y0, z], [x1, y0, z], [x1, top1, z], [x0, top0, z], [0, 0], [D, 0], [D, P.back / S], [0, (P.bar - 0.1) / S]);   // sides
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  if (g) { g.clearRect(0, 0, 16, 16); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter;
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xf4f4f0, map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  m.name = 'football_nets';
  return m;
}

class Football implements GameModule {
  readonly name = 'football';
  private ctx!: GameCtx;
  private pitch: { x: number; z: number } | null = null;
  private match: Match | null = null;
  private ball: THREE.Mesh | null = null;
  private entries = new Map<AmbientPerson, Entry>();
  private fans = new Map<AmbientPerson, Fan>();
  private ids = new WeakMap<AmbientPerson, number>();
  private teamOf = new WeakMap<AmbientPerson, 0 | 1>();
  private own = new WeakMap<AmbientPerson, PersonLook>();
  private kit = new WeakMap<AmbientPerson, string>();
  private nextId = 1;
  private near = false; private active = false; private started = false;
  private syncT = 0;
  private buf: AmbientPerson[] = [];
  /** Checks: the gap from the foot (hands) to the ball at each measured contact, by kind; contacts without a drawn body. */
  private gaps: { kind: KickKind; gap: number; n: number }[] = [];
  private contactNow: { id: number; kind: KickKind; frame: number } | null = null;
  private goals: { t: number; team: 0 | 1; scorer: number; score: [number, number] }[] = [];

  init(ctx: GameCtx) { this.ctx = ctx; }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.entries.clear(); this.fans.clear(); this.near = false; this.active = false; this.started = false;
    this.gaps = []; this.goals = []; this.contactNow = null;
    const sp = hubLayout(hub.id).specials.find(s => s.kind === 'pitch');
    this.pitch = sp ? { x: sp.x, z: sp.z } : null;
    this.match = null; this.ball = null;
    if (!sp) return;
    this.match = new Match(0x5eed + Math.floor(ctx.day()));
    const g = new THREE.Group(); g.name = 'football';
    this.ball = ballMesh(ctx.quality() !== 'low'); this.ball.visible = false;
    g.add(this.ball, netsMesh(sp.x, sp.z));
    ctx.extra.add(g);
  }

  // ------------------------------------------------------------------ the frame
  update(ctx: GameCtx, dt: number) {
    const pt = this.pitch, m = this.match;
    if (!pt || !m) return;
    const d = Math.min(this.edgeDist(ctx.player.pos.x, ctx.player.pos.z), this.edgeDist(ctx.camera.position.x, ctx.camera.position.z));
    const on = ctx.space() === 'street' && ctx.mode() !== 'scene' && d < (this.near ? NEAR_OUT : NEAR);
    if (!on) { if (this.near) this.release(); return; }
    this.near = true;
    if ((this.syncT -= dt) <= 0) { this.syncT = 0.25; this.sync(); }
    if (!this.active) return;
    m.step(dt);
    this.events();
    this.place(dt);
  }

  /** Distance from (x, z) to the pitch's grass (0 on it). */
  private edgeDist(x: number, z: number) {
    const p = this.pitch!;
    return Math.hypot(Math.max(0, Math.abs(x - p.x) - PITCH.ex), Math.max(0, Math.abs(z - p.z) - PITCH.ez));
  }

  /** Far away (or inside, or a scene): the people are the ambient life's again, the ball rests where it is. */
  private release() {
    const m = this.match!;
    for (const e of this.entries.values()) { if (e.person.drive === e.drive) e.person.drive = null; m.remove(e.id); }
    for (const f of this.fans.values()) if (f.person.drive === f.drive) f.person.drive = null;
    this.entries.clear(); this.fans.clear();
    this.near = false; this.active = false;
  }

  // ------------------------------------------------------------------ the players: from the city's people
  private sync() {
    const m = this.match!, list = ambientLife.people((s, a) => s.tags.includes('pitch') && (a.pose === 'roam' || a.id.startsWith('regarder-foot')), this.buf);
    const playing = new Set<AmbientPerson>(), watching = new Set<AmbientPerson>();
    for (const p of list) if (p.state === 'do') (p.act!.pose === 'roam' ? playing : watching).add(p);
    for (const [p, e] of this.entries) if (!playing.has(p)) { if (p.drive === e.drive) p.drive = null; if (e.team >= 0) m.remove(e.id); this.entries.delete(p); }
    for (const p of playing) if (!this.entries.has(p)) this.join(p);
    for (const [p, f] of this.fans) if (!watching.has(p)) { if (p.drive === f.drive) p.drive = null; this.fans.delete(p); }
    for (const p of watching) if (!this.fans.has(p)) {
      const drive: AmbientDrive = { move: false, hold: null, speed: 0, overlay: null, look: null, every: false, prio: 1 };
      p.drive = drive; this.fans.set(p, { person: p, drive, cheer: 0 });
    }
    this.balance();
    const n0 = this.count(0), n1 = this.count(1), was = this.active;
    this.active = n0 >= 2 && n1 >= 2;
    for (const e of this.entries.values()) e.person.drive = this.active ? e.drive : null;
    if (this.ball) this.ball.visible = this.active;
    if (this.active && !was) {
      if (!this.started) { m.reset(0); this.started = true; }
      // the match picks up where the people are
      for (const e of this.entries.values()) {
        const p = e.team >= 0 ? m.get(e.id) : null;
        if (p) { p.x = e.person.x - this.pitch!.x; p.z = e.person.z - this.pitch!.z; p.vx = p.vz = 0; p.yaw = e.person.yaw; p.kick = null; }
      }
    }
  }

  private count(team: 0 | 1) { let n = 0; for (const e of this.entries.values()) if (e.team === team) n++; return n; }

  private join(person: AmbientPerson) {
    let id = this.ids.get(person);
    if (id === undefined) { id = this.nextId++; this.ids.set(person, id); this.own.set(person, person.look); }
    const drive: AmbientDrive = { move: true, hold: null, speed: 0, overlay: null, look: null, every: false, prio: 0.7 };
    const e: Entry = { person, id, team: -1, keeper: false, drive, overlay: () => {}, k: null, s0: new THREE.Vector3() };
    e.overlay = (h: Humanoid) => this.pose(e, h);
    this.entries.set(person, e);
    const was = this.teamOf.get(person), n0 = this.count(0), n1 = this.count(1);
    const team: 0 | 1 | -1 = was !== undefined && this.count(was) < TEAM_MAX ? was : n0 < TEAM_MAX && n0 <= n1 ? 0 : n1 < TEAM_MAX ? 1 : -1;
    if (team >= 0) this.onTeam(e, team as 0 | 1);
  }

  private onTeam(e: Entry, team: 0 | 1) {
    const m = this.match!, pt = this.pitch!;
    if (e.team >= 0) m.remove(e.id);
    e.team = team; e.keeper = false; this.teamOf.set(e.person, team);
    m.add({ id: e.id, team, x: e.person.x - pt.x, z: e.person.z - pt.z, yaw: e.person.yaw });
    this.dress(e);
  }

  /** Teams of at most 5, never two apart; a keeper in a team of 3 or more (the one nearest his goal). */
  private balance() {
    const m = this.match!;
    for (const e of this.entries.values()) if (e.team < 0) {
      const n0 = this.count(0), n1 = this.count(1);
      if (Math.min(n0, n1) < TEAM_MAX) this.onTeam(e, n0 <= n1 ? 0 : 1);
    }
    for (let guard = 0; guard < 4; guard++) {
      const n0 = this.count(0), n1 = this.count(1);
      if (Math.abs(n0 - n1) < 2) break;
      const from = n0 > n1 ? 0 : 1, mover = [...this.entries.values()].reverse().find(e => e.team === from && !e.keeper);
      if (!mover) break;
      this.onTeam(mover, (1 - from) as 0 | 1);
    }
    for (const team of [0, 1] as const) {
      const mine = [...this.entries.values()].filter(e => e.team === team);
      const keeper = mine.find(e => e.keeper);
      if (mine.length >= 3 && !keeper) {
        const gx = -m.dir(team) * PITCH.hx;
        let best = mine[0], bd = Infinity;
        for (const e of mine) { const p = m.get(e.id); const d = p ? Math.abs(p.x - gx) + Math.abs(p.z) * 0.3 : Infinity; if (d < bd) { bd = d; best = e; } }
        for (const e of mine) e.keeper = e === best;
        m.setKeeper(team, best.id);
        for (const e of mine) this.dress(e);
      } else if (mine.length < 3 && keeper) {
        keeper.keeper = false; m.setKeeper(team, null); this.dress(keeper);
      }
    }
  }

  /** The team's kit on the person's own body (skin, hair, build kept): a plain tee, shorts-coloured trousers. */
  private dress(e: Entry) {
    if (e.team < 0) return;
    const kit = KITS[e.team as 0 | 1], key = `${e.team}${e.keeper ? 'k' : ''}`;
    if (this.kit.get(e.person) === key) return;
    const base = this.own.get(e.person) ?? e.person.look;
    const look: PersonLook = { ...base, style: 'tee', top: e.keeper ? kit.keeper : kit.top, bottom: kit.bottom, pattern: 'uni', hat: null, shoes: 0xf2f2ec, accent: undefined };
    ambientLife.restyle(e.person, look);
    this.kit.set(e.person, key);
  }

  // ------------------------------------------------------------------ bodies, ball, spectators
  private place(dt: number) {
    const m = this.match!, pt = this.pitch!, b = m.ball;
    let wait = 0;
    for (const e of this.entries.values()) {
      const a = e.person, d = e.drive;
      if (e.team < 0) {
        // waiting to come on: by the halfway line, beyond the touchline
        const tx = pt.x - 1.5 + 1.1 * wait++, tz = pt.z - PITCH.hz - 3.4, dx = tx - a.x, dz = tz - a.z, dd = Math.hypot(dx, dz);
        const step = Math.min(dd, 1.3 * dt);
        if (dd > 0.05) { a.x += (dx / dd) * step; a.z += (dz / dd) * step; }
        d.speed = dd > 0.1 ? 1.3 : 0;
        const face = dd > 0.3 ? Math.atan2(dx, dz) : Math.atan2(pt.x + b.x - a.x, pt.z + b.z - a.z);
        a.yaw += clamp(Math.atan2(Math.sin(face - a.yaw), Math.cos(face - a.yaw)), -4 * dt, 4 * dt);
        a.y = this.groundY(a.x - pt.x, a.z - pt.z);
        d.hold = null; d.overlay = null; d.every = false;
        continue;
      }
      const p = m.get(e.id); if (!p) continue;
      a.x = pt.x + p.x; a.z = pt.z + p.z; a.yaw = p.yaw; a.y = this.groundY(p.x, p.z);
      d.speed = Math.hypot(p.vx, p.vz);
      d.hold = p.cheer > 0 ? 'Celebrate' : null;
      d.overlay = p.kick || p.dive ? e.overlay : null;
      d.every = !!d.overlay;
    }
    // the ball, rolling on its way
    const ball = this.ball!;
    ball.position.set(pt.x + b.x, GRASS + b.h, pt.z + b.z);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.01) { AX.set(b.vz, 0, -b.vx).divideScalar(sp); QB.setFromAxisAngle(AX, (sp * dt) / BALL_R); ball.quaternion.premultiply(QB); }
    // spectators follow the ball, cheer a goal
    for (const f of this.fans.values()) {
      f.drive.look = Math.atan2(pt.x + b.x - f.person.x, pt.z + b.z - f.person.z);
      if (f.cheer > 0) f.cheer -= dt;
      f.drive.hold = f.cheer > 0 ? 'Celebrate' : null;
    }
  }

  private groundY(x: number, z: number) { return Math.abs(x) <= PITCH.ex && Math.abs(z) <= PITCH.ez ? FEET : STREET; }

  private events() {
    const m = this.match!, ctx = this.ctx;
    for (const ev of m.events) {
      if (ev.kind === 'contact' && ev.rec) this.contactNow = { id: ev.rec.who, kind: ev.rec.kind, frame: m.frame };
      if (ev.kind === 'goal' && ev.team !== undefined) {
        this.goals.push({ t: m.t, team: ev.team, scorer: ev.who ?? -1, score: [m.score[0], m.score[1]] });
        for (const f of this.fans.values()) if (Math.random() < 0.75) f.cheer = 1.8 + Math.random() * 1.6;
        const p = ctx.player.pos, pt = this.pitch!;
        if (ctx.mode() === 'play' && Math.hypot(p.x - pt.x, p.z - pt.z) < 45) ctx.toast(`But des ${KITS[ev.team].name} ! ${KITS[0].name} ${m.score[0]} – ${m.score[1]} ${KITS[1].name}`);
      }
    }
    m.events.length = 0;
  }

  // ------------------------------------------------------------------ the gestures: the foot to the ball
  private pose(e: Entry, h: Humanoid) {
    const m = this.match; if (!m) return;
    const p = m.get(e.id); if (!p) return;
    const k = p.kick;
    if (k && k.kind === 'save' && k.hands) this.hands(e, h, k, null);
    else if (k) this.leg(e, h, k);
    else if (p.dive) this.hands(e, h, null, p);
  }

  /** A kick, a touch, a trap, a block: the swing back and through, the instep on the ball at the contact, the follow-through. */
  private leg(e: Entry, h: Humanoid, k: Kick) {
    const m = this.match!, pt = this.pitch!, side = k.side > 0 ? 'R' : 'L', sgn = k.side;
    const before = k.hit < 0, now = k.hit === m.frame;
    const u = before ? 1 - k.left / Math.max(1e-3, k.swing) : 1;
    if (before && u <= 0) return;
    const post = before ? 0 : clamp(1 - k.after / AFTER[k.kind], 0, 1), amp = AMP[k.kind];
    const n = N.set(Math.sin(k.yaw), 0, Math.cos(k.yaw)), r = RV.set(-Math.cos(k.yaw), 0, Math.sin(k.yaw));
    const ball = BW.set(pt.x + k.bx, GRASS + k.bh, pt.z + k.bz);
    // the instep's target: the back of the ball (the side the body comes from), a little under its centre
    const C = CW.copy(ball).addScaledVector(n, -(BALL_R + 0.03)); C.y = ball.y - 0.015;
    if (e.k !== k) { e.k = k; footStrike(h, side, e.s0); }
    const soft = k.kind === 'trap' || k.kind === 'save';
    const A = soft ? AW.copy(C).addScaledVector(n, -0.05).addScaledVector(UP, 0.15).addScaledVector(r, sgn * 0.06)
      : AW.copy(C).addScaledVector(n, -0.42 * amp).addScaledVector(UP, 0.08 + 0.26 * amp);
    const F = soft ? FW.copy(C).addScaledVector(n, -0.12).addScaledVector(UP, 0.04)
      : FW.copy(C).addScaledVector(n, 0.45 * amp).addScaledVector(UP, 0.05 + 0.35 * amp);
    const P = PW;
    let w: number;
    if (now) { P.copy(C); w = 1; }
    else if (before) {
      if (u < 0.55) P.lerpVectors(e.s0, A, ease(u / 0.55)); else { const q = (u - 0.55) / 0.45; P.lerpVectors(A, C, q * q); }
      w = smooth(0, 0.3, u);
    } else { P.lerpVectors(C, F, easeOut(Math.min(1, post / 0.6))); w = 1 - smooth(0.45, 1, post); }
    if (w <= 1e-3) return;
    // lower on the standing leg, the trunk over the ball (back a little for a strike)
    crouch(h, (k.kind === 'shot' ? 0.09 : 0.06) * w);
    bend(h, (k.kind === 'shot' ? -0.06 : 0.12) * w);
    const [out, down] = TOE[k.kind];
    const toe = TW.copy(n).multiplyScalar(Math.cos(out)).addScaledVector(r, sgn * Math.sin(out)).multiplyScalar(Math.cos(down)).addScaledVector(UP, -Math.sin(down)).normalize();
    const pole = PL.copy(n).addScaledVector(UP, 0.4).addScaledVector(r, sgn * 0.25);
    const foot = h.bone(`foot.${side}`);
    if (!foot) return;
    // twice: the ankle placed so that the instep, not the ankle, lands on the target
    for (let i = 0; i < 2; i++) {
      foot.getWorldPosition(KW);
      const S = footStrike(h, side, SW);
      legTo(h, side, TT.copy(P).sub(S).add(KW), pole, w);
      pointFoot(h, side, toe, w);
    }
    if (k.kind === 'pass' || k.kind === 'shot') reach(h, sgn > 0 ? 'L' : 'R', bodyPoint(h, 0.18, 1.12, -sgn * 0.55, HW), PL2.set(0, -1, 0).addScaledVector(r, -sgn), 0.45 * w);
    if (now) this.measure(k, footStrike(h, side, SW).distanceTo(ball) - BALL_R);
  }

  /** A keeper's hands to the ball (a save), or short of it (beaten: `dive`). */
  private hands(e: Entry, h: Humanoid, k: Kick | null, p: Player | null) {
    const m = this.match!, pt = this.pitch!;
    let w: number, bx: number, bz: number, by: number, yaw: number;
    const now = !!k && k.hit === m.frame;
    if (k) {
      const before = k.hit < 0, u = before ? 1 - k.left / Math.max(1e-3, k.swing) : 1, post = before ? 0 : clamp(1 - k.after / AFTER.save, 0, 1);
      w = now ? 1 : before ? smooth(0, 0.5, u) : 1 - smooth(0.5, 1, post);
      bx = k.bx; bz = k.bz; by = k.bh; yaw = k.yaw;
    } else {
      const d = p!.dive!, u = 1 - d.t / Math.max(1e-3, d.T);
      w = d.t > 0 ? smooth(0, 0.5, u) : 1 - smooth(-0.6, 0, -d.t) ;
      bx = d.x; bz = d.z; by = d.h; yaw = p!.yaw;
    }
    if (w <= 1e-3) return;
    const ball = BW.set(pt.x + bx, GRASS + by, pt.z + bz);
    const n = N.set(Math.sin(yaw), 0, Math.cos(yaw)), r = RV.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const low = ball.y - h.group.position.y;
    crouch(h, clamp((1.05 - low) * 0.5, 0, 0.38) * w);
    bend(h, clamp((1.25 - low) * 0.55, 0, 0.55) * w);
    reach(h, 'R', HW.copy(ball).addScaledVector(r, 0.1).addScaledVector(n, -0.06), PL.copy(n).multiplyScalar(-0.3).addScaledVector(r, 0.8).addScaledVector(UP, -0.4), w);
    reach(h, 'L', HW.copy(ball).addScaledVector(r, -0.1).addScaledVector(n, -0.06), PL.copy(n).multiplyScalar(-0.3).addScaledVector(r, -0.8).addScaledVector(UP, -0.4), w);
    void e;
    if (now && k) this.measure(k, Math.min(grip(h, 'R', G1).distanceTo(ball), grip(h, 'L', G2).distanceTo(ball)) - BALL_R);
  }

  private measure(k: Kick, gap: number) {
    const m = this.match!;
    this.gaps.push({ kind: k.kind, gap: +gap.toFixed(4), n: k.log });
    if (this.gaps.length > 2000) this.gaps.shift();
    for (let i = m.log.length - 1; i >= 0; i--) if (m.log[i].n === k.log) { m.log[i].foot = +gap.toFixed(4); break; }
  }

  // ------------------------------------------------------------------ checks (window.__dakar, ?debug)
  debug(): Record<string, unknown> {
    return {
      football: () => this.info(),
      footballLog: (n = 30): ContactRec[] => this.match?.log.slice(-n) ?? [],
      /** A new match now: 0–0, the ball on the centre spot, the counts cleared. */
      footballReset: () => { this.match?.reset(0); this.started = true; this.gaps = []; this.goals = []; return !!this.match; },
      /** The world position of a player of the match (by its id), or of the scorer / the last to touch the ball. */
      footballWho: (id?: number) => {
        const m = this.match, pt = this.pitch; if (!m || !pt) return null;
        const p = m.get(id ?? (m.phase === 'goal' && m.scorer >= 0 ? m.scorer : m.last)); if (!p) return null;
        const e = [...this.entries.values()].find(x => x.id === p.id);
        return { id: p.id, team: p.team, keeper: p.keeper, x: pt.x + p.x, z: pt.z + p.z, y: e?.person.y ?? FEET, yaw: p.yaw, clip: e?.person.body?.clipName ?? null, body: !!e?.person.body, kick: p.kick ? { kind: p.kick.kind, left: +p.kick.left.toFixed(3), hit: p.kick.hit } : null, cheer: p.cheer };
      },
    };
  }

  private info() {
    const m = this.match, pt = this.pitch;
    if (!m || !pt) return { pitch: null };
    const b = m.ball, list = [...this.entries.values()];
    const g = this.gaps.map(x => x.gap).sort((a, c) => a - c);
    const q = (f: number) => (g.length ? g[Math.min(g.length - 1, Math.floor(g.length * f))] : null);
    const unmeasured = m.log.filter(r => r.foot === null).length;
    const players = list.filter(e => e.team >= 0).map(e => {
      const p = m.get(e.id)!;
      return { id: e.id, team: e.team, keeper: e.keeper, x: +(pt.x + p.x).toFixed(2), z: +(pt.z + p.z).toFixed(2), speed: +Math.hypot(p.vx, p.vz).toFixed(2), kick: p.kick?.kind ?? null, cheer: p.cheer > 0, body: !!e.person.body, clip: e.person.body?.clipName ?? null };
    });
    return {
      pitch: { x: pt.x, z: pt.z, hx: PITCH.hx, hz: PITCH.hz }, near: this.near, active: this.active,
      phase: m.phase, phaseT: +m.phaseT.toFixed(2), t: +m.t.toFixed(2), frame: m.frame, score: [...m.score], kickTeam: m.kickTeam,
      teams: [this.count(0), this.count(1)], waiting: list.filter(e => e.team < 0).length, fans: this.fans.size,
      fansCheering: [...this.fans.values()].filter(f => f.cheer > 0).length,
      ball: { x: +(pt.x + b.x).toFixed(2), y: +(GRASS + b.h).toFixed(3), z: +(pt.z + b.z).toFixed(2), h: +b.h.toFixed(3), speed: +ballSpeed(b).toFixed(2), net: b.net, visible: !!this.ball?.visible },
      stats: { ...m.stats, ballTravel: +m.stats.ballTravel.toFixed(1) },
      perMinute: m.t > 0 ? { passes: +(m.stats.passes / (m.t / 60)).toFixed(2), completed: +(m.stats.completed / (m.t / 60)).toFixed(2), goals: +(m.stats.goals / (m.t / 60)).toFixed(2), contacts: +(m.stats.contacts / (m.t / 60)).toFixed(2) } : null,
      contacts: { measured: g.length, unmeasured, median: q(0.5), p90: q(0.9), max: g.length ? g[g.length - 1] : null, min: g.length ? g[0] : null,
        byKind: Object.fromEntries(['touch', 'trap', 'tackle', 'pass', 'shot', 'save'].map(k => { const v = this.gaps.filter(x => x.kind === k).map(x => x.gap); return [k, v.length ? { n: v.length, max: Math.max(...v), mean: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(4) } : null]; })) },
      contactNow: this.contactNow && this.contactNow.frame === m.frame ? this.contactNow : null,
      last: m.log.length ? m.log[m.log.length - 1] : null,
      goals: this.goals.slice(-10),
      scorer: m.scorer, celebrating: list.filter(e => e.team >= 0 && (m.get(e.id)?.cheer ?? 0) > 0).length,
      bodies: players.filter(p => p.body).length, players,
    };
  }
}

export const football = new Football();
