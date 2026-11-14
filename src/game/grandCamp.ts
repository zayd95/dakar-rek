import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import type { HubWorld } from '../world/types';
import { hubLayout } from '../world/builder';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { avatarLook, peerLook } from '../multiplayer/avatars';
import { BALL_R, PITCH, SWING, AFTER } from './footballSim';
import { HOLD_FULL } from './kickabout';
import { ballMesh, football, poseKick, PITCH_FEET, PITCH_GRASS } from './football';
import { campHooks, campSession } from '../online/campSession';
import { onlineHooks } from '../online/api';
import { PITCH_ID } from '../online/meetups';
import type { CampView } from '../online/campClient';
import type { CampAction, CampEvent, CampLobbyView } from '../multiplayer/campProtocol';
import { CAMP_HUB, CAMP_PLACE, TEAM_COLORS, clockText, momentOf, resultView, scoreText } from '../ui/phone/apps/campText';
import { phoneHooks } from '../ui/phoneHooks';
import './grandCamp.css';

/**
 * 1.0.1 Grand Camp in the street (docs/release/GRAND-CAMP-RULES-1.0.1.md): the players' match drawn and played on the Corniche's pitch from the server's
 * snapshots (src/online/campClient.ts `view`), the device's side of it being src/online/campSession.ts.
 *
 * - The pitch: the existing football pitch. While a match of mine is played there the NPCs' match and the kickabout step aside (src/game/football.ts
 *   `book`: the footballers wait at the touchline, the spectators follow this ball). « Prêt » needs the player at the pitch (campHooks.atPitch: no free
 *   teleport — « Aller au terrain » puts the marker on it); a ready player who walks away is made « Pas prêt » (the fee given back) rather than taken.
 * - My body: the server's, predicted from my unanswered sticks (`pilot`, the GameModule hook main.ts asks before the walk): the stick goes to the server
 *   every frame (`camp.input`, sent at CAMP_INPUT_HZ), the drawn body glides from one prediction to the next. The street's presence publishes where it is,
 *   so a spectator sees the players on the pitch.
 * - The other players: their own look (the lobby carries it, as presence does: avatars.ts peerLook) in their team's shirt (Rouge / Jaune), interpolated
 *   ~100 ms behind the server; a pass or a shot of theirs swings the leg onto the ball with the NPCs' own leg IK (football.ts `poseKick`), timed on the
 *   event's clock. Their bodies hang under the hub group with a high priority (`lodPrio`), so the street's shared humanoid budget (src/social/ambientLife.ts,
 *   BODY_CALL_BUDGET over BODY_CALLS: 10 / 16 / 26 full bodies) covers them, the nearest first: on Low a 7 v 7 draws the farthest players as the
 *   cheap instanced figure in their shirt's colour. Their presence avatars are not drawn meanwhile (RemoteAvatars.elsewhere).
 * - The controls: the stick, and the action area shows PASSE · DRIBBLE · TIR and nothing else (TIR held to dose the power, as the kickabout's « Frappe »);
 *   keys E · C · F (F held). A small band says the teams, the score and the clock; goals, half time and full time are moments; the result card comes
 *   only once the server's result (written by the ledger) has arrived — « en attente » until then. A dropped connection shows « Reconnexion… ».
 */
/** « Prêt » within this many metres of the grass; a ready player farther than AWAY_M (or indoors, or in another district) is made « Pas prêt ». */
const NEAR_M = 12, AWAY_M = 40;
/** Bodies made per frame at most (a body is a few ms to clone and dress): a 7 v 7's kick-off is spread over a few frames. */
const MAKE_PER_FRAME = 2;
/** How long the drawn body glides from one prediction to the next (s): one stick frame. */
const GLIDE = 0.05;
type Kick = { kind: 'pass' | 'shot'; at: number; swing: number; after: number; side: 1 | -1; yaw: number; ball: THREE.Vector3 | null; hit: boolean; key: object; t0: number };
interface Body { sid: number; team: 0 | 1; tag: string; h: Humanoid; key: string; st: { k: unknown; s0: THREE.Vector3 }; kick: Kick | null; seen: number; fn: (h: Humanoid) => void }

const BW = new THREE.Vector3(), AXIS = new THREE.Vector3(), QB = new THREE.Quaternion();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

class GrandCamp implements GameModule {
  readonly name = 'grandCamp';
  private ctx!: GameCtx;
  private pitch: { x: number; z: number } | null = null;
  private group: THREE.Group | null = null;
  private ball: THREE.Mesh | null = null;
  private bodies = new Map<number, Body>();
  private view: CampView | null = null;
  /** The match of mine is played here now (my roster place, this district's pitch, in the street). */
  private live = false;
  /** The stick's way while pushed, else the body's own (footballSim's yaw); an action for the next stick frame. */
  private face = 0; private act: { a: CampAction; p: number } | null = null;
  /** TIR held: since when (s of game time; −1: not held), and by what (a finger, the F key). */
  private hold = -1; private holdBy = new Set<string>();
  /** The drawn body: where it glides from and to, since when (performance.now ms). */
  private glide = { fx: 0, fz: 0, ff: 0, tx: NaN, tz: NaN, tf: 0, t0: 0, x: 0, z: 0, f: 0 };
  /** The ball drawn ahead with my predicted body while I have it (m, eased). */
  private lead = { x: 0, z: 0 };
  private own: { kick: Kick | null; st: { k: unknown; s0: THREE.Vector3 }; fn: ((h: Humanoid) => void) | null; dressed: Humanoid | null; team: 0 | 1 | null } = { kick: null, st: { k: null, s0: new THREE.Vector3() }, fn: null, dressed: null, team: null };
  private pad: HTMLElement | null = null; private band: HTMLElement | null = null; private padShown = false; private bandKey = '';
  private offEvent: (() => void) | null = null; private boundClient: unknown = null;
  private wasPlay = false; private resultShown: string | null = null; private awayT = 0; private unreadyAsked = false; private overAt = 0;
  /** Checks: what this device sent and saw. */
  private log = { sent: { pass: 0, dribble: 0, shot: 0 }, taps: { pass: 0, dribble: 0, shot: 0 }, moments: [] as string[], made: 0, kicks: 0, gaps: [] as number[], lastGoal: null as string | null, results: 0 };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    campHooks.atPitch = () => this.atPitch(NEAR_M);
    campHooks.goToPitch = () => onlineHooks.goToPlace?.({ id: PITCH_ID, hub: CAMP_HUB, name: CAMP_PLACE, icon: '⚽' });
    campHooks.playNow = () => {};
    // while the match is played, the action button is the pad's: no other target takes it (a player next to me, a seat)
    ctx.interactions.add({ name: 'grandCamp', collect: () => {}, exclusive: () => this.live });
    this.makePad(); this.makeBand();
    if (typeof addEventListener === 'function') {
      addEventListener('keydown', e => {
        if (!this.live || e.repeat || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
        if (e.code === 'KeyE') this.press('pass'); else if (e.code === 'KeyC') this.press('dribble'); else if (e.code === 'KeyF') this.holdOn('key');
      });
      addEventListener('keyup', e => { if (e.code === 'KeyF') this.holdOff('key'); });
      addEventListener('blur', () => { this.holdBy.clear(); this.hold = -1; });
    }
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.dropBodies();
    const sp = hub.id === CAMP_HUB ? hubLayout(hub.id).specials.find(s => s.kind === 'pitch') : undefined;
    this.pitch = sp ? { x: sp.x, z: sp.z } : null;
    this.group = null; this.ball = null; this.view = null;
    if (!sp) return;
    const g = new THREE.Group(); g.name = 'grand_camp';
    g.userData.lodPrio = 0.45;                                              // the street's humanoid budget draws the match's players first (src/social/ambientLife.ts)
    this.ball = ballMesh(ctx.quality() !== 'low'); this.ball.name = 'grand_camp_ball'; this.ball.visible = false; this.ball.userData.noLod = true;
    g.add(this.ball);
    ctx.extra.add(g);
    this.group = g;
  }

  // ------------------------------------------------------------------ where the player is
  /** Distance from (x, z) to the pitch's grass (0 on it). */
  private edgeDist(x: number, z: number) { const p = this.pitch!; return Math.hypot(Math.max(0, Math.abs(x - p.x) - PITCH.ex), Math.max(0, Math.abs(z - p.z) - PITCH.ez)); }
  /** In the street of the Corniche, within `m` metres of the pitch's grass. */
  atPitch(m: number): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.pitch || ctx.world()?.id !== CAMP_HUB || ctx.space() !== 'street') return false;
    return this.edgeDist(ctx.player.pos.x, ctx.player.pos.z) <= m;
  }
  /** Whether the match draws this player itself (their presence avatar then is not drawn: no second body). */
  drawsTag(tag: string | undefined): boolean {
    if (!this.live || !tag) return false;
    const r = campSession.client?.state.roster;
    return !!r && r.some(x => x.tag === tag && x.tag !== campSession.client?.state.me);
  }

  // ------------------------------------------------------------------ the frame
  update(ctx: GameCtx, dt: number) {
    const c = campSession.enabled ? campSession.client : null;
    if (c && c !== this.boundClient) { this.boundClient = c; this.offEvent?.(); this.offEvent = c.onEvent(e => this.onEvent(e)); }
    const l = c?.state.lobby ?? null, mine = !!c && !!campSession.mine && c.state.match === campSession.mine;
    const playing = mine && campSession.playing() && !!this.pitch && ctx.world()?.id === CAMP_HUB && ctx.space() === 'street' && ctx.mode() !== 'scene';
    if (playing && !this.live) this.kickoff(ctx, l!);
    if (!playing && this.live) this.stop(ctx);
    this.live = playing;
    football.book(playing ? this.ballFn : null);
    if (mine && l) this.lobbyCare(ctx, l, dt);
    this.result(ctx);
    this.showPad(playing);
    this.drawBand(playing, l);
    if (!playing || !c) { if (this.bodies.size && !this.live) this.dropBodies(); if (this.ball) this.ball.visible = false; return; }
    const v = c.view();
    this.view = v;
    if (!v) return;
    if (this.hold >= 0) this.hold += dt;
    this.drawBodies(v, dt);
    this.drawBall(v, dt);
    this.ownKick(ctx);
    this.dressOwn(ctx);
  }

  /** Steers my body: the stick to the server, the body where the prediction has it (gliding from one stick frame to the next). */
  pilot(_ctx: GameCtx, _dt: number, move: { x: number; z: number }) {
    if (!this.live || !this.pitch) return null;
    const c = campSession.client!;
    if (Math.hypot(move.x, move.z) > 0.05) this.face = Math.atan2(move.x, move.z);
    const a = this.act; this.act = null;
    c.input(move.x, move.z, this.face, a?.a, a?.p);
    if (a) this.log.sent[a.a]++;
    const p = c.predict();
    if (!p) return null;
    const g = this.glide, now = performance.now();
    if (p.x !== g.tx || p.z !== g.tz || p.f !== g.tf) {
      const far = !Number.isFinite(g.tx) || Math.hypot(p.x - g.x, p.z - g.z) > 3;
      g.fx = far ? p.x : g.x; g.fz = far ? p.z : g.z; g.ff = far ? p.f : g.f; g.tx = p.x; g.tz = p.z; g.tf = p.f; g.t0 = now;
      if (far) this.face = p.f;
    }
    const u = clamp((now - g.t0) / 1000 / GLIDE, 0, 1), df = Math.atan2(Math.sin(g.tf - g.ff), Math.cos(g.tf - g.ff));
    g.x = g.fx + (g.tx - g.fx) * u; g.z = g.fz + (g.tz - g.fz) * u; g.f = g.ff + df * u;
    return { x: this.pitch.x + g.x, z: this.pitch.z + g.z, facing: g.f, speed: Math.hypot(p.vx, p.vz) };
  }

  /** Kick-off (or back on the pitch after a reload): standing up, the walk handed to the match, the pad, my team's shirt. */
  private kickoff(ctx: GameCtx, l: CampLobbyView) {
    if (ctx.player.seated()) ctx.player.standUp(true);
    const c = campSession.client!, me = c.state.lobby ? l.players.find(p => p.tag === c.state.me) : null;
    this.glide.tx = NaN; this.lead.x = this.lead.z = 0; this.hold = -1; this.holdBy.clear(); this.act = null;
    this.own.team = me?.team ?? null;
    document.body.classList.add('camp-play');
    if (!this.wasPlay) {
      this.wasPlay = true;
      const team = me && me.team !== null ? l.teams[me.team] : 'tiens', back = (c.state.snap?.clock ?? 0) > 3;
      ctx.toast(back ? `⚽ De retour sur le terrain avec les ${team}` : `⚽ Coup d’envoi ! Tu joues avec les ${team}`);
    }
  }
  /** The match is no longer played here (over, left, another district): the walk is the player's again, the shirt their own. */
  private stop(ctx: GameCtx) {
    document.body.classList.remove('camp-play');
    this.undressOwn(ctx);
    const b = ctx.player.body();
    if (b && this.own.fn && b.overlay === this.own.fn) b.overlay = null;
    this.own.kick = null; this.own.fn = null; this.hold = -1; this.holdBy.clear(); this.act = null;
    if (this.ball) this.ball.visible = false;
  }

  /** Before kick-off: a ready player who walks away from the pitch is made « Pas prêt » (the fee given back) — nobody is carried to it. */
  private lobbyCare(ctx: GameCtx, l: CampLobbyView, dt: number) {
    const c = campSession.client!;
    if (l.state === 'over') this.wasPlay = false;
    if (l.state !== 'lobby') { this.awayT = 0; return; }
    this.wasPlay = false;
    const seat = l.players.find(p => p.tag === c.state.me);
    const ready = !!seat && (seat.ready || seat.hold === 'held');
    if (!ready || !ctx.world() || this.atPitch(AWAY_M)) { this.awayT = 0; this.unreadyAsked = false; return; }
    this.awayT += dt;
    if (this.awayT < 2.5 || this.unreadyAsked || c.state.status !== 'open') return;
    this.unreadyAsked = true;
    void c.unready().then(r => { if (r.ok) ctx.toast(`Tu t’es éloigné du terrain : tu n’es plus prêt.${l.terms.fee ? ' Ta mise t’est rendue.' : ''}`); else this.unreadyAsked = false; });
  }

  /** The end, once the server's result has arrived (never before): a card with the score and what came back to me; « en attente » meanwhile in the band. */
  private result(ctx: GameCtx) {
    const c = campSession.client;
    const r = c?.state.result, l = c?.state.lobby;
    if (!c || !r || !l || l.match !== campSession.mine || this.resultShown === l.match) return;
    this.resultShown = l.match; this.log.results++; this.overAt = performance.now();
    const me = l.players.find(p => p.tag === c.state.me);
    const v = resultView(r, { me: c.state.me, team: me?.team ?? null, teams: l.teams, names: t => l.players.find(p => p.tag === t)?.name ?? null });
    const match = l.match;
    ctx.hud.offer({ icon: v.icon, title: v.title, line: [v.score, ...v.lines].filter(Boolean).join(' · '), keep: true,
      actions: [{ label: 'Voir le résultat', primary: true, run: () => { phoneHooks.openPhone?.(`grandcamp:${match}`); } }] }, 20000);
  }

  // ------------------------------------------------------------------ the bodies
  private ballAt() { const b = this.view?.ball; return b ? { x: b.x + this.lead.x, z: b.z + this.lead.z } : { x: 0, z: 0 }; }
  private ballFn = () => this.ballAt();
  private drawBodies(v: CampView, dt: number) {
    const c = campSession.client!, l = c.state.lobby!, pt = this.pitch!, mySid = c.state.sid, roster = c.state.roster ?? [];
    let made = 0;
    const frame = performance.now();
    for (const p of v.players) {
      if (p.sid === mySid) continue;
      let b = this.bodies.get(p.sid);
      const r = roster.find(x => x.sid === p.sid), who = r ? l.players.find(x => x.tag === r.tag) : undefined;
      const team = (r?.team ?? p.team ?? 0) as 0 | 1, key = `${team}:${who?.look ?? 0}:${who?.app ?? ''}`;
      if (b && b.key !== key) { this.dropBody(b); this.bodies.delete(p.sid); b = undefined; }
      if (!b) {
        if (made >= MAKE_PER_FRAME || !humanoidReady() || !this.group) continue;
        made++; this.log.made++;
        const h = new Humanoid(this.kit(who ? { look: who.look, app: who.app } : { look: 0 }, team));
        h.group.name = 'humanoid_v2'; h.group.userData.campSid = p.sid;
        this.group.add(h.group);
        const nb: Body = { sid: p.sid, team, tag: r?.tag ?? '', h, key, st: { k: null, s0: new THREE.Vector3() }, kick: null, seen: frame, fn: () => {} };
        nb.fn = this.kickOverlay(nb);
        this.bodies.set(p.sid, b = nb);
      }
      b.seen = frame;
      const h = b.h;
      h.group.visible = true;
      h.group.position.set(pt.x + p.x, PITCH_FEET, pt.z + p.z);
      h.group.rotation.y = p.f;
      const k = b.kick;
      h.overlay = k ? b.fn : null;
      h.animate(dt, Math.hypot(p.vx, p.vz));
      if (k && v.clock - k.at > k.after + (k.hit ? 0 : 0.5)) b.kick = null;    // (a body drawn as a figure meanwhile never met the ball: dropped too)
    }
    for (const [sid, b] of this.bodies) if (b.seen !== frame) { b.h.group.visible = false; if (!v.players.some(p => p.sid === sid) && !roster.some(r => r.sid === sid)) { this.dropBody(b); this.bodies.delete(sid); } }
  }
  /** A player's look (from the lobby, as presence carries it) in their team's shirt. */
  private kit(p: { look: number; app?: string }, team: 0 | 1): PersonLook {
    return { ...peerLook(p), style: 'tee', top: TEAM_COLORS[team], pattern: 'uni', accent: 0xffffff, bottom: 0x1c1c1f, shoes: 0xf2f2ec };
  }
  /** The leg of a pass or a shot onto the ball (football.ts poseKick), timed on the drawn clock: swing, the contact at the event's time, follow-through. */
  private kickOverlay(b: Body) {
    return (h: Humanoid) => {
      const k = b.kick, v = this.view, pt = this.pitch;
      if (!k || !v || !pt) return;
      const t = v.clock;
      const before = !k.hit && t < k.at, now = !k.hit && t >= k.at;
      if (now) { k.hit = true; k.ball = new THREE.Vector3(pt.x + v.ball.x, PITCH_GRASS + Math.max(BALL_R, v.ball.h), pt.z + v.ball.z); k.yaw = h.group.rotation.y; }
      const ball = k.ball ?? BW.set(pt.x + v.ball.x, PITCH_GRASS + Math.max(BALL_R, v.ball.h), pt.z + v.ball.z);
      const u = before ? 1 - (k.at - t) / k.swing : 1, post = before ? 0 : clamp((t - k.at) / k.after, 0, 1);
      if (before && u <= 0) return;
      const gap = poseKick(h, b.st, k.key, k.kind, k.side, before ? h.group.rotation.y : k.yaw, ball, before, now, u, post);
      if (now && gap !== null) { this.log.kicks++; this.log.gaps.push(+gap.toFixed(3)); if (this.log.gaps.length > 200) this.log.gaps.shift(); }
    };
  }
  /** A match event: a pass or a shot swings that player's leg; a goal, half time, full time are moments; the others a line. */
  private onEvent(e: CampEvent) {
    const c = campSession.client, l = c?.state.lobby, ctx = this.ctx;
    if (!c || !l || !ctx || l.match !== campSession.mine) return;
    if ((e.k === 'pass' || e.k === 'shot') && e.who !== undefined) {
      const v = this.view, at = e.c / 10;
      const lead = v ? at - v.clock : 0.1, kind = e.k;
      const kick: Kick = { kind, at, swing: clamp(lead, 0.08, SWING[kind]), after: AFTER[kind], side: 1, yaw: 0, ball: null, hit: false, key: {}, t0: performance.now() };
      if (e.who === c.state.sid) { this.own.kick = kick; return; }
      const b = this.bodies.get(e.who); if (b) b.kick = kick;
      return;
    }
    if (!this.live || e.k === 'kickoff') return;                         // (a reload's catch-up of past events is not replayed: the module is not live yet)
    const name = (sid: number) => { const r = c.state.roster?.find(x => x.sid === sid); return r ? l.players.find(p => p.tag === r.tag)?.name ?? null : null; };
    const m = momentOf(e, l.teams, name, c.state.sid);
    if (!m) return;
    this.log.moments.push(`${e.k}:${m.title}`); if (this.log.moments.length > 60) this.log.moments.shift();
    if (e.k === 'goal') { this.log.lastGoal = m.line; football.cheer(); }
    if (m.big) ctx.hud.moment({ icon: m.icon, title: m.title, lines: m.line ? [m.line] : [] }, e.k === 'full' ? 5000 : 3500);
    else ctx.toast(`${m.icon} ${m.title}${m.line ? ` · ${m.line}` : ''}`);
  }
  /** My own pass or shot: my body's leg onto the ball, from the moment the server said it (my body is drawn ahead of the view: no wait). */
  private ownKick(ctx: GameCtx) {
    const h = ctx.player.body(), k = this.own.kick, pt = this.pitch!;
    if (!h) return;
    if (!k) { if (this.own.fn && h.overlay === this.own.fn) h.overlay = null; return; }
    const t = (performance.now() - k.t0) / 1000, swing = 0.12;
    if (t > swing + k.after) { this.own.kick = null; if (h.overlay === this.own.fn) h.overlay = null; return; }
    if (!this.own.fn) this.own.fn = (body: Humanoid) => {
      const kk = this.own.kick, v = this.view; if (!kk || !v) return;
      const tt = (performance.now() - kk.t0) / 1000, before = tt < swing, now = !kk.hit && tt >= swing;
      if (now) { kk.hit = true; kk.ball = new THREE.Vector3(pt.x + v.ball.x + this.lead.x, PITCH_GRASS + Math.max(BALL_R, v.ball.h), pt.z + v.ball.z + this.lead.z); kk.yaw = body.group.rotation.y; }
      const ball = kk.ball ?? BW.set(pt.x + v.ball.x + this.lead.x, PITCH_GRASS + Math.max(BALL_R, v.ball.h), pt.z + v.ball.z + this.lead.z);
      poseKick(body, this.own.st, kk.key, kk.kind, kk.side, before ? body.group.rotation.y : kk.yaw, ball, before, now, before ? tt / swing : 1, before ? 0 : clamp((tt - swing) / kk.after, 0, 1));
    };
    h.overlay = this.own.fn;
  }
  /** My body in my team's shirt for the match (a v4 body: the tee; a Meshy body: its plain garment in the nearest colour), my own look back after. */
  private dressOwn(ctx: GameCtx) {
    const h = ctx.player.body(), team = this.own.team;
    if (!h || team === null || this.own.dressed === h) return;
    this.own.dressed = h;
    if (h.body === 'v4') h.setLook({ ...avatarLook(campSessionLook()), top: TEAM_COLORS[team], pattern: 'uni' });
    else { const a = ctx.state.data.appearance; if (a) h.setAppearance({ ...a, outfit: 0, color: team === 0 ? 2 : 3 }); }
  }
  private undressOwn(ctx: GameCtx) {
    const h = this.own.dressed; this.own.dressed = null;
    if (!h || h !== ctx.player.body()) return;
    if (h.body === 'v4') h.setLook(avatarLook(campSessionLook())); else h.setAppearance(ctx.state.data.appearance);
  }

  // ------------------------------------------------------------------ the ball
  private drawBall(v: CampView, dt: number) {
    const ball = this.ball, pt = this.pitch!, c = campSession.client!;
    if (!ball) return;
    ball.visible = true;
    // while I have it, the ball goes with my predicted body (the view is ~100 ms behind it): the lead between the two, eased in and out
    const mine = c.state.sid !== null && v.own === c.state.sid, me = mine ? v.players.find(p => p.sid === c.state.sid) : null, g = this.glide;
    const tx = me && Number.isFinite(g.tx) ? g.x - me.x : 0, tz = me && Number.isFinite(g.tx) ? g.z - me.z : 0, k = Math.min(1, dt * 12);
    this.lead.x += (clamp(tx, -2, 2) - this.lead.x) * k; this.lead.z += (clamp(tz, -2, 2) - this.lead.z) * k;
    ball.position.set(pt.x + v.ball.x + this.lead.x, PITCH_GRASS + Math.max(BALL_R, v.ball.h), pt.z + v.ball.z + this.lead.z);
    const sp = Math.hypot(v.ball.vx, v.ball.vz);
    if (sp > 0.01) { AXIS.set(v.ball.vz, 0, -v.ball.vx).divideScalar(sp); QB.setFromAxisAngle(AXIS, (sp * dt) / BALL_R); ball.quaternion.premultiply(QB); }
  }

  // ------------------------------------------------------------------ PASSE · DRIBBLE · TIR, the band
  private press(a: 'pass' | 'dribble') { if (!this.live) return; this.act = { a, p: a === 'pass' ? 0.6 : 0.35 }; }
  private holdOn(by: string) { if (!this.live) return; this.holdBy.add(by); if (this.hold < 0) this.hold = 0; }
  private holdOff(by: string) {
    if (!this.holdBy.delete(by) || this.holdBy.size || this.hold < 0) return;
    const p = clamp(this.hold / HOLD_FULL, 0.15, 1); this.hold = -1;
    if (this.live) this.act = { a: 'shot', p };
  }
  private makePad() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const pad = document.createElement('div');
    pad.id = 'campPad'; pad.className = 'cp'; pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Passe, dribble, tir');
    pad.innerHTML = `<button type="button" class="cp-b cp-pass" data-a="pass" aria-label="Passe"><span class="cp-ic" aria-hidden="true">↗</span><b>PASSE</b><kbd aria-hidden="true">E</kbd></button>
      <button type="button" class="cp-b cp-dribble" data-a="dribble" aria-label="Dribble"><span class="cp-ic" aria-hidden="true">»</span><b>DRIBBLE</b><kbd aria-hidden="true">C</kbd></button>
      <button type="button" class="cp-b cp-shot" data-a="shot" aria-label="Tir : maintenir pour doser"><i class="cp-fill" aria-hidden="true"></i><span class="cp-ic" aria-hidden="true">🥅</span><b>TIR</b><kbd aria-hidden="true">F</kbd></button>`;
    if (typeof pad.addEventListener !== 'function') return;
    for (const b of pad.querySelectorAll<HTMLButtonElement>('.cp-b')) {
      const a = b.dataset.a as CampAction;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        b.classList.add('down');
        this.log.taps[a]++;
        if (a === 'shot') this.holdOn(`p${e.pointerId}`); else this.press(a);
      });
      const up = (e: PointerEvent) => { b.classList.remove('down'); if (a === 'shot') this.holdOff(`p${e.pointerId}`); b.blur(); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, up);
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    }
    this.pad = pad;
  }
  private showPad(on: boolean) {
    const pad = this.pad; if (!pad) return;
    if (on && !pad.isConnected) { const bar = document.getElementById('actbar'); if (!bar) return; bar.appendChild(pad); }
    if (on !== this.padShown) { this.padShown = on; pad.classList.toggle('on', on); if (!on) { this.holdBy.clear(); this.hold = -1; } }
    if (on) { const shot = pad.querySelector<HTMLElement>('.cp-shot'); if (shot) { const pct = this.hold >= 0 ? Math.round(clamp(this.hold / HOLD_FULL, 0, 1) * 20) * 5 : 0; shot.style.setProperty('--p', `${pct}%`); shot.classList.toggle('charge', this.hold >= 0); } }
  }
  private makeBand() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const b = document.createElement('div');
    b.id = 'campBand'; b.className = 'cb'; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite');
    b.innerHTML = '<span class="cb-row"><i class="cb-d t0" aria-hidden="true"></i><b class="cb-n0"></b><span class="cb-sc"></span><b class="cb-n1"></b><i class="cb-d t1" aria-hidden="true"></i></span><small class="cb-st"></small>';
    this.band = b;
  }
  private drawBand(playing: boolean, l: CampLobbyView | null) {
    const b = this.band; if (!b) return;
    const c = campSession.client, v = this.view;
    const recent = !!c?.state.result && performance.now() - this.overAt < 10_000;
    const show = !!c && !!l && l.match === campSession.mine && (playing || (l.state === 'over' && (recent || !c.state.result)) && this.wasOrIs());
    if (!show) { if (b.classList.contains('on')) { b.classList.remove('on'); this.bandKey = ''; } return; }
    if (!b.isConnected) document.getElementById('ui')?.appendChild(b);
    const net = c!.state.status === 'open' ? '' : 'Reconnexion…';
    const sc = c!.state.result?.score ?? v?.score ?? [0, 0];
    const st = net || (l!.state === 'over' ? (c!.state.result ? 'Terminé' : 'Fin du match · résultat en attente du serveur…')
      : v ? `${clockText(v.clock)} · ${v.phase === 'half' ? 'mi-temps' : v.half === 1 ? '1re mi-temps' : '2e mi-temps'}` : 'Coup d’envoi…');
    const key = `${l!.teams.join('|')}|${sc.join('-')}|${st}|${!!net}`;
    if (key === this.bandKey) { b.classList.add('on'); return; }
    this.bandKey = key;
    b.querySelector('.cb-n0')!.textContent = l!.teams[0]; b.querySelector('.cb-n1')!.textContent = l!.teams[1];
    b.querySelector('.cb-sc')!.textContent = `${sc[0]} – ${sc[1]}`;
    const s = b.querySelector<HTMLElement>('.cb-st')!; s.textContent = st; s.classList.toggle('net', !!net);
    b.setAttribute('aria-label', `${scoreText(l!.teams, sc as [number, number])} · ${st}`);
    b.classList.add('on');
  }
  private wasOrIs() { return this.live || this.wasPlay || this.resultShown === campSession.mine || !!campSession.client?.state.roster; }

  // ------------------------------------------------------------------ cleaning up
  private dropBody(b: Body) {
    const h = b.h, materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
    h.group.traverse(o => { const m = o as THREE.SkinnedMesh;
      if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat instanceof THREE.MeshLambertMaterial) materials.add(mat);
      if (m.isSkinnedMesh) skeletons.add(m.skeleton);
    });
    h.group.removeFromParent();
    for (const mat of materials) mat.dispose(); for (const s of skeletons) s.dispose();
    h.dispose();
  }
  private dropBodies() { for (const b of this.bodies.values()) this.dropBody(b); this.bodies.clear(); }

  // ------------------------------------------------------------------ checks (window.__dakar, ?debug)
  debug(): Record<string, unknown> {
    return {
      grandCamp: {
        /** The match as this device draws it: live, my place and body, the score and clock, the bodies drawn (full or figure), the pad, what was sent. */
        info: () => {
          const c = campSession.client, v = this.view, s = c?.state, pt = this.pitch;
          const foreign = [...this.bodies.values()].map(b => ({ sid: b.sid, team: b.team, full: b.h.group.visible && (b.h.group.children.find(o => o.name === 'Scene') ?? b.h.group.children[0])?.visible !== false }));
          return {
            enabled: campSession.enabled, mine: campSession.mine, live: this.live, status: s?.status ?? null, match: s?.match ?? null, state: s?.lobby?.state ?? null, sid: s?.sid ?? null,
            phase: v?.phase ?? null, clock: v ? +v.clock.toFixed(1) : null, score: s?.result?.score ?? v?.score ?? null, result: s?.result ?? null, money: s?.money.map(m => ({ ...m })) ?? [],
            me: v?.me && pt ? { x: +(pt.x + v.me.x).toFixed(2), z: +(pt.z + v.me.z).toFixed(2) } : null, pos: this.ctx ? { x: +this.ctx.player.pos.x.toFixed(2), z: +this.ctx.player.pos.z.toFixed(2) } : null,
            ball: v && pt ? { x: +(pt.x + v.ball.x).toFixed(2), z: +(pt.z + v.ball.z).toFixed(2), own: v.own } : null, pitch: pt,
            players: v?.players.length ?? 0, bodies: this.bodies.size, full: foreign.filter(f => f.full).length, figures: foreign.filter(f => !f.full).length,
            pad: this.padShown, band: this.band?.classList.contains('on') ? this.band.textContent : null, atPitch: this.atPitch(NEAR_M), hold: +this.hold.toFixed(2),
            log: { ...this.log, sent: { ...this.log.sent }, taps: { ...this.log.taps }, moments: [...this.log.moments], gaps: this.log.gaps.slice(-20) },
            wire: c ? Object.fromEntries(Object.entries(c.wire).map(([k, w]) => [k, { ...w }])) : {}, events: s?.events.length ?? 0,
          };
        },
        /** Scene setting for the checks: the organizer's invitation of these tags (as « Inviter » does: the server's list and a text message each). */
        inviteTags: (tags: string[]) => campSession.invite(tags),
        /** Scene setting for the checks: this player leaves the match being played (as « Quitter le match ») and the device forgets it, to organize the next one. */
        leaveAndForget: async () => { const r = await campSession.leave(); (campSession as unknown as { forget(): void }).forget(); campSession.client?.close(); return r; },
        /** Scene setting for the checks: a match organized with these terms (the form is checked on its own). */
        organize: (terms: Parameters<typeof campSession.create>[0]) => campSession.create(terms),
        /**
         * The match's socket drops as a network would drop it: the client reconnects by itself (« Reconnexion… », then the pitch back), its own
         * back-off starting `holdMs` in (a network that takes a few seconds to come back; DevTools' offline mode does not cut WebSockets).
         */
        dropSocket: (holdMs = 0) => {
          const c = campSession.client as unknown as { ws: WebSocket | null; attempt: number; drop(code: number, reason: string): void } | null, had = !!c?.ws;
          if (c && holdMs > 0) c.attempt = Math.max(c.attempt, holdMs >= 5000 ? 4 : holdMs >= 2500 ? 3 : 2);
          c?.drop(4003, 'Dropped (check)');
          return had;
        },
        /** The view's players in world space (screenshots, the checks' driver: where the ball and my body are). */
        view: () => {
          const v = this.view, pt = this.pitch, c = campSession.client; if (!v || !pt || !c) return null;
          return { sid: c.state.sid, own: v.own, taker: v.taker, phase: v.phase, ball: { x: pt.x + v.ball.x, z: pt.z + v.ball.z, h: v.ball.h, vx: v.ball.vx, vz: v.ball.vz }, me: v.me ? { x: pt.x + v.me.x, z: pt.z + v.me.z, f: v.me.f } : null,
            players: v.players.map(p => ({ sid: p.sid, team: p.team, x: pt.x + p.x, z: pt.z + p.z })), team: c.state.roster?.find(r => r.sid === c.state.sid)?.team ?? null };
        },
      },
    };
  }
}
/** The player's profile colour index (their presence look: main.ts PLAYER_LOOK), for the v4 body's own tee after the match. */
const campSessionLook = () => campSession.profile()?.look ?? 0;

export const grandCamp = new GrandCamp();
