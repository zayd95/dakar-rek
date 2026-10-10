import type { Clip } from '../actors/humanoid';
import { PREP_SIDE, prepCornerCentre } from '../world/arenaModules';
import { lex, say } from '../i18n/wolof';
import { utter } from '../i18n/lines';

/**
 * The wrestlers' entrance as a ceremony (pure: timings, places, lines; tests/ceremony.test.ts). Each wrestler walks out
 * of the tunnel, stops on the sand and does his bàkk — a rhythmic boast dance to the sabar — while his entourage chants
 * round him, his griot sings his praises into the microphone and the drums change rhythm; then he goes to his écurie's
 * corner to get ready, and both come to the ring for the bout. The announcer at the officials' table names each one,
 * with his record when the career's roster gives it (`setRecordSource`).
 *
 * The words are short and invented, French with everyday Wolof from the lexicon (src/i18n/wolof.ts), as the rest of the
 * game: a wrestler boasts about himself, his strength, his écurie, his neighbourhood — never against anyone. No rite is
 * staged (no bath, no amulet, no prayer) and nothing here is a sacred text; nothing is rewarded.
 */
export type Who = 'left' | 'right';
export interface P { x: number; z: number }
export interface Fighter { id: string; name: string; ecurie: string }

/** When each part happens, in seconds of the entrance phase (src/arena/program.ts SHOW.entrance is `end`). */
export const CEREMONY = {
  left: { out: [0.5, 6.0], bakk: [6.0, 11.5], corner: [11.5, 17.0] },
  right: { out: [8.0, 13.5], bakk: [13.5, 19.0], corner: [19.0, 24.5] },
  /** Both wrestlers jog from their corners to the ring (once the right one's people are in his corner). */
  ring: [27.5, 32.0],
  end: 33,
} as const satisfies Record<Who, Record<'out' | 'bakk' | 'corner', readonly [number, number]>> & { ring: readonly [number, number]; end: number };

/** The bàkk: four beats, alternating the dance and the boast with the arms up, turning to the stands then the ring. */
export const BAKK_BEATS: readonly { clip: Clip; face: 'stands' | 'ring' }[] = [
  { clip: 'Dance_A', face: 'stands' }, { clip: 'Celebrate', face: 'ring' }, { clip: 'Dance_B', face: 'stands' }, { clip: 'Celebrate', face: 'ring' },
];

/** The écurie a fighter belongs to, as an id ('baobab' | 'teranga'), or null (independent). */
export const ecurieId = (ecurie: string): 'baobab' | 'teranga' | null => {
  const e = ecurie.toLowerCase();
  return e === 'baobab' ? 'baobab' : e === 'teranga' ? 'teranga' : null;
};
/** Which side of the ring a bill's wrestler stands on: the left one on +x (where his supporters sit), the right one on −x. */
export const ringSide = (who: Who): 1 | -1 => (who === 'left' ? 1 : -1);
/**
 * The side of each wrestler's corner tonight: his écurie's (PREP_SIDE, the one place that sets it); when both belong to
 * the same écurie, or neither has one, the left one takes his écurie's side (else +x) and the right one the other.
 */
export function cornerSides(bill: { left: Fighter; right: Fighter }): Record<Who, 1 | -1> {
  const l = ecurieId(bill.left.ecurie), r = ecurieId(bill.right.ecurie);
  if (l) return { left: PREP_SIDE[l], right: (-PREP_SIDE[l]) as 1 | -1 };
  if (r) return { left: (-PREP_SIDE[r]) as 1 | -1, right: PREP_SIDE[r] };
  return { left: 1, right: -1 };
}
/** The colour a wrestler's people wear: his écurie's, else a neutral one (an independent). */
export const ECURIE_COLOUR: Record<'baobab' | 'teranga', number> = { baobab: 0x1a7a44, teranga: 0xc8322a };
export const colourOf = (f: Fighter) => { const e = ecurieId(f.ecurie); return e ? ECURIE_COLOUR[e] : 0x2f6fb3; };

const polar = (cx: number, cz: number, a: number, r: number): P => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
export const pathLength = (path: readonly P[]) => path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);

/**
 * The ways across the sand, by side (+1 = +x): out of the tunnel's railings, round in front of the drummers' deck and its
 * dancers, the open side of a corner, and the gap in the sponsor boards by the tunnel (the way onto the sand).
 */
export const ROUTE = { out: { x: 1.0, z: 11.0 }, round: { a: 0.6, r: 11.5 }, side: { a: 0.64, r: 13.2 }, gap: { x: 1.3, z: 9.6 } } as const;
const gap = (cx: number, cz: number, s: 1 | -1): P => ({ x: cx + s * ROUTE.gap.x, z: cz + ROUTE.gap.z });
/** From the sand to a corner's open side (the corner's own spot is added by the caller). */
export function sandToCorner(cx: number, cz: number, s: 1 | -1): P[] {
  return [gap(cx, cz, s), { x: cx + s * ROUTE.out.x, z: cz + ROUTE.out.z }, polar(cx, cz, s * ROUTE.round.a, ROUTE.round.r), polar(cx, cz, s * ROUTE.side.a, ROUTE.side.r)];
}
/** Where a wrestler comes out of the tunnel, and where his bàkk is: on the sand inside the ring, on his side. */
export const tunnelStart = (cx: number, cz: number, who: Who): P => ({ x: cx + ringSide(who) * 0.8, z: cz + 18.7 });
export const bakkSpot = (cx: number, cz: number, who: Who): P => ({ x: cx + ringSide(who) * 2.0, z: cz + 5.0 });
/** Where he waits for the bout in the ring (the duel starts him there). */
export const ringSpot = (cx: number, cz: number, who: Who): P => ({ x: cx + ringSide(who) * 3.0, z: cz });

/** One stretch of a wrestler's entrance: walking a path, or holding a spot (with the bàkk's beats). */
export interface Leg { part: 'tunnel' | 'out' | 'bakk' | 'corner' | 'prep' | 'ring' | 'ready'; t0: number; t1: number; path: P[]; clip: Clip | 'walk'; face?: number }
/** A wrestler's whole entrance. `clip: 'walk'` lets the body pick walk or run from the speed. */
export function wrestlerPlan(cx: number, cz: number, who: Who, cs: 1 | -1): Leg[] {
  const T = CEREMONY[who], rs = ringSide(who);
  const start = tunnelStart(cx, cz, who), b = bakkSpot(cx, cz, who), corner = prepCornerCentre(cx, cz, cs), ring = ringSpot(cx, cz, who);
  const toCorner = [b, ...sandToCorner(cx, cz, cs), corner];
  const ringFace = Math.atan2(cx - corner.x, cz - corner.z);
  return [
    { part: 'tunnel', t0: 0, t1: T.out[0], path: [start], clip: 'Idle', face: Math.PI },
    { part: 'out', t0: T.out[0], t1: T.out[1], path: [start, gap(cx, cz, rs), b], clip: 'Entrance_Walk' },
    { part: 'bakk', t0: T.bakk[0], t1: T.bakk[1], path: [b], clip: 'Dance_A' },
    { part: 'corner', t0: T.corner[0], t1: T.corner[1], path: toCorner, clip: 'walk' },
    { part: 'prep', t0: T.corner[1], t1: CEREMONY.ring[0], path: [corner], clip: 'Prep', face: ringFace },
    { part: 'ring', t0: CEREMONY.ring[0], t1: CEREMONY.ring[1], path: [...[...toCorner].reverse().slice(0, -1), ring], clip: 'walk' },
    { part: 'ready', t0: CEREMONY.ring[1], t1: CEREMONY.end, path: [ring], clip: 'Stance', face: rs > 0 ? -Math.PI / 2 : Math.PI / 2 },
  ];
}
/** A point `k` (0…1) of the way along a path, and the heading there. */
export function along(path: readonly P[], k: number): P & { yaw: number } {
  if (path.length === 1) return { ...path[0], yaw: 0 };
  let left = Math.max(0, Math.min(1, k)) * pathLength(path);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], d = dist(a, b), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    if (left <= d || i + 2 === path.length) { const f = d ? Math.min(1, left / d) : 1; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw }; }
    left -= d;
  }
  return { ...path[path.length - 1], yaw: 0 };
}
/** Where a wrestler is at time t of the entrance, which way he faces, what he does, and how fast he goes (m/s). */
export function poseAt(plan: readonly Leg[], t: number, cx: number, cz: number, who: Who): { x: number; z: number; yaw: number; clip: Clip | 'walk'; speed: number; part: Leg['part']; beat: number } {
  const leg = plan.find(l => t < l.t1) ?? plan[plan.length - 1];
  const k = leg.t1 > leg.t0 ? (t - leg.t0) / (leg.t1 - leg.t0) : 1;
  if (leg.path.length > 1) {
    const p = along(leg.path, k), moving = k > 0 && k < 1;
    return { x: p.x, z: p.z, yaw: p.yaw, clip: moving ? leg.clip : 'Idle', speed: moving ? pathLength(leg.path) / (leg.t1 - leg.t0) : 0, part: leg.part, beat: -1 };
  }
  const p = leg.path[0];
  if (leg.part === 'bakk') {
    const beat = Math.min(BAKK_BEATS.length - 1, Math.floor(Math.max(0, k) * BAKK_BEATS.length)), b = BAKK_BEATS[beat];
    // to the stands of his supporters (his ring side), then back to the ring and the other stands
    const yaw = b.face === 'stands' ? ringSide(who) * Math.PI / 2 : Math.atan2(cx - p.x, cz - p.z);
    return { x: p.x, z: p.z, yaw, clip: b.clip, speed: 0, part: 'bakk', beat };
  }
  return { x: p.x, z: p.z, yaw: leg.face ?? 0, clip: leg.clip, speed: 0, part: leg.part, beat: -1 };
}

// ------------------------------------------------------------------ the entourage round the bàkk
/**
 * Where a wrestler's people stand during his bàkk: an arc round him on the tunnel side and towards his supporters, the
 * griot nearest the stands with his microphone. k: 0 the coach, 1 a helper, 2 the flag, 3 a helper; 'griot'.
 */
export function chantSpot(cx: number, cz: number, who: Who, k: number | 'griot'): P & { yaw: number } {
  const rs = ringSide(who), b = bakkSpot(cx, cz, who);
  const [phi, d] = k === 'griot' ? [1.25, 1.5] : ([[0.45, 1.7], [-0.25, 1.7], [2.0, 1.7], [-0.95, 1.7]] as const)[k] ?? [0.45 + k * 0.4, 2.2];
  const p = { x: b.x + Math.sin(rs * phi) * d, z: b.z + Math.cos(rs * phi) * d };
  return { ...p, yaw: Math.atan2(b.x - p.x, b.z - p.z) };              // facing their wrestler
}
/**
 * The order they walk in: the griot right behind his wrestler, then the flag, the coach, the helpers — the first ones go
 * to the places furthest from the way in, so nobody walks through someone already standing.
 */
export const IN_FILE: readonly (number | 'griot')[] = ['griot', 2, 0, 1, 3];
/** The order they leave for the corner, one after the other on their wrestler's way: the flag first (it goes furthest into the corner), the griot last. */
export const OUT_FILE: readonly (number | 'griot')[] = [2, 0, 1, 3, 'griot'];
/** The entourage's way in: from the tunnel behind the wrestler, onto the sand, to its place round him. */
export function entourageIn(cx: number, cz: number, who: Who, k: number | 'griot'): P[] {
  const rs = ringSide(who), q = Math.max(0, IN_FILE.indexOf(k));
  return [{ x: cx + rs * (q % 2 ? 1.0 : 0.4), z: cz + 19.3 + q * 0.75 }, gap(cx, cz, rs), chantSpot(cx, cz, who, k)];
}
/** From the bàkk to the corner: into the wrestler's spot as he leaves (straight in, nobody crossed), then his way, to `to`. */
export const entourageToCorner = (cx: number, cz: number, who: Who, cs: 1 | -1, k: number | 'griot', to: P): P[] =>
  [chantSpot(cx, cz, who, k), bakkSpot(cx, cz, who), ...sandToCorner(cx, cz, cs), to];
/** Where the griot stands by the corner (outside it, by its open side), cs: the corner's side. */
export const griotCornerSpot = (cx: number, cz: number, cs: 1 | -1): P & { yaw: number } => {
  const p = polar(cx, cz, cs * 0.6, 13.9);
  return { ...p, yaw: Math.atan2(cx - p.x, cz - p.z) };
};
/** When each of them sets off (seconds of the entrance): in, behind the wrestler; to the corner, in file once he has gone. */
export const setOffIn = (who: Who, k: number | 'griot') => CEREMONY[who].out[0] + 0.4 + 0.3 * Math.max(0, IN_FILE.indexOf(k));
export const setOffCorner = (who: Who, k: number | 'griot') => CEREMONY[who].bakk[1] + 0.5 + 0.35 * Math.max(0, OUT_FILE.indexOf(k));
/** Their walking pace (m/s): in, so as to stand round him when the bàkk starts; to the corner, a little behind him. */
export const IN_ARRIVE = 0.8, CORNER_PACE = 3.0;

// ------------------------------------------------------------------ the words
/** A season record, when the career's roster knows the wrestler. */
export interface WrestlerRecord { v: number; d: number; n: number }
let recordSource: ((id: string, name: string, day: number) => WrestlerRecord | null) | null = null;
/**
 * Where the announcer reads the records: the career's roster (src/career/roster.ts `ladderAt`) plugs in here, e.g.
 * `setRecordSource((id, _n, day) => { const s = ladderAt(day).table.find(x => x.id === id); return s ? s : null; })`.
 */
export function setRecordSource(fn: typeof recordSource) { recordSource = fn; }
export const recordOf = (f: Fighter, day: number): WrestlerRecord | null => recordSource?.(f.id, f.name, day) ?? null;
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
export const recordText = (r: WrestlerRecord) => [plural(r.v, 'victoire'), plural(r.d, 'défaite'), r.n ? plural(r.n, 'nul') : ''].filter(Boolean).join(', ');

/** Where a wrestler comes from (his neighbourhood, from his sheet), else his écurie's home. */
const HOME: Record<string, string> = { babacar: 'Pikine', lamine: 'Guédiawaye', player: 'Pikine' };
export const goxOf = (f: Fighter) => HOME[f.id] ?? (ecurieId(f.ecurie) === 'baobab' ? 'Pikine' : ecurieId(f.ecurie) === 'teranga' ? 'Guédiawaye' : 'Dakar');
const ecurieWords = (f: Fighter) => (ecurieId(f.ecurie) ? `l’écurie ${f.ecurie}` : 'sans écurie');

/** A small deterministic choice (the same evening says the same lines; another evening, other lines). */
export function seeded(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) % n;
}

const MIC = '🎤';
/** The announcer at the officials' table names the wrestler as he walks out (with his record when known). */
export function announceLine(f: Fighter, who: Who, rec: WrestlerRecord | null): string {
  const corner = who === 'left' ? 'À ma gauche' : 'À ma droite';
  return `${MIC} L’annonceur : ${corner}, pour ${ecurieWords(f)}, venu de ${goxOf(f)}… ${f.name} !${rec ? ` ${recordText(rec)} !` : ''}`;
}
/** The wrestler's boast during his bàkk (about himself, never against anyone). */
export function boastLine(f: Fighter, seed: string): string {
  const gox = goxOf(f), lines = [
    () => `${f.name} : ${utter(['Dama am doole !'])} — ce soir, le ${say('géew')} est à moi !`,
    () => `${f.name} : ${utter(['Gaynde !'])} — le lion de ${gox} est arrivé !`,
    () => `${f.name} : Je suis le ${say('mbër')} de ${gox} : regardez bien, je ne recule jamais !`,
    () => `${f.name} : Mon ${say('bàkk')} fait danser tout ${gox}, ${say('sama gox')} est là ce soir !`,
  ];
  return lines[seeded(`boast:${seed}:${f.id}`, lines.length)]();
}
/**
 * The griot sings his wrestler's praises into the microphone: strength, écurie, neighbourhood; for the player on his
 * own gala night (`rec`: his record from the career, wins only, never money), his wins too.
 */
export function griotLine(f: Fighter, seed: string, rec: WrestlerRecord | null = null): string {
  const gox = goxOf(f), team = ecurieId(f.ecurie) ? `l’écurie ${f.ecurie}` : 'tout le quartier';
  if (rec && rec.v > 0) {
    const won = [
      () => `${MIC} Le griot : ${f.name} ! ${plural(rec.v, 'victoire')} dans le ${say('géew')}, et tout ${gox} chante son nom !`,
      () => `${MIC} Le griot : Enfant de ${gox}, ${plural(rec.v, 'combat')} gagnés : la ${say('doole')} de ${f.name} ne se discute pas !`,
    ];
    return won[seeded(`griot:rec:${seed}:${f.id}`, won.length)]();
  }
  const lines = [
    () => `${MIC} Le griot : ${f.name}, enfant de ${gox}, le bras fort de ${team} !`,
    () => `${MIC} Le griot : ${f.name} ! Sa ${say('doole')} fait trembler le ${say('géew')}, ${gox} est fier de lui !`,
    () => `${MIC} Le griot : Debout pour ${team} ! Voici ${f.name}, le ${say('gaynde')} de ${gox} !`,
    () => `${MIC} Le griot : ${f.name} s’entraîne avant le lever du jour ; ses épaules portent tout ${gox} !`,
  ];
  return lines[seeded(`griot:${seed}:${f.id}`, lines.length)]();
}
/** His people's chant round him. */
export function chantLine(f: Fighter): string {
  const g = lex('gaynde');
  return `L’entourage de ${f.name} : ${utter([{ wo: 'Gaynde, gaynde !', fr: `${g.fr}, ${g.fr}` }])}`;
}
/** The player's own bàkk before the ring, and who answers it. */
export function playerBoastLine(seed: string): string {
  const lines = [
    () => `Toi : ${utter(['Dama am doole !'])} — le ${say('géew')} est à moi ce soir !`,
    () => `Toi : ${utter(['Gaynde !'])} — regardez bien, je ne recule jamais !`,
  ];
  return lines[seeded(`player:${seed}`, lines.length)]();
}
export const answerLine = (stands: boolean) => `${stands ? 'Les tribunes de ton côté répondent' : 'Ton entourage répond'} : ${utter(['Gaynde !'])}`;

/** Everything the entrance says or plays, in order: [time, what, side, text?]. */
export type Cue = { t: number; kind: 'announce' | 'bakk' | 'boast' | 'griot' | 'chant' | 'drums'; who: Who; text?: string };
/**
 * `player`: the side the player takes on his own gala night. He is already in his corner (the fighter's path), so his
 * side is named, praised by his griot (his wins from the career) and chanted by his people from the corner; his own
 * bàkk comes on his walk to the ring (src/arena/bakk.ts), so no bàkk, boast or drums are played for him here.
 */
export function entranceCues(bill: { left: Fighter; right: Fighter }, day: number, seed = String(day), o: { player?: Who } = {}): Cue[] {
  const out: Cue[] = [];
  for (const who of ['left', 'right'] as const) {
    const f = bill[who], T = CEREMONY[who];
    if (o.player === who) {
      out.push(
        { t: who === 'left' ? T.out[0] + 0.2 : CEREMONY.left.bakk[1] + 0.1, kind: 'announce', who, text: announceLine(f, who, recordOf(f, day)) },
        { t: T.bakk[0] + 0.6, kind: 'griot', who, text: griotLine(f, seed, recordOf(f, day)) },
        { t: T.bakk[0] + 2.6, kind: 'chant', who, text: chantLine(f) },
      );
      continue;
    }
    out.push(
      // the first one is named as he steps out; the second on his way, once the first one's bàkk is over (one voice at a time)
      { t: who === 'left' ? T.out[0] + 0.2 : CEREMONY.left.bakk[1] + 0.1, kind: 'announce', who, text: announceLine(f, who, recordOf(f, day)) },
      { t: T.bakk[0], kind: 'bakk', who },                                        // the drums change rhythm, his side shouts
      { t: T.bakk[0] + 0.6, kind: 'boast', who, text: boastLine(f, seed) },
      { t: T.bakk[0] + 2.4, kind: 'griot', who, text: griotLine(f, seed) },
      { t: T.bakk[0] + 4.2, kind: 'chant', who, text: chantLine(f) },
      { t: T.bakk[1], kind: 'drums', who },                                        // back to the evening's rhythm
    );
  }
  return out.sort((a, b) => a.t - b.t);
}
