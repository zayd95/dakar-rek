import { describe, expect, it } from 'vitest';
import { HOMES, homeByDoor, homeSpec } from '../src/economy/catalog';
import { homeOrigin, layoutOf } from '../src/economy/placement';
import { planFor } from '../src/housing/plan';
import { IDENTITIES } from '../src/housing/kit';
import { stubCanvas } from './hubstub';
import { VTC_POINTS } from '../src/transport/vtcRules';
import { PAPE_SPOT } from '../src/districts/mermozRules';

stubCanvas();
/** The first home of the home kit in Mermoz (docs/kits/HOMES.md): the F3 of the Résidence Les Filaos. */
const inside = (cols: readonly { x0: number; z0: number; x1: number; z1: number }[], x: number, z: number, r = 0.35) => cols.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

describe('Appartement F3 · Résidence Les Filaos (Mermoz)', () => {
  const sp = homeSpec('f3_filaos')!;
  it('is listed in Mermoz, as an apartment, after every other home (so no interior moves)', () => {
    expect(sp.hub).toBe('mermoz'); expect(sp.home.level).toBe('apartment'); expect(sp.home.door).toBe('mermoz:home:filaos');
    expect(HOMES.at(-1)!.id).toBe('f3_filaos'); expect(HOMES.indexOf(sp)).toBe(5);
    expect(homeOrigin('f3_filaos')).toEqual({ x: 1600 + 5 * 60, z: 0 });
    expect(homeByDoor('mermoz:home:filaos')?.id).toBe('f3_filaos');
    expect(sp.home.door).toMatch(/^([a-z]+):home:[a-z0-9_]{1,24}$/);                     // the shape the online visits accept
  });
  it('is priced between the apartment and the house, and rents above the apartment', () => {
    const f2 = homeSpec('appart_jamm')!, house = homeSpec('maison_cite')!;
    expect(sp.price!).toBeGreaterThan(f2.price!); expect(sp.price!).toBeLessThan(house.price!);
    expect(sp.rent!).toBeGreaterThan(f2.rent!); expect(sp.rent!).toBeLessThan(house.rent!);
    expect(sp.income).toBe(Math.round((sp.rent! / 24) * 0.85));                          // let out by its owner: the same share as every home
    expect(sp.upgrades!.length).toBeGreaterThan(0);
  });
  it('has its own plan in Mermoz’s colours: two bedrooms, a living room, a kitchen and a bathroom, every room reachable', () => {
    const p = planFor('f3_filaos')!; expect(p).toBeTruthy(); expect(p.id).toBe('f3_filaos');
    const kinds = p.rooms.map(r => r.kind);
    expect(kinds.filter(k => k === 'chambre').length).toBe(2); expect(kinds).toContain('sejour'); expect(kinds).toContain('cuisine'); expect(kinds).toContain('sdb');
    expect(p.look?.wall).toBe(IDENTITIES.mermoz.look.wall);
    expect(layoutOf(sp).plan).toBe(p);
  });
  it('has its door and its board on the pavement and inside the gate of the Résidence, clear of Pape, of the drop-off and of every wall', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('mermoz', true);
    const door = { x: 69.3, z: -32.6 }, board = { x: 66.2, z: -36.5 };
    const drop = VTC_POINTS.mermoz.find(p => p.id === 'filaos')!;
    for (const [what, p] of [['the door', door], ['the board spot', board]] as const) {
      expect(inside(hub.colliders, p.x, p.z), `${what} is not inside a wall`).toBe(false);
    }
    expect(Math.hypot(door.x - PAPE_SPOT.x, door.z - PAPE_SPOT.z)).toBeGreaterThan(4);
    expect(Math.hypot(door.x - drop.x, door.z - drop.z)).toBeGreaterThan(2);
    expect(Math.hypot(board.x - PAPE_SPOT.x, board.z - PAPE_SPOT.z)).toBeGreaterThan(5);
  });
});
