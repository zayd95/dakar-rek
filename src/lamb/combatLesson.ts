/**
 * Coach Ablaye's lesson for the new bout (docs/wrestling/COMBAT.md « La leçon »), in both disciplines (the strike steps
 * avec frappe only). Pure data and a small state machine, like Làmb 2.0's (src/lamb/lesson.ts, kept for the switch off);
 * src/lamb/duel.ts sets each step up and tells it what the player did. Every step is finished by doing it, never by
 * waiting; « Passer » skips it. Coach lines: a phrase of the game's lexicon with its gloss, then the French.
 */
import { utter } from '../i18n/lines';
import type { TeachKey } from './lesson';

export type CombatStep = 'distance' | 'quick' | 'big' | 'guard' | 'reach' | 'moves' | 'deeper' | 'unbalance' | 'throw' | 'brace' | 'break' | 'done';
const ALL: readonly CombatStep[] = ['distance', 'quick', 'big', 'guard', 'reach', 'moves', 'deeper', 'unbalance', 'throw', 'brace', 'break', 'done'];
const STRIKES: readonly CombatStep[] = ['quick', 'big', 'guard'];
/** The steps of the lesson in this discipline (the strikes avec frappe only). */
export const combatSteps = (frappe: boolean): CombatStep[] => ALL.filter(s => frappe || !STRIKES.includes(s));

export interface CombatStepDef { title: string; keys: string; touch: TeachKey[]; wolof: string[]; fr: string; in: 'fight' | 'clinch' }
export const COMBAT_LESSON: Record<Exclude<CombatStep, 'done'>, CombatStepDef> = {
  distance: { title: 'Approche-toi, en garde basse', keys: 'ZQSD/WASD/flèches', touch: ['joy'], wolof: ['Kaay fi !'], fr: 'Avance jusqu’à Babacar, à un bras de lui : regarde tes pieds, ils restent au sol.', in: 'fight' },
  quick: { title: 'Frappe rapide', keys: 'J (appui bref)', touch: ['quick'], wolof: ['Gaawal !'], fr: 'Un appui bref sur Frappe : sûre, elle prend un peu d’équilibre.', in: 'fight' },
  big: { title: 'Grosse frappe', keys: 'J maintenu (ou K)', touch: ['quick'], wolof: ['Ndank ndank.'], fr: 'Garde le doigt sur Frappe : la grosse frappe s’arme. Ratée ou parée, elle t’ouvre.', in: 'fight' },
  guard: { title: 'Garde-toi de sa grosse frappe', keys: 'G maintenue', touch: ['guard'], wolof: ['Bul tiit !'], fr: 'Il arme une grosse frappe : lève la garde au bon moment.', in: 'fight' },
  reach: { title: 'Saisis-le', keys: 'E/Espace : bref la nuque, maintenu la ceinture', touch: ['grab'], wolof: ['jàpp'], fr: 'Un appui bref sur Saisir prend sa nuque ; maintenu, tu plonges à la ceinture.', in: 'fight' },
  moves: { title: 'Lis son corps et réponds', keys: 'Flèches : vers lui pousser · loin tirer · de côté pivoter', touch: ['joy'], wolof: ['Xaaral tuuti.'], fr: 'Penché en avant, il pousse : tire, le joystick loin de lui. Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter.', in: 'clinch' },
  deeper: { title: 'Va plus loin : la ceinture', keys: 'G dans l’empoignade', touch: ['guard'], wolof: ['Gaawal !'], fr: 'Le bouton bleu te fait passer de la nuque au bras, puis à la ceinture : plus de contrôle, mais tu t’exposes.', in: 'clinch' },
  unbalance: { title: 'Déséquilibre-le', keys: 'Flèche vers lui, maintenue', touch: ['joy'], wolof: ['Ndank ndank.'], fr: 'Pousse-le en arrière : regarde son dos se cambrer et ses pieds reculer.', in: 'clinch' },
  throw: { title: 'Le bouton dit la projection : vas-y', keys: 'E/Espace (ou K)', touch: ['grab'], wolof: ['Benn, ñaar, ñett !'], fr: 'Il penche en arrière : le gros bouton dit « Croc ». Projette !', in: 'clinch' },
  brace: { title: 'Résiste à sa hanche', keys: 'Flèche loin de lui, ou K pour contrer', touch: ['joy', 'grab'], wolof: ['Waaw kay !'], fr: 'Il tourne la hanche contre toi : penche-toi en arrière, loin de lui, au bon moment — ou Contrer.', in: 'clinch' },
  break: { title: 'Casse et dégage-toi', keys: 'X', touch: ['break'], wolof: ['Gaawal !'], fr: 'Casser pour sortir de l’empoignade quand sa prise ne t’écrase pas.', in: 'clinch' },
};

export type CombatLessonEvent =
  | { k: 'tick'; dist: number }
  | { k: 'strike'; by: 'player' | 'opponent'; kind: 'quick' | 'big'; result: string }
  | { k: 'clinch'; by: 'player' | 'opponent' }
  | { k: 'exchange'; winner: 'player' | 'opponent' | null; result: string }
  | { k: 'deeper'; by: 'player' | 'opponent'; kind: string }
  | { k: 'lean'; who: 'opponent' | 'player'; depth: number }
  | { k: 'throw'; by: 'player' | 'opponent'; result: string }
  | { k: 'break'; by: 'player' | 'opponent' };

export function combatStepDone(s: CombatStep, e: CombatLessonEvent): boolean {
  switch (s) {
    case 'distance': return e.k === 'tick' && e.dist <= 1.75;
    case 'quick': return e.k === 'strike' && e.by === 'player' && e.kind === 'quick' && e.result !== 'miss';
    case 'big': return e.k === 'strike' && e.by === 'player' && e.kind === 'big';
    case 'guard': return e.k === 'strike' && e.by === 'opponent' && e.result === 'guarded';
    case 'reach': return e.k === 'clinch' && e.by === 'player';
    case 'moves': return e.k === 'exchange' && e.winner === 'player' && e.result === 'counter';
    case 'deeper': return e.k === 'deeper' && e.by === 'player' && e.kind === 'ceinture';
    case 'unbalance': return e.k === 'lean' && e.who === 'opponent' && e.depth >= 0.3;
    case 'throw': return e.k === 'throw' && e.by === 'player' && e.result === 'fall';
    case 'brace': return e.k === 'throw' && e.by === 'opponent' && (e.result === 'braced' || e.result === 'blocked' || e.result === 'countered' || e.result === 'fail');
    case 'break': return e.k === 'break' && e.by === 'player';
    default: return false;
  }
}
export function combatFeedback(s: CombatStep, e: CombatLessonEvent): string | null {
  if (s === 'moves' && e.k === 'exchange' && e.winner !== 'player') return 'Regarde-le : penché en avant, il pousse — tire à ce moment-là.';
  if (s === 'throw' && e.k === 'throw' && e.by === 'player' && e.result !== 'fall') return 'Pas encore : quand le bouton s’allume, il est prêt à tomber.';
  if (s === 'brace' && e.k === 'throw' && e.by === 'opponent' && e.result === 'fall') return 'Trop tard, ou du mauvais côté : loin de lui, pendant qu’il tourne.';
  if (s === 'reach' && e.k === 'tick' && e.dist > 1.6) return null;
  return null;
}

export interface CombatLesson { steps: CombatStep[]; step: CombatStep; ready: boolean; done: boolean; skipped: number }
export const startCombatLesson = (frappe: boolean): CombatLesson => { const steps = combatSteps(frappe); return { steps, step: steps[0], ready: false, done: false, skipped: 0 }; };
export const combatStepNumber = (l: CombatLesson) => ({ n: Math.min(l.steps.indexOf(l.step) + 1, l.steps.length - 1), of: l.steps.length - 1 });
export function combatAdvance(l: CombatLesson, skipped = false) {
  if (l.done) return;
  l.step = l.steps[Math.min(l.steps.length - 1, l.steps.indexOf(l.step) + 1)]; l.ready = false;
  if (skipped) l.skipped++;
  if (l.step === 'done') l.done = true;
}
export function combatHear(l: CombatLesson, e: CombatLessonEvent): boolean {
  if (l.done || !combatStepDone(l.step, e)) return false;
  combatAdvance(l);
  return true;
}
export function combatCoachLine(s: CombatStep): string {
  if (s === 'done') return `Coach Ablaye : ${utter(['Baax na !'])} Saisir, déséquilibrer, projeter : c’est ça, la lutte.`;
  const d = COMBAT_LESSON[s];
  return `Coach Ablaye : ${utter(d.wolof)} ${d.fr}`;
}
