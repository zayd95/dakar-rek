import type { Action } from '../world/types';
import type { GameState } from '../core/state';
import { ECONOMY } from './config';
import { practise } from './polyvalence';

/**
 * Starter-room furniture (Pikine). Each item is drawn in the 'home' interior once owned (src/world/interiors.ts)
 * and adds its action to the room. Prices are in config.ts; a purchase counts as commerce (polyvalence).
 * No brands; the radio plays no real station (no sound at all for now).
 */
export interface FurnitureItem { id: string; name: string; effect: string; action: Action }

export const FURNITURE: FurnitureItem[] = [
  { id: 'miroir', name: 'Grand miroir', effect: '« Se préparer » : hygiène et moral',
    action: { id: 'preparer', label: 'Se préparer', detail: 'Devant le miroir', needs: { hygiene: 12, moral: 6 }, seconds: 2, counter: 'preparer' } },
  { id: 'tapis', name: 'Tapis', effect: '« Se poser sur le tapis » : un peu d’énergie et de moral',
    action: { id: 'tapis', label: 'Se poser sur le tapis', detail: 'Souffler un moment', needs: { energie: 6, moral: 5 }, seconds: 3 } },
  { id: 'chaises', name: 'Deux chaises en plastique', effect: 'Pour recevoir des amis (visites : bientôt)',
    action: { id: 'chaises', label: 'S’asseoir un moment', detail: 'Deux chaises pour les invités · visites bientôt', needs: { energie: 5, moral: 3 }, seconds: 2 } },
  { id: 'radio', name: 'Petite radio', effect: '« Écouter la radio » : moral',
    action: { id: 'radio', label: 'Écouter la radio', detail: 'Infos et musique · aucune vraie station', needs: { moral: 10, social: 3 }, seconds: 3, counter: 'radio' } },
  { id: 'matelas', name: 'Bon matelas', effect: 'Le sommeil rend plus d’énergie et de moral',
    action: { id: 'dormir', label: 'Dormir (bon matelas)', detail: 'Bien mieux reposé', needs: { energie: 90, faim: -10, moral: 10 }, seconds: 5 } },
  { id: 'tele', name: 'Petite télé', effect: '« Regarder la télé » : moral',
    action: { id: 'tele', label: 'Regarder la télé', detail: 'Programmes imaginaires', needs: { moral: 9, energie: 3, faim: -2 }, seconds: 4, counter: 'tele' } },
];

export const furnitureById = (id: string) => FURNITURE.find(f => f.id === id);
export const priceOf = (id: string) => ECONOMY.furniture[id] ?? 0;
export const owns = (s: GameState, id: string) => s.data.furniture.includes(id);

export function cannotBuy(s: GameState, id: string): string | null {
  if (!furnitureById(id)) return 'Inconnu';
  if (owns(s, id)) return 'Déjà chez toi';
  if (!s.canAfford(priceOf(id))) return 'Pas assez d’argent';
  return null;
}

/** Buy and deliver to the starter room. Buying an item already owned never charges twice. */
export function buyFurniture(s: GameState, id: string): boolean {
  if (cannotBuy(s, id)) return false;
  const item = furnitureById(id)!;
  s.addMoney(-priceOf(id), `Achat : ${item.name}`);
  s.data.furniture.push(id);
  s.count('meubles'); practise(s, 'commerce');
  return true;
}

/** The next furniture goal: the latest one Ibou suggested (flag 'objectif:<id>') if not yet owned, else the cheapest left. */
export function goalItem(s: GameState): FurnitureItem | null {
  const flagged = [...s.data.flags].reverse().find(f => f.startsWith('objectif:') && !owns(s, f.slice(9)) && furnitureById(f.slice(9)));
  if (flagged) return furnitureById(flagged.slice(9))!;
  const left = FURNITURE.filter(f => !owns(s, f.id)).sort((a, b) => priceOf(a.id) - priceOf(b.id));
  return left[0] ?? null;
}
