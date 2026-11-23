import type { SaveData } from '../core/types';

/**
 * M4 « One Evening Out » (docs/districts/M4-ALMADIES.md): the rules of one evening in Almadies/Ngor, pure so the tests read them.
 *
 * The evening is made of things that already exist, in this order if the player likes: a meal at the independent Terrasse de Ngor frontage (src/venues/rooftop.ts: an
 * ordinary `order` activity), a word with Awa Sy who hosts the venue, La Vague (src/venues/club.ts: the club's own entry, dance and counters).
 * This file only remembers what was really done that evening, says when it is over, and what Awa says on a later evening. Nothing here pays,
 * feeds or admits anyone: the activities do, and a stage counts only after the activity itself finished (its own counter moved).
 *
 * An « evening » is the club's night (`clubNight`: the hours before noon belong to the previous night). Memory lives in the existing save only
 * (flags and counters beside the NPC memory of src/social/memory.ts), prefix `al_`, no schema change.
 */
export const AWA_ID = 'terrasse_awa';
export const AWA_NAME = 'Awa Sy';
export const AWA_TITLE = 'hôtesse · Terrasse de Ngor';

/** The same night as `clubNight` (src/activity/templates.ts): a test holds the two together. */
export const eveningOf = (day: number, hour: number) => Math.floor(day) - (hour < 12 ? 1 : 0);

export const AL = {
  /** City-hour stamp + 1 of the first talk with Awa (absent = never met). */
  met: 'al_awa_met',
  /** The evening + 1 of that first talk. */
  metNight: 'al_awa_met_night',
  /** The evening + 1 of the last time Awa recognised the guest (once an evening at most). */
  seen: 'al_awa_seen_night',
  /** What the guest said they were celebrating: 1 nothing special, 2 a good job, 3 a new life in Dakar (0 = not asked). */
  toast: 'al_toast',
  /** The evening + 1 when each stage was completed. */
  dine: 'al_dine_night', talk: 'al_talk_night', dance: 'al_dance_night',
  /** The last values read of the activities' own counters (a stage counts when one moves). */
  terrasseSeen: 'al_terrasse_seen', dansesSeen: 'al_danses_seen',
  /** The evening + 1 whose card was shown; the number of evenings ended; the stages of the last one. */
  endNight: 'al_end_night', evenings: 'al_evenings', lastMask: 'al_last_mask',
  /** The evening + 1 of the last coffee offered by the house. */
  gift: 'al_gift_night',
} as const;
type D = Pick<SaveData, 'flags' | 'counters'>;
const get = (d: D, k: string) => d.counters[k] ?? 0;

/** Bits of the stages of an evening. */
export const STAGE = { dine: 1, talk: 2, dance: 4 } as const;
export function stages(d: D, night: number): number {
  const on = (k: string) => get(d, k) === night + 1;
  return (on(AL.dine) ? STAGE.dine : 0) | (on(AL.talk) ? STAGE.talk : 0) | (on(AL.dance) ? STAGE.dance : 0);
}

/**
 * The terrace's meal counter (`terrasse`, moved by the last bite of an order) and La Vague's dance counter (`club:<id>:danses`, moved when a dance ends)
 * are read each frame: when one is above what was last read, that stage is done tonight. Returns the stage that was just completed, or 0.
 * Loading a save never invents a stage: the first read only adopts the counter when it has never been read.
 */
export function noteCounter(d: D, night: number, kind: 'dine' | 'dance', value: number): number {
  const seenKey = kind === 'dine' ? AL.terrasseSeen : AL.dansesSeen, stageKey = kind === 'dine' ? AL.dine : AL.dance;
  const was = d.counters[seenKey];
  d.counters[seenKey] = value;
  if (was === undefined || value <= was) return 0;
  const bit = kind === 'dine' ? STAGE.dine : STAGE.dance;
  if (get(d, stageKey) === night + 1) return 0;
  d.counters[stageKey] = night + 1;
  return bit;
}

export type AwaTalk = 'first' | 'recognise' | 'again';
/** What kind of word Awa has for the guest now: the first talk ever, the first one of a later evening (she remembers), or another word the same evening. */
export function awaTalk(d: D, night: number): AwaTalk {
  if (!get(d, AL.met)) return 'first';
  if (get(d, AL.seen) !== night + 1 && get(d, AL.metNight) < night + 1) return 'recognise';
  return 'again';
}

/** Records a talk: the first one ever, or the recognition of a later evening. Returns the kind said and whether this talk brought a social moment (once an evening). */
export function talked(d: D, night: number, stamp: number): { kind: AwaTalk; moment: boolean } {
  const kind = awaTalk(d, night);
  if (kind === 'first') { d.counters[AL.met] = stamp + 1; d.counters[AL.metNight] = night + 1; }
  d.counters[AL.seen] = night + 1;
  const moment = get(d, AL.talk) !== night + 1;
  d.counters[AL.talk] = night + 1;
  return { kind, moment };
}
export function chooseToast(d: D, which: 1 | 2 | 3) { d.counters[AL.toast] = which; }

/** A later evening, the house offers one coffee (once an evening, never on the evening of the first talk). */
export const giftReady = (d: D, night: number) => get(d, AL.met) > 0 && get(d, AL.metNight) < night + 1 && get(d, AL.gift) !== night + 1;
export function gifted(d: D, night: number) { d.counters[AL.gift] = night + 1; }

/** A card for the end of the evening, once, and only when something was done. Null when it was already shown, or nothing happened. */
export interface EveningCard { icon: string; title: string; lines: string[] }
export function endEvening(d: D, night: number): EveningCard | null {
  const mask = stages(d, night);
  if (!mask || get(d, AL.endNight) === night + 1) return null;
  d.counters[AL.endNight] = night + 1; d.counters[AL.lastMask] = mask;
  d.counters[AL.evenings] = get(d, AL.evenings) + 1;
  const n = get(d, AL.evenings);
  return {
    icon: '🌙', title: n === 1 ? 'Ta première soirée à Almadies' : `Soirée à Almadies · la ${n}ᵉ`,
    lines: [
      mask & STAGE.dine ? '🍽️ Dîner à la Terrasse de Ngor' : '',
      mask & STAGE.talk ? `💬 ${AWA_NAME} se souviendra de toi` : '',
      mask & STAGE.dance ? '💃 La Vague : tu as dansé' : '',
      mask === (STAGE.dine | STAGE.talk | STAGE.dance) ? 'Une soirée complète. Rentre bien !' : 'Reviens un autre soir : tout n’est pas essayé.',
    ].filter(Boolean),
  };
}

/** What Awa says. The toast lines answer the guest's choice; `recall` remembers it on a later evening. */
export const AWA_LINES = {
  first: 'Bonsoir, bienvenue à la Terrasse de Ngor. Je suis Awa, je m’occupe de la terrasse. Qu’est-ce qui t’amène ce soir ?',
  recognise: (toast: number, mask: number) => {
    const before = toast === 2 ? 'Tu fêtais un bon travail, la dernière fois. Ça continue ?' : toast === 3 ? 'Tu découvrais Dakar, la dernière fois. Tu t’y fais ?' : 'Te revoilà. La dernière fois, tu étais venu « sans raison »…';
    const after = mask & STAGE.dance ? ' Et Lamine m’a dit que tu avais fait danser La Vague.' : mask & STAGE.dine ? ' Ta table t’attend.' : '';
    return before + after;
  },
  again: 'Prends ton temps. La mer ne bouge pas.',
  gift: 'Le café est offert par la maison. On n’oublie pas ceux qui reviennent.',
  toast: ['Rien de spécial ? Les meilleures soirées commencent comme ça.', 'Un bon travail, ça se fête. Tu ne seras pas seul à cette table.', 'Dakar, ça se prend doucement, comme le thé. Assieds-toi.'],
  club: (open: boolean) => open
    ? 'Après le repas, descends à La Vague : c’est ouvert. Dis à Lamine que tu viens de chez moi.'
    : 'La Vague ouvre à 21 h. Dîne tranquillement, puis descends danser : dis à Lamine que tu viens de chez moi.',
  bye: 'Bonne soirée. Jërëjëf !',
};
export const TOAST_CHOICES: { id: 1 | 2 | 3; label: string; icon: string }[] = [
  { id: 1, label: 'Rien de spécial, juste une soirée', icon: '🌅' },
  { id: 2, label: 'Je fête un bon travail', icon: '🤝' },
  { id: 3, label: 'Je découvre Dakar', icon: '🌍' },
];
/** The club is open from 21 h to 5 h (src/activity/templates.ts `club`, hours [21, 5]). */
export const clubOpen = (hour: number) => hour >= 21 || hour < 5;
