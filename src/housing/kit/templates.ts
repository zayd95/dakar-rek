import type { Fixture, FloorPlan, Opening, Rect, Room, Window } from '../plan';

/**
 * The small homes of the kit (docs/kits/HOMES.md): a mini-studio, a studio and a three-room flat (F3), as floor plans in the contract of
 * src/housing/plan.ts, built by the shell of src/housing/apartment.ts like the F2 of the Résidence Jàmm. Each has a room to live and sleep in (or two),
 * a bathroom and a kitchen or a kitchenette, and a front door: nothing is a single open room but the starter room, « Ma chambre ».
 * Coordinates: metres from the middle of the home, +x east, +z south (the street door's side), as every plan; the checks are tests/homeKit.test.ts.
 *
 *   Mini-studio  5.8 × 4.6 m (26.7 m²)       Studio  7.0 × 5.0 m (35 m²)            F3  11 × 7.5 m (82.5 m²)
 *   ┌────────────┬─────┐                      ┌────────────┬─────────┐              ┌──────┬────┬─────┬─────┐
 *   │ kitchenette│ sdb │                      │            │kitchen- │              │ ch.1 │sdb │ch.2 │cuis.│
 *   │ ───        │     │                      │  pièce     │ette     │              ├─door─┴door┴door┴door─┤
 *   │ pièce à    ├─────┤                      │  à vivre   ├─────────┤              │        couloir        │
 *   │ vivre   arch entrée                     │            door sdb  │              ├────────────┬──arch────┤
 *   │            │front│                      └──front─────┴─────────┘              │  séjour    arch entrée │
 *   └────────────┴─────┘                                                            └────────────┴──front───┘
 */
const box = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });
/** A fitting stands this far in from its room's edge (a wall is at most 0.125 m to a side). */
const M = 0.13;
const D = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, swing: string, hinge: 'start' | 'end'): Opening =>
  ({ id, kind: 'door', a, b, axis, x, z, width, height: 2.1, hinge, swing });
const A = (id: string, a: string, b: string, axis: 'x' | 'z', x: number, z: number, width: number, height = 2.2): Opening => ({ id, kind: 'arch', a, b, axis, x, z, width, height });
const FRONT = (a: string, x: number, z: number): Opening => ({ id: 'front', kind: 'front', a, b: 'out', axis: 'x', x, z, width: 1.0, height: 2.15 });
const W = (room: string, side: Window['side'], at: number, width: number, sill: number, height: number): Window => ({ room, side, at, width, sill, height });
const F = (id: string, room: string, kind: Fixture['kind'], b: Rect, h: number, front: Fixture['front']): Fixture => ({ id, room, kind, box: b, h, front });
const FIN = { wallH: 2.8, inWall: 0.14, outWall: 0.22 };

/** A kitchenette: a worktop with a sink and two rings, a fridge at its end, along the wall of a room (north wall), from `x0` eastward. */
function kitchenette(room: string, x0: number, z0: number): Fixture[] {
  return [
    F('counter', room, 'counter', box(x0, x0 + 1.85, z0, z0 + 0.6), 0.9, 's'),
    F('sink', room, 'sink', box(x0 + 0.25, x0 + 0.9, z0, z0 + 0.6), 0.9, 's'),
    F('stove', room, 'stove', box(x0 + 1.1, x0 + 1.7, z0, z0 + 0.6), 0.9, 's'),
    F('fridge', room, 'fridge', box(x0 + 1.85, x0 + 2.55, z0, z0 + 0.7), 1.8, 's'),
  ];
}

/**
 * The mini-studio: one room to live and sleep in with its kitchenette along the north wall, a bathroom, and an entrance with the front door.
 * 26.7 m²: the smallest home a hub can list (a bed, a sofa and a table fit; the kitchenette and the shower are built in).
 */
export function miniStudioPlan(id: string): FloorPlan {
  const rooms: Room[] = [
    { id: 'sejour', kind: 'sejour', name: 'Pièce à vivre', box: box(-2.9, 0.5, -2.3, 2.3), floor: 'tiles' },
    { id: 'sdb', kind: 'sdb', name: 'Salle de bain', box: box(0.5, 2.9, -2.3, 0.2), floor: 'tiles' },
    { id: 'entree', kind: 'entree', name: 'Entrée', box: box(0.5, 2.9, 0.2, 2.3), floor: 'tiles' },
  ];
  return {
    id, w: 5.8, d: 4.6, ...FIN, rooms,
    openings: [FRONT('entree', 1.7, 2.3), A('entree-sejour', 'entree', 'sejour', 'z', 0.5, 1.25, 1.0), D('sejour-sdb', 'sejour', 'sdb', 'z', 0.5, -0.6, 0.8, 'sdb', 'end')],
    windows: [W('sejour', 's', -1.6, 1.4, 0.9, 1.2), W('sejour', 'w', 0.4, 1.2, 0.9, 1.2), W('sejour', 'n', 0.0, 0.9, 1.1, 1.0), W('sdb', 'n', 1.7, 0.6, 1.5, 0.5)],
    fixtures: [
      ...kitchenette('sejour', -2.775, -2.175),
      F('shower', 'sdb', 'shower', box(2.0, 2.775, -2.175, -1.25), 2.0, 'w'),
      F('basin', 'sdb', 'basin', box(0.95, 1.55, -2.175, -1.725), 0.85, 's'),
      F('wc', 'sdb', 'wc', box(2.225, 2.775, -0.9, -0.25), 0.8, 'w'),
    ],
    spawn: { x: 1.7, z: 1.6, yaw: Math.PI },
  };
}

/** The studio: a big room to live and sleep in, a kitchenette room opening on it, a bathroom with a door, the front door in the room's south wall. 35 m². */
export function studioPlan(id: string): FloorPlan {
  const rooms: Room[] = [
    { id: 'sejour', kind: 'sejour', name: 'Pièce à vivre', box: box(-3.5, 0.5, -2.5, 2.5), floor: 'tiles' },
    { id: 'cuisine', kind: 'cuisine', name: 'Kitchenette', box: box(0.5, 3.5, -2.5, -0.2), floor: 'tiles' },
    { id: 'sdb', kind: 'sdb', name: 'Salle de bain', box: box(0.5, 3.5, -0.2, 2.5), floor: 'tiles' },
  ];
  return {
    id, w: 7, d: 5, ...FIN, rooms,
    openings: [FRONT('sejour', -2.0, 2.5), A('sejour-cuisine', 'sejour', 'cuisine', 'z', 0.5, -1.35, 1.4), D('sejour-sdb', 'sejour', 'sdb', 'z', 0.5, 1.1, 0.8, 'sdb', 'end')],
    windows: [W('sejour', 's', -0.7, 1.0, 0.9, 1.2), W('sejour', 'w', 0, 1.6, 0.9, 1.2), W('sejour', 'n', -1.5, 1.4, 0.9, 1.2), W('cuisine', 'n', 2.0, 1.2, 1.1, 1.0), W('sdb', 'e', 1.6, 0.6, 1.5, 0.5)],
    fixtures: [
      F('counter', 'cuisine', 'counter', box(0.57, 2.675, -2.375, -1.775), 0.9, 's'),
      F('sink', 'cuisine', 'sink', box(1.0, 1.7, -2.375, -1.775), 0.9, 's'),
      F('stove', 'cuisine', 'stove', box(2.0, 2.6, -2.375, -1.775), 0.9, 's'),
      F('fridge', 'cuisine', 'fridge', box(2.675, 3.375, -2.375, -1.675), 1.9, 's'),
      F('shower', 'sdb', 'shower', box(2.5, 3.375, 1.45, 2.375), 2.0, 'w'),
      F('wc', 'sdb', 'wc', box(2.0, 2.65, -0.13, 0.55), 0.8, 's'),
      F('basin', 'sdb', 'basin', box(1.0, 1.6, -0.13, 0.32), 0.85, 's'),
    ],
    spawn: { x: -2.0, z: 1.7, yaw: Math.PI },
  };
}

/** The F3: an entrance, a séjour, a kitchen, two bedrooms and a bathroom off a corridor. 82.5 m². */
export function f3Plan(id: string): FloorPlan {
  const rooms: Room[] = [
    { id: 'chambre1', kind: 'chambre', name: 'Chambre 1', box: box(-5.5, -2.3, -3.75, -0.6), floor: 'wood' },
    { id: 'sdb', kind: 'sdb', name: 'Salle de bain', box: box(-2.3, 0, -3.75, -0.6), floor: 'tiles' },
    { id: 'chambre2', kind: 'chambre', name: 'Chambre 2', box: box(0, 2.9, -3.75, -0.6), floor: 'wood' },
    { id: 'cuisine', kind: 'cuisine', name: 'Cuisine', box: box(2.9, 5.5, -3.75, -0.6), floor: 'tiles' },
    { id: 'couloir', kind: 'degagement', name: 'Couloir', box: box(-5.5, 5.5, -0.6, 0.8), floor: 'tiles' },
    { id: 'sejour', kind: 'sejour', name: 'Séjour', box: box(-5.5, 1.5, 0.8, 3.75), floor: 'tiles' },
    { id: 'entree', kind: 'entree', name: 'Entrée', box: box(1.5, 5.5, 0.8, 3.75), floor: 'tiles' },
  ];
  return {
    id, w: 11, d: 7.5, ...FIN, rooms,
    openings: [
      FRONT('entree', 3.5, 3.75), A('entree-sejour', 'entree', 'sejour', 'z', 1.5, 2.3, 1.4), A('entree-couloir', 'entree', 'couloir', 'x', 3.5, 0.8, 1.4), A('sejour-couloir', 'sejour', 'couloir', 'x', -2.0, 0.8, 1.6),
      D('couloir-chambre1', 'couloir', 'chambre1', 'x', -3.9, -0.6, 0.9, 'chambre1', 'start'), D('couloir-sdb', 'couloir', 'sdb', 'x', -1.15, -0.6, 0.8, 'sdb', 'end'),
      D('couloir-chambre2', 'couloir', 'chambre2', 'x', 1.45, -0.6, 0.9, 'chambre2', 'start'), D('couloir-cuisine', 'couloir', 'cuisine', 'x', 4.2, -0.6, 0.9, 'cuisine', 'end'),
    ],
    windows: [
      W('chambre1', 'n', -3.9, 1.4, 0.9, 1.2), W('chambre1', 'w', -2.2, 1.2, 0.9, 1.2), W('sdb', 'n', -1.15, 0.6, 1.5, 0.5), W('chambre2', 'n', 1.45, 1.4, 0.9, 1.2),
      W('cuisine', 'n', 4.2, 1.2, 1.1, 1.0), W('cuisine', 'e', -2.2, 1.0, 1.1, 1.0), W('sejour', 's', -3.5, 1.6, 0.9, 1.2), W('sejour', 's', -0.8, 1.2, 0.9, 1.2), W('sejour', 'w', 2.3, 1.2, 0.9, 1.2),
    ],
    fixtures: [
      F('counter', 'cuisine', 'counter', box(2.97, 4.675, -3.625, -3.025), 0.9, 's'),
      F('sink', 'cuisine', 'sink', box(3.3, 3.95, -3.625, -3.025), 0.9, 's'),
      F('stove', 'cuisine', 'stove', box(4.1, 4.65, -3.625, -3.025), 0.9, 's'),
      F('fridge', 'cuisine', 'fridge', box(4.675, 5.375, -3.625, -2.925), 1.9, 's'),
      F('shower', 'sdb', 'shower', box(-1.0, -0.07, -3.625, -2.7), 2.0, 'w'),
      F('wc', 'sdb', 'wc', box(-2.23, -1.68, -3.2, -2.55), 0.8, 'e'),
      F('basin', 'sdb', 'basin', box(-2.23, -1.78, -2.2, -1.6), 0.85, 'e'),
    ],
    spawn: { x: 3.5, z: 3.0, yaw: Math.PI },
  };
}
export { M as FIXTURE_MARGIN };
