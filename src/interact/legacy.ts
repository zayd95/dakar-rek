import type { Action, Interactable } from '../world/types';
import type { Affordance, Target, TargetKind, TargetSource, Verb } from './types';

/**
 * Adapter that turns the existing content (Interactable + Action from world/content.ts, cityContent.ts, interiors,
 * the economy and the cast) into targets, so all of it keeps working inside the contextual system while modules move to
 * native targets. The primary verb keeps the old behaviour of the action button (`run`); each visible action is also
 * offered on its own in the context sheet (`runAction`).
 */
export interface LegacyHooks {
  /** Interactables of the current space. */
  list(space: string): readonly Interactable[];
  /** What the old action button did for this interactable (travel menu, exit, actions menu, story beat…). */
  run(it: Interactable): void;
  /** Runs one action of the interactable directly. */
  runAction(it: Interactable, a: Action): void;
  /** Label of the primary verb for a person (e.g. a story beat is waiting). */
  talkLabel?(it: Interactable): string | null;
  canAfford(cost: number): boolean;
  visible(a: Action): boolean;
  requires(a: Action): string | null;
}

const SPECIAL_VERB: Partial<Record<NonNullable<Action['special']>, [Verb, string, string]>> = {
  enter: ['enter', 'Entrer', '🚪'], exit: ['exit', 'Sortir', '🚪'], jobs: ['work', 'Livraisons', '🛵'], shop: ['buy', 'Acheter', '🛒'],
  combat: ['use', 'Combattre', '🤼'], combat_classe: ['use', 'Combat classé', '🤼'], combat_entrainement: ['use', 'S’entraîner', '🤼'],
  training: ['use', 'S’entraîner', '💪'], entrance: ['use', 'Faire son entrée', '🥁'], prep: ['use', 'Se préparer', '🧴'],
  watch: ['use', 'Regarder', '👀'], outfit: ['use', 'Tenue', '👕'], emote: ['dance', 'Danser', '💃'],
};

export function actionVerb(a: Action): [Verb, string] {
  if (a.special && SPECIAL_VERB[a.special]) { const [v, , icon] = SPECIAL_VERB[a.special]!; return [v, icon]; }
  if (a.gain) return ['work', '💼'];
  if (a.needs?.faim && a.needs.faim > 0) return ['eat', '🍽️'];
  if (a.cost) return ['buy', '🛒'];
  return ['use', '✋'];
}

function kindOf(it: Interactable): TargetKind {
  if (it.npc) return 'person';
  if (it.kind === 'travel') return 'vehicle';
  if (it.actions.length === 1 && (it.actions[0].special === 'enter' || it.actions[0].special === 'exit')) return 'door';
  return 'place';
}

export class LegacySource implements TargetSource {
  readonly name = 'legacy';
  constructor(private h: LegacyHooks) {}

  collect(space: string, x: number, z: number, out: Target[]) {
    for (const it of this.h.list(space)) {
      if (Math.hypot(it.x - x, it.z - z) > it.radius) continue;
      out.push(this.target(it, space));
    }
  }

  target(it: Interactable, space: string): Target {
    const kind = kindOf(it);
    return {
      id: it.id, name: it.name, kind, space, x: it.x, z: it.z, radius: it.radius, y: kind === 'person' ? 2.15 : 2.4,
      affordances: () => {
        const own = it.actions.filter(a => this.h.visible(a)).map((a): Affordance => {
          const [verb, icon] = actionVerb(a);
          const why = this.h.requires(a) ?? (a.cost && !this.h.canAfford(a.cost) ? 'Pas assez d’argent' : null);
          return { id: a.id, verb, icon, label: a.label, detail: a.detail, cost: a.cost, gain: a.gain, disabled: why, run: () => this.h.runAction(it, a) };
        });
        const primary = this.primary(it, kind, own);
        return primary ? [primary, ...own.filter(a => a !== primary)] : own;
      },
    };
  }

  /** The main button: same behaviour as before the contextual system, with a verb label. */
  private primary(it: Interactable, kind: TargetKind, own: Affordance[]): Affordance | null {
    const run = () => this.h.run(it);
    if (kind === 'vehicle') return { id: 'travel', verb: 'travel', label: 'Voyager', icon: '🚐', run };
    if (kind === 'door') return own[0] ?? null;
    if (kind === 'person') return { id: 'talk', verb: 'talk', label: this.h.talkLabel?.(it) ?? 'Parler', icon: '💬', run };
    return { id: 'open', verb: 'open', label: it.name, icon: '👋', run };   // the place's own sheet (description, prices)
  }
}
