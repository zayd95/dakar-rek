import { type SiteBuilder } from './contract';
import { balcony, door, glazing, louvres, slabEdge, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, bloomWall, boundary, ctx, deckFlat, garageDoor, hedge, lantern, lawn, lightGuard, lv, palmAt, palmSmall, pave, plaque, poolGarden, pot, rail, slats, stones, wallDress, win, edgeLight } from './villas.kit';

/**
 * Villa 4, « La Tour »: a stair tower in vertical oak slats rising a storey above the house, stacked and staggered balconies on the street face, the
 * ground floor in travertine, a rooftop lounge under a pergola, the pool and its loungers behind.
 */
export const tower: SiteBuilder = o => {
  const k = ctx(o), { d, n, lite } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n), Tt = lv(n + 1) + 0.25, gd = lightGuard(k);
  boundary(k, { h: 2.2, bloom: [-8.2 + k.j(1), 1.6 + k.j(1.2)] });
  wallDress(k, { plinth: true, panels: [{ x0: -10.3, x1: -5.9, col: p.stone }, { x0: -1.8, x1: 4.3, col: p.wood, joints: 5 }] });
  const H = R(-5.6, 8.4, -5.4, 3.0), T = R(-9.6, -5.6, -0.4, 3.8);
  // ---- the house: a travertine ground floor, the upper floors in the render, a thin roof; the tower beside it
  volume(d, H, GROUND, F1 - T_SLAB, p.stone);
  for (let s = 1; s <= n; s++) {
    slabEdge(d, H, lv(s), T_SLAB, s === n ? 0.5 : 0.28);
    if (s < n) volume(d, H, lv(s), lv(s + 1) - T_SLAB, s === 1 ? p.render : p.render2);
  }
  // the tower: a dark core with oak slats on its street and outer faces, white corner posts and head
  const core = R(T.x0 + 0.2, T.x1, T.z0, T.z1 - 0.2);
  volume(d, core, GROUND, Tt - 0.3, p.stoneDark);
  for (const x of [T.x0 + 0.1, T.x1 - 0.1]) volume(d, R(x - 0.15, x + 0.15, T.z1 - 0.35, T.z1 - 0.05), GROUND, Tt, p.slab);
  slabEdge(d, T, Tt, 0.3, 0.1);
  louvres(d, { face: 'street', at: T.z1 - 0.2, u0: T.x0 + 0.4, u1: T.x1 - 0.4, y0: GROUND + 0.35, y1: Tt - 0.5, pitch: 0.34, depth: 0.14 });
  louvres(d, { face: 'left', at: T.x0 + 0.2, u0: T.z0 + 0.3, u1: T.z1 - 0.5, y0: GROUND + 0.35, y1: Tt - 0.5, pitch: 0.7, depth: 0.14 });
  // ---- the street face: the door in its portal beside the tower, the garage door, glazing, stacked and staggered balconies
  door(d, { face: 'street', x: -3.9, z: H.z1, portal: true });
  glazing(d, { face: 'street', at: H.z1, u0: -2.2, u1: 3.0, y0: GROUND + 0.4, y1: F1 - 0.75, mullions: 2 });
  garageDoor(k, 6.9, H.z1, 2.8, 2.3);
  glazing(d, { face: 'street', at: H.z1, u0: -4.9, u1: 2.0, y0: F1 + 0.1, y1: F2 - 0.7, mullions: 2 });
  balcony(gd, { face: 'street', at: H.z1, u0: -5.0, u1: 2.2, y: F1, depth: 2.0 });
  if (n === 3) {
    glazing(d, { face: 'street', at: H.z1, u0: 0.8, u1: 7.8, y0: F2 + 0.1, y1: Ft - 0.7, mullions: 3 });
    balcony(gd, { face: 'street', at: H.z1, u0: 0.6, u1: 8.2, y: F2, depth: 2.0 });
    win(k, { face: 'street', at: H.z1, u0: 4.0, u1: 7.8, y0: F1 + 0.5, y1: F2 - 1.0 });
  } else {
    glazing(d, { face: 'street', at: H.z1, u0: 4.0, u1: 7.8, y0: F1 + 0.1, y1: F2 - 0.7, mullions: 0 });
    balcony(gd, { face: 'street', at: H.z1, u0: 3.8, u1: 8.2, y: F1, depth: 1.3 });
  }
  edgeLight(k, -5.0, 2.2, H.z1 + 2.0, F1);
  // ---- the back and sides
  glazing(d, { face: 'back', at: H.z0, u0: -4.4, u1: 7.6, y0: GROUND + 0.1, y1: F1 - 0.75, mullions: 3 });
  for (let s = 1; s <= n - 1; s++) glazing(d, { face: 'back', at: H.z0, u0: -4.4, u1: 3.4, y0: lv(s) + 0.1, y1: lv(s + 1) - 0.7, mullions: 2 });
  balcony(gd, { face: 'back', at: H.z0, u0: -4.6, u1: 3.6, y: F1, depth: 1.6 });
  win(k, { face: 'right', at: H.x1, u0: -3.4, u1: 0.8, y0: F1 + 0.5, y1: F2 - 1.0 });
  // ---- the rooftop lounge: the deck, the guard round it, the pergola, the sofas; the stair head's door in the tower
  deckFlat(k, R(H.x0, H.x1, H.z0, H.z1), Ft, p.wood);
  const g0 = Ft;
  rail(k, H.x0 + 0.1, H.z1 + 0.3, H.x1 + 0.4, H.z1 + 0.3, g0); rail(k, H.x1 + 0.4, H.z0 - 0.3, H.x1 + 0.4, H.z1 + 0.3, g0); rail(k, H.x0 + 0.1, H.z0 - 0.3, H.x1 + 0.4, H.z0 - 0.3, g0);
  slats(k, R(0.4, 6.0, -2.2, 1.8), Ft, { h: 2.45, pitch: 0.8 });
  if (!lite) { for (const [x, z, w, dd] of [[1.6, -1.6, 2.6, 0.8], [5.0, -0.2, 0.8, 2.2]] as const) { d.box(d.plain, w, 0.4, dd, x, Ft, z, p.accent); d.box(d.plain, w, 0.4, 0.2, x, Ft + 0.4, z - dd / 2 + 0.1, p.accent); } }
  // ---- the forecourt: the wall's portal and number, the path, lawn, a hedge, lanterns
  door(d, { face: 'street', x: -3.9, z: 10.7, portal: true, steps: false });
  plaque(k, o.site.number, k.g0 - 0.3, 1.5, 11.14);
  pave(k, R(-4.6, -3.2, 4.2, 10.4), d.c.stone);
  pave(k, R(-5.6, 3.4, 3.4, 5.2), d.c.fore);
  pave(k, R(3.4, 9.8, 3.4, 10.4), d.c.drive);
  lawn(k, R(-10.4, -5.0, 3.0, 10.4)); lawn(k, R(-2.8, 3.2, 5.4, 10.4));
  stones(k, k.g0 - 1.6, 6.6, -3.3, 8.2, 3);
  lantern(k, -2.6, 5.4);
  if (n === 2) pot(k, -7.6, 5.6, 1.3, 0.7, 0.6, true);
  if (!lite) hedge(k, -10.3, 9.3, -5.2, 9.3, 0.7);
  palmAt(k, -8.6 + k.j(0.5), 8.0 + k.j(0.6), 1.05 + k.j(0.08), 0.2 + k.j(0.9));
  // ---- the back: the pool, loungers, a palm
  pave(k, R(-10.4, 10.4, -10.4, -5.6), d.c.deck);
  poolGarden(k, { deck: R(-10.4, 10.4, -10.4, -6.6), pool: R(-5.0, 4.6, -9.6, -7.5), loungers: [[5.9, -9.0], [7.1, -9.0]] });
  palmSmall(k, -8.8 + k.j(0.5), -9.2 + k.j(0.4), 1.1 + k.j(0.1), 0.8 + k.j(0.9));
  bloomWall(k, 'left', -2.0, 2.2); if (n === 2) bloomWall(k, 'back', 2.0, 2.2);
  // ---- solid
  solidBox(d, H, Ft + 0.35); solidBox(d, R(T.x0, T.x1, T.z0, T.z1), Tt);
};
