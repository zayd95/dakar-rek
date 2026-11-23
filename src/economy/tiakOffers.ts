import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import { ECONOMY } from './config';
import { planTrip } from '../road/graph';

/**
 * Tiak Tiak everywhere (1.0.1): the places a courier picks up from and delivers to in each of the five districts, the fixed routes of 1.0, and the
 * rolling board of offers (pure, unit-tested; src/economy/jobs.ts runs a job, src/economy/ui.ts shows the board).
 *
 * - Every pick-up and drop-off is an existing place of its district: a kiosk, shop, bank, square or stop that the hub builder makes (found by its
 *   interactable id fragment, `frag`), or, where a district has few counters (Mermoz), a named address of the VTC rides (`vtc`: the pavement beside its
 *   kerb, src/transport/vtcRules.ts `stopOf`, where its passengers wait; src/economy/ui.ts gives it a silent place of its own, `<hub>:tiak:<id>`). No new building, no new asset.
 * - The board of a district for one city hour is drawn from a seeded stream, as the VTC requests are: three short runs inside the district, one to a
 *   neighbouring district and one further away, all leaving FROM that district; one of them may be an express. The same list on every reload within the
 *   hour; a run just taken is skipped and the next of the stream takes its place.
 * - A run to another district is offered only when the road graph joins the two (`planTrip`).
 * - A generated run's id says everything about it (`t:<hub>.<from>><hub>.<to>`, `!` for an express), so a run in hand survives a reload whatever the hour.
 * - Pay comes from the length of the way (ECONOMY.tiak.band), fixed at acceptance; a saved run's pay is capped at what its route pays (`payCap`).
 */
export interface Place { frag: string; name: string }
export type TiakType = 'repas' | 'documents' | 'colis' | 'commande' | 'express';
/** The second line of an offer card. */
export const TIAK_TYPE: Record<TiakType, string> = { repas: 'Repas', documents: 'Documents', colis: 'Colis', commande: 'Commande boutique', express: 'Express' };

export interface Route {
  id: string; hub: HubId;
  from: Place; to: Place;
  /** A delivery to another district (the parcel picked up in `hub`, handed over in `toHub`, by the roads: the Jakarta's work). */
  toHub?: HubId;
  /** What is carried (the fixed routes' own line; a generated run says its type). */
  what: string;
  /** Only offered once this flag is set (a client's recommendation). */
  needFlag?: string;
  /** A run of the rolling board: its two points and whether it is an express. */
  gen?: { from: TiakPoint; to: TiakPoint; express: boolean };
}

/** What a place is, for the kind of parcel that leaves from it: a meal, papers, a shop's order, or a plain parcel. */
export type PointKind = 'food' | 'office' | 'shop' | 'place';
const TYPE_OF: Record<PointKind, TiakType> = { food: 'repas', office: 'documents', shop: 'commande', place: 'colis' };
export interface TiakPoint extends Place {
  id: string; hub: HubId;
  /** The short name on a card, and the part of the district it is in (« Ngor », « Sacré-Cœur »). */
  short: string; area: string;
  kind: PointKind;
  /** Hub-local metres: where the place is built (checked against the built hub in tests/tiakOffers.test.ts). */
  x: number; z: number;
  /** A VTC address of the district instead of a counter: the point is the pavement beside its kerb. */
  vtc?: string;
}

const pt = (hub: HubId, id: string, frag: string, name: string, short: string, area: string, kind: PointKind, x: number, z: number): TiakPoint => ({ hub, id, frag, name, short, area, kind, x, z });
/**
 * A point at a VTC address (`vtc`: its id in VTC_POINTS): the passenger's waiting spot on the pavement, written here as numbers (tests/tiakOffers.test.ts holds
 * the numbers and the name to `stopOf(VTC_POINTS…).wait`).
 */
const at = (hub: HubId, id: string, vtc: string, name: string, short: string, area: string, kind: PointKind, x: number, z: number): TiakPoint => ({ hub, id, frag: `:tiak:${id}`, name, short, area, kind, x, z, vtc });

export const TIAK_POINTS: Record<HubId, TiakPoint[]> = {
  pikine: [
    pt('pikine', 'mame', ':gargote:', 'Gargote Mame Diarra', 'Chez Mame', 'Pikine', 'food', 78, 55),
    pt('pikine', 'maiga', ':maiga:', 'Maïga du marché', 'Maïga', 'Pikine', 'food', 78, -5),
    pt('pikine', 'pathe', ':dibiterie:', 'Dibiterie Chez Pathé', 'Chez Pathé', 'Pikine', 'food', -18, -53),
    pt('pikine', 'garage', ':garage:', 'Garage Modou', 'Garage', 'Pikine', 'place', 102, -5),
    pt('pikine', 'diallo', ':city:boutique', 'Boutique Diallo', 'Boutique', 'Pikine', 'shop', -105, 82),
    pt('pikine', 'salon', ':city:salon-tech', 'Salon Awa', 'Salon Awa', 'Pikine', 'shop', -79, 86),
    pt('pikine', 'banque', ':city:bank', 'Banque Teranga · Pikine', 'Banque', 'Pikine', 'office', -90, -38),
    pt('pikine', 'place', ':city:square', 'Grand-place de Pikine', 'Grand-place', 'Pikine', 'place', -19, 93),
    pt('pikine', 'cafe', ':cafe:', 'Café Touba · Parcelles', 'Café Touba', 'Pikine', 'food', -78, 6),
  ],
  plateau: [
    pt('plateau', 'fatou', ':gargote:', 'Gargote Chez Fatou', 'Chez Fatou', 'Médina', 'food', -18, 55),
    pt('plateau', 'medina', ':dibiterie:', 'Dibiterie de la Médina', 'Dibiterie', 'Médina', 'food', -42, 53),
    pt('plateau', 'sandaga', ':market', 'Étal de Sandaga', 'Étal', 'Plateau', 'shop', 28, -41),
    pt('plateau', 'banque', ':city:bank', 'Banque Teranga · Plateau', 'Banque', 'Plateau', 'office', 90, -38),
    pt('plateau', 'ndeye', ':city:boutique', 'Atelier Ndeye · couture', 'Atelier Ndeye', 'Plateau', 'shop', 75, 82),
    pt('plateau', 'reparation', ':city:salon-tech', 'Dakar Réparation', 'Réparation', 'Plateau', 'shop', 97, 82),
    pt('plateau', 'place', ':city:square', 'Place de la Médina', 'Place', 'Médina', 'place', -19, 93),
    pt('plateau', 'cafe', ':cafe:', 'Café Touba · Sandaga', 'Café Touba', 'Plateau', 'food', 78, 6),
  ],
  corniche: [
    pt('corniche', 'etudiants', ':gargote:', 'Gargote des étudiants · Fann', 'Gargote', 'Fann', 'food', 18, -5),
    pt('corniche', 'maiga', ':maiga:', 'Maïga de Fann', 'Maïga', 'Fann', 'food', 42, -5),
    pt('corniche', 'cafe', ':cafe:', 'Café Touba · Fann', 'Café Touba', 'Fann', 'food', -42, 6),
    pt('corniche', 'place', ':city:square', 'Place des étudiants · Fann', 'Place', 'Fann', 'place', 41, 93),
    pt('corniche', 'ateliers', ':city:craft', 'Ateliers de Soumbédioune', 'Ateliers', 'Corniche', 'shop', -94, 76),
    pt('corniche', 'poisson', ':city:fish-market', 'Marché au poisson', 'Marché', 'Corniche', 'shop', -98, 99),
    pt('corniche', 'sport', ':gym', 'Salle de sport en plein air', 'Salle de sport', 'Corniche', 'place', -90, -28),
  ],
  almadies: [
    pt('almadies', 'pointe', ':restaurant:', 'Restaurant Le Pointe · Almadies', 'Le Pointe', 'Almadies', 'food', -102, -54),
    pt('almadies', 'cafe', ':cafe:', 'Café Touba · Ngor', 'Café Touba', 'Ngor', 'food', 102, -54),
    pt('almadies', 'place', ':city:square', 'Place des voisins · Ngor', 'Place', 'Ngor', 'place', 101, 33),
    pt('almadies', 'port', ':port', 'Embarcadère de Ngor', 'Embarcadère', 'Ngor', 'place', 30, -109),
    pt('almadies', 'tech', ':city:mall-tech', 'Ndar Tech', 'Ndar Tech', 'Almadies', 'shop', 13, 20),
    pt('almadies', 'style', ':city:mall-style', 'Style Rek', 'Style Rek', 'Almadies', 'shop', 27, 20),
    pt('almadies', 'jus', ':city:mall-juice', 'Jus & Go', 'Jus & Go', 'Almadies', 'food', 44, 35),
    pt('almadies', 'maison', ':city:mall-household', 'Maison Dakar', 'Maison Dakar', 'Almadies', 'shop', 40, 20),
  ],
  // Mermoz · Sacré-Cœur has one counter (the Café Touba) and one stop: its other two points are the district's two authored addresses, the VTC rides' own
  mermoz: [
    pt('mermoz', 'cafe', ':cafe:', 'Café Touba · Sacré-Cœur', 'Café Touba', 'Sacré-Cœur', 'food', -78, -5),
    at('mermoz', 'boulangerie', 'boulangerie', 'Boulangerie de Sacré-Cœur', 'Boulangerie', 'Sacré-Cœur', 'food', -66.9, 30),
    at('mermoz', 'filaos', 'filaos', 'Résidence Les Filaos', 'Les Filaos', 'Mermoz', 'office', 66.9, -30),
    pt('mermoz', 'arret', ':station', 'Arrêt du car rapide · Mermoz', 'Arrêt du car', 'Mermoz', 'place', -93, 93),
  ],
};
export const tiakPoint = (hub: HubId, id: string) => TIAK_POINTS[hub]?.find(p => p.id === id);
/** The point of a district a place stands for (a fixed route's pick-up, by its id fragment). */
export const pointAt = (hub: HubId, frag: string) => TIAK_POINTS[hub].find(p => p.frag === frag);

const point = (hub: HubId, id: string): Place => { const p = tiakPoint(hub, id)!; return { frag: p.frag, name: p.name }; };
/**
 * Pick-ups and drop-offs of the fixed routes (and of the tour, src/economy/tour.ts) are existing places of the city (gargotes, dibiteries, the Maïga,
 * Boutique Diallo, Salon Awa, the Banque Teranga agencies, the squares, Sandaga, Atelier Ndeye, Dakar Réparation): no new points are invented.
 * `frag` matches the place's interactable id (src/world/builder.ts kiosks, src/world/city.ts places).
 */
export const P = {
  mame: point('pikine', 'mame'), maiga: point('pikine', 'maiga'), pathe: point('pikine', 'pathe'), garage: point('pikine', 'garage'),
  diallo: point('pikine', 'diallo'), salonAwa: point('pikine', 'salon'), bankPk: point('pikine', 'banque'), squarePk: point('pikine', 'place'),
  fatou: point('plateau', 'fatou'), medina: point('plateau', 'medina'), market: point('plateau', 'sandaga'), bankPl: point('plateau', 'banque'),
  ndeye: point('plateau', 'ndeye'), reparation: point('plateau', 'reparation'), squarePl: point('plateau', 'place'),
  pointe: point('almadies', 'pointe'), etudiants: point('corniche', 'etudiants'),
} satisfies Record<string, Place>;

/** The fixed routes of 1.0: the regular clients of a pick-up point (offered at that point), the recommended runs and four rides between districts. */
export const ROUTES: Route[] = [
  { id: 'pk_mame_boutique', hub: 'pikine', from: P.mame, to: P.diallo, what: 'Plats du jour pour la famille de Mamadou' },
  { id: 'pk_mame_bank', hub: 'pikine', from: P.mame, to: P.bankPk, what: 'Déjeuner de l’accueil de l’agence' },
  { id: 'pk_boutique_salon', hub: 'pikine', from: P.diallo, to: P.salonAwa, what: 'Pain et lait pour le salon' },
  { id: 'pk_pathe_square', hub: 'pikine', from: P.pathe, to: P.squarePk, what: 'Brochettes pour la partie de dames' },
  { id: 'pk_maiga_garage', hub: 'pikine', from: P.maiga, to: P.garage, what: 'Riz au poisson pour l’atelier' },
  { id: 'pk_reco_salon_bank', hub: 'pikine', from: P.salonAwa, to: P.bankPk, what: 'Commande groupée (recommandée par Awa)', needFlag: 'tiak_client_pikine' },
  { id: 'pl_fatou_market', hub: 'plateau', from: P.fatou, to: P.market, what: 'Déjeuner des vendeurs' },
  { id: 'pl_fatou_bank', hub: 'plateau', from: P.fatou, to: P.bankPl, what: 'Plats pour l’agence' },
  { id: 'pl_medina_square', hub: 'plateau', from: P.medina, to: P.squarePl, what: 'Dibi pour les joueurs de dames' },
  { id: 'pl_atelier_reparation', hub: 'plateau', from: P.ndeye, to: P.reparation, what: 'Housses de téléphone cousues' },
  { id: 'pl_reco_reparation_bank', hub: 'plateau', from: P.reparation, to: P.bankPl, what: 'Téléphones réparés (recommandée par M. Sarr)', needFlag: 'tiak_client_plateau' },
  // between districts, by the roads (src/road/graph.ts): the parcel goes with the courier from one district to the other
  { id: 'x_pk_pl_diallo_ndeye', hub: 'pikine', toHub: 'plateau', from: P.diallo, to: P.ndeye, what: 'Un rouleau de bazin pour l’Atelier Ndeye' },
  { id: 'x_pl_pk_market_mame', hub: 'plateau', toHub: 'pikine', from: P.market, to: P.mame, what: 'Épices et poisson séché de Sandaga pour Mame Diarra' },
  { id: 'x_pk_al_maiga_pointe', hub: 'pikine', toHub: 'almadies', from: P.maiga, to: P.pointe, what: 'Bissap et gingembre pour le Pointe' },
  { id: 'x_pl_co_fatou_etudiants', hub: 'plateau', toHub: 'corniche', from: P.fatou, to: P.etudiants, what: 'Thiéboudienne pour la gargote des étudiants' },
];
/** The district where a run's parcel is handed over. */
export const deliveryHub = (r: Route): HubId => r.toHub ?? r.hub;
const crosses = (r: Route) => !!r.toHub && r.toHub !== r.hub;

// ------------------------------------------------------------------ a generated run
const GEN = /^t:([a-z]+)\.([a-z]+)>([a-z]+)\.([a-z]+)(!?)$/;
const genId = (a: TiakPoint, b: TiakPoint, express: boolean) => `t:${a.hub}.${a.id}>${b.hub}.${b.id}${express ? '!' : ''}`;
function genRoute(a: TiakPoint, b: TiakPoint, express: boolean): Route {
  return { id: genId(a, b, express), hub: a.hub, ...(b.hub !== a.hub ? { toHub: b.hub } : {}), from: { frag: a.frag, name: a.name }, to: { frag: b.frag, name: b.name }, what: TIAK_TYPE[express ? 'express' : TYPE_OF[a.kind]], gen: { from: a, to: b, express } };
}
/** A run by its id: a fixed route, or a generated one read back from its id (null when its places or its road do not exist in this build). */
export function routeById(id: string): Route | undefined {
  const fixed = ROUTES.find(r => r.id === id); if (fixed) return fixed;
  const m = GEN.exec(id); if (!m) return undefined;
  const [, ha, pa, hb, pb, x] = m;
  if (!HUB_IDS.includes(ha as HubId) || !HUB_IDS.includes(hb as HubId)) return undefined;
  const a = tiakPoint(ha as HubId, pa), b = tiakPoint(hb as HubId, pb);
  if (!a || !b || a === b || (a.hub !== b.hub && !planTrip(a.hub, b.hub))) return undefined;
  return genRoute(a, b, x === '!');
}

/** What kind of delivery a run is (the card's second line). */
export function typeOf(r: Route): TiakType {
  if (r.gen) return r.gen.express ? 'express' : TYPE_OF[r.gen.from.kind];
  return TYPE_OF[pointAt(r.hub, r.from.frag)?.kind ?? 'place'];
}
/** A district's name as a card or a sentence says it. */
export const HUB_SHORT: Record<HubId, string> = { plateau: 'Plateau', corniche: 'Corniche', almadies: 'Almadies', pikine: 'Pikine', mermoz: 'Mermoz' };
/**
 * The card's first line: « Plateau → Mermoz » between districts; inside one, its two parts when they differ (« Ngor → Almadies », « Mermoz → Sacré-Cœur »),
 * else the two places (« Chez Mame → Boutique »).
 */
export function titleOf(r: Route): string {
  const to = deliveryHub(r);
  if (to !== r.hub) return `${HUB_SHORT[r.hub]} → ${HUB_SHORT[to]}`;
  const a = r.gen?.from ?? pointAt(r.hub, r.from.frag), b = r.gen?.to ?? pointAt(to, r.to.frag);
  return a && b && a.area !== b.area ? `${a.area} → ${b.area}` : placesOf(r);
}
/** The two places of a run by their short names (« Café Touba → Les Filaos »). */
export function placesOf(r: Route): string {
  const a = r.gen?.from ?? pointAt(r.hub, r.from.frag), b = r.gen?.to ?? pointAt(deliveryHub(r), r.to.frag);
  return `${a?.short ?? r.from.name.split(' · ')[0]} → ${b?.short ?? r.to.name.split(' · ')[0]}`;
}
/** The first lines of a list of cards: two runs inside the district that would read the same (« Sacré-Cœur → Mermoz » twice) are told apart by their places. */
export function titlesOf(list: readonly Route[]): string[] {
  const titles = list.map(titleOf);
  return titles.map((t, i) => (!list[i].toHub && titles.indexOf(t) !== titles.lastIndexOf(t) ? placesOf(list[i]) : t));
}

// ------------------------------------------------------------------ length of the way and pay
/**
 * The way of a run in metres: inside a district, along its grid of streets; to another district, the roads between them (src/road/graph.ts) and the
 * streets at both ends, as a VTC fare counts them. Null for a fixed route (its pay is in the table, its limit from the built places).
 */
export function routeMetres(r: Route): number | null {
  if (!r.gen) return null;
  const { from: a, to: b } = r.gen;
  if (a.hub === b.hub) return Math.round(Math.abs(a.x - b.x) + Math.abs(a.z - b.z));
  const plan = planTrip(a.hub, b.hub);
  return Math.round((plan?.metres ?? 2000) + (Math.abs(a.x) + Math.abs(a.z) + Math.abs(b.x) + Math.abs(b.z)) * 0.5);
}
const B = ECONOMY.tiak.band;
const snap = (v: number, step: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v / step) * step));
/** Base pay of a run (ECONOMY.tiak: the table for a fixed route, the band per metre and per district crossed for a generated one); polyvalence scales it at hand-over. */
export function routePay(r: Route): number {
  const m = routeMetres(r);
  if (!r.gen || m === null) return ECONOMY.tiak.pay[r.id] ?? 1000;
  let pay: number;
  if (!crosses(r)) pay = snap(B.local.base + B.local.perMetre * m, B.local.step, B.local.min, B.local.max);
  else {
    const hops = Math.max(1, (planTrip(r.hub, r.toHub!)?.hubs.length ?? 2) - 1);
    pay = snap(B.away.base + B.away.perMetre * m + B.away.perHop * (hops - 1), B.away.step, B.away.min, B.away.max);
  }
  return r.gen.express ? Math.round((pay * B.express.pay) / B.local.step) * B.local.step : pay;
}
/** The most any delivery pays before the variety bonus (an express between the two furthest districts). */
export const TIAK_PAY_MAX = Math.round(B.away.max * B.express.pay);
/** The most a run in hand may carry as its pay: what its route pays (a run this build does not know: the top of the band; it is dropped unpaid anyway). */
export function payCap(routeId: string): number {
  const r = routeById(routeId);
  return r ? routePay(r) : TIAK_PAY_MAX;
}
/** The share of the usual time an express allows. */
export const limitFactor = (r: Route) => (r.gen?.express ? B.express.limit : 1);

// ------------------------------------------------------------------ the rolling board
/** Offers on a district's board at once: three inside the district, one to a neighbour, one further away. */
export const BOARD = { local: 3, size: 5 };
const NONE: ReadonlySet<string> = new Set();
/**
 * The board of `hub` for this city hour: at least three runs (five when the district has neighbours by road), every one leaving from `hub`. Seeded by the
 * district, the day and the hour, so it is the same on every reload within the hour and different the next. `skip`: ids of runs just taken or done (an
 * express and its plain run count as one): the stream's next run takes their slot.
 */
export function tiakOffers(hub: HubId, day: number, hour: number, skip: ReadonlySet<string> = NONE): Route[] {
  const seed = (Math.floor(day) * 24 + Math.floor(hour)) * 7919 + HUB_IDS.indexOf(hub) * 104729 + 53;
  const rnd = (k: number) => { const x = Math.sin(seed * 0.0001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const pick = <T>(l: readonly T[], k: number) => l[Math.floor(rnd(k) * l.length) % l.length];
  const here = TIAK_POINTS[hub], out: Route[] = [], used = new Set<string>(), plain = (id: string) => id.replace(/!$/, '');
  const skipped = new Set([...skip].map(plain));
  const take = (a: TiakPoint, b: TiakPoint, strict: boolean) => {
    const id = genId(a, b, false);
    if (a === b || used.has(id) || (strict && skipped.has(id))) return false;
    used.add(id); out.push(genRoute(a, b, false)); return true;
  };
  // the pick-ups of the hour: the district's points in a seeded order, one per slot, so the five runs leave from different places and a slot whose run
  // was taken only changes its own destination (the other cards stay where they were)
  const order = [...here];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd(900 + i) * (i + 1)) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  /** A slot: its pick-up and seeded destinations first, then the first free pair in the table's order (skipped runs last), so it is filled whenever a pair exists. */
  const fill = (slot: number, dests: readonly TiakPoint[]) => {
    const a = order[slot % order.length];
    for (let t = 0; t < 12; t++) if (take(a, pick(dests, slot * 97 + t * 13 + 2), true)) return true;
    for (const strict of [true, false]) for (const from of [a, ...here]) for (const b of dests) if (take(from, b, strict)) return true;
    return false;
  };
  for (let i = 0; i < BOARD.local; i++) fill(i, here);
  // the districts one road away, and those further: only where the road graph joins them
  const others = HUB_IDS.filter(h => h !== hub).map(h => ({ h, plan: planTrip(hub, h) })).filter(o => o.plan);
  const near = others.filter(o => o.plan!.hubs.length === 2).map(o => o.h), far = others.filter(o => o.plan!.hubs.length > 2).map(o => o.h);
  if (near.length) fill(3, TIAK_POINTS[pick(near, 301)]);
  const rest = far.length ? far : near.filter(h => !out.some(r => r.toHub === h));
  if (rest.length) fill(4, TIAK_POINTS[pick(rest, 401)]);
  // one run in two boards is an express: paid more, less time
  if (out.length && rnd(501) < 0.6) { const i = Math.floor(rnd(502) * out.length) % out.length, g = out[i].gen!; out[i] = genRoute(g.from, g.to, true); }
  return out;
}

/** One offer of a district's board, with where it starts and ends (hub-local metres), for another screen to list (the phone, the map). */
export interface TiakOfferInfo {
  id: string; title: string; type: TiakType; typeLabel: string; pay: number; metres: number; express: boolean;
  from: { hub: HubId; name: string; x: number; z: number }; to: { hub: HubId; name: string; x: number; z: number };
}
/** The current offers of a district with their positions (read-only: accepting one is src/economy/ui.ts `accept(id, false)`). */
export function districtOffers(hub: HubId, day: number, hour: number, skip?: ReadonlySet<string>): TiakOfferInfo[] {
  const list = tiakOffers(hub, day, hour, skip), titles = titlesOf(list);
  return list.map((r, i) => {
    const { from: a, to: b, express } = r.gen!, type = typeOf(r);
    return { id: r.id, title: titles[i], type, typeLabel: TIAK_TYPE[type], pay: routePay(r), metres: routeMetres(r) ?? 0, express, from: { hub: a.hub, name: a.name, x: a.x, z: a.z }, to: { hub: b.hub, name: b.name, x: b.x, z: b.z } };
  });
}
