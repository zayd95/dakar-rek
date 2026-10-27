import type { Variant } from './contract';
import { ngor } from './residences.ngor';
import { courtyard } from './residences.courtyard';
import { screen } from './residences.screen';
import { stack } from './residences.stack';

/**
 * LD2.0-E (docs/ld2/LD2_E.md): the residences' designs, in the order the plan asks for them: S: ngor; M: stack, screen; L: courtyard.
 */
export const VARIANTS: Variant[] = [
  { id: 'residence-ngor', name: 'Résidence de Ngor', size: 'S', build: ngor },
  { id: 'residence-stack', name: 'Balcons décalés sur pilotis', size: 'M', build: stack },
  { id: 'residence-screen', name: 'Brise-soleil sur loggias', size: 'M', build: screen },
  { id: 'residence-courtyard', name: 'Cour-jardin à portail', size: 'L', build: courtyard },
];
