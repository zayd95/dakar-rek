import { say } from '../i18n/wolof';

/**
 * The rules of dancing at La Vague (pure: src/venues/dancePlay.ts plays them in the world on the music's own clock,
 * src/venues/vagueMusic.ts). A performance is a few two-bar phrases, each one move:
 *  - « Le pas de base »: a step left, a step right, on every beat;
 *  - « Jeu de jambes sabar »: the sabar's quick knee lifts, two on each side (on the beat and the « and »);
 *  - « Les bras au ciel »: a swipe up throws the arms up, then steps;
 *  - « Le tour »: a swipe sideways spins round, then steps.
 * Variation comes from the music itself: a phrase that falls on the drums' solo (the track's break) becomes the sabar's
 * footwork, and a phrase ending on a drum fill gets one more step on its last « and »; a seeded choice changes a step now
 * and then. Times are in beats of the track; a tap is judged by how far it lands from its cue, in seconds of the music heard.
 */
export type MoveId = 'pas' | 'sabar' | 'bras' | 'tour';
export type CueKind = 'L' | 'R' | 'up' | 'spin';
export interface Cue { i: number; beat: number; kind: CueKind; move: MoveId }
export interface Phrase { move: MoveId; label: string; hint: string; from: number; to: number; variation: string | null }
export interface TrackShape { bars: number; beatsPerBar: number; sections: readonly { id: string; from: number; to: number }[]; fills: readonly number[] }

export const PHRASE_BEATS = 8;
export const MOVES: Record<MoveId, { label: string; hint: string; cues: readonly (readonly [number, CueKind])[] }> = {
  pas: { label: 'Le pas de base', hint: 'Gauche · droite, sur chaque temps', cues: [[0, 'L'], [1, 'R'], [2, 'L'], [3, 'R'], [4, 'L'], [5, 'R'], [6, 'L'], [7, 'R']] },
  sabar: { label: 'Jeu de jambes sabar', hint: 'Deux à gauche, deux à droite, vite', cues: [[0, 'L'], [0.5, 'L'], [2, 'R'], [2.5, 'R'], [4, 'L'], [4.5, 'L'], [6, 'R'], [6.5, 'R']] },
  bras: { label: 'Les bras au ciel', hint: 'Glisse vers le haut, puis gauche · droite', cues: [[0, 'up'], [2, 'L'], [3, 'R'], [4, 'up'], [6, 'L'], [7, 'R']] },
  tour: { label: 'Le tour', hint: 'Glisse sur le côté pour tourner', cues: [[0, 'spin'], [2, 'L'], [3, 'R'], [4, 'L'], [5, 'R'], [6, 'L'], [7, 'R']] },
};
/** What each level asks for, phrase after phrase (cycled). */
const PLANS: readonly (readonly MoveId[])[] = [
  ['pas', 'pas', 'sabar', 'pas', 'sabar', 'pas', 'sabar'],
  ['pas', 'bras', 'sabar', 'tour', 'sabar', 'bras', 'pas'],
  ['sabar', 'tour', 'bras', 'sabar', 'tour', 'sabar', 'bras'],
];
/** The gesture's `speed` (src/activity/gestures.ts G.dance) → level: the first steps, the evening's, the contest's final. */
export const levelOf = (speed = 1.2) => (speed < 1.2 ? 0 : speed < 1.55 ? 1 : 2);

function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The section of the track a beat falls in (beats counted from the loop's start, any loop). */
export function sectionAt(track: TrackShape, beat: number): string {
  const per = track.beatsPerBar, n = track.bars * per, bar = Math.floor((((beat % n) + n) % n) / per);
  return track.sections.find(s => bar >= s.from && bar < s.to)?.id ?? '';
}
const barAt = (track: TrackShape, beat: number) => { const n = track.bars * track.beatsPerBar; return Math.floor((((beat % n) + n) % n) / track.beatsPerBar); };

/** The first downbeat at least `lead` beats after `now` (a performance starts on a bar). */
export function nextDownbeat(now: number, beatsPerBar = 4, lead = 2) { return Math.ceil((now + lead) / beatsPerBar) * beatsPerBar; }

/** A performance: `rounds` phrases from `start` (a downbeat), the cues to play, with the music's variations. */
export function routine(o: { rounds: number; speed?: number; start: number; seed: number; track: TrackShape }): { phrases: Phrase[]; cues: Cue[] } {
  const R = mulberry(o.seed), plan = PLANS[levelOf(o.speed)], phrases: Phrase[] = [], cues: Cue[] = [];
  for (let r = 0; r < Math.max(1, o.rounds); r++) {
    const from = o.start + r * PHRASE_BEATS;
    let move = plan[r % plan.length], variation: string | null = null;
    if (sectionAt(o.track, from) === 'break' && move !== 'sabar') { move = 'sabar'; variation = 'Le solo des tambours : jeu de jambes sabar'; }
    const list: [number, CueKind][] = MOVES[move].cues.map(([b, k]) => [b, k]);
    if (r > 0 && !variation && R() < 0.22) {                                  // now and then: a turn or a double step in place of a step
      const i = 2 + Math.floor(R() * 4), c = list[i];
      if (c && (c[1] === 'L' || c[1] === 'R') && Number.isInteger(c[0])) { if (move === 'pas') { list.splice(i, 1, [c[0], c[1]], [c[0] + 0.5, c[1]]); variation = 'Un pas doublé'; } else { list[i] = [c[0], 'spin']; variation = 'Un tour en plus'; } }
    }
    const lastBar = barAt(o.track, from + PHRASE_BEATS - 1);
    if (o.track.fills.includes(lastBar) && !list.some(([b]) => b === 7.5)) { list.push([7.5, list[list.length - 1][1] === 'L' ? 'R' : 'L']); variation ??= 'Le roulement des tambours : un pas de plus'; }
    phrases.push({ move, label: MOVES[move].label, hint: MOVES[move].hint, from, to: from + PHRASE_BEATS, variation });
    for (const [b, kind] of list) cues.push({ i: cues.length, beat: from + b, kind, move });
  }
  cues.sort((a, b) => a.beat - b.beat).forEach((c, i) => { c.i = i; });
  return { phrases, cues };
}

/** Windows (seconds of music either side of the cue): wide on purpose, a phone's touch and speaker are not a drum kit. */
export const WINDOWS = { perfect: 0.075, good: 0.14, ok: 0.21, catch: 0.3 } as const;
export type Grade = 'parfait' | 'bien' | 'ok' | 'à côté' | 'raté';
export const GRADE_SCORE: Record<Grade, number> = { parfait: 1, bien: 0.8, ok: 0.55, 'à côté': 0.3, raté: 0 };
/** How a touch `dt` seconds from its cue is judged (`right`: the right side or gesture). */
export function grade(dt: number, right: boolean): Grade {
  const a = Math.abs(dt);
  if (a > WINDOWS.ok) return 'raté';
  if (!right) return 'à côté';
  return a <= WINDOWS.perfect ? 'parfait' : a <= WINDOWS.good ? 'bien' : 'ok';
}
/**
 * The cue a touch answers: the nearest one not yet judged within the catch window (the same kind first). Null: a touch
 * between cues, which is simply ignored (no penalty).
 */
export function matchTouch(cues: readonly Cue[], judged: ReadonlySet<number>, kind: CueKind, beat: number, beatSec: number): { cue: Cue; dt: number } | null {
  let best: { cue: Cue; dt: number } | null = null;
  for (const c of cues) {
    if (judged.has(c.i)) continue;
    const dt = (beat - c.beat) * beatSec;
    if (dt < -WINDOWS.catch) break;
    if (Math.abs(dt) > WINDOWS.catch) continue;
    const better = !best || (c.kind === kind && best.cue.kind !== kind) || ((c.kind === kind) === (best.cue.kind === kind) && Math.abs(dt) < Math.abs(best.dt));
    if (better) best = { cue: c, dt };
  }
  return best;
}
/** The performance's score (0…1): the mean of every cue (a missed one counts 0). */
export const danceScore = (scores: readonly number[]) => (scores.length ? scores.reduce((t, s) => t + s, 0) / scores.length : 0);

/** The floor's word after a performance (French with the everyday Wolof of src/i18n/wolof.ts). */
export function danceLine(score: number): { mood: 'top' | 'ok' | 'meh'; text: string } {
  if (score >= 0.8) return { mood: 'top', text: `${say('Rafet na')} ! La piste t’applaudit.` };
  if (score >= 0.5) return { mood: 'ok', text: `${say('Baax na')} ! Tu as le rythme.` };
  return { mood: 'meh', text: `${say('Ndank ndank')} : écoute le tambour, ça va venir.` };
}
