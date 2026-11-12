/**
 * The compact wording of a shop's menu (presentation only, keyed by the action's id): a short title and a line
 * icon (src/ui/glyphs.ts). The action itself, its price and what it does are untouched; an id missing here shows its normal label.
 */
export interface ShopCopy { short?: string; glyph?: string }
export const SHOP_COPY: Record<string, ShopCopy> = {
  'pain-lait': { short: 'Pain et lait', glyph: 'basket' },
  'boutique-stock': { short: 'Ranger le stock', glyph: 'box' },
  'boutique-salut': { short: 'Parler à Mamadou', glyph: 'chat' },
  tiak: { short: 'Livraisons Tiak Tiak', glyph: 'bike' },
  sucre: { short: 'Sucre et thé', glyph: 'cup' },
  sucre_voisin: { short: 'Sucre et thé', glyph: 'cup' },
};
