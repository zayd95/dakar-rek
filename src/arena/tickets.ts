import { SECTIONS } from '../world/geew';

/**
 * The arena's ticket tiers (pure data and rules; tests/tickets.test.ts): three prices at the « Guichet », each for its own
 * stands. A small piece of the arena's economy, on the seats and sections that already exist (src/world/geew.ts
 * SECTIONS A–H, src/arena/program.ts standSeats); the ticket is still paid once per evening (src/arena/module.ts).
 *
 * - « Populaire » 1 000 F: the stands at both ends, by the public gate and the wrestlers' tunnel (A, D, E, H), and the
 *   top row of B, behind the officials' canopy (a view partly hidden).
 * - « Tribune couverte » 2 500 F: the long sides of the ring (C, F, G), under a canvas awning hung from the roof's
 *   edge, cushioned places: the bout seen side on, nothing in the way.
 * - « Tribune d'honneur » 5 000 F: the two front rows of B, behind the officials' table, close to the ring, white
 *   cushions and backs, fewer places — and fewer, better dressed people, some of them the officials' guests.
 *
 * A ticket opens its own stands only; the arena's controller says why when a place is somebody else's (`seatRefusal`).
 * Friends at the arena (src/arena/together.ts) each sit where their own ticket lets them: nothing about tickets or money
 * crosses the presence protocol. No brands.
 */
export type Tribune = 'populaire' | 'couverte' | 'honneur';
export const TRIBUNES: readonly Tribune[] = ['populaire', 'couverte', 'honneur'];

export interface TribuneInfo {
  /** The window's word for it, and the stands' own name. */
  label: string; name: string;
  /** F CFA, paid once for the evening. */
  price: number;
  /** What the window says about it. */
  detail: string;
  /** Where its places are, for the controller and the refusals. */
  where: string;
  /** The name of one of its places (the « S'asseoir » target); null keeps the seat registry's « Place en tribune ». */
  seat: string | null;
  /** Share of its places the crowd takes on a full evening (the honneur rows stay roomy). */
  crowd: number;
}
export const TICKETS: Record<Tribune, TribuneInfo> = {
  populaire: { label: 'Populaire', name: 'tribune populaire', price: 1000, detail: 'Les tribunes des deux bouts, par la porte et le tunnel', where: 'sections A, D, E et H, et le haut de la B', seat: null, crowd: 1 },
  couverte: { label: 'Tribune couverte', name: 'tribune couverte', price: 2500, detail: 'Les grands côtés du cercle, sous la toile, places à coussin', where: 'sections C, F et G', seat: 'Place en tribune couverte', crowd: 0.9 },
  honneur: { label: 'Tribune d’honneur', name: 'tribune d’honneur', price: 5000, detail: 'Les deux premiers rangs de la B, derrière la table des officiels, près du cercle', where: 'section B, les deux premiers rangs', seat: 'Place d’honneur', crowd: 0.45 },
};
/** Counter of the save with the tier of the evening's ticket (index in TRIBUNES; its day is the ticket's own counter). */
export const TIER_COUNTER = 'arena_ticket_tier';

const TAU = Math.PI * 2;
/** The section (A–H) at an angle around the ring (atan2(x, z)); null in a gap (gate, tunnel, aisle). */
export function sectionAt(a: number): string | null {
  const x = ((a % TAU) + TAU) % TAU;
  for (const s of SECTIONS) if ((x >= s.a0 && x <= s.a1) || (x + TAU >= s.a0 && x + TAU <= s.a1)) return s.id;
  return null;
}
/** The tier of the stands a place belongs to, from its section and its row (0 the front row). */
export function tribuneOf(section: string | null, row: number): Tribune {
  if (section === 'B') return row <= 1 ? 'honneur' : 'populaire';          // the top row of B is behind the officials' canopy
  if (section === 'C' || section === 'F' || section === 'G') return 'couverte';
  return 'populaire';
}
/** The tier of the evening's ticket: null without one (a ticket from before the tiers is a « Populaire »). */
export function ticketTribune(counters: Record<string, number>, has: boolean): Tribune | null {
  if (!has) return null;
  return TRIBUNES[counters[TIER_COUNTER] ?? 0] ?? 'populaire';
}
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} F`;
/** Why the player may not sit on a place of `seat` with their ticket (null: they may). */
export function seatRefusal(ticket: Tribune | null, seat: Tribune): string | null {
  if (ticket === seat) return null;
  if (!ticket) return `Place en ${TICKETS[seat].name} : billet à ${fcfa(TICKETS[seat].price)} au guichet, à gauche de la porte.`;
  return `Ton billet est pour la ${TICKETS[ticket].name} (${TICKETS[ticket].where}) : cette place est en ${TICKETS[seat].name}.`;
}
/** What the controller adds when he lets a ticket in: where its places are. */
export const whereLine = (t: Tribune) => `Billet ${TICKETS[t].label} — ta place : ${TICKETS[t].where}.`;
/** The window's sheet: the three prices first, then « Payer … » for each, paid once for the evening. */
export const ticketSheet = () => `${TRIBUNES.map(t => `${TICKETS[t].label} ${fcfa(TICKETS[t].price)}`).join(' · ')} — payé une fois pour toute la soirée.`;
/**
 * What each tier gets, in one short line under its price on the window's sheet (≤ 40 characters: two lines at most
 * beside « Payer » on a phone in portrait). The longer `detail` stays for the docs and the Ce soir page.
 */
export const TIER_NOTE: Record<Tribune, string> = {
  populaire: 'Les deux bouts du cercle, par la porte',
  couverte: 'Grands côtés, sous la toile, coussins',
  honneur: 'Premiers rangs, derrière les officiels',
};
/** One row of the window's sheet. */
export interface TierRow { tribune: Tribune; label: string; detail: string; right: 'Payer'; disabled: boolean; reason?: string }
/**
 * The window's rows (pure; src/arena/module.ts `confirmTicket`): the price first, then the tier's name; its one-line
 * note; « Payer » on the right (a sun pill, src/ui/sheet.ts `priceClass`). A tier the wallet cannot pay is greyed, its
 * note replaced by the reason in red: what is missing (« Il te manque 1 500 F »).
 */
export function tierRows(wallet: number): TierRow[] {
  return TRIBUNES.map(t => {
    const k = TICKETS[t], short = k.price - wallet;
    const row: TierRow = { tribune: t, label: `${fcfa(k.price)} · ${k.label}`, detail: TIER_NOTE[t], right: 'Payer', disabled: short > 0 };
    if (short > 0) row.reason = `Il te manque ${fcfa(short)}`;
    return row;
  });
}
/** The wallet line of a ticket (the place is added by the runner). */
export const ticketLabel = (t: Tribune) => (t === 'populaire' ? 'Billet · gala de làmb' : `Billet · gala de làmb · ${TICKETS[t].label}`);

/** A small seeded draw in [0, 1) for a place id (the same evening fills the same places). */
export function placeDraw(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** Whether the crowd may take this place on a full evening (the honneur rows stay roomy). */
export const crowdMayTake = (id: string, t: Tribune) => placeDraw(id) < TICKETS[t].crowd;

/**
 * How the people of a tier are dressed (on the crowd's own looks, src/crowd): the honneur rows in their best — grand
 * boubous of bazin, long dresses with headwraps — a third of them the officials' guests in the officials' own colours.
 */
export interface Dress { style: 'tee' | 'boubou' | 'dress'; shirt: number; legs: number; skin: number; wrap: number | null }
const GUEST = [0xf2f2ec, 0x9cc8e8, 0x27407a];
const FINE = [0xf2f2ec, 0xd9b44a, 0x6b3fa0, 0x1f7a44, 0x7a1f3d, 0x2f6fb3, 0xe8e2d4];
export function honneurDress(base: Dress, r: () => number): Dress {
  const pick = (a: number[]) => a[Math.floor(r() * a.length)];
  if (r() < 0.33) { const c = pick(GUEST); return { style: 'boubou', shirt: c, legs: c, skin: base.skin, wrap: null }; }   // an officials' guest
  if (base.style === 'dress') return { ...base, shirt: pick(FINE), legs: base.shirt, wrap: base.wrap ?? pick(FINE) };
  const c = pick(FINE); return { style: 'boubou', shirt: c, legs: c, skin: base.skin, wrap: null };
}
