/**
 * Ambient city life — the data (docs/NPC_LIFE.md). What people do in Dakar, where and when. Hours are city hours
 * (1 city hour = 1 real minute); stays are real seconds (≈ city minutes). BROUILLON — horaires et habitudes à relire par
 * Habib. Prayer: presence and posture only (standing rows), no text.
 *
 * Add an activity: give it spot tags (`at`), windows (`hours`), optional days, a pose and clips. Any spot carrying one of
 * the tags gets it — a new place registered by a venue lane with `type: 'dibi'` is populated by the Dibi activities
 * without new code.
 */
import type { AmbientActivity } from './ambient';

/** Approximate prayer times in Dakar used for gatherings (Fajar, Tisbar, Takusaan, Timis, Gee). */
export const PRAYERS: readonly { id: string; label: string; hours: readonly [number, number] }[] = [
  { id: 'fajar', label: 'Fajar', hours: [5.75, 6.6] },
  { id: 'tisbar', label: 'Tisbar', hours: [13.6, 14.5] },
  { id: 'takusaan', label: 'Takusaan', hours: [16.8, 17.4] },
  { id: 'timis', label: 'Timis', hours: [18.9, 19.6] },
  { id: 'gee', label: 'Gee', hours: [20.5, 21.1] },
];
const FRIDAY = 4, SATURDAY = 5, SUNDAY = 6;
const WEEK = [0, 1, 2, 3, 4], NOT_SUNDAY = [0, 1, 2, 3, 4, 5];

export const ACTIVITIES: readonly AmbientActivity[] = [
  // ------------------------------------------------------------------ eat
  { id: 'petit-dej', label: 'Petit-déjeuner au café', at: ['cafe'], hours: [[6.5, 10.5]], pose: 'sit', clips: ['Sit'], stay: [35, 70], group: [1, 2], density: 3, open: true, prop: 'plate', serve: [6, 12] },
  { id: 'dejeuner', label: 'Déjeuner', at: ['eat'], hours: [[12.3, 15.5]], pose: 'sit', clips: ['Sit'], stay: [45, 90], group: [1, 3], density: 4, open: true, prop: 'plate', serve: [6, 14], curve: [[12.3, 0.6], [13.5, 1], [15.5, 0.5]] },
  { id: 'diner', label: 'Dîner', at: ['eat'], hours: [[19.3, 22.8]], pose: 'sit', clips: ['Sit'], stay: [40, 80], group: [1, 3], density: 3, open: true, prop: 'plate', serve: [6, 14] },
  { id: 'dibi', label: 'Dibi du soir entre amis', at: ['dibi'], hours: [[18.5, 1.5]], pose: 'sit', clips: ['Sit'], stay: [50, 100], group: [2, 3], density: 4, open: true, prop: 'plate', serve: [8, 16], dayBoost: { [FRIDAY]: 1.2, [SATURDAY]: 1.5 } },
  { id: 'dibi-midi', label: 'Dibi à midi', at: ['dibi'], hours: [[12, 15]], pose: 'sit', clips: ['Sit'], stay: [35, 70], group: [1, 2], density: 2, open: true, prop: 'plate', serve: [8, 14] },
  { id: 'commander', label: 'Commander au comptoir', at: ['eat', 'dibi', 'juice'], hours: [[7, 23]], pose: 'stand', clips: ['Talk', 'Idle'], stay: [14, 30], density: 1, open: true, curve: [[7, 0.6], [13, 1], [16, 0.4], [20, 1], [23, 0.4]] },

  // ------------------------------------------------------------------ wait and board
  { id: 'attendre-car', label: 'Attendre le car rapide', at: ['stop'], hours: [[5.5, 23.5]], pose: 'stand', clips: ['Idle', 'Idle', 'Talk'], stay: [25, 60], group: [1, 2], density: 6, board: true,
    curve: [[5.5, 0.4], [7.5, 1], [9.5, 0.45], [13, 0.4], [17.5, 1], [19.5, 0.6], [22, 0.2], [23.5, 0.1]] },
  { id: 'attendre-assis', label: 'Attendre assis sous l’abri', at: ['stop'], hours: [[6, 22.5]], pose: 'sit', clips: ['Sit'], stay: [30, 70], density: 2, board: true },

  // ------------------------------------------------------------------ work and trade
  { id: 'etal', label: 'Vendre à son étal', at: ['stall'], hours: [[7.5, 19.5]], pose: 'stand', clips: ['Talk', 'Grab', 'Talk', 'Idle'], stay: [200, 400], density: 1, look: 'vendor', days: NOT_SUNDAY },
  { id: 'marche', label: 'Faire le marché', at: ['market'], hours: [[7.5, 19]], pose: 'stand', clips: ['Talk', 'Idle'], stay: [18, 45], group: [1, 2], density: 5, curve: [[7.5, 0.7], [10, 1], [13, 0.6], [17, 0.9], [19, 0.3]], dayBoost: { [SATURDAY]: 1.3, [SUNDAY]: 0.5 } },
  { id: 'poisson', label: 'Acheter du poisson', at: ['fishmarket'], hours: [[7, 11.5], [16, 19.5]], pose: 'stand', clips: ['Talk', 'Talk', 'Idle'], stay: [18, 45], density: 5 },
  { id: 'debarquer', label: 'Débarquer la pêche', at: ['landing'], hours: [[6.5, 10], [16, 19]], pose: 'stand', clips: ['Grab', 'Grab', 'Talk'], stay: [40, 90], group: [1, 2], density: 4, look: 'fisher' },
  { id: 'filets', label: 'Réparer les filets', at: ['landing'], hours: [[10, 16]], pose: 'stand', clips: ['Grab', 'Idle'], stay: [60, 150], density: 2, look: 'fisher' },
  { id: 'courses', label: 'Faire des courses', at: ['shop'], hours: [[8.5, 21.5]], pose: 'stand', clips: ['Talk', 'Idle'], stay: [18, 40], density: 2, open: true },
  { id: 'salon', label: 'Attendre son tour au salon', at: ['salon'], hours: [[9.5, 20.5]], pose: 'sit', clips: ['Sit'], stay: [40, 90], density: 2, open: true },
  { id: 'banque', label: 'Attendre à la banque', at: ['bank'], hours: [[8.5, 16.5]], days: WEEK, pose: 'sit', clips: ['Sit'], stay: [30, 70], density: 3, open: true },
  { id: 'banque-file', label: 'Faire la queue à la banque', at: ['bank'], hours: [[8.5, 16.5]], days: WEEK, pose: 'stand', clips: ['Idle', 'Talk'], stay: [20, 45], density: 2, open: true },

  // ------------------------------------------------------------------ pray (posture and presence only)
  { id: 'priere', label: 'Prière en rangs (présence)', at: ['mosque'], hours: PRAYERS.map(p => p.hours), pose: 'row', clips: ['Idle'], stay: [400, 600], density: 12, look: 'prayer',
    dayBoost: { [FRIDAY]: 1.3 }, keepFree: 0.1 },
  { id: 'ajjuma', label: 'Prière du vendredi (présence)', at: ['mosque'], hours: [[13.4, 14.9]], days: [FRIDAY], pose: 'row', clips: ['Idle'], stay: [400, 600], density: 20, look: 'prayer', keepFree: 0.1 },
  { id: 'apres-priere', label: 'Causer devant la mosquée après la prière', at: ['mosque'], hours: [[14.5, 15.1], [19.6, 20.1]], pose: 'stand', clips: ['Talk', 'Idle'], stay: [25, 50], group: [2, 3], density: 5, look: 'prayer',
    dayBoost: { [FRIDAY]: 1.6 } },

  // ------------------------------------------------------------------ gather
  { id: 'attaya', label: 'Attaya entre amis', at: ['attaya'], hours: [[10, 13.5], [16, 0.5]], pose: 'stand', clips: ['Talk', 'Talk', 'Idle'], stay: [60, 140], group: [2, 3], density: 4, curve: [[10, 0.6], [16, 0.7], [20, 1], [0.5, 0.5]] },
  { id: 'dames', label: 'Regarder la partie de dames', at: ['dames'], hours: [[10, 13], [16, 22.5]], pose: 'stand', clips: ['Idle', 'Talk'], stay: [40, 100], density: 3 },
  { id: 'banc', label: 'Se poser sur un banc', at: ['bench', 'square'], hours: [[8.5, 12.5], [15.5, 23.5]], pose: 'sit', clips: ['Sit'], stay: [50, 130], group: [1, 2], density: 2, curve: [[8.5, 0.6], [12, 0.5], [16, 0.7], [19.5, 1], [23.5, 0.4]] },
  { id: 'causer', label: 'Causer au coin de la rue', at: ['corner'], hours: [[10.5, 14], [17, 1]], pose: 'stand', clips: ['Talk', 'Talk', 'Idle'], stay: [40, 100], group: [2, 2], density: 2, curve: [[10.5, 0.5], [13, 0.8], [17, 0.7], [20.5, 1], [23, 0.6], [1, 0.25]] },
  { id: 'veillee', label: 'Prendre le frais le soir', at: ['corner', 'square'], hours: [[20, 1.5]], pose: 'stand', clips: ['Talk', 'Idle'], stay: [60, 140], group: [2, 3], density: 1, dayBoost: { [SATURDAY]: 1.5 } },

  // ------------------------------------------------------------------ sport and the sea
  { id: 'jogging', label: 'Courir sur la Corniche', at: ['promenade', 'beachwalk'], hours: [[6, 9.5], [17, 20.5]], pose: 'route', clips: ['Run'], speed: [2.6, 3.4], stay: [50, 110], density: 4, look: 'sport',
    dayBoost: { [SUNDAY]: 1.6, [SATURDAY]: 1.3 } },
  { id: 'promenade', label: 'Marcher au bord de la mer', at: ['promenade', 'beachwalk'], hours: [[16.5, 22]], pose: 'route', clips: ['Walk'], speed: [0.95, 1.3], stay: [50, 110], group: [1, 2], density: 3,
    dayBoost: { [SUNDAY]: 1.7, [SATURDAY]: 1.3 } },
  { id: 'gym', label: 'Séance de sport en plein air', at: ['gym'], hours: [[6, 9.5], [17, 20.5]], pose: 'stand', clips: ['Stance', 'Celebrate', 'Stance'], stay: [50, 110], density: 4, look: 'sport' },
  { id: 'foot', label: 'Partie de foot', at: ['pitch'], hours: [[17, 19.6]], pose: 'roam', clips: ['Run'], speed: [2.4, 3.6], stay: [80, 160], density: 8, look: 'sport',
    dayBoost: { [SATURDAY]: 1.3, [SUNDAY]: 1.4 } },
  { id: 'foot-dimanche', label: 'Match du dimanche matin', at: ['pitch'], hours: [[8.5, 12]], days: [SUNDAY], pose: 'roam', clips: ['Run'], speed: [2.4, 3.6], stay: [80, 160], density: 10, look: 'sport' },
  { id: 'lutte', label: 'Entraînement de lutte', at: ['ecurie'], hours: [[6.5, 10], [16, 19]], pose: 'stand', clips: ['Stance', 'Stance', 'Grab'], stay: [60, 140], group: [2, 2], density: 4, look: 'sport', days: NOT_SUNDAY },
  { id: 'plage', label: 'Sortie à la plage', at: ['beachwalk'], hours: [[10, 19]], days: [SATURDAY, SUNDAY], pose: 'stand', clips: ['Talk', 'Idle', 'Celebrate'], stay: [80, 180], group: [2, 4], density: 6,
    dayBoost: { [SATURDAY]: 0.6 } },
  { id: 'arene', label: 'Faire la queue pour la lutte', at: ['arena'], hours: [[15, 19.5]], days: [SUNDAY], pose: 'stand', clips: ['Idle', 'Talk'], stay: [60, 140], group: [1, 3], density: 8 },
];

/** Share of the background walkers (actors/npc.ts Crowd) and of the decorative traffic shown by city hour. */
export const WALKERS_BY_HOUR: readonly (readonly [number, number])[] = [[0, 0.25], [5, 0.25], [7, 0.8], [8, 1], [21, 1], [22.5, 0.6], [24, 0.3]];
export const TRAFFIC_BY_HOUR: readonly (readonly [number, number])[] = [[0, 0.35], [5, 0.35], [7, 1], [9.5, 1], [11, 0.75], [16, 0.8], [18, 1], [20, 0.9], [22, 0.6], [24, 0.4]];

/** Spot tags for a registered place type (PlaceSpec.type); unknown types get 'place' (a few visitors near the anchors). */
export const PLACE_TAGS: Readonly<Record<string, readonly string[]>> = {
  dibi: ['dibi'], eatery: ['eat'], restaurant: ['eat'], cafe: ['cafe', 'eat'], maiga: ['eat'],
  mosque: ['mosque'], stop: ['stop'], station: ['stop'], beach: ['landing', 'fishmarket'], market: ['market'],
  shop: ['shop'], salon: ['salon'], club: ['club'], bank: ['bank'], square: ['square', 'attaya'],
  home: [], plot: [], billboard: [],
};

/** Legacy content of the hub builders (interactable id fragment → tags, opening hours). Checked in order. */
export const LEGACY_TAGS: readonly { has: string; tags: readonly string[]; hours?: readonly [number, number] }[] = [
  { has: ':gargote:', tags: ['eat', 'kiosk'], hours: [7, 23] },
  { has: ':maiga:', tags: ['eat', 'kiosk', 'maiga'], hours: [7, 22] },
  { has: ':cafe:', tags: ['cafe', 'eat', 'kiosk'], hours: [6, 22] },
  { has: ':restaurant:', tags: ['eat', 'kiosk'], hours: [11, 24] },
  { has: ':dibiterie:', tags: ['dibi'], hours: [11, 2] },
  { has: ':market', tags: ['market'], hours: [7, 20] },
  { has: ':station', tags: ['stop'] },
  { has: ':city:square', tags: ['square'] },
  { has: ':city:soumbedioune', tags: ['landing'] },
  { has: ':city:fish-market', tags: ['fishmarket'] },
  { has: ':port', tags: ['landing'] },
  { has: ':gym', tags: ['gym'] },
  { has: ':ecurie', tags: ['ecurie'] },
  { has: ':arena', tags: ['arena'] },
  { has: ':city:bank', tags: ['bank'], hours: [8, 17] },
  { has: ':city:mall-juice', tags: ['juice'], hours: [8, 22] },
  { has: ':city:mall-', tags: ['shop'], hours: [9, 21] },
  { has: ':city:boutique', tags: ['shop'], hours: [7, 22] },
  { has: ':city:salon-tech', tags: ['shop', 'salon'], hours: [9, 21] },
  { has: ':city:craft', tags: ['shop'], hours: [9, 19] },
];

/**
 * Budget per graphics quality. `population`: ambient people simulated at once (walking included); `bodies`: pooled
 * animated humanoids for them; `full`: distance under which a person gets a full animated body; `far`: distance under
 * which the others get the cheap instanced figure; `totalFull`: cap on ALL animated non-player humanoids of the street
 * (ambient people, walkers, placed people, the cast…), the nearest first; `scale`: density factor.
 */
export const AMBIENT_BUDGET = {
  low: { population: 26, bodies: 6, full: 26, far: 70, totalFull: 12, scale: 0.6, near: 60, plan: 110 },
  medium: { population: 44, bodies: 10, full: 36, far: 95, totalFull: 20, scale: 0.85, near: 70, plan: 130 },
  high: { population: 64, bodies: 14, full: 50, far: 120, totalFull: 30, scale: 1, near: 80, plan: 150 },
} as const;
export type AmbientQuality = keyof typeof AMBIENT_BUDGET;
