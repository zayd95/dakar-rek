import { type SiteBuilder } from './contract';
import { balcony, door, glazing, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, bloomWall, boundary, ctx, deckFlat, eave, garageDoor, lantern, lawn, lightGuard, lv, palmAt, palmSmall, pave, plaque, poolGarden, post, pot, rail, shrub, slats, stones, tones, wallDress, win, edgeLight } from './villas.kit';

/**
 * Villa 3, « Pavillons »: two pavilions under deep thin flat roofs, the tall living pavilion and the low suite-and-garage pavilion, joined by a glazed link
 * that holds the front door; a long water mirror before them, a long pool and a tropical pergola behind.
 */
export const pavilion: SiteBuilder = o => {
  const k = ctx(o), { d, n } = k, p = d.p, F1 = lv(1), F2 = lv(2), gd = lightGuard(k), nb = n - 1;     // B has one storey fewer than A
  boundary(k, { h: 2.2, bloom: [-6.6 + k.j(1.2), 3.4 + k.j(0.8)] });
  wallDress(k, { plinth: 0.4, panels: [{ x0: -10.3, x1: -3.2, col: p.wood, joints: 7 }, { x0: 1.4, x1: 4.6, col: p.stone }] });
  const A = R(-10.0, -2.8, -6.4, 4.2), L = R(-2.8, 0.4, -1.5, 3.0), B = R(0.4, 9.4, -5.0, 2.0), fa = lv(n), fb = lv(nb), lt = F1 - 0.4;
  // ---- the pavilions: A in the render with a stone end wall, B with a timber face, the link a glass box; each under a deep thin roof
  volume(d, A, GROUND, fa - T_SLAB, p.render);
  volume(d, R(A.x0 - 0.04, A.x0 + 0.5, A.z0 + 2.0, A.z1 - 2.0), GROUND, fa - T_SLAB - 0.8, p.stone);
  for (let s = 1; s < n; s++) eave(k, A, lv(s), T_SLAB, { l: 0.3, r: 0.6, f: 0.7, b: 0.6 });
  eave(k, A, fa, T_SLAB, { l: 0.4, r: 1.0, f: 1.3, b: 1.0 });
  volume(d, B, GROUND, fb - T_SLAB, p.render2);
  volume(d, R(B.x0 + 0.5, B.x0 + 3.9, B.z1 - 0.01, B.z1 + 0.06), GROUND, fb - T_SLAB - 0.4, p.wood);
  eave(k, B, fb, T_SLAB, { l: 0.3, r: 0.7, f: 1.5, b: 0.8 });
  if (n === 3) eave(k, B, F1, T_SLAB, { l: 0.3, r: 0.4, f: 0.6, b: 0.5 });
  volume(d, L, GROUND, lt - T_SLAB, p.render2);
  eave(k, L, lt, 0.24, { l: 0.0, r: 0.0, f: 1.4, b: 0.6 });
  edgeLight(k, A.x0 + 0.2, A.x1 + 0.4, A.z1 + 0.7, F1); edgeLight(k, B.x0 + 0.2, B.x1 + 0.2, B.z1 + 1.5, fb);
  // ---- A: the street face (big glazing on both levels, a balcony), the link's door and glass, B's garage door and suite window
  glazing(d, { face: 'street', at: A.z1, u0: -9.3, u1: -3.6, y0: GROUND + 0.1, y1: F1 - 0.75, mullions: 2 });
  for (let s = 1; s < n; s++) {
    glazing(d, { face: 'street', at: A.z1, u0: -9.3, u1: -3.6, y0: lv(s) + 0.1, y1: lv(s + 1) - 0.75, mullions: 2 });
    balcony(gd, { face: 'street', at: A.z1, u0: -9.5, u1: -3.4, y: lv(s), depth: 1.5 });
  }
  door(d, { face: 'street', x: -1.2, z: L.z1, portal: false, steps: true, w: 1.3, h: 2.5 });
  win(k, { face: 'street', at: L.z1, u0: -2.6, u1: -1.95, y0: GROUND + 0.2, y1: lt - 0.7 });
  garageDoor(k, 6.6, B.z1, 2.8, 2.3);
  win(k, { face: 'street', at: B.z1, u0: 4.3, u1: 5.1, y0: GROUND + 0.5, y1: fb - 1.0 });
  for (let s = 1; s < nb; s++) win(k, { face: 'street', at: B.z1, u0: 1.2, u1: 8.4, y0: lv(s) + 0.4, y1: lv(s + 1) - 0.8, sill: true });
  // ---- the back: A and B open on the terrace, the link glazed through
  glazing(d, { face: 'back', at: A.z0, u0: -9.3, u1: -3.4, y0: GROUND + 0.1, y1: F1 - 0.75, mullions: 2 });
  win(k, { face: 'back', at: A.z0, u0: -9.0, u1: -4.2, y0: F1 + 0.4, y1: F2 - 0.8 });
  if (n === 3) win(k, { face: 'back', at: A.z0, u0: -9.0, u1: -4.2, y0: F2 + 0.4, y1: fa - 0.8 });
  glazing(d, { face: 'back', at: B.z0, u0: 1.2, u1: 8.4, y0: GROUND + 0.1, y1: fb - 0.75, mullions: 2 });
  win(k, { face: 'right', at: A.x1, u0: -4.6, u1: 2.8, y0: GROUND + 0.1, y1: F1 - 0.75 });
  win(k, { face: 'right', at: B.x1, u0: -3.4, u1: 0.4, y0: GROUND + 0.5, y1: fb - 1.0 });
  for (let s = 1; s < n; s++) win(k, { face: 'left', at: A.x0, u0: -3.0, u1: 1.6, y0: lv(s) + 0.5, y1: lv(s + 1) - 0.9 });
  // ---- B's roof terrace under its timber pergola (n = 2), A's roof
  const bt = n === 2 ? B : R(B.x0, B.x1, B.z0, B.z1);
  rail(k, bt.x0 - 0.2, bt.z1 + 0.5, bt.x1 + 0.6, bt.z1 + 0.5, fb); rail(k, bt.x1 + 0.6, bt.z0 - 0.7, bt.x1 + 0.6, bt.z1 + 0.5, fb);
  deckFlat(k, R(B.x0, B.x1, B.z0, B.z1), fb, p.wood);
  slats(k, R(2.6, 7.6, -3.4, 0.2), fb, { h: 2.5, pitch: 0.8 });
  // ---- the forecourt: the wall's portal and the number, the water mirror with its stepping slabs, lawn, lanterns
  door(d, { face: 'street', x: -1.2, z: 10.7, portal: true, steps: false });
  plaque(k, o.site.number, k.g0 - 0.3, 1.5, 11.14);
  const wm = R(-9.4, 0.4, 5.7, 7.1);
  d.box(d.plain, wm.x1 - wm.x0 + 0.5, 0.18, 0.25, (wm.x0 + wm.x1) / 2, GROUND, wm.z1 + 0.125, d.c.rim); d.box(d.plain, wm.x1 - wm.x0 + 0.5, 0.18, 0.25, (wm.x0 + wm.x1) / 2, GROUND, wm.z0 - 0.125, d.c.rim);
  d.box(d.plain, 0.25, 0.18, wm.z1 - wm.z0, wm.x0 - 0.125, GROUND, (wm.z0 + wm.z1) / 2, d.c.rim); d.box(d.plain, 0.25, 0.18, wm.z1 - wm.z0, wm.x1 + 0.125, GROUND, (wm.z0 + wm.z1) / 2, d.c.rim);
  d.flat(d.water, wm.x1 - wm.x0, wm.z1 - wm.z0, (wm.x0 + wm.x1) / 2, GROUND + 0.1, (wm.z0 + wm.z1) / 2, d.c.water);
  pave(k, R(-1.9, -0.5, 3.0, 10.4), d.c.stone); d.box(d.plain, 1.5, 0.22, wm.z1 - wm.z0 + 0.5, -1.2, GROUND, (wm.z0 + wm.z1) / 2, d.p.stone);
  pave(k, R(2.8, 9.8, 2.4, 10.4), d.c.drive);
  lawn(k, R(-10.4, -2.4, 7.6, 10.4)); lawn(k, R(-10.4, -2.8, 4.6, 5.4)); lawn(k, R(0.0, 2.6, 3.0, 5.4));
  stones(k, -1.2, 8.0, -1.2, 10.0, 2, p.stone);
  if (n === 2) lantern(k, 1.0, 4.4);
  if (n === 2) pot(k, -9.0, 8.2, 1.2, 0.7, 0.6, true);
  palmAt(k, -8.8 + k.j(0.5), 9.0 + k.j(0.5), 1.0 + k.j(0.08), 0.5 + k.j(0.9));
  // ---- the back: the long pool, the pergola and loungers on the terrace, palms
  pave(k, R(-10.4, 10.4, -10.4, -5.6), tones(k).deck);
  const raise = 0.45, yd = GROUND + raise;
  poolGarden(k, { deck: R(-10.4, 10.4, -10.4, -7.3), pool: R(-9.2, 2.6, -9.9, -8.0), loungers: [[4.8, -9.0], [6.4, -9.0]], raise });
  slats(k, R(3.4, 8.8, -10.1, -6.0), yd, { h: 2.6, pitch: 0.8 });
  palmSmall(k, -9.6 + k.j(0.4), -10.1, 1.1 + k.j(0.1), 0.9 + k.j(0.9)); palmSmall(k, 3.0 + k.j(0.6), -10.1, 0.95 + k.j(0.1), 0.2 + k.j(0.9));
  bloomWall(k, 'left', 0.5, 2.2); if (n === 2) bloomWall(k, 'back', 5.0, 2.2);
  // ---- solid
  solidBox(d, A, fa + 0.35); solidBox(d, B, fb + 0.35); solidBox(d, L, lt);
  void post; void shrub;
};
