import type { Variant } from './contract';
import { arcade } from './villas.arcade';
import { cantilever } from './villas.cantilever';
import { pavilion } from './villas.pavilion';
import { tower } from './villas.tower';

/**
 * LD2.0-E (docs/ld2/LD2_E.md), lane E-V: the villas' designs, in the flagship villa's family (ivory render, travertine, oak, bronze, glass; thin
 * cantilevered slabs, glass guards, a teak door in a portal, a roof terrace, a pool seen over the wall). Four designs of a 22 × 22 m lot.
 */
export const VARIANTS: Variant[] = [
  { id: 'villa-c1', name: 'Villa Porte-à-faux', size: 'S', build: cantilever },
  { id: 'villa-c2', name: 'Villa des Arcades', size: 'S', build: arcade },
  { id: 'villa-c3', name: 'Villa des Pavillons', size: 'S', build: pavilion },
  { id: 'villa-c4', name: 'Villa de la Tour', size: 'S', build: tower },
];
