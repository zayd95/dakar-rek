import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import type { HubWorld } from '../world/types';
import type { Humanoid, PersonLook } from '../actors/humanoid';
import { hubLayout } from '../world/builder';
import { ambientLife, type AmbientDrive, type AmbientPerson } from '../social/ambientLife';
import { bend, bodyPoint, crouch, footStrike, grip, legTo, pointFoot, reach } from '../actors/gesture';
import { AFTER, BALL_R, HUMAN_KEEP, Match, PITCH, ballSpeed, type Ball, type ContactRec, type Kick, type KickKind, type Player } from './footballSim';
import { HOLD_FULL, KICK_REACH, KickBall, type GoalNote } from './kickabout';
import type { Target } from '../interact/types';
import type { BallRelay } from '../multiplayer/protocol';
import type { MenuItem } from '../ui/sheet';
import { hourStamp, recordVisit } from '../social/memory';
import { Relations, PLAYER } from '../social/relations';
import { ATAYA_LINE, FT, REGULARS, afterLine, joinLine, matchOver, meet, recognise, recordMatch, resultTitle, startMatch, type RegularId, type Result } from '../districts/matchRules';
import './kickabout.css';

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
 * - Level of detail: the match is played only while the player is within NEAR metres of the pitch's grass; far
 *   away the people run about the pitch as before (the ambient life's own roaming) and this module costs one distance.
 *   Their bodies and far figures stay the ambient life's, under its shared budget (footballers come first).
 * - One ball and the two goals' nets: two draw calls.
 * - Kickabout (src/game/kickabout.ts): when no NPC match is played (fewer than two a side), the same ball mesh is the
 *   « Ballon » anyone may dribble, pass (the action button, E: to the nearest other player ahead, else a straight kick) and
 *   shoot (« Frappe » held, F held: the power), shared with the room (last touch owns it). During an NPC match the player
 *   watches: the kickabout waits, and the room's ball states are only kept (the last one) until it is back.
 * - Joining the match (M3 « Join the match », docs/districts/M3-CORNICHE.md): at the touchline during an NPC match, « Rejoindre le match »
 *   puts the player into it (footballSim.ts `human`): the stick runs, the ball at the foot is dribbled, « Passer » / « Tirer » and the held
 *   « Frappe » play it. A short match (first to 3, four minutes at most), then the result, a rematch or not, a word and an ataya with the
 *   regulars (Babou plays on the player's side, Khadim captains the other), who remember the player on a later day (src/districts/matchRules.ts).
 */
const NEAR = 60, NEAR_OUT = 66, TRACK_N = 512;
/** M3: the player's id in the match; how far off the grass they may stray before they have left it (m); the ataya's length (s). */
const HUMAN = 1_000_000, LEAVE_AT = 6, ATAYA_S = 22;
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
  /** Kick-offs taken: the match time and the ball's distance from the centre spot. */
  private kickoffs: { t: number; dist: number }[] = [];
  // ---- the kickabout (src/game/kickabout.ts)
  private kb = new KickBall();
  /** The kickabout is played this frame (near, in the street, no NPC match); the room's last state kept meanwhile. */
  private kbOn = false; private pending: BallRelay | null = null;
  /** The player's last position (pitch space) and smoothed velocity; the shot's hold (s, -1 none); « Frappe » held. */
  private px = 0; private pz = 0; private pvx = 0; private pvz = 0; private hasP = false;
  private hold = -1; private btnHeld = false; private shotBtn: HTMLButtonElement | null = null; private btnState = ''; private btnPct = -1;
  /** Goals scored by this player this session; the celebration's time left; the pass receiver picked (4 Hz). */
  private myGoals = 0; private celebrate = 0; private recv: { id: string; name: string; x: number; z: number } | null = null; private recvT = 0;
  private peerCount = 0;
  private kbTarget: Target | null = null;
  private kbLog: { t: number; what: string; detail?: unknown }[] = [];
  // ---- M3: the player in the match, the regulars
  /** The player's match (null: not playing): their team, the match's number in the save, its time, their goals and touches. */
  private me: { team: 0 | 1; seq: number; t: number; goals: number; touches: number; passes: number; shots: number } | null = null;
  /** The regulars among the footballers now (their faces fixed: the player knows them again), and who each person is. */
  private regs = new Map<RegularId, Entry>();
  private regOf = new WeakMap<AmbientPerson, RegularId>();
  /** A regular off the pitch, at the touchline with the player (the ataya after the match), until (match s). */
  private bench: { e: Entry; until: number; x: number; z: number } | null = null;
  private joinT: Target | null = null; private ballT: Target | null = null; private regT = new Map<RegularId, Target>();
  /** Checks: what was said, the cards shown, the results, the recognitions, the matches joined and left. */
  private m3 = { said: [] as string[], cards: [] as { title: string; rows: string[] }[], results: [] as Result[], recognised: 0, joined: 0, left: 0, finished: 0, asked: { pass: 0, shot: 0 } };
  /** The checks: the simulated ball's last TRACK_N frames (shared time ms, x, z of pitch space), a ring with no allocation. */
  private track = new Float64Array(TRACK_N * 3); private trackI = 0;

  init(ctx: GameCtx) {
    this.ctx = ctx;
    ctx.ballNet.listen(m => this.onBall(m));
    ctx.interactions.add({ name: 'kickabout', collect: (space, x, z, out) => { const t = this.kbFocus(space, x, z); if (t) out.push(t); } });
    ctx.interactions.add({ name: 'football:match', collect: (space, x, z, out) => this.matchFocus(space, x, z, out), exclusive: () => !!this.me });   // in the match the button is the ball's
    this.makeShotButton();
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.entries.clear(); this.fans.clear(); this.near = false; this.active = false; this.started = false;
    this.gaps = []; this.goals = []; this.kickoffs = []; this.contactNow = null;
    const sp = hubLayout(hub.id).specials.find(s => s.kind === 'pitch');
    this.pitch = sp ? { x: sp.x, z: sp.z } : null;
    this.match = null; this.ball = null; this.kbOn = false; this.pending = null; this.kb.place(); this.hasP = false; this.hold = -1; this.showShot(false);
    this.me = null; this.regs.clear(); this.bench = null;
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
    const d = this.edgeDist(ctx.player.pos.x, ctx.player.pos.z);
    const on = ctx.space() === 'street' && ctx.mode() !== 'scene' && d < (this.near ? NEAR_OUT : NEAR);
    if (!on) { if (this.near) this.release(); return; }
    this.near = true;
    if ((this.syncT -= dt) <= 0) { this.syncT = 0.25; this.sync(); }
    if (!this.active) { if (this.me) this.leave('La partie s’arrête : il n’y a plus assez de joueurs.'); this.kickabout(ctx, dt); return; }
    if (this.kbOn) this.kbOff();
    if (this.me) this.humanFrame(ctx, dt);
    m.step(dt);
    this.events();
    if (this.me && matchOver(m.score, this.me.t) && (m.phase !== 'goal' || m.phaseT > 2.6)) this.finish();
    this.place(dt);
  }

  /** Distance from (x, z) to the pitch's grass (0 on it). */
  private edgeDist(x: number, z: number) {
    const p = this.pitch!;
    return Math.hypot(Math.max(0, Math.abs(x - p.x) - PITCH.ex), Math.max(0, Math.abs(z - p.z) - PITCH.ez));
  }

  /** Far away (or inside, or a scene): the people are the ambient life's again, the ball rests where it is. */
  private release() {
    if (this.me) this.leave('Tu as quitté le terrain : la partie n’est pas comptée.');
    this.bench = null; this.regs.clear();
    const m = this.match!;
    for (const e of this.entries.values()) { if (e.person.drive === e.drive) e.person.drive = null; m.remove(e.id); }
    for (const f of this.fans.values()) if (f.person.drive === f.drive) f.person.drive = null;
    this.entries.clear(); this.fans.clear();
    this.near = false; this.active = false;
    if (this.kbOn) this.kbOff();
  }

  // ------------------------------------------------------------------ the players: from the city's people
  private sync() {
    const m = this.match!, list = ambientLife.people((s, a) => s.tags.includes('pitch') && (a.pose === 'roam' || a.id.startsWith('regarder-foot')), this.buf);
    const playing = new Set<AmbientPerson>(), watching = new Set<AmbientPerson>();
    for (const p of list) if (p.state === 'do') (p.act!.pose === 'roam' ? playing : watching).add(p);
    for (const [p, e] of this.entries) if (!playing.has(p)) {
      if (p.drive === e.drive) p.drive = null; if (e.team >= 0) m.remove(e.id); this.entries.delete(p);
      const r = this.regOf.get(p); if (r && this.regs.get(r) === e) this.regs.delete(r);
      if (this.bench?.e === e) this.bench = null;
    }
    for (const p of playing) if (!this.entries.has(p)) this.join(p);
    for (const [p, f] of this.fans) if (!watching.has(p)) { if (p.drive === f.drive) p.drive = null; this.fans.delete(p); }
    for (const p of watching) if (!this.fans.has(p)) {
      const drive: AmbientDrive = { move: false, hold: null, speed: 0, overlay: null, look: null, every: false, prio: 1 };
      p.drive = drive; this.fans.set(p, { person: p, drive, cheer: 0 });
    }
    if (this.bench && this.match && this.match.t > this.bench.until) this.bench = null;   // back on: the next balance puts him on a team
    this.balance();
    const n0 = this.count(0), n1 = this.count(1), was = this.active;
    this.active = n0 >= 2 && n1 >= 2;
    for (const e of this.entries.values()) e.person.drive = this.active ? e.drive : null;
    if (this.ball) this.ball.visible = true;                                   // the match's ball, or the kickabout's
    if (this.active) this.regulars();
    if (this.active && !was) {
      if (!this.started) { m.reset(0); this.started = true; }
      // the match picks up where the people are
      for (const e of this.entries.values()) {
        const p = e.team >= 0 ? m.get(e.id) : null;
        if (p) { p.x = e.person.x - this.pitch!.x; p.z = e.person.z - this.pitch!.z; p.vx = p.vz = 0; p.yaw = e.person.yaw; p.kick = null; }
      }
    }
  }

  /** Players on a team: its footballers, and the player when they play for it (M3). */
  private count(team: 0 | 1) { let n = this.me?.team === team ? 1 : 0; for (const e of this.entries.values()) if (e.team === team) n++; return n; }

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
    for (const e of this.entries.values()) if (e.team < 0 && e !== this.bench?.e) {
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
      if (e === this.bench?.e) {
        // the ataya: at the touchline with the player, talking
        const B = this.bench, dx = B.x - a.x, dz = B.z - a.z, dd = Math.hypot(dx, dz), step = Math.min(dd, 2.4 * dt);
        if (dd > 0.05) { a.x += (dx / dd) * step; a.z += (dz / dd) * step; }
        d.speed = dd > 0.1 ? 2.4 : 0;
        const me = this.ctx.player.pos, face = dd > 0.4 ? Math.atan2(dx, dz) : Math.atan2(me.x - a.x, me.z - a.z);
        a.yaw += clamp(Math.atan2(Math.sin(face - a.yaw), Math.cos(face - a.yaw)), -5 * dt, 5 * dt);
        a.y = STREET; d.hold = dd < 0.3 ? 'Talk' : null; d.overlay = null; d.every = false;
        continue;
      }
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
    this.drawBall(b, 0, 0, 0, dt);
    // spectators follow the ball, cheer a goal
    for (const f of this.fans.values()) {
      f.drive.look = Math.atan2(pt.x + b.x - f.person.x, pt.z + b.z - f.person.z);
      if (f.cheer > 0) f.cheer -= dt;
      f.drive.hold = f.cheer > 0 ? 'Celebrate' : null;
    }
  }

  /** The one ball mesh at a ball of pitch space (plus a drawn offset), rolling on its way. */
  private drawBall(b: Ball, ox: number, oz: number, oh: number, dt: number) {
    const ball = this.ball!, pt = this.pitch!;
    ball.position.set(pt.x + b.x + ox, GRASS + Math.max(BALL_R, b.h + oh), pt.z + b.z + oz);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.01) { AX.set(b.vz, 0, -b.vx).divideScalar(sp); QB.setFromAxisAngle(AX, (sp * dt) / BALL_R); ball.quaternion.premultiply(QB); }
  }

  // ------------------------------------------------------------------ the kickabout: the player's ball, shared with the room
  private kickabout(ctx: GameCtx, dt: number) {
    const pt = this.pitch!, kb = this.kb, self = ctx.ballNet.self(), now = ctx.now();
    if (!this.kbOn) { this.kbOn = true; this.hasP = false; this.kb.at = 0; this.log('on'); }
    if (this.pending) { const m = this.pending; this.pending = null; this.noteGoal(kb.receive(m, self, now)); }
    // the player's motion (pitch space): a jump (a teleport, a door) is no motion
    const x = ctx.player.pos.x - pt.x, z = ctx.player.pos.z - pt.z;
    if (this.hasP && dt > 0) {
      const vx = (x - this.px) / dt, vz = (z - this.pz) / dt, k = Math.min(1, dt * 12);
      if (Math.hypot(vx, vz) > 12) { this.pvx = this.pvz = 0; } else { this.pvx += (vx - this.pvx) * k; this.pvz += (vz - this.pvz) * k; }
    }
    this.px = x; this.pz = z; this.hasP = true;
    const playing = ctx.mode() === 'play' && !ctx.player.seated();
    if (playing) kb.dribble(x, z, this.pvx, this.pvz, dt, self, now);
    // the shot: « Frappe » or F held near the ball, struck on release with the power of the hold
    const held = playing && (this.btnHeld || ctx.input.keys.has('KeyF'));
    if (held && this.hold < 0 && kb.inReach(x, z)) this.hold = 0;
    if (this.hold >= 0) {
      if (held) this.hold += dt;
      else { this.strike('shot', Math.min(1, this.hold / HOLD_FULL)); this.hold = -1; }
    }
    // the ball keeps the shared clock's pace even when frames are slow (the frame's dt is capped at 0.1 s): the room's
    // screens then agree on where it rolls; stepped frames (the checks) are never slower than their dt
    // (a state received since the last frame is already where it is now: only the time since then)
    const real = kb.at > 0 ? Math.min(0.5, Math.max(0, (now - kb.at) / 1000)) : dt;
    const bdt = kb.fresh ? real : Math.max(dt, real);
    kb.fresh = false; kb.at = now;
    this.noteGoal(kb.step(bdt, self, now));
    // the room: the owner sends; someone new hears it at once
    if ((this.recvT -= dt) <= 0) {
      this.recvT = 0.25; this.recv = this.receiver();
      const n = this.countPeers(); if (n > this.peerCount) kb.hurry(); this.peerCount = n;
    }
    const w = kb.outgoing(self, now);
    if (w) kb.sent(now, ctx.ballNet.send(w));
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      const body = ctx.player.body();
      if (this.celebrate <= 0 || Math.hypot(this.pvx, this.pvz) > 0.8) { if (body?.hold === 'Celebrate') body.hold = null; this.celebrate = 0; }
    }
    this.showShot(playing && !kb.ball.net && Math.hypot(kb.ball.x - x, kb.ball.z - z) < KICK_REACH + 1.2);
    this.drawBall(kb.ball, kb.ox, kb.oz, kb.oh, dt);
    const i = (this.trackI++ % TRACK_N) * 3; this.track[i] = now; this.track[i + 1] = kb.ball.x; this.track[i + 2] = kb.ball.z;
  }

  private countPeers() { let n = 0; for (const p of this.ctx.peers()) if (p.space === 'street') n++; return n; }
  private log(what: string, detail?: unknown) { this.kbLog.push({ t: Math.round(this.ctx.now()), what, ...(detail !== undefined ? { detail } : {}) }); if (this.kbLog.length > 200) this.kbLog.shift(); }

  /** The NPC match takes the pitch again (or the player left): the kickabout waits where its ball is. */
  private kbOff() {
    this.kbOn = false; this.hold = -1; this.showShot(false);
    const body = this.ctx.player.body();
    if (this.celebrate > 0 && body?.hold === 'Celebrate') body.hold = null;
    this.celebrate = 0;
    this.log('off');
  }

  private onBall(m: BallRelay) {
    if (this.kbOn) this.noteGoal(this.kb.receive(m, this.ctx.ballNet.self(), this.ctx.now()));
    else this.pending = m;                                                           // far, or a match on: the last one is kept
  }

  private noteGoal(g: GoalNote | null) {
    if (!g) return;
    const ctx = this.ctx;
    if (g.mine) {
      this.myGoals++;
      ctx.toast(`⚽ But !  ${this.myGoals === 1 ? 'Ton premier but' : `${this.myGoals} buts`} cette session`);
      const body = ctx.player.body();
      if (body && !ctx.player.seated()) { body.hold = 'Celebrate'; this.celebrate = 2.4; }
    } else {
      const who = ctx.peers().find(p => p.id === g.by)?.name ?? 'Un joueur';
      ctx.toast(`⚽ But de ${who} !`);
    }
    this.log('goal', { end: g.end, by: g.by, mine: g.mine });
  }

  /** The other player in front of the ball to pass to (pitch space, a little ahead of their run), or null. */
  private receiver() {
    const pt = this.pitch!, b = this.kb.ball, f = this.ctx.player.facing(), fx = Math.sin(f), fz = Math.cos(f);
    let best: { id: string; name: string; x: number; z: number } | null = null, score = Infinity;
    for (const p of this.ctx.peers()) {
      if (p.space !== 'street') continue;
      const x = p.x - pt.x + Math.sin(p.yaw) * p.speed * 0.5, z = p.z - pt.z + Math.cos(p.yaw) * p.speed * 0.5;
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
      if (d < 1.5 || d > 35 || Math.abs(x) > PITCH.ex || Math.abs(z) > PITCH.ez) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < 0.35) continue;                                                    // within about 70° of the facing
      const sc = d * (2 - cos);
      if (sc < score) { score = sc; best = { id: p.id, name: p.name, x, z }; }
    }
    return best;
  }

  /** A pass (to the receiver, else straight) or a shot by the player now. */
  private strike(kind: 'pass' | 'shot', power: number) {
    const ctx = this.ctx, kb = this.kb, pt = this.pitch;
    if (!this.kbOn || !pt) return false;
    const x = ctx.player.pos.x - pt.x, z = ctx.player.pos.z - pt.z;
    const to = kind === 'pass' ? this.receiver() : null;
    const ok = kb.kick(x, z, ctx.player.facing(), kind, power, to, ctx.ballNet.self(), ctx.now());
    if (ok) this.log(kind, { power: +power.toFixed(2), to: to?.id ?? null });
    return ok;
  }

  /** The ball as a target of the action button: « Passer » (a receiver ahead) or « Tirer »; « Frapper fort » in « ⋯ ». */
  private kbFocus(space: string, x: number, z: number): Target | null {
    if (!this.kbOn || space !== 'street' || !this.pitch) return null;
    const pt = this.pitch, kb = this.kb;
    if (!kb.inReach(x - pt.x, z - pt.z)) return null;
    const t = this.kbTarget ?? (this.kbTarget = {
      id: 'kickabout:ball', name: 'Ballon', kind: 'spot', space: 'street', x: 0, z: 0, y: 0.6, radius: KICK_REACH + 0.2, bias: -1,
      affordances: () => {
        const r = this.recv;
        return [
          r ? { id: 'pass', verb: 'use' as const, label: 'Passer', icon: '⚽', detail: `À ${r.name}`, run: () => { this.strike('pass', 0); } }
            : { id: 'pass', verb: 'use' as const, label: 'Tirer', icon: '⚽', detail: 'Droit devant', run: () => { this.strike('pass', 0); } },
          { id: 'shot', verb: 'use' as const, label: 'Frapper fort', icon: '🥅', detail: 'Maintiens « Frappe » ou F pour doser', run: () => { this.strike('shot', 0.7); } },
        ];
      },
    });
    t.x = pt.x + kb.ball.x; t.z = pt.z + kb.ball.z;
    return t;
  }

  /** « Frappe »: a round button above the action button, held to charge the shot (additive: its own class). */
  private makeShotButton() {
    if (typeof document === 'undefined') return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'kick-shot'; b.id = 'kickShot';
    b.innerHTML = '<i class="ks-fill" aria-hidden="true"></i><span class="ks-ic" aria-hidden="true">🥅</span><b>Frappe</b><kbd aria-hidden="true">F</kbd>';
    if (typeof b.style?.setProperty !== 'function' || typeof b.addEventListener !== 'function') return;   // a host without a real DOM (node tests)
    b.setAttribute('aria-label', 'Frappe : maintenir pour doser le tir');
    b.addEventListener('pointerdown', e => { e.preventDefault(); this.btnHeld = true; try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
    const up = () => { this.btnHeld = false; b.blur(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    this.shotBtn = b;
  }
  private showShot(on: boolean) {
    const b = this.shotBtn; if (!b) return;
    if (on && !b.isConnected) { const bar = document.getElementById('actbar'); if (!bar) return; bar.insertBefore(b, bar.firstChild); }
    const st = on ? (this.hold >= 0 ? 'on charge' : 'on') : '';
    if (st !== this.btnState) { this.btnState = st; b.className = `kick-shot ${st}`.trim(); if (!on) this.btnHeld = false; }
    const pct = this.hold >= 0 ? Math.round(Math.min(1, this.hold / HOLD_FULL) * 20) * 5 : 0;
    if (pct !== this.btnPct) { this.btnPct = pct; b.style.setProperty('--p', `${pct}%`); }
  }

  private groundY(x: number, z: number) { return Math.abs(x) <= PITCH.ex && Math.abs(z) <= PITCH.ez ? FEET : STREET; }

  private events() {
    const m = this.match!, ctx = this.ctx;
    for (const ev of m.events) {
      if (ev.kind === 'contact' && ev.rec) {
        this.contactNow = { id: ev.rec.who, kind: ev.rec.kind, frame: m.frame };
        if (this.me && ev.rec.who === HUMAN) { this.me.touches++; if (ev.rec.kind === 'pass') this.me.passes++; if (ev.rec.kind === 'shot') this.me.shots++; }
      }
      if (ev.kind === 'kickoff') this.kickoffs.push({ t: +m.t.toFixed(2), dist: +(ev.detail ?? 0) });
      if (ev.kind === 'goal' && ev.team !== undefined) {
        this.goals.push({ t: m.t, team: ev.team, scorer: ev.who ?? -1, score: [m.score[0], m.score[1]] });
        for (const f of this.fans.values()) f.cheer = 5 + Math.random() * 1.5;            // the touchline is up for a few seconds
        const p = ctx.player.pos, pt = this.pitch!;
        if (this.me && ev.who === HUMAN && ev.detail !== 'own') {
          this.me.goals++;
          ctx.toast(`⚽ But ! ${this.me.goals > 1 ? `Ton ${this.me.goals}e but` : 'Ton premier but'} · ${KITS[0].name} ${m.score[0]} – ${m.score[1]} ${KITS[1].name}`);
          const body = ctx.player.body();
          if (body && !ctx.player.seated()) { body.hold = 'Celebrate'; this.celebrate = 2.4; }
        } else if (ctx.mode() === 'play' && Math.hypot(p.x - pt.x, p.z - pt.z) < 45) ctx.toast(`But des ${KITS[ev.team].name} ! ${KITS[0].name} ${m.score[0]} – ${m.score[1]} ${KITS[1].name}`);
      }
    }
    m.events.length = 0;
  }

  // ------------------------------------------------------------------ M3: the player in the match
  /** The regulars among the footballers: Babou on the team the player would join, Khadim on the other; their own faces, the kit over them. */
  private regulars() {
    const mine: 0 | 1 = this.me?.team ?? (this.count(0) <= this.count(1) ? 0 : 1);
    for (const [id, want] of [['babou', mine], ['khadim', (1 - mine) as 0 | 1]] as const) {
      const cur = this.regs.get(id);
      if (cur && this.entries.has(cur.person) && (cur.team === want || cur === this.bench?.e)) continue;
      if (cur) this.regs.delete(id);
      const e = [...this.entries.values()].find(x => x.team === want && !x.keeper && !this.regOf.get(x.person));
      if (!e) continue;
      this.regs.set(id, e); this.regOf.set(e.person, id);
      this.own.set(e.person, { ...REGULARS[id].look }); this.kit.delete(e.person); this.dress(e);
    }
    // a later day: Babou knows the player again (once a day, near the pitch)
    const ctx = this.ctx, o = this.regs.get('babou');
    if (o && !this.me && this.edgeDist(ctx.player.pos.x, ctx.player.pos.z) < 14) {
      const line = recognise(ctx.state, REGULARS.babou, ctx.day());
      if (line) { this.m3.recognised++; this.speak('babou', line); this.visit('babou', 1); ctx.save(); }
    }
  }
  private speak(id: RegularId, line: string) { const R = REGULARS[id]; this.ctx.toast(`${R.name} · ${R.role} : ${line}`); this.m3.said.push(`${R.name}: ${line}`); }
  private visit(id: RegularId, rel: number) { const ctx = this.ctx; recordVisit(ctx.state, `foot_${id}`, hourStamp(ctx.day(), ctx.hour())); if (rel) new Relations(ctx.state.data).change(PLAYER, `foot_${id}`, rel); }

  /** The action button at the pitch: « Rejoindre le match » at the touchline; the ball at the foot in a match; a regular at the ataya. */
  private matchFocus(space: string, x: number, z: number, out: Target[]) {
    const pt = this.pitch, m = this.match, ctx = this.ctx;
    if (!pt || !m || space !== 'street' || ctx.player.seated() || !this.near) return;
    if (this.me) {
      if (!m.humanInReach(HUMAN, 0.9) && !m.humanHas(HUMAN)) return;
      const t = this.ballT ?? (this.ballT = {
        id: 'football:ball', name: 'Ballon', kind: 'spot', space: 'street', x: 0, z: 0, y: 0.6, radius: HUMAN_KEEP + 0.5, bias: -1,
        affordances: () => {
          const p = this.match?.get(HUMAN), q = p ? this.match!.humanReceiver(p) : null;
          const name = q ? ([...this.regs].find(([, e]) => e.id === q.id)?.[0] ?? null) : null;
          return [
            { id: 'pass', verb: 'use' as const, label: 'Passer', icon: '⚽', detail: q ? `À ${name ? REGULARS[name].name : 'ton coéquipier'}` : 'Droit devant', run: () => { if (this.match?.humanAsk(HUMAN, 'pass')) this.m3.asked.pass++; } },
            { id: 'shot', verb: 'use' as const, label: 'Tirer', icon: '🥅', detail: 'Maintiens « Frappe » pour doser', run: () => { if (this.match?.humanAsk(HUMAN, 'shot', 0.6)) this.m3.asked.shot++; } },
          ];
        },
      });
      t.x = pt.x + m.ball.x; t.z = pt.z + m.ball.z;
      out.push(t);
      return;
    }
    if (this.bench) {
      const id = this.regOf.get(this.bench.e.person), a = this.bench.e.person;
      if (id && Math.hypot(a.x - x, a.z - z) < 4) {
        const t = this.regT.get(id) ?? { id: `football:${id}`, name: REGULARS[id].name, kind: 'person', space: 'street', x: 0, y: 1.9, z: 0, radius: 2.5, bias: 0.3,
          affordances: () => [{ id: 'ataya', verb: 'talk' as const, label: `L’ataya avec ${REGULARS[id].name}`, icon: '🍵', run: () => this.ataya(id) }] } as Target;
        this.regT.set(id, t); t.x = a.x; t.z = a.z; out.push(t);
      }
    }
    if (this.active && !this.bench && this.edgeDist(x, z) < 4) {                                // (the ataya first: no « Rejoindre » meanwhile)
      const t = this.joinT ?? (this.joinT = { id: 'football:join', name: 'Partie de foot', kind: 'spot', space: 'street', x: 0, y: 1, z: 0, radius: 6, bias: 0.2,
        affordances: () => [{ id: 'join', verb: 'use' as const, label: 'Rejoindre le match', icon: '⚽', detail: 'Premier à 3 buts', run: () => this.offer() }] });
      t.x = x; t.z = z; out.push(t);
    }
  }

  /** The offer: who the player plays with, the short match's rules; « Jouer » or not. */
  private offer() {
    const ctx = this.ctx, team: 0 | 1 = this.count(0) <= this.count(1) ? 0 : 1;
    const o = this.regs.get('babou'), met = (ctx.state.data.counters[FT.met('babou')] ?? 0) > 0;
    if (o) this.speak('babou', joinLine(REGULARS.babou, met));
    const items: MenuItem[] = [
      { icon: '⚽', label: 'Jouer', detail: `Avec les ${KITS[team].name}${o ? ', Babou' : ''} · premier à 3 buts, 4 minutes au plus`, onPick: () => { this.done(); this.startMatch(team); } },
      { icon: '👀', label: 'Pas maintenant', detail: 'Regarder depuis le bord du terrain', onPick: () => this.done() },
    ];
    ctx.menu('Partie de foot · Corniche', 'Les habitués jouent tous les soirs. Il manque quelqu’un.', items);
  }
  private done() { this.ctx.hud.closeModal(); this.ctx.setMode('play'); }

  /** Into the match: the player on a team, 0–0, the others kick off; the regulars met. */
  private startMatch(team: 0 | 1) {
    const ctx = this.ctx, m = this.match!, pt = this.pitch!;
    if (!this.active || this.me) return;
    // a full side: one of its footballers (never a regular, never the keeper) waits at the touchline while the player plays in his place
    if (this.count(team) >= TEAM_MAX) {
      const sub = [...this.entries.values()].reverse().find(e => e.team === team && !e.keeper && !this.regOf.get(e.person));
      if (sub) { m.remove(sub.id); sub.team = -1; }
    }
    m.add({ id: HUMAN, team, human: true, x: ctx.player.pos.x - pt.x, z: ctx.player.pos.z - pt.z, yaw: ctx.player.facing() });
    this.me = { team, seq: startMatch(ctx.state), t: 0, goals: 0, touches: 0, passes: 0, shots: 0 };
    this.bench = null; this.m3.joined++;
    m.reset((1 - team) as 0 | 1);
    this.regulars();
    for (const id of this.regs.keys()) { meet(ctx.state, id, ctx.day()); this.visit(id, 0); }
    const l = this.regs.get('khadim'); if (l) this.speak('khadim', joinLine(REGULARS.khadim, (ctx.state.data.counters[FT.matches] ?? 0) > 0));
    ctx.toast(`Tu joues avec les ${KITS[team].name} · premier à 3 buts`);
    ctx.save();
  }

  /** The player's body into the match, the held « Frappe » (struck on release). */
  private humanFrame(ctx: GameCtx, dt: number) {
    const m = this.match!, pt = this.pitch!, me = this.me!;
    const x = ctx.player.pos.x - pt.x, z = ctx.player.pos.z - pt.z;
    // Leaving is the player's doing: off the grass, or sitting / in a vehicle (a hub change: release()). A sheet or a scene up (the phone) only
    // leaves them standing while play goes on.
    if (ctx.player.seated() || this.edgeDist(ctx.player.pos.x, ctx.player.pos.z) > LEAVE_AT) {
      this.leave('Tu as quitté le terrain : la partie n’est pas comptée.'); return;
    }
    if (this.hasP && dt > 0) {
      const vx = (x - this.px) / dt, vz = (z - this.pz) / dt, k = Math.min(1, dt * 12);
      if (Math.hypot(vx, vz) > 12) { this.pvx = this.pvz = 0; } else { this.pvx += (vx - this.pvx) * k; this.pvz += (vz - this.pvz) * k; }
    }
    this.px = x; this.pz = z; this.hasP = true;
    m.setHuman(HUMAN, x, z, this.pvx, this.pvz, ctx.player.facing());
    const held = this.btnHeld || ctx.input.keys.has('KeyF'), close = m.humanInReach(HUMAN, 1.4) || m.humanHas(HUMAN);
    if (held && this.hold < 0 && close) this.hold = 0;
    if (this.hold >= 0) {
      if (held) this.hold += dt;
      else { if (m.humanAsk(HUMAN, 'shot', Math.min(1, this.hold / HOLD_FULL))) this.m3.asked.shot++; this.hold = -1; }
    }
    this.showShot(close || this.hold >= 0);
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      const body = ctx.player.body();
      if (this.celebrate <= 0 || Math.hypot(this.pvx, this.pvz) > 0.8) { if (body?.hold === 'Celebrate') body.hold = null; this.celebrate = 0; }
    }
    me.t += dt;
  }

  /** The player leaves before the end: nothing recorded, the NPCs play on. */
  private leave(why: string) {
    const m = this.match;
    if (m) m.remove(HUMAN);
    this.me = null; this.hold = -1; this.showShot(false); this.m3.left++;
    this.ctx.toast(why);
  }

  /** The end: the result recorded once, the card, the regulars' words; rematch, the ataya, or off. */
  private finish() {
    const ctx = this.ctx, m = this.match!, me = this.me!, score: [number, number] = [m.score[0], m.score[1]];
    m.remove(HUMAN); this.me = null; this.hold = -1; this.showShot(false); this.m3.finished++;
    const res = recordMatch(ctx.state, { seq: me.seq, team: me.team, score, myGoals: me.goals, day: ctx.day() }) ?? 'draw';
    this.m3.results.push(res);
    for (const id of this.regs.keys()) this.visit(id, id === 'babou' ? 1 : res === 'win' ? 1 : 0);
    ctx.save();
    const c = ctx.state.data.counters, other = (1 - me.team) as 0 | 1;
    const card = {
      icon: res === 'win' ? '🏆' : res === 'draw' ? '🤝' : '⚽', title: resultTitle(me.team, score), sub: `Partie de foot · Corniche · tu jouais avec les ${KITS[me.team].name}`,
      rows: [
        { k: 'Score', v: `${KITS[me.team].name} ${score[me.team]} – ${score[other]} ${KITS[other].name}`, tone: res === 'win' ? 'up' : res === 'loss' ? 'down' : undefined },
        { k: 'Tes buts', v: `${me.goals}` },
        { k: 'Tes passes', v: `${me.passes}` },
        { k: 'Tes tirs', v: `${me.shots}` },
        { k: 'Tes matchs', v: `${c[FT.matches] ?? 0} joué${(c[FT.matches] ?? 0) > 1 ? 's' : ''} · ${c[FT.wins] ?? 0} gagné${(c[FT.wins] ?? 0) > 1 ? 's' : ''}` },
      ],
      next: ['Rejouer, ou souffler au bord du terrain avec les habitués.'],
    };
    ctx.hud.boutCard(card);
    this.m3.cards.push({ title: card.title, rows: card.rows.map(r => `${r.k}: ${r.v}`) });
    for (const id of ['babou', 'khadim'] as const) if (this.regs.has(id)) this.speak(id, afterLine(REGULARS[id], res, me.goals));
    const team = me.team;
    ctx.menu(resultTitle(team, score), 'La partie est finie. Les habitués restent sur le terrain.', [
      { icon: '🔁', label: 'Rejouer', detail: 'Une autre partie, tout de suite', onPick: () => { this.done(); this.startMatch(this.count(0) <= this.count(1) ? 0 : 1); } },
      ...(this.regs.has('babou') ? [{ icon: '🍵', label: 'L’ataya avec Babou', detail: 'Au bord du terrain', onPick: () => { this.done(); this.toBench('babou'); } }] : []),
      { icon: '👋', label: 'Partir', detail: 'Les autres jouent encore', onPick: () => this.done() },
    ]);
  }

  /** A regular comes off to the touchline next to the player (the ataya); he goes back on after ATAYA_S s. */
  private toBench(id: RegularId) {
    const e = this.regs.get(id), m = this.match!, pt = this.pitch!, p = this.ctx.player.pos;
    if (!e) return;
    if (e.team >= 0) m.remove(e.id);
    e.team = -1;
    // a spot off the grass on the street's side of the pitch (the touchline open to the Corniche's street), level with the player
    const x = clamp(p.x, pt.x - PITCH.hx + 2, pt.x + PITCH.hx - 2), z = pt.z - (PITCH.ez + 1.6);
    this.bench = { e, until: m.t + ATAYA_S, x, z };
    this.ctx.toast(`${REGULARS[id].name} t’attend au bord du terrain, côté rue, avec l’ataya.`);
  }
  /** The ataya itself: two lines, a glass, the regular remembers it. */
  private ataya(id: RegularId) {
    const ctx = this.ctx;
    ctx.toast(ATAYA_LINE); this.m3.said.push(ATAYA_LINE);
    ctx.state.data.counters[FT.ataya] = (ctx.state.data.counters[FT.ataya] ?? 0) + 1;
    this.visit(id, 1); ctx.save();
    if (this.bench) this.bench.until = Math.min(this.bench.until, this.match!.t + 6);
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
      /** M3: the player's match (null: not playing), the regulars (who, their team), what was said, the cards, the results. */
      match3: () => {
        const m = this.match, pt = this.pitch; if (!m || !pt) return null;
        const me = this.me, p = m.get(HUMAN);
        return { me: me ? { ...me, t: +me.t.toFixed(1), x: p ? +(pt.x + p.x).toFixed(2) : null, z: p ? +(pt.z + p.z).toFixed(2) : null, inReach: m.humanInReach(HUMAN, 0.9) } : null,
          score: [...m.score], phase: m.phase, active: this.active, teams: [this.count(0), this.count(1)],
          regulars: Object.fromEntries([...this.regs].map(([id, e]) => [id, { team: e.team, x: +e.person.x.toFixed(2), z: +e.person.z.toFixed(2), bench: e === this.bench?.e }])),
          bench: !!this.bench, benchAt: this.bench ? { x: +this.bench.x.toFixed(2), z: +this.bench.z.toFixed(2) } : null, said: [...this.m3.said], cards: this.m3.cards.map(c => ({ ...c })), results: [...this.m3.results], recognised: this.m3.recognised,
          joined: this.m3.joined, left: this.m3.left, finished: this.m3.finished, asked: { ...this.m3.asked },
          counters: Object.fromEntries(Object.entries(this.ctx.state.data.counters).filter(([k]) => k.startsWith('ft_'))),
          ball: { x: +(pt.x + m.ball.x).toFixed(2), z: +(pt.z + m.ball.z).toFixed(2), h: +m.ball.h.toFixed(2), speed: +ballSpeed(m.ball).toFixed(2) },
          mine: m.log.filter(c => c.who === HUMAN).slice(-12).map(c => ({ kind: c.kind, t: c.t, to: c.to })) };
      },
      /** The kickabout: on, the ball (world and pitch space), who owns it, the receiver ahead, this session's goals, counts. */
      kickabout: () => {
        const pt = this.pitch, kb = this.kb, b = kb.ball; if (!pt) return null;
        return { on: this.kbOn, matchActive: this.active, near: this.near, self: this.ctx.ballNet.self(), owner: kb.owner, touch: kb.touch,
          ball: { x: +(pt.x + b.x).toFixed(3), z: +(pt.z + b.z).toFixed(3), h: +b.h.toFixed(3), px: +b.x.toFixed(3), pz: +b.z.toFixed(3), speed: +ballSpeed(b).toFixed(2), net: b.net },
          drawn: this.ball ? { x: +this.ball.position.x.toFixed(3), z: +this.ball.position.z.toFixed(3), visible: this.ball.visible } : null,
          pitch: { x: pt.x, z: pt.z }, receiver: this.recv, myGoals: this.myGoals, hold: +this.hold.toFixed(2), celebrating: this.celebrate > 0,
          shotButton: this.btnState, stats: { ...kb.stats }, log: this.kbLog.slice(-20) };
      },
      /** The simulated kickabout ball's recent frames, oldest first: [shared time ms, x, z] (pitch space). */
      kickaboutTrack: () => { const n = Math.min(this.trackI, TRACK_N), o: number[][] = []; for (let k = this.trackI - n; k < this.trackI; k++) { const i = (k % TRACK_N) * 3; o.push([this.track[i], +this.track[i + 1].toFixed(3), +this.track[i + 2].toFixed(3)]); } return o; },
      /** The kickabout ball put at (x, z) of pitch space, at rest and nobody's. */
      kickaboutPlace: (x = 0, z = 0) => { this.kb.place(x, z); return true; },
      /** A pass or a shot by the player now, as the buttons do (false when the ball is out of reach). */
      kickaboutStrike: (kind: 'pass' | 'shot' = 'pass', power = 0.6) => this.strike(kind, power),
      footballLog: (n = 30): ContactRec[] => this.match?.log.slice(-n) ?? [],
      /** A new match now: 0–0, the ball on the centre spot, the counts cleared. */
      footballReset: () => { this.match?.reset(0); this.started = true; this.gaps = []; this.goals = []; this.kickoffs = []; return !!this.match; },
      /** Cheap, every frame: the match's frame and phase, a contact made this frame (and whether its body is drawn), the scorer celebrating. */
      footballNow: () => {
        const m = this.match; if (!m) return null;
        const c = this.contactNow && this.contactNow.frame === m.frame ? this.contactNow : null;
        const body = c ? !![...this.entries.values()].find(x => x.id === c.id)?.person.body : false;
        const s = m.phase === 'goal' ? m.get(m.scorer) : null;
        return { frame: m.frame, t: m.t, phase: m.phase, phaseT: m.phaseT, active: this.active, goals: m.stats.goals, contact: c, body, scorerCheer: !!s && s.cheer > 0 };
      },
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
      goals: this.goals.slice(-10), kickoffs: this.kickoffs.slice(-10),
      scorer: m.scorer, celebrating: list.filter(e => e.team >= 0 && (m.get(e.id)?.cheer ?? 0) > 0).length,
      bodies: players.filter(p => p.body).length, players,
      /** The drawn footballers' feet (src/actors/gait.ts): steps taken and metres a planted foot slid since their bodies were made. */
      feet: list.reduce((o, e) => { const g = e.person.body?.gaitInfo(); if (g) { o.bodies++; o.steps += g.steps; o.slipped += g.feet.reduce((t, f) => t + f.slipped, 0); } return o; }, { bodies: 0, steps: 0, slipped: 0 }),
    };
  }
}

export const football = new Football();
