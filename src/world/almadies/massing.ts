import { E, GROUND, STOREY, type SiteBuilder, type SiteKind, type SiteSize, type Variant } from './contract';
import { balcony, canopy, door, glazing, parapet, perimeter, planter, roofPlant, slabEdge, solidBox, volume, nameBoard, palm } from './parts';

/**
 * LD2.0-E: the plain massing every kind starts as (a block with its glazing, a balcony per storey, a door, a roof) until its lane's designs land: a
 * smoke test of the shared pieces and the district's pipeline, and what a site falls back to if a variant is missing. Not a design: the lanes replace
 * the `VARIANTS` arrays that use it.
 */
export const massing: SiteBuilder = d => {
  const { site: s, p } = d, ex = d.w / 2, n = s.storeys, H = n * STOREY;
  perimeter(d, { gate: s.gate, front: s.kind === 'hotel' ? 'low' : 'wall' });
  const bw = Math.min(d.w - 8, s.kind === 'house' ? 12 : s.kind === 'villa' ? 14 : d.w - 10), bd = Math.min(d.depth - 14, s.kind === 'house' ? 9 : 10);
  const r = { x0: -bw / 2, x1: bw / 2, z1: E - 6.5, z0: E - 6.5 - bd };
  volume(d, r, GROUND, GROUND + H, p.render);
  slabEdge(d, r, GROUND + H + 0.1, 0.25, 0.4);
  parapet(d, { x0: r.x0 - 0.3, x1: r.x1 + 0.3, z0: r.z0 - 0.3, z1: r.z1 + 0.3 }, GROUND + H + 0.1, { glass: true });
  for (let k = 0; k < n; k++) {
    const y = GROUND + k * STOREY + 0.45;
    glazing(d, { face: 'street', at: r.z1, u0: r.x0 + 1.2, u1: r.x1 - 1.2, y0: y, y1: y + 2.3 });
    if (k > 0) balcony(d, { face: 'street', at: r.z1, u0: r.x0 + 1.2, u1: r.x1 - 1.2, y: GROUND + k * STOREY, depth: 1.5 });
  }
  door(d, { face: 'street', x: 0, z: r.z1, portal: s.kind !== 'house' });
  canopy(d, { x0: -1.6, x1: 1.6, z0: r.z1, z1: r.z1 + 1.6 }, GROUND + 3.0, { light: true });
  planter(d, -3.5, r.z1 + 1.2, 2.2, 0.7); planter(d, 3.5, r.z1 + 1.2, 2.2, 0.7);
  roofPlant(d, r, GROUND + H + 0.35);
  palm(d, -ex + 2.2, E - 2.5, 1, 0.3);
  if (s.kind !== 'house') palm(d, ex - 2.2, E - 2.5, 0.9, 1.1);
  if (s.name) nameBoard(d, s.name, { x: 0, z: E - 0.1, y: 3.6, w: 5, h: 0.9 });
  solidBox(d, r, H + 0.35);
};

const sizes: Record<SiteKind, [SiteSize, number][]> = {
  house: [['S', 3]], villa: [['S', 4]], hotel: [['M', 2], ['L', 1]], residence: [['S', 1], ['M', 2], ['L', 1]],
};
/** Placeholder variants for a kind: as many of each size as the plan asks for. */
export function placeholders(kind: SiteKind): Variant[] {
  return sizes[kind].flatMap(([size, n]) => Array.from({ length: n }, (_, k) => ({ id: `${kind}-${size.toLowerCase()}${k}`, name: `${kind} ${size}${k} (massing)`, size, build: massing })));
}
