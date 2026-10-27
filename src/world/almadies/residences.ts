import type { Variant } from './contract';
import { ngor } from './residences.ngor';
import { stack } from './residences.stack';
import { placeholders } from './massing';

/**
 * LD2.0-E (docs/ld2/LD2_E.md): the residences' designs, in the order the plan asks for them: S: ngor; M: stack, screen; L: courtyard.
 */
const rest = placeholders('residence');
export const VARIANTS: Variant[] = [
  { id: 'residence-ngor', name: 'Résidence de Ngor', size: 'S', build: ngor },
  { id: 'residence-stack', name: 'Balcons décalés sur pilotis', size: 'M', build: stack },
  rest.filter(v => v.size === 'M')[1],
  rest.find(v => v.size === 'L')!,
];
