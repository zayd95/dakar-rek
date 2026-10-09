import type { Action } from '../world/types';
import type { GameState } from '../core/state';
import type { AssetState } from '../core/types';
import { FURNITURE_SPECS, STARTER_FURNITURE, furnitureSpec, homeSpec, type FurnitureSpec } from './catalog';
import { addOwned, assetsOf, currentHome, settleFurniture } from './assets';
import { practise } from './polyvalence';

/**
 * Furniture on the ownership model: each piece bought is a furniture asset of the home the player lives in, set up where
 * it fits (its usual spot first) and moved in the placement mode (src/economy/homeEditor.ts). The catalogue has basic,
 * better and premium pieces (src/economy/catalog.ts), sold at Keur Meubles (Cité Jàmm, Pikine); the six starter pieces
 * of the first economy lane keep their ids, prices and effects and are also sold at the quincaillerie stall.
 * No brands; the radio plays no real station (no sound at all for now).
 */
export interface FurnitureItem { id: string; name: string; effect: string; action: Action }

/** Legacy view of a starter piece: its effect line and its timed action (the Quincaillerie menu, the bed upgrade). */
const legacy = (f: FurnitureSpec): FurnitureItem => ({
  id: f.id, name: f.name, effect: f.what,
  action: f.fixed === 'bed'
    ? { id: 'dormir', label: 'Dormir (bon matelas)', detail: 'Bien mieux reposé', needs: { energie: 90, faim: -10, moral: 10 }, seconds: 5 }
    : f.use ? { id: f.use.id, label: f.use.label, detail: f.what, needs: f.use.needs, seconds: f.use.seconds, counter: f.use.counter }
      : { id: f.id, label: 'S’asseoir un moment', detail: 'Pour les invités', needs: { energie: 5, moral: 3 }, seconds: 2 },
});
/** The six starter pieces (quincaillerie), in the order of the first economy lane. */
export const FURNITURE: FurnitureItem[] = STARTER_FURNITURE.map(id => legacy(furnitureSpec(id)!));
/** Every piece sold (Keur Meubles). */
export const CATALOGUE: FurnitureSpec[] = FURNITURE_SPECS;

export const furnitureById = (id: string) => FURNITURE.find(f => f.id === id);
export const priceOf = (id: string) => furnitureSpec(id)?.price ?? 0;
/** Pieces of this catalogue entry the player owns (in any home). */
export const piecesOf = (s: GameState, id: string) => assetsOf(s, 'furniture').filter(a => a.spec === id);
export const owns = (s: GameState, id: string) => piecesOf(s, id).length > 0;
/** Catalogue ids of every piece owned, in purchase order (one entry per piece). */
export const ownedFurnitureIds = (s: GameState) => assetsOf(s, 'furniture').map(a => a.spec);
export const furnitureCount = (s: GameState) => assetsOf(s, 'furniture').length;

export function cannotBuy(s: GameState, id: string): string | null {
  const f = furnitureSpec(id);
  if (!f) return 'Inconnu';
  if (f.unique && owns(s, id)) return 'Déjà chez toi';
  if (f.fixed === 'bed' && !homeSpec(currentHome(s).spec)) return 'Pas de lit chez toi';
  if (!s.canAfford(f.price ?? 0)) return 'Pas assez d’argent';
  return null;
}

/**
 * Buy a piece and deliver it to the home the player lives in, set up where it fits (stored if the home is full).
 * Buying a starter piece already owned never charges twice. Returns the new asset, or null.
 */
export function deliverFurniture(s: GameState, id: string): AssetState | null {
  if (cannotBuy(s, id)) return null;
  const f = furnitureSpec(id)!, home = currentHome(s);
  s.addMoney(-(f.price ?? 0), `Achat : ${f.name}`);
  const a = addOwned(s, id, f.price ?? 0, { home: home.uid, at: null });
  if (!f.fixed) settleFurniture(s, home.uid);
  s.count('meubles'); practise(s, 'commerce');
  return a;
}
/** Legacy API (quincaillerie, tests): true when bought. */
export const buyFurniture = (s: GameState, id: string): boolean => !!deliverFurniture(s, id);

/** The home's own bed is improved by a « bon matelas » the player owns there. */
export const hasGoodMattress = (s: GameState, homeUid: string) => assetsOf(s, 'furniture').some(a => a.home === homeUid && furnitureSpec(a.spec)?.fixed === 'bed');

/** The next furniture goal: the latest one Ibou suggested (flag 'objectif:<id>') if not yet owned, else the cheapest left. */
export function goalItem(s: GameState): FurnitureItem | null {
  const flagged = [...s.data.flags].reverse().find(f => f.startsWith('objectif:') && !owns(s, f.slice(9)) && furnitureById(f.slice(9)));
  if (flagged) return furnitureById(flagged.slice(9))!;
  const left = FURNITURE.filter(f => !owns(s, f.id)).sort((a, b) => priceOf(a.id) - priceOf(b.id));
  return left[0] ?? null;
}
