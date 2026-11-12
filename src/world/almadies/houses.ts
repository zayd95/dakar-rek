import type { Variant } from './contract';
import { ell } from './houses.ell';
import { stacked } from './houses.stacked';
import { terraces } from './houses.terraces';

/**
 * LD2.0-E (docs/ld2/LD2_E.md), lane E-V: the houses' designs: compact two-storey homes of a 22 × 22 m lot behind a low wall, a street balcony, a carport
 * or garage, a small garden; three silhouettes in the villa's finishes.
 */
export const VARIANTS: Variant[] = [
  { id: 'house-m1', name: 'Maison empilée', size: 'S', build: stacked },
  { id: 'house-m2', name: 'Maison en L', size: 'S', build: ell },
  { id: 'house-m3', name: 'Maison à gradins', size: 'S', build: terraces },
];
