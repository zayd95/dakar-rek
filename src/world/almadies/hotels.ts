import type { Variant } from './contract';
import { buildBoutique } from './hotels.boutique';
import { buildTower } from './hotels.tower';
import { buildResort } from './hotels.resort';

/**
 * LD2.0-E lane E-H (docs/ld2/LD2_E.md): the district's hotels, three designs in the flagship villa's style at hotel scale. The plan asks for the first M
 * design ('boutique') on the sea front, the second ('tower') on the mall's road, and the L design ('resort') on the sea front's corner block.
 */
export const VARIANTS: Variant[] = [
  { id: 'hotel-boutique', name: 'Hôtel boutique, façade de balcons', size: 'M', build: buildBoutique },
  { id: 'hotel-tower', name: 'Hôtel tour sur son podium', size: 'M', build: buildTower },
  { id: 'hotel-resort', name: 'Resort autour de la cour de la piscine', size: 'L', build: buildResort },
];
