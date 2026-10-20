import { AVATARS, type Avatar } from '../core/types';

/**
 * The player's chosen look (character creator, src/ui/characterCreator.ts). Pure data and rules: what the choices are, what a saved value
 * may be, what the other players see. How it is drawn is src/actors/meshyLook.ts (the Meshy bodies' tint shader and hair variants).
 *
 * The Meshy bodies are one fused shell (skin, clothes and hair in one surface, one texture), so these are the variations that genuinely work on
 * them and nothing more: the skin and the clothes are recoloured in the shader by what the texture shows (hue keys), the clothes can take a
 * print (plain, striped, wax) and another colour of trousers, the baked hair can be pulled onto the skull (the 'shave' morph target) and
 * dressed with a procedural afro or a headwrap. A shape that the file does not carry (a boubou, shorts, braids) is not offered.
 */
export type HairId = 'natural' | 'shaved' | 'afro' | 'wrap';
export const HAIRS: readonly HairId[] = ['natural', 'shaved', 'afro', 'wrap'];
export interface Appearance {
  /** Index in SKINS. */
  skin: number;
  hair: HairId;
  /** Index in OUTFITS. */
  outfit: number;
  /** Index in COLORS: the colour of the main garment (and of the headwrap). */
  color: number;
}

export interface Tone { label: string; hex: number }
/** Six distinct complexions, light to dark. The Meshy bodies' own skin is about « Marron ». */
export const SKINS: readonly Tone[] = [
  { label: 'Clair', hex: 0xf3c8a0 }, { label: 'Doré', hex: 0xdea370 }, { label: 'Caramel', hex: 0xc08457 },
  { label: 'Brun', hex: 0x94603a }, { label: 'Marron', hex: 0x6b4126 }, { label: 'Ébène', hex: 0x4a2c1c },
];
/**
 * Six colours for the main garment. They are the six shirt colours of the online presence (src/multiplayer/avatars.ts SHIRT_COLORS, in the same
 * order), so the colour chosen here is the colour other players see on the player's shirt: the presence protocol carries a colour index and nothing else.
 */
export const COLORS: readonly Tone[] = [
  { label: 'Vert', hex: 0x1a9d54 }, { label: 'Bleu', hex: 0x2f6fb3 }, { label: 'Rouge', hex: 0xd9482b },
  { label: 'Jaune', hex: 0xf4c20d }, { label: 'Violet', hex: 0x6b3fa0 }, { label: 'Blanc', hex: 0xf2f2ec },
];
export type Print = 'uni' | 'stripe' | 'wax';
export interface OutfitSpec { id: string; label: string; print: Print; /** Colour of the trousers (null: the body's own). */ bottom: number | null }
export const OUTFITS: readonly OutfitSpec[] = [
  { id: 'casual', label: 'Décontracté', print: 'uni', bottom: null },
  { id: 'sport', label: 'Sport', print: 'stripe', bottom: 0x8d939e },
  { id: 'wax', label: 'Wax', print: 'wax', bottom: 0xc8b48c },
];
export const HAIR_LABEL: Record<Avatar, Record<HairId, string>> = {
  homme: { natural: 'Court', shaved: 'Rasé', afro: 'Afro', wrap: 'Foulard' },
  femme: { natural: 'Locks', shaved: 'Rasé', afro: 'Afro', wrap: 'Foulard' },
};

/** What a body wears when nothing was chosen (the look it has always had: no tint, baked hair) is `null`; this is the same look as a starting point for the creator. */
export const defaultAppearance = (a: Avatar): Appearance => ({ skin: 4, hair: 'natural', outfit: 0, color: a === 'homme' ? 1 : 0 });

const int = (v: unknown, n: number, d: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : d;
/** A saved value, or garbage, to a valid look (null stays null: older saves keep the body as it was). */
export function appearanceOf(raw: unknown, body: Avatar | null = 'homme'): Appearance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>, d = defaultAppearance(body ?? 'homme');
  return { skin: int(r.skin, SKINS.length, d.skin), hair: (HAIRS as readonly unknown[]).includes(r.hair) ? r.hair as HairId : d.hair, outfit: int(r.outfit, OUTFITS.length, d.outfit), color: int(r.color, COLORS.length, d.color) };
}
export const sameAppearance = (a: Appearance | null, b: Appearance | null) => !!a && !!b && a.skin === b.skin && a.hair === b.hair && a.outfit === b.outfit && a.color === b.color;
export const isAvatar = (v: unknown): v is Avatar => (AVATARS as readonly unknown[]).includes(v);

/** Suggested first names (step 1): Senegalese, short, for both. */
export const NAME_SUGGESTIONS: readonly string[] = ['Moussa', 'Awa', 'Ibrahima', 'Fatou', 'Cheikh', 'Aminata', 'Modou', 'Khady', 'Ousmane', 'Mariama', 'Pape', 'Seynabou'];
/** The creator's first-name rule: letters, digits, spaces, apostrophe and hyphen, 2–16 long (a subset of protocol nickname(), which the online presence applies anyway). */
export function cleanFirstName(raw: string): string {
  return raw.normalize('NFC').replace(/[^\p{L}\p{N}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
export const validFirstName = (raw: string) => cleanFirstName(raw).length >= 2;
