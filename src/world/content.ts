import type { Action } from './types';
import type { HubId } from '../core/types';

const flag = (f: string) => (s: { data: { flags: string[] } }) => s.data.flags.includes(f);
const noFlag = (f: string) => (s: { data: { flags: string[] } }) => !s.data.flags.includes(f);
const FRIEND_FLAG: Record<string, string> = { pikine: 'mame_helped', plateau: 'fatou_friend' };
const friendHere = (s: { data: { flags: string[]; hub: string } }) => !!FRIEND_FLAG[s.data.hub] && s.data.flags.includes(FRIEND_FLAG[s.data.hub]);
const tired = (n: number) => (s: { data: { needs: { energie: number } } }) => (s.data.needs.energie < n ? 'Trop fatigué' : null);

export const ACTIONS: Record<string, Action[]> = {
  gargote: [
    { id: 'ceebu', label: 'Ceebu jën', detail: 'Le plat du jour', cost: 1000, needs: { faim: 45, moral: 4 }, seconds: 3, counter: 'meals' },
    { id: 'ami', label: 'Ceebu jën à prix d’ami', detail: 'On se souvient de ton aide', cost: 600, needs: { faim: 45, moral: 8, social: 4 }, seconds: 3, counter: 'meals', visible: friendHere },
    { id: 'yassa', label: 'Yassa poulet', detail: 'Bien copieux', cost: 1500, needs: { faim: 60, moral: 6 }, seconds: 3, counter: 'meals' },
  ],
  restaurant: [
    { id: 'poisson', label: 'Poisson grillé', detail: 'Face à l’océan', cost: 3500, needs: { faim: 55, moral: 12, social: 4 }, seconds: 3, counter: 'meals' },
    { id: 'jus', label: 'Jus de bissap', cost: 800, needs: { faim: 8, moral: 8 }, seconds: 2 },
  ],
  cafe: [
    { id: 'touba', label: 'Café Touba', detail: 'Épicé, bien serré', cost: 100, needs: { faim: 3, energie: 6, moral: 6, social: 2 }, seconds: 1.5, counter: 'cafes' },
    { id: 'discuter', label: 'Rester discuter', detail: 'Gratuit', needs: { social: 12, moral: 4 }, seconds: 3 },
  ],
  market: [
    { id: 'vendre', label: 'Vendre au marché (un service)', detail: '+2 500 F', gain: 2500, needs: { energie: -22, hygiene: -8, faim: -8 }, seconds: 4, counter: 'shifts', requires: tired(22) },
  ],
  gym: [
    { id: 'courir', label: 'Courir sur la Corniche', detail: 'Forme +1', needs: { energie: -20, moral: 10, hygiene: -10, faim: -8 }, seconds: 4, counter: 'forme', requires: tired(20) },
    { id: 'barres', label: 'Faire les barres', needs: { energie: -15, moral: 6, hygiene: -6 }, seconds: 3, counter: 'forme', requires: tired(15) },
  ],
  port: [
    { id: 'pecheurs', label: 'Aider les pêcheurs', detail: '+3 500 F', gain: 3500, needs: { energie: -28, hygiene: -12, faim: -10 }, seconds: 4, counter: 'shifts', requires: tired(28), visible: noFlag('ousmane_trust') },
    { id: 'pirogue', label: 'Pirogue du matin (recommandé par Ousmane)', detail: '+4 500 F', gain: 4500, needs: { energie: -28, hygiene: -12, faim: -10 }, seconds: 4, counter: 'shifts', requires: tired(28), visible: flag('ousmane_trust') },
  ],
  garage: [
    { id: 'meca', label: 'Aider le mécanicien', detail: '+2 000 F', gain: 2000, needs: { energie: -18, hygiene: -14, faim: -6 }, seconds: 4, counter: 'shifts', requires: tired(18), visible: noFlag('modou_trust') },
    { id: 'meca_conf', label: 'Travailler au garage (tarif de confiance)', detail: '+2 800 F · recommandé par Ibou', gain: 2800, needs: { energie: -18, hygiene: -14, faim: -6 }, seconds: 4, counter: 'shifts', requires: tired(18), visible: flag('modou_trust') },
  ],
  home: [
    { id: 'dormir', label: 'Dormir', detail: 'Retrouver de l’énergie', needs: { energie: 70, faim: -10, moral: 4 }, seconds: 5 },
    { id: 'laver', label: 'Se laver', needs: { hygiene: 60, moral: 3 }, seconds: 2 },
  ],
  mosque: [
    { id: 'priere', label: 'Prendre un moment pour prier', detail: 'Au choix, dans le calme', seconds: 4 },
    { id: 'calme', label: 'Se poser au calme', detail: 'Faire une pause', needs: { moral: 8, energie: 4 }, seconds: 4 },
  ],
  ecurie: [
    { id: 'entrainement', label: 'Entraînement avec l’écurie', detail: 'Échauffement, prises, sparring · Lutte +1', needs: { energie: -24, hygiene: -14, faim: -10, moral: 6 }, seconds: 0, counter: 'lutte', special: 'training', requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Parle d’abord à Coach Ablaye' : s.data.needs.energie < 24 ? 'Trop fatigué' : null) },
    { id: 'tenue', label: 'Tenue de lutte (ngemb, accessoires)', detail: 'Cosmétique uniquement · brouillon à valider', seconds: 0, special: 'outfit' },
    { id: 'mbakkou', label: 'Mbakkou (danse)', detail: 'Emotes · mouvements provisoires à valider', seconds: 0, special: 'emote' },
  ],
  arena: [
    { id: 'entree', label: 'Faire son entrée', detail: 'Entourage, sabar, foule · séquence provisoire', seconds: 0, special: 'entrance', requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Il faut une écurie (Coach Ablaye)' : null) },
    { id: 'preparation', label: 'Préparation avant le combat', detail: 'Gestes provisoires, à valider', seconds: 0, special: 'prep', requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Il faut une écurie (Coach Ablaye)' : null) },
    { id: 'regarder', label: 'S’asseoir dans les tribunes', detail: 'Ambiance et sabar', needs: { social: 10, moral: 8 }, seconds: 0, special: 'watch' },
    { id: 'combat', label: 'Combattre un adversaire', detail: 'Lutte sans frappe · règles provisoires à valider', seconds: 0, special: 'combat', requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Il faut une écurie (Coach Ablaye)' : s.data.needs.energie < 20 ? 'Trop fatigué' : null) },
  ],
  maiga: [
    { id: 'riz', label: 'Riz au poisson', detail: 'Le moins cher du quartier', cost: 500, needs: { faim: 40, moral: 2 }, seconds: 3, counter: 'meals' },
    { id: 'mafe', label: 'Mafé', cost: 700, needs: { faim: 45, moral: 4 }, seconds: 3, counter: 'meals' },
  ],
  dibiterie: [
    { id: 'dibi', label: 'Dibi mouton', detail: 'Grillé au feu de bois, oignons et moutarde', cost: 2000, needs: { faim: 55, moral: 10, social: 4 }, seconds: 3, counter: 'meals' },
    { id: 'brochettes', label: 'Brochettes à emporter', cost: 1000, needs: { faim: 28, moral: 4 }, seconds: 2, counter: 'meals' },
    { id: 'attendre', label: 'S’asseoir sur le banc', detail: 'Regarder la rue, discuter', needs: { social: 8, moral: 4 }, seconds: 3 },
  ],
  ibou: [
    { id: 'parler', label: 'Discuter avec Tonton Ibou', needs: { social: 10, moral: 4 }, seconds: 3, counter: 'chats' },
    { id: 'attaya', label: 'Boire l’attaya ensemble', detail: '200 F le thé', cost: 200, needs: { social: 14, moral: 8 }, seconds: 4, counter: 'chats' },
  ],
};

/** Door action on enterable places (home, gargote): opens the walkable interior. */
export const ENTER: Action = { id: 'entrer', label: 'Entrer', detail: 'Visiter l’intérieur', seconds: 0, special: 'enter' };

export interface TravelLeg { cost: number; minutes: number }
const legs: Record<string, TravelLeg> = {
  'plateau-corniche': { cost: 500, minutes: 10 }, 'plateau-almadies': { cost: 1500, minutes: 25 },
  'plateau-pikine': { cost: 700, minutes: 20 }, 'corniche-almadies': { cost: 1000, minutes: 18 },
  'corniche-pikine': { cost: 1200, minutes: 25 }, 'almadies-pikine': { cost: 2000, minutes: 35 },
};
export function travelLeg(a: HubId, b: HubId): TravelLeg {
  return legs[`${a}-${b}`] ?? legs[`${b}-${a}`] ?? { cost: 1000, minutes: 20 };
}
export const HUB_NAMES: Record<HubId, string> = {
  plateau: 'Plateau · Médina', corniche: 'Corniche · Fann · Mamelles', almadies: 'Almadies · Ngor · Yoff', pikine: 'Pikine · Guédiawaye · Parcelles',
};
