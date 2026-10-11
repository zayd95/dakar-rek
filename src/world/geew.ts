// Géew (Wolof: the circle of the arena and its spectators) — shared dimensions of the làmb arena stands and roof.
// Pure numbers, no three.js: the builder draws from them, the scene crowd stands on them, the tests check sightlines.
// Distances are metres from the arena centre; heights are metres above the arena ground.
// Wolof terms here and in the arena code are TEMP and unreviewed until checked by a Wolof speaker and practitioners.

/** Sandbag ring where the mbër (wrestlers) fight. */
export const RING_R = 9;
/** Parapet in front of the first tier (bannered, 1 m high). */
export const PARAPET_R = 17.15, PARAPET_H = 1.0;
/** Three tiers, no upper level. Tier t is a ring of depth TIER_DEPTH centred on tierRadius(t); spectators stand on its top. */
export const TIERS = 3, TIER_DEPTH = 1.32;
export const tierRadius = (t: number) => 17.9 + t * 1.3;
export const tierTop = (t: number) => 1.1 + 0.9 * t;
/** Outer wall behind the last tier. */
export const WALL_R = 21.7, WALL_H = 3.8;
/** Roof over the stands, carried by columns on the outer wall; it rises toward the ring (front edge higher than the back). */
export const ROOF_FRONT_R = 17.3, ROOF_BACK_R = 22.2, ROOF_FRONT_Y = 7.6, ROOF_BACK_Y = 6.7;
export const roofY = (r: number) => ROOF_BACK_Y + ((ROOF_BACK_R - r) / (ROOF_BACK_R - ROOF_FRONT_R)) * (ROOF_FRONT_Y - ROOF_BACK_Y);
/** Gate on the -z side: angles within GATE_HALF of π (measured as atan2(x, z)) have no stands, wall or roof. */
export const GATE_HALF = 0.3;
export const inGate = (a: number, half = GATE_HALF) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < half;
/** Rough standing figure, for sightline checks. */
export const EYE = 1.55, HEAD = 1.75;
