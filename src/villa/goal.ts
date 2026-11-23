/**
 * LD2.0-D lane V-E: the way to the villa for every player (docs/ld2/LD2_D.md, decision 1). The villa stays 400 000 000 F (or 120 000 F a day to
 * rent): a long-term goal at the top of the ventures ladder (a restaurant brings 245 000 F a city hour, an immeuble 1 150 000 F). Pure, unit-tested:
 *  - « Mes pistes » (src/economy/pistes.ts) shows it as a savings goal once it is a plausible next step: the player owns a restaurant, an immeuble
 *    or a grande entreprise, or earns 200 000 F a city hour, or is worth 40 000 000 F;
 *  - the villa's sheet (src/economy/estate.ts) says how to get there, from where the player stands.
 */
/** Where « Y aller » leads: the villa's gate (its directory entry, src/economy/estate.ts). */
export const VILLA_PLACE = { id: 'almadies:city:villa', hub: 'almadies' as const, name: 'Villa avec piscine · Almadies' };
export interface VillaGoalFacts {
  /** The villa's price and rent (the catalogue's). */
  price: number; rent: number;
  /** The player holds it already (owned or rented). */
  held: boolean;
  /** What the player's ventures and leased property bring per city hour. */
  income: number;
  /** Units of each venture owned (business.ts ownedVentures). */
  ventures: Record<string, number>;
  /** Wallet and savings; net worth (wallet + what the assets are worth). */
  cash: number; worth: number;
}
/** The ventures that make the villa the next step. */
export const VILLA_RUNG = ['restaurant', 'immeuble', 'entreprise'] as const;
export const VILLA_INCOME = 200_000, VILLA_WORTH = 40_000_000;

const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} F`;
/** City days (24 city hours each) to earn `left` at `perHour`, rounded up; null when nothing is earned. */
export const daysFor = (left: number, perHour: number) => (perHour > 0 ? Math.max(1, Math.ceil(left / perHour / 24)) : null);

/** The villa is a plausible next step for this player. */
export function villaPlausible(f: VillaGoalFacts): boolean {
  if (f.held) return false;
  return VILLA_RUNG.some(v => (f.ventures[v] ?? 0) > 0) || f.income >= VILLA_INCOME || f.worth >= VILLA_WORTH;
}
/** The progress bracket (for the lead's key: it comes back when the player has moved on). */
export const villaBracket = (cash: number, price: number) => Math.min(10, Math.floor((Math.max(0, cash) / price) * 10));

/** The lead's line: the price, what is missing, at the player's pace. */
export function villaGoalLine(f: VillaGoalFacts): string {
  const left = Math.max(0, f.price - f.cash);
  if (left === 0) return `Tu as de quoi t’offrir la villa avec piscine des Almadies (${fmt(f.price)}). Va la voir : la clé t’attend au portail.`;
  const days = daysFor(left, f.income);
  return `La villa avec piscine des Almadies : ${fmt(f.price)}, ou ${fmt(f.rent)} la journée en location. Il te manque ${fmt(left)}`
    + (days ? ` : à ${fmt(f.income)} par heure en ville, environ ${days} jour${days > 1 ? 's' : ''} de ville. Mets-les de côté à la Banque Teranga.` : '.');
}

/** « Comment y arriver » on the villa's sheet: the next rung of the ladder, then the savings, from where the player is. */
export function villaPath(f: VillaGoalFacts): string[] {
  if (f.held) return [];
  const out: string[] = [];
  const left = Math.max(0, f.price - f.cash);
  if (left === 0) return [`Tu as ${fmt(f.cash)} : la villa est à ta portée.`];
  if (!VILLA_RUNG.some(v => (f.ventures[v] ?? 0) > 0)) {
    out.push((f.ventures.car_rapide ?? 0) > 0 || (f.ventures.boutique ?? 0) > 0
      ? 'Prochaine étape : un restaurant (40 000 000 F, 245 000 F par heure en ville), puis un immeuble de rapport.'
      : 'Le chemin : de la table de bana-bana au kiosque, à la boutique, au car rapide, puis au restaurant et à l’immeuble (app Affaires).');
  }
  const days = daysFor(left, f.income);
  out.push(days ? `Il te manque ${fmt(left)} : à ton rythme (${fmt(f.income)} par heure en ville), environ ${days} jour${days > 1 ? 's' : ''} de ville.` : `Il te manque ${fmt(left)}. Tes affaires te le rapporteront pendant que tu travailles.`);
  out.push(`En attendant, elle se loue ${fmt(f.rent)} par jour.`);
  return out;
}
