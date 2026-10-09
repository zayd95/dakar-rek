import type * as THREE from 'three';
import type { Humanoid } from '../actors/humanoid';
import type { ActivityRunner } from '../activity/runner';
import { greet, talk } from '../activity/primitives';
import type { Target, TargetSource } from './types';

/** An ambient person of the street (placed by a builder or walking the pavements). `space`: 'street' by default. */
export interface Body { id: string; obj: THREE.Object3D; h: Humanoid | null; female?: boolean; seated?: boolean; space?: string }

const NAMES_F = ['Awa', 'Fatou', 'Aminata', 'Mariama', 'Khady', 'Aïssatou', 'Ndeye', 'Coumba', 'Astou', 'Bineta', 'Dieynaba', 'Rokhaya'];
const NAMES_M = ['Modou', 'Moussa', 'Ibrahima', 'Cheikh', 'Abdou', 'Ousmane', 'Babacar', 'Lamine', 'Pape', 'Alioune', 'Serigne', 'Mbaye'];
const REACH = 2.4;

/** Stable first name for a body id (the same passer-by keeps their name during the visit). */
export function nameFor(id: string, female: boolean) {
  let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const list = female ? NAMES_F : NAMES_M; return list[(h >>> 0) % list.length];
}

/**
 * Everyone in the street can be greeted: « Saluer » (Salaam aleekum / Maleekum salaam) and « Demander son nom ».
 * Uses the same greet / talk primitives as the recurring cast; the person turns to the player and answers.
 */
export class People implements TargetSource {
  readonly name = 'people';
  private met = new Map<string, string>();
  private more: (() => readonly Body[])[] = [];
  constructor(private bodies: () => Body[], private runner: ActivityRunner, private say: (line: string) => void, private player: () => { x: number; z: number }) {}

  /** Another provider of bodies (a module's ambient people, passengers…): they can be greeted the same way. */
  addBodies(list: () => readonly Body[]) { this.more.push(list); }

  /** Forget who was met (hub change). */
  clear() { this.met.clear(); }

  collect(space: string, x: number, z: number, out: Target[]) {
    if (space === 'street') this.collectFrom(this.bodies(), space, x, z, out);
    for (const list of this.more) this.collectFrom(list(), space, x, z, out);
  }

  private collectFrom(bodies: readonly Body[], space: string, x: number, z: number, out: Target[]) {
    for (const b of bodies) {
      const p = b.obj.position;
      if ((b.space ?? 'street') !== space || !b.obj.visible || Math.abs(p.x - x) > REACH || Math.abs(p.z - z) > REACH) continue;
      const known = this.met.get(b.id);
      out.push({
        id: 'person:' + b.id, name: known ?? (b.female ? 'Passante' : 'Passant'), kind: 'person', space, x: p.x, z: p.z,
        y: b.seated ? 1.6 : 2.15, radius: REACH, bias: 0.3,
        affordances: () => [
          greet({ id: 'saluer', label: 'Saluer', then: () => { this.face(b); this.say(`Toi : « Salaam aleekum ! » · ${known ?? 'Réponse'} : « Maleekum salaam ! »`); } }),
          talk({ id: 'nom', label: known ? `Parler avec ${known}` : 'Demander son nom', then: () => {
            const name = nameFor(b.id, !!b.female); this.met.set(b.id, name); this.face(b);
            this.say(known ? `${name} : « Na nga def ? » · Toi : « Maa ngi fi rekk. »` : `Toi : « Naka nga tudd ? » · « Maa ngi tudd ${name}. »`);
          } }),
        ].map(spec => ({ id: spec.id, verb: spec.primitive, label: spec.label, icon: spec.icon, disabled: this.runner.blocked(spec), run: () => { this.runner.start(spec); } })),
      });
    }
  }

  private face(b: Body) {
    const me = this.player(), p = b.obj.position;
    if (!b.seated) b.obj.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
    const h = b.h; if (!h || b.seated) return;
    const before = h.hold; h.hold = 'Talk';
    setTimeout(() => { if (h.hold === 'Talk') h.hold = before; }, 2600);
  }
}
