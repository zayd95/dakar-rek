import { CLUB_DRINKS, CONTEST_FROM, CONTEST_ROUNDS, DIBI_SPECIALS, DOCK_LADDER, GRILL_LADDER, clubTheme, dibiSpecial, dockRank, grillRank, isEvening, nextGrillRank, nightsToContest } from '../activity/templates';
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

// ------------------------------------------------------------------ Dance terrace (La Vague, Ngor)
export interface ClubCtx { night: number; hour: number; nights: number; regularAt: number; entry: number }
const when = (k: number) => (k === 0 ? 'Ce soir' : k === 1 ? 'Demain' : `Dans ${k} nuits`);
/** The week's programme from tonight: « Ce soir · Soirée mbalax », « Demain · Afro night »… */
export const programme = (night: number, n = 7) => Array.from({ length: n }, (_, k) => `${when(k)} · ${clubTheme(night + k).label}`);

export function doormanGreeting(c: ClubCtx): string {
  const t = clubTheme(c.night).label;
  if (c.nights >= c.regularAt) return `Lamine : « Sama xarit ! Dalal ak jàmm. Ce soir, c’est ${t}. Pour toi, l’entrée est offerte. »`;
  if (c.nights > 0) return `Lamine : « Te revoilà ! Ce soir, c’est ${t}. L’entrée, c’est ${c.entry} F, comme d’habitude. »`;
  return `Lamine : « Dalal ak jàmm à La Vague ! Ce soir, c’est ${t}. L’entrée, c’est ${c.entry} F, et tu danses jusqu’au matin. »`;
}
export function doormanRegulars(c: ClubCtx): string {
  if (c.nights >= c.regularAt) return '« Tu es un habitué maintenant : tu entres sans payer. C’est la teraanga de La Vague. »';
  const left = c.regularAt - c.nights;
  return `« Les habitués entrent sans payer. Encore ${left} soirée${left > 1 ? 's' : ''} ici et je te reconnaîtrai à la porte. »`;
}
/** What the doorman says when you come in (paid or as a regular); `nights` counts tonight. */
export function doormanWelcome(c: ClubCtx): string {
  if (c.nights === c.regularAt) return 'Lamine : « Sama xarit ! À partir de maintenant, l’entrée est pour moi. »';
  if (c.nights > c.regularAt) return 'Lamine : « Dalal ak jàmm ! Entre, entre. »';
  return 'Lamine : « Rafet na ! Bonne soirée, la piste est à toi. »';
}
export function djTalk(c: ClubCtx): string {
  const t = clubTheme(c.night);
  if (t.contest) return c.hour >= CONTEST_FROM || c.hour < 5 ? 'DJ Mbaye : « Le concours a commencé ! Monte sur la piste, les batteurs t’attendent. »' : `DJ Mbaye : « Ce soir, ${t.label} ! Les batteurs arrivent, le concours commence à ${CONTEST_FROM} h. »`;
  return `DJ Mbaye : « Ce soir, ${t.label} : ${t.detail.charAt(0).toLowerCase()}${t.detail.slice(1)}. Nanu dem ! »`;
}
export function djContest(c: ClubCtx): string {
  const k = nightsToContest(c.night), top = CONTEST_ROUNDS.reduce((s, r) => s + r.prize, 0);
  const rule = `Trois passages sur le tambour, chacun plus rapide. Mieux tu tiens le temps, plus tu gagnes : jusqu’à ${Math.round(top * 1.2)} F.`;
  return k === 0 ? `« C’est ce soir, à partir de ${CONTEST_FROM} h. ${rule} »` : `« La nuit du sabar, c’est ${k === 1 ? 'demain' : `dans ${k} nuits`}. ${rule} »`;
}
export const barmanGreeting = (nights: number) => (nights > 2 ? 'Saliou : « Sama xarit ! Comme d’habitude, un bissap bien glacé ? »' : 'Saliou : « Dalal ak jàmm ! Ici, rien que des jus maison et de l’eau bien fraîche. »');
export const barmanMenu = () => `« ${CLUB_DRINKS.map(d => `${d.label.toLowerCase()} ${d.price} F`).join(', ')}. Le bouye, c’est le jus du baobab : goûte, neex na ! »`;
export const CLUB_BYE = '« Ba beneen yoon ! Ñibbil ak jàmm. »';

// ------------------------------------------------------------------ Port de Ngor: Babacar, the fish truck's driver
export function driverGreeting(loads: number, here: boolean, next: number): string {
  if (!here) return `Babacar : « Le camion est parti au marché. Je reviens à ${next} h, avec la glace. »`;
  if (loads >= DOCK_LADDER[DOCK_LADDER.length - 1].from) return 'Babacar : « Sama xarit ! Tu mènes le chargement, moi je vérifie la glace. »';
  if (loads > 0) return 'Babacar : « Te revoilà ! Kaay fi, les caisses n’attendent pas. »';
  return 'Babacar : « Salaam aleekum ! Tu veux aider ? J’appelle la caisse, tu me la passes. Gaawal, le poisson n’aime pas le soleil. »';
}
export const driverRoute = (catchOfDay: string) => `« Aujourd’hui, c’est ${catchOfDay}. Le matin je livre les mareyeuses du marché, l’après-midi les restaurants des Almadies. »`;
export function driverLadder(loads: number): string {
  const r = dockRank(loads), next = DOCK_LADDER.find(x => x.from > loads);
  return next ? `« Tu as fait ${loads} chargement${loads > 1 ? 's' : ''}. Encore ${next.from - loads} et tu deviens « ${next.label} » : ${next.pay} F le camion. »` : `« ${r.label}, c’est toi maintenant. Le camion part quand tu dis qu’il est prêt. »`;
}
export const DRIVER_BYE = '« Jërëjëf ! Ba beneen yoon. »';
