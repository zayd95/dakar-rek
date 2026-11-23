/**
 * Plateau · Médina, M2 « My First Trade » (docs/districts/M2-PLATEAU-MEDINA.md): the two places of the trade, shared by the hub builder
 * (src/world/builder.ts, which builds them on two lots it keeps for them) and the gameplay module. World frame of the Plateau hub: x east, z south.
 * - The wholesaler, on the Médina side (south-west): Diallo & Frères, an old two-storey depot with its forecourt of sacks, cartons and crates and a
 *   loading bay at the kerb of the street at x = −60. Block (0, 2), its north-east lot (on the corner with the street at z = 0).
 * - The buyer, on the Plateau side (north-east): the Comptoir Sall, a trading house under an arcade, with its own bay at the kerb of the street at
 *   x = 60. Block (3, 0), its south-west lot (on the corner with the street at z = −60).
 * The way between them is about 200 m by road, with two turns.
 */
export interface TradePlace {
  id: string;
  name: string;
  /** The hub lot it stands on (block i, j; lot a, b as src/world/builder.ts lotRect). */
  lot: { i: number; j: number; a: number; b: number };
  /** Where the trader stands, facing the street (yaw: the game's frame, 0 along +z). */
  keeper: { x: number; z: number; yaw: number };
  /** The loading bay on the carriageway, at the kerb in front (kept clear of parked cars and street dressing). */
  bay: { x0: number; z0: number; x1: number; z1: number };
  /** Where goods are set down: the forecourt (wholesaler) or the arcade (buyer). A vehicle within `reach` m of it can load or unload. */
  dock: { x: number; z: number; reach: number };
  /** The forecourt or arcade and the pavement before it: kept clear of street dressing and parked cars. */
  front: { x0: number; z0: number; x1: number; z1: number };
}

export const GROSSISTE: TradePlace = {
  id: 'plateau:grossiste', name: 'Diallo & Frères · grossiste',
  lot: { i: 0, j: 2, a: 1, b: 0 },
  keeper: { x: -72.2, z: 17.2, yaw: Math.PI / 2 },
  bay: { x0: -66.9, z0: 10.5, x1: -61.4, z1: 25.5 },
  dock: { x: -69.5, z: 18, reach: 9 },
  front: { x0: -74, z0: 7, x1: -67, z1: 29 },
};

export const COMPTOIR: TradePlace = {
  id: 'plateau:comptoir', name: 'Comptoir Sall · gros et demi-gros',
  lot: { i: 3, j: 0, a: 0, b: 1 },
  keeper: { x: 70.6, z: -79.5, yaw: -Math.PI / 2 },
  bay: { x0: 61.4, z0: -87, x1: 66.9, z1: -72 },
  dock: { x: 69.5, z: -79.5, reach: 9 },
  front: { x0: 67, z0: -89, x1: 72.6, z1: -67 },
};

export const TRADE_PLACES = [GROSSISTE, COMPTOIR] as const;
export const isTradeLot = (i: number, j: number, a: number, b: number) =>
  TRADE_PLACES.find(p => p.lot.i === i && p.lot.j === j && p.lot.a === a && p.lot.b === b) ?? null;
