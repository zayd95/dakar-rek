// Géew (Wolof: the circle of the arena and its spectators) — shared dimensions of the làmb arena stands and roof.
// Pure numbers, no three.js: the builder draws from them, the scene crowd stands on them, the tests check sightlines.
// Distances are metres from the arena centre; heights are metres above the arena ground.
// Wolof terms follow src/i18n/wolof.ts; the arena layout and làmb gestures still await practitioners' review.

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

// ------------------------------------------------------------------ sections, aisles, the wrestlers' tunnel
// The stands are one section module repeated between aisles (src/world/arenaModules.ts draws them from these numbers).

/** Signed angle difference a − b in (−π, π]. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** The wrestlers' tunnel: a passage through the stands opposite the public gate (+z, angle 0), to their own gate. */
export const TUNNEL_A = 0, TUNNEL_HALF = 0.12;
export const inTunnel = (a: number, half = TUNNEL_HALF) => Math.abs(angleDiff(a, TUNNEL_A)) < half;
/** Aisles with stairs up the three tiers, between the sections (angles measured like the gate, as atan2(x, z)). */
export const AISLES: readonly number[] = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
/** Half the angular width of an aisle (about 2 m wide on the first tier: room to climb past the stands' colliders). */
export const AISLE_HALF = 0.055;
export const inAisle = (a: number, half = AISLE_HALF) => AISLES.some(x => Math.abs(angleDiff(a, x)) < half);
/**
 * Where a spectator place may be on the tiers: not in the gate, an aisle or the tunnel (with a little room either side).
 * The stand seats of the arena visit and the crowd should use it, so nobody sits on a stair.
 */
export const standOpen = (a: number) => !inGate(a, GATE_HALF + 0.05) && !inAisle(a, AISLE_HALF + 0.02) && !inTunnel(a, TUNNEL_HALF + 0.04);
/** Gaps in the ring of stands as [centre angle, half width]: the tunnel, the aisles, the public gate. */
export const STAND_GAPS: readonly [number, number][] = ([[TUNNEL_A, TUNNEL_HALF], ...AISLES.map(a => [a, AISLE_HALF]), [Math.PI, GATE_HALF]] as [number, number][])
  .sort((x, y) => x[0] - y[0]);
/** A section of seats between two gaps, going round from the tunnel (A) through the gate (between D and E) to H. */
export interface StandSection { id: string; a0: number; a1: number }
export const SECTIONS: readonly StandSection[] = STAND_GAPS.map(([c, h], i) => {
  const [nc, nh] = STAND_GAPS[(i + 1) % STAND_GAPS.length];
  return { id: 'ABCDEFGH'[i], a0: c + h, a1: (i === STAND_GAPS.length - 1 ? nc + 2 * Math.PI : nc) - nh };
});
/** The aisle stairs: two steps per tier, from the walkway in front of the parapet up to the top tier. */
export const STEP_DEPTH = 0.65, STEP_RISE = 0.45;
/** Where the tunnel opens on the ring side (the wrestlers come out here). */
export const TUNNEL_MOUTH_R = 16.2;
