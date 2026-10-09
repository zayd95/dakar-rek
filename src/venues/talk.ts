import { DIBI_SPECIALS, GRILL_LADDER, dibiSpecial, grillRank, isEvening, nextGrillRank } from '../activity/templates';
import { PRAYER_TIMES, hourLabel, nextPrayer, prayerAt } from './prayer';

/**
 * Short everyday exchanges with the people who hold a venue (Dibi owner, imam): French with everyday Wolof (CLAD
 * spelling). Draft text, the game's own; to review with Habib and the Wolof lane. No religious text, no recitation:
 * the imam talks about the neighbourhood, the prayer times and the courtyard.
 */
export interface Line { say: string; reply?: string }

/** Pick a line that changes with the visit count (stable within one visit). */
const nth = <T>(list: readonly T[], n: number) => list[((n % list.length) + list.length) % list.length];

// ------------------------------------------------------------------ Dibi owner
export interface OwnerCtx { owner: string; place: string; meals: number; shifts: number; hour: number; day: number; talks: number; regularAt: number }

export function ownerGreeting(c: OwnerCtx): string {
  if (c.meals >= c.regularAt) return `${c.owner} : « Waaw, mon habitué ! Toogal, je te sers comme d’habitude. »`;
  if (isEvening(c.hour)) return `${c.owner} : « Salaam aleekum ! Le soir, tout le quartier passe chez nous. Toogal, l’attaya arrive. »`;
  if (c.talks === 0) return `${c.owner} : « Salaam aleekum ! Dalal ak jàmm ci ${c.place}. Le mouton est tendre aujourd’hui, dafa neex ! »`;
  return `${c.owner} : « Na nga def ? Maa ngi fi rekk, la braise est prête. »`;
}

const OWNER_NEWS = [
  'Les affaires marchent. Le samedi soir, on ne s’arrête pas avant 2 h.',
  'La braise, c’est tout : du bon charbon et pas trop de vent.',
  'Mon neveu apprend le grill. Toi aussi tu pourrais, il faut juste de la patience.',
  'Hier, les lutteurs de l’écurie sont passés après l’entraînement. Ils ont tout fini !',
  'Le boucher m’a gardé les meilleurs morceaux ce matin. Jërëjëf à lui.',
];
export const ownerNews = (c: OwnerCtx) => `« ${nth(OWNER_NEWS, c.talks)} »`;

export function ownerWork(c: OwnerCtx): string {
  const rank = grillRank(c.shifts, c.hour), next = nextGrillRank(c.shifts);
  if (!c.shifts) return `« Am na liggéey ! Viens au grill quand tu veux : ${GRILL_LADDER[0].label.toLowerCase()}, c’est payé ${GRILL_LADDER[0].pay} F le service. »`;
  if (!next) return `« Tu mènes déjà le service du soir. Ici, c’est un peu chez toi maintenant. »`;
  return `« Tu en es à ${c.shifts} service${c.shifts > 1 ? 's' : ''} (${rank.label.toLowerCase()}). Encore ${next.from - c.shifts} et tu passes à « ${next.label} », ${next.pay} F le service. »`;
}

export function ownerSpecial(c: OwnerCtx): string {
  const d = dibiSpecial(c.day), tomorrow = dibiSpecial(c.day + 1);
  return `« Aujourd’hui, c’est ${d.label.toLowerCase()} à ${d.price} F. Demain, ${tomorrow === d ? 'pareil' : tomorrow.label.toLowerCase()}. »`;
}
export const OWNER_BYE = '« Jërëjëf, ba beneen yoon ! »';
/** Specials, for the debug and the docs. */
export const SPECIAL_LABELS = DIBI_SPECIALS.map(d => d.label);

// ------------------------------------------------------------------ Imam
export interface ImamCtx { imam: string; visits: number; hour: number; helped: number }

export function imamGreeting(c: ImamCtx): string {
  if (c.visits >= 3) return `${c.imam} : « Maleekum salaam ! Te revoilà, ça fait plaisir. Jàmm nga am ? » · Toi : « Jàmm rekk. »`;
  return `${c.imam} : « Maleekum salaam. Dalal ak jàmm. Jàmm nga am ? » · Toi : « Jàmm rekk. »`;
}

const IMAM_NEWS = [
  'Le vent de la mer a rafraîchi la cour ce matin. C’est le meilleur moment pour s’asseoir sous les arbres.',
  'Les voisins ont repeint le portail la semaine dernière. Tout le quartier a donné un coup de main.',
  'Passe saluer les anciens sur le banc, sous l’arbre : ils aiment avoir des nouvelles des jeunes.',
  'Les robinets de la cour ont été réparés. Ici, chacun prend soin de la maison de tous.',
];
export const imamNews = (c: ImamCtx) => `« ${nth(IMAM_NEWS, c.visits)} »`;

export function imamTimes(c: ImamCtx): string {
  const list = PRAYER_TIMES.map(p => `${p.name} vers ${hourLabel(p.hour)}`).join(', ');
  const now = prayerAt(c.hour);
  return `« ${list}. ${now ? `On se rassemble pour ${now.name} en ce moment.` : `La prochaine : ${nextPrayer(c.hour).name}.`} »`;
}

export function imamHelp(c: ImamCtx): string {
  if (c.helped >= 3) return '« Jërëjëf pour la cour, on voit la différence. Le quartier sait qui donne un coup de main. »';
  return '« Jërëjëf. La cour a toujours besoin d’un coup de balai, et le vendredi on déroule les nattes. Le balai est contre l’arbre. »';
}
export const IMAM_BYE = '« Ba beneen yoon. »';

// ------------------------------------------------------------------ Mareyeuse (Soumbédioune)
export function mareyeuseGreeting(talks: number, fish: number): string {
  if (fish > 0) return `Coumba : « Jën bu bees ! Tu as ${fish} poisson${fish > 1 ? 's' : ''} ? Montre, je te les prends. »`;
  if (talks > 2) return 'Coumba : « Na nga def ? Toujours pas de poisson ? Les pirogues partent le matin, c’est là que ça donne. »';
  return 'Coumba : « Salaam aleekum ! Jën bu bees, le poisson est frais. Tu achètes ou tu vends ? »';
}
export const mareyeusePrices = (sell: number, buy: number) => `« Je t’achète le poisson ${sell} F pièce et je le revends ${buy} F. Entre les deux, il y a la glace, le transport et mes enfants ! »`;
export function mareyeuseSea(hour: number): string {
  if (hour < 10) return '« Le matin, la mer est calme et les filets reviennent pleins. Va voir les pêcheurs à la pirogue. »';
  if (hour < 16) return '« À cette heure, le poisson se fait rare. Les pêcheurs reviennent avec moins. »';
  return '« Le soir, la houle monte. Les derniers bateaux rentrent, il faudra attendre demain matin. »';
}
export const MAREYEUSE_BYE = '« Jërëjëf, ba ëllëg ! »';
