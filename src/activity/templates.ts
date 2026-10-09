import type { Anchor, PlaceSpec } from './places';
import * as P from './primitives';
import type { ActivitySpec } from './types';

/**
 * Place recipes: each kind of place in Dakar is a composition of the same primitives. A builder (street block,
 * interior, venue lane) only provides the anchors' positions; the recipe decides what can be done at each one.
 * Prices and durations here are the game's own (docs/LIVING_DAKAR.md). Hand-over verbs (talk, own, rent, ride,
 * browse) call the systems passed in `hooks` — missing systems simply leave that activity out.
 */
export interface PlaceHooks {
  /** Open a conversation with the person holding this role (cook, imam, hairdresser, seller…). */
  converse?(role: string): void;
  /** Ownership sheet of an asset (plot, billboard, home, business…): buy, rent, let, sell, upgrade. */
  ownership?(assetId: string): void;
  /** Whether the player holds this asset (owned or rented): ownable places then offer « Entrer » / « Gérer ». */
  holds?(assetId: string): boolean;
  /** Go into a home the player holds (its interior). */
  enterHome?(assetId: string): void;
  /** Catalogue of a shop (furniture, clothes, phones…). */
  browse?(catalogue: string): void;
  /** Board a vehicle / line from a stop. */
  board?(line: string): void;
  /** Appearance change after a salon service. */
  restyle?(service: string): void;
}

type At = (id: string) => Anchor;
const need = (a: Anchor | undefined, id: string): Anchor => { if (!a) throw new Error(`place recipe: missing anchor ${id}`); return a; };
const anchors = (list: Anchor[]): At => id => need(list.find(a => a.id === id), id);
const opt = <T>(cond: unknown, v: T): T[] => (cond ? [v] : []);

interface Base { id: string; name: string; space: string; anchors: Anchor[] }

/** Dibiterie: grilled meat ordered at the counter, eaten at the tables; a hand at the grill; open late. */
export function dibi(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'dibi', hours: [11, 2], chat: true, anchors: [at('counter'), at('grill')], offers: {
    counter: [
      P.order({ id: 'dibi', label: 'Dibi mouton', detail: 'Grillé au feu de bois, oignons et moutarde', price: 2000, prep: 4, eat: 5, needs: { faim: 55, moral: 10, social: 4 } }),
      P.order({ id: 'brochettes', label: 'Brochettes', price: 1000, prep: 3, eat: 3, needs: { faim: 28, moral: 4 } }),
      P.order({ id: 'bissap', label: 'Bissap frais', price: 300, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 3 } }),
      ...opt(h.converse, P.talk({ id: 'patron', label: 'Parler au patron', then: () => h.converse!('dibi_owner') })),
    ],
    grill: [P.work({ id: 'grill', label: 'Aider au grill', pay: 900, seconds: 6, needs: { energie: -8, hygiene: -6 }, category: 'service', clip: 'Grab' })],
  } };
}

/** Gargote / Maïga: the dish of the day served at the tables. */
export function eatery(b: Base & { dishes: { id: string; label: string; price: number; faim: number }[] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { id: b.id, name: b.name, space: b.space, type: 'eatery', hours: [7, 23], chat: true, anchors: [at('counter')], offers: {
    counter: [
      ...b.dishes.map(d => P.order({ id: d.id, label: d.label, price: d.price, prep: 3, eat: 4, needs: { faim: d.faim, moral: 3 } })),
      ...opt(h.converse, P.talk({ id: 'cuisiniere', label: 'Parler à la cuisinière', then: () => h.converse!('cook') })),
    ],
  } };
}

/** Mosque: shoes off at the entrance, ablutions, prayer rows, the imam. Calm, no commerce, no recitation from memory. */
export function mosque(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'mosque', anchors: [at('ablutions'), at('hall'), at('imam')], offers: {
    ablutions: [P.wash({ id: 'ablutions', label: 'Faire ses ablutions', seconds: 4 })],
    hall: [P.pray({ id: 'priere', label: 'Prier', seconds: 8 }), P.use({ id: 'calme', label: 'S’asseoir au calme', primitive: 'sit', seconds: 6, seat: 'near', effects: { needs: { moral: 6 } } })],
    imam: [...opt(h.converse, P.talk({ id: 'imam', label: 'Parler à l’imam', then: () => h.converse!('imam') }))],
  } };
}

/** Hair salon: a chair, a service, a new look; clients chat. */
export function salon(b: Base & { services: { id: string; label: string; price: number; seconds: number }[] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { id: b.id, name: b.name, space: b.space, type: 'salon', hours: [9, 21], chat: true, anchors: [at('chair')], offers: {
    chair: b.services.map(s => P.use({ id: s.id, label: s.label, price: s.price, seconds: s.seconds, seat: 'near', primitive: 'buy',
      effects: { needs: { moral: 8, hygiene: 6 }, category: 'loisir' }, then: () => h.restyle?.(s.id) })),
  } };
}

/** Shop: browse the catalogue (furniture, clothes…), buy quick items at the till, talk to the seller. */
export function shop(b: Base & { catalogue: string; quick?: { id: string; label: string; price: number; item: string }[]; seller?: string }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { id: b.id, name: b.name, space: b.space, type: 'shop', hours: [8, 22], anchors: [at('till')], offers: {
    till: [
      ...opt(h.browse, P.browse({ id: 'catalogue', label: 'Voir les articles', then: () => h.browse!(b.catalogue) })),
      ...(b.quick ?? []).map(q => P.buy({ id: q.id, label: q.label, price: q.price, items: { [q.item]: 1 } })),
      ...opt(h.converse && b.seller, P.talk({ id: 'vendeur', label: 'Parler au vendeur', then: () => h.converse!(b.seller!) })),
    ],
  } };
}

/** Fishing beach: unload the catch for pay, bring fish home, sell fish to the mareyeuses. */
export function fishingBeach(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'beach', hours: [6, 20], chat: true, anchors: [at('pirogue'), at('mareyeuses')], offers: {
    pirogue: [P.fish({ id: 'debarquer', label: 'Débarquer les caisses', seconds: 8, pay: 1500 }), P.fish({ id: 'peche', label: 'Partir avec les pêcheurs', seconds: 12, fish: 4 })],
    mareyeuses: [
      P.sell({ id: 'vendre', label: 'Vendre 4 poissons', price: 2400, items: { poisson: 4 } }),
      P.buy({ id: 'acheter', label: 'Acheter un poisson', price: 700, items: { poisson: 1 } }),
      ...opt(h.converse, P.talk({ id: 'mareyeuse', label: 'Discuter des prix', then: () => h.converse!('mareyeuse') })),
    ],
  } };
}

/** Night club: open at night, dance and drinks, a crowd. */
export function club(b: Base): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'club', hours: [21, 5], chat: true, anchors: [at('floor'), at('bar')], offers: {
    floor: [P.dance({ id: 'danser', label: 'Danser', seconds: 8 }), P.dance({ id: 'danser2', label: 'Danser (autre pas)', seconds: 8, clip: 'Dance_B' })],
    bar: [P.order({ id: 'soda', label: 'Boisson fraîche', price: 1000, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 4, social: 4 } })],
  } };
}

/**
 * A plot of land, a billboard or a home on sale or to let: look at the listing (buy, rent… in the ownership sheet);
 * once the player holds it, « Gérer » (and « Entrer chez toi » for a home) — the ownership system does the rest.
 */
export function ownable(b: Base & { type: 'plot' | 'billboard' | 'home'; assetId: string }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const mine = () => !!h.holds?.(b.assetId);
  const what = b.type === 'billboard' ? ['le panneau', 'ton panneau'] : b.type === 'home' ? ['le logement', 'ton logement'] : ['la parcelle', 'ta parcelle'];
  const offers: ActivitySpec[] = [
    ...opt(h.enterHome && b.type === 'home', P.enter({ id: 'entrer', label: 'Entrer chez toi', visible: mine, then: () => h.enterHome!(b.assetId) })),
    ...opt(h.ownership, P.inspect({ id: 'voir', label: `Voir ${what[0]}`, visible: () => !mine(), then: () => h.ownership!(b.assetId) })),
    ...opt(h.ownership && h.holds, P.own({ id: 'gerer', label: `Gérer ${what[1]}`, visible: mine, then: () => h.ownership!(b.assetId) })),
  ];
  return { id: b.id, name: b.name, space: b.space, type: b.type, anchors: [at('sign')], offers: { sign: offers } };
}

/** Stop of a public transport line: board the next vehicle. */
export function stop(b: Base & { line: string }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { id: b.id, name: b.name, space: b.space, type: 'stop', anchors: [at('stop')], offers: {
    stop: [...opt(h.board, P.ride({ id: 'monter', label: 'Monter dans le prochain', then: () => h.board!(b.line) }))],
  } };
}
