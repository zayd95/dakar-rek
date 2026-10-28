import type { Fixture, FloorPlan, Opening, Rect, Room, Window } from './plan';

/**
 * The family house of the Cité Jàmm (catalogue `maison_cite`, « Une maison avec cour, grand salon et cuisine »): a floor plan on two levels, so the
 * inside is a house like the outside (the two storeys, the glass balconies and the iron-gated front of src/economy/citeJamm.ts), not one open room.
 * 12 m by 9 m, 108 m² on each floor, the courtyard behind. Same contract as the villa (src/housing/plan.ts, version 2: plan space is unfolded, the
 * first floor's rooms at x + 20), same shell (src/housing/apartment.ts).
 *
 *   Rez-de-chaussée (+ la cour, z −10.5…−4.5)                    Étage (+20)
 *      x −6      −1.2        3.0   6                              x −6    −2.8  −0.6        3.0   6
 *  z −4.5 ┌─glass──┬──glass───┬──────┐                         −4.5 ┌───────┬─────┬──────────┬──────┐
 *         │ grand  arch salle arch hall                             │ ch. 2 │ sdb │ chambre 3│palier│
 *         │ salon  │ à manger  foot ↓│                               ├─door──┴door─┴──door─────┤ ↑  ↑ │
 *     0.5 ├─arch──┬┴─arch──┬──┴──────┤                          −0.6 │         couloir        arch  well│
 *         │chambre│ entrée │ cuisine │ hall                      0.8 ├────door──┬──arch──────┤      │
 *         │ door  │ front  arch      │ (to 1.6)                       │ chambre  │  salon     │      │
 *     1.6 │       │        │         ├─door─┤                        │ parentale│  familial  arch    │
 *         │       │        │         │ s.eau│                    4.5 └──glass───┴──glass─────┴──────┘
 *     4.5 └───────┴──front─┴─────────┴──────┘                            balcon suite      balcon rue
 *
 * Rooms are at least as wide as the contract asks (2.4 m inside; the bathrooms 2 m, the couloir 1.1 m): the checks are tests/maisonPlan.test.ts.
 */
const ET = 20;
/** The storey's height (m) and the rooms' height under the ceiling. */
export const MAISON_STOREY = 3.4, MAISON_CEILING = 3.0;
const box = (x0: number, x1: number, z0: number, z1: number, dx = 0): Rect => ({ x0: x0 + dx, x1: x1 + dx, z0, z1 });
const X0 = -6, X1 = 6, Z0 = -4.5, Z1 = 4.5;
/** The front door (its middle), on the street wall of the entrance. */
export const MAISON_DOOR = { x: -1.1, z: Z1, width: 1.2 } as const;
/** The courtyard behind the house, and the two balconies over the street. */
export const COUR: Rect = { x0: X0, x1: 3.0, z0: -10.5, z1: Z0 };
const BALCONS = [box(-1.2, 2.6, Z1, 5.9), box(-5.6, -2.0, Z1, 5.9)] as const;

const rooms: Room[] = [
  // ---------------------------------------------------------------- rez-de-chaussée
  { id: 'salon', kind: 'sejour', name: 'Grand salon', level: 'rdc', box: box(X0, -1.2, Z0, 0.5), floor: 'marble', accent: { side: 'w', kind: 'stone' } },
  { id: 'manger', kind: 'manger', name: 'Salle à manger', level: 'rdc', box: box(-1.2, 3.0, Z0, 0.5), floor: 'marble', accent: { side: 'e', kind: 'wood' } },
  { id: 'hall', kind: 'palier', name: 'Hall de l’escalier', level: 'rdc', box: box(3.0, X1, Z0, 1.6), floor: 'marble' },
  { id: 'chambre', kind: 'chambre', name: 'Chambre d’amis', level: 'rdc', box: box(X0, -2.4, 0.5, Z1), floor: 'wood', accent: { side: 'w', kind: 'wood' } },
  { id: 'entree', kind: 'entree', name: 'Entrée', level: 'rdc', box: box(-2.4, 0.2, 0.5, Z1), floor: 'marble' },
  { id: 'cuisine', kind: 'cuisine', name: 'Cuisine', level: 'rdc', box: box(0.2, 3.0, 0.5, Z1), floor: 'marble' },
  { id: 'sde', kind: 'sdb', name: 'Salle d’eau', level: 'rdc', box: box(3.0, X1, 1.6, Z1), floor: 'tiles' },
  { id: 'cour', kind: 'terrasse', name: 'La cour', level: 'rdc', outdoor: true, edge: 'garden', box: { ...COUR }, floor: 'stone' },
  // ---------------------------------------------------------------- étage
  { id: 'chambre2', kind: 'chambre', name: 'Chambre 2', level: 'etage', box: box(X0, -2.8, Z0, -0.6, ET), floor: 'wood', accent: { side: 'n', kind: 'wood' } },
  { id: 'sdb', kind: 'sdb', name: 'Salle de bain', level: 'etage', box: box(-2.8, -0.6, Z0, -0.6, ET), floor: 'tiles' },
  { id: 'chambre3', kind: 'chambre', name: 'Chambre 3', level: 'etage', box: box(-0.6, 3.0, Z0, -0.6, ET), floor: 'wood' },
  { id: 'couloir', kind: 'degagement', name: 'Couloir', level: 'etage', box: box(X0, 3.0, -0.6, 0.8, ET), floor: 'wood' },
  { id: 'suite', kind: 'chambre', name: 'Chambre parentale', short: 'Parents', level: 'etage', box: box(X0, -1.6, 0.8, Z1, ET), floor: 'wood', accent: { side: 'w', kind: 'wood' } },
  { id: 'salon_familial', kind: 'sejour', name: 'Salon familial', level: 'etage', box: box(-1.6, 3.0, 0.8, Z1, ET), floor: 'marble', accent: { side: 'n', kind: 'stone' } },
  { id: 'palier', kind: 'palier', name: 'Palier', level: 'etage', box: box(3.0, X1, Z0, Z1, ET), floor: 'marble' },
  { id: 'balcon_rue', kind: 'balcon', name: 'Balcon sur rue', short: 'Balcon rue', level: 'etage', outdoor: true, edge: 'railing', box: { ...BALCONS[0], x0: BALCONS[0].x0 + ET, x1: BALCONS[0].x1 + ET }, floor: 'deck' },
  { id: 'balcon_suite', kind: 'balcon', name: 'Balcon des parents', short: 'Balcon parents', level: 'etage', outdoor: true, edge: 'railing', box: { ...BALCONS[1], x0: BALCONS[1].x0 + ET, x1: BALCONS[1].x1 + ET }, floor: 'deck' },
];

const D = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, swing: string, hinge: 'start' | 'end'): Opening =>
  ({ id, kind: 'door', a, b, axis, x, z, width, height: 2.2, hinge, swing });
const A = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.6): Opening => ({ id, kind: 'arch', a, b, axis, x, z, width, height });
const G = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.9): Opening => ({ id, kind: 'glass', a, b, axis, x, z, width, height });
const openings: Opening[] = [
  { id: 'front', kind: 'front', a: 'entree', b: 'out', axis: 'x', x: MAISON_DOOR.x, z: MAISON_DOOR.z, width: MAISON_DOOR.width, height: 2.4 },
  A('entree-manger', 'entree', 'manger', 'x', -0.5, 0.5, 0.9),
  A('entree-salon', 'entree', 'salon', 'x', -1.8, 0.5, 0.8),
  D('entree-chambre', 'entree', 'chambre', 'z', -2.4, 2.5, 0.9, 'chambre', 'start'),
  A('manger-cuisine', 'manger', 'cuisine', 'x', 1.6, 0.5, 1.4),
  A('salon-manger', 'salon', 'manger', 'z', -1.2, -2.2, 2.4),
  // the stair hall is entered from the dining room by its north end, in front of the foot of the flight
  A('manger-hall', 'manger', 'hall', 'z', 3.0, -3.7, 1.2),
  D('hall-sde', 'hall', 'sde', 'x', 5.3, 1.6, 0.8, 'sde', 'end'),
  // the courtyard, through floor-to-ceiling glass
  G('salon-cour', 'salon', 'cour', 'x', -3.6, Z0, 3.4),
  G('manger-cour', 'manger', 'cour', 'x', 0.9, Z0, 2.4),
  // étage
  A('palier-salon', 'palier', 'salon_familial', 'z', 3.0 + ET, 2.8, 1.6),
  D('couloir-chambre2', 'couloir', 'chambre2', 'x', -4.4 + ET, -0.6, 0.9, 'chambre2', 'start'),
  D('couloir-sdb', 'couloir', 'sdb', 'x', -1.7 + ET, -0.6, 0.8, 'sdb', 'end'),
  D('couloir-chambre3', 'couloir', 'chambre3', 'x', 1.2 + ET, -0.6, 0.9, 'chambre3', 'start'),
  D('couloir-suite', 'couloir', 'suite', 'x', -4.2 + ET, 0.8, 0.9, 'suite', 'end'),
  A('couloir-salon', 'couloir', 'salon_familial', 'x', 0.7 + ET, 0.8, 1.6),
  G('salon-balcon', 'salon_familial', 'balcon_rue', 'x', 0.7 + ET, Z1, 3.2),
  G('suite-balcon', 'suite', 'balcon_suite', 'x', -3.8 + ET, Z1, 2.4),
];

const W = (room: string, side: Window['side'], at: number, width: number, sill: number, height: number): Window => ({ room, side, at, width, sill, height });
const TALL = [0.05, MAISON_CEILING - 0.15] as const;
const windows: Window[] = [
  W('salon', 'w', -2.0, 2.4, ...TALL),
  W('chambre', 'w', 2.5, 1.4, 0.9, 1.5), W('chambre', 's', -4.2, 1.4, 0.9, 1.5),
  W('cuisine', 's', 1.7, 2.0, 1.05, 1.25),
  W('sde', 'e', 3.0, 0.6, 1.5, 0.55),
  W('hall', 'e', -1.5, 1.2, 1.0, 1.4),
  // étage
  W('chambre2', 'n', -4.4 + ET, 1.4, 0.9, 1.5), W('chambre2', 'w', -2.5, 1.4, 0.9, 1.5),
  W('sdb', 'n', -1.7 + ET, 0.8, 1.4, 0.8),
  W('chambre3', 'n', 1.2 + ET, 1.8, 0.9, 1.5),
  W('suite', 'w', 2.6, 1.8, ...TALL),
  W('palier', 'e', 0.6, 2.0, ...TALL), W('palier', 'n', 4.5 + ET, 1.2, 1.0, 1.2),
];

const F = (id: string, room: string, kind: Fixture['kind'], b: Rect, h: number, front: Fixture['front'], more: Partial<Fixture> = {}): Fixture => ({ id, room, kind, box: b, h, front, ...more });
const fixtures: Fixture[] = [
  // the kitchen: a run of units under the window on the street wall, the fridge at its end, an island
  F('counter', 'cuisine', 'counter', box(0.27, 2.23, 3.775, 4.375), 0.9, 'n'),
  F('sink', 'cuisine', 'sink', box(0.55, 1.2, 3.775, 4.375), 0.9, 'n'),
  F('stove', 'cuisine', 'stove', box(1.45, 2.05, 3.775, 4.375), 0.9, 'n'),
  F('fridge', 'cuisine', 'fridge', box(2.23, 2.93, 3.675, 4.375), 1.9, 'n'),
  F('island', 'cuisine', 'counter', box(0.9, 2.2, 2.0, 2.7), 0.92, 'n', { island: true }),
  // the shower room under the stair hall
  F('sde-shower', 'sde', 'shower', box(5.0, 5.875, 3.45, 4.375), 2.0, 'w'),
  F('sde-wc', 'sde', 'wc', box(3.07, 3.62, 2.2, 2.85), 0.8, 'e'),
  F('sde-basin', 'sde', 'basin', box(3.07, 3.52, 3.3, 3.9), 0.85, 'e'),
  // étage: the bathroom, a bath under its window
  F('sdb-bath', 'sdb', 'bath', box(-2.73 + ET, -1.03 + ET, Z0 + 0.125, Z0 + 0.875, 0), 0.58, 's'),
  F('sdb-wc', 'sdb', 'wc', box(-1.22 + ET, -0.67 + ET, -3.2, -2.55), 0.8, 'w'),
  F('sdb-basin', 'sdb', 'basin', box(-2.73 + ET, -2.28 + ET, -2.4, -1.8), 0.85, 'e'),
];

/** The family house of the Cité Jàmm (catalogue `maison_cite`): two levels, the courtyard behind, two balconies over the street. */
export const MAISON_PLAN: FloorPlan = {
  id: 'maison_cite', w: 12, d: 9, wallH: MAISON_CEILING, inWall: 0.14, outWall: 0.25,
  rooms, openings, windows, fixtures,
  spawn: { x: MAISON_DOOR.x, z: MAISON_DOOR.z - 0.8, yaw: Math.PI },
  levels: [{ id: 'rdc', name: 'Rez-de-chaussée', y: 0, dx: 0 }, { id: 'etage', name: 'Étage', y: MAISON_STOREY, dx: ET }],
  stairs: [
    // the ground floor to the first: against the east wall, rising toward the street; entered from the north end of the hall
    { id: 'rdc-etage', from: 'hall', to: 'palier', box: box(3.3, 4.55, -2.5, 1.5), up: 's', steps: 17 },
  ],
  box: { x0: X0, x1: X1, z0: COUR.z0, z1: Z1 + 3.2 },
  bounds: { x0: X0 - 0.5, x1: X1 + ET + 0.5, z0: COUR.z0 - 0.5, z1: Z1 + 3.7 },
  edgeH: { garden: 2.4, parapet: 1.1, railing: 1.1 },
  // the lot round the house is its courtyard-side yard and a front step: a gate for people, no driveway
  gate: { x0: -1.7, x1: -0.5 },
  yard: 3.2,
};
