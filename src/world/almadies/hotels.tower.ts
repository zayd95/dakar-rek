import { E, type SiteDraw, type SiteResult } from './contract';
import { door, gateX, nameBoard, paving, perimeter, planter, roofPlant, siteRng, slabEdge, solidBox, volume } from './parts';
import { ST, Y0, clamp, courses, flagPole, glassRail, cells, guard, info, lit, litBar, lounger, mix, pane, parasol, quads, slats, slimPalm, table } from './hotels.kit';

/**
 * LD2.0-E lane E-H, the tower hotel (46 × 22 m site, a podium of two storeys and a slimmer tower of 2 to 8 more): a deep colonnade of slim columns over a
 * glass lobby and a restaurant, a porte-cochère in its middle, a terrace on the podium's roof; behind it the tower stands back in a skin of white fins
 * that ripple in depth (the « Océane »'s wave) round deep balconies, its top floor a glass sky lounge under a thick lit crown that carries the name, a
 * pergola over the roof lounge. The sides are ribbons of glass and slabs, the back the fins' quieter echo.
 */
export function buildTower(d: SiteDraw): SiteResult {
  const { site: s, p } = d, lite = d.lite, rec = info(d);
  const n = clamp(s.storeys, 4, 10);                                                    // storeys in all: the podium's two, the tower's n − 2
  const gx = gateX(d.w, s.gate), sg: 1 | -1 = gx < 0 ? -1 : 1, left = -sg, rite = sg;   // the service side: the gate's
  rec.serviceSide = sg;
  const PX = 21.5, zB = -9.6, zP = 3.6, zC = 6.4;                                       // the podium: its width, back wall, glass wall, the columns' line
  const TX = 10, tB = -8.8, tF = -0.8, BD = 2.0;                                        // the tower: half width, back and front walls, the balconies' depth
  const yF = (k: number) => Y0 + k * ST, yP = yF(2), yT = yF(n), yR = yT + 0.1;         // floor k; the podium's roof (the terrace); the tower's top storey's ceiling, the roof slab's top
  const ex = d.w / 2, rng = siteRng(d, 'lit');
  perimeter(d, { gate: s.gate, front: 'low' });

  // ------------------------------------------------------------------------------------------------ the podium: a colonnade over glass, two storeys
  const pod = { x0: -PX, x1: PX, z0: zB, z1: zP };
  volume(d, pod, Y0, yF(1) - 0.25, p.stone);
  volume(d, pod, yF(1) - 0.25, yP, p.render);
  slabEdge(d, pod, yF(1), 0.25, 0.3);
  slabEdge(d, { x0: -PX, x1: PX, z0: zB, z1: zC }, yP, 0.3, 0.4);                  // the podium's roof reaches over the columns
  litBar(d, -PX - 0.3, PX + 0.3, zC + 0.38, yP - 0.3, { d: 0.08, h: 0.05 });
  for (let k = 0; k <= 10; k++) {                                                        // slim columns, the middle one given way to the entrance
    if (k === 5) continue;
    const x = -PX + k * 4.3;
    d.box(d.plain, 0.5, yP - Y0 - 0.25, 0.5, x, Y0, zC, k % 2 ? p.stone : mix(p.stone, p.render, 0.35));
    d.solid(x - 0.25, zC - 0.25, x + 0.25, zC + 0.25, yP);
  }
  d.box(d.plain, 8.6, 0.8, 0.5, 0, yP - 1.05, zC, p.slab);                               // the transfer beam over the entrance
  // the glass walls behind: the lobby below, the restaurant above, a loggia before it
  for (const [y0, y1] of [[Y0 + 0.2, yF(1) - 0.45], [yF(1) + 0.05, yP - 0.5]] as const) { pane(d, 'street', zP, -PX + 0.4, PX - 0.4, y0, y1, { mull: 2.15, sky: 0.55 }); lit(d, 'street', zP, cells(-PX + 0.4, PX - 0.4, 10), y0, y1, rng, 0.7); }
  guard(d, 'street', zC - 0.12, -PX + 0.25, PX - 0.25, yF(1), 1.0, 0);
  d.flat(d.pave, 2 * PX, zC - zP, 0, Y0 + 0.012, (zC + zP) / 2, mix(p.stone, 0xffffff, 0.3));            // the arcade's floor
  rec.doors.push({ kind: 'lobby', face: 'street', x: 0, z: zP });
  for (const sx of [-1, 1]) {                                                            // the lobby's doors, the arcade's wall lights
    quads(d, d.plain, 'street', zP + 0.07, [{ u0: sx * 0.03, u1: sx * 1.45, y0: Y0 + 0.2, y1: Y0 + 2.7, c: mix(p.glass, 0x6a5238, 0.5) }, { u0: sx * 1.5, u1: sx * 1.56, y0: Y0 + 0.2, y1: Y0 + 2.75, c: p.frame }].map(q => ({ ...q, u0: Math.min(q.u0, q.u1), u1: Math.max(q.u0, q.u1) })));
    quads(d, d.plain, 'street', zP + 0.08, [{ u0: Math.min(sx * 0.2, sx * 0.26), u1: Math.max(sx * 0.2, sx * 0.26), y0: Y0 + 0.9, y1: Y0 + 1.7, c: 0xc9a14b }]);
  }
  quads(d, d.plain, 'street', zP + 0.07, [{ u0: -1.45, u1: 1.45, y0: Y0 + 2.7, y1: Y0 + 2.78, c: p.frame }, { u0: -0.02, u1: 0.02, y0: Y0 + 0.2, y1: Y0 + 2.75, c: p.frame }]);
  // the porte-cochère: a blade cantilevered from the colonnade, lit under, on two slim posts, with a doorman's carpet
  { const x0 = -5.6, x1 = 5.6, z1 = 10.0, y = Y0 + 5.0;
    d.slab(d.plain, x1 - x0, 0.3, z1 - zC, 0, y - 0.15, (zC + z1) / 2, p.slab);
    d.box(d.plain, x1 - x0 + 0.02, 0.5, 0.08, 0, y - 0.55, z1, p.board);
    for (const sx of [-1, 1]) { d.box(d.plain, 0.24, y - 0.3 - Y0, 0.24, sx * 5.2, Y0, z1 - 0.5, p.stone); d.solid(sx * 5.2 - 0.12, z1 - 0.62, sx * 5.2 + 0.12, z1 - 0.38, 4.8); }
    litBar(d, -4.6, 4.6, z1 - 0.5, y - 0.33, { d: 0.12 }); if (!lite) litBar(d, -4.6, 4.6, (zC + z1) / 2, y - 0.33, { d: 0.12 });
  }

  // ------------------------------------------------------------------------------------------------ the podium's roof: the restaurant's terrace
  { const deck = mix(p.stone, p.slab, 0.35);
    d.flat(d.plain, 2 * PX - 0.4, zC - zB, 0, yP + 0.015, (zB + zC) / 2, deck);
    glassRail(d, { x0: -PX - 0.1, x1: PX + 0.1, z0: zB - 0.1, z1: zC + 0.3 }, yP, 1.05);
    solidBox(d, pod, yP + 1.0);
    // tables and parasols on the restaurant side, a pergola bar on the gate's, planters between
    const tz = 4.3;
    for (let k = 0; k < (lite ? 3 : 5); k++) { const x = left * (4.6 + k * 3.6); table(d, x, yP + 0.02, tz); if (k % 2 === 0) parasol(d, x, yP + 0.02, tz, 0xefe8da, 1.5); }
    { const a = Math.min(rite * 13.4, rite * 20.4), b = Math.max(rite * 13.4, rite * 20.4), z0 = 2.8, z1 = 6.0, h = 2.6;
      for (const x of [a + 0.1, b - 0.1]) for (const z of [z0 + 0.1, z1 - 0.1]) d.box(d.plain, 0.16, h, 0.16, x, yP, z, p.frame);
      for (const z of [z0 + 0.1, z1 - 0.1]) d.box(d.plain, b - a, 0.2, 0.2, (a + b) / 2, yP + h, z, p.frame);
      for (let k = 0; k < 6; k++) d.box(d.plain, 0.07, 0.07, z1 - z0, a + 0.3 + k * ((b - a - 0.6) / 5), yP + h + 0.2, (z0 + z1) / 2, p.wood);
      d.box(d.plain, 5.0, 1.05, 0.7, (a + b) / 2, yP, z0 + 0.7, p.stone); d.box(d.plain, 5.2, 0.06, 0.85, (a + b) / 2, yP + 1.05, z0 + 0.72, p.wood);
      for (let k = 0; k < (lite ? 2 : 4); k++) d.box(d.plain, 0.38, 0.68, 0.38, (a + b) / 2 - 1.8 + k * (lite ? 3.6 : 1.2), yP, z0 + 1.8, p.accent);
      litBar(d, a + 0.4, b - 0.4, z1 - 0.7, yP + h - 0.02, { d: 0.1 });
    }
    for (const x of [-TX - 3, TX + 3]) planter(d, x, 4.9, 3.0, 0.7, { h: 0.45, bloom: 0xd94a8c });
    for (let k = 0; k < (lite ? 1 : 2); k++) lounger(d, left * (13 + k * 1.7), yP + 0.02, 2.4, 0, p.wood);
  }

  // ------------------------------------------------------------------------------------------------ the tower: a skin of rippling fins round deep balconies
  const core = { x0: -TX, x1: TX, z0: tB, z1: tF };
  volume(d, core, yP, yT, p.render);
  for (let k = 2; k < n; k++) slabEdge(d, core, yF(k), 0.25, 0.2);
  slabEdge(d, { x0: -TX - 0.6, x1: TX + 0.6, z0: tB, z1: tF + BD }, yR, 0.35, 0.5);
  litBar(d, -TX - 1.1, TX + 1.1, tF + BD + 0.5 - 0.06, yR - 0.38, { d: 0.08, h: 0.05 });
  solidBox(d, core, yR + 0.5);
  for (let k = 2; k < n; k++) {
    const y = yF(k), lounge = k === n - 1;
    rec.balconies.push({ floor: k, u0: -TX, u1: TX, face: 'street', kind: k === 2 ? 'terrace' : 'glass' });
    if (k > 2) d.slab(d.plain, 2 * TX + 0.4, 0.25, BD, 0, y - 0.125, tF + BD / 2, p.slab);   // a deep balcony slab, the width of the tower
    pane(d, 'street', tF, -TX + 0.3, TX - 0.3, y + 0.05, y + (lounge ? 3.0 : 2.7), { mull: 1.65, sky: lounge ? 0.65 : 0.5 });
    lit(d, 'street', tF, cells(-TX + 0.3, TX - 0.3, 6), y + 0.05, y + (lounge ? 3.0 : 2.7), rng, lounge ? 0.9 : 0.5);
    guard(d, 'street', tF + BD - 0.1, -TX + 0.2, TX - 0.2, y, 1.05, 2.2);
    // ribbons on the sides and the back
    for (const sx of [-1, 1]) pane(d, sx > 0 ? 'right' : 'left', sx * TX, tB + 1.0, tF - 1.0, y + 0.6, y + 2.5, { mull: 3.0 });
    pane(d, 'back', tB, -TX + 0.5, TX - 0.5, y + 0.6, y + 2.5, { mull: 2.5 });
    lit(d, 'back', tB, cells(-TX + 0.5, TX - 0.5, 8), y + 0.6, y + 2.5, rng, 0.4);
  }
  { // the fins: tall white boxes standing off the slabs on a wave of depths, from the terrace to the lounge's sill
    const top = yF(n - 1), bottom = yP, nf = lite ? 7 : 13;
    for (let i = 0; i <= nf; i++) {
      const x = -TX + (2 * TX * i) / nf, dep = 0.5 + 0.75 * (0.5 + 0.5 * Math.sin(i * 0.95 + 0.4));
      d.box(d.plain, 0.26, top - bottom, dep, x, bottom, tF + BD - 0.12 + dep / 2, i % 4 === 2 ? p.render2 : p.slab);
    }
  }
  // the back: the fins' quieter echo, every 2.1 m, and the stair's glass
  { const top = yF(n - 1), bottom = yP;
    for (let i = 0; i <= (lite ? 4 : 9); i++) { const x = -TX + (2 * TX * i) / (lite ? 4 : 9); d.box(d.plain, 0.18, top - bottom, 0.5, x, bottom, tB - 0.25, i % 2 ? p.slab : p.render2); }
  }
  // ------------------------------------------------------------------------------------------------ the crown: a thick lit fascia with the name, the roof lounge under a pergola
  { const fz = tF + BD + 0.5, fh = 1.5, nx = TX + 1.1;
    d.box(d.plain, 2 * nx, fh, 0.3, 0, yR, fz - 0.15, p.board);                                              // the front fascia, dark, carries the name
    d.box(d.plain, 2 * nx + 0.2, 0.1, 0.4, 0, yR + fh, fz - 0.15, p.stoneDark);
    for (const sx of [-1, 1]) d.box(d.plain, 0.3, fh, fz - tB + 0.6, sx * (nx - 0.15), yR, (fz + tB - 0.6) / 2, p.render2);       // the sides, in render
    d.box(d.plain, 2 * nx - 0.6, 0.9, 0.2, 0, yR, tB - 0.45, p.render2);                                       // the back parapet
    rec.board = { x: 0, z: fz + 0.04, y: yR + fh / 2 };
    nameBoard(d, s.name ?? 'HÔTEL', { x: 0, z: fz + 0.04, y: yR + fh / 2, w: Math.min(13, 2 * nx - 3), h: 1.0, bg: '#' + p.board.toString(16).padStart(6, '0'), fg: '#f4e6bd' });
    d.box(d.plain, 2 * nx, 0.08, 0.1, 0, yR + fh + 0.1, fz + 0.04, p.accent);                               // a gilt line along its top
    // the lounge under its pergola: deck, a bar, loungers, planters
    d.flat(d.plain, 2 * nx - 0.7, fz - tB - 0.5, 0, yR + 0.03, (fz + tB) / 2, mix(p.wood, p.slab, 0.45));
    const px = 7.2, z0 = -6.4, z1 = 0.6, h = 2.7;
    for (const x of [-px, 0, px]) for (const z of [z0, z1]) d.box(d.plain, 0.16, h, 0.16, x, yR + 0.04, z, p.frame);
    for (const z of [z0, z1]) d.box(d.plain, 2 * px, 0.22, 0.22, 0, yR + 0.04 + h, z, p.frame);
    for (const x of [-px, 0, px]) d.box(d.plain, 0.2, 0.18, z1 - z0, x, yR + 0.04 + h + 0.02, (z0 + z1) / 2, p.frame);
    for (let k = 0; k <= (lite ? 5 : 10); k++) d.box(d.plain, 0.08, 0.08, z1 - z0 + 0.6, -px + (2 * px * k) / (lite ? 5 : 10), yR + 0.04 + h + 0.2, (z0 + z1) / 2, p.wood);
    litBar(d, -px + 0.4, px - 0.4, z1 - 0.5, yR + h, { d: 0.1 });
    d.box(d.plain, 6.0, 1.05, 0.7, left * 2.0, yR + 0.04, z0 + 0.9, p.stone); d.box(d.plain, 6.2, 0.06, 0.85, left * 2.0, yR + 1.09, z0 + 0.92, p.wood);
    for (let k = 0; k < (lite ? 2 : 4); k++) d.box(d.plain, 0.38, 0.68, 0.38, left * 2.0 - 2.0 + k * (lite ? 3.8 : 1.3), yR + 0.04, z0 + 1.95, p.accent);
    for (let k = 0; k < (lite ? 2 : 4); k++) lounger(d, rite * (3.2 + k * 1.7), yR + 0.05, -1.6, 0);
    planter(d, left * 8.6, 0.4, 3.0, 0.6, { h: 0.4 }); planter(d, rite * 8.6, 0.4, 3.0, 0.6, { h: 0.4 });
    roofPlant(d, { x0: -TX + 1, x1: -3, z0: -8.0, z1: -4.2 }, yR, { units: 2, panels: false });
  }

  // ------------------------------------------------------------------------------------------------ the podium's sides and back
  for (const sx of [-1, 1]) {
    const sf = sx > 0 ? 'right' as const : 'left' as const, at = sx * PX;
    courses(d, sf, at, zB, zP, Y0, yP, 0.85, p.stoneDark);
    pane(d, sf, at, zB + 2, zB + 3.4, yF(1) + 0.3, yP - 0.3, { sky: 0.6 });
    pane(d, sf, at, -1.0, 1.0, Y0 + 0.4, yF(1) - 0.7, { sky: 0.4 });
    slats(d, sf, at, 0.6, 2.6, yF(1) + 0.3, yP - 0.3, { pitch: 0.24, w: 0.12 });
  }
  { const at = zB;                                                                      // the back: a service dock, ribbons above it, oak at the corners
    pane(d, 'back', at, -PX + 1, PX - 1, yF(1) + 0.45, yF(1) + 2.3, { mull: 4.3 });
    for (const sx of [-1, 1]) slats(d, 'back', at, sx * 17.5 - 1.8, sx * 17.5 + 1.8, Y0 + 0.2, yP - 0.6, { pitch: 0.28, w: 0.13 });
    door(d, { face: 'back', x: rite * 8, z: at, w: 1.3, h: 2.3, portal: false, steps: false });
    d.slab(d.plain, 3.2, 0.16, 0.9, rite * 8, Y0 + 2.9, at - 0.45, p.slab);
    rec.doors.push({ kind: 'service', face: 'back', x: rite * 8, z: at });
  }

  // ------------------------------------------------------------------------------------------------ the forecourt
  paving(d, { x0: -ex, x1: ex, z0: zC + 0.3, z1: E - 0.3 }, 0xe3d9c3);
  paving(d, { x0: -6.4, x1: 6.4, z0: 6.9, z1: 9.8 }, 0x6d7075, Y0 + 0.02);
  rec.dropoff = { x0: -6.4, z0: 6.9, x1: 6.4, z1: 9.8 };
  for (let x = -5.4; x < 5.5; x += 1.8) paving(d, { x0: x, x1: x + 0.9, z0: 8.28, z1: 8.42 }, 0xf1efe8, Y0 + 0.03);
  paving(d, { x0: -1.3, x1: 1.3, z0: zC, z1: 6.9 }, p.accent, Y0 + 0.03);
  planter(d, left * 11.5, zC + 1.4, 4.4, 0.8, { bloom: 0xd94a8c }); planter(d, left * 17.0, zC + 1.4, 3.2, 0.8);
  slimPalm(d, left * 9.0, 8.0, 1.1, 0.5); slimPalm(d, left * 20.0, 8.4, 1.0, 1.4); slimPalm(d, rite * 9.4, 8.4, 1.05, 0.2);
  for (let k = 0; k < 2; k++) flagPole(d, (k ? 1 : -1) * 7.4, E - 1.1, 8.0, k ? p.board : p.accent, 1);
  void courses;
  return { keepClear: [{ ...d.f.rect(-6.6, zC, 6.6, E), why: `hotel_dropoff:${s.id}` }] };
}
