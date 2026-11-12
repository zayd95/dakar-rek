/**
 * Làmb 2.0 — Coach Ablaye's lesson avec frappe at the écurie (docs/LAMB2.md « La leçon »), behind ?lamb2. Pure data and
 * a small state machine, tested in tests/lamb2.test.ts; src/lamb/duel.ts feeds it the bout's events and sets each step
 * up (the partner's scripted part, a grip or a balance to feel).
 *
 * One step at a time, each finished by doing it — never by waiting: distance → quick strike → big strike (and its
 * opening) → guard → grab into the empoignade → read and answer (Pousser / Tirer / Pivoter) → feel the slip → break free
 * → throw → counter. Every step can be skipped (« Passer »). Coach lines are short: a Wolof phrase of the game's lexicon
 * with its gloss, then the French instruction. No reward beyond the training's usual effect (lamb_skill +1).
 */
import { utter } from '../i18n/lines';

export type LessonStep = 'distance' | 'quick' | 'big' | 'guard' | 'grab' | 'moves' | 'slip' | 'break' | 'throw' | 'counter' | 'done';
export const LESSON_STEPS: readonly LessonStep[] = ['distance', 'quick', 'big', 'guard', 'grab', 'moves', 'slip', 'break', 'throw', 'counter', 'done'];

/** The duel's touch buttons a step uses (highlighted on phones), 'joy' for the joystick. */
export type TeachKey = 'joy' | 'quick' | 'big' | 'guard' | 'grab' | 'break';

export interface LessonDef {
  /** What to do, in a few words. */
  title: string;
  /** Keys on a keyboard. */
  keys: string;
  /** Touch buttons to highlight. */
  touch: TeachKey[];
  /** Coach Ablaye's word: lexicon phrases only (their gloss is shown), then the French. */
  wolof: string[];
  fr: string;
  /** Where the step happens: standing or in the empoignade (the duel sets it up when skipping into it). */
  in: 'fight' | 'clinch';
}

export const LESSON: Record<Exclude<LessonStep, 'done'>, LessonDef> = {
  distance: { title: 'Approche-toi à distance de frappe', keys: 'ZQSD/WASD/flèches', touch: ['joy'], wolof: ['Kaay fi !'], fr: 'Avance jusqu’à Babacar, à un bras de lui.', in: 'fight' },
  quick: { title: 'Frappe rapide', keys: 'J', touch: ['quick'], wolof: ['Gaawal !'], fr: 'Une frappe rapide : sûre, elle prend un peu d’équilibre.', in: 'fight' },
  big: { title: 'Grosse frappe', keys: 'K', touch: ['big'], wolof: ['Ndank ndank.'], fr: 'La grosse frappe prend beaucoup d’équilibre ; ratée ou parée, elle t’ouvre.', in: 'fight' },
  guard: { title: 'Garde-toi de sa grosse frappe', keys: 'G maintenue', touch: ['guard'], wolof: ['Bul tiit !'], fr: 'Il arme une grosse frappe : garde-toi au bon moment.', in: 'fight' },
  grab: { title: 'Saisis-le : l’empoignade', keys: 'E/Espace', touch: ['grab'], wolof: ['jàpp'], fr: 'Tout près, Saisir : la garde arrête les frappes, pas une saisie.', in: 'fight' },
  moves: { title: 'Lis son corps et réponds', keys: 'E pousser · G tirer · J pivoter', touch: ['grab', 'guard', 'quick'], wolof: ['Xaaral tuuti.'], fr: 'Penché en avant il pousse : tire. Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter.', in: 'clinch' },
  slip: { title: 'Sens la glissade', keys: '—', touch: [], wolof: ['Bul tiit !'], fr: 'Sa prise est forte : ton équilibre s’use, le bord de l’écran prévient.', in: 'clinch' },
  break: { title: 'Casse et dégage-toi', keys: 'X', touch: ['break'], wolof: ['Gaawal !'], fr: 'Tu as repris un peu de prise : Casser, avant de tomber.', in: 'clinch' },
  throw: { title: 'Il glisse : projette-le', keys: 'K', touch: ['big'], wolof: ['Benn, ñaar, ñett !'], fr: 'Son équilibre est bas et tu tiens la prise : Projeter.', in: 'clinch' },
  counter: { title: 'Il tente sa projection : contre !', keys: 'K', touch: ['big'], wolof: ['Waaw kay !'], fr: 'Le bouton devient vert : Contrer pendant qu’il arme.', in: 'clinch' },
};

/** What happened in the bout, as the lesson hears it. */
export type LessonEvent =
  | { k: 'tick'; dist: number }
  | { k: 'strike'; by: 'player' | 'opponent'; kind: 'quick' | 'big'; result: 'hit' | 'stagger' | 'guarded' | 'miss' }
  | { k: 'clinch'; by: 'player' | 'opponent' }
  | { k: 'exchange'; winner: 'player' | 'opponent' | null; result: string }
  | { k: 'posture'; player: 'stable' | 'glisse' | 'chute' }
  | { k: 'break'; by: 'player' | 'opponent' }
  | { k: 'throw'; by: 'player' | 'opponent'; result: string };

/** Does this event finish the step? Only doing the step finishes it. */
export function stepDone(step: LessonStep, e: LessonEvent): boolean {
  switch (step) {
    case 'distance': return e.k === 'tick' && e.dist <= 1.75;
    case 'quick': return e.k === 'strike' && e.by === 'player' && e.kind === 'quick' && e.result !== 'miss';
    case 'big': return e.k === 'strike' && e.by === 'player' && e.kind === 'big';
    case 'guard': return e.k === 'strike' && e.by === 'opponent' && e.result === 'guarded';
    case 'grab': return e.k === 'clinch' && e.by === 'player';
    case 'moves': return e.k === 'exchange' && e.winner === 'player' && e.result === 'counter';
    case 'slip': return e.k === 'posture' && e.player !== 'stable';
    case 'break': return e.k === 'break' && e.by === 'player';
    case 'throw': return e.k === 'throw' && e.by === 'player' && e.result === 'fall';
    case 'counter': return e.k === 'throw' && e.by === 'opponent' && (e.result === 'countered' || e.result === 'blocked');
    default: return false;
  }
}
/** The step after `s` (`done` stays done). */
export const nextStep = (s: LessonStep): LessonStep => LESSON_STEPS[Math.min(LESSON_STEPS.length - 1, LESSON_STEPS.indexOf(s) + 1)];
/** 1-based number of a step, and how many there are (for « 3/10 »). */
export const stepNumber = (s: LessonStep) => ({ n: Math.min(LESSON_STEPS.indexOf(s) + 1, LESSON_STEPS.length - 1), of: LESSON_STEPS.length - 1 });

/** Coach Ablaye's line for a step: « Kaay fi ! » (viens ici) · then the French. */
export function coachLine(s: LessonStep): string {
  if (s === 'done') return `Coach Ablaye : ${utter(['Baax na !'])} C’est la base de la lutte avec frappe.`;
  const d = LESSON[s];
  return `Coach Ablaye : ${utter(d.wolof)} ${d.fr}`;
}
/** A word on what just happened inside a step that is not finished yet (null: nothing to add). */
export function feedback(s: LessonStep, e: LessonEvent): string | null {
  if (s === 'big' && e.k === 'strike' && e.by === 'player' && e.kind === 'big')
    return e.result === 'miss' ? 'Raté : tu vois, tu es ouvert — c’est le prix de la grosse frappe.' : e.result === 'guarded' ? 'Parée : même parée, elle t’ouvre un peu.' : 'Elle fait mal : regarde son équilibre.';
  if (s === 'quick' && e.k === 'strike' && e.by === 'player' && e.result === 'miss') return 'Trop loin : avance d’un pas.';
  if (s === 'guard' && e.k === 'strike' && e.by === 'opponent' && e.result !== 'guarded') return 'Trop tard : garde-toi dès qu’il arme.';
  if (s === 'moves' && e.k === 'exchange' && e.winner !== 'player') return 'Regarde-le : penché en avant, il pousse — tire à ce moment-là.';
  if (s === 'throw' && e.k === 'throw' && e.by === 'player' && e.result !== 'fall') return 'Pas encore : fais-le glisser d’abord, puis projette.';
  if (s === 'counter' && e.k === 'throw' && e.by === 'opponent' && e.result === 'fall') return 'Trop tard : contre pendant qu’il arme.';
  return null;
}

/** A lesson in progress: its step, and how the step started (the duel sets each step up once). */
export interface Lesson { step: LessonStep; ready: boolean; done: boolean; skipped: number }
export const startLesson = (): Lesson => ({ step: 'distance', ready: false, done: false, skipped: 0 });
/** Feeds an event: returns true when it finished the step (the lesson moves on). */
export function hear(l: Lesson, e: LessonEvent): boolean {
  if (l.done || !stepDone(l.step, e)) return false;
  advance(l);
  return true;
}
/** Moves to the next step (finished or skipped). */
export function advance(l: Lesson, skipped = false) {
  if (l.done) return;
  l.step = nextStep(l.step); l.ready = false;
  if (skipped) l.skipped++;
  if (l.step === 'done') l.done = true;
}
