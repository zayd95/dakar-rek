import type { Clip, PersonLook } from '../actors/humanoid';
import { randomLook } from '../actors/humanoid';
import { lookRng } from '../crowd/looks';
import type { ClubDrink, ClubTheme, ClubVariant } from '../activity/templates';
import type { DanceWords } from '../activity/danceRules';
import { say } from '../i18n/wolof';

/**
 * Le Patio's plan (src/venues/patio.ts builds it, src/venues/patioBuild.ts draws it): everything that is data and no scene — the hours and the moments of the night, the bar's menu,
 * the week of themes, the courtyard's layout in the club's local frame (VenueKit: x grows east, the gate on the road toward +z, the sea toward −z), and who is there when.
 * Pure, so that tests/patio.test.ts can hold it to its promises (inside the site, a clear walk past the gate, a bounded crowd, the same every time it is built).
 */
export const PATIO_NAME = 'Le Patio';
/** Open 20 h – 4 h (La Vague's are 21 h – 5 h). */
export const PATIO_HOURS: readonly [number, number] = [20, 4];
/** The ticket at the door: Le Patio is the Almadies' VIP clubbing spot, its ticket starts at 5 000 F (once a night, shown before it is paid); and the nights out before the doorman lets a regular in free. */
export const PATIO_ENTRY = 5000, PATIO_REGULAR = 3;

// ------------------------------------------------------------------ the night
/**
 * The hours of the place: `shut` (4 h – 7 h, nobody), `day` (7 h – 18 h: the gate is shut, a delivery at the door), `setup` (18 h – 20 h: staff setting up, the doorman at his post, the gate still shut),
 * then the open hours — `early` (20 h – 22 h: first guests), `warm` (22 h – midnight), `peak` (midnight – 2 h 30: the dance floor, a queue at the rope), `dawn` (2 h 30 – 4 h).
 */
export type PatioMoment = 'shut' | 'day' | 'setup' | 'early' | 'warm' | 'peak' | 'dawn';
export function patioMoment(h: number): PatioMoment {
  const x = ((h % 24) + 24) % 24;
  if (x >= 4 && x < 7) return 'shut';
  if (x >= 7 && x < 18) return 'day';
  if (x >= 18 && x < 20) return 'setup';
  if (x >= 20 && x < 22) return 'early';
  if (x >= 22) return 'warm';
  return x < 2.5 ? 'peak' : 'dawn';
}
export const isOpenMoment = (m: PatioMoment) => m === 'early' || m === 'warm' || m === 'peak' || m === 'dawn';
export const OPEN_MOMENTS: readonly PatioMoment[] = ['early', 'warm', 'peak', 'dawn'];
export const ALL_MOMENTS: readonly PatioMoment[] = ['shut', 'day', 'setup', 'early', 'warm', 'peak', 'dawn'];

// ------------------------------------------------------------------ the bar
/**
 * The bar's menu: beer, cocktails and spirits-based mixes, and soft drinks, juice and water, 1 000 – 4 500 F. Drinks are paid once at the bar, at the start (the `order` primitive of the club
 * recipe), then drunk on a stool; the waiter brings the same drinks, at the same prices, to the lounge's tables. Nothing here has an effect on the needs beyond the mood and the evening's company.
 */
export const PATIO_DRINKS: readonly ClubDrink[] = [
  { id: 'biere', label: 'Bière glacée', detail: '33 cl, bien fraîche', price: 1500, needs: { moral: 5, social: 4 }, alcohol: true },
  { id: 'mojito', label: 'Mojito', detail: 'Rhum, menthe, citron vert', price: 3000, needs: { moral: 8, social: 5 }, alcohol: true },
  { id: 'dakar_sunset', label: 'Dakar Sunset', detail: 'La maison : rhum, mangue, bissap', price: 3500, needs: { moral: 10, social: 6 }, alcohol: true },
  { id: 'gin_tonic', label: 'Gin tonic', detail: 'Gin, tonic, une tranche de citron', price: 3500, needs: { moral: 8, social: 5 }, alcohol: true },
  { id: 'whisky_coca', label: 'Whisky coca', detail: 'Un verre long, beaucoup de glace', price: 4500, needs: { moral: 9, social: 5 }, alcohol: true },
  { id: 'bissap', label: 'Bissap glacé', price: 1000, needs: { moral: 4, social: 3 } },
  { id: 'jus_bouye', label: 'Jus de bouye', detail: 'Le jus du fruit du baobab', price: 1200, needs: { faim: 6, moral: 5, social: 3 } },
  { id: 'jus_gingembre', label: 'Jus de gingembre', detail: 'Ça pique, ça réveille', price: 1200, needs: { energie: 6, moral: 4 } },
  { id: 'soda', label: 'Soda', detail: 'Cola ou limonade, au verre avec de la glace', price: 1000, needs: { moral: 3, energie: 2 } },
  { id: 'virgin', label: 'Virgin Sunset', detail: 'Le cocktail de la maison, sans alcool', price: 2500, needs: { moral: 8, social: 5 } },
  { id: 'eau', label: 'Eau fraîche', detail: 'Plate ou gazeuse', price: 1000, needs: { energie: 3 } },
];

// ------------------------------------------------------------------ the week
export const PATIO_THEMES: readonly ClubTheme[] = [
  { id: 'lounge', label: 'Afro-lounge', detail: 'Afro-house et amapiano doux, les canapés et la piste' },
  { id: 'live', label: 'Soirée live', detail: 'Un guitariste et un clavier, puis le DJ prend le relais' },
  { id: 'rnb', label: 'R&B et slow', detail: 'Les morceaux lents, on danse à deux ou on discute' },
  { id: 'amapiano', label: 'Amapiano', detail: 'Le groove sud-africain, basses rondes et percussions' },
  { id: 'coupe', label: 'Coupé-décalé', detail: 'Les tubes d’Abidjan et de Dakar jusqu’au petit matin' },
  { id: 'dancehall', label: 'Dancehall et afrobeats', detail: 'Riddims lourds et refrains qu’on chante tous' },
  { id: 'chill', label: 'Chill et cocktails', detail: 'Une musique posée, les cocktails de Coumba à l’honneur' },
];
/** Colours of each theme's lights: amber, magenta and violet, never La Vague's mbalax green. */
export const PATIO_PALETTE: Record<string, number[]> = {
  lounge: [0xff9a3a, 0xe0309a, 0x8a4dff], live: [0xffc24a, 0xff6a3a, 0xe0309a], rnb: [0xe0309a, 0x8a4dff, 0xff9a3a], amapiano: [0xffb02e, 0x2fd8c8, 0xe0309a],
  coupe: [0xff7a2e, 0xe0309a, 0xffd23a], dancehall: [0x2fd86a, 0xffc24a, 0xff4a3a], chill: [0xff9a5a, 0xc86aff, 0xffc88a],
};

/** The variant of the club recipe that is Le Patio (src/activity/templates.ts `club`): its hours, fee, bar, week and a few words. */
export const PATIO_VARIANT: ClubVariant = {
  hours: PATIO_HOURS, peaks: [[0, 2.5]], entry: PATIO_ENTRY, regularAt: PATIO_REGULAR, drinks: PATIO_DRINKS, themes: PATIO_THEMES, contest: false,
  labels: { doorTalk: 'Parler au videur', barmanTalk: 'Parler à Coumba', djTalk: 'Parler au DJ', djDetail: 'Le DJ la passe dès qu’il peut', tableDetail: 'Le serveur te l’apporte', exitDetail: 'Le videur te souhaite bonne nuit' },
};

/**
 * What the dance says of Le Patio's music: an afro-lounge track has no sabar and no drum solo, so its break only gets a line (no change of footwork), its drum fill is the congas', the sabar's
 * quick double step is just « le double pas », and a low score is told to listen to the bass. (La Vague's wording, `VAGUE_WORDS`, is never said on this floor.)
 */
export const PATIO_DANCE: DanceWords = {
  breakMove: null, breakText: 'Le break : la musique respire, garde le temps', fillText: 'Le roulement des congas : un pas de plus',
  moves: { sabar: { label: 'Le double pas', hint: 'Deux à gauche, deux à droite, vite' } },
  low: () => `${say('Ndank ndank')} : écoute la basse, ça va venir.`,
};

// ------------------------------------------------------------------ the courtyard (club-local metres)
/** Top of the courtyard's floor (the deck of La Vague is 0.12 too). */
export const FLOOR_TOP = 0.12;
/** The walls' inner faces: x = ±HW, the back at z = −ZB, the front (the street wall) at z = +ZF; they are `WALL_T` thick, so the outer faces are the site's own edge (±14, −10, +10). */
export const HW = 13.5, ZB = 9.5, ZF = 9.5, WALL_T = 0.5;
/** The arched gate in the street wall (centre, half width) and the smokers' door (centre, half width). */
export const GATE = { x: 0, half: 1.5 } as const;
export const SMOKE_DOOR = { x: 9.5, half: 0.9 } as const;
/** The site Le Patio may build on, in local metres: the walls' outer faces, and the front court (the porch and the rope) that reaches onto the promenade; the promenade's lane beyond stays free. */
export const SITE_BOX = { x0: -14, x1: 14, z0: -10, z1: 11.6 } as const;
/** The lane left free along the promenade in front of the gate: from the front court's edge to the promenade's road side (local z; the promenade runs to +14.4). */
export const LANE = { z0: 11.6, z1: 14.4 } as const;

export const DANCE_FLOOR = { x: 0, z: -2.6, w: 9, d: 6 } as const;
export const BOOTH = { x: 0, z: -8.2, w: 6.2, d: 2.4, h: 0.45 } as const;
/** The covered bar on the west wall: counter, stools along its east side (facing west), the barman behind it. */
export const BAR = { counterX: -10.4, z0: -8.6, z1: -0.6, stoolX: -9.15, stools: [-7.6, -6.3, -5.0, -3.7, -2.4, -1.1] as readonly number[], barmanX: -11.7, barmanZ: -4.6, anchorX: -9.2, anchorZ: -4.6 } as const;
/** The salon: three sofas round a low table by the west wall, in front of the bar, and a small table by the street wall. */
export const SALON = { cx: -10.2, cz: 5.0, r: 5.2, tableX: -10.3, tableZ: 3.4 } as const;
export const VIP = { x0: 8.0, x1: 13.4, z0: -9.4, z1: -5.2, lift: 0.3 } as const;
export const TERRACE = { x0: 6.4, x1: 13.4, z0: 3.6, z1: 9.4, lift: 0.22 } as const;
/** The rope and the doorman: the porch in front of the gate. */
export const PORCH = { postX: 2.4, postZ: 11.05, ropeZ: 10.9, ropeX: 1.45 } as const;
export const WAITER_HOME = { x: -5.4, z: 6.6 } as const;
/** The seats Le Patio registers (ids are `${venueId}:<this>`): bar stools, the salon's sofas, the VIP booth's. */
export const SEAT_IDS = {
  stool: (i: number) => `tabouret:${i}`,
  salon: ['banquette:ouest', 'banquette:rue', 'banquette:face'] as readonly string[],
  vip: ['vip:est', 'vip:fond'] as readonly string[],
};

// ------------------------------------------------------------------ who is there
export type Role = 'staff' | 'patron' | 'worker' | 'friend' | 'queue' | 'delivery';
/**
 * One body of the cast. `spot` is a standing place (local, `y` is the floor under the feet: terraces and platforms are higher) or `seat` the id of a registered seat. `when` lists the moments
 * the body is there; `lowWhen` the same on Low quality (fewer bodies). A body's role is a field of this data: nothing about how a person looks is ever derived from it (`patioLook`).
 */
export interface Presence {
  id: string; role: Role; name: string; gender: 'f' | 'm';
  spot?: { x: number; z: number; yaw: number; y?: number; clip?: Clip }; seat?: string;
  when: readonly PatioMoment[]; lowWhen: readonly PatioMoment[];
}
const ALWAYS: readonly PatioMoment[] = ['setup', 'early', 'warm', 'peak', 'dawn'];
const F = FLOOR_TOP;
export const CAST: readonly Presence[] = [
  // the staff
  { id: 'videur', role: 'staff', name: 'Boubacar', gender: 'm', spot: { x: 2.0, z: 10.75, yaw: 0, clip: 'Idle' }, when: ALWAYS, lowWhen: ALWAYS },
  { id: 'barman', role: 'staff', name: 'Coumba', gender: 'f', spot: { x: BAR.barmanX, z: BAR.barmanZ, yaw: Math.PI / 2, y: F, clip: 'Talk' }, when: ALWAYS, lowWhen: ALWAYS },
  { id: 'dj', role: 'staff', name: 'DJ Sidy', gender: 'm', spot: { x: BOOTH.x, z: BOOTH.z - 0.1, yaw: 0, y: F + BOOTH.h, clip: 'Dance_B' }, when: ALWAYS, lowWhen: ALWAYS },
  { id: 'serveur', role: 'staff', name: 'Pape', gender: 'm', spot: { x: WAITER_HOME.x, z: WAITER_HOME.z, yaw: Math.PI / 2, y: F, clip: 'Idle' }, when: ['early', 'warm', 'peak', 'dawn'], lowWhen: ['early', 'warm', 'peak', 'dawn'] },
  // by day, a delivery at the gate; at the peak, two people at the rope
  { id: 'livreur', role: 'delivery', name: 'Un livreur', gender: 'm', spot: { x: -3.0, z: 10.8, yaw: Math.PI / 2, clip: 'Talk' }, when: ['day'], lowWhen: ['day'] },
  { id: 'file0', role: 'queue', name: 'Quelqu’un dans la file', gender: 'm', spot: { x: -3.2, z: 10.75, yaw: Math.PI / 2, clip: 'Idle' }, when: ['peak'], lowWhen: [] },
  { id: 'file1', role: 'queue', name: 'Quelqu’un dans la file', gender: 'f', spot: { x: -4.4, z: 10.75, yaw: Math.PI / 2, clip: 'Talk' }, when: ['peak'], lowWhen: [] },
  // the people who have a word for you (src/i18n/patioLines.ts has what they say)
  { id: 'tonton', role: 'patron', name: 'Tonton Ablaye', gender: 'm', seat: SEAT_IDS.stool(1), when: ['early', 'warm', 'dawn'], lowWhen: ['early', 'dawn'] },
  { id: 'ibrahima', role: 'patron', name: 'Ibrahima', gender: 'm', seat: SEAT_IDS.stool(4), when: ['early'], lowWhen: [] },
  { id: 'aminata', role: 'patron', name: 'Aminata', gender: 'f', seat: SEAT_IDS.salon[0] + ':0', when: ['early', 'warm'], lowWhen: ['early'] },
  { id: 'cheikh', role: 'patron', name: 'Cheikh', gender: 'm', spot: { x: 8.9, z: 5.7, yaw: -Math.PI / 2, y: F + TERRACE.lift, clip: 'Idle' }, when: ['warm'], lowWhen: ['warm'] },
  { id: 'marieme', role: 'patron', name: 'Marième', gender: 'f', seat: SEAT_IDS.salon[2] + ':1', when: ['warm'], lowWhen: [] },
  { id: 'fatou', role: 'patron', name: 'Fatou', gender: 'f', spot: { x: -3.4, z: -0.2, yaw: Math.PI / 2, y: F, clip: 'Dance_A' }, when: ['warm', 'peak'], lowWhen: ['warm', 'peak'] },
  { id: 'seynabou', role: 'friend', name: 'Seynabou', gender: 'f', spot: { x: -2.2, z: -1.5, yaw: Math.PI / 2, y: F, clip: 'Dance_B' }, when: ['peak'], lowWhen: [] },
  { id: 'rokhaya', role: 'worker', name: 'Rokhaya', gender: 'f', spot: { x: -6.7, z: 0.9, yaw: Math.PI / 2, y: F, clip: 'Idle' }, when: ['early', 'warm', 'peak', 'dawn'], lowWhen: ['warm', 'peak', 'dawn'] },
  { id: 'ousseynou', role: 'worker', name: 'Ousseynou', gender: 'm', spot: { x: 10.5, z: 5.5, yaw: Math.PI / 2, y: F + TERRACE.lift, clip: 'Talk' }, when: ['peak', 'dawn'], lowWhen: ['peak', 'dawn'] },
];
/** How many bodies of the cast stand there at a moment (the humanoid budget: roughly 8–10 at the peak on Medium, fewer on Low). */
export const bodiesAt = (m: PatioMoment, low: boolean) => CAST.filter(p => (low ? p.lowWhen : p.when).includes(m)).length;

/** The people who approach the player once a night (walk over, say a line, offer a word; walk back). Standing bodies only. */
export const APPROACHERS: readonly string[] = ['rokhaya', 'fatou'];

/**
 * How a person looks: from their id and gender alone — the same person every time, a night-out mix of dresses, wax, headwraps, shirts. It takes no role, no job, no age and no price: what
 * somebody does at Le Patio is said by their lines and by where they sit, never by what they wear (tests/patioLines.test.ts holds the function to that).
 */
export function patioLook(id: string, female: boolean): PersonLook {
  const r = lookRng(`patio:${id}`);
  for (let i = 0; i < 60; i++) {
    const l = randomLook(r);
    if (!!l.female !== female) continue;
    return { ...l, hat: l.hat === 'kufi' ? null : l.hat, hatColor: l.hat === 'kufi' ? undefined : l.hatColor };   // a cap for prayer is not a nightclub's dress code, for anyone
  }
  return randomLook(r);
}

// ------------------------------------------------------------------ walking over to the player
export interface Rect { x0: number; x1: number; z0: number; z1: number }
/** The open walk between the gate and the dance floor (club-local): a person only walks over to a player who stands here, idle. */
export const APPROACH_ZONE: Rect = { x0: -5.5, x1: 5.5, z0: 0.8, z1: 8.2 };
const nearRect = (b: Rect, x: number, z: number, m: number) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
/** Whether the straight way from a to b keeps `m` metres clear of every box. */
export function wayClear(a: { x: number; z: number }, b: { x: number; z: number }, boxes: readonly Rect[], m = 0.45): boolean {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15));
  for (let i = 0; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    if (boxes.some(r => nearRect(r, x, z, m))) return false;
  }
  return true;
}
/**
 * Where a person who walks over to the player stops: 1.5 metres off, to a side (never in front of them, never between them and the gate), in the open walk, clear of every collider,
 * with a clear straight way from where they stood. Null when there is no such place (then nobody walks over).
 */
export function approachPoint(me: { x: number; z: number }, facing: number, home: { x: number; z: number }, boxes: readonly Rect[]): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (const turn of [1.2, -1.2, 1.7, -1.7, 2.1, -2.1]) {
    const a = facing + turn, p = { x: me.x + Math.sin(a) * 1.5, z: me.z + Math.cos(a) * 1.5 };
    if (p.x < APPROACH_ZONE.x0 - 1 || p.x > APPROACH_ZONE.x1 + 1 || p.z < APPROACH_ZONE.z0 - 0.5 || p.z > APPROACH_ZONE.z1 + 0.5) continue;
    if (boxes.some(r => nearRect(r, p.x, p.z, 0.6)) || !wayClear(home, p, boxes)) continue;
    const d = Math.hypot(p.x - home.x, p.z - home.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
export const inZone = (p: { x: number; z: number }, r: Rect = APPROACH_ZONE) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
