import { type SiteBuilder } from './contract';
import { balcony, door, glazing, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, boundary, ctx, eave, garageDoor, lantern, lawn, lightGuard, lv, pave, houseNumber, post, rail, slats, tones, tree, win, edgeLight, entry, walk } from './villas.kit';

/**
 * House 2, « Maison en L »: an L of two wings under deep thin flat roofs, a stone plinth and a travertine ground floor, a covered loggia in the L's corner
 * with a terrace and a timber pergola over it, a garage with a green roof, a small garden.
 */
export const ell: SiteBuilder = o => {
  const k = ctx(o, { gateW: 3.4 }), { d, n } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n), gd = lightGuard(k), tn = tones(k);
  const ent = entry(k, -6.4, 1.6);
  boundary(k, { h: 1.9, entries: ent });
  const A = R(-9.6, 3.0, 0.6, 5.6), B = R(-9.6, -3.6, -6.6, 0.6), Gar = R(3.0, 9.6, 0.6, 5.6), V = R(-3.6, 3.0, -6.2, 0.6);
  // ---- the wings on their plinth (the ground floor of the street wing in travertine), the garage, the two deep roofs, the loggia's terrace slab
  for (const r of [A, B]) volume(d, R(r.x0 - 0.06, r.x1 + 0.06, r.z0 - 0.06, r.z1 + 0.06), GROUND, GROUND + 0.5, p.stoneDark);
  volume(d, A, GROUND + 0.5, F1 - T_SLAB, p.stone); volume(d, R(A.x0, A.x1, A.z0, A.z1), F1, Ft - T_SLAB, p.render);
  volume(d, B, GROUND + 0.5, F1 - T_SLAB, p.render2); volume(d, B, F1, Ft - T_SLAB, p.render2);
  eave(k, A, F1, T_SLAB, { l: 0.12, r: 0.12, f: 0.12, b: 0.12 }); eave(k, B, F1, T_SLAB, { l: 0.12, r: 0.12, f: 0.12, b: 0.12 });
  if (n === 3) { eave(k, A, F2, T_SLAB, { l: 0.12, r: 0.12, f: 0.12, b: 0.12 }); eave(k, B, F2, T_SLAB, { l: 0.12, r: 0.12, f: 0.12, b: 0.12 }); }
  eave(k, A, Ft, 0.3, { l: 0.5, r: 1.2, f: 1.5, b: 0.5 }); eave(k, B, Ft, 0.3, { l: 0.5, r: 0.5, f: 0.1, b: 1.0 });
  volume(d, Gar, GROUND, F1 - 0.5 - 0.2, p.render2); eave(k, Gar, F1 - 0.5, 0.25, { l: 0, r: 0.2, f: 0.5, b: 0.2 });
  d.flat(d.plain, Gar.x1 - Gar.x0 - 0.3, Gar.z1 - Gar.z0 - 0.3, (Gar.x0 + Gar.x1) / 2, F1 - 0.5 + 0.02, (Gar.z0 + Gar.z1) / 2, d.c.hedge2);       // the green roof
  eave(k, V, F1, 0.26, { l: 0, r: 0.15, f: 0, b: 0 });
  rail(k, V.x1 + 0.1, V.z0, V.x1 + 0.1, V.z1, F1); rail(k, V.x0, V.z0 + 0.05, V.x1 + 0.1, V.z0 + 0.05, F1);
  post(k, 2.8, -6.0, F1 - 0.3, GROUND, 0.22, p.wood); post(k, -0.6, -6.0, F1 - 0.3, GROUND, 0.22, p.wood);
  d.flat(d.plain, V.x1 - V.x0, V.z1 - V.z0, (V.x0 + V.x1) / 2, GROUND + 0.1, (V.z0 + V.z1) / 2, p.wood);
  slats(k, R(V.x0 + 0.3, V.x1 - 0.1, V.z0 + 0.5, V.z1 - 1.2), F1, { h: 2.4, pitch: 1.1, col: p.wood });
  // ---- the street face: the door under a canopy, windows, the garage door
  door(d, { face: 'street', x: -6.4, z: A.z1, portal: false, steps: true, col: p.accent });
  eave(k, R(-7.8, -5.0, A.z1, A.z1 + 1.1), GROUND + 3.0, 0.18, { l: 0, r: 0, f: 0, b: 0 });
  win(k, { face: 'street', at: A.z1, u0: -4.3, u1: -1.1, y0: GROUND + 0.9, y1: F1 - 0.8, sill: true });
  glazing(d, { face: 'street', at: A.z1, u0: -9.0, u1: -0.6, y0: F1 + 0.12, y1: F2 - 0.7, mullions: 1 });
  balcony(gd, { face: 'street', at: A.z1, u0: -9.2, u1: -0.4, y: F1, depth: 1.2 });
  if (n === 3) { win(k, { face: 'street', at: A.z1, u0: -9.0, u1: -2.6, y0: F2 + 0.4, y1: Ft - 0.8 }); win(k, { face: 'back', at: A.z0, u0: -3.0, u1: 2.4, y0: F2 + 0.4, y1: Ft - 0.8 }); }
  garageDoor(k, 6.5, Gar.z1, 2.8, 2.3);
  // ---- the loggia's glazing, the back wing and the sides
  glazing(d, { face: 'back', at: A.z0, u0: -3.2, u1: 2.6, y0: GROUND + 0.6, y1: F1 - 0.7, mullions: 1 });
  win(k, { face: 'back', at: A.z0, u0: -3.0, u1: 2.4, y0: F1 + 0.5, y1: F2 - 0.8 });
  win(k, { face: 'right', at: B.x1, u0: -5.8, u1: -1.2, y0: GROUND + 0.9, y1: F1 - 0.8 });
  win(k, { face: 'back', at: B.z0, u0: -8.6, u1: -4.4, y0: GROUND + 0.9, y1: F1 - 0.8, sill: true }); win(k, { face: 'back', at: B.z0, u0: -8.6, u1: -4.4, y0: F1 + 0.5, y1: F2 - 0.7, sill: true });
  win(k, { face: 'left', at: A.x0, u0: 1.8, u1: 4.2, y0: F1 + 0.5, y1: F2 - 0.8 }); win(k, { face: 'left', at: A.x0, u0: 1.8, u1: 4.2, y0: GROUND + 0.9, y1: F1 - 0.8 });
  win(k, { face: 'left', at: B.x0, u0: -5.2, u1: -1.6, y0: GROUND + 0.9, y1: F1 - 0.8 }); win(k, { face: 'left', at: B.x0, u0: -5.2, u1: -1.6, y0: F1 + 0.5, y1: F2 - 0.8 });
  if (n === 2) edgeLight(k, A.x0 - 0.5, A.x1 + 1.2, A.z1 + 1.5, Ft);
  // ---- the garden: the foot gate, the path, lawn, a tree, a lantern, planters; the drive to the garage
  houseNumber(k, o.site.number, ent);
  walk(k, -6.4, 5.6, 1.4);
  pave(k, R(3.4, 9.8, 5.4, 10.4), tn.drive, 1);
  lawn(k, R(-10.4, -7.2, 7.0, 10.4)); lawn(k, R(-5.6, 3.2, 7.0, 10.4)); lawn(k, R(-10.4, -9.4, 5.6, 7.0));
  tree(k, -8.8 + k.j(0.5), 8.4 + k.j(0.4), 0.95 + k.j(0.1));
  if (n === 2) lantern(k, -2.8, 6.6);
  pave(k, R(-10.4, 10.4, -10.4, -6.8), tn.deck);
  lawn(k, R(-10.0, -1.0, -10.0, -7.4)); lawn(k, R(4.0, 10.0, -10.0, 0.0));
  solidBox(d, A, Ft + 0.3); solidBox(d, B, Ft + 0.3); solidBox(d, Gar, F1 - 0.3);
};
