import { type SiteBuilder } from './contract';
import { balcony, door, glazing, slabEdge, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, boundary, ctx, eave, footGate, hedge, lantern, lawn, lightGuard, lv, pave, plaque, pot, post, rail, roofKit, shrub, slats, tones, tree, wallDress, win, edgeLight } from './villas.kit';

/**
 * House 1, « Maison empilée »: two boxes stacked and offset (the white upper one slides forward over the entry and out over the carport), a big street
 * balcony in glass, an oak-slatted carport slab beside them, a terrace on the ground floor's roof, a small garden behind a low wall.
 */
export const stacked: SiteBuilder = o => {
  const k = ctx(o, { gateW: 3.4 }), { d, n, lite } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n), gd = lightGuard(k), tn = tones(k);
  boundary(k, { h: 1.9, front: 'low' });
  wallDress(k, { plinth: 0.3, panels: [{ x0: -2.6, x1: 3.6, y0: 0.2, y1: 0.85, col: p.wood, joints: 4 }] }, 1.0);
  const G = R(-9.4, -0.2, -4.4, 3.8), U = R(-7.2, 2.6, -4.4, 6.0);
  volume(d, G, GROUND, F1 - T_SLAB, p.render2);
  volume(d, R(-6.4, -2.6, G.z1, G.z1 + 0.07), GROUND, F1 - T_SLAB - 0.2, p.stone);                  // the entry's travertine wall
  slabEdge(d, G, F1, T_SLAB, 0.18, p.slab);
  volume(d, U, F1, F2 - T_SLAB, p.render);
  slabEdge(d, U, F1, T_SLAB, 0.2);
  const T = n === 3 ? R(-7.2, -0.6, -4.4, 2.2) : U;
  slabEdge(d, U, F2, T_SLAB, n === 2 ? 0.5 : 0.35);
  if (n === 3) { volume(d, T, F2, Ft - T_SLAB, p.render2); slabEdge(d, T, Ft, T_SLAB, 0.5); }
  // the carport: an oak-slatted slab on the long box's side and two posts
  const C = R(2.6, 9.7, -1.4, 6.4), cy = F1 - 0.45;
  eave(k, C, cy, 0.2, { l: 0, r: 0, f: 0, b: 0 }, p.slab);
  slats(k, C, cy, { h: 0, pitch: 0.62, posts: false, thick: 0.08, beam: 0.04 });
  post(k, 9.5, 6.2, cy - 0.2); post(k, 9.5, -1.2, cy - 0.2);
  pave(k, R(3.0, 9.8, -1.4, 10.4), tn.drive, 1);
  // the street face: the door, the long window, the big balcony
  door(d, { face: 'street', x: -4.6, z: G.z1 + 0.07, portal: false, steps: true, col: p.accent });
  win(k, { face: 'street', at: G.z1, u0: -2.2, u1: -0.7, y0: GROUND + 0.5, y1: F1 - 0.8 });
  glazing(d, { face: 'street', at: U.z1, u0: -6.7, u1: 2.0, y0: F1 + 0.12, y1: F2 - 0.7, mullions: 3 });
  balcony(gd, { face: 'street', at: U.z1, u0: -6.9, u1: 2.4, y: F1, depth: 1.9 });
  if (n === 3) { glazing(d, { face: 'street', at: T.z1, u0: -6.7, u1: -1.2, y0: F2 + 0.12, y1: Ft - 0.7, mullions: 1 }); win(k, { face: 'back', at: T.z0, u0: -6.2, u1: -1.6, y0: F2 + 0.5, y1: Ft - 0.9 }); }
  // the back and the sides
  win(k, { face: 'back', at: G.z0, u0: -8.4, u1: -1.6, y0: GROUND + 0.4, y1: F1 - 0.8, sill: true });
  win(k, { face: 'back', at: U.z0, u0: -6.2, u1: 1.4, y0: F1 + 0.5, y1: F2 - 0.9 });
  win(k, { face: 'right', at: U.x1, u0: 0.4, u1: 3.4, y0: F1 + 0.5, y1: F2 - 0.9 });
  win(k, { face: 'left', at: G.x0, u0: -2.4, u1: 1.0, y0: GROUND + 0.5, y1: F1 - 0.9 });
  edgeLight(k, -6.9, 2.4, U.z1 + 1.9, F1);
  // the terrace on the ground floor's left roof: its glass guard and a planter; the roof's plant
  rail(k, G.x0 + 0.1, G.z0, G.x0 + 0.1, G.z1, F1); rail(k, G.x0 + 0.1, G.z1 - 0.1, U.x0, G.z1 - 0.1, F1);
  roofKit(k, 0.4, -2.4, Ft + 0.02);
  // the garden: the foot gate and its path, lawn and a hedge, a small tree, a lantern, a planter
  footGate(k, -4.6);
  plaque(k, o.site.number, k.g0 - 0.3, 1.1, 11.14, { w: 0.4, h: 0.22 });
  pave(k, R(-5.2, -4.0, 4.0, 10.4), tn.path, 2);
  lawn(k, R(-10.4, -5.4, 4.2, 10.4)); lawn(k, R(-3.6, 2.6, 6.6, 10.4));
  if (!lite) hedge(k, -10.3, 9.8, -5.8, 9.8, 0.65);
  tree(k, -8.4 + k.j(0.5), 8.0 + k.j(0.5), 0.95 + k.j(0.1));
  lantern(k, -3.0, 5.0); pot(k, 0.4, 5.0, 1.1, 0.6, 0.55, true);
  shrub(k, 1.6, 8.6, 0.6);
  pave(k, R(-10.4, 10.4, -10.4, -4.6), tn.deck);
  lawn(k, R(-10.0, -1.0, -10.0, -6.0));
  solidBox(d, R(G.x0, U.x0, G.z0, G.z1), F1 + 0.2);
  solidBox(d, R(U.x0, G.x1, G.z0, G.z1), Ft + 0.35);
  const ov = solidBox(d, R(G.x1, U.x1, U.z0, U.z1), F2 + 0.35); ov.y0 = F1 - 0.5;
  const ov2 = solidBox(d, R(U.x0, G.x1, G.z1, U.z1), F2 + 0.35); ov2.y0 = F1 - 0.5;
};
