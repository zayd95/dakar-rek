import type { Anchor, PlaceSpec } from './places';
import * as P from './primitives';
import type { ActivitySpec, SeatPick } from './types';
import { apprentiLine, comeLine, haggler, hostSays, tasteLine, waitLine } from '../i18n/lines';
import { G } from './gestures';

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
  /** Walk into the place's interior (a mosque hall, a club…): the module that built the place owns the door. */
  enter?(): void;
  /** Progress counters of the save (shifts at a grill, meals at a place…): offers unlock with use. */
  count?(counter: string): number;
  /** City day number (daily specials) and hour (evening-only offers). */
  day?(): number;
  hour?(): number;
  /** Why the player is too tired for a job costing `energy`, or null. */
  tired?(energy: number): string | null;
  /** Mosque: name of the prayer the congregation gathers for right now (null outside the prayer windows). */
  congregation?(): string | null;
  /** Mosque: open the mushaf on its stand (verified Quranic text, read only: no effect, no reward). */
  read?(): void;
  /** Mosque: what to do first before praying (« ablutions in the courtyard »), or null when ready. */
  prayReady?(): string | null;
  /** One of the place's activities finished (the module reacts: ablutions done, a prop, a counter…). */
  done?(activity: string): void;
}

type At = (id: string) => Anchor;
const need = (a: Anchor | undefined, id: string): Anchor => { if (!a) throw new Error(`place recipe: missing anchor ${id}`); return a; };
const anchors = (list: Anchor[]): At => id => need(list.find(a => a.id === id), id);
const opt = <T>(cond: unknown, v: T): T[] => (cond ? [v] : []);

interface Base { id: string; name: string; space: string; anchors: Anchor[] }

/** A rung of a Dibi's grill ladder: helping at the grill pays more as the player keeps coming back (shifts per place). */
export interface GrillRank { id: string; label: string; detail: string; from: number; pay: number; seconds: number; energie: number; evening?: boolean }
export const GRILL_LADDER: readonly GrillRank[] = [
  { id: 'aide', label: 'Aider au grill', detail: 'Tourner les brochettes, éventer la braise', from: 0, pay: 900, seconds: 6, energie: 8 },
  { id: 'grilleur', label: 'Tenir le grill', detail: 'Tu grilles seul pendant que le patron sert', from: 5, pay: 1800, seconds: 7, energie: 10 },
  { id: 'chef', label: 'Chef de grill', detail: 'Tu mènes le grill et l’apprenti', from: 15, pay: 3500, seconds: 8, energie: 12 },
  { id: 'soir', label: 'Mener le service du soir', detail: 'Grill, commandes et caisse jusqu’à la fermeture', from: 30, pay: 6000, seconds: 10, energie: 16, evening: true },
];
/** Evening at a Dibi (the grill's busiest hours, attaya after the meal). */
export const isEvening = (h: number) => h >= 18 || h < 2;
/** Best grill job open to someone with `shifts` shifts at this place, at hour h. */
export function grillRank(shifts: number, h = 12): GrillRank {
  let best = GRILL_LADDER[0];
  for (const r of GRILL_LADDER) if (shifts >= r.from && (!r.evening || isEvening(h))) best = r;
  return best;
}
/** The next rung to reach, or null at the top. */
export const nextGrillRank = (shifts: number) => GRILL_LADDER.find(r => r.from > shifts) ?? null;
/** One special a day, the same for everyone on that city day. */
export const DIBI_SPECIALS = [
  { id: 'poulet', label: 'Dibi poulet', price: 1800, faim: 50 },
  { id: 'foie', label: 'Brochettes de foie', price: 1200, faim: 32 },
  { id: 'cotes', label: 'Côtelettes d’agneau', price: 2500, faim: 60 },
  { id: 'oignons', label: 'Dibi mouton · sauce oignons', price: 2200, faim: 58 },
] as const;
export const dibiSpecial = (day: number) => DIBI_SPECIALS[((Math.floor(day) % DIBI_SPECIALS.length) + DIBI_SPECIALS.length) % DIBI_SPECIALS.length];
/** Meals at the same Dibi before the owner gives the regular's price. */
export const REGULAR_MEALS = 5;
/** Save counters of one Dibi: grill shifts and meals there. */
export const dibiCounters = (placeId: string) => ({ grill: 'grill:' + placeId, meals: 'repas:' + placeId });

/** Adds a per-place counter to the step that has effects (the meal itself). */
function countOn(spec: ActivitySpec, counter: string): ActivitySpec {
  const step = [...spec.steps].reverse().find(s => s.effects);
  if (step) step.effects = { ...step.effects, counters: { ...step.effects!.counters, [counter]: 1 } };
  return spec;
}
/** A text that follows the save (progress toward the next rung, today's prayer…): read each time the sheet is shown. */
function live<T extends ActivitySpec>(spec: T, detail: () => string | undefined): T {
  Object.defineProperty(spec, 'detail', { get: detail, enumerable: true, configurable: true });
  return spec;
}

/**
 * Dibiterie: grilled meat ordered at the counter, eaten at the tables; a hand at the grill that grows into a job; open
 * late. With hooks it also offers the day's special, the regular's price, attaya in the evening, the owner and a talk
 * about the business (ownership system).
 */
/**
 * `tables`: where the meals are eaten (the order sits you at the nearest free seat there; the city's people sit and eat
 * there too: `area`). `attaya` (with an `attaya` anchor): the set and its cushions — a pot for the group, the evening.
 */
export function dibi(b: Base & { owner?: string; tables?: { x: number; z: number; r?: number }; peaks?: [number, number][]; attaya?: { x: number; z: number; r?: number } }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const keys = dibiCounters(b.id);
  const n = (k: string) => h.count?.(k) ?? 0;
  const regular = () => n(keys.meals) >= REGULAR_MEALS;
  const seat: SeatPick | undefined = b.tables ? { near: { x: b.tables.x, z: b.tables.z }, r: b.tables.r ?? 8 } : undefined;
  const meal = (spec: ActivitySpec) => countOn(spec, keys.meals);
  const hour = () => h.hour?.() ?? 12;
  const grilling = () => waitLine(b.owner ?? 'Le patron');
  // each rung is a timing gesture at the grill (turn the skewers in time; more rounds as the job grows); the text follows the save
  const grill = GRILL_LADDER.map((r, i) => live(P.trade({ id: 'grill_' + r.id, label: r.label, pay: r.pay, counter: keys.grill, category: 'service', clip: 'Talk',
    needs: { energie: -r.energie, hygiene: -6, faim: -4 }, requires: () => h.tired?.(r.energie) ?? null, visible: () => grillRank(n(keys.grill), hour()) === r,
    line: () => comeLine(b.owner ?? 'Le patron'), parts: [{ label: r.label, gesture: G.grill(3 + i) }] }), () => {
    const done = n(keys.grill), next = nextGrillRank(done);
    return next ? `${r.detail} · ${done}/${next.from} services avant « ${next.label} »` : r.detail;
  }));
  const circle = b.attaya && b.anchors.some(a => a.id === 'attaya') ? b.attaya : null;
  const pot = circle ? [P.order({ id: 'theiere', label: 'Une théière d’attaya sous le neem', detail: 'Trois verres pour la table · on prend le temps', price: 500, prep: 2, eat: 8, drink: true,
    seat: { near: { x: circle.x, z: circle.z }, r: circle.r ?? 1.4, kind: 'floor' }, prop: 'attaya', needs: { social: 14, moral: 8 },
    requires: () => (isEvening(hour()) ? null : 'L’attaya sous le neem, c’est le soir') })] : [];
  return { id: b.id, name: b.name, space: b.space, type: 'dibi', hours: [11, 2], chat: true, peaks: b.peaks ?? [[12.5, 14.5], [19, 1]],
    ...(b.tables ? { area: { x: b.tables.x, z: b.tables.z, r: b.tables.r ?? 8 } } : {}),
    anchors: [at('counter'), at('grill'), ...(circle ? [at('attaya')] : [])], offers: {
      ...(circle ? { attaya: pot } : {}),
      counter: [
        meal(P.order({ id: 'dibi', label: 'Dibi mouton', detail: 'Grillé au feu de bois · oignons, moutarde et pain', price: 2000, prep: 4, eat: 5, seat, prop: 'dibi', needs: { faim: 55, moral: 10, social: 4 }, visible: () => !regular(), line: grilling, eatLine: tasteLine })),
        ...opt(h.count, meal(P.order({ id: 'dibi_habitue', label: 'Dibi mouton · prix d’habitué', detail: (b.owner ?? 'Le patron') + ' te fait le prix des habitués', price: 1500, prep: 3, eat: 5, seat, prop: 'dibi', needs: { faim: 55, moral: 14, social: 6 }, visible: regular }))),
        meal(P.order({ id: 'brochettes', label: 'Brochettes', detail: 'Trois brochettes et du pain', price: 1000, prep: 3, eat: 3, seat, prop: 'brochettes', needs: { faim: 28, moral: 4 }, line: grilling, eatLine: tasteLine })),
        ...(h.day ? DIBI_SPECIALS.map(d => live(meal(P.order({ id: 'jour_' + d.id, label: 'Plat du jour · ' + d.label, price: d.price, prep: 4, eat: 5, seat, prop: 'dibi', needs: { faim: d.faim, moral: 8 }, visible: () => dibiSpecial(h.day!()) === d })), () => 'Seulement aujourd’hui · demain, autre chose')) : []),
        P.order({ id: 'bissap', label: 'Bissap frais', price: 300, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 3 } }),
        ...opt(h.hour, P.order({ id: 'attaya', label: 'Attaya après le repas', detail: 'Le thé du soir · on prend le temps', price: 200, prep: 2, eat: 6, drink: true, seat, prop: 'attaya', needs: { social: 10, moral: 5 }, visible: () => isEvening(hour()) })),
        ...opt(h.converse, P.talk({ id: 'patron', label: b.owner ? 'Parler à ' + b.owner : 'Parler au patron', line: hostSays('dibi'), then: () => h.converse!('dibi_owner') })),
        ...opt(h.ownership, P.own({ id: 'affaire', label: 'Parler affaires', detail: 'Investir dans la dibiterie', then: () => h.ownership!('business:' + b.id) })),
      ],
      grill,
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

/**
 * Mosque: ablutions at the taps, shoes off at the door, prayer rows, a calm seat, the imam, a courtyard to sweep.
 * Calm: no commerce, no location chat, always open, and no reward for religious practice (ablutions, prayer and the
 * calm seat change nothing in the save). Prayer asks for ablutions first when the place says so
 * (`prayReady`). Reading stays disabled until a verified text source exists — nothing is ever recited from memory.
 * Anchors may live in two spaces (taps and door in the courtyard, rows and imam in the hall).
 */
export function mosque(b: Base & { peaks?: [number, number][] }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const has = (id: string) => b.anchors.some(a => a.id === id);
  const taps = at('ablutions'), hall = at('hall');
  const rows: SeatPick = { near: { x: hall.x, z: hall.z }, r: 12, kind: 'prayer' };
  const ready = () => h.prayReady?.() ?? null;
  const gathering = () => h.congregation?.() ?? null;
  const offers: Record<string, ActivitySpec[]> = {
    ablutions: [P.wash({ id: 'ablutions', label: 'Faire ses ablutions', seconds: 4, seat: { near: { x: taps.x, z: taps.z }, r: 3, kind: 'stool' }, then: () => h.done?.('ablutions') })],
    hall: [
      P.pray({ id: 'priere', label: 'Prier', seconds: 8, seat: rows, requires: ready, visible: () => !gathering() }),
      live(P.pray({ id: 'priere_groupe', label: 'Prier avec l’assemblée', seconds: 10, seat: rows, requires: ready, visible: () => !!gathering() }), () => gathering() ?? undefined),
      P.use({ id: 'calme', label: 'S’asseoir au calme', primitive: 'sit', seconds: 6, seat: rows }),
    ],
    imam: [...opt(h.converse, P.talk({ id: 'imam', label: 'Parler à l’imam', line: hostSays('imam'), then: () => h.converse!('imam') }))],
  };
  const list = [taps, hall, at('imam')];
  if (has('door') && h.enter) { list.push(at('door')); offers.door = [P.enter({ id: 'entrer', label: 'Entrer · laisser ses chaussures', then: () => h.enter!() })]; }
  if (has('cour')) {
    list.push(at('cour'));
    // volunteering for the neighbourhood (not a religious practice): no money and no activity category, only the time spent with people
    offers.cour = [P.use({ id: 'balayer', primitive: 'work', label: 'Balayer la cour', detail: 'Bénévole · le quartier s’en souvient', seconds: 6, effects: { needs: { energie: -4, social: 4 }, counters: { mosquee_aide: 1 } } })];
  }
  // reading the Quran is a practice: no effects, no counter, no category (the module only opens the text)
  if (has('shelf')) {
    list.push(at('shelf'));
    offers.shelf = [h.read
      ? P.inspect({ id: 'lire', label: 'Lire le Coran', icon: '📖', detail: 'Sourate Al-Fâtiha · texte vérifié (Tanzil)', then: () => h.read!() })
      : P.use({ id: 'lire', label: 'Lire', icon: '📖', detail: 'Texte vérifié à venir', seconds: 0, requires: () => 'Pas encore disponible : texte vérifié à venir' })];
  }
  return { id: b.id, name: b.name, space: b.space, type: 'mosque', peaks: b.peaks, anchors: list, offers };
}

/**
 * Hair salon: sit in a free chair, the service runs, the look changes (`restyle`); clients chat. `chairs` points at the
 * styling chairs so the service never picks the waiting bench.
 */
export function salon(b: Base & { services: { id: string; label: string; price: number; seconds: number; detail?: string }[]; chairs?: { x: number; z: number; r?: number } }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const seat: SeatPick = b.chairs ? { near: { x: b.chairs.x, z: b.chairs.z }, r: b.chairs.r ?? 3, kind: 'chair' } : 'near';
  return { id: b.id, name: b.name, space: b.space, type: 'salon', hours: [9, 21], chat: true, peaks: [[10, 13], [16, 20]], anchors: [at('chair')], offers: {
    chair: [
      ...b.services.map(s => P.use({ id: s.id, label: s.label, detail: s.detail, price: s.price, seconds: s.seconds, seat, primitive: 'buy',
        effects: { needs: { moral: 8, hygiene: 6 }, counters: { ['salon:' + b.id]: 1 }, category: 'loisir' }, then: () => h.restyle?.(s.id) })),
      ...opt(h.converse, P.talk({ id: 'coiffeuse', label: 'Parler avec la coiffeuse', then: () => h.converse!('coiffeuse') })),
    ],
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

/** A trip's catch by the hour: the morning boats come back fuller. */
export const fishCatch = (h: number) => (h >= 6 && h < 10 ? 6 : h < 16 ? 4 : 3);
/** What the mareyeuses pay for a fish, and what they sell one for. */
export const FISH_PRICE = { sell: 600, buy: 700 } as const;
/** Steps of a fishing trip; the module moves the boat along them (`TRIP_STEPS` labels). */
export const TRIP_STEPS = { board: 'Tu embarques', out: 'Au large', net: 'Tu tires le filet', back: 'Retour au rivage' } as const;

/**
 * Fishing beach: go out with the fishermen in a pirogue (board its seat → out to sea → pull the net → back to the shore;
 * the catch goes to the inventory, more in the morning), then sell fish to the mareyeuses (or buy one). `boat` is the
 * pirogue's seat id; the module that owns the boat moves it along the trip's steps.
 */
export function fishingBeach(b: Base & { boat?: string }, h: PlaceHooks = {}): PlaceSpec {
  const at = anchors(b.anchors);
  const hour = () => h.hour?.() ?? 12;
  const trip = (n: number): ActivitySpec => ({
    id: `sortie_${n}`, primitive: 'fish', label: 'Partir avec les pêcheurs', icon: P.ICONS.fish, detail: `${n} poissons pour toi au retour${n === 6 ? ' (pêche du matin)' : ''}`,
    visible: () => fishCatch(hour()) === n,
    steps: [
      { label: TRIP_STEPS.board, primitive: 'ride', seat: b.boat ?? 'near', seconds: 1.5 },
      { label: TRIP_STEPS.out, primitive: 'ride', seconds: 6 },
      { label: TRIP_STEPS.net, primitive: 'fish', seconds: 8, gesture: G.haul(4), effects: { items: { poisson: n }, needs: { energie: -10, hygiene: -6, faim: -4 }, counters: { sorties_peche: 1 }, category: 'peche' } },
      { label: TRIP_STEPS.back, primitive: 'ride', seconds: 6 },
    ],
  });
  return { id: b.id, name: b.name, space: b.space, type: 'beach', hours: [6, 20], chat: true, peaks: [[6, 10], [16, 19]], anchors: [at('pirogue'), at('mareyeuses')], offers: {
    pirogue: [trip(6), trip(4), trip(3)],
    mareyeuses: [
      P.sell({ id: 'vendre', label: 'Vendre 4 poissons', price: FISH_PRICE.sell * 4, items: { poisson: 4 }, haggle: haggler('sell', FISH_PRICE.sell * 4, 'La mareyeuse') }),
      P.sell({ id: 'vendre1', label: 'Vendre un poisson', price: FISH_PRICE.sell, items: { poisson: 1 }, haggle: haggler('sell', FISH_PRICE.sell, 'La mareyeuse') }),
      P.buy({ id: 'acheter', label: 'Acheter un poisson', price: FISH_PRICE.buy, items: { poisson: 1 }, haggle: haggler('buy', FISH_PRICE.buy, 'La mareyeuse') }),
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
