/**
 * The city at night, as rules (pure, unit-tested; src/city/night.ts draws it). Dakar's street lamps are warm and not
 * all in working order: a few are out, a few flicker; the ones round the arena are kept bright for the fight nights.
 * Vehicles on the move have their lights on; parked ones do not. The arena's floodlights burn from the doors to the
 * close of a gala evening once it is getting dark. All of it follows the shared clock, so everyone sees the same lamps
 * out and the same floodlights on.
 */
import { GALA } from '../arena/program';
import { inHours } from '../social/ambient';
import { LEGACY_TAGS } from '../social/ambientData';

const frac = (x: number) => x - Math.floor(x);
/** Stable hash of a position (0–1). */
export const spotHash = (x: number, z: number, salt = 0) => frac(Math.sin(Math.round(x * 10) * 12.9898 + Math.round(z * 10) * 78.233 + salt * 37.719) * 43758.5453);

/** How dark it is (0 day … 1 night), from the sky's daylight (0–1): the same ramp as the city's lamps (main.ts). */
export const nightOf = (daylight: number) => 1 - Math.min(1, Math.max(0, daylight * 3.2));

export type LampState = 'on' | 'flicker' | 'out';
/** Share of the street lamps that are out, and that flicker. */
export const LAMPS_OUT = 0.07, LAMPS_FLICKER = 0.05;

/**
 * A street lamp's state from where it stands (the same for everyone): most are on, about 7 % are out and 5 % flicker
 * — except near the arena gate (`keep`), where the way in stays lit.
 */
export function lampState(x: number, z: number, keep = false): LampState {
  if (keep) return 'on';
  const h = spotHash(x, z, 1);
  return h < LAMPS_OUT ? 'out' : h < LAMPS_OUT + LAMPS_FLICKER ? 'flicker' : 'on';
}

/** A lamp's own warmth (old sodium lamps differ a little): 0.85–1.05, brighter (×1.3) round the arena. */
export function lampWarmth(x: number, z: number, nearArena: boolean): number {
  return (0.85 + 0.2 * spotHash(x, z, 2)) * (nearArena ? 1.3 : 1);
}

/**
 * Brightness of a flickering lamp at time t (seconds): mostly lit, with short cut-outs and stutters at irregular
 * moments (its own rhythm from `seed`). 0.1 when it cuts out, 1 when lit.
 */
export function flicker(t: number, seed: number): number {
  const slow = frac(t * 0.23 + seed * 7.1);                 // every ~4 s a chance of trouble
  if (slow < 0.12) {
    const fast = frac(t * 9.3 + seed * 3.3);                // a stutter: on / off a few times
    return fast < 0.5 ? 0.1 : 0.8;
  }
  if (slow < 0.16) return 0.1;                               // a short cut-out
  return 0.92 + 0.08 * Math.sin(t * 31 + seed * 17);        // the hum of a working lamp
}

/** A vehicle shows its lights when it moved in the last `keep` seconds (stopped at a stop or in a jam: still on). */
export const LIGHTS_KEEP = 20;
export const vehicleLit = (night: number, sinceMoved: number) => night > 0.2 && sinceMoved < LIGHTS_KEEP;

/** The arena's floodlights: from the doors (17 h) to just after the close (23 h 30) of the evening, once dusk falls. */
export const FLOOD = { from: GALA.doors, to: GALA.close + 0.5 } as const;
export function floodlights(hour: number, night: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < FLOOD.from || h >= FLOOD.to) return 0;
  return Math.min(1, Math.max(0, (night - 0.05) / 0.35));   // they come on with the dusk, full when it is dark
}

/** Pool centres and radii of a merged geometry of square light pools (4 vertices each, as src/world/builder.ts makes them). */
export function poolsOf(pos: ArrayLike<number>): { x: number; z: number; r: number; first: number }[] {
  const out: { x: number; z: number; r: number; first: number }[] = [];
  for (let v = 0; v + 3 < pos.length / 3; v += 4) {
    let x = 0, z = 0, x0 = Infinity, x1 = -Infinity;
    for (let k = 0; k < 4; k++) { const px = pos[(v + k) * 3], pz = pos[(v + k) * 3 + 2]; x += px; z += pz; x0 = Math.min(x0, px); x1 = Math.max(x1, px); }
    out.push({ x: x / 4, z: z / 4, r: (x1 - x0) / 2, first: v });
  }
  return out;
}
/** Street lamp pools are 5.5 m in radius (src/world/builder.ts); the shops' and squares' pools are other sizes. */
export const STREET_POOL_R = 5.5;
export const isStreetPool = (r: number) => Math.abs(r - STREET_POOL_R) < 0.05;

/**
 * The warm wash of a lit shop, from its footprint and its open front: a box a little inside the room (its inner faces
 * glow over the back wall and shelves seen from the street) and a pool of light spilling onto the pavement in front.
 */
export function shopWash(bounds: { x0: number; x1: number; z0: number; z1: number }, front: { x: number; z: number }, height = 3.2) {
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
  const w = Math.max(0.5, bounds.x1 - bounds.x0 - 0.5), d = Math.max(0.5, bounds.z1 - bounds.z0 - 0.5);
  const dx = front.x - cx, dz = front.z - cz, len = Math.hypot(dx, dz) || 1;
  return { box: { x: cx, z: cz, w, d, h: Math.max(1.5, height - 0.4) }, spill: { x: front.x + (dx / len) * 2.2, z: front.z + (dz / len) * 2.2, r: 3.2 } };
}

/** The kiosks and eateries that glow at night (interactable id fragments of the hub builders). */
export const KIOSK_KINDS = [':gargote:', ':maiga:', ':cafe:', ':restaurant:', ':dibiterie:'] as const;
/** A kiosk's opening hours (src/social/ambientData.ts LEGACY_TAGS), or null when the interactable is not a kiosk. */
export function kioskHours(id: string): readonly [number, number] | null {
  if (!KIOSK_KINDS.some(k => id.includes(k))) return null;
  return LEGACY_TAGS.find(t => id.includes(t.has))?.hours ?? [0, 24];
}
/** A kiosk glows while it is open (the Dibi until 2 h; the cafés close at 22 h and go dark). */
export const kioskLit = (id: string, hour: number) => { const h = kioskHours(id); return !!h && inHours(hour, h); };
