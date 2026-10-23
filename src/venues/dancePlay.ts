import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Gesture } from '../activity/types';
import type { Humanoid } from '../actors/humanoid';
import { focusActivity, type InWorldPlayer } from '../activity/inWorld';
import {
  GRADE_SCORE, PHRASE_BEATS, WINDOWS, danceLine, danceScore, grade, levelOf, matchTouch, nextDownbeat, routine, sectionAt,
  type Cue, type CueKind, type Grade, type Phrase,
} from '../activity/danceRules';
import { DanceBody } from '../actors/danceMoves';
import { crowdCheer } from '../lamb/audio';
import { VAGUE_TRACK } from './vagueTrack';
import { BEAT, type VagueMusic } from './vagueMusic';
import { FrameCam, Layer, esc } from './inWorldKit';

/**
 * Dancing at La Vague, in the world (the « Danser » and contest steps of src/activity/templates.ts club(), their gesture
 * G.dance): the player stands in the middle of the floor facing the camera, the crowd round them; the music is the club's
 * own track and every cue sits on its beat map (src/venues/vagueTrack.ts) — the clock is the music heard
 * (src/venues/vagueMusic.ts `beat()`: the audio context's output timestamp), never a page timer while the music plays.
 *  - touch: the left or right half of the screen steps that way (the avatar faces you: like a mirror), a swipe up throws
 *    the arms up, a swipe sideways turns; keys ← → ↑ ↓ on a computer;
 *  - cues: rings closing on the foot that steps (cyan to the left, pink to the right), a gold ring for the arms, a white
 *    one for the turn; a word for each step (parfait, bien, ok, à côté, raté);
 *  - the moves: src/actors/danceMoves.ts on the player's body; the crowd near the player turns to watch, throws its arms
 *    up with yours, claps a turn, cheers a good run (src/crowd/clubCrowd.ts `stage`);
 *  - after the performance a small card (how well, one line from the floor); the runner pays and counts as before.
 * One step of the activity is one performance; the next step's starts on the next bar, the view staying meanwhile.
 */
export interface DanceStage {
  /** The dancers near `at` turn to watch (null: back to dancing); those on the camera's line step aside. */
  stage(at: { x: number; z: number } | null, camera: { x: number; z: number } | null): void;
  react(at: { x: number; z: number }, n: number, kind: 'celebrate' | 'applause' | 'shout'): void;
}
export interface DanceEnv {
  ctx: GameCtx;
  music: VagueMusic;
  crowd: DanceStage;
  /** The player is on this club's terrace. */
  here(): boolean;
  /** Where the dancer stands (world, on the floor's clear spot) and faces (world yaw: toward the gate, the camera). */
  spot(): { x: number; z: number; yaw: number };
}

interface Run {
  g: Extract<Gesture, { kind: 'dance' }>; label: string; done: (score: number) => void;
  phase: 'wait' | 'count' | 'dance' | 'over';
  waited: number; clock: 'audio' | 'page';
  phrases: Phrase[]; cues: Cue[]; judged: Set<number>; scores: Map<number, number>; grades: Map<number, Grade>;
  startBeat: number; endBeat: number; streak: number; best: number; ended: boolean;
}

const COL: Record<CueKind, number> = { L: 0x2fd8e8, R: 0xff5fc8, up: 0xffc83a, spin: 0xffffff };
const WORD: Record<Grade, [string, string]> = { parfait: ['Parfait !', 'parfait'], bien: ['Bien !', 'bien'], ok: ['Ok', 'ok'], 'à côté': ['À côté', 'cote'], raté: ['Raté', 'rate'] };
const LEAD_BEATS = 1.6;

export class DancePlay implements InWorldPlayer {
  readonly kind = 'dance' as const;
  private run: Run | null = null;
  private readonly body = new DanceBody();
  private layer: Layer | null = null;
  private els: { head: HTMLElement; count: HTMLElement; padL: HTMLElement; padR: HTMLElement; arrow: HTMLElement } | null = null;
  private readonly cam = new FrameCam();
  private group: THREE.Group | null = null;
  private targets: Record<'L' | 'R' | 'C', THREE.Mesh> | null = null;
  private approach: THREE.Mesh[] = [];
  private linger = 0;
  private padHit = 0;
  /** The game's one spot light (src/city/night.ts: the arena's, idle in a hub without an arena), borrowed as the floor's stage light. */
  private stageLight: { light: THREE.SpotLight; was: { x: number; y: number; z: number; angle: number; color: number } } | null = null;
  private spotNow = { x: 0, z: 0, yaw: 0 };
  private pageT0 = 0;
  private pageBeat0 = 0;
  private touches = new Map<number, { x: number; y: number; t: number; used: boolean }>();
  private overlay = (h: Humanoid) => this.body.pose(h, this.beat());
  private onKey = (e: KeyboardEvent) => {
    const k = ({ ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'up', ArrowDown: 'spin', KeyA: 'L', KeyD: 'R', KeyW: 'up', KeyS: 'spin' } as Record<string, CueKind>)[e.code];
    if (!k || !this.run || e.repeat) return;
    e.preventDefault(); e.stopPropagation(); this.touch(k, e.timeStamp);
  };
  /** Debug: the last touches as judged. */
  private log: { kind: CueKind; grade: Grade | null; dtMs: number | null; beat: number }[] = [];

  constructor(private readonly env: DanceEnv) {}

  accepts(g: Gesture) { return g.kind === 'dance' && this.env.here(); }

  // ------------------------------------------------------------------------------------------------ the clock
  /** The beat heard now (fractional, unwrapped): the music's own when it plays, else the page's (no sound at all). */
  beat(perf = performance.now()): number {
    if (this.run?.clock !== 'page') {
      const a = this.env.music.beat(perf);
      if (a !== null) { this.lastA = { beat: a, perf }; return a; }
      if (this.lastA) return this.lastA.beat + (perf - this.lastA.perf) / 1000 / BEAT;    // a hiccup of the audio: carried on from its last beat
    }
    return this.pageBeat0 + (perf - this.pageT0) / 1000 / BEAT;
  }
  private lastA: { beat: number; perf: number } | null = null;

  // ------------------------------------------------------------------------------------------------ play / stop
  play(g: Gesture, label: string, done: (score: number) => void): () => void {
    if (g.kind !== 'dance') throw new Error('not a dance');
    const { ctx } = this.env;
    const fresh = !this.layer;
    this.run = { g, label, done, phase: 'wait', waited: 0, clock: 'audio', phrases: [], cues: [], judged: new Set(), scores: new Map(), grades: new Map(), startBeat: 0, endBeat: 0, streak: 0, best: 0, ended: false };
    this.linger = 0;
    if (fresh) {
      const s = this.spotNow = this.env.spot();
      ctx.player.place(s.x, s.z, s.yaw);
      this.body.facing = s.yaw; this.body.energy = 0.45;
      this.build();
      focusActivity(true);
      addEventListener('keydown', this.onKey, true);
    }
    const body = ctx.player.body(); if (body) body.overlay = this.overlay;
    this.env.music.ensure();
    this.pageT0 = performance.now(); this.pageBeat0 = 0;
    const r = this.run;
    return () => { if (this.run === r) { this.run = null; this.teardown(); } };
  }

  finishNow(score: number) {
    const r = this.run; if (!r || r.ended) return false;
    for (const c of r.cues) if (!r.judged.has(c.i)) { r.judged.add(c.i); r.scores.set(c.i, score); }
    this.finish(r, score);
    return true;
  }

  private start(r: Run) {
    const now = this.beat();
    r.startBeat = nextDownbeat(now, VAGUE_TRACK.beatsPerBar, 2.5);
    const R = routine({ rounds: r.g.rounds, speed: r.g.speed, start: r.startBeat, seed: Math.floor(r.startBeat) * 31 + r.g.rounds, track: VAGUE_TRACK });
    r.phrases = R.phrases; r.cues = R.cues;
    r.endBeat = r.cues.length ? r.cues[r.cues.length - 1].beat + 1.2 : r.startBeat + PHRASE_BEATS;
    r.phase = 'count';
  }

  private finish(r: Run, forced?: number) {
    if (r.ended) return;
    r.ended = true; r.phase = 'over';
    const all = r.cues.map(c => r.scores.get(c.i) ?? 0);
    const score = forced ?? danceScore(all);
    const line = danceLine(score), at = this.spotNow;
    this.layer?.showCard({ title: r.label, pct: score, line: line.text, top: line.mood === 'top',
      marks: r.cues.length <= 24 ? r.cues.map(c => (r.scores.get(c.i) ?? 0) >= 0.55) : undefined });
    if (score >= 0.8) { this.env.crowd.react(at, 8, 'celebrate'); crowdCheer(2.4, 0.14); }
    else if (score >= 0.5) this.env.crowd.react(at, 5, 'applause');
    this.linger = 2.2;
    if (this.run === r) this.run = null;
    r.done(score);                                    // the runner may start the next step's performance right away (play again)
  }

  private teardown() {
    const { ctx } = this.env;
    const body = ctx.player.body(); if (body && body.overlay === this.overlay) body.overlay = null;
    removeEventListener('keydown', this.onKey, true);
    this.layer?.dispose(); this.layer = null; this.els = null;
    if (this.group) { this.group.removeFromParent(); this.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); this.group = null; }
    this.targets = null; this.approach = [];
    this.cam.release(); this.env.crowd.stage(null, null);
    if (this.stageLight) { const { light, was } = this.stageLight; light.intensity = 0; light.position.set(was.x, was.y, was.z); light.angle = was.angle; light.color.setHex(was.color); this.stageLight = null; }
    this.touches.clear(); this.linger = 0;
    focusActivity(false);
  }

  // ------------------------------------------------------------------------------------------------ the view: rings on the floor, pads, the head line
  private build() {
    const L = this.layer = new Layer('iw-dance');
    this.els = {
      head: L.add('iw-head', ''), count: L.add('iw-count', ''), padL: L.add('iw-pad l', '◀'), padR: L.add('iw-pad r', '▶'), arrow: L.add('iw-arrow', ''),
    };
    const el = L.el;
    el.addEventListener('pointerdown', e => { e.preventDefault(); this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, used: false }); });
    el.addEventListener('pointermove', e => {
      const t = this.touches.get(e.pointerId); if (!t || t.used) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      if (Math.hypot(dx, dy) < 34) return;
      t.used = true;
      this.touch(-dy > Math.abs(dx) ? 'up' : Math.abs(dx) > Math.abs(dy) ? 'spin' : (t.x < innerWidth / 2 ? 'L' : 'R'), t.t);
    });
    const up = (e: PointerEvent) => {
      const t = this.touches.get(e.pointerId); this.touches.delete(e.pointerId);
      if (t && !t.used) this.touch(t.x < innerWidth / 2 ? 'L' : 'R', t.t);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => this.touches.delete(e.pointerId));
    // the rings: two targets at the feet, one round the dancer (arms, turn), a few closing rings
    const g = this.group = new THREE.Group(); g.name = 'dance_cues';
    const ring = (r0: number, r1: number, color: number, opacity: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 3; g.add(m); return m;
    };
    this.targets = { L: ring(0.14, 0.2, COL.L, 0.55), R: ring(0.14, 0.2, COL.R, 0.55), C: ring(0.62, 0.68, 0xffffff, 0.0) };
    for (let i = 0; i < 6; i++) { const m = ring(0.17, 0.23, 0xffffff, 0); m.visible = false; this.approach.push(m); }
    this.env.ctx.extra.add(g);
    // a stage light on the dancer: the arena's spot when this hub has no arena to light (never on the low setting, where it does not exist)
    const sp = this.env.ctx.scene.getObjectByName('arena_spot') as THREE.SpotLight | undefined;
    if (sp?.isSpotLight && sp.intensity === 0 && !this.env.ctx.world()?.arena) {
      this.stageLight = { light: sp, was: { x: sp.position.x, y: sp.position.y, z: sp.position.z, angle: sp.angle, color: sp.color.getHex() } };
      const s = this.spotNow, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      sp.position.set(s.x + fx * 2.2, this.env.ctx.player.pos.y + 6.5, s.z + fz * 2.2); sp.target.position.set(s.x, this.env.ctx.player.pos.y + 0.6, s.z); sp.target.updateMatrixWorld();
      sp.angle = 0.3; sp.color.setHex(0xfff0e0); sp.intensity = 0.01;
    }
  }

  /** Where each cue lands (world): the screen's left is the body's right (the dancer faces the camera). */
  private target(kind: CueKind, out: THREE.Vector3) {
    const s = this.spotNow, y = this.env.ctx.player.pos.y + 0.035, rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const side = kind === 'L' ? 1 : kind === 'R' ? -1 : 0;
    return out.set(s.x + rx * 0.3 * side + fx * 0.06, y, s.z + rz * 0.3 * side + fz * 0.06);
  }

  // ------------------------------------------------------------------------------------------------ a touch
  private touch(kind: CueKind, perf: number) {
    const r = this.run; if (!r || r.phase === 'wait' || r.ended) return;
    const b = this.beat(perf);
    const m = r.phase === 'dance' || r.phase === 'count' ? matchTouch(r.cues, r.judged, kind, b, BEAT) : null;
    const move = m?.cue.move ?? r.phrases.find(p => b >= p.from - 0.5 && b < p.to)?.move ?? 'pas';
    let gr: Grade | null = null;
    if (m) {
      gr = grade(m.dt, m.cue.kind === kind);
      r.judged.add(m.cue.i); r.scores.set(m.cue.i, GRADE_SCORE[gr]); r.grades.set(m.cue.i, gr);
      r.streak = gr === 'parfait' || gr === 'bien' ? r.streak + 1 : 0; r.best = Math.max(r.best, r.streak);
      const at = this.spotNow;
      if (GRADE_SCORE[gr] >= 0.55) {
        if (kind === 'up') this.env.crowd.react(at, 5, 'celebrate');
        else if (kind === 'spin') this.env.crowd.react(at, 4, 'applause');
        else if (r.streak > 0 && r.streak % 6 === 0) { this.env.crowd.react(at, 3, 'shout'); this.env.crowd.react(at, 3, 'celebrate'); }
      }
      const p = this.screenOf(m.cue.kind);
      if (p) this.layer?.word(WORD[gr][0], WORD[gr][1], p.x, p.y - 30);
    }
    // the body does what was touched, cue or not (dancing between the cues is never punished)
    this.body.hit(kind, move === 'tour' && (kind === 'L' || kind === 'R') ? 'pas' : move, b, gr ? Math.max(0.35, GRADE_SCORE[gr]) : 0.5);
    const pad = kind === 'L' ? this.els?.padL : kind === 'R' ? this.els?.padR : null;
    if (pad) { pad.classList.add('hit'); this.padHit = 0.15; }
    this.log.push({ kind, grade: gr, dtMs: m ? Math.round(m.dt * 1000) : null, beat: +b.toFixed(3) }); if (this.log.length > 40) this.log.shift();
  }

  private screenOf(kind: CueKind): { x: number; y: number } | null {
    const cam = this.env.ctx.camera, v = this.target(kind, new THREE.Vector3());
    if (kind === 'up' || kind === 'spin') v.y += 2.1;
    v.project(cam);
    return v.z > 1 ? null : { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }

  // ------------------------------------------------------------------------------------------------ every frame (the club's update)
  update(dt: number) {
    const r = this.run, { ctx } = this.env;
    this.body.settle(dt);
    this.layer?.tick(dt);
    if (this.padHit > 0 && (this.padHit -= dt) <= 0) { this.els?.padL.classList.remove('hit'); this.els?.padR.classList.remove('hit'); }
    if (!r) {
      if (this.linger > 0) {
        this.linger -= dt;
        const p = ctx.player.pos, moved = Math.hypot(p.x - this.spotNow.x, p.z - this.spotNow.z) > 0.4;
        if (this.linger <= 0 || moved) this.teardown();
        else this.paint(this.beat(), null);
      }
      return;
    }
    if (r.phase === 'wait') {
      r.waited += dt;
      if (this.env.music.beat() !== null) { r.clock = 'audio'; this.start(r); }
      else if (r.waited > 2.5) { r.clock = 'page'; this.pageT0 = performance.now(); this.pageBeat0 = 0; this.start(r); }
    }
    const b = this.beat();
    if (r.phase === 'count' && b >= r.startBeat - 0.25) r.phase = 'dance';
    // cues gone by unanswered: missed
    for (const c of r.cues) {
      if (r.judged.has(c.i)) continue;
      if ((b - c.beat) * BEAT <= WINDOWS.ok) break;
      r.judged.add(c.i); r.scores.set(c.i, 0); r.grades.set(c.i, 'raté'); r.streak = 0;
      const p = this.screenOf(c.kind); if (p) this.layer?.word(WORD.raté[0], WORD.raté[1], p.x, p.y - 30);
    }
    this.paint(b, r);
    if (r.phase !== 'wait' && b >= r.endBeat) this.finish(r);
  }

  /** The rings, the pads, the head line and the count-in for beat `b`. */
  private paint(b: number, r: Run | null) {
    if (!this.targets || !this.els) return;
    const tmp = new THREE.Vector3();
    this.targets.L.position.copy(this.target('L', tmp)); this.targets.R.position.copy(this.target('R', tmp)); this.targets.C.position.copy(this.target('up', tmp));
    const pulse = 0.5 + 0.5 * Math.cos(Math.PI * 2 * b);
    for (const k of ['L', 'R'] as const) { const m = this.targets[k]; (m.material as THREE.MeshBasicMaterial).opacity = r ? 0.35 + 0.3 * pulse : 0.15; m.scale.setScalar(1 + 0.08 * pulse); }
    let n = 0, cueL = false, cueR = false, arrow = '';
    if (r && r.phase !== 'wait') for (const c of r.cues) {
      const ahead = c.beat - b;
      if (ahead > LEAD_BEATS) break;
      if (r.judged.has(c.i) || ahead < -0.15 || n >= this.approach.length) continue;
      const m = this.approach[n++], k = Math.max(0, ahead) / LEAD_BEATS;
      m.visible = true; m.position.copy(this.target(c.kind, tmp));
      const big = c.kind === 'up' || c.kind === 'spin';
      m.scale.setScalar((big ? 3.0 : 1) * (1 + 2.4 * k));
      const mat = m.material as THREE.MeshBasicMaterial; mat.color.setHex(COL[c.kind]); mat.opacity = 0.35 + 0.65 * (1 - k);
      if (ahead < 0.45) { if (c.kind === 'L') cueL = true; else if (c.kind === 'R') cueR = true; }
      if (big && ahead < 1.2 && !arrow) arrow = c.kind === 'up' ? '⬆' : '↻';
    }
    for (let i = n; i < this.approach.length; i++) this.approach[i].visible = false;
    this.els.padL.classList.toggle('cue', cueL); this.els.padR.classList.toggle('cue', cueR);
    this.els.arrow.textContent = arrow; this.els.arrow.style.visibility = arrow ? '' : 'hidden';
    // the head line: the phrase and how to dance it; the count-in on the bar before
    const ph = r?.phrases.find(p => b >= p.from - 2 && b < p.to - 2) ?? r?.phrases[0];
    const head = !r ? '' : r.phase === 'wait' ? 'La musique…' : ph ? `${ph.label}<small>${esc(ph.variation ?? ph.hint)}</small>` : '';
    if (this.els.head.dataset.k !== head) { this.els.head.dataset.k = head; this.els.head.innerHTML = head ? head.replace(/^[^<]*/, s => esc(s)) : ''; this.els.head.style.visibility = head ? '' : 'hidden'; }
    const left = r ? r.startBeat - b : 99;
    const count = r && r.phase === 'count' && left > 0 && left <= 4 ? String(Math.ceil(left)) : r && r.phase === 'dance' && left > -0.8 ? 'Danse !' : '';
    if (this.els.count.textContent !== count) this.els.count.textContent = count;
  }

  // ------------------------------------------------------------------------------------------------ the camera (VenuesModule's camera hook)
  camera(dt: number): boolean {
    if (!this.layer) return false;
    const s = this.spotNow, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw), y = this.env.ctx.player.pos.y;
    const sway = Math.sin(this.beat() * Math.PI / 8) * 0.25;
    const pos = new THREE.Vector3(s.x + fx * 3.5 + rx * sway, y + 1.62, s.z + fz * 3.5 + rz * sway);
    const look = new THREE.Vector3(s.x, y + 1.05, s.z);
    this.cam.frame(this.env.ctx.camera, pos, look, dt);
    // the stage light swells with the dancer's energy, a little on the beat
    if (this.stageLight) this.stageLight.light.intensity = 1.4 + 1.4 * this.body.energy + 0.3 * (0.5 + 0.5 * Math.cos(Math.PI * 2 * this.beat()));
    this.env.crowd.stage({ x: s.x, z: s.z }, { x: pos.x, z: pos.z });
    // chips pinned to the world, after the camera moved
    if (this.els) { const a = this.target('up', new THREE.Vector3()); a.y += 2.15; this.layer.pin(this.els.arrow, this.env.ctx.camera, a); }
    return true;
  }

  info() {
    const r = this.run, b = this.beat();
    if (!r && !this.layer) return null;
    const next = r?.cues.find(c => !r.judged.has(c.i)) ?? null;
    const scr = (k: CueKind) => { const p = this.screenOf(k); return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; };
    return {
      phase: r?.phase ?? 'linger', clock: r?.clock ?? null, beat: +b.toFixed(3), startBeat: r?.startBeat ?? null, endBeat: r?.endBeat ?? null,
      section: sectionAt(VAGUE_TRACK, b), level: r ? levelOf(r.g.speed) : null,
      phrases: r?.phrases.map(p => ({ move: p.move, from: p.from, variation: p.variation })) ?? [],
      cues: r?.cues.length ?? 0, judged: r?.judged.size ?? 0, next: next ? { kind: next.kind, beat: next.beat, inMs: Math.round((next.beat - b) * BEAT * 1000) } : null,
      score: r ? +danceScore(r.cues.filter(c => r.judged.has(c.i)).map(c => r.scores.get(c.i) ?? 0)).toFixed(3) : null,
      grades: r ? Object.fromEntries((['parfait', 'bien', 'ok', 'à côté', 'raté'] as Grade[]).map(gk => [gk, [...r.grades.values()].filter(x => x === gk).length])) : null,
      streak: r?.streak ?? 0, energy: +this.body.energy.toFixed(2), body: this.body.last, log: this.log.slice(-8),
      screen: { L: scr('L'), R: scr('R') }, card: this.layer?.cardShown ?? false, stageLight: this.stageLight ? +this.stageLight.light.intensity.toFixed(2) : null,
      // for the checks' player: the coming cues and the page's clock at this beat (epoch ms), so a touch can be timed from outside
      upcoming: r ? r.cues.filter(c => !r.judged.has(c.i) && c.beat >= b - 0.3).slice(0, 6).map(c => ({ i: c.i, beat: c.beat, kind: c.kind })) : [],
      epoch: performance.timeOrigin + performance.now(), beatSec: BEAT,
    };
  }

  dispose() { this.run = null; if (this.layer) this.teardown(); }
}
