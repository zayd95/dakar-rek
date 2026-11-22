import type { ClipId } from './combatClips';

/**
 * The cinematic bout (« bëre »): the wrestling told as a broadcast, played with the thumb. No free-form fighting moves: the
 * player decides and times, the bout shows it in staged shots with paired animations (each move's attacker and receiver are
 * two Meshy clips of the same length, played on one clock, the bodies placed facing each other).
 *
 * 1. **Debout** (neutral): both stand tall and circle; the stick walks the pit (out of it: « Sortie », three loses).
 *    « Saisir » in reach starts the empoignade; he also comes in by himself. Both at once: hands locked (« Mains liées »).
 * 2. **Empoignade** (grip): a needle sweeps a bar; « Force » with the needle in the lit zone wins a beat, a miss gives
 *    him one, and he takes one by himself on a sweep you let pass. First to three: you get the opening, or he attacks.
 * 3. **Ouverture** (open): choose the move — Soulevé, Hanche, Croc, Pousser — within a short time.
 * 4. **Projection** (attack): the needle rises once; « Projeter » at its peak is the force. Against his resistance: a clean
 *    throw (on his back: the bout is won; pushed out: a sortie), he resists (both spent, back to standing), or he counters.
 * 5. **Défense** (defend): he attacks; « Résiste » with the needle in the zone holds him off, else you are thrown.
 *
 * Pure state: src/lamb/duel.ts feeds it time and presses, poses the bodies from `scene` and frames the shots.
 */
export type CinePhase = 'debout' | 'empoignade' | 'ouverture' | 'projection' | 'defense' | 'scene' | 'fin';
export type TechId = 'souleve' | 'hanche' | 'croc' | 'pousse';
export type Who = 'player' | 'opponent';

export interface Tech {
  id: TechId; label: string;
  /** The attacker's and the receiver's clips (one clock), the scene's length, how far apart they stand at its start (m). */
  a: ClipId; b: ClipId; dur: number; gap: number;
  /** The force it takes (0…1) against an even, fresh opponent; the moment (s) the receiver hits the sand. */
  need: number; impact: number;
}
export const TECHS: Record<TechId, Tech> = {
  souleve: { id: 'souleve', label: 'Soulevé', a: 'lift_slam_a', b: 'lift_slam_b', dur: 3.9, gap: 0.62, need: 0.62, impact: 2.3 },
  hanche: { id: 'hanche', label: 'Hanche', a: 'hip_throw', b: 'hip_b', dur: 2.95, gap: 0.55, need: 0.52, impact: 1.7 },
  croc: { id: 'croc', label: 'Croc', a: 'trip_a', b: 'trip_b', dur: 2.95, gap: 0.6, need: 0.42, impact: 1.5 },
  pousse: { id: 'pousse', label: 'Pousser', a: 'push_a', b: 'push_b', dur: 2.95, gap: 0.7, need: 0.3, impact: 1.2 },
};
export const TECH_ORDER: TechId[] = ['souleve', 'hanche', 'croc', 'pousse'];

/** A scene: what plays now, for how long, and what it leads to. */
export interface Scene {
  kind: 'throw' | 'resist' | 'locked';
  by: Who; tech: TechId | null; t: number; dur: number;
  /** The clip each body plays (attacker, receiver), the receiver's state at the end. */
  a: ClipId; b: ClipId;
  result: 'fall' | 'out' | 'resisted' | 'none';
  impact: number;
}

export interface CineEvents { banner?: string; fall?: Who; out?: Who; shake?: number; cheer?: number }

export interface CineOpts { level: number; seed?: number; }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class CineBout {
  phase: CinePhase = 'debout';
  /** Time in the phase (s). */
  t = 0;
  /** The empoignade's beats (first to `BEATS`). */
  mine = 0; his = 0;
  /** The needle (0…1) and the lit zone [z0, z1] of the bar; the needle's sweep direction. */
  needle = 0; z0 = 0.4; z1 = 0.6; private dir = 1; private sweeps = 0; private hitThisSweep = false;
  /** Endurance (0…100) of each: spent by every exchange, it narrows the zone and weakens the force. */
  stamina = { player: 100, opponent: 100 };
  /** Points (sorties, exchanges won), for a decision at the bell. */
  points = { player: 0, opponent: 0 };
  sorties = { player: 0, opponent: 0 };
  tech: TechId | null = null;
  scene: Scene | null = null;
  /** The last force (0…1) and the outcome's words, for the HUD and the checks. */
  force = 0; said = '';
  winner: Who | null = null;
  private seed: number;
  /** When he comes in by himself (s into the standing phase). */
  aiComeT: number;
  private level: number;

  static readonly BEATS = 3;

  constructor(o: CineOpts) {
    this.level = clamp(o.level, 1, 6); this.seed = (o.seed ?? 7) >>> 0;
    this.aiComeT = 2.5 + 2 * this.rand();
  }
  private rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** How wide the lit zone is now: narrower against a stronger, fresher opponent and as the player tires. */
  zoneWidth(): number {
    const tired = 1 - this.stamina.player / 100, his = this.stamina.opponent / 100;
    return clamp(0.34 - 0.035 * (this.level - 1) - 0.1 * tired + 0.05 * (1 - his), 0.1, 0.38);
  }
  /** The needle's speed (sweeps of the bar per second). */
  speed(): number { return 0.75 + 0.1 * (this.level - 1); }
  private newZone() {
    const w = this.zoneWidth(), c = 0.2 + 0.6 * this.rand();
    this.z0 = clamp(c - w / 2, 0.02, 0.98 - w); this.z1 = this.z0 + w;
  }
  private enter(p: CinePhase) { this.phase = p; this.t = 0; this.needle = 0; this.dir = 1; this.sweeps = 0; this.hitThisSweep = false; if (p === 'empoignade' || p === 'defense') this.newZone(); }
  get inZone() { return this.needle >= this.z0 && this.needle <= this.z1; }

  /**
   * One step. `press` is the action button pressed this step (Saisir / Force / Projeter / Résiste), `pick` a move chosen
   * at the opening, `apart` the distance between them standing, `edge` how far each is from leaving the pit (m, negative: out).
   */
  step(dt: number, press: boolean, pick: TechId | null, apart: number, edgeOf: Record<Who, number>): CineEvents {
    const ev: CineEvents = {};
    this.t += dt;
    switch (this.phase) {
      case 'debout': {
        for (const w of ['player', 'opponent'] as const) if (edgeOf[w] < 0) { this.sortie(w, ev); return ev; }
        // in reach, « Saisir »: the empoignade; at the moment he was coming in too, hands locked
        if (press && apart < 1.6) { const locked = Math.abs(this.aiComeT - this.t) < 0.5; this.enter('empoignade'); this.mine = this.his = 0; ev.banner = locked ? 'MAINS LIÉES' : 'EMPOIGNADE'; }
        else if (this.t > this.aiComeT && apart < 2.2) {
          const together = press;
          this.enter('empoignade'); this.mine = this.his = 0; ev.banner = together ? 'MAINS LIÉES' : 'IL TE SAISIT';
        }
        break;
      }
      case 'empoignade': {
        this.sweepNeedle(dt);
        if (press) {
          if (this.inZone) { this.mine++; this.stamina.opponent -= 4; ev.shake = 0.15; } else { this.his++; this.stamina.player -= 5; }
          this.hitThisSweep = true; this.newZone();
        }
        if (this.mine >= CineBout.BEATS) { this.enter('ouverture'); ev.banner = 'OUVERTURE !'; }
        else if (this.his >= CineBout.BEATS) { this.aiAttack(ev); }
        break;
      }
      case 'ouverture': {
        if (pick) { this.tech = pick; this.enter('projection'); }
        else if (this.t > 2.2) { this.his = CineBout.BEATS; this.aiAttack(ev); ev.banner = 'TROP TARD'; }
        break;
      }
      case 'projection': {
        // the needle rises once and falls back: the press is the force
        const k = this.t / 1.1; this.needle = k <= 1 ? k : Math.max(0, 2 - k);
        if (press || k >= 2) {
          const f = press ? this.needle : 0;
          this.force = clamp(f * (0.7 + 0.3 * this.stamina.player / 100), 0, 1);
          this.resolveAttack('player', this.tech!, this.force, edgeOf.opponent, ev);
        }
        break;
      }
      case 'defense': {
        this.sweepNeedle(dt);
        if (press || this.sweeps >= 2) {
          const held = press && this.inZone;
          const tech = this.tech!;
          if (held) { this.playScene({ kind: 'resist', by: 'opponent', tech, a: TECHS[tech].a, b: 'resist_sprawl', result: 'resisted' }); this.stamina.opponent -= 12; ev.banner = 'RÉSISTE !'; this.said = 'Tu tiens bon'; }
          else this.resolveAttack('opponent', tech, 0.55 + 0.08 * this.level + 0.2 * this.rand(), edgeOf.player, ev, true);
        }
        break;
      }
      case 'scene': {
        const s = this.scene!;
        if (s.t < s.impact && s.t + dt >= s.impact) {
          if (s.result === 'fall') { ev.fall = s.by === 'player' ? 'opponent' : 'player'; ev.shake = 0.6; ev.cheer = 1; }
          if (s.result === 'out') { ev.shake = 0.3; ev.cheer = 0.6; }
          if (s.result === 'resisted') { ev.shake = 0.25; }
        }
        s.t += dt;
        if (s.t >= s.dur) {
          if (s.result === 'fall') { this.winner = s.by; this.enter('fin'); }
          else if (s.result === 'out') { this.sortie(s.by === 'player' ? 'opponent' : 'player', ev); }
          else { this.scene = null; this.enter('debout'); this.aiComeT = 2 + 2.5 * this.rand(); }
        }
        break;
      }
      case 'fin': break;
    }
    return ev;
  }

  private sweepNeedle(dt: number) {
    this.needle += this.dir * this.speed() * dt;
    if (this.needle >= 1 || this.needle <= 0) {
      this.needle = clamp(this.needle, 0, 1); this.dir *= -1; this.sweeps++;
      // a sweep let pass in the empoignade: he takes the beat (more often the stronger he is)
      if (this.phase === 'empoignade' && !this.hitThisSweep && this.rand() < 0.35 + 0.08 * this.level) { this.his++; this.stamina.player -= 3; this.newZone(); }
      this.hitThisSweep = false;
    }
  }

  /** He wins the empoignade (or the player was too slow): he picks a move — pushing out near the edge, else by level. */
  private aiAttack(ev: CineEvents) {
    const r = this.rand();
    this.tech = this.level >= 4 && r < 0.4 ? 'souleve' : r < 0.55 ? 'hanche' : r < 0.85 ? 'croc' : 'pousse';
    this.enter('defense'); ev.banner = ev.banner ?? 'IL ATTAQUE !';
  }

  private resolveAttack(by: Who, tech: TechId, force: number, edge: number, ev: CineEvents, aiSide = false) {
    const T = TECHS[tech], def: Who = by === 'player' ? 'opponent' : 'player';
    const resist = T.need + (by === 'player' ? 0.03 * (this.level - 1) : 0) - 0.15 * (1 - this.stamina[def] / 100);
    this.stamina[by] -= 10;
    if (force >= resist) {
      // a push near the edge puts him out; any other clean move puts him on his back
      if (tech === 'pousse') {
        if (edge < 1.6) { this.playScene({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'out' }); ev.banner = 'DEHORS !'; this.said = 'Poussé hors du cercle'; }
        else { this.playScene({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'none' }); this.points[by]++; this.said = 'Il recule'; }
      } else { this.playScene({ kind: 'throw', by, tech, a: T.a, b: T.b, result: 'fall' }); this.said = `${T.label} !`; }
    } else if (force >= resist - 0.25 || aiSide) {
      this.playScene({ kind: 'resist', by, tech, a: T.a, b: 'resist_sprawl', result: 'resisted' });
      this.stamina[def] -= 8; ev.banner = by === 'player' ? 'IL RÉSISTE' : 'RÉSISTE !'; this.said = by === 'player' ? 'Pas assez fort' : 'Tu tiens';
    } else {
      // too weak: he turns it round
      this.tech = tech; this.enter('defense'); ev.banner = 'CONTRE !'; this.said = 'Il te contre';
    }
  }

  private playScene(s: Omit<Scene, 't' | 'dur' | 'impact'>) {
    const T = s.tech ? TECHS[s.tech] : null;
    const dur = s.kind === 'resist' ? 1.8 : T ? T.dur : 2;
    this.scene = { ...s, t: 0, dur, impact: s.kind === 'resist' ? 0.6 : T ? T.impact : 1 };
    this.enter('scene');
  }

  private sortie(w: Who, ev: CineEvents) {
    this.sorties[w]++; const o: Who = w === 'player' ? 'opponent' : 'player'; this.points[o]++;
    ev.out = w; ev.banner = `SORTIE ${this.sorties[w]}/3`;
    if (this.sorties[w] >= 3) { this.winner = o; this.scene = null; this.enter('fin'); ev.banner = 'DEHORS !'; return; }
    this.scene = null; this.enter('debout'); this.aiComeT = 2 + 2 * this.rand();
  }

  /** At the bell: the one with more points (sorties, pushes), else a draw. */
  decision(): Who | null { return this.points.player > this.points.opponent ? 'player' : this.points.opponent > this.points.player ? 'opponent' : null; }
}
