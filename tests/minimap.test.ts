import { describe, expect, it } from 'vitest';
import {
  WALK_SPEED, approach, dedupePlaces, distText, nearPhrase, nearestPlace, nightness, northAngle, onRing, placeKind, project, rotate, routePath, shortName,
  snapToRoad, unproject, walkTime, whereLabel, zoomRadius, type Edge,
} from '../src/ui/minimapMath';

const near = (a: number, b: number, e = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(e);

describe('minimap projection', () => {
  it('puts what is ahead of the camera above the centre, whatever the heading', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, 2.5, -1.2, Math.PI]) {
      const ahead = project(10 * Math.sin(yaw), 10 * Math.cos(yaw), 0, 0, yaw, 2, 60, 60);
      near(ahead.x, 60); near(ahead.y, 60 - 20);
    }
  });
  it('puts what is on the camera\'s right on the right of the map', () => {
    // camera looks +z (yaw 0): its right is -x (the game's movement code uses the same axes)
    const right = project(-10, 0, 0, 0, 0, 1, 50, 50);
    expect(right.x).toBeGreaterThan(50); near(right.y, 50);
    const turned = rotate(0, 10, Math.PI / 2);                // facing +x: +z is now to the right
    expect(turned.u).toBeGreaterThan(9);
  });
  it('unproject inverts project', () => {
    const p = project(33, -41, 5, 8, 1.1, 1.7, 60, 60), w = unproject(p.x, p.y, 5, 8, 1.1, 1.7, 60, 60);
    near(w.x, 33, 1e-6); near(w.z, -41, 1e-6);
  });
  it('the north marker moves round the ring with the heading', () => {
    near(Math.abs(northAngle(0)), Math.PI);                              // facing south: north is behind, at the bottom
    near(Math.abs(northAngle(Math.PI)), 0);                    // facing north: north is up
    near(northAngle(Math.PI / 2), -Math.PI / 2);               // facing east: north is on the left
    // and agrees with the projection of a point due north
    const n = project(0, -100, 0, 0, 1.3, 1, 0, 0);
    near(Math.atan2(n.x, -n.y), northAngle(1.3));
  });
  it('pulls an off-map target onto the ring, in its direction', () => {
    const r = onRing(300, 0, 50);
    expect(r.outside).toBe(true); near(r.x, 50); near(r.y, 0); near(r.angle, Math.PI / 2);
    expect(onRing(10, 10, 50).outside).toBe(false);
  });
});

describe('zoom by speed', () => {
  it('zooms in walking, out running and further out driving', () => {
    const walk = zoomRadius(1.4), run = zoomRadius(5), drive = zoomRadius(12);
    expect(walk).toBeLessThan(run); expect(run).toBeLessThan(drive);
    expect(zoomRadius(0)).toBeLessThanOrEqual(walk); expect(zoomRadius(80)).toBe(zoomRadius(14));
  });
  it('approaches its target and zooms out faster than in', () => {
    const out = approach(50, 120, 0.1) - 50, back = 120 - approach(120, 50, 0.1);
    expect(out).toBeGreaterThan(0); expect(back).toBeGreaterThan(0);
    near(approach(50, 80, 100), 80);
  });
});

describe('night tint', () => {
  it('is dark at night, clear by day, and eases at dusk and dawn', () => {
    expect(nightness(23)).toBe(1); expect(nightness(3)).toBe(1); expect(nightness(12)).toBe(0);
    expect(nightness(19)).toBeGreaterThan(0.3); expect(nightness(19)).toBeLessThan(0.7);
    expect(nightness(6.2)).toBeGreaterThan(0.2); expect(nightness(6.2)).toBeLessThan(0.8);
  });
});

describe('place kinds and names', () => {
  it('classifies the hubs\' real place ids', () => {
    const k = (id: string, name = '') => placeKind(id, name);
    expect(k('plateau:gargote:12', 'Gargote Chez Fatou')).toBe('food');
    expect(k('pikine:cafe:02', 'Café Touba · Parcelles')).toBe('food');
    expect(k('almadies:city:mall-juice', 'Jus & Go')).toBe('food');
    expect(k('plateau:station', 'Car rapide · changer de quartier')).toBe('transport');
    expect(k('almadies:port', 'Embarcadère de Ngor')).toBe('transport');
    expect(k('pikine:arena', 'Arène · làmb')).toBe('arena');
    expect(k('pikine:ecurie', 'Écurie Baobab')).toBe('arena');
    expect(k('plateau:venue:mosque:11:salle', 'Salle de prière')).toBe('mosque');
    expect(k('pikine:home:11', 'Ma chambre')).toBe('home');
    expect(k('almadies:city:villa', 'Villa avec piscine · Almadies')).toBe('home');
    expect(k('plateau:city:bank', 'Banque Teranga · Plateau')).toBe('work');
    expect(k('pikine:garage:31', 'Garage Modou')).toBe('work');
    expect(k('plateau:city:boutique', 'Atelier Ndeye · couture')).toBe('shop');
    expect(k('plateau:market', 'Étal de Sandaga')).toBe('shop');
    expect(k('plateau:city:square', 'Place de la Médina')).toBe('spot');
  });
  it('drops the duplicates of one place', () => {
    const l = [{ x: 0, z: 0, kind: 'home' as const }, { x: 3, z: 1, kind: 'home' as const }, { x: 3, z: 1, kind: 'food' as const }, { x: 40, z: 0, kind: 'home' as const }];
    expect(dedupePlaces(l)).toHaveLength(3);
  });
  it('finds the nearest place within range', () => {
    const l = [{ name: 'A', x: 0, z: 0 }, { name: 'B', x: 30, z: 0 }];
    expect(nearestPlace(l, 24, 0)?.place.name).toBe('B');
    expect(nearestPlace(l, 500, 0, 60)).toBeNull();
  });
  it('writes « près de … » with the right article', () => {
    expect(nearPhrase('Café Touba · Sandaga')).toBe('près du Café Touba');
    expect(nearPhrase('Étal de Sandaga')).toBe('près de l’Étal de Sandaga');
    expect(nearPhrase('Banque Teranga · Plateau')).toBe('près de la Banque Teranga');
    expect(nearPhrase('Car rapide · changer de quartier')).toBe('près de la gare des cars rapides');
    expect(nearPhrase('Ma chambre')).toBe('près de chez toi');
    expect(nearPhrase('Ndar Tech')).toBe('près de Ndar Tech');
    expect(nearPhrase('Almadies Club')).toBe('près d’Almadies Club');
    expect(shortName('Gargote Chez Fatou')).toBe('Gargote Chez Fatou');
  });
  it('labels where the player is: the hub, the quarter near, the place near', () => {
    const places = [{ name: 'Café Touba · Sandaga', x: 78, z: 6 }, { name: 'Étal de Sandaga', x: 28, z: -41 }];
    expect(whereLabel('Plateau · Médina', places, 70, 6)).toEqual({ district: 'Sandaga', street: 'Café Touba' });
    expect(whereLabel('Plateau · Médina', places, 28, -20)).toEqual({ district: 'Plateau', street: 'près de l’Étal de Sandaga' });
    expect(whereLabel('Plateau · Médina', places, -100, 100)).toEqual({ district: 'Plateau', street: 'Dans la rue' });
  });
});

// the 5 × 5 road grid of a hub (60 m pitch), as the builder lists it
const roadC = (k: number) => -120 + k * 60;
const grid: Edge[] = [];
for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
  if (a < 4) grid.push({ ax: roadC(a), az: roadC(b), bx: roadC(a + 1), bz: roadC(b) });
  if (b < 4) grid.push({ ax: roadC(a), az: roadC(b), bx: roadC(a), bz: roadC(b + 1) });
}
describe('road path', () => {
  it('snaps to the nearest road centre line', () => {
    const s = snapToRoad(grid, 10, 3)!;
    near(s.p.z, 0); near(s.p.x, 10);
  });
  it('walks along the roads (Manhattan on the grid), never through the blocks', () => {
    const a = { x: -30, z: 4 }, b = { x: 70, z: -58 };
    const r = routePath(grid, a, b);
    expect(r.points[0]).toEqual(a); expect(r.points[r.points.length - 1]).toEqual(b);
    const mid = r.points.slice(1, -1);                          // between the two short stubs onto the road: axis-aligned legs
    for (let i = 1; i < mid.length; i++) expect(mid[i].x === mid[i - 1].x || mid[i].z === mid[i - 1].z).toBe(true);
    expect(r.length).toBeGreaterThanOrEqual(Math.hypot(b.x - a.x, b.z - a.z));
    expect(r.length).toBeLessThan(100 + 62 + 40);               // |dx| + |dz| plus the stubs
  });
  it('is the straight line without roads, and the shortest way on the same road', () => {
    const s = routePath([], { x: 0, z: 0 }, { x: 30, z: 40 });
    near(s.length, 50); expect(s.points).toHaveLength(2);
    const same = routePath(grid, { x: -100, z: 1 }, { x: -20, z: -1 });
    near(same.length, 80, 3);
  });
});

describe('walking time', () => {
  it('uses Habib\'s 2 m/s', () => {
    expect(WALK_SPEED).toBe(2);
    expect(walkTime(100)).toBe('≈ 50 s'); expect(walkTime(240)).toBe('≈ 2 min'); expect(walkTime(10)).toBe('≈ 5 s');
    expect(distText(118)).toBe('120 m'); expect(distText(1500)).toBe('1,5 km');
  });
});
