import type { BodyId, PersonLook } from '../actors/humanoid';
import { SIT_HIPS } from '../interact/seats';

/**
 * Who fits where in a car (the driver at the wheel, a VTC passenger in the back, the player beside a taxi driver): seat data per car body, measured on
 * the body the game draws, and the size of each body sitting in it. The chair's Sit put the head through a hatch's roof and the shoes under its sills;
 * a car seat is held in 'SitCar' / 'Drive' (src/actors/humanoid.ts: reclined, the legs out in front), its hips set between the roof and the floor
 * for the body that sits there, and only a body too tall for a low car even so is drawn a little smaller (about its origin, never below MIN_SCALE).
 *
 * The rows are measured by tests/cabinFit.test.ts on the bodies themselves (public/assets/vehicles/<id>.glb, the kit's cars) and held to these numbers.
 */
export interface CabinRow {
  /** The roof's underside over the sitter's head (its lowest point from 0.25 m behind the hips to 0.05 m ahead, the hips' x ± 0.1 m). Vehicle frame, m. */
  roof: number;
  /**
   * The bottom of the body under the shoes: the floor pan's underside; for a body with no floor pan (the kit's cars) the side's lower edge less
   * KIT_SIDE: shoes inboard of the sides (0.4 m and more) stay behind them from any camera looking from above 2.5° (a chase camera 20 m away).
   */
  floor: number;
  /** Clear room ahead of the hips at knee height: to the bulkhead (front row), to the back of the seat ahead (rear row). */
  legroom: number;
}
export interface CabinFit {
  /** The front row (the driver's seat; the front passenger's is the same). */
  front: CabinRow;
  /** The rear row (the VTC passenger's seat, behind the front passenger: the pavement side). */
  rear: CabinRow;
}

/** How far below a kit car's sides (it has no floor pan) a sitter's shoes may go and stay out of sight (see CabinRow.floor). */
export const KIT_SIDE = 0.05;
/** By VehicleSpec id (src/transport/car.ts, modelCars.ts, premiumCars.ts, taxi.ts). */
export const CABINS: Record<string, CabinFit> = {
  // « Teranga »: the city hatch (public/assets/vehicles/teranga.glb)
  teranga: { front: { roof: 1.42, floor: 0.21, legroom: 1.09 }, rear: { roof: 1.418, floor: 0.21, legroom: 0.51 } },
  // « Rafet »: the sporty hatch, the lowest roof of all
  rafet: { front: { roof: 1.342, floor: 0.19, legroom: 1.12 }, rear: { roof: 1.357, floor: 0.19, legroom: 0.52 } },
  // « Berline moderne » (compacte.glb: the Meshy shell has no bulkhead, the front legroom is the kit saloon's)
  car: { front: { roof: 1.424, floor: 0.19, legroom: 1.1 }, rear: { roof: 1.366, floor: 0.19, legroom: 0.56 } },
  // « Berline neuve »: the kit's luxury saloon (no floor pan; its own seats ahead in the back)
  berline: { front: { roof: 1.4, floor: 0.29 - KIT_SIDE, legroom: 1.377 }, rear: { roof: 1.4, floor: 0.29 - KIT_SIDE, legroom: 0.74 } },
  // « Lamane Sport »: the large SUV
  suv: { front: { roof: 1.796, floor: 0.37, legroom: 1.155 }, rear: { roof: 1.779, floor: 0.37, legroom: 0.66 } },
  // « Gaïndé »: the SUV coupé, its roof falling to the tail
  gainde: { front: { roof: 1.678, floor: 0.35, legroom: 1.079 }, rear: { roof: 1.616, floor: 0.35, legroom: 0.59 } },
  // the Dakar taxi (kit): the player rides in front, beside the driver (nobody the game seats rides in its back: the roof there is the rear window's foot)
  taxi: { front: { roof: 1.38, floor: 0.29 - KIT_SIDE, legroom: 1.093 }, rear: { roof: 1.25, floor: 0.29 - KIT_SIDE, legroom: 0.59 } },
};

/**
 * A body held in SitCar or Drive, at its own drawn scale (measured on the skinned meshes: the hips joint above the origin, the top of the hair above the
 * hips, the soles below them, the knees ahead of them). v4 is every passer-by and VTC passenger; meshy_m / meshy_f the player's « homme » / « femme ».
 */
export interface SitterSize { hips: number; up: number; down: number; knee: number }
export const SITTERS: Record<BodyId, SitterSize> = {
  v4: { hips: 0.5, up: 0.837, down: 0.277, knee: 0.5 },
  meshy_m: { hips: 0.53, up: 0.929, down: 0.297, knee: 0.5 },
  meshy_f: { hips: 0.465, up: 0.897, down: 0.272, knee: 0.47 },
};
/**
 * The size of a v4 body dressed in a look, sitting in SitCar (measured on each VTC passenger's look, in the Teranga's back: scripts/check-vtc-ride.mjs
 * reads the same with `vtc.fit()`): a woman's look is drawn 0.95 high (src/actors/humanoid.ts setLook); her puffed hair adds 6 cm, a headwrap tied high
 * 10 cm, a kufi nothing that shows; a dress's hem hangs 3 cm under the shoes, a boubou's 16 cm (the robe drapes from the knees to the floor of the car).
 */
export const LOOK_SIZE = { puff: 0.06, headwrap: 0.1, kufi: 0.005, dress: 0.293, boubou: 0.435 } as const;
export function lookSitter(l: Pick<PersonLook, 'female' | 'hat' | 'hair' | 'style'>): SitterSize {
  const v = SITTERS.v4, k = l.female ? 0.95 : 1;
  const hair = l.hat ? 0 : (l.hair ?? (l.female ? 'puff' : 'short')) === 'puff' ? LOOK_SIZE.puff : 0;
  const hat = l.hat === 'headwrap' ? LOOK_SIZE.headwrap : l.hat === 'kufi' ? LOOK_SIZE.kufi : 0;
  const down = l.style === 'boubou' ? LOOK_SIZE.boubou : l.style === 'dress' ? LOOK_SIZE.dress : v.down;
  return { hips: v.hips * k, up: v.up * k + hair + hat, down: l.style === 'boubou' || l.style === 'dress' ? down : down * k, knee: v.knee * k };   // (the robes' hems as measured, drawn size included)
}

/** Clear room kept under the roof (the body rolls and pitches on its springs, a seated player is placed on the seat, not rolled with it) and over the floor. */
export const ROOF_GAP = 0.03, FLOOR_GAP = 0.02;
/** No body is drawn smaller than this in a seat (a little under 9 % for the tallest in the lowest hatch). */
export const MIN_SCALE = 0.85;
/** How far above a seat's cushion (the kit's seat top) the hips joint sits in the car poses (their hipsY 0.5 against the chair's SIT_HIPS). */
export const CUSHION = 0.5 - SIT_HIPS;

export interface SitterPlace {
  /** The body's origin height (vehicle frame) and its scale (1: as drawn standing). */
  origin: number; scale: number;
  /** Where that puts the hips, the top of the head and the soles. */
  hips: number; head: number; soles: number;
}
/**
 * Where a body sits in a row: the hips on the cushion (`top`, the kit's seat top) when it fits; lower, deeper in the seat, when the head would touch the
 * roof (never below what the floor allows); drawn smaller only when the row is lower than the body sitting, by as little as it takes.
 */
export function placeSitter(row: CabinRow, top: number, s: SitterSize): SitterPlace {
  const ceil = row.roof - ROOF_GAP, ground = row.floor + FLOOR_GAP;
  const scale = Math.max(MIN_SCALE, Math.min(1, (ceil - ground) / (s.up + s.down)));
  const lo = ground + s.down * scale, hi = ceil - s.up * scale;
  const hips = Math.min(hi, Math.max(lo, top + CUSHION));
  return at(hips - s.hips * scale, scale, s);
}
/**
 * A body on a seat whose origin is fixed (the player: main.ts places the seated body at sitOriginY of the seat, whoever it is): the scale that keeps
 * its head under the roof from there (1 when it fits as it is).
 */
export function scaleAt(row: CabinRow, origin: number, s: SitterSize): SitterPlace {
  const scale = Math.max(MIN_SCALE, Math.min(1, (row.roof - ROOF_GAP - origin) / (s.hips + s.up)));
  return at(origin, scale, s);
}
const at = (origin: number, scale: number, s: SitterSize): SitterPlace => {
  const hips = origin + s.hips * scale;
  return { origin: +origin.toFixed(4), scale: +scale.toFixed(4), hips: +hips.toFixed(4), head: +(hips + s.up * scale).toFixed(4), soles: +(hips - s.down * scale).toFixed(4) };
};

/**
 * The seat's `top` (SeatSpec.y) for the player's seat of a row, plus SIT_HIPS (main.ts sits whoever it is at top − SIT_HIPS): the origin a v4 body
 * takes there (placeSitter), raised if need be until every body the player can have keeps its shoes over the floor once scaled to the roof there
 * (scaleAt: src/transport/ownedModule.ts and taxi.ts apply that scale).
 */
export function playerSeatTop(row: CabinRow, top: number): number {
  const ground = row.floor + FLOOR_GAP - 1e-4, bodies = Object.values(SITTERS);
  let origin = placeSitter(row, top, SITTERS.v4).origin;
  for (let i = 0; i < 60 && bodies.some(b => scaleAt(row, origin, b).soles < ground); i++) origin += 0.002;
  return +(origin + SIT_HIPS).toFixed(4);
}
/** The row of a spec seat id: the driver and the front passenger in front, the rest behind. */
export const rowOf = (fit: CabinFit, seatId: string) => (seatId === 'driver' || seatId === 'front' ? fit.front : fit.rear);
