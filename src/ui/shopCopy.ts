/**
 * The compact wording of a shop's menu (presentation only, keyed by the action's id): a short title, a two-word kind line and a line
 * icon (src/ui/glyphs.ts). The action itself, its price and what it does are untouched; an id missing here shows its normal label.
 */
export interface ShopCopy { short?: string; tag?: string; glyph?: string }
export const SHOP_COPY: Record<string, ShopCopy> = {
  'pain-lait': { short: 'Pain et lait', tag: 'Petit-déjeuner', glyph: 'basket' },
  'boutique-stock': { short: 'Ranger le stock', tag: 'Petit boulot', glyph: 'box' },
  'boutique-salut': { short: 'Parler à Mamadou', glyph: 'chat' },
  tiak: { short: 'Livraisons Tiak Tiak', glyph: 'bike' },
  sucre: { short: 'Sucre et thé', tag: 'Pour l’attaya', glyph: 'cup' },
  sucre_voisin: { short: 'Sucre et thé', tag: 'Prix de voisin', glyph: 'cup' },
};
