import { describe, it, expect } from 'vitest';
import { pickTarget, primaryOf, Interactions } from '../src/interact/system';
import { Seats, benchSeats, sitOriginY, SIT_HIPS, type Seat } from '../src/interact/seats';
import { LegacySource, actionVerb } from '../src/interact/legacy';
import type { Target } from '../src/interact/types';
import { approachPath, seatEntries, segClear, type Rect } from '../src/interact/approach';
import type { Interactable } from '../src/world/types';

const T = (id: string, x: number, z: number, o: Partial<Target> = {}): Target => ({ id, name: id, kind: 'place', space: 'street', x, z, radius: 3, affordances: () => [{ id: 'a', verb: 'use', label: id, run() {} }], ...o });
const seat = (id: string, x: number, z: number, o: Partial<Seat> = {}): Seat => ({ id, x, z, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null, ...o });

describe('interactions: focus', () => {
  it('picks the closest target in reach, in the same space', () => {
    expect(pickTarget([T('a', 2, 0), T('b', 1, 0)], 'street', 0, 0, Math.PI / 2)?.id).toBe('b');
    expect(pickTarget([T('a', 5, 0)], 'street', 0, 0, 0)).toBeNull();                                 // out of reach
    expect(pickTarget([T('a', 1, 0, { space: 'home' })], 'street', 0, 0, 0)).toBeNull();               // other space
  });
  it('prefers what is in front of the player', () => {
    // facing +z (yaw 0): a target 1.2 m ahead beats one 1.0 m behind
    expect(pickTarget([T('behind', 0, -1), T('ahead', 0, 1.2)], 'street', 0, 0, 0)?.id).toBe('ahead');
  });
  it('a seat (bias 1) does not steal a counter the player stands at', () => {
    const s = new Seats(); s.add(seat('b0', 0.6, 0));
    const out: Target[] = []; s.collect('street', 0, 0, out);
    expect(pickTarget([...out, T('counter', 0.2, 0)], 'street', 0, 0, Math.PI / 2)?.id).toBe('counter');
    expect(pickTarget(out, 'street', 0, 0, Math.PI / 2)?.kind).toBe('seat');
  });
  it('primary is the first available affordance', () => {
    const t = T('x', 0, 0, { affordances: () => [{ id: 'a', verb: 'buy', label: 'A', disabled: 'Pas assez d’argent', run() {} }, { id: 'b', verb: 'use', label: 'B', run() {} }] });
    expect(primaryOf(t)?.id).toBe('b');
    const sys = new Interactions(); sys.add({ name: 'one', collect: (_s, _x, _z, out) => out.push(t) });
    expect(sys.update('street', 0, 0, 0)?.id).toBe('x');
    expect(sys.all().map(a => a.id)).toEqual(['a', 'b']);
  });
});

describe('seats', () => {
  it('lays three places along a bench, facing the bench yaw', () => {
    const list = benchSeats('b', 10, 20, 0, 0.58, 'street');
    expect(list).toHaveLength(3);
    expect(list.map(s => s.z)).toEqual([20, 20, 20]);                       // yaw 0: bench along x
    expect(list[0].x).toBeCloseTo(8.8); expect(list[2].x).toBeCloseTo(11.2);
    const side = benchSeats('c', 0, 0, Math.PI / 2, 0.55, 'x', 3.2, 3);      // yaw π/2: bench along z
    expect(side.every(s => Math.abs(s.x) < 1e-9)).toBe(true);
  });
  it('occupy, release and nearest free seat', () => {
    const s = new Seats(); s.addAll(benchSeats('b', 0, 0, 0, 0.58, 'street'));
    expect(s.occupy('b:1', 'player')).toBe(true);
    expect(s.occupy('b:1', 'npc')).toBe(false);
    expect(s.nearestFree('street', 0, 0)?.id).not.toBe('b:1');
    const out: Target[] = []; s.collect('street', 0, 0, out);
    expect(out.map(t => t.id)).not.toContain('seat:b:1');                    // occupied seats are not offered
    s.release('b:1', 'npc'); expect(s.get('b:1')?.occupant).toBe('player'); // only the occupant can release
    s.release('b:1', 'player'); expect(s.get('b:1')?.occupant).toBeNull();
    expect(s.occupyNear('street', 1.2, 0, 'npc')?.id).toBe('b:2');
    s.clear('street'); expect(s.size).toBe(0);
  });
  it('sitting height follows the seat', () => {
    expect(sitOriginY({ top: 0.58 })).toBeCloseTo(0.58 - SIT_HIPS);
    const out: Target[] = []; const s = new Seats(); s.add(seat('st', 0, 0, { kind: 'stool', top: 0.45 })); s.collect('street', 0, 0, out);
    expect(out[0].affordances()[0].verb).toBe('sit');
  });
});

describe('walking to a seat', () => {
  // a gargote table (1.2 × 0.8) with a chair on each side, both facing it, and the counter wall behind the player
  const box = (x: number, z: number, w: number, d: number): Rect => ({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  const room = [box(0, 0, 1.2, 0.8), box(-0.85, 0, 0.5, 0.5), box(0.85, 0, 0.5, 0.5), box(0, -3, 6, 0.4)];
  const left = { x: -0.81, z: 0, yaw: Math.PI / 2 };                        // faces +x, the table
  const grown = (r: number) => room.map(c => ({ x0: c.x0 - r + 0.03, z0: c.z0 - r + 0.03, x1: c.x1 + r - 0.03, z1: c.z1 + r - 0.03 }));
  it('segment test against rectangles', () => {
    expect(segClear({ x: -2, z: 0 }, { x: 2, z: 0 }, [box(0, 0, 1, 1)])).toBe(false);
    expect(segClear({ x: -2, z: 1 }, { x: 2, z: 1 }, [box(0, 0, 1, 1)])).toBe(true);
    expect(segClear({ x: 0.5, z: -2 }, { x: 0.5, z: 2 }, [box(0, 0, 1, 1)])).toBe(true);   // along an edge
  });
  it('steps in from the side or the back, never through the table in front', () => {
    const e = seatEntries(left);
    expect(e[3].x).toBeGreaterThan(left.x);                                   // the last candidate is in front (the table)
    const path = approachPath({ x: 0.2, z: -2.2 }, left, room, 0.3)!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual({ x: left.x, z: left.z });
    const spot = path.at(-2)!;
    expect(Math.hypot(spot.x - left.x, spot.z - left.z)).toBeCloseTo(0.75);
    expect(spot.x).toBeLessThan(left.x + 0.1);                                 // beside or behind the chair, not at the table
    // every leg before the last one keeps the player's radius away from the furniture
    const legs = [{ x: 0.2, z: -2.2 }, ...path.slice(0, -1)];
    for (let i = 1; i < legs.length; i++) expect(segClear(legs[i - 1], legs[i], grown(0.3))).toBe(true);
  });
  it('goes round the table when the seat is on the far side', () => {
    const right = { x: 0.81, z: 0, yaw: -Math.PI / 2 };
    const from = { x: -2, z: 0.1 };
    const path = approachPath(from, right, room, 0.3)!;
    expect(path.length).toBeGreaterThan(2);                                     // at least one turn
    const legs = [from, ...path.slice(0, -1)];
    for (let i = 1; i < legs.length; i++) expect(segClear(legs[i - 1], legs[i], grown(0.3))).toBe(true);
  });
  it('steps in further out from a deep bench whose footprint covers the near spots', () => {
    const bench = { x: 10, z: 0, yaw: -Math.PI / 2 };                         // a city bench along z, 0.7 m deep
    const path = approachPath({ x: 6, z: 3 }, bench, [box(10, 0, 0.7, 3.2)], 0.5)!;
    expect(path).not.toBeNull();
    expect(Math.hypot(path.at(-2)!.x - 10, path.at(-2)!.z)).toBeCloseTo(1.1);
  });
  it('sits at once when the seat is at hand, gives up when it is walled in', () => {
    expect(approachPath({ x: -1.5, z: 0.2 }, left, room, 0.3)).toEqual([{ x: left.x, z: left.z }]);
    const walled = [box(5, 3.4, 3, 0.2), box(5, 6.6, 3, 0.2), box(3.4, 5, 0.2, 3), box(6.6, 5, 0.2, 3)];
    expect(approachPath({ x: 0, z: 0 }, { x: 5, z: 5, yaw: 0 }, walled, 0.3)).toBeNull();
  });
});

describe('legacy content adapter', () => {
  const run: string[] = [];
  const hooks = { list: () => items, run: (it: Interactable) => run.push('run:' + it.id), runAction: (_it: Interactable, a: { id: string }) => run.push('act:' + a.id),
    canAfford: (c: number) => c <= 1000, visible: () => true, requires: () => null };
  const items: Interactable[] = [
    { id: 'shop', name: 'Jus & Go', kind: 'actions', x: 0, z: 0, radius: 3, actions: [{ id: 'bouye', label: 'Jus de bouye', seconds: 1, cost: 500, needs: { faim: 8 } }, { id: 'cher', label: 'Plateau', seconds: 1, cost: 5000 }] },
    { id: 'door', name: 'Ma chambre', kind: 'actions', x: 10, z: 0, radius: 3, actions: [{ id: 'entrer', label: 'Entrer', seconds: 0, special: 'enter' }] },
    { id: 'npc:ibou', name: 'Ibou', kind: 'actions', x: 20, z: 0, radius: 3, actions: [], npc: 'ibou' },
    { id: 'gare', name: 'Gare', kind: 'travel', x: 30, z: 0, radius: 3, actions: [] },
  ];
  const src = new LegacySource(hooks);
  const at = (x: number) => { const out: Target[] = []; src.collect('street', x, 0, out); return out[0]; };
  it('keeps the old main action as the primary verb', () => {
    expect(at(0).affordances()[0].id).toBe('open');                            // a place opens its sheet
    expect(at(10).affordances()[0]).toMatchObject({ verb: 'enter', label: 'Entrer' });
    expect(at(20).affordances()[0]).toMatchObject({ verb: 'talk', label: 'Parler' });
    expect(at(20).kind).toBe('person');
    expect(at(30).affordances()[0]).toMatchObject({ verb: 'travel' });
  });
  it('offers each action on its own, greyed out when unaffordable', () => {
    const list = at(0).affordances();
    expect(list.find(a => a.id === 'bouye')).toMatchObject({ verb: 'eat', disabled: null });
    expect(list.find(a => a.id === 'cher')?.disabled).toBe('Pas assez d’argent');
    list.find(a => a.id === 'bouye')!.run(); list[0].run();
    expect(run).toEqual(['act:bouye', 'run:shop']);
  });
  it('maps specials to verbs', () => {
    expect(actionVerb({ id: 'x', label: 'x', seconds: 0, special: 'exit' })[0]).toBe('exit');
    expect(actionVerb({ id: 'x', label: 'x', seconds: 1, gain: 1200 })[0]).toBe('work');
  });
});

describe('people in the street', async () => {
  const { People, nameFor } = await import('../src/interact/people');
  const { ActivityRunner } = await import('../src/activity/runner');
  const { GameState } = await import('../src/core/state');
  const { newSave } = await import('../src/core/save');
  const { Seats } = await import('../src/interact/seats');
  const said: string[] = [];
  const state = new GameState(newSave());
  const runner = new ActivityRunner({ state, seats: new Seats(), space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null, sit: () => false,
    clip: () => {}, busy: () => {}, progress: () => {}, toast: () => {}, save: () => {} });
  const obj = { position: { x: 1, z: 1 }, rotation: { y: 0 }, visible: true } as unknown as import('three').Object3D;
  const people = new People(() => [{ id: 'placed:3', obj, h: null, female: true }], runner, l => said.push(l), () => ({ x: 0, z: 0 }));
  it('anyone nearby can be greeted, then asked their name (stable during the visit)', () => {
    const out: Target[] = []; people.collect('street', 0, 0, out);
    expect(out[0]).toMatchObject({ kind: 'person', name: 'Passante' });
    const [hello, ask] = out[0].affordances();
    expect(hello.label).toBe('Saluer');
    ask.run();
    expect(said.at(-1)).toContain(nameFor('placed:3', true));
    const again: Target[] = []; people.collect('street', 0, 0, again);
    expect(again[0].name).toBe(nameFor('placed:3', true));
    people.collect('home', 0, 0, again); expect(again).toHaveLength(1);         // only in the street
  });
});
