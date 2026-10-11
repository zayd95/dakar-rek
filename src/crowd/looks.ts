import { rng } from '../core/rng';

/**
 * How the crowd's people look (docs/CROWD.md), pure and deterministic: a Dakar crowd's clothes — tees and trousers,
 * boubous (plain bazin or wax prints), long dresses in wax with a headwrap, invented football shirts — headwear (hair,
 * headwraps, caps, kufis), height and build. In the arena's stands a seat always gets the same person
 * (`standLook(seatId, side)`), and the supporters of Baobab (B–C) and Teranga (F–G) wear their écurie's colour.
 *
 * The figures draw all of it from per-instance numbers (src/crowd/rig.ts): colours, a print code and its accent colour,
 * the headwear's height and brim, the build. No new mesh per variant.
 */
export type CrowdStyle = 'tee' | 'boubou' | 'dress' | 'jersey';
export type Headwear = 'hair' | 'wrap' | 'cap' | 'kufi' | 'none';
export interface CrowdLook {
  shirt: number; legs: number; skin: number; style: CrowdStyle;
  /** A dress's headwrap colour (kept for the street's callers); `head` says the same for every style. */
  wrap: number | null;
  head?: Headwear; headColour?: number;
  /**
   * A print on the garment (0 none): wax motifs 1 dots, 2 diamonds, 3 waves; invented football shirts 4 stripes,
   * 5 hoops, 6 sash. `accent`: the motif's colour. A boubou's or a dress's print covers the whole garment.
   */
  print?: number; accent?: number;
  /** Height factor (children 0.55–0.68, adults 0.92–1.07) and build (width of the body, 0.88–1.18). */
  height?: number; build?: number;
  child?: boolean;
}

export const SKINS = [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x45291a] as const;
export const SHIRTS = [0xf2f2ec, 0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0x27407a, 0xe8742c, 0x6b3fa0, 0x9cc8e8, 0x7a1f3d, 0x222428, 0x1f7a44, 0xe8e2d4] as const;
export const TROUSERS = [0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45, 0x4a3f35, 0xd8d0bf] as const;
/** Wax prints: [ground, motif]. */
export const WAX: readonly (readonly [number, number])[] = [
  [0xe58a2f, 0x1f3f8a], [0xc2417f, 0xf4c20d], [0x1f7a44, 0xf2e2b0], [0x2f6fb3, 0xf08a24],
  [0xd9322b, 0x1c1c1f], [0x6b3fa0, 0xf4c20d], [0xf4c20d, 0x7a1f3d], [0x0f6e6e, 0xe8742c],
];
/** Plain bazin boubous: pale and deep dyed colours. */
export const BAZIN = [0xf2f2ec, 0xe8e2d4, 0x9cc8e8, 0x27407a, 0x7a1f3d, 0x6b3fa0, 0xd8c27a, 0x1f7a44] as const;
/** Invented football shirts (no club, no brand): [shirt, accent, print]. */
export const JERSEYS: readonly (readonly [number, number, number])[] = [
  [0x1f3f8a, 0xf4c20d, 4], [0xf2f2ec, 0x1f7a44, 6], [0xe8742c, 0x1c1c1f, 5], [0x0f6e6e, 0xf2f2ec, 4],
  [0x7a1f3d, 0x9cc8e8, 6], [0xf4c20d, 0x1f3f8a, 5], [0x222428, 0xe8742c, 6], [0x9cc8e8, 0x27407a, 4],
];
export const CAPS = [0x1c1c1f, 0xf2f2ec, 0x2f6fb3, 0xd9322b, 0x1f7a44, 0xf4c20d, 0x6b5a45] as const;
export const KUFIS = [0xf2f2ec, 0xe8e2d4, 0x1c1c1f, 0x7a1f3d, 0x27407a] as const;
export const HAIR = 0x2a2220;
/** Wax and jersey print codes. */
export const PRINT = { dots: 1, diamonds: 2, waves: 3, stripes: 4, hoops: 5, sash: 6 } as const;

const pick = <T,>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];
const span = (r: () => number, a: number, b: number) => a + r() * (b - a);

/** A Dakar crowd's mix (the street, the fans walking to the arena, the stands' neutral sections). */
export function defaultLook(r: () => number, shirts: readonly number[] = SHIRTS): CrowdLook {
  const skin = pick(SKINS, r), u = r();
  if (u < 0.28) {                                                             // a long dress, mostly wax, mostly a headwrap
    const wax = r() < 0.7, [ground, motif] = pick(WAX, r), c = wax ? ground : pick(SHIRTS, r);
    const wrap = r() < 0.75 ? (r() < 0.5 ? c : pick(WAX, r)[0]) : null;
    return { style: 'dress', shirt: c, legs: c, skin, wrap, head: wrap !== null ? 'wrap' : 'hair', headColour: wrap ?? HAIR,
      print: wax ? 1 + Math.floor(r() * 3) : 0, accent: motif, height: span(r, 0.92, 1.0), build: span(r, 0.9, 1.1) };
  }
  if (u < 0.48) {                                                             // a boubou: plain bazin or a wax print
    const wax = r() < 0.35, [ground, motif] = pick(WAX, r), c = wax ? ground : pick(r() < 0.8 ? BAZIN : shirts, r);
    const h = r(), head: Headwear = h < 0.4 ? 'kufi' : h < 0.5 ? 'cap' : 'hair';
    return { style: 'boubou', shirt: c, legs: c, skin, wrap: null, head, headColour: head === 'kufi' ? pick(KUFIS, r) : head === 'cap' ? pick(CAPS, r) : HAIR,
      print: wax ? 1 + Math.floor(r() * 3) : 0, accent: motif, height: span(r, 0.95, 1.07), build: span(r, 0.95, 1.18) };
  }
  if (u < 0.58) {                                                             // an invented football shirt
    const [shirt, accent, print] = pick(JERSEYS, r), cap = r() < 0.3;
    return { style: 'jersey', shirt, legs: pick(TROUSERS, r), skin, wrap: null, head: cap ? 'cap' : 'hair', headColour: cap ? pick(CAPS, r) : HAIR,
      print, accent, height: span(r, 0.94, 1.06), build: span(r, 0.88, 1.12) };
  }
  const h = r(), head: Headwear = h < 0.2 ? 'cap' : h < 0.28 ? 'none' : h < 0.33 ? 'kufi' : 'hair';
  return { style: 'tee', shirt: pick(shirts, r), legs: pick(TROUSERS, r), skin, wrap: null, head,
    headColour: head === 'cap' ? pick(CAPS, r) : head === 'kufi' ? pick(KUFIS, r) : HAIR, print: 0, accent: 0, height: span(r, 0.93, 1.06), build: span(r, 0.88, 1.15) };
}

/** A child: tees and invented football shirts, small (on a lap, or standing at the rail by the ring). */
export function childLook(r: () => number): CrowdLook {
  const skin = pick(SKINS, r), girl = r() < 0.45;
  if (girl && r() < 0.6) {
    const [ground, motif] = pick(WAX, r);
    return { style: 'dress', shirt: ground, legs: ground, skin, wrap: null, head: 'hair', headColour: HAIR, print: 1 + Math.floor(r() * 3), accent: motif, height: span(r, 0.55, 0.66), build: 0.92, child: true };
  }
  if (r() < 0.4) { const [shirt, accent, print] = pick(JERSEYS, r); return { style: 'jersey', shirt, legs: pick(TROUSERS, r), skin, wrap: null, head: 'hair', headColour: HAIR, print, accent, height: span(r, 0.55, 0.68), build: 0.92, child: true }; }
  return { style: 'tee', shirt: pick(SHIRTS, r), legs: pick(TROUSERS, r), skin, wrap: null, head: 'hair', headColour: HAIR, print: 0, accent: 0, height: span(r, 0.55, 0.68), build: 0.92, child: true };
}

/** Stable 32-bit hash of an id (FNV-1a): the same seat always gets the same person. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const lookRng = (id: string) => rng(hashId(id) || 1);

// ------------------------------------------------------------------ the stands' two sides
export type LookSide = 'left' | 'right' | 'ends';
/** The écuries' colours on their side of the stands: Baobab green (B–C, the left wrestler's), Teranga red (F–G). */
export const ECURIE_LOOK: Record<'left' | 'right', { name: string; main: number; shades: readonly number[]; accent: number }> = {
  left: { name: 'Baobab', main: 0x1a7a44, shades: [0x1a7a44, 0x1f9d55, 0x15633a], accent: 0xf4c20d },
  right: { name: 'Teranga', main: 0xc8322a, shades: [0xc8322a, 0xd9322b, 0xa82820], accent: 0xf2f2ec },
};
/** Share of a side's supporters wearing their écurie's colour (tees, jerseys, boubous; headwraps and caps besides). */
export const SIDE_SHARE = 0.68;

/**
 * The person on a seat of the stands, from the seat's id alone: a neutral section's mix, or on a side most supporters
 * in their écurie's colour (a tee or a boubou in it, a football shirt with its colour as the accent, a dress with a
 * headwrap in it, a cap in it), the rest mixed. `child`: a child on a lap or at the rail.
 */
export function standLook(id: string, side: LookSide, o: { child?: boolean } = {}): CrowdLook {
  const r = lookRng(id);
  const look = o.child ? childLook(r) : defaultLook(r);
  if (side === 'ends') return look;
  const P = ECURIE_LOOK[side], wear = r() < SIDE_SHARE, shade = pick(P.shades, r);
  if (!wear) return look;
  switch (look.style) {
    case 'dress':
      look.head = 'wrap'; look.headColour = shade; look.wrap = shade;
      if (r() < 0.4) { look.shirt = look.legs = shade; look.accent = P.accent; look.print = look.print || 1; }
      break;
    case 'boubou': look.shirt = look.legs = shade; if (look.print) look.accent = P.accent; break;
    case 'jersey': look.shirt = shade; look.accent = P.accent; break;
    default: look.shirt = shade; look.print = 0;
  }
  if (look.head === 'cap' || (!look.child && look.style === 'tee' && r() < 0.25)) { look.head = 'cap'; look.headColour = r() < 0.5 ? P.main : P.accent; }
  return look;
}
/** Whether a look wears its side's colour somewhere (garment or headwear): the colour mass of a section. */
export function wearsSide(l: CrowdLook, side: 'left' | 'right'): boolean {
  const s = ECURIE_LOOK[side].shades;
  const hat = (l.head === 'wrap' || l.head === 'cap') && l.headColour !== undefined && (s.includes(l.headColour) || l.headColour === ECURIE_LOOK[side].main);
  return s.includes(l.shirt) || hat;
}

// ------------------------------------------------------------------ what the figures draw
/** The headwear's height on the figure (a factor of the crown box: 0.16 m) and whether it has a brim. */
export function headShape(l: CrowdLook): { crown: number; brim: boolean; colour: number } {
  const head = l.head ?? (l.wrap !== null ? 'wrap' : 'hair'), colour = l.headColour ?? (head === 'wrap' ? l.wrap ?? HAIR : HAIR);
  switch (head) {
    case 'wrap': return { crown: 1, brim: false, colour };
    case 'kufi': return { crown: 0.55, brim: false, colour };
    case 'cap': return { crown: 0.45, brim: true, colour };
    case 'none': return { crown: 0, brim: false, colour };
    default: return { crown: 0.32, brim: false, colour: HAIR };
  }
}
/** The print code the figures' shader reads: the motif, plus 8 when it covers the whole garment (boubous, dresses). */
export const printCode = (l: CrowdLook) => (l.print ? l.print + (l.style === 'boubou' || l.style === 'dress' ? 8 : 0) : 0);
