import { type SiteBuilder } from './contract';
import { balcony, door, glazing, louvres, slabEdge, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, bloomWall, boundary, ctx, deckFlat, hedge, lantern, lawn, lightGuard, lv, mark, palmAt, palmSmall, pave, plaque, poolGarden, post, pot, rail, shrub, slats, stones, tones, wallDress, win } from './villas.kit';

/**
 * Villa 1, « Porte-à-faux »: a long white upper volume cantilevered 5.6 m past a travertine ground floor over the carport, a deep glass-guarded street
 * balcony, an oak screen on the cantilever's end, a teak door in a portal on the wall, a roof terrace under a pergola; the pool along the back.
 * Two storeys: the roof terrace on the long volume; three: a shorter third volume set back, the terrace in front of it.
 */
export const cantilever: SiteBuilder = o => {
  const k = ctx(o), { d, n, lite } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n), gd = lightGuard(k), tn = tones(k);
  boundary(k, { h: 2.2, bloom: [-8.8, -0.4] }); mark(k, 'boundary');
  wallDress(k, { plinth: true, panels: [{ x0: -10.3, x1: -6.4, col: p.stone }, { x0: -2.4, x1: 4.2, col: p.wood, joints: 6 }] }); mark(k, 'wall');
  const G = R(-8.2, 2.8, -4.2, 4.2), U = R(-5.6, 8.4, -4.2, 6.2);
  // ---- the masses: a travertine ground floor, the white long volume floating over it and over the carport
  volume(d, G, GROUND, F1 - T_SLAB, p.stone);
  slabEdge(d, U, F1, T_SLAB, 0.22);
  volume(d, U, F1, F2 - T_SLAB, p.render);
  slabEdge(d, U, F2, T_SLAB, n === 2 ? 0.55 : 0.4);
  const T = n === 3 ? R(-5.6, 2.6, -4.2, 3.0) : U;                                               // the top volume
  if (n === 3) { volume(d, T, F2, Ft - T_SLAB, p.render2); slabEdge(d, T, Ft, T_SLAB, 0.55); }
  post(k, 8.0, 5.8, F1 - T_SLAB); post(k, 8.0, -3.8, F1 - T_SLAB);                               // the cantilever's two posts
  d.box(d.bulbs, 13.6, 0.04, 0.05, 1.4, F1 - T_SLAB - 0.03, U.z1 + 0.14, d.c.bulb);              // a line of light under the slab's front edge
  mark(k, 'masses');
  // ---- the carport under the cantilever: paving, a stone back wall
  pave(k, R(2.8, 9.8, -4.2, 10.4), tn.drive, 1);
  volume(d, R(2.8, 8.4, -4.2, -3.9), GROUND, F1 - T_SLAB - 0.3, p.stoneDark);
  mark(k, 'carport');
  // ---- the street face: the door in its portal, windows, the long volume's glazing, the deep balcony, the cantilever's picture window
  door(d, { face: 'street', x: -4.4, z: G.z1, portal: true });
  glazing(d, { face: 'street', at: G.z1, u0: -2.4, u1: 2.2, y0: GROUND + 0.4, y1: F1 - 0.75 });
  glazing(d, { face: 'street', at: U.z1, u0: -5.0, u1: 1.3, y0: F1 + 0.15, y1: F2 - 0.6 });
  balcony(gd, { face: 'street', at: U.z1, u0: -5.2, u1: 1.5, y: F1, depth: 1.7 });
  glazing(d, { face: 'street', at: U.z1, u0: 3.2, u1: 7.6, y0: F1 + 0.85, y1: F2 - 0.6, mullions: 1 });
  louvres(d, { face: 'street', at: U.z1, u0: 1.7, u1: 2.7, y0: F1 + 0.15, y1: F2 - 0.6, pitch: 0.25, depth: 0.12 });
  mark(k, 'street face');
  // ---- the back: the ground floor opens on the deck, the long volume on a balcony over it
  glazing(d, { face: 'back', at: G.z0, u0: -7.4, u1: 2.2, y0: GROUND + 0.1, y1: F1 - 0.7, mullions: 3 });
  glazing(d, { face: 'back', at: U.z0, u0: -4.8, u1: 2.2, y0: F1 + 0.15, y1: F2 - 0.6, mullions: 2 });
  balcony(gd, { face: 'back', at: U.z0, u0: -5.0, u1: 2.4, y: F1, depth: 1.5 });
  mark(k, 'back');
  // ---- the sides: windows, the oak claustra on the cantilever's end
  win(k, { face: 'left', at: G.x0, u0: -2.4, u1: 2.4, y0: GROUND + 0.5, y1: F1 - 0.8, sill: true });
  win(k, { face: 'left', at: U.x0, u0: -2.6, u1: 2.6, y0: F1 + 0.5, y1: F2 - 0.9 });
  louvres(d, { face: 'right', at: U.x1, u0: -3.2, u1: 5.0, y0: F1 + 0.35, y1: F2 - 0.55, pitch: 0.66, depth: 0.14 });
  mark(k, 'sides');
  // ---- the left terrace on the ground floor's roof; the roof terrace with its guard, its pergola and its stair head; the plant
  rail(k, G.x0 + 0.1, G.z1 - 0.1, U.x0, G.z1 - 0.1, F1, 1.05); rail(k, G.x0 + 0.1, G.z0 + 0.1, G.x0 + 0.1, G.z1 - 0.1, F1);
  deckFlat(k, R(G.x0, U.x0, G.z0, G.z1), F1, p.wood);
  const front = U.z1 + 0.1;
  if (n === 2) {
    deckFlat(k, R(2.4, 8.2, -1.0, 6.0), F2, p.wood);
    rail(k, U.x0 - 0.1, front, U.x1 + 0.2, front, F2); rail(k, U.x1 + 0.2, U.z0 - 0.1, U.x1 + 0.2, front, F2);
    rail(k, U.x0 - 0.1, U.z0 - 0.1, U.x1 + 0.2, U.z0 - 0.1, F2); rail(k, U.x0 - 0.1, U.z0 - 0.1, U.x0 - 0.1, front, F2);
    volume(d, R(-5.2, -2.2, -3.9, -1.0), F2, F2 + 2.55, p.render2); slabEdge(d, R(-5.2, -2.2, -3.9, -1.0), F2 + 2.55, 0.2, 0.35);
    slats(k, R(3.0, 7.6, 0.6, 4.6), F2, { h: 2.45, pitch: 0.7 });
    bloomWall(k, 'left', 1.5, 2.2);
  } else {
    deckFlat(k, R(3.0, 8.2, 2.8, 6.0), F2, p.wood);
    rail(k, U.x0 - 0.1, front, U.x1 + 0.2, front, F2); rail(k, U.x1 + 0.2, T.z1, U.x1 + 0.2, front, F2); rail(k, U.x0 - 0.1, T.z1, U.x0 - 0.1, front, F2);
    slats(k, R(3.4, 7.8, 3.6, 5.8), F2, { h: 2.45, pitch: 0.7 });
    glazing(d, { face: 'street', at: T.z1, u0: -4.6, u1: 1.6, y0: F2 + 0.15, y1: Ft - 0.6 });
    win(k, { face: 'right', at: T.x1, u0: -2.6, u1: 1.6, y0: F2 + 0.5, y1: Ft - 0.9 });
  }
  mark(k, 'roof');
  // ---- the forecourt: the wall's portal and number, the path to the door, lawn, a planted bed, lanterns
  door(d, { face: 'street', x: -4.4, z: 10.7, portal: true, steps: false });
  plaque(k, o.site.number, k.g0 - 0.3, 1.5, 11.14);
  pave(k, R(-5.2, 9.8, 4.5, 6.4), tn.fore, 2);
  pave(k, R(-5.2, -3.6, 6.4, 10.4), tn.path, 2);
  lawn(k, R(-10.4, -5.4, 4.6, 10.4));
  lawn(k, R(-3.4, k.g0 - 0.3, 6.6, 10.4));
  stones(k, k.g0 - 1.2, 6.8, -2.6, 8.4, 3);
  lantern(k, -3.0, 5.2); lantern(k, -5.8, 5.2);
  pot(k, -7.6, 5.4, 1.4, 0.7, 0.6, true);
  if (!lite) { hedge(k, -10.2, 9.3, -6.0, 9.3, 0.7); shrub(k, -3.4, 9.2, 0.55); }
  palmAt(k, -8.6, 7.4, 1.05, 0.4);
  mark(k, 'forecourt');
  // ---- the back: the pool along the deck, loungers and a parasol on the carport's side
  pave(k, R(-10.4, 10.4, -10.4, -4.4), tn.deck);
  poolGarden(k, { deck: R(-10.4, 10.4, -10.4, -5.5), pool: R(-7.2, 1.6, -9.0, -6.6), loungers: [[4.6, -8.2], [5.9, -8.2]], parasol: [8.4, -8.6] });
  palmSmall(k, 9.2, -9.8, 0.95, 0.3);
  mark(k, 'back garden');
  // ---- solid: the ground floor and the upper volumes (the cantilever over the carport clears a body's head); the carport's back wall
  solidBox(d, R(G.x0, U.x0, G.z0, G.z1), F1);
  solidBox(d, R(U.x0, G.x1, G.z0, G.z1), Ft + 0.35);
  solidBox(d, R(G.x1, U.x1, U.z0, U.z1), F2 + 0.35).y0 = F1 - 0.4;
  solidBox(d, R(U.x0, G.x1, G.z1, U.z1), F2 + 0.35).y0 = F1 - 0.4;
  solidBox(d, R(2.8, 8.4, -4.2, -3.9), F1);
};
