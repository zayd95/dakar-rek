import type { Variant } from './contract';
import { placeholders } from './massing';

/**
 * LD2.0-E (docs/ld2/LD2_E.md): the houses' designs. Placeholders (a plain massing) until the lane's builders land: replace this array with the
 * real variants (each a `Variant`: id, name for the catalogue, the site size it fits, its `SiteBuilder`).
 */
export const VARIANTS: Variant[] = placeholders('house');
