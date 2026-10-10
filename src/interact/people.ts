import type * as THREE from 'three';
import type { Humanoid } from '../actors/humanoid';
import type { ActivityRunner } from '../activity/runner';
import { greet, talk } from '../activity/primitives';
import { cityHour, farewellLines, greetLines, nameLines, smallTalkLines } from '../i18n/lines';
import type { Target, TargetSource } from './types';

/**
 * An ambient person of the street (placed by a builder or walking the pavements). `space`: 'street' by default;
 * `bias`: metres added when ranking the focus (default 0.3; background crowds use more so they never hide a counter or the cast).
 */
export interface Body { id: string; obj: THREE.Object3D; h: Humanoid | null; female?: boolean; seated?: boolean; space?: string; bias?: number }

const NAMES_F = ['Awa', 'Fatou', 'Aminata', 'Mariama', 'Khady', 'Aïssatou', 'Ndeye', 'Coumba', 'Astou', 'Bineta', 'Dieynaba', 'Rokhaya'];
const NAMES_M = ['Modou', 'Moussa', 'Ibrahima', 'Cheikh', 'Abdou', 'Ousmane', 'Babacar', 'Lamine', 'Pape', 'Alioune', 'Serigne', 'Mbaye'];
/** First names the street can give (exported for the language tests: names are not Wolof spelling). */
export const STREET_NAMES: readonly string[] = [...NAMES_F, ...NAMES_M];
const REACH = 2.4;
/** Pause between two lines of the same exchange (the toast stays 2.6 s). */
export const LINE_GAP_MS = 2600;

/** Stable first name for a body id (the same passer-by keeps their name during the visit). */
export function nameFor(id: string, female: boolean) {
  let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const list = female ? NAMES_F : NAMES_M; return list[(h >>> 0) % list.length];
}

/**
 * Everyone in the street can be greeted, in Wolof, by the hour (src/i18n/lines.ts): « Saluer » (Salaam aleekum /
 * Maleekum salaam, then « Na nga fanaane ? » in the morning, « Na nga def ? » in the afternoon, « Na nga yendoo ? » in
 * the evening — each person answers their own way), « Demander son nom » (Naka nga tudd ?), then « Parler avec Awa »
 * (small talk) and « Dire au revoir » (Ba beneen yoon / Fanaanal ak jàmm). Uses the same greet / talk primitives as
 * the recurring cast; the person turns to the player and answers.
 */
export class People implements TargetSource {
  readonly name = 'people';
  private met = new Map<string, string>();
  private more: (() => readonly Body[])[] = [];
  private greeted = new Set<string>();
  private talks = new Map<string, number>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(private bodies: () => Body[], private runner: ActivityRunner, private say: (line: string) => void, private player: () => { x: number; z: number },
    private hour: () => number = cityHour) {}

  /** Another provider of bodies (a module's ambient people, passengers…): they can be greeted the same way. */
  addBodies(list: () => readonly Body[]) { this.more.push(list); }

  /** Forget who was met (hub change). */
  clear() { this.met.clear(); this.greeted.clear(); this.talks.clear(); this.hush(); }

  collect(space: string, x: number, z: number, out: Target[]) {
    if (space === 'street') this.collectFrom(this.bodies(), space, x, z, out);
    for (const list of this.more) this.collectFrom(list(), space, x, z, out);
  }

  private collectFrom(bodies: readonly Body[], space: string, x: number, z: number, out: Target[]) {
    for (const b of bodies) {
      const p = b.obj.position;
      if ((b.space ?? 'street') !== space || !b.obj.visible || Math.abs(p.x - x) > REACH || Math.abs(p.z - z) > REACH) continue;
      const known = this.met.get(b.id), who = known ?? (b.female ? 'Passante' : 'Passant');
      out.push({
        id: 'person:' + b.id, name: who, kind: 'person', space, x: p.x, z: p.z,
        y: b.seated ? 1.6 : 2.15, radius: REACH, bias: b.bias ?? 0.3,
        affordances: () => [
          greet({ id: 'saluer', label: 'Saluer', then: () => {
            this.face(b);
            this.play(greetLines({ name: who, seed: b.id, hour: this.hour(), again: this.greeted.has(b.id) }));
            this.greeted.add(b.id);
          } }),
          talk({ id: 'nom', label: known ? `Parler avec ${known}` : 'Demander son nom', then: () => {
            const name = nameFor(b.id, !!b.female); this.met.set(b.id, name); this.face(b);
            if (!known) { this.play(nameLines({ name, seed: b.id })); return; }
            const n = this.talks.get(b.id) ?? 0; this.talks.set(b.id, n + 1);
            this.play(smallTalkLines({ name, seed: `${b.id}:${n}`, hour: this.hour() }));
          } }),
          ...(this.greeted.has(b.id) || known ? [greet({ id: 'aurevoir', label: 'Dire au revoir', then: () => {
            this.face(b);
            this.play(farewellLines({ name: who, seed: b.id, hour: this.hour() }));
            this.greeted.delete(b.id);
          } })] : []),
        ].map(spec => ({ id: spec.id, verb: spec.primitive, label: spec.label, icon: spec.icon, disabled: this.runner.blocked(spec), run: () => { this.runner.start(spec); } })),
      });
    }
  }

  /** Shows the lines of an exchange one after the other (a new exchange replaces what was still to come). */
  private play(lines: string[]) {
    this.hush();
    lines.forEach((line, k) => { if (k === 0) this.say(line); else this.timers.push(setTimeout(() => this.say(line), k * LINE_GAP_MS)); });
  }
  private hush() { for (const t of this.timers) clearTimeout(t); this.timers = []; }

  private face(b: Body) {
    const me = this.player(), p = b.obj.position;
    if (!b.seated) b.obj.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
    const h = b.h; if (!h || b.seated) return;
    const before = h.hold; h.hold = 'Talk';
    setTimeout(() => { if (h.hold === 'Talk') h.hold = before; }, 2600);
  }
}
