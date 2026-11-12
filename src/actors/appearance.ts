import { AVATARS, type Avatar } from '../core/types';

/**
 * The player's look, chosen in the character studio (src/ui/characterStudio.ts). Pure data and rules: what the choices are, what a saved value may be, how a
 * look travels to other players. How it is drawn is src/actors/meshyLook.ts (the skin and garment shader) and src/actors/hairStyles.ts (hair and headwear).
 *
 * The Meshy bodies are one fused shell each (skin, clothes and hair in one surface, one texture), so only what genuinely works on them is offered: the skin and
 * the main garment are recoloured in the shader from what the texture shows, the garment can take a print (plain, stripes, a geometric textile print) with a
 * matching colour of trousers, and the baked hair can be taken in onto the skull (the 'shave' morph target) to wear a procedural style. The silhouette of the
 * clothes never changes: a tee stays a tee, a bomber a bomber.
 */
export type HairId = 'natural' | 'shaved' | 'afro' | 'puff' | 'wrap' | 'kufi';
export const HAIRS: readonly HairId[] = ['natural', 'shaved', 'afro', 'puff', 'wrap', 'kufi'];
export interface Appearance {
  /** Index in SKINS. */
  skin: number;
  hair: HairId;
  /** Index in OUTFITS. */
  outfit: number;
  /** Index in COLORS: the colour of the main garment (and of a headwrap). */
  color: number;
}

export interface Tone { label: string; hex: number }
/**
 * Six complexions, light to very dark, each one a colour a Dakar street really shows. The shader keeps the texture's own shading, lips and blush on them
 * (src/actors/meshyLook.ts), so these are the mid-tones of the face, not flat paint. The bodies' own skin is about « Brun ».
 */
export const SKINS: readonly Tone[] = [
  { label: 'Clair', hex: 0xe6b28e }, { label: 'Doré', hex: 0xcd9163 }, { label: 'Caramel', hex: 0xad7147 },
  { label: 'Cannelle', hex: 0x8b5533 }, { label: 'Brun', hex: 0x6b3f26 }, { label: 'Ébène', hex: 0x52301f },
];
/**
 * Six garment colours, muted enough to sit together. Index i matches the online presence's shirt colour i (src/multiplayer/avatars.ts SHIRT_COLORS: green,
 * blue, red, yellow, purple, white): a player on an older client or server, which only carries that index, still sees the same family of colour.
 */
export const COLORS: readonly Tone[] = [
  { label: 'Émeraude', hex: 0x1f8a5e }, { label: 'Indigo', hex: 0x34508f }, { label: 'Terracotta', hex: 0xc0532f },
  { label: 'Safran', hex: 0xe2a427 }, { label: 'Prune', hex: 0x663d82 }, { label: 'Ivoire', hex: 0xece4d2 },
];
/** Whether a garment colour reads as light, so its stripes and print take dark inks: its linear luminance, judged the same way by the shader and the outfit cards. */
export function lightCloth(hex: number): boolean {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255) > 0.45;
}
export type Print = 'uni' | 'stripe' | 'print';
export interface OutfitSpec { id: string; label: string; print: Print; /** Colour of the trousers (null: the body's own jeans). */ bottom: number | null }
/** Three treatments of the same garments, named for what they are: plain, striped, printed. */
export const OUTFITS: readonly OutfitSpec[] = [
  { id: 'uni', label: 'Uni', print: 'uni', bottom: null },
  { id: 'raye', label: 'Rayé', print: 'stripe', bottom: 0x7d828c },
  { id: 'imprime', label: 'Imprimé', print: 'print', bottom: 0xc9b48e },
];
/** The hairstyles each body offers, in the order shown. A style missing from a body's list is never drawn on it. */
export const HAIRS_FOR: Record<Avatar, readonly HairId[]> = {
  homme: ['natural', 'shaved', 'afro', 'kufi'],
  femme: ['natural', 'afro', 'puff', 'wrap'],
};
export const HAIR_LABEL: Record<Avatar, Partial<Record<HairId, string>>> = {
  homme: { natural: 'Court', shaved: 'Rasé', afro: 'Afro', kufi: 'Kufi' },
  femme: { natural: 'Locks', afro: 'Afro', puff: 'Chignon', wrap: 'Foulard' },
};
/** On the other body, a style it does not offer becomes its nearest one: headwear stays headwear, volume stays volume. */
const HAIR_SWAP: Record<HairId, HairId> = { natural: 'natural', shaved: 'puff', afro: 'afro', puff: 'afro', wrap: 'kufi', kufi: 'wrap' };
export const hairFor = (a: Avatar, h: HairId): HairId => HAIRS_FOR[a].includes(h) ? h : HAIRS_FOR[a].includes(HAIR_SWAP[h]) ? HAIR_SWAP[h] : 'natural';
/** The same look on the other body: everything carries over, the hairstyle becomes its nearest equivalent there. */
export const onBody = (a: Avatar, look: Appearance): Appearance => ({ ...look, hair: hairFor(a, look.hair) });

/** The look a body has with nothing chosen (`null` in a save: no tint, baked hair), as the studio's starting point. */
export const defaultAppearance = (a: Avatar): Appearance => ({ skin: 4, hair: 'natural', outfit: 0, color: a === 'homme' ? 1 : 0 });

const int = (v: unknown, n: number, d: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : d;
/** A saved value, or garbage, to a valid look for that body (null stays null: an older save draws the body as it was made). */
export function appearanceOf(raw: unknown, body: Avatar = 'homme'): Appearance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>, d = defaultAppearance(body);
  const hair = (HAIRS as readonly unknown[]).includes(r.hair) ? hairFor(body, r.hair as HairId) : d.hair;
  return { skin: int(r.skin, SKINS.length, d.skin), hair, outfit: int(r.outfit, OUTFITS.length, d.outfit), color: int(r.color, COLORS.length, d.color) };
}
export const sameAppearance = (a: Appearance | null, b: Appearance | null) => !!a && !!b && a.skin === b.skin && a.hair === b.hair && a.outfit === b.outfit && a.color === b.color;
export const isAvatar = (v: unknown): v is Avatar => (AVATARS as readonly unknown[]).includes(v);

/**
 * A look on the wire (presence field `app`, src/multiplayer/protocol.ts): five characters, body · skin · hair · outfit · colour, e.g. `f3w21`. Strictly parsed:
 * anything else is no look (the player is drawn as before).
 */
const HAIR_CODE: Record<HairId, string> = { natural: 'n', shaved: 's', afro: 'a', puff: 'p', wrap: 'w', kufi: 'k' };
export function encodeAppearance(body: Avatar, a: Appearance): string {
  return `${body === 'femme' ? 'f' : 'm'}${a.skin}${HAIR_CODE[a.hair]}${a.outfit}${a.color}`;
}
export function decodeAppearance(code: unknown): { body: Avatar; look: Appearance } | null {
  if (typeof code !== 'string' || !/^[mf][0-5][nsapwk][0-2][0-5]$/.test(code)) return null;
  const body: Avatar = code[0] === 'f' ? 'femme' : 'homme', hair = (Object.keys(HAIR_CODE) as HairId[]).find(h => HAIR_CODE[h] === code[2])!;
  return { body, look: { skin: Number(code[1]), hair: hairFor(body, hair), outfit: Number(code[3]), color: Number(code[4]) } };
}

/** Suggested first names (step 1): common in Senegal, short; a suggestion, never required. */
export const NAME_SUGGESTIONS: readonly string[] = ['Awa', 'Moussa', 'Fatou', 'Ibrahima', 'Aminata', 'Cheikh', 'Khady', 'Ousmane', 'Mariama', 'Pape', 'Seynabou', 'Modou', 'Ndeye', 'Lamine', 'Coumba', 'Babacar'];
/** The first-name rule: letters, digits, spaces, apostrophe and hyphen, 2–16 long (a subset of the presence's nickname(), which still applies online). */
export function cleanFirstName(raw: string): string {
  return raw.normalize('NFC').replace(/[^\p{L}\p{N}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
export const validFirstName = (raw: string) => cleanFirstName(raw).length >= 2;
