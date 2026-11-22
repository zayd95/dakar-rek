import type { ClipId } from './combatClips';

/**
 * The cinematic bout (« bëre »): played with the stick and the thumb, told in staged shots with paired animations (each
 * move's attacker and receiver are two Meshy clips of the same length on one clock, the bodies placed facing each other).
 * No clock rushes the player: he waits for his moment, the opponent shows his intentions before he acts.
 *
 * 1. **Debout** (standing): both stand tall and circle; the stick walks the pit (out of it: a « Sortie », three lose).
 *    He circles, feints (a dip in and back) and charges (a crouch before he lunges: the tell).
 *    - « Saisir » in reach: an even empoignade; on his feint: hands locked; in his tell: a counter-grip (yours is the
 *      better hold); after he missed (you stepped away from his lunge: he stumbles): a strong hold.
 *    - his lunge let come: his hold is the better. Out of reach: you miss, and he is on you.
 *    - nobody engages for long: the referee calls « Bëre ! » and he comes.
 * 2. **Empoignade** (chest to chest): a tug of force, live. The stick pushes (towards him), pulls (back) and turns the
 *    pair; « Force » held puts the weight in (it spends breath; let go, it comes back). He pushes, pulls and rests in turns.
 *    - push against his push: a stand-off, breath spent; pull as he pushes: he falls forward into you; push as he pulls:
 *      he goes back. The pair drifts the way the stronger drives: driven out of the pit is a sortie.
 *    - his imbalance opens a move: forward over your hip (Hanche), back onto his heels (Croc), back near the edge
 *      (Pousser), spent and held (Soulevé). The move it opens is lit; any move can be tried at any time.
 *    - he attacks too: a tell (he drops his hips), and « Résiste » pressed in its window holds him; late in it, the
 *      counter: his own move turned on him. Nothing pressed: your balance decides.
 * 3. **Projection** (your move): a gauge rises slowly once; the lit zone is wide when he was well off balance, narrow
 *    when not. Its force against his resistance: a clean throw (on his back: the bout; pushed out: a sortie), he resists
 *    (back to standing), or he counters.
 * 4. A fall is replayed once, slower, from another angle, before the result.
 *
 * Pure state: src/lamb/duel.ts feeds it time and the controls, moves the pair, poses the bodies and frames the shots.
 */
export type CinePhase = 'debout' | 'empoignade' | 'projection' | 'scene' | 'replay' | 'fin';
export type TechId = 'souleve' | 'hanche' | 'croc' | 'pousse';
export type Who = 'player' | 'opponent';
/** What he does standing: circles, feints, the charge's tell, the lunge, the stumble after a miss. */
export type AiAct = 'tourne' | 'feinte' | 'garde' | 'charge' | 'rate';

export interface Tech {
  id: TechId; label: string;
  /** The attacker's and the receiver's clips (one clock), the scene's length, how far apart they stand at its start (m). */
  a: ClipId; b: ClipId; dur: number; gap: number;
  /** How hard it is against an even, fresh opponent (0…1); the moment (s) the receiver hits the sand. */
  need: number; impact: number;
}
export const TECHS: Record<TechId, Tech> = {
  souleve: { id: 'souleve', label: 'Soulevé', a: 'lift_slam_a', b: 'lift_slam_b', dur: 3.9, gap: 0.62, need: 0.66, impact: 2.3 },
  hanche: { id: 'hanche', label: 'Hanche', a: 'hip_throw', b: 'hip_b', dur: 2.95, gap: 0.55, need: 0.58, impact: 1.7 },
  croc: { id: 'croc', label: 'Croc', a: 'trip_a', b: 'trip_b', dur: 2.95, gap: 0.6, need: 0.52, impact: 1.5 },
  pousse: { id: 'pousse', label: 'Pousser', a: 'push_a', b: 'push_b', dur: 2.95, gap: 0.7, need: 0.4, impact: 1.2 },
};
export const TECH_ORDER: TechId[] = ['souleve', 'hanche', 'croc', 'pousse'];

/** A scene: what plays now, for how long, and what it leads to. */
export interface Scene {
  kind: 'throw' | 'resist';
  by: Who; tech: TechId | null; t: number; dur: number;
  /** The clip each body plays (attacker, receiver), the receiver's state at the end. */
  a: ClipId; b: ClipId;
  result: 'fall' | 'out' | 'resisted' | 'none';
  impact: number;
  /** A counter: the move turned on the man who started it. */
  counter?: boolean;
}

export interface CineEvents { banner?: string; fall?: Who; out?: Who; shake?: number; cheer?: number; tell?: boolean; say?: string }

/** The controls this step: the action pressed (edge) and held, the stick along the pair (+ towards him) and across, a move picked. */
export interface CineInput { press: boolean; hold: boolean; push: number; turn: number; pick: TechId | null }
export const NO_INPUT: CineInput = { press: false, hold: false, push: 0, turn: 0, pick: null };

export interface CineOpts { level: number; seed?: number; }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-rate * dt));

/** Each wrestler's lean in the empoignade (own frame): f > 0 falling forward into the other, f < 0 back on his heels; s sideways. */
export interface Lean { f: number; s: number }

export class CineBout {
  phase: CinePhase = 'debout';
  /** Time in the phase (s). */
  t = 0;
  /** Endurance (0…100): pushing with the weight in spends it, resting brings it back; it weakens holds and throws. */
  stamina = { player: 100, opponent: 100 };
  points = { player: 0, opponent: 0 };
  sorties = { player: 0, opponent: 0 };
  winner: Who | null = null;
  tech: TechId | null = null;
  scene: Scene | null = null;
  force = 0; said = '';

  // ---- standing
  ai: { act: AiAct; t: number; dur: number } = { act: 'tourne', t: 0, dur: 3 };
  /** How long nobody has engaged (s): at `PASSIVE` the referee calls for the bëre. */
  idle = 0;
  /** A missed grab: the player is off his feet that long (s). */
  whiff = 0;
  /** How the empoignade began, for the HUD and the shots. */
  start: 'egal' | 'liees' | 'contre' | 'bonne' | 'subie' | null = null;

  // ---- empoignade
  /** The hold (−1 his … +1 yours). */
  grip = 0;
  lean: Record<Who, Lean> = { player: { f: 0, s: 0 }, opponent: { f: 0, s: 0 } };
  /** The drives along the pair this step (+ towards the other), after strength, for the bodies and the pair's drift. */
  drive = { player: 0, opponent: 0 };
  /** How fast the pair moves now (m/s, + towards him) and turns (rad/s), for duel.ts to move them. */
  drift = 0; spin = 0;
  /** His rhythm in the empoignade: pushing, pulling, resting, or the tell of his attack. */
  aiPlan: { act: 'pousse' | 'tire' | 'souffle' | 'attaque'; t: number; dur: number; tech?: TechId; read?: boolean } = { act: 'souffle', t: 0, dur: 1.5 };
  /** How long the player has been using his drive against him (pulling as he pushes, pushing as he pulls), and pushing at all. */
  private usedT = 0; private pushT = 0;
  /** The set-up each move has now (0…1), and the one lit. */
  open: Record<TechId, number> = { souleve: 0, hanche: 0, croc: 0, pousse: 0 };
  lit: TechId | null = null;
  private clinchT = 0;

  // ---- projection
  /** The gauge (0…1 up, then back down) and its lit zone; the set-up frozen as the move began. */
  needle = 0; z0 = 0.7; z1 = 0.9; private setup = 0;

  // ---- the replay of a fall
  replayT = 0;
  static readonly REPLAY = { from: 1.3, after: 0.9, rate: 0.55 };

  private seed: number;
  private level: number;
  static readonly PASSIVE = 18;

  constructor(o: CineOpts) {
    this.level = clamp(o.level, 1, 6); this.seed = (o.seed ?? 7) >>> 0;
    this.ai = { act: 'tourne', t: 0, dur: this.circleFor() };
  }
  private rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  /** How long his tells last (s): long and readable at level 1, short at 6. */
  tellFor() { return 1.45 - 0.14 * (this.level - 1); }
  private circleFor() { return 2.6 + 3.2 * this.rand() - 0.2 * (this.level - 1); }
  private enter(p: CinePhase) { this.phase = p; this.t = 0; }
  get inZone() { return this.needle >= this.z0 && this.needle <= this.z1; }
  /** His tell standing (the charge's crouch) or in the empoignade (his attack's): how far into it (0…1), else -1. */
  get tellK(): number {
    if (this.phase === 'debout' && this.ai.act === 'garde') return this.ai.t / this.ai.dur;
    if (this.phase === 'empoignade' && this.aiPlan.act === 'attaque') return this.aiPlan.t / this.aiPlan.dur;
    return -1;
  }
  /** Where in a tell (0…1) « Résiste » / « Saisir » starts to hold him, and where it counters: the last 0.75 s and 0.36 s at level 1, shorter higher up. */
  holdFrom() { return Math.max(0.3, 1 - (0.75 - 0.08 * (this.level - 1)) / this.tellFor()); }
  counterFrom() { return 1 - (0.36 - 0.035 * (this.level - 1)) / this.tellFor(); }

  /**
   * One step. `apart` is the distance between them standing, `edge` how far each is from leaving the pit (m, negative: out).
   */
  step(dt: number, inp: CineInput, apart: number, edgeOf: Record<Who, number>): CineEvents {
    const ev: CineEvents = {};
    this.t += dt;
    switch (this.phase) {
      case 'debout': this.standing(dt, inp, apart, edgeOf, ev); break;
      case 'empoignade': this.clinch(dt, inp, edgeOf, ev); break;
      case 'projection': {
        // the gauge rises once, slowly (1.5 s), and falls back: the press is the timing
        const k = this.t / 1.5; this.needle = k <= 1 ? k : Math.max(0, 2 - k);
        if (inp.press || k >= 2) {
          const c = (this.z0 + this.z1) / 2, half = (this.z1 - this.z0) / 2;
          const timing = inp.press ? clamp(1 - Math.abs(this.needle - c) / (half * 2.2), 0, 1) : 0;
          this.force = clamp((0.62 * this.setup + 0.38 * timing) * (0.75 + 0.25 * this.stamina.player / 100) , 0, 1);
          this.resolve('player', this.tech!, this.force, edgeOf.opponent, ev);
        }
        break;
      }
      case 'scene': {
        const s = this.scene!;
        if (s.t < s.impact && s.t + dt >= s.impact) {
          if (s.result === 'fall') { ev.fall = s.by === 'player' ? 'opponent' : 'player'; ev.shake = 0.6; ev.cheer = 1; ev.banner = 'TERRE !'; }
          if (s.result === 'out') { ev.shake = 0.3; ev.cheer = 0.6; }
          if (s.result === 'resisted') ev.shake = 0.25;
        }
        s.t += dt;
        if (s.t >= s.dur) {
          if (s.result === 'fall') { this.winner = s.by; this.enter('replay'); this.replayT = 0; s.t = Math.max(0, s.impact - CineBout.REPLAY.from); }
          else if (s.result === 'out') this.sortie(s.by === 'player' ? 'opponent' : 'player', ev);
          else this.backStanding();
        }
        break;
      }
      case 'replay': {
        // the fall again, slower, from another angle (duel.ts frames it), then the result
        const s = this.scene!;
        s.t += dt * CineBout.REPLAY.rate; this.replayT += dt;
        if (s.t >= Math.min(s.dur, s.impact + CineBout.REPLAY.after)) { s.t = s.dur; this.enter('fin'); }
        break;
      }
      case 'fin': break;
    }
    return ev;
  }

  /** Skip the replay (the action pressed during it). */
  skipReplay() { if (this.phase === 'replay' && this.scene) { this.scene.t = this.scene.dur; this.enter('fin'); } }

  // -------------------------------------------------------------------------------------------------- standing
  private standing(dt: number, inp: CineInput, apart: number, edgeOf: Record<Who, number>, ev: CineEvents) {
    for (const w of ['player', 'opponent'] as const) if (edgeOf[w] < 0) { this.sortie(w, ev); return; }
    const a = this.ai; a.t += dt; this.idle += dt;
    this.whiff = Math.max(0, this.whiff - dt);
    for (const w of ['player', 'opponent'] as const) this.stamina[w] = Math.min(100, this.stamina[w] + 1.5 * dt);
    // the player's grab
    if (inp.press && this.whiff <= 0) {
      if (apart > 1.75) {
        // out of reach: a grab in the air, and he is on you
        this.whiff = 0.9; ev.banner = 'RATÉ'; ev.say = 'Trop loin';
        if (apart < 2.6 && a.act !== 'rate') { a.act = 'garde'; a.t = a.dur = 0.5 * this.tellFor(); ev.tell = true; }
        return;
      }
      const k = a.act === 'garde' ? a.t / a.dur : -1;
      if (a.act === 'rate') return this.engage(0.65, 'bonne', 'BONNE PRISE !', ev);
      if (a.act === 'feinte') return this.engage(0, 'liees', 'MAINS LIÉES', ev);
      if (k >= this.holdFrom()) return this.engage(0.45, 'contre', 'CONTRE-SAISIE !', ev);
      if (k >= 0) return this.engage(-0.15, 'egal', 'EMPOIGNADE', ev);      // too early in his tell: he is ready for it
      return this.engage(0, 'egal', 'EMPOIGNADE', ev);
    }
    // his own plan
    switch (a.act) {
      case 'tourne':
        if (this.idle > CineBout.PASSIVE) { this.idle = 0; ev.banner = 'BËRE !'; ev.say = 'L’arbitre : au contact !'; this.goAi('garde', this.tellFor(), ev); break; }
        if (a.t > a.dur && apart < 2.8) this.goAi(this.rand() < 0.35 + 0.03 * this.level ? 'feinte' : 'garde', this.rand() < 0.5 ? 0.8 : this.tellFor(), ev);
        break;
      case 'feinte': if (a.t > a.dur) this.goAi('tourne', this.circleFor() * 0.6, ev); break;
      case 'garde': if (a.t > a.dur) this.goAi('charge', 0.42, ev); break;
      case 'charge':
        if (a.t > a.dur) {
          // the lunge lands if he reached you; you stepped away: he misses and stumbles
          if (apart < 1.45) return this.engage(-0.5, 'subie', 'IL TE SAISIT', ev);
          ev.banner = 'ESQUIVE !'; ev.cheer = 0.4; this.goAi('rate', 1.5, ev);
        }
        break;
      case 'rate': if (a.t > a.dur) this.goAi('tourne', this.circleFor(), ev); break;
    }
  }
  private goAi(act: AiAct, dur: number, ev: CineEvents) {
    this.ai = { act, t: 0, dur };
    if (act === 'garde') ev.tell = true;
  }
  /** Where he means to stand from the player (m): far circling, close on a feint and his lunge. */
  aiWant(): number {
    const a = this.ai;
    return a.act === 'charge' ? 0.6 : a.act === 'feinte' ? (a.t < a.dur * 0.5 ? 1.15 : 1.9) : a.act === 'garde' ? 1.55 : a.act === 'rate' ? 9 : 2.0;
  }

  private engage(grip: number, how: NonNullable<CineBout['start']>, banner: string, ev: CineEvents) {
    this.enter('empoignade'); this.start = how; this.grip = grip; this.idle = 0; this.clinchT = 0;
    this.lean = { player: { f: how === 'subie' ? 0.25 : 0, s: 0 }, opponent: { f: how === 'bonne' ? 0.35 : 0, s: 0 } };
    this.aiPlan = { act: 'souffle', t: 0, dur: 1 + this.rand() };
    ev.banner = banner; ev.shake = 0.18;
  }

  // -------------------------------------------------------------------------------------------------- empoignade
  private clinch(dt: number, inp: CineInput, edgeOf: Record<Who, number>, ev: CineEvents) {
    this.clinchT += dt;
    for (const w of ['player', 'opponent'] as const) if (edgeOf[w] < 0) { ev.banner = 'POUSSÉ DEHORS !'; this.sortie(w, ev); return; }
    const P = this.aiPlan, L = this.lean, lvl = this.level;
    P.t += dt;
    // --- his attack: the tell, then it goes
    if (P.act === 'attaque') {
      const k = P.t / P.dur;
      if (inp.press && !P.read) {
        if (k >= this.counterFrom()) {
          // the counter: his move turned on him (likelier late in his tell, with breath and the hold on your side)
          const chance = 0.42 + 0.9 * (k - this.counterFrom()) + 0.35 * (this.stamina.player - this.stamina.opponent) / 100 + 0.2 * this.grip - 0.04 * lvl;
          const ok = this.rand() < chance;
          const T = TECHS[P.tech!];
          if (ok) {
            // turned on him: a spent man goes over; a fresh one gets away from it, emptied, and you take the point
            this.points.player++;
            const over = this.stamina.opponent < 55 || this.rand() < 0.15;
            if (P.tech === 'pousse') this.play({ kind: 'throw', by: 'player', tech: 'pousse', a: T.a, b: T.b, result: edgeOf.opponent < 1.6 ? 'out' : 'none', counter: true });
            else if (over) this.play({ kind: 'throw', by: 'player', tech: P.tech!, a: T.a, b: T.b, result: 'fall', counter: true });
            else { this.play({ kind: 'resist', by: 'player', tech: P.tech!, a: T.a, b: 'resist_sprawl', result: 'resisted', counter: true }); this.stamina.opponent = Math.max(0, this.stamina.opponent - 25); }
            ev.banner = 'CONTRE !'; ev.cheer = 0.6; this.said = 'Son attaque retournée';
          }
          else { this.resisted('opponent', P.tech!, ev); ev.banner = 'TU TIENS !'; }
          return;
        }
        if (k >= this.holdFrom()) { this.resisted('opponent', P.tech!, ev); ev.banner = 'RÉSISTE !'; this.stamina.opponent -= 8; this.stamina.player = Math.max(0, this.stamina.player - 4); return; }
        // too early: he reads it, waits for it, and goes on through you — no second press in this tell
        P.read = true; P.t = Math.max(P.t, P.dur * 0.55); ev.say = 'Trop tôt';
      }
      if (k >= 1) {
        // nothing held him: your balance (and breath) decides
        const off = Math.hypot(L.player.f, L.player.s), force = 0.45 + 0.03 * lvl + 0.55 * off + 0.15 * (1 - this.stamina.player / 100) + 0.12 * this.rand() - 0.15 * this.grip + (P.read ? 0.2 : 0);
        this.resolve('opponent', P.tech!, force, edgeOf.player, ev);
      }
      return;
    }
    // --- the tug: drives along the pair (+ towards the other)
    const holdK = inp.hold ? 1 : 0.35;
    const myStr = (0.55 + 0.45 * this.stamina.player / 100) * (1 + 0.25 * this.grip);
    const hisStr = (0.6 + 0.07 * lvl) * (0.55 + 0.45 * this.stamina.opponent / 100) * (1 - 0.25 * this.grip);
    const hisRaw = P.act === 'pousse' ? 1 : P.act === 'tire' ? -0.8 : 0.15;
    const myD = clamp(inp.push, -1, 1) * holdK * myStr, hisD = hisRaw * hisStr;
    this.drive.player = myD; this.drive.opponent = hisD;
    // breath: driving with the weight in costs, letting go brings it back
    this.stamina.player = clamp(this.stamina.player + (inp.hold ? -(2.5 + 5 * Math.abs(inp.push)) : 3.5) * dt, 0, 100);
    this.stamina.opponent = clamp(this.stamina.opponent + (P.act === 'souffle' ? 3 : -(2 + 3 * Math.abs(hisRaw))) * dt, 0, 100);
    // the leans: the net push puts the weaker back on his heels; pulling a man who pushes throws him forward into you
    const net = myD - hisD;
    const yieldHim = Math.max(0, hisD) * Math.max(0, -myD), yieldMe = Math.max(0, myD) * Math.max(0, -hisD);
    const hisF = -0.85 * Math.max(0, net) + 2.4 * yieldHim, myF = -0.85 * Math.max(0, -net) + 2.4 * yieldMe;
    const hisS = clamp(inp.turn, -1, 1) * 0.75 * myStr * holdK * (1 - 0.3 * this.stamina.opponent / 100);
    L.opponent.f = ease(L.opponent.f, hisF, 2.6, dt); L.opponent.s = ease(L.opponent.s, hisS, 2.2, dt);
    L.player.f = ease(L.player.f, myF, 2.6, dt); L.player.s = ease(L.player.s, 0, 2.2, dt);
    this.drift = 0.55 * net; this.spin = 0.9 * clamp(inp.turn, -1, 1) * holdK;
    // he feels his own drive used against him and stops it (sooner the better he is); he pulls a man who keeps pushing
    this.usedT = (hisRaw > 0.5 && myD < -0.15) || (hisRaw < -0.5 && myD > 0.15) ? this.usedT + dt : 0;
    this.pushT = myD > 0.25 ? this.pushT + dt : Math.max(0, this.pushT - 2 * dt);
    if (this.usedT > 1.05 - 0.13 * lvl && P.act !== 'souffle') { this.aiPlan = { act: 'souffle', t: 0, dur: 0.8 + 0.6 * this.rand() }; this.usedT = 0; }
    else if (this.pushT > 2.4 - 0.2 * lvl && P.act === 'souffle') { this.aiPlan = { act: 'tire', t: 0, dur: 0.9 }; this.pushT = 0; }
    // the hold slides to the stronger, and to the one standing
    this.grip = clamp(this.grip + (0.18 * net + 0.25 * (Math.hypot(L.opponent.f, L.opponent.s) - Math.hypot(L.player.f, L.player.s))) * dt, -1, 1);
    // the moves his imbalance opens
    const back = Math.max(0, -L.opponent.f), fwd = Math.max(0, L.opponent.f), side = Math.abs(L.opponent.s);
    const spent = 1 - this.stamina.opponent / 100;
    this.open.hanche = clamp(fwd * 1.3 + 0.35 * side, 0, 1);
    this.open.croc = clamp(back * 1.15 + 0.45 * side, 0, 1);
    this.open.pousse = clamp((back * 0.9 + 0.2) * (edgeOf.opponent < 1.5 ? 1.25 : 0.55), 0, 1);
    this.open.souleve = clamp(0.55 * Math.max(0, this.grip) + 0.6 * spent + 0.25 * Math.hypot(L.opponent.f, L.opponent.s), 0, 1);
    let best: TechId | null = null;
    for (const id of TECH_ORDER) if (this.open[id] >= 0.45 && (!best || this.open[id] > this.open[best])) best = id;
    this.lit = best;
    // the player's move
    if (inp.pick) {
      this.tech = inp.pick; this.setup = this.open[inp.pick];
      const w = clamp(0.1 + 0.32 * this.setup, 0.1, 0.42), c = 0.8;
      this.z0 = clamp(c - w / 2, 0.3, 1 - w); this.z1 = this.z0 + w;
      this.enter('projection'); this.needle = 0; return;
    }
    // his rhythm, and his attack when you give him one
    if (P.t > P.dur) {
      const mine = Math.hypot(L.player.f, L.player.s);
      const chance = this.clinchT > 1.5 ? 0.18 + 0.05 * lvl + 0.6 * mine - 0.3 * this.grip + (edgeOf.player < 1.3 ? 0.25 : 0) : 0;
      if (this.rand() < chance) {
        const tech: TechId = edgeOf.player < 1.3 ? 'pousse' : L.player.f > 0.3 ? 'hanche' : L.player.f < -0.3 ? 'croc' : lvl >= 4 && this.stamina.player < 50 ? 'souleve' : this.rand() < 0.5 ? 'hanche' : 'croc';
        this.aiPlan = { act: 'attaque', t: 0, dur: this.tellFor(), tech };
        ev.tell = true; ev.banner = '!';
      } else {
        const r = this.rand(), tired = this.stamina.opponent < 35;
        const act = tired ? 'souffle' : r < 0.45 ? 'pousse' : r < 0.75 ? 'tire' : 'souffle';
        this.aiPlan = { act, t: 0, dur: act === 'pousse' ? 1.1 + 1.1 * this.rand() : act === 'tire' ? 0.7 + 0.7 * this.rand() : 0.9 + 1.2 * this.rand() };
      }
    }
    // the referee parts a long empoignade
    if (this.clinchT > 30) { ev.banner = 'SÉPAREZ !'; ev.say = 'L’arbitre les sépare'; this.backStanding(); }
  }

  // -------------------------------------------------------------------------------------------------- moves
  private resolve(by: Who, tech: TechId, force: number, edge: number, ev: CineEvents) {
    const T = TECHS[tech], def: Who = by === 'player' ? 'opponent' : 'player';
    // a fresh man resists more; a spent one goes over
    const resist = T.need + (by === 'player' ? 0.04 * (this.level - 1) : 0) + 0.34 * (this.stamina[def] / 100) - 0.15;
    this.stamina[by] = Math.max(0, this.stamina[by] - 10);
    if (force >= resist) {
      if (tech === 'pousse') {
        if (edge < 1.6) { this.play({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'out' }); ev.banner = 'DEHORS !'; this.said = 'Poussé hors du cercle'; }
        else { this.play({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'none' }); this.points[by]++; this.said = 'Il recule'; ev.banner = 'IL RECULE'; }
      } else { this.play({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'fall' }); this.said = `${T.label} !`; }
    } else if (force >= resist - 0.22 || by === 'opponent') {
      this.resisted(by, tech, ev);
      ev.banner = by === 'player' ? 'IL RÉSISTE' : 'TU TIENS !'; this.said = by === 'player' ? 'Pas assez préparé' : 'Tu tiens';
    } else {
      // too weak: he turns it round — his attack's tell, short
      this.enter('empoignade'); this.clinchT = 2;
      this.aiPlan = { act: 'attaque', t: 0, dur: Math.max(0.6, this.tellFor() * 0.75), tech: tech === 'souleve' ? 'hanche' : tech };
      ev.banner = 'IL CONTRE !'; ev.tell = true; this.said = 'Il te contre';
    }
  }
  private resisted(by: Who, tech: TechId, ev: CineEvents) {
    const T = TECHS[tech], def: Who = by === 'player' ? 'opponent' : 'player';
    this.play({ kind: 'resist', by, tech, a: T.a, b: 'resist_sprawl', result: 'resisted' });
    this.stamina[def] = Math.max(0, this.stamina[def] - 8);
    void ev;
  }
  private play(s: Omit<Scene, 't' | 'dur' | 'impact'>) {
    const T = s.tech ? TECHS[s.tech] : null;
    const dur = s.kind === 'resist' ? 1.8 : T ? T.dur : 2;
    this.scene = { ...s, t: 0, dur, impact: s.kind === 'resist' ? 0.6 : T ? T.impact : 1 };
    this.enter('scene');
  }
  private backStanding() {
    this.scene = null; this.enter('debout'); this.idle = 0; this.grip = 0;
    this.lean = { player: { f: 0, s: 0 }, opponent: { f: 0, s: 0 } }; this.drift = this.spin = 0;
    this.ai = { act: 'tourne', t: 0, dur: this.circleFor() };
  }
  private sortie(w: Who, ev: CineEvents) {
    this.sorties[w]++; const o: Who = w === 'player' ? 'opponent' : 'player'; this.points[o]++;
    ev.out = w; ev.banner = ev.banner === 'POUSSÉ DEHORS !' ? `DEHORS ${this.sorties[w]}/3` : `SORTIE ${this.sorties[w]}/3`;
    if (this.sorties[w] >= 3) { this.winner = o; this.scene = null; this.enter('fin'); ev.banner = 'DEHORS !'; return; }
    this.backStanding();
  }

  /** At the bell: the one with more points (sorties, pushes), else a draw. */
  decision(): Who | null { return this.points.player > this.points.opponent ? 'player' : this.points.opponent > this.points.player ? 'opponent' : null; }
}
