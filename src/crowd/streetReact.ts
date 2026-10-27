/**
 * The street reacts to the car (pure, unit-tested in tests/streetReact.test.ts; src/crowd/street.ts plays it). The player's vehicle reports where it is and how fast
 * (src/transport/driveFeel.ts); for each person near it this says whether the car is coming at them, how close it will pass, and what they do and say: a step back and
 * « Wóoy ! » when it is about to hit, a shout and a raised hand when it passes close, a look when it goes by fast, a « Jërëjëf ! » when the driver slows for them.
 * Distances in metres, speeds in m/s; the car's frame: ahead = (sin yaw, cos yaw), right = (cos yaw, −sin yaw).
 */
export interface CarState { x: number; z: number; yaw: number; speed: number; /** Half length and half width of the vehicle. */ hl: number; hw: number }
export const CAR_DIMS = { car: { hl: 2.4, hw: 1.0 }, moto: { hl: 1.0, hw: 0.45 } };
export type Level = 'none' | 'notice' | 'thanks' | 'close' | 'danger';
export interface Assessment { level: Level; /** −1: the person is on the car's left, 1 on its right. */ side: -1 | 1; /** Metres ahead of the car's centre, and sideways from it (right positive). */ ahead: number; lateral: number }

/** The person's place against the car, and what that is: coming at them (`danger`), a close pass (`close`), a fast one (`notice`), a slow one beside them (`thanks`). */
export function assess(car: CarState, p: { x: number; z: number }): Assessment {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), dx = p.x - car.x, dz = p.z - car.z;
  const ahead = dx * fx + dz * fz, lateral = dx * fz - dz * fx, v = car.speed, reach = Math.abs(lateral), side: -1 | 1 = lateral < 0 ? -1 : 1;
  const base = { side, ahead, lateral };
  if (v >= 3.5 && reach < car.hw + 0.7 && ahead > -car.hl && ahead < car.hl + v * 1.05) return { level: 'danger', ...base };      // inside the car's path, within about a second of it
  if (v >= 4.5 && reach < car.hw + 1.7 && ahead > -car.hl - 0.5 && ahead < car.hl + v * 0.85) return { level: 'close', ...base };  // a metre or two from the bodywork
  if (v >= 14 && reach < 6 && ahead > -3 && ahead < 16) return { level: 'notice', ...base };                                      // fast, and near enough to be heard
  if (v >= 0.8 && v <= 4.2 && reach < 3.2 && ahead > -car.hl && ahead < car.hl + 4) return { level: 'thanks', ...base };           // slow, close: the driver is being careful
  return { level: 'none', ...base };
}

/** The lines (short: they go in a speech bubble). Wolof and French as Dakar speaks them. */
export const STREET_LINES: Record<Exclude<Level, 'none'>, string[]> = {
  danger: ['Wóoy !', 'Attention !', 'Aaah !', 'Dawalal ndank !', 'Tu veux ma mort ?!', 'Aïe aïe aïe !', 'Hé, regarde !'],
  close: ['Hé !', 'Doucement !', 'Dawalal ndank !', 'Ça va pas, non ?', 'Regarde où tu vas !', 'Ndank ndank !', 'Wóoy, doucement !'],
  notice: ['Il roule vite, celui-là !', 'Quel fou !', 'Dawalal ndank !', 'Il est pressé, lui !'],
  thanks: ['Jërëjëf !', 'Merci, chef !', 'Baax na !', 'Merci !'],
};
/** After a crash: those near it (standing, or walking by). */
export const CRASH_LINES = ['Wóoy !', 'Ça va ?', 'Il est blessé ?', 'Hé ! Ça va, là-dedans ?', 'Regardez ça !', 'Aïe, la voiture !'];
/** Someone is honked at. */
export const HONK_LINES = ['Oui, oui, j’arrive !', 'Pas la peine de klaxonner !', 'Dawalal ndank !', 'Ça va, ça va !'];

/** How a person reacts at each level: the pose (a src/crowd/reactions.ts kind), for how long, how far they step away (m) and how fast, the chance they speak, the pause before they walk on. */
export const REACTION: Record<Exclude<Level, 'none'>, { pose: 'fall' | 'shout' | 'standUp' | 'applause' | null; seconds: number; step: number; speed: number; speak: number; pause: number; cool: number }> = {
  danger: { pose: 'fall', seconds: 1.6, step: 1.7, speed: 3.6, speak: 0.95, pause: 1.0, cool: 5 },
  close: { pose: 'shout', seconds: 1.3, step: 0.9, speed: 2.6, speak: 0.7, pause: 0.7, cool: 5 },
  notice: { pose: 'standUp', seconds: 1.4, step: 0, speed: 0, speak: 0.18, pause: 0, cool: 14 },
  thanks: { pose: 'applause', seconds: 1.0, step: 0, speed: 0, speak: 0.35, pause: 0, cool: 20 },
};

/** The line for a person, never the one they said last; `rand` in [0, 1). */
export function lineFor(list: readonly string[], rand: number, last?: string): string {
  let i = Math.min(list.length - 1, Math.floor(rand * list.length));
  if (list.length > 1 && list[i] === last) i = (i + 1) % list.length;
  return list[i];
}

/** Where a person steps to: away from the car's path (sideways, on the side they are already on), `step` metres. */
export function stepAway(car: CarState, p: { x: number; z: number }, side: -1 | 1, step: number): { x: number; z: number } {
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  return { x: p.x + rx * side * step, z: p.z + rz * side * step };
}
