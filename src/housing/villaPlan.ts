import type { Fixture, FloorPlan, Opening, Pergola, Rect, Room, Window } from './plan';
import { BACK_GARDEN, BALCONIES, FRONT_DOOR, HELIPAD, HOUSE, LEVELS, PARAPET, POOL, WALL_H } from './villa';

/**
 * LD2.0-D « Owner flagship villa », lane V-S (docs/ld2/LD2_D.md): the Almadies villa's floor plan, on three levels (src/housing/villa.ts: the house
 * x −8…8, z −5…4 on its lot, storeys of 3.4 m, the stair core x 4.6…7.8, the back garden and its pool, the balconies, the helipad). One plan draws
 * the interior (src/housing/apartment.ts) and the street façade (src/housing/villaFacade.ts).
 *
 * Plan space is unfolded (src/housing/plan.ts): the ground floor's rooms at their house x, the first floor's at x + 20, the roof's at x − 20.
 *
 *   Rez-de-chaussée (and the back garden, z −11…−5, with the pool)
 *      x −8          −4.6  −1.4 −1.0           4.4           8
 *  z −5 ┌──glass──────────────┬──glass────────┬──────────────┐
 *       │                     │               arch  foot      │
 *       │    grand salon     arch  salle à    │  ↓ flight 1   │
 *       │                     │   manger      │  (rises S)    │
 *     0 ├────────┬───arch──┬──┴──arch─────────┤   hall        │
 *       │ bureau door entrée │    cuisine     ├─────door──────┤ 1.6
 *       │        │         │                │  salle d'eau  │
 *     4 └────────┴──front──┴────────────────┴───────────────┘
 *
 *   Étage (+20; the balconies over the porch and over the pool deck)
 *      x −8          −2.8   −0.4      3.0  4.4           8
 *  z −5 ┌──glass──────┬───────┬─────────┬────┬─────────────┐
 *       │             │ bain  │         │    door  sdb     │
 *       │  suite      ├─arch──┤chambre 2│ c. ├─────────────┤ −2.83
 *       │  parentale arch dressing      │    │ well  ↑ fl. 2│
 *  −0.6 ├────────door─┴───────┴──door───┴arch┤(rises N)    │
 *       │ chambre 3  door  salon familial   arch  landing   │
 *     4 └────────────┴──glass─────────────────┴─────────────┘
 *
 *   Toit-terrasse (−20): the terrace behind its glass balustrade, the helipad (−3, −0.5), a pergola on the street side (x 1.1…4.15, z 0.1…3.6),
 *   the stair head x 4.4…8, z −5…1.6 and the terrace on the street side.
 *
 * The look (LD2.0-D look pass, the owner's « modern premium Senegalese villa »): the ground floor's rooms clad in travertine outside (`clad`), the
 * floor above and the stair tower in an ivory render; floor-to-ceiling glazing in slim dark frames on the salons and the suite; inside, large cream
 * marble tiles on the ground floor, oak in the bedrooms, teak decks outdoors, one accent wall per main room (`accent`: oak slats or stone).
 */
const ET = LEVELS[1].dx, TO = LEVELS[2].dx;
/** The rooms' height under the ceiling (m); the floor above is STOREY − CEILING thick. */
export const CEILING = 3.0;
/** The pergola's height over the roof terrace (m). */
const PERGOLA_H = 2.7;
const box = (x0: number, x1: number, z0: number, z1: number, dx = 0): Rect => ({ x0: x0 + dx, x1: x1 + dx, z0, z1 });
const H0 = HOUSE;

const rooms: Room[] = [
  // ---------------------------------------------------------------- rez-de-chaussée (the travertine storey; the stair tower in render)
  { id: 'entree', kind: 'entree', name: 'Entrée', level: 'rdc', box: box(-4.6, -1.4, 0, H0.z1), floor: 'marble', clad: 'stone', accent: { side: 'e', kind: 'stone' } },
  { id: 'salon', kind: 'sejour', name: 'Grand salon', level: 'rdc', box: box(H0.x0, -1.0, H0.z0, 0), floor: 'marble', clad: 'stone', accent: { side: 's', kind: 'wood' } },
  { id: 'manger', kind: 'manger', name: 'Salle à manger', level: 'rdc', box: box(-1.0, 4.4, H0.z0, 0), floor: 'marble', clad: 'stone', accent: { side: 'e', kind: 'stone' } },
  { id: 'cuisine', kind: 'cuisine', name: 'Cuisine', level: 'rdc', box: box(-1.4, 4.4, 0, H0.z1), floor: 'marble', clad: 'stone' },
  { id: 'bureau', kind: 'bureau', name: 'Bureau', level: 'rdc', box: box(H0.x0, -4.6, 0, H0.z1), floor: 'wood', clad: 'stone', accent: { side: 'n', kind: 'wood' } },
  { id: 'hall', kind: 'palier', name: 'Hall de l’escalier', level: 'rdc', box: box(4.4, H0.x1, H0.z0, 1.6), floor: 'marble' },
  { id: 'sde', kind: 'sdb', name: 'Salle d’eau', level: 'rdc', box: box(4.4, H0.x1, 1.6, H0.z1), floor: 'tiles' },
  { id: 'jardin', kind: 'terrasse', name: 'Terrasse de la piscine', short: 'Piscine', level: 'rdc', outdoor: true, edge: 'garden', box: { ...BACK_GARDEN }, floor: 'deck' },
  // ---------------------------------------------------------------- étage
  { id: 'salon_familial', kind: 'sejour', name: 'Salon familial', level: 'etage', box: box(-4.4, 4.4, -0.6, H0.z1, ET), floor: 'marble', accent: { side: 'w', kind: 'stone' } },
  { id: 'suite', kind: 'chambre', name: 'Suite parentale', short: 'Suite', level: 'etage', box: box(H0.x0, -2.8, H0.z0, -0.6, ET), floor: 'wood', accent: { side: 's', kind: 'wood' } },
  { id: 'dressing', kind: 'dressing', name: 'Dressing', level: 'etage', box: box(-2.8, -0.4, -2.6, -0.6, ET), floor: 'wood' },
  { id: 'bain', kind: 'sdb', name: 'Salle de bain parentale', short: 'Bain parental', level: 'etage', box: box(-2.8, -0.4, H0.z0, -2.6, ET), floor: 'tiles' },
  { id: 'chambre2', kind: 'chambre', name: 'Chambre 2', level: 'etage', box: box(-0.4, 3.0, H0.z0, -0.6, ET), floor: 'wood', accent: { side: 'w', kind: 'wood' } },
  { id: 'chambre3', kind: 'chambre', name: 'Chambre 3', level: 'etage', box: box(H0.x0, -4.4, -0.6, H0.z1, ET), floor: 'wood', accent: { side: 'n', kind: 'wood' } },
  { id: 'sdb', kind: 'sdb', name: 'Salle de bain', level: 'etage', box: box(4.4, H0.x1, H0.z0, -2.83, ET), floor: 'tiles' },
  { id: 'couloir', kind: 'degagement', name: 'Couloir', level: 'etage', box: box(3.0, 4.4, H0.z0, -0.6, ET), floor: 'wood' },
  { id: 'palier', kind: 'palier', name: 'Palier', level: 'etage', box: box(4.4, H0.x1, -2.83, H0.z1, ET), floor: 'marble' },
  { id: 'balcon_rue', kind: 'balcon', name: 'Balcon sur rue', short: 'Balcon rue', level: 'etage', outdoor: true, edge: 'railing', box: box(BALCONIES[0].x0, BALCONIES[0].x1, BALCONIES[0].z0, BALCONIES[0].z1, ET), floor: 'deck' },
  { id: 'balcon_piscine', kind: 'balcon', name: 'Balcon de la suite', short: 'Balcon suite', level: 'etage', outdoor: true, edge: 'railing', box: box(BALCONIES[1].x0, BALCONIES[1].x1, BALCONIES[1].z0, BALCONIES[1].z1, ET), floor: 'deck' },
  // ---------------------------------------------------------------- toit-terrasse (glass balustrades on a thin slab edge)
  { id: 'edicule', kind: 'palier', name: 'Palier du toit', level: 'toit', box: box(4.4, H0.x1, H0.z0, 1.6, TO), floor: 'marble' },
  { id: 'terrasse', kind: 'terrasse', name: 'Terrasse du toit', short: 'Terrasse', level: 'toit', outdoor: true, edge: 'railing', box: box(H0.x0, 4.4, H0.z0, H0.z1, TO), floor: 'deck' },
  { id: 'terrasse_rue', kind: 'terrasse', name: 'Terrasse sur rue', short: 'Côté rue', level: 'toit', outdoor: true, edge: 'railing', box: box(4.4, H0.x1, 1.6, H0.z1, TO), floor: 'deck' },
];

const D = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, swing: string, hinge: 'start' | 'end'): Opening =>
  ({ id, kind: 'door', a, b, axis, x, z, width, height: 2.2, hinge, swing });
const A = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.6): Opening => ({ id, kind: 'arch', a, b, axis, x, z, width, height });
const G = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.6): Opening => ({ id, kind: 'glass', a, b, axis, x, z, width, height });
/** A glazed opening's height when it runs from the floor to just under the ceiling. */
const GLAZED = 2.9;
const openings: Opening[] = [
  { id: 'front', kind: 'front', a: 'entree', b: 'out', axis: 'x', x: FRONT_DOOR.x, z: FRONT_DOOR.z, width: FRONT_DOOR.width, height: 2.4 },
  A('entree-salon', 'entree', 'salon', 'x', -3.0, 0, 1.8),
  D('entree-bureau', 'entree', 'bureau', 'z', -4.6, 0.75, 0.9, 'bureau', 'start'),
  A('salon-manger', 'salon', 'manger', 'z', -1.0, -2.4, 2.6),
  A('manger-cuisine', 'manger', 'cuisine', 'x', 2.6, 0, 1.6),
  A('manger-hall', 'manger', 'hall', 'z', 4.4, -3.85, 1.3),
  D('hall-sde', 'hall', 'sde', 'x', 7.2, 1.6, 0.8, 'sde', 'end'),
  // floor-to-ceiling glazing onto the pool deck
  G('salon-jardin', 'salon', 'jardin', 'x', -4.5, H0.z0, 4.4, GLAZED),
  G('manger-jardin', 'manger', 'jardin', 'x', 1.7, H0.z0, 2.6, GLAZED),
  // étage
  A('palier-salon', 'palier', 'salon_familial', 'z', 4.4 + ET, 2.6, 1.8),
  A('salon-couloir', 'salon_familial', 'couloir', 'x', 3.7 + ET, -0.6, 1.0, 2.4),
  D('couloir-sdb', 'couloir', 'sdb', 'z', 4.4 + ET, -4.2, 0.8, 'sdb', 'start'),
  // each leaf opens against a side wall of the room it opens into (never a pocket between it and the wall)
  D('salon-chambre2', 'salon_familial', 'chambre2', 'x', 0.25 + ET, -0.6, 0.9, 'chambre2', 'start'),
  D('salon-suite', 'salon_familial', 'suite', 'x', -3.6 + ET, -0.6, 0.9, 'suite', 'end'),
  A('suite-dressing', 'suite', 'dressing', 'z', -2.8 + ET, -1.6, 1.0, 2.4),
  A('dressing-bain', 'dressing', 'bain', 'x', -1.6 + ET, -2.6, 0.9, 2.3),
  D('salon-chambre3', 'salon_familial', 'chambre3', 'z', -4.4 + ET, 3.3, 0.9, 'chambre3', 'end'),
  G('salon-balcon', 'salon_familial', 'balcon_rue', 'x', -2.3 + ET, H0.z1, 3.2, GLAZED),
  G('suite-balcon', 'suite', 'balcon_piscine', 'x', -5.4 + ET, H0.z0, 3.0, GLAZED),
  // toit
  G('edicule-terrasse', 'edicule', 'terrasse', 'z', 4.4 + TO, -3.9, 1.6, 2.4),
];

const W = (room: string, side: Window['side'], at: number, width: number, sill: number, height: number): Window => ({ room, side, at, width, sill, height });
/** Floor-to-ceiling glazing (a fixed pane from the floor to just under the ceiling). */
const TALL = [0.05, CEILING - 0.15] as const;
const windows: Window[] = [
  W('bureau', 's', -6.3, 1.6, 0.3, 2.5), W('bureau', 'w', 2.0, 1.4, 0.9, 1.5),
  W('cuisine', 's', 1.0, 2.6, 1.05, 1.25),
  W('salon', 'w', -2.5, 2.6, ...TALL),
  W('sde', 's', 6.0, 0.6, 1.6, 0.55),
  // étage
  W('suite', 'w', -2.8, 2.0, ...TALL),
  W('chambre2', 'n', 1.3 + ET, 1.6, 0.3, 2.5),
  W('chambre3', 'w', 1.7, 1.6, 0.9, 1.5), W('chambre3', 's', -6.9 + ET, 1.4, 0.3, 2.5),
  W('salon_familial', 's', 2.3 + ET, 2.4, ...TALL),
  // the landing's tall window behind the stair tower's wooden claustra (the façade)
  W('palier', 's', 6.2 + ET, 2.2, ...TALL),
  W('sdb', 'e', -3.9, 0.8, 1.5, 0.6),
  W('bain', 'n', -1.6 + ET, 1.0, 1.4, 0.8),
  W('couloir', 'n', 3.7 + ET, 0.8, 1.0, 1.4),
  // toit: the stair head looks out over the terrace
  W('edicule', 'n', 6.2 + TO, 1.2, 1.0, 1.2),
];

const F = (id: string, room: string, kind: Fixture['kind'], b: Rect, h: number, front: Fixture['front'], more: Partial<Fixture> = {}): Fixture => ({ id, room, kind, box: b, h, front, ...more });
const fixtures: Fixture[] = [
  // the kitchen: a run of units along the street wall under its window, the fridge at the end, an island in the middle
  F('counter', 'cuisine', 'counter', box(-0.7, 3.6, 3.275, 3.875), 0.9, 'n'),
  F('sink', 'cuisine', 'sink', box(1.05, 1.75, 3.275, 3.875), 0.9, 'n'),
  F('stove', 'cuisine', 'stove', box(2.6, 3.2, 3.275, 3.875), 0.9, 'n'),
  F('fridge', 'cuisine', 'fridge', box(3.63, 4.33, 3.175, 3.875), 1.9, 'n'),
  F('island', 'cuisine', 'counter', box(0.3, 2.7, 1.55, 2.35), 0.92, 'n', { island: true }),
  // the guests' shower room
  F('sde-shower', 'sde', 'shower', box(6.95, 7.875, 2.9, 3.875), 2.0, 'w'),
  F('sde-wc', 'sde', 'wc', box(4.47, 5.12, 2.45, 3.0), 0.8, 'e'),
  F('sde-basin', 'sde', 'basin', box(5.55, 6.15, 3.425, 3.875), 0.85, 'n'),
  // the pool in the back garden
  F('pool', 'jardin', 'pool', { x0: POOL.x0, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1 }, 0.5, 's', { depth: POOL.depth }),
  // étage: the family bathroom, the suite's bathroom (a bathtub under the window)
  F('sdb-shower', 'sdb', 'shower', box(6.95, 7.875, -4.875, -3.95, ET), 2.0, 'w'),
  F('sdb-wc', 'sdb', 'wc', box(6.15, 6.7, -4.875, -4.225, ET), 0.8, 's'),
  F('sdb-basin', 'sdb', 'basin', box(5.5, 6.1, -3.35, -2.9, ET), 0.85, 'n'),
  F('bain-bath', 'bain', 'bath', box(-2.73, -1.03, -4.875, -4.125, ET), 0.58, 's'),
  F('bain-wc', 'bain', 'wc', box(-1.12, -0.47, -4.0, -3.45, ET), 0.8, 'w'),
  F('bain-basin', 'bain', 'basin', box(-2.73, -2.28, -3.6, -3.0, ET), 0.85, 'e'),
  // the roof: the light helicopter's body on the helipad (src/world/helicopter.ts), walked round under its rotor
  F('heli', 'terrasse', 'heli', box(HELIPAD.x - 1.1, HELIPAD.x + 1.1, HELIPAD.z - 2.5, HELIPAD.z + 2.3, TO), 2.9, 's'),
  // the pergola's four posts on the roof terrace (clear of the rotor's sweep, x ≤ 0.6)
  ...([[1.1, 0.1], [4.15, 0.1], [1.1, 3.6], [4.15, 3.6]] as const).map(([x, z], k) => F(`pergola-${k}`, 'terrasse', 'post', box(x - 0.08, x + 0.08, z - 0.08, z + 0.08, TO), PERGOLA_H, 's')),
];
/** The roof terrace's pergola: oak slats on two beams over the street side's corner, 2.7 m above the deck. */
const pergolas: Pergola[] = [{ id: 'pergola', room: 'terrasse', box: box(0.95, 4.3, -0.05, 3.75, TO), h: PERGOLA_H }];

/** The villa of Almadies (catalogue `villa_almadies`): 144 m² on each floor, the back garden and its pool, two balconies, the roof terrace. */
export const VILLA_PLAN: FloorPlan = {
  // a 3 m ceiling under a 0.4 m floor (slab and ceiling void: the bands of the façade), so the chandeliers made for it hang right (lane K-L)
  id: 'villa_almadies', w: 22, d: 16.4, wallH: CEILING, inWall: 0.14, outWall: 0.25,
  rooms, openings, windows, fixtures, pergolas,
  spawn: { x: FRONT_DOOR.x, z: FRONT_DOOR.z - 0.8, yaw: Math.PI },
  levels: LEVELS.map(l => ({ ...l })),
  stairs: [
    // the ground floor to the first: the core's west half, rising toward the street; its well upstairs runs to the second flight
    { id: 'rdc-etage', from: 'hall', to: 'palier', box: box(4.6, 5.85, -2.76, 1.4), up: 's', steps: 17, well: box(4.47, 6.55, -2.76, 1.4, ET) },
    // the first floor to the roof: the core's east half, rising toward the garden
    { id: 'etage-toit', from: 'palier', to: 'edicule', box: box(6.55, 7.8, -2.76, 1.4, ET), up: 'n', steps: 17 },
  ],
  marks: [{ id: 'helipad', kind: 'helipad', room: 'terrasse', x: HELIPAD.x + TO, z: HELIPAD.z, r: HELIPAD.r }],
  box: { x0: BACK_GARDEN.x0, x1: BACK_GARDEN.x1, z0: BACK_GARDEN.z0, z1: BALCONIES[0].z1 },
  bounds: { x0: H0.x0 + TO - 0.5, x1: H0.x1 + ET + 0.5, z0: BACK_GARDEN.z0 - 0.5, z1: BALCONIES[0].z1 + 0.5 },
  edgeH: { garden: WALL_H, parapet: PARAPET, railing: 1.1 },
};
