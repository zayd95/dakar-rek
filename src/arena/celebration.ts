import type { Clip } from '../actors/humanoid';
import type { ReactionKind } from '../crowd/reactions';
import { prepCornerCentre } from '../world/arenaModules';
import { say } from '../i18n/wolof';
import { utter } from '../i18n/lines';
import { along, ecurieId, goxOf, pathLength, ringSide, sandToCorner, seeded, type Fighter, type P, type Who } from './ceremony';
import type { Quality } from './program';

/**
 * « La fête après la chute » — the minute after a làmb result (pure: timings, places, lines; tests/celebration.test.ts).
 *
 * The main event won (by a fall or on points):
 *  - the winner's entourage runs onto the sand (src/arena/people.ts) and his supporters pour down from their stands;
 *  - two of his people lift him onto their shoulders and carry him round the ring, the others behind;
 *  - he salutes his section, the drums play the bàkk's rhythm and louder, the announcer and his griot speak;
 *  - his section dances (the crowd's `dance`) and waves its flags and banners;
 *  - the losing side sits down quietly (`slump`);
 *  - then he goes to his corner, and the crowd leaves.
 *
 * A draw is calmer: the two wrestlers meet in the middle and shake hands, the whole arena applauds both.
 *
 * The player's own main event (src/arena/fighter.ts) gets the stands, the drums and the lines; the player keeps their
 * own body. A preliminary gets a few seconds of it.
 *
 * Everything is a function of the result phase's time and of (hub, day): every device plays the same fête, and friends
 * following each other's show (src/arena/together.ts) see it together. The only inputs that differ are where the two
 * wrestlers stood when the bout ended, and those come from the seeded bout. No new body: the duel's two wrestlers,
 * the entourages' roles and the crowd's own figures.
 */
export type PartyKind = 'main' | 'own' | 'prelim';

/** The main event's fête, in seconds of the result phase. */
export const FETE = {
  /** The entourage has run onto the sand (people.ts celebratePath, at 4.5 m/s). */
  run: 3.2,
  /** The winner steps to his side of the ring while his carriers get under him; they lift him. */
  toLift: [3.4, 4.6], rise: [4.6, 5.4],
  /** Carried to the edge of the ring on his side, round the ring, facing his section. */
  out: [5.4, 6.6], tour: [6.6, 36.6], salute: [36.6, 42.6],
  /** Down again, and to his corner with his people. */
  lower: [42.6, 43.4], corner: [43.4, 51],
  /** The drums play the bàkk's rhythm, louder. */
  drums: [1.5, 50],
  /** The result phase ends here: the crowd leaves (SHOW.leaving), the street's outflow starts after that. */
  end: 56,
} as const;
/** A draw: the two meet in the middle, shake hands, go back to their corners. */
export const DRAW = { meet: [1.5, 6], shake: [6, 10], corners: [10, 18], end: 24 } as const;
/** The player's own main event: the stands and the drums, while the player walks back out by the tunnel. */
export const OWN = { drums: [1, 24], end: 30 } as const;
/** From the result to the street's outflow, at most (the result phase, then SHOW.leaving). */
export const OUTFLOW_WITHIN = 90;
/** The tour of the ring: radius (inside the sandbags) and how high the winner rides on the shoulders. */
export const TOUR_R = 7.4, LIFT_H = 0.85;
/** How many of the winner's supporters pour onto the sand, by graphics quality (the crowd's instanced figures). */
export const SAND_FANS: Record<Quality, number> = { low: 4, medium: 8, high: 12 };

export interface PartyCue {
  t: number;
  kind: 'announce' | 'griot' | 'chant' | 'drums' | 'stands' | 'cheer';
  text?: string;
  rhythm?: 'gala' | 'bakk';
  /** A stands' reaction: the group, the kind, the share, how long. */
  group?: string; reaction?: ReactionKind; share?: number; seconds?: number;
}
export interface PartyPlan {
  kind: PartyKind;
  winner: Who | null;
  /** How long the result phase (or the player's fête) lasts. */
  length: number;
  /** The winner is carried (two of his people at least); else he walks his tour, arms up. */
  lift: boolean;
  /** Round the ring this way (seeded by the evening). */
  dir: 1 | -1;
  /** The side of each wrestler's corner tonight (ceremony.ts cornerSides). */
  corners: Record<Who, 1 | -1>;
  cues: PartyCue[];
  /** When the drums play louder (null: as usual). */
  loud: readonly [number, number] | null;
  /** Supporters pouring onto the sand (the winner's side). */
  fans: number;
}

const MIC = '🎤';
const how = (outcome: string) => (outcome === 'projection' ? 'par chute' : 'aux points');
const team = (f: Fighter) => (ecurieId(f.ecurie) ? `l’écurie ${f.ecurie}` : 'tout le quartier');

/** The announcer names the winner (or the draw). */
export function winLine(f: Fighter, outcome: string): string {
  return `${MIC} L’annonceur : Victoire de ${f.name} ${how(outcome)}, pour ${team(f)} ! Le ${say('géew')} est à lui ce soir !`;
}
export const drawLine = (l: Fighter, r: Fighter) => `${MIC} L’annonceur : Match nul ! ${l.name} et ${r.name} se serrent la main, tout le ${say('géew')} applaudit les deux.`;
/** The griot sings the winner's praises as they carry him round. */
export function griotWinLine(f: Fighter, seed: string, k = 0): string {
  const gox = goxOf(f), lines = [
    () => `${MIC} Le griot : ${f.name} ! ${utter(['Daan na !'])} ${gox} peut danser ce soir !`,
    () => `${MIC} Le griot : Le ${say('gaynde')} de ${gox} a parlé ! ${f.name}, la fierté de ${team(f)} !`,
    () => `${MIC} Le griot : Portez-le haut ! ${f.name} a fait trembler le ${say('géew')} !`,
    () => `${MIC} Le griot : ${f.name}, enfant de ${gox} : ce soir, tout ${gox} chante ton nom !`,
  ];
  return lines[seeded(`fete:${seed}:${f.id}:${k}`, lines.length)]();
}
export const saluteLine = (f: Fighter) => `${f.name} salue ses supporters : ${utter([{ wo: 'Gaynde, gaynde !', fr: 'lion, lion !' }])}`;
export const quietLine = (f: Fighter) => `Côté ${ecurieId(f.ecurie) ? `écurie ${f.ecurie}` : f.name}, on se rassoit sans un mot.`;
export const closeLine = () => `${MIC} L’annonceur : Merci à tous ! ${utter(['Ñibbil ak jàmm'])}`;
export const drawGriotLine = (l: Fighter, r: Fighter) => `${MIC} Le griot : ${l.name} et ${r.name} ont honoré le ${say('géew')} : deux ${say('mbër')}, un seul public !`;
export const ownWinLine = () => `${MIC} Le griot : Ton nom résonne dans le ${say('géew')} ! ${utter(['Daan na !'])} Ton écurie danse pour toi !`;
export const ownLossLine = (f: Fighter) => `${MIC} L’annonceur : Victoire de ${f.name} ! Ses supporters dansent ; les tiens se rassoient.`;

/**
 * The fête of a result. `winner`: the side that won (null: a draw); `player`: for the player's own bout, the side the
 * player fought on. `entourage`: how many of each wrestler's people there are (PEOPLE_COUNT): two or more carry him.
 */
export function partyPlan(o: {
  kind: PartyKind; winner: Who | null; outcome: string; hub: string; day: number; quality: Quality;
  bill: { left: Fighter; right: Fighter }; corners: Record<Who, 1 | -1>; entourage: number; player?: Who | null;
}): PartyPlan {
  const seed = `${o.hub}:${o.day}`, w = o.winner, draw = !w || o.outcome === 'egalite' || o.outcome === 'abandon';
  const base = { winner: draw ? null : w, corners: o.corners, dir: (seeded(`tour:${seed}`, 2) ? 1 : -1) as 1 | -1, lift: false, fans: 0, loud: null };
  if (o.kind === 'prelim') {
    // a few seconds: a few in one section dance to a burst of the bàkk's rhythm, the arena applauds (module.ts)
    const sec = 'ABCDEFGH'[seeded(`prelim:${seed}`, 8)];
    return { ...base, kind: 'prelim', winner: draw ? null : w, length: 3.5, cues: draw ? [] : [
      { t: 0.3, kind: 'drums', rhythm: 'bakk' }, { t: 0.3, kind: 'stands', group: `sec:${sec}`, reaction: 'dance', share: 0.45, seconds: 3 },
      { t: 3.2, kind: 'drums', rhythm: 'gala' },
    ] };
  }
  if (draw) {
    const { left: l, right: r } = o.bill;
    return { ...base, kind: o.kind, winner: null, length: o.kind === 'own' ? OWN.end : DRAW.end, cues: [
      { t: 0.8, kind: 'announce', text: drawLine(l, r) },
      { t: 1.0, kind: 'stands', group: 'all', reaction: 'applause', share: 0.55, seconds: 4 },
      { t: DRAW.shake[0], kind: 'stands', group: 'all', reaction: 'applause', share: 0.45, seconds: 3.5 },
      { t: 12, kind: 'griot', text: drawGriotLine(l, r) },
    ] };
  }
  const W = o.bill[w!], L = o.bill[w === 'left' ? 'right' : 'left'], lose = w === 'left' ? 'right' : 'left';
  if (o.kind === 'own') {
    const won = o.player === w;
    return { ...base, kind: 'own', length: OWN.end, loud: OWN.drums, cues: [
      { t: 0.8, kind: 'announce', text: won ? winLine(W, o.outcome) : ownLossLine(W) },
      { t: OWN.drums[0], kind: 'drums', rhythm: 'bakk' },
      { t: 1.2, kind: 'stands', group: w!, reaction: 'dance', share: 0.7, seconds: 18 },
      { t: 1.2, kind: 'stands', group: lose, reaction: 'slump', share: 0.85, seconds: 24 },
      { t: 3, kind: 'griot', text: won ? ownWinLine() : griotWinLine(W, seed) },
      { t: OWN.drums[1], kind: 'drums', rhythm: 'gala' },
    ] };
  }
  const lift = o.entourage >= 2;
  return { ...base, kind: 'main', lift, length: FETE.end, loud: FETE.drums, fans: SAND_FANS[o.quality], cues: [
    { t: 0.8, kind: 'stands', group: lose, reaction: 'slump', share: 0.9, seconds: 40 },
    { t: 1.0, kind: 'announce', text: winLine(W, o.outcome) },
    { t: FETE.drums[0], kind: 'drums', rhythm: 'bakk' },
    { t: 3.0, kind: 'chant', text: quietLine(L) },
    { t: 6.0, kind: 'stands', group: w!, reaction: 'dance', share: 0.75, seconds: 30 },
    { t: 6.5, kind: 'griot', text: griotWinLine(W, seed, 0) },
    { t: 8.0, kind: 'stands', group: 'ends', reaction: 'applause', share: 0.5, seconds: 4 },
    { t: 20, kind: 'griot', text: griotWinLine(W, seed, 1) },
    { t: FETE.salute[0], kind: 'stands', group: w!, reaction: 'celebrate', share: 0.9, seconds: 6 },
    { t: FETE.salute[0], kind: 'cheer' },
    { t: FETE.salute[0] + 0.4, kind: 'chant', text: saluteLine(W) },
    { t: FETE.lower[1], kind: 'stands', group: w!, reaction: 'dance', share: 0.6, seconds: 7 },
    { t: FETE.drums[1], kind: 'drums', rhythm: 'gala' },
    { t: FETE.drums[1] + 1, kind: 'announce', text: closeLine() },
  ] };
}

/** The result phase's length for a plan (never past the outflow's limit). */
export const partyLength = (p: PartyPlan, leaving: number) => Math.min(p.length, OUTFLOW_WITHIN - leaving);

// ------------------------------------------------------------------ where everyone is
export type Pose = { x: number; z: number; y: number; yaw: number; clip: Clip | 'walk'; speed: number; part: string };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const k01 = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const polar = (cx: number, cz: number, a: number, r: number): P => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
const face = (from: P, to: P) => Math.atan2(to.x - from.x, to.z - from.z);
/** The angle of a side's supporters seen from the centre: the left wrestler's on +x (sections B–C), the right one's on −x. */
export const sideAngle = (who: Who) => (ringSide(who) > 0 ? Math.PI / 2 : -Math.PI / 2);
/** Where he is lifted (his side of the ring) and where the tour starts and ends (the ring's edge, facing his section). */
export const liftSpot = (cx: number, cz: number, who: Who): P => ({ x: cx + ringSide(who) * 3.0, z: cz });
export const tourStart = (cx: number, cz: number, who: Who): P => polar(cx, cz, sideAngle(who), TOUR_R);
/** The way from the tour's end to his corner (ceremony.ts sandToCorner). */
export const toCornerPath = (cx: number, cz: number, who: Who, cs: 1 | -1): P[] => [tourStart(cx, cz, who), ...sandToCorner(cx, cz, cs), prepCornerCentre(cx, cz, cs)];

/** The winner at time t of the fête (`from`: where he stood when the bout ended). */
export function winnerAt(p: PartyPlan, t: number, cx: number, cz: number, from: P): Pose {
  const who = p.winner!, lift = liftSpot(cx, cz, who), start = tourStart(cx, cz, who), up = p.lift ? LIFT_H : 0;
  const F = FETE, th0 = sideAngle(who);
  if (t < F.toLift[0]) return { ...from, y: 0, yaw: face(from, { x: cx, z: cz }), clip: 'Celebrate', speed: 0, part: 'joy' };
  if (t < F.toLift[1]) {
    const k = k01(t, F.toLift[0], F.toLift[1]), d = Math.hypot(lift.x - from.x, lift.z - from.z);
    return { x: lerp(from.x, lift.x, k), z: lerp(from.z, lift.z, k), y: 0, yaw: face(from, lift), clip: 'walk', speed: d / (F.toLift[1] - F.toLift[0]), part: 'toLift' };
  }
  if (t < F.rise[1]) return { ...lift, y: up * k01(t, F.rise[0], F.rise[1]), yaw: th0, clip: 'Celebrate', speed: 0, part: 'rise' };
  if (t < F.out[1]) {
    const k = k01(t, F.out[0], F.out[1]);
    return { x: lerp(lift.x, start.x, k), z: lerp(lift.z, start.z, k), y: up, yaw: th0, clip: p.lift ? 'Celebrate' : 'walk', speed: p.lift ? 0 : (TOUR_R - 3) / (F.out[1] - F.out[0]), part: 'out' };
  }
  if (t < F.tour[1]) {
    const k = k01(t, F.tour[0], F.tour[1]), th = th0 + p.dir * 2 * Math.PI * k, q = polar(cx, cz, th, TOUR_R);
    const yaw = Math.atan2(p.dir * Math.cos(th), -p.dir * Math.sin(th));                       // along the circle
    return { ...q, y: up, yaw, clip: p.lift ? 'Celebrate' : 'walk', speed: p.lift ? 0 : (2 * Math.PI * TOUR_R) / (F.tour[1] - F.tour[0]), part: 'tour' };
  }
  if (t < F.salute[1]) return { ...start, y: up, yaw: th0, clip: 'Celebrate', speed: 0, part: 'salute' };
  if (t < F.lower[1]) return { ...start, y: up * (1 - k01(t, F.lower[0], F.lower[1])), yaw: th0, clip: 'Idle', speed: 0, part: 'lower' };
  const path = toCornerPath(cx, cz, who, p.corners[who]);
  if (t < F.corner[1]) {
    const q = along(path, k01(t, F.corner[0], F.corner[1]));
    return { x: q.x, z: q.z, y: 0, yaw: q.yaw, clip: 'walk', speed: pathLength(path) / (F.corner[1] - F.corner[0]), part: 'corner' };
  }
  const end = path[path.length - 1];
  return { ...end, y: 0, yaw: face(end, { x: cx, z: cz }), clip: 'Idle', speed: 0, part: 'done' };
}

/** The loser: a moment where he fell or stood, then back to his corner, slowly. */
export function loserAt(p: PartyPlan, t: number, cx: number, cz: number, from: P): Pose {
  const who: Who = p.winner === 'left' ? 'right' : 'left', cs = p.corners[who];
  const path = [from, ...sandToCorner(cx, cz, cs), prepCornerCentre(cx, cz, cs)], t0 = 4, t1 = 14;
  if (t < t0) return { ...from, y: 0, yaw: face(from, { x: cx, z: cz }), clip: 'Idle', speed: 0, part: 'down' };
  if (t < t1) { const q = along(path, k01(t, t0, t1)); return { x: q.x, z: q.z, y: 0, yaw: q.yaw, clip: 'walk', speed: pathLength(path) / (t1 - t0), part: 'corner' }; }
  const end = path[path.length - 1];
  return { ...end, y: 0, yaw: face(end, { x: cx, z: cz }), clip: 'Idle', speed: 0, part: 'done' };
}

/** A draw: each wrestler to the middle, the handshake, back to his corner. */
export function drawAt(p: PartyPlan, t: number, cx: number, cz: number, who: Who, from: P): Pose {
  const s = ringSide(who), mid = { x: cx + s * 0.45, z: cz }, other = { x: cx - s * 0.45, z: cz }, cs = p.corners[who];
  const D = DRAW, path = [mid, ...sandToCorner(cx, cz, cs), prepCornerCentre(cx, cz, cs)];
  if (t < D.meet[0]) return { ...from, y: 0, yaw: face(from, { x: cx, z: cz }), clip: 'Idle', speed: 0, part: 'wait' };
  if (t < D.meet[1]) {
    const k = k01(t, D.meet[0], D.meet[1]);
    return { x: lerp(from.x, mid.x, k), z: lerp(from.z, mid.z, k), y: 0, yaw: face(from, mid), clip: 'walk', speed: Math.hypot(mid.x - from.x, mid.z - from.z) / (D.meet[1] - D.meet[0]), part: 'meet' };
  }
  if (t < D.shake[1]) return { ...mid, y: 0, yaw: face(mid, other), clip: 'Talk', speed: 0, part: 'shake' };
  if (t < D.corners[1]) { const q = along(path, k01(t, D.corners[0], D.corners[1])); return { x: q.x, z: q.z, y: 0, yaw: q.yaw, clip: 'walk', speed: pathLength(path) / (D.corners[1] - D.corners[0]), part: 'corner' }; }
  const end = path[path.length - 1];
  return { ...end, y: 0, yaw: face(end, { x: cx, z: cz }), clip: 'Idle', speed: 0, part: 'done' };
}

/** The winner's heading, smoothed over the last second (his people's places round him turn with it, without a jump). */
function smoothYaw(p: PartyPlan, t: number, cx: number, cz: number, from: P): number {
  let sx = 0, sz = 0;
  for (let i = 0; i < 16; i++) { const y = winnerAt(p, t - i * 0.07, cx, cz, from).yaw; sx += Math.sin(y); sz += Math.cos(y); }
  return Math.atan2(sx, sz);
}

/**
 * The winner's people during the fête. `carry` 0/1: the two who lift him (under him, either side, a step behind), from
 * where they ran to (`start`); `lag`: the others follow his track that many seconds behind, a little to one side.
 * Null before they take part (until FETE.run their run onto the sand is people.ts's own).
 */
export function entourageAt(p: PartyPlan, t: number, cx: number, cz: number, from: P, start: P, role: { carry: 0 | 1 } | { lag: number; side: number }): Pose | null {
  if (!p.winner || p.kind !== 'main' || t < FETE.run) return null;
  if ('carry' in role) {
    const t0 = FETE.run, at = Math.max(t, FETE.toLift[1]), w = winnerAt(p, at, cx, cz, from), yaw = smoothYaw(p, at, cx, cz, from);
    const sx = role.carry ? 1 : -1, rx = Math.cos(yaw), rz = -Math.sin(yaw), bx = Math.sin(yaw), bz = Math.cos(yaw);
    const spot = { x: w.x + rx * 0.3 * sx - bx * 0.1, z: w.z + rz * 0.3 * sx - bz * 0.1 };
    if (t < FETE.toLift[1]) {                                            // to their places under him
      const k = k01(t, t0, FETE.toLift[1]);
      return { x: lerp(start.x, spot.x, k), z: lerp(start.z, spot.z, k), y: 0, yaw: face(start, spot), clip: 'Walk', speed: 2, part: 'toLift' };
    }
    const moving = winnerAt(p, t, cx, cz, from).part !== 'rise' && winnerAt(p, t, cx, cz, from).part !== 'salute' && winnerAt(p, t, cx, cz, from).part !== 'done';
    return { ...spot, y: 0, yaw, clip: moving ? 'Walk' : 'Idle', speed: moving ? 1.5 : 0, part: 'carry' };
  }
  const w0 = FETE.out[0];
  if (t < w0) return { ...start, y: 0, yaw: face(start, { x: cx, z: cz }), clip: 'Celebrate', speed: 0, part: 'joy' };
  const lagged = winnerAt(p, Math.max(w0, t - role.lag), cx, cz, from), ly = smoothYaw(p, Math.max(w0, t - role.lag), cx, cz, from);
  const rx = Math.cos(ly), rz = -Math.sin(ly);
  const target = { x: lagged.x + rx * role.side, z: lagged.z + rz * role.side };
  const k = k01(t, w0, w0 + role.lag + 1.2);                              // from where they danced to his track
  const x = lerp(start.x, target.x, k), z = lerp(start.z, target.z, k), moving = lagged.part !== 'salute' && lagged.part !== 'done' && lagged.part !== 'rise';
  return { x, z, y: 0, yaw: ly, clip: lagged.part === 'salute' ? 'Celebrate' : moving ? 'Walk' : 'Idle', speed: moving ? 1.5 : 0, part: 'follow' };
}

/**
 * One of the supporters pouring onto the sand (k of n): down from the walkway in front of his side's stands at a run,
 * dancing in the ring (inside the winner's tour), back up when the tour is over. Off the judges' line (they come down
 * either side of it).
 */
export function sandFanAt(p: PartyPlan, t: number, cx: number, cz: number, k: number): { x: number; z: number; yaw: number; speed: number; on: boolean; dance: boolean } {
  const who = p.winner, n = Math.max(1, p.fans);
  if (!who || p.kind !== 'main' || k >= p.fans) return { x: cx, z: cz, yaw: 0, speed: 0, on: false, dance: false };
  const pairs = Math.max(1, Math.ceil(n / 2) - 1), j = Math.floor(k / 2), sgn = k % 2 ? 1 : -1;
  const a = sideAngle(who) + sgn * (0.16 + (0.46 * j) / pairs), rIn = 4.3 + (k % 3) * 0.6, rOut = 16.7;
  const tIn = 1.2 + 0.3 * k, arrive = tIn + (rOut - rIn) / 3.6, back = 40 + 0.25 * k, off = back + (rOut - rIn) / 1.6;
  const at = (r: number) => polar(cx, cz, a, r), inward = a + Math.PI, outward = a;
  if (t < tIn || t >= off) return { ...at(rOut), yaw: inward, speed: 0, on: false, dance: false };
  if (t < arrive) return { ...at(lerp(rOut, rIn, k01(t, tIn, arrive))), yaw: inward, speed: 3.6, on: true, dance: false };
  if (t < back) return { ...at(rIn), yaw: Math.atan2(cx - at(rIn).x, cz - at(rIn).z) + sgn * 0.6, speed: 0, on: true, dance: true };
  return { ...at(lerp(rIn, rOut, k01(t, back, off))), yaw: outward, speed: 1.6, on: true, dance: false };
}
