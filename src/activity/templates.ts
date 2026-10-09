import type { Anchor, PlaceSpec } from './places';
import * as P from './primitives';
import type { ActivitySpec } from './types';
import { apprentiLine, comeLine, haggler, hostSays, tasteLine, waitLine } from '../i18n/lines';

/**
 * Place recipes: each kind of place in Dakar is a composition of the same primitives. A builder (street block,
 * interior, venue lane) only provides the anchors' positions; the recipe decides what can be done at each one.
 * Prices and durations here are the game's own (docs/LIVING_DAKAR.md). Hand-over verbs (talk, own, rent, ride,
 * browse) call the systems passed in `hooks` — missing systems simply leave that activity out.
 */
export interface PlaceHooks {
  /** Open a conversation with the person holding this role (cook, imam, hairdresser, seller…). */
  converse?(role: string): void;
  /** Ownership sheet of an asset (plot, billboard, home, business…). */
  ownership?(assetId: string): void;
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

/** Dibiterie: grilled meat ordered at the counter, eaten at the tables; a hand at the grill; open late.
 * Wolof: « Xaaral tuuti ! » while it grills, « Neex na ! » at the first bite, « Dalal ak jàmm ! » from the patron. */
export function dibi(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const grilling = () => waitLine('Le patron');
  return { ...b, type: 'dibi', hours: [11, 2], chat: true, anchors: [at('counter'), at('grill')], offers: {
    counter: [
      P.order({ id: 'dibi', label: 'Dibi mouton', detail: 'Grillé au feu de bois, oignons et moutarde', price: 2000, prep: 4, eat: 5, needs: { faim: 55, moral: 10, social: 4 }, line: grilling, eatLine: tasteLine }),
      P.order({ id: 'brochettes', label: 'Brochettes', price: 1000, prep: 3, eat: 3, needs: { faim: 28, moral: 4 }, line: grilling, eatLine: tasteLine }),
      P.order({ id: 'bissap', label: 'Bissap frais', price: 300, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 3 } }),
      ...opt(h.converse, P.talk({ id: 'patron', label: 'Parler au patron', line: hostSays('dibi'), then: () => h.converse!('dibi_owner') })),
    ],
    grill: [P.work({ id: 'grill', label: 'Aider au grill', pay: 900, seconds: 6, needs: { energie: -8, hygiene: -6 }, category: 'service', clip: 'Grab', line: () => comeLine('Le patron') })],
  } };
}

/** Gargote / Maïga: the dish of the day served at the tables. Wolof: « Kaay lekk ! » from the cook, « Neex na ! ». */
export function eatery(b: Base & { dishes: { id: string; label: string; price: number; faim: number }[] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const cook = hostSays('cook');
  return { id: b.id, name: b.name, space: b.space, type: 'eatery', hours: [7, 23], chat: true, anchors: [at('counter')], offers: {
    counter: [
      ...b.dishes.map(d => P.order({ id: d.id, label: d.label, price: d.price, prep: 3, eat: 4, needs: { faim: d.faim, moral: 3 }, line: cook, eatLine: tasteLine })),
      ...opt(h.converse, P.talk({ id: 'cuisiniere', label: 'Parler à la cuisinière', line: cook, then: () => h.converse!('cook') })),
    ],
  } };
}

/** Mosque: shoes off at the entrance, ablutions, prayer rows, the imam. Calm, no commerce, no recitation from memory. */
export function mosque(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'mosque', anchors: [at('ablutions'), at('hall'), at('imam')], offers: {
    ablutions: [P.wash({ id: 'ablutions', label: 'Faire ses ablutions', seconds: 4 })],
    hall: [P.pray({ id: 'priere', label: 'Prier', seconds: 8 }), P.use({ id: 'calme', label: 'S’asseoir au calme', primitive: 'sit', seconds: 6, seat: 'near', effects: { needs: { moral: 6 } } })],
    // Everyday greeting only (« Salaam aleekum. » — « Maleekum salaam. Jàmm nga am ? »): no recitation, no formula.
    imam: [...opt(h.converse, P.talk({ id: 'imam', label: 'Parler à l’imam', line: hostSays('imam'), then: () => h.converse!('imam') }))],
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

/** Shop: browse the catalogue (furniture, clothes…), or buy quick items at the till. */
export function shop(b: Base & { catalogue: string; quick?: { id: string; label: string; price: number; item: string }[] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { id: b.id, name: b.name, space: b.space, type: 'shop', hours: [8, 22], anchors: [at('till')], offers: {
    till: [
      ...opt(h.browse, P.browse({ id: 'catalogue', label: 'Voir les articles', then: () => h.browse!(b.catalogue) })),
      ...(b.quick ?? []).map(q => P.buy({ id: q.id, label: q.label, price: q.price, items: { [q.item]: 1 } })),
    ],
  } };
}

/** Fishing beach: unload the catch for pay, bring fish home, sell fish to the mareyeuses — who discuss every price
 * (« Ñaata la ? », « Wàññi ko tuuti ! »). */
export function fishingBeach(b: Base, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  return { ...b, type: 'beach', hours: [6, 20], chat: true, anchors: [at('pirogue'), at('mareyeuses')], offers: {
    pirogue: [P.fish({ id: 'debarquer', label: 'Débarquer les caisses', seconds: 8, pay: 1500, line: hostSays('pecheur') }), P.fish({ id: 'peche', label: 'Partir avec les pêcheurs', seconds: 12, fish: 4 })],
    mareyeuses: [
      P.sell({ id: 'vendre', label: 'Vendre 4 poissons', price: 2400, items: { poisson: 4 }, haggle: haggler('sell', 2400, 'La mareyeuse') }),
      P.buy({ id: 'acheter', label: 'Acheter un poisson', price: 700, items: { poisson: 1 }, haggle: haggler('buy', 700, 'La mareyeuse') }),
      ...opt(h.converse, P.talk({ id: 'mareyeuse', label: 'Discuter des prix', line: hostSays('mareyeuse'), then: () => h.converse!('mareyeuse') })),
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

/** Plot of land or a billboard: inspect and own / rent — the ownership system does the rest. */
export function ownable(b: Base & { type: 'plot' | 'billboard' | 'home'; assetId: string }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const offers: ActivitySpec[] = [
    ...opt(h.ownership, P.inspect({ id: 'voir', label: b.type === 'billboard' ? 'Voir le panneau' : 'Voir la parcelle', then: () => h.ownership!(b.assetId) })),
  ];
  return { id: b.id, name: b.name, space: b.space, type: b.type, anchors: [at('sign')], offers: { sign: offers } };
}

/** Stop of a public transport line: board the next vehicle. `to`: destinations the apprentice calls out
 * (« Colobane ! Nanu dem ! »), shown under the action and said when boarding. */
export function stop(b: Base & { line: string; to?: string[] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  let n = 0;
  const call = b.to?.length ? () => apprentiLine(b.to!, n++) : undefined;
  return { id: b.id, name: b.name, space: b.space, type: 'stop', anchors: [at('stop')], offers: {
    stop: [...opt(h.board, P.ride({ id: 'monter', label: 'Monter dans le prochain', detail: b.to?.length ? `Vers ${b.to.join(', ')}` : undefined, line: call, then: () => h.board!(b.line) }))],
  } };
}
