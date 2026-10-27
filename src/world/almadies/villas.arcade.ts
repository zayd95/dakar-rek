import { type SiteBuilder } from './contract';
import { balcony, door, glazing, slabEdge, solidBox, volume } from './parts';
import { GROUND, R, T_SLAB, bloomRail, bloomWall, boundary, ctx, garageDoor, lantern, lawn, lightGuard, lv, palmAt, palmSmall, pave, houseNumber, poolGarden, pot, roofKit, shrub, slats, tones, win, entry, walk, bench } from './villas.kit';

/**
 * Villa 2, « Arcades »: a portico of square piers and deep lintels along the front, the sand-coloured house behind it, the upper floor opening on a long
 * balcony over the arcade, a garage door in its last bay, a roof terrace behind a solid parapet and a small tower at the corner capped in steps.
 */
export const arcade: SiteBuilder = o => {
  const k = ctx(o), { d, n, lite } = k, p = d.p, F1 = lv(1), F2 = lv(2), Ft = lv(n), gd = lightGuard(k), acc = p.accent, tn = tones(k);
  const ent = entry(k, -3.05, 2.0);
  boundary(k, { h: 2.2, entries: ent });
  const M = R(-7.8, 7.6, -4.4, 3.6), A = R(-8.1, 7.9, 3.6, 6.3), px = [-7.4, -4.5, -1.6, 1.3, 4.2, 7.1], zp = 5.95;
  // ---- the masses: the ground floor in the sand render, the upper floor in the ivory, the roof slab with its parapet
  volume(d, M, GROUND, F1 - T_SLAB, p.render2);
  slabEdge(d, R(M.x0, M.x1, M.z0, A.z1 - 0.05), F1, T_SLAB, 0.2);
  volume(d, M, F1, F2 - T_SLAB, p.render);
  const top = n === 2 ? M : R(-7.8, 7.6, -4.4, -0.4);
  slabEdge(d, M, F2, T_SLAB, 0.45);
  if (n === 3) { volume(d, top, F2, Ft - T_SLAB, p.render); slabEdge(d, top, Ft, T_SLAB, 0.45); }
  // ---- the arcade: square piers and a deep lintel beam under the balcony's slab
  for (const x of px) volume(d, R(x - 0.26, x + 0.26, zp - 0.26, zp + 0.26), GROUND, F1 - 1.0, p.stone);
  volume(d, R(px[0] - 0.4, px[5] + 0.4, zp - 0.3, zp + 0.3), F1 - 1.0, F1 - T_SLAB, p.stone);
  volume(d, R(px[0] - 0.42, px[5] + 0.42, zp - 0.32, zp + 0.32), F1 - 1.0, F1 - 0.88, acc);
  pave(k, R(-8.0, 7.8, 3.6, 6.1), tn.fore, 2);
  if (!lite) for (const i of [0, 2, 4]) d.box(d.bulbs, 0.4, 0.05, 0.25, (px[i] + px[i + 1]) / 2, F1 - T_SLAB - 0.04, 4.9, d.c.bulb);       // downlights in the gallery's soffit
  // ---- the ground floor behind the arcade: the portal door, the salon's glazing, the garage door in the last bay
  door(d, { face: 'street', x: -3.05, z: M.z1, portal: true, steps: false });
  glazing(d, { face: 'street', at: M.z1, u0: -0.9, u1: 2.6, y0: GROUND + 0.1, y1: F1 - 1.2, mullions: 1 });
  glazing(d, { face: 'street', at: M.z1, u0: -7.2, u1: -5.0, y0: GROUND + 0.1, y1: F1 - 1.2, mullions: 0 });
  garageDoor(k, 5.65, M.z1, 2.5, 2.3);
  // ---- the upper floor: three french windows on the balcony over the arcade (a solid guard in the render)
  for (const [a, b] of [[-7.0, -4.8], [-3.6, 0.2], [2.0, 6.6]] as const) glazing(d, { face: 'street', at: M.z1, u0: a, u1: b, y0: F1 + 0.1, y1: F2 - 0.65 });
  const gy = F1, gz = zp + 0.38;
  d.box(d.plain, A.x1 - A.x0 - 0.1, 1.0, 0.2, 0, gy, gz, p.slab); d.box(d.plain, 0.2, 1.0, gz - M.z1 - 0.2, A.x0 + 0.2, gy, (gz + M.z1) / 2, p.slab); d.box(d.plain, 0.2, 1.0, gz - M.z1 - 0.2, A.x1 - 0.2, gy, (gz + M.z1) / 2, p.slab);
  d.box(d.plain, A.x1 - A.x0 + 0.1, 0.06, 0.3, 0, gy + 1.0, gz, p.stone);
  // ---- the back: the ground floor opens on the pool deck, the upper floor on a balcony
  glazing(d, { face: 'back', at: M.z0, u0: -6.8, u1: -0.4, y0: GROUND + 0.1, y1: F1 - 0.7, mullions: 2 });
  glazing(d, { face: 'back', at: M.z0, u0: -6.4, u1: 1.0, y0: F1 + 0.1, y1: F2 - 0.65, mullions: 1 });
  balcony(gd, { face: 'back', at: M.z0, u0: -6.6, u1: 1.4, y: F1, depth: 1.5, guard: 'solid' });
  win(k, { face: 'left', at: M.x0, u0: -2.4, u1: 1.6, y0: F1 + 0.5, y1: F2 - 1.0, sill: true });
  win(k, { face: 'right', at: M.x1, u0: -2.6, u1: 1.4, y0: F1 + 0.5, y1: F2 - 1.0, sill: true });
  win(k, { face: 'left', at: M.x0, u0: -2.4, u1: 1.6, y0: GROUND + 0.9, y1: F1 - 1.3 });
  // ---- the roof terrace behind its parapet, the belvedere on posts, the tower at the corner capped in steps
  const pr = R(M.x0 - 0.2, M.x1 + 0.2, M.z0 - 0.2, M.z1 + 0.2), pt = 0.16, pc = (a: number, b: number) => (a + b) / 2;
  const run = (x0: number, z0: number, x1: number, z1: number) => d.box(d.plain, Math.max(pt, x1 - x0), 1.0, Math.max(pt, z1 - z0), pc(x0, x1), F2, pc(z0, z1), p.slab);
  run(pr.x0, pr.z1 - pt, pr.x1, pr.z1);                                                       // the roof's parapet: solid, in the slab's white
  run(pr.x0, n === 2 ? pr.z0 : top.z1, pr.x0 + pt, pr.z1); run(pr.x1 - pt, n === 2 ? pr.z0 : top.z1, pr.x1, pr.z1);
  if (n === 2) run(pr.x0, pr.z0, pr.x1, pr.z0 + pt);
  const tw = R(-7.6, -4.6, 0.9, 3.6), tt = Ft + 3.3;
  volume(d, tw, F2, tt, p.render2); volume(d, R(tw.x0 - 0.05, tw.x1 + 0.05, tw.z0 - 0.05, tw.z1 + 0.05), tt - 0.65, tt - 0.35, acc);
  slabEdge(d, tw, tt, 0.2, 0.3, p.slab); slabEdge(d, R(tw.x0 + 0.5, tw.x1 - 0.5, tw.z0 + 0.5, tw.z1 - 0.5), tt + 0.25, 0.25, 0.1, acc);
  for (const y of n === 3 ? [F2, Ft] : [F2]) {
    win(k, { face: 'street', at: tw.z1, u0: -6.7, u1: -5.5, y0: y + 0.7, y1: y + 2.5 });
    if (!lite || y === F2) win(k, { face: 'right', at: tw.x1, u0: 1.6, u1: 2.8, y0: y + 0.7, y1: y + 2.5 });
  }
  if (n === 3) {                                                                                      // the third storey's own windows, front and back
    win(k, { face: 'street', at: top.z1, u0: 0.4, u1: 6.6, y0: F2 + 0.5, y1: Ft - 0.8, sill: true });
    win(k, { face: 'back', at: top.z0, u0: -6.4, u1: 1.0, y0: F2 + 0.5, y1: Ft - 0.8 });
  }
  const pg = n === 2 ? R(1.6, 5.8, -3.6, -0.2) : R(0.6, 5.0, 0.2, 3.2);
  slats(k, pg, F2 + 0.02, { h: 2.4, pitch: 0.7 });
  d.flat(d.plain, pg.x1 - pg.x0, pg.z1 - pg.z0, (pg.x0 + pg.x1) / 2, F2 + 0.035, (pg.z0 + pg.z1) / 2, p.wood);
  if (n === 2) roofKit(k, -3.0, -2.6, F2 + 0.02);
  bloomWall(k, 'left', -1.0, 2.2);
  // ---- the forecourt: the wall's portal, the number, the path to the arcade, lawn, planters, the drive to the garage
  houseNumber(k, o.site.number, ent);
  bloomRail(k, -6.6 + k.j(0.5));
  walk(k, -3.05, 6.1, 1.6);
  pave(k, R(3.4, 9.8, 6.4, 10.4), tn.drive, 1);
  lawn(k, R(-10.4, -4.0, 6.5, 10.4)); lawn(k, R(-1.8, 3.2, 6.6, 10.4));
  bench(k, -0.9, 9.5);
  lantern(k, -5.8, 6.9); lantern(k, -0.4, 6.9);
  pot(k, 1.1, 7.0, 1.2, 0.7, 0.55, true);
  palmAt(k, -9.3 + k.j(0.3), 4.9 + k.j(0.8), 1.05 + k.j(0.08), 0.7 + k.j(0.9));
  // ---- the back garden: the pool, the loungers, the palm
  pave(k, R(-10.4, 10.4, -10.4, -4.6), tn.deck);
  poolGarden(k, { deck: R(-10.4, 10.4, -10.4, -5.7), pool: R(-6.4, 1.6, -9.2, -6.6), loungers: [[4.6, -8.2], [5.9, -8.2]] });
  palmSmall(k, 8.8 + k.j(0.6), -9.6 + k.j(0.4), 1.0 + k.j(0.1), 0.6 + k.j(0.9));
  shrub(k, -9.2, -9.4, 0.7);
  // ---- solid
  solidBox(d, M, Ft + 0.4);
  for (const x of px) solidBox(d, R(x - 0.26, x + 0.26, zp - 0.26, zp + 0.26), F1);                      // the piers; the bays stay open to the door
};
