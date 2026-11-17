/**
 * The opening fly-in's path (src/game/opening.ts), pure: where the camera is and what it looks at, second by second, over Pikine (the New
 * Game spawn, src/world/builder.ts: the player in front of « Ma chambre », facing it at an angle; the play camera behind them looks east-
 * north-east, over the starter room's street toward the arena).
 *
 * One district is loaded and the fog closes at 240–320 m, so the flight is low and short: it starts over the roofs north-west of the starter
 * room (water tanks, terraces, the street's stalls below), looking across the district at the arena, and glides down over the crossroads
 * onto the player, the view settling from the arena to them, then lands on the play camera behind them (the last key is the follow
 * camera's own pose, given each frame). Positions and look points are Hermite curves in time (a key's tangent from its neighbours), at rest
 * at both ends: no jolt when the flight starts under the fading arrival card, none when the player takes over.
 */
export interface P3 { x: number; y: number; z: number }
export interface Pose { pos: P3; look: P3 }
export interface Key { t: number; pos: P3; look: P3 }

/** Seconds of the flight (the brief: 12 to 18). */
export const OPENING_SECONDS = 14;

/**
 * Pikine's keys (world metres; the starter room's street is z ≈ −60, its crossroads x ≈ −60, the arena x ≈ 30, z ≈ −30); the end key is the play camera.
 * Timed by distance: 3.5 s to reach a glide of 6–8 m/s, a slow-down over the last 3 s into the player's camera. The view looks about 10° down
 * all the way (more city, less sky on a phone held upright), tilting to the play camera's 16° as it lands.
 */
export const PIKINE_KEYS: readonly Key[] = [
  { t: 0, pos: { x: -108, y: 17, z: -112 }, look: { x: 25, y: -10, z: -35 } },
  { t: 4.5, pos: { x: -94, y: 15, z: -97 }, look: { x: 0, y: -4, z: -42 } },
  { t: 7.6, pos: { x: -79, y: 11.5, z: -80 }, look: { x: -28, y: 1.8, z: -50 } },
  { t: 10.4, pos: { x: -64, y: 7.5, z: -67 }, look: { x: -39, y: 1.4, z: -51 } },
];

const sub = (a: P3, b: P3, s = 1): P3 => ({ x: (a.x - b.x) * s, y: (a.y - b.y) * s, z: (a.z - b.z) * s });
const zero: P3 = { x: 0, y: 0, z: 0 };

/** Cubic Hermite between a and b (tangents ma, mb in metres per second) over a segment of `h` seconds, at u ∈ [0, 1]. */
function hermite(a: P3, b: P3, ma: P3, mb: P3, h: number, u: number): P3 {
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const f = (k: 'x' | 'y' | 'z') => h00 * a[k] + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k];
  return { x: f('x'), y: f('y'), z: f('z') };
}
/** Each key's tangent: from its neighbours (time-weighted), at rest on the first and the last key. */
function tangents(keys: readonly Key[], which: 'pos' | 'look'): P3[] {
  return keys.map((_k, i) => i === 0 || i === keys.length - 1 ? zero : sub(keys[i + 1][which], keys[i - 1][which], 1 / (keys[i + 1].t - keys[i - 1].t)));
}

/**
 * The camera at `t` seconds of a flight through `keys` that ends on `end` (the play camera) at `seconds`. Before 0: the first key; from
 * `seconds` on: `end` exactly.
 */
export function openingPose(t: number, end: Pose, keys: readonly Key[] = PIKINE_KEYS, seconds = OPENING_SECONDS): Pose {
  const all: Key[] = [...keys, { t: seconds, pos: end.pos, look: end.look }];
  if (t >= seconds) return { pos: { ...end.pos }, look: { ...end.look } };
  if (t <= all[0].t) return { pos: { ...all[0].pos }, look: { ...all[0].look } };
  const mp = tangents(all, 'pos'), ml = tangents(all, 'look');
  let i = 0; while (i < all.length - 2 && t > all[i + 1].t) i++;
  const a = all[i], b = all[i + 1], h = b.t - a.t, u = (t - a.t) / h;
  return { pos: hermite(a.pos, b.pos, mp[i], mp[i + 1], h, u), look: hermite(a.look, b.look, ml[i], ml[i + 1], h, u) };
}

/** Reduced motion (`prefers-reduced-motion: reduce`): no flight, a short fade from the arrival card's dark to the play camera (seconds). */
export const OPENING_FADE_SECONDS = 1.2;
/** A tap or a key skips: the screen dips to the dark, the camera is put on the play camera, the screen comes back (seconds each way). */
export const SKIP_OUT_SECONDS = 0.2, SKIP_IN_SECONDS = 0.35;
