import type { GameModule } from '../game/modules';
import type { PlaceSpec } from '../activity/places';
import * as P from '../activity/primitives';
import type { Needs } from '../core/types';
import { FRONT_Z, NIGHT_VENUES } from '../world/nightStreet';

/**
 * The Almadies' night street's counters (docs/districts/ALMADIES-NIGHTLIFE.md): Chez Binta, Le Comptoir de Ngor, Café du Phare and Lounge 221 are places of the shared Places registry
 * (the same `order` activity as every gargote and café: pay once at the start, it is prepared, the guest sits at a café set of the promenade, eats or drinks, the needs rise at the last
 * bite), each with its own hours and its own menu, so a restaurant feels like a restaurant, a café like a café and the lounge like a night place. The city's ambient people come by the
 * place's `type` and hours (src/social/ambientData.ts) and sit on the promenade's chairs (src/world/nightStreet.ts). Le Patio is its own venue (src/venues/patio.ts), La Vague its own
 * (src/venues/club.ts), the Terrasse de Ngor the hotel's roof (src/venues/rooftop.ts): nothing here is theirs.
 */
interface Item { id: string; label: string; detail?: string; price: number; needs: Partial<Needs>; drink?: boolean }
interface NightPlace { id: string; name: string; type: 'restaurant' | 'cafe' | 'bar'; hours: [number, number]; kind: 'binta' | 'comptoir' | 'phare' | 'lounge'; items: Item[] }

export const NIGHT_PLACES: readonly NightPlace[] = [
  { id: 'binta', name: 'Chez Binta', type: 'restaurant', hours: [11, 24], kind: 'binta', items: [
    { id: 'poisson', label: 'Poisson grillé', detail: 'Au charbon, citron et oignons', price: 3500, needs: { faim: 52, moral: 4 } },
    { id: 'brochettes', label: 'Brochettes de bœuf', price: 2000, needs: { faim: 30, moral: 3 } },
    { id: 'bouye', label: 'Jus de bouye', detail: 'Le jus du fruit du baobab', price: 600, drink: true, needs: { faim: 5, moral: 4 } },
  ] },
  { id: 'comptoir', name: 'Le Comptoir de Ngor', type: 'restaurant', hours: [11, 23], kind: 'comptoir', items: [
    { id: 'thieb', label: 'Thiéboudiène', detail: 'Le plat du jour, au comptoir', price: 2500, needs: { faim: 56, moral: 4 } },
    { id: 'yassa', label: 'Yassa poulet', price: 2800, needs: { faim: 50, moral: 4 } },
    { id: 'dibi', label: 'Dibi et oignons', price: 2000, needs: { faim: 40, moral: 3 } },
  ] },
  { id: 'phare', name: 'Café du Phare', type: 'cafe', hours: [7, 22], kind: 'phare', items: [
    { id: 'touba', label: 'Café Touba', price: 300, drink: true, needs: { energie: 4, moral: 3 } },
    { id: 'cafelait', label: 'Café au lait et pain', price: 700, needs: { faim: 18, energie: 3, moral: 3 } },
    { id: 'orange', label: 'Jus d’orange pressé', price: 900, drink: true, needs: { energie: 3, moral: 4, social: 2 } },
    { id: 'beignets', label: 'Beignets', price: 500, needs: { faim: 14, moral: 3 } },
  ] },
  { id: 'lounge', name: 'Lounge 221', type: 'bar', hours: [19, 3], kind: 'lounge', items: [
    { id: 'gingembre', label: 'Jus de gingembre', detail: 'Ça pique, ça réveille', price: 800, drink: true, needs: { energie: 6, moral: 4 } },
    { id: 'cocktail', label: 'Cocktail de fruits maison', detail: 'Mangue, ananas, bissap · sans alcool', price: 2000, drink: true, needs: { moral: 9, social: 5 } },
    { id: 'assiette', label: 'Assiette à partager', detail: 'Accras, beignets de crevettes, plantain', price: 3000, needs: { faim: 34, moral: 5, social: 3 } },
  ] },
];

/** Where a counter is served: on the promenade, a step in front of the venue's door. */
export function counterOf(p: NightPlace) {
  const v = NIGHT_VENUES.find(n => n.kind === p.kind)!;
  return { x: v.cx, z: FRONT_Z + 1.4 };
}

/** The place a venue of the night street is in the Places registry. */
export function placeOf(p: NightPlace): PlaceSpec {
  const at = counterOf(p), seat = { near: { x: at.x, z: at.z + 1.2 }, r: 14 };
  return {
    id: `almadies:night:${p.id}`, name: p.name, space: 'street', type: p.type, hours: p.hours,
    anchors: [{ id: 'counter', name: p.name, kind: 'counter', x: at.x, z: at.z, y: 2.1, radius: 3.2 }],
    offers: { counter: p.items.map(i => P.order({ id: i.id, label: i.label, detail: i.detail, price: i.price, prep: 2, eat: i.drink ? 3 : 5, drink: i.drink, needs: i.needs, seat })) },
  };
}

export const nightStreetModule: GameModule = {
  name: 'night-street',
  hubLoaded(ctx, hub) {
    if (!hub.nightStreet) return;
    for (const p of NIGHT_PLACES) ctx.places.add(placeOf(p));
  },
  debug: ctx => ({ nightPlaces: () => ctx.places.all().filter(p => p.id.startsWith('almadies:night:')).map(p => ({ id: p.id, name: p.name, type: p.type, hours: p.hours, anchors: p.anchors.map(a => ({ x: a.x, z: a.z })) })) }),
};
