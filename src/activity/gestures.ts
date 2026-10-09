import type { Gesture, GestureOption } from './types';

/**
 * Gestures of the trades (data). Options are things a Dakar stall, garage or kitchen really has; the asks are short
 * French lines with an everyday Wolof touch where it is certain.
 */
export const TOOLS: GestureOption[] = [
  { id: 'cle', label: 'Clé de 13', icon: '🔧', ask: 'Passe-moi la clé de 13 !' },
  { id: 'tournevis', label: 'Tournevis', icon: '🪛', ask: 'Le tournevis, vite !' },
  { id: 'marteau', label: 'Marteau', icon: '🔨', ask: 'Donne le marteau.' },
  { id: 'cric', label: 'Cric', icon: '🛞', ask: 'Apporte le cric, on lève la voiture.' },
  { id: 'huile', label: 'Bidon d’huile', icon: '🛢️', ask: 'Le bidon d’huile, s’il te plaît.' },
  { id: 'chiffon', label: 'Chiffon', icon: '🧽', ask: 'Un chiffon, j’ai les mains pleines de cambouis.' },
];

export const STALL: GestureOption[] = [
  { id: 'tomates', label: 'Tomates', icon: '🍅', ask: 'Un tas de tomates.' },
  { id: 'oignons', label: 'Oignons', icon: '🧅', ask: 'Un kilo d’oignons.' },
  { id: 'piment', label: 'Piment', icon: '🌶️', ask: 'Un peu de piment.' },
  { id: 'mangues', label: 'Mangues', icon: '🥭', ask: 'Trois mangues bien mûres.' },
  { id: 'arachides', label: 'Arachides', icon: '🥜', ask: 'Un cornet d’arachides.' },
  { id: 'citrons', label: 'Citrons', icon: '🍋', ask: 'Des citrons pour le yassa.' },
  { id: 'poisson', label: 'Poisson séché', icon: '🐟', ask: 'Du poisson séché pour le ceebu jën.' },
];

/** Pick `n` distinct options (seeded by the round, so a shift mixes its asks). */
export function someOf(list: GestureOption[], n: number, seed = Date.now()): GestureOption[] {
  const a = [...list]; let h = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export const G = {
  /** Mechanic's helper: hand the tool Modou asks for. */
  tools: (rounds = 4): Gesture => ({ kind: 'choose', prompt: 'Le mécanicien a besoin d’un outil', who: 'Modou', rounds, options: TOOLS, patience: 6 }),
  /** Tighten the wheel nuts: press when the wrench is in the green. */
  bolts: (rounds = 4): Gesture => ({ kind: 'timing', prompt: 'Serre les écrous au bon moment', verb: 'Serrer', icon: '🔩', rounds, speed: 1, zone: 0.2 }),
  /** Serve customers at a stall: give each the right goods before they leave. */
  stall: (rounds = 5): Gesture => ({ kind: 'choose', prompt: 'Sers les clients', who: 'Cliente', rounds, options: STALL, patience: 6 }),
  /** Pull the net / lift the crates in rhythm with the waves. */
  haul: (rounds = 4): Gesture => ({ kind: 'timing', prompt: 'Tire au rythme des vagues', verb: 'Tirer', icon: '🪢', rounds, speed: 0.9, zone: 0.22 }),
  /** Turn the skewers before they burn. */
  grill: (rounds = 4): Gesture => ({ kind: 'timing', prompt: 'Retourne les brochettes au bon moment', verb: 'Retourner', icon: '🍢', rounds, speed: 1.1, zone: 0.2 }),
  /** Change a wheel in the right order. */
  wheel: (): Gesture => ({ kind: 'sequence', prompt: 'Change la roue dans l’ordre', steps: [
    { id: 'cric', label: 'Lever avec le cric', icon: '🛞' }, { id: 'devisser', label: 'Dévisser les écrous', icon: '🔧' },
    { id: 'roue', label: 'Poser la roue de secours', icon: '⭕' }, { id: 'visser', label: 'Revisser', icon: '🔩' }, { id: 'baisser', label: 'Baisser la voiture', icon: '⬇️' },
  ] }),
};
