import type { Facing } from '../villaCompound';
import { E, GRID, HALF, type GateSide, type PaletteName, type Rect, type Site, type SiteKind } from './contract';

/**
 * LD2.0-E: the Almadies district's plan (docs/ld2/LD2_E.md decision 2): 30 sites on the hub's 41 free lots, curated. Hotels and the large residences
 * on the sea front and the avenues, villas round the flagship, houses in the quiet rows; neighbours never share a design, and the mirrored ones face
 * each other across the street. Block (i, j) stands at −HALF + ROAD + 60 i (x) and … 60 j (z); its lots 0…3 (north-west, north-east, south-west,
 * south-east) are 22 m squares 2 m apart; the north row's lots face the road on the north, the south row's the road on the south.
 *
 * Not in the plan (they have their own builders and stay as they are): the port (2,0), the station (1,2), the mall (2,2), the square (3,2), Prestige
 * Auto (0,2), the restaurant (0,1 lot 0), the café (3,1 lot 1), the flagship villa (1,1 lot 3).
 */
const blockMin = (k: number) => -HALF + GRID.road + k * GRID.pitch;
/** A lot's rectangle in the hub (metres). */
export function lotRect(i: number, j: number, lot: number): Rect {
  const a = lot % 2, b = lot >> 1, x0 = blockMin(i) + a * (GRID.lot + GRID.gap), z0 = blockMin(j) + b * (GRID.lot + GRID.gap);
  return { x0, z0, x1: x0 + GRID.lot, z1: z0 + GRID.lot };
}
const union = (i: number, j: number, lots: readonly number[]): Rect => {
  const rs = lots.map(l => lotRect(i, j, l));
  return { x0: Math.min(...rs.map(r => r.x0)), z0: Math.min(...rs.map(r => r.z0)), x1: Math.max(...rs.map(r => r.x1)), z1: Math.max(...rs.map(r => r.z1)) };
};
/** The lots the district leaves to their own builders: block → lots. */
export const KEPT_LOTS: Record<string, number[]> = { '0,1': [0], '3,1': [1], '1,1': [3] };

interface Row { at: [number, number]; lots: number[]; kind: SiteKind; variant: number; palette: PaletteName; storeys: number; facing?: Facing; mirror?: boolean; name?: string; gate?: GateSide }
const R = (at: [number, number], lots: number[], kind: SiteKind, variant: number, palette: PaletteName, storeys: number, o: Partial<Row> = {}): Row => ({ at, lots, kind, variant, palette, storeys, ...o });
// the sea front (row 0), the avenues (rows 1 and 3): [block, lots, kind, variant, palette, storeys, options]
const ROWS: Row[] = [
  R([0, 0], [0, 1, 2, 3], 'hotel', 0, 'azur', 5, { facing: 'south', name: 'HÔTEL BAOBAB AZUR', gate: 'right' }),
  R([1, 0], [0, 1], 'hotel', 0, 'oak', 4, { name: 'HÔTEL LE FILAO', gate: 'right' }),
  R([1, 0], [2], 'villa', 0, 'ivory', 2, { gate: 'right' }),
  R([1, 0], [3], 'villa', 1, 'sand', 3, { mirror: true, gate: 'right' }),
  R([3, 0], [0, 1], 'residence', 0, 'ivory', 6, { name: 'RÉSIDENCE LES ALIZÉS', gate: 'centre' }),
  R([3, 0], [2], 'house', 0, 'greige', 2, { gate: 'left' }),
  R([3, 0], [3], 'house', 1, 'oak', 2, { mirror: true, gate: 'left' }),
  R([0, 1], [1], 'villa', 2, 'terracotta', 2, { gate: 'right' }),
  R([0, 1], [2], 'house', 2, 'ivory', 2, { gate: 'left' }),
  R([0, 1], [3], 'house', 0, 'sand', 2, { mirror: true, gate: 'left' }),
  R([1, 1], [0], 'villa', 3, 'greige', 3, { gate: 'right' }),
  R([1, 1], [1], 'villa', 0, 'oak', 2, { mirror: true, gate: 'right' }),
  R([1, 1], [2], 'residence', 0, 'ivory', 4, { name: 'RÉSIDENCE DE NGOR', gate: 'centre' }),
  R([2, 1], [0, 1], 'residence', 1, 'greige', 6, { name: 'RÉSIDENCE KËR SALAM', gate: 'centre' }),
  R([2, 1], [2], 'villa', 1, 'azur', 2, { gate: 'right' }),
  R([2, 1], [3], 'house', 1, 'terracotta', 2, { mirror: true, gate: 'left' }),
  R([3, 1], [0], 'house', 2, 'oak', 2, { gate: 'left' }),
  R([3, 1], [2], 'villa', 2, 'ivory', 3, { gate: 'right' }),
  R([3, 1], [3], 'villa', 3, 'sand', 2, { mirror: true, gate: 'right' }),
  R([0, 3], [0], 'house', 0, 'azur', 2, { gate: 'left' }),
  R([0, 3], [1], 'villa', 0, 'terracotta', 2, { mirror: true, gate: 'right' }),
  R([0, 3], [2], 'villa', 1, 'oak', 3, { gate: 'right' }),
  R([0, 3], [3], 'house', 1, 'greige', 2, { mirror: true, gate: 'left' }),
  R([1, 3], [0, 1, 2, 3], 'residence', 0, 'sand', 5, { facing: 'north', name: 'RÉSIDENCE JARDINS DE NGOR', gate: 'centre' }),
  R([2, 3], [0, 1], 'hotel', 1, 'ivory', 8, { name: 'HÔTEL OCÉANE', gate: 'right' }),
  R([2, 3], [2], 'villa', 2, 'greige', 2, { gate: 'right' }),
  R([2, 3], [3], 'villa', 0, 'azur', 3, { mirror: true, gate: 'right' }),
  R([3, 3], [0, 1], 'residence', 1, 'terracotta', 6, { name: 'RÉSIDENCE LES CORMORANS', gate: 'centre', mirror: true }),
  R([3, 3], [2], 'house', 2, 'sand', 2, { gate: 'left' }),
  R([3, 3], [3], 'house', 0, 'ivory', 2, { mirror: true, gate: 'left' }),
];

export const SITES: Site[] = ROWS.map((r, k) => {
  const [i, j] = r.at, rect = union(i, j, r.lots), first = r.lots[0];
  return {
    id: `almadies:${i},${j}:${r.lots.join('')}`, kind: r.kind, variant: r.variant, block: [i, j], lots: r.lots, rect,
    facing: r.facing ?? (first >> 1 ? 'south' : 'north'), mirror: r.mirror ?? false, storeys: r.storeys, palette: r.palette,
    ...(r.name ? { name: r.name } : {}), number: String(8 + 2 * k), gate: r.gate ?? 'centre',
  };
});
/** The site whose lots include a lot of a block (the builder's dry run asks: does the district draw this lot?). */
export function siteOfLot(i: number, j: number, lot: number): Site | undefined { return SITES.find(s => s.block[0] === i && s.block[1] === j && s.lots.includes(lot)); }
/** Where a site's street wall stands in the hub (the street edge's z), the gate's apron before it. */
export const streetEdge = (s: Pick<Site, 'rect' | 'facing'>) => s.facing === 'south' ? s.rect.z1 : s.rect.z0;
export { E };
