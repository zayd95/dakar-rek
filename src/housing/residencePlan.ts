import type { Fixture, FloorPlan, Opening, Rect, Room, Window } from './plan';

/**
 * The luxury residence of the Pointe de Ngor (catalogue `residence_ngor`, « Un étage entier face à l'île de Ngor, terrasse et salon de réception »): one
 * whole floor of the tower, 22 m by 15 m (330 m²) with the sea terrace along its north side, on the premium finish of the villa (a plan on levels: here
 * one). Same contract (src/housing/plan.ts) and shell (src/housing/apartment.ts) as the villa and the family house; the checks are tests/homeKit.test.ts.
 *
 *      x −11      −5          4        7.5    11
 *  z −10.5 ┌──────────────terrasse (the sea, the island)───────────┐
 *   −6.5   ├──glass───┬──glass──────────┬─────glass──────────┤
 *          │  suite   door  grand salon  arch   chambre 2      │
 *          │parentale │  de réception   │                      │
 *   −1.0   ├──arch────┼────arch─────────┴──door────────────────┤
 *          │ dressing door       galerie                       │
 *    1.5   ├──arch────┼──door──┬─arch──┬──arch──┬──door───────┤
 *          │  salle   │ cuisine│ salle │ hall   │ bain 2      │
 *          │ de bain  │ (îlot) │ à manger d'entrée             │
 *    8.5   └──────────┴────────┴───────┴──front──┴─────────────┘
 */
const box = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });
const L = 'etage';
/** The street wall's z (m): the south rooms are 7.7 m deep. */
const S = 8.5;
const rooms: Room[] = [
  { id: 'suite', kind: 'chambre', name: 'Suite parentale', short: 'Suite', level: L, box: box(-11, -5, -6.5, -1), floor: 'wood', accent: { side: 'w', kind: 'wood' } },
  { id: 'dressing', kind: 'dressing', name: 'Dressing', level: L, box: box(-11, -5, -1, 1.5), floor: 'wood' },
  { id: 'bain', kind: 'sdb', name: 'Salle de bain parentale', short: 'Bain parental', level: L, box: box(-11, -5, 1.5, S), floor: 'tiles' },
  { id: 'salon', kind: 'sejour', name: 'Salon de réception', level: L, box: box(-5, 4, -6.5, -1), floor: 'marble', accent: { side: 's', kind: 'stone' } },
  { id: 'chambre2', kind: 'chambre', name: 'Chambre 2', level: L, box: box(4, 11, -6.5, -1), floor: 'wood', accent: { side: 'e', kind: 'wood' } },
  { id: 'galerie', kind: 'degagement', name: 'Galerie', level: L, box: box(-5, 11, -1, 0.8), floor: 'marble' },
  { id: 'cuisine', kind: 'cuisine', name: 'Cuisine', level: L, box: box(-5, 0, 0.8, S), floor: 'marble' },
  { id: 'manger', kind: 'manger', name: 'Salle à manger', level: L, box: box(0, 4.5, 0.8, S), floor: 'marble', accent: { side: 'e', kind: 'stone' } },
  { id: 'entree', kind: 'entree', name: 'Hall d’entrée', level: L, box: box(4.5, 8, 0.8, S), floor: 'marble' },
  { id: 'bain2', kind: 'sdb', name: 'Salle de bain', level: L, box: box(8, 11, 0.8, S), floor: 'tiles' },
  { id: 'terrasse', kind: 'terrasse', name: 'Terrasse sur la mer', short: 'Terrasse', level: L, outdoor: true, edge: 'railing', box: box(-11, 11, -10.5, -6.5), floor: 'deck' },
];
const D = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, swing: string, hinge: 'start' | 'end'): Opening => ({ id, kind: 'door', a, b, axis, x, z, width, height: 2.2, hinge, swing });
const A = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.6): Opening => ({ id, kind: 'arch', a, b, axis, x, z, width, height });
const G = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.9): Opening => ({ id, kind: 'glass', a, b, axis, x, z, width, height });
const openings: Opening[] = [
  { id: 'front', kind: 'front', a: 'entree', b: 'out', axis: 'x', x: 6.25, z: S, width: 1.2, height: 2.4 },
  A('entree-manger', 'entree', 'manger', 'z', 4.5, 4.8, 1.8), A('manger-cuisine', 'manger', 'cuisine', 'z', 0, 4.8, 1.8), A('entree-galerie', 'entree', 'galerie', 'x', 6.25, 0.8, 1.4),
  A('manger-galerie', 'manger', 'galerie', 'x', 2.25, 0.8, 1.6), D('cuisine-galerie', 'cuisine', 'galerie', 'x', -2.5, 0.8, 0.9, 'cuisine', 'start'), D('bain2-galerie', 'bain2', 'galerie', 'x', 9.5, 0.8, 0.8, 'bain2', 'end'),
  A('galerie-salon', 'galerie', 'salon', 'x', -0.5, -1, 3.0), D('galerie-chambre2', 'galerie', 'chambre2', 'x', 7.5, -1, 0.9, 'chambre2', 'start'), D('galerie-dressing', 'galerie', 'dressing', 'z', -5, -0.1, 0.9, 'dressing', 'start'),
  D('suite-salon', 'suite', 'salon', 'z', -5, -3.75, 0.9, 'suite', 'end'), A('suite-dressing', 'suite', 'dressing', 'x', -8, -1, 1.4, 2.4), A('dressing-bain', 'dressing', 'bain', 'x', -9.5, 1.5, 1.2, 2.3),
  G('suite-terrasse', 'suite', 'terrasse', 'x', -8, -6.5, 3.2), G('salon-terrasse', 'salon', 'terrasse', 'x', -0.5, -6.5, 6.0), G('chambre2-terrasse', 'chambre2', 'terrasse', 'x', 7.5, -6.5, 3.0),
];
const W = (room: string, side: Window['side'], at: number, width: number, sill: number, height: number): Window => ({ room, side, at, width, sill, height });
const TALL = [0.05, 2.85] as const;
const windows: Window[] = [
  W('suite', 'w', -3.75, 2.2, ...TALL), W('bain', 'w', 5.0, 1.0, 1.4, 0.8), W('bain', 's', -8, 1.6, 1.4, 0.8), W('cuisine', 's', -2.5, 2.4, 1.05, 1.25), W('manger', 's', 2.25, 2.4, 0.3, 2.5),
  W('bain2', 'e', 4.8, 0.8, 1.5, 0.6), W('chambre2', 'e', -3.75, 1.8, ...TALL),
];
const F = (id: string, room: string, kind: Fixture['kind'], b: Rect, h: number, front: Fixture['front'], more: Partial<Fixture> = {}): Fixture => ({ id, room, kind, box: b, h, front, ...more });
const fixtures: Fixture[] = [
  F('counter', 'cuisine', 'counter', box(-4.9, -0.95, S - 0.725, S - 0.125), 0.9, 'n'), F('sink', 'cuisine', 'sink', box(-4.0, -3.2, S - 0.725, S - 0.125), 0.9, 'n'), F('stove', 'cuisine', 'stove', box(-2.4, -1.6, S - 0.725, S - 0.125), 0.9, 'n'),
  F('fridge', 'cuisine', 'fridge', box(-0.95, -0.07, S - 0.825, S - 0.125), 1.9, 'n'), F('island', 'cuisine', 'counter', box(-3.8, -1.4, 4.2, 5.1), 0.92, 'n', { island: true }),
  F('bain-bath', 'bain', 'bath', box(-10.875, -9.175, S - 0.875, S - 0.125), 0.58, 'n'), F('bain-shower', 'bain', 'shower', box(-6.0, -5.07, S - 1.05, S - 0.125), 2.0, 'w'),
  F('bain-wc', 'bain', 'wc', box(-10.875, -10.325, 3.4, 4.05), 0.8, 'e'), F('bain-basin', 'bain', 'basin', box(-7.9, -6.3, 1.57, 2.02), 0.85, 's'),
  F('bain2-shower', 'bain2', 'shower', box(9.95, 10.875, S - 1.05, S - 0.125), 2.0, 'w'), F('bain2-wc', 'bain2', 'wc', box(10.325, 10.875, 3.0, 3.65), 0.8, 'w'), F('bain2-basin', 'bain2', 'basin', box(8.07, 8.52, 3.0, 3.6), 0.85, 'e'),
];
/** The residence of the Pointe de Ngor (catalogue `residence_ngor`): one floor of the tower, the sea terrace along its north side. */
export const RESIDENCE_PLAN: FloorPlan = {
  id: 'residence_ngor', w: 22, d: 15, wallH: 3.0, inWall: 0.14, outWall: 0.25,
  rooms, openings, windows, fixtures,
  spawn: { x: 6.25, z: S - 0.8, yaw: Math.PI },
  levels: [{ id: L, name: 'Étage', y: 0, dx: 0 }],
  box: box(-11, 11, -10.5, S), bounds: box(-11.5, 11.5, -11, S + 0.5), edgeH: { garden: 2.4, parapet: 1.1, railing: 1.1 },
  noLot: true,
};
