import { type SiteBuilder } from './contract';
import { door, glazing, louvres, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, boundary, ctx, deckFlat, eave, footGate, garageDoor, hedge, lantern, lawn, lv, pave, plaque, rail, roofKit, slats, stones, tree, wallDress, win, edgeLight } from './villas.kit';

/**
 * House 3, « Maison à gradins »: three masses stepping back from the street, each with a terrace on the one below behind a glass guard and planters,
 * an oak screen on the terrace's flank, a corner window wrapping the first floor, a pergola and a roof terrace; the garage's roof joins the first terrace.
 */
export const terraces: SiteBuilder = o => {
  const k = ctx(o, { gateW: 3.4 }), { d, n, lite } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n);
  boundary(k, { h: 1.9, front: 'low' });
  wallDress(k, { plinth: 0.3, panels: [{ x0: -5.4, x1: 3.0, y0: 0.2, y1: 0.85, col: p.wood, joints: 4 }] }, 1.0);
  const G = R(-9.4, 3.4, -5.0, 5.2), Gar = R(3.4, 9.6, -1.0, 5.2), U1 = R(-9.4, 3.4, -5.0, 2.4), U2 = n === 3 ? R(-9.4, 0.4, -5.0, -0.2) : R(-9.4, -3.0, -5.0, -0.4), cube = n === 3 ? R(-9.4, -3.4, -5.0, -1.0) : U2;
  volume(d, G, GROUND, F1 - T_SLAB, p.render2); eave(k, G, F1, T_SLAB, { l: 0.15, r: 0.1, f: 0.2, b: 0.15 }, p.slab);
  volume(d, Gar, GROUND, F1 - T_SLAB, p.render); eave(k, Gar, F1, T_SLAB, { l: 0, r: 0.15, f: 0.2, b: 0.15 }, p.slab);
  volume(d, U1, F1, F2 - T_SLAB, p.render); eave(k, U1, F2, T_SLAB, { l: 0.15, r: 0.2, f: 0.35, b: 0.15 }, p.slab);
  if (n === 3) { volume(d, U2, F2, Ft - T_SLAB, p.render2); eave(k, U2, Ft, T_SLAB, { l: 0.15, r: 0.3, f: 0.45, b: 0.15 }, p.slab); }
  const top = Ft, c0 = n === 3 ? R(-9.4, -3.4, -5.0, -1.2) : U2;
  volume(d, c0, top, top + 2.6, p.render); eave(k, c0, top + 2.6, 0.22, { l: 0.15, r: 0.3, f: 0.45, b: 0.15 }, p.slab);
  void cube;
  volume(d, R(G.x0 - 0.02, -5.2, G.z1, G.z1 + 0.05), GROUND, F1 - T_SLAB - 0.2, p.stone);           // the entry's travertine wall
  // ---- the street face: the door and the window on the ground floor, the garage door, the corner window on the first floor, the terrace's glass guard
  door(d, { face: 'street', x: -6.8, z: G.z1, portal: false, steps: true, col: p.accent });
  win(k, { face: 'street', at: G.z1, u0: -4.2, u1: -1.2, y0: GROUND + 0.6, y1: F1 - 0.8, sill: true });
  garageDoor(k, 6.5, Gar.z1, 2.8, 2.3);
  glazing(d, { face: 'street', at: U1.z1, u0: -8.8, u1: 3.0, y0: F1 + 0.12, y1: F2 - 0.7, mullions: 2 });
  glazing(d, { face: 'right', at: U1.x1, u0: -0.6, u1: 2.4, y0: F1 + 0.12, y1: F2 - 0.7, mullions: 1 });
  rail(k, -9.2, G.z1 + 0.25, 9.8, G.z1 + 0.25, F1); rail(k, 9.8, Gar.z0, 9.8, G.z1 + 0.25, F1);
  if (n === 3) { win(k, { face: 'street', at: U2.z1, u0: -8.8, u1: 0.0, y0: F2 + 0.4, y1: Ft - 0.8 }); win(k, { face: 'back', at: U2.z0, u0: -8.6, u1: -1.0, y0: F2 + 0.4, y1: Ft - 0.8 }); }
  const f2 = n === 3 ? U2.z1 : U1.z1, rx = n === 3 ? U2.x1 : U1.x1;
  rail(k, -9.2, f2 + 0.15, n === 3 ? rx + 0.3 : 3.6, f2 + 0.15, n === 3 ? Ft : F2);
  win(k, { face: 'street', at: c0.z1, u0: -8.6, u1: -4.6, y0: top + 0.4, y1: top + 2.1 });
  win(k, { face: 'right', at: c0.x1, u0: -4.0, u1: -1.6, y0: top + 0.4, y1: top + 2.1 });
  edgeLight(k, -9.2, 9.6, G.z1 + 0.2, F1);
  // ---- the back and sides
  win(k, { face: 'back', at: G.z0, u0: -8.6, u1: -1.0, y0: GROUND + 0.4, y1: F1 - 0.8, sill: true });
  win(k, { face: 'back', at: U1.z0, u0: -8.6, u1: 2.6, y0: F1 + 0.4, y1: F2 - 0.8 });
  win(k, { face: 'left', at: G.x0, u0: 0.4, u1: 3.4, y0: GROUND + 0.8, y1: F1 - 0.8 }); win(k, { face: 'left', at: G.x0, u0: 0.4, u1: 3.4, y0: F1 + 0.5, y1: F2 - 0.8 });
  win(k, { face: 'back', at: Gar.z0, u0: 5.4, u1: 7.8, y0: GROUND + 1.2, y1: F1 - 0.8 });
  // ---- the terraces: oak screen, planters, the pergola on the first terrace, the roof terrace's lounge
  deckFlat(k, R(-9.2, 9.4, U1.z1 + 0.3, G.z1 - 0.1), F1, p.wood);
  louvres(d, { face: 'right', at: Gar.x1 - 0.3, u0: 0.2, u1: 4.9, y0: F1 + 0.01, y1: F1 + 1.55, pitch: 1.0, depth: 0.12 });
  slats(k, R(-8.6, -3.4, U1.z1 + 0.5, G.z1 - 0.3), F1, { h: 2.3, pitch: 0.75 });
  deckFlat(k, R(-9.4, 3.4, c0.z1 + 0.1, U1.z1), F2, p.wood);
  roofKit(k, -7.0, -3.0, top + 2.62);
  // ---- the garden
  footGate(k, -6.8);
  plaque(k, o.site.number, k.g0 - 0.3, 1.1, 11.14, { w: 0.4, h: 0.22 });
  pave(k, R(-7.4, -6.2, 5.2, 10.4), d.c.stone);
  pave(k, R(3.8, 9.8, 5.4, 10.4), d.c.drive);
  lawn(k, R(-10.4, -7.6, 6.0, 10.4)); lawn(k, R(-5.4, 3.4, 6.2, 10.4));
  tree(k, -8.8 + k.j(0.5), 8.2 + k.j(0.5), 0.95 + k.j(0.1)); if (n === 2) lantern(k, -3.2, 6.6);
  if (!lite) hedge(k, -5.2, 9.9, 3.0, 9.9, 0.6);
  stones(k, -6.8, 8.0, -6.8, 8.0, 1);
  pave(k, R(-10.4, 10.4, -10.4, -5.4), d.c.deck);
  lawn(k, R(-10.0, 0.0, -10.0, -6.0));
  solidBox(d, G, F1 + 0.2); solidBox(d, Gar, F1 + 0.2); solidBox(d, U1, F2 + 0.3);
  if (n === 3) solidBox(d, U2, Ft + 0.3);
  solidBox(d, c0, top + 2.8);
};
