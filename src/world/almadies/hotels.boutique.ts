import { E, type SiteDraw, type SiteResult } from './contract';
import { door, gateX, nameBoard, paving, perimeter, planter, roofPlant, siteRng, slabEdge, solidBox, volume } from './parts';
import { ST, Y0, clamp, courses, flagPole, glassRail, guard, info, lit, litBar, lounger, mix, pane, parasol, pool, quads, slats, slimPalm, strips, table } from './hotels.kit';

/**
 * LD2.0-E lane E-H, the boutique hotel (46 × 22 m site, 4 or 5 storeys): a long low front of cantilevered slabs between travertine bookends, a balcony for
 * every room (a glass guard, then an oak screen, the rhythm running along the front and up it like a draught board), a double-height glass lobby in a stone
 * portal under a porte-cochère, a drop-off in a paved forecourt behind a low wall, the name on the portal's lintel; on the roof a pool, a pergola bar and a
 * glass parapet. The sides are the stone bookends (a glazed slot, an oak panel), the back a corridor's oak screens and a glazed stair core.
 */
export function buildBoutique(d: SiteDraw): SiteResult {
  const { site: s, p } = d, lite = d.lite, rec = info(d);
  const n = clamp(s.storeys, 3, 6);
  const gx = gateX(d.w, s.gate), sg: 1 | -1 = gx < 0 ? -1 : 1;                           // the service side: the gate's
  rec.serviceSide = sg;
  const X = 19.6, zB = -8.4, zF = 2.5, BAL = 1.8, LB = 4.35, ex = d.w / 2;
  const yF = (k: number) => Y0 + k * ST, yRoof = yF(n), yD = yRoof + 0.1;                // floor k's level; the roof slab's underside, its top (the roof deck)
  const row = { x0: -X, x1: X, z0: zB, z1: zF }, rng = siteRng(d, 'lit');
  const faceOf = (sx: number) => sx > 0 ? 'right' as const : 'left' as const;
  perimeter(d, { gate: s.gate, front: 'low' });

  // ------------------------------------------------------------------------------------------------ the masses
  volume(d, row, Y0, yF(1) - 0.25, p.stone);                                           // the ground storey in travertine
  volume(d, row, yF(1) - 0.25, yRoof, p.render);                                       // the rooms' storeys in render
  for (let k = 1; k < n; k++) slabEdge(d, row, yF(k), 0.25, 0.22);                     // a thin white slab at every floor, all round
  for (const sx of [-1, 1]) {                                                          // the stone bookends: the end walls, full height, proud of the front
    d.box(d.plain, 0.8, yRoof - Y0, zF + BAL + 0.2 - zB, sx * (X + 0.4), Y0, (zB - 0.1 + zF + BAL + 0.1) / 2, p.stone);
    courses(d, 'street', zF + BAL + 0.1, Math.min(sx * X, sx * (X + 0.8)), Math.max(sx * X, sx * (X + 0.8)), Y0, yRoof, 0.85, p.stoneDark);
    courses(d, faceOf(sx), sx * (X + 0.8), zB - 0.1, zF + BAL + 0.1, Y0, yRoof, 0.85, p.stoneDark);
    // the side's slot of glass (the stair's landing windows), and an oak panel
    const sf = faceOf(sx), at = sx * (X + 0.8), a = yF(1) + 0.3, b = yRoof - 0.4;
    pane(d, sf, at, 0.3, 1.5, a, b, { sky: 0.6 });
    quads(d, d.plain, sf, at + sx * 0.06, Array.from({ length: n - 2 }, (_, k) => ({ u0: 0.3, u1: 1.5, y0: yF(k + 2) - 0.3, y1: yF(k + 2) - 0.2, c: p.frame })));
    slats(d, sf, at, -7.4, -2.6, a, b, { pitch: 0.28, w: 0.12 });
  }
  // the roof: a deep slab, its lit edge, the glass parapet set in from it
  slabEdge(d, { x0: -X - 0.4, x1: X + 0.4, z0: zB, z1: zF + BAL }, yD, 0.35, 0.55);
  litBar(d, -X - 0.5, X + 0.5, zF + BAL + 0.55 - 0.06, yD - 0.38, { d: 0.08, h: 0.05 });
  glassRail(d, { x0: -X - 0.2, x1: X + 0.2, z0: zB - 0.2, z1: zF + BAL + 0.3 }, yD, 1.05);
  solidBox(d, { x0: -X - 0.8, x1: X + 0.8, z0: zB - 0.1, z1: zF }, yD + 1.0);
  for (const sx of [-1, 1]) solidBox(d, { x0: Math.min(sx * X, sx * (X + 0.8)), x1: Math.max(sx * X, sx * (X + 0.8)), z0: zF, z1: zF + BAL + 0.1 }, yD + 1.0);

  // ------------------------------------------------------------------------------------------------ the front: the rooms
  const bays: [number, number][] = [[LB, 8], [8, 12], [12, 16], [16, X]];
  const span = (sx: number, a: number, b: number) => ({ u0: Math.min(sx * a, sx * b), u1: Math.max(sx * a, sx * b) });
  const fins = [8, 12, 16];
  for (let k = 1; k < n; k++) {
    const y = yF(k), top = yF(k + 1) - 0.25;
    for (const sx of [-1, 1]) {
      const run = span(sx, LB, X);
      d.slab(d.plain, run.u1 - run.u0 + 0.2, 0.25, BAL, (run.u0 + run.u1) / 2, y - 0.125, zF + BAL / 2, p.slab);    // the balcony slab, one per floor and side
      pane(d, 'street', zF, run.u0 + 0.05, run.u1 - 0.05, y + 0.05, y + 2.7, { mull: 2.0 });
      lit(d, 'street', zF, bays.map(([a, b]) => { const u = span(sx, a, b); return [u.u0, u.u1] as [number, number]; }), y + 0.05, y + 2.7, rng, 0.5);
      bays.forEach(([a, b], i) => {
        const g = sx < 0 ? 3 - i : 6 + i, u = span(sx, a, b), oak = (g + k) % 2 === 1;
        rec.balconies.push({ floor: k, u0: u.u0, u1: u.u1, face: 'street', kind: oak ? 'oak' : 'glass' });
        if (oak) slats(d, 'street', zF + BAL - 0.06, u.u0 + 0.1, u.u1 - 0.1, y, top, { pitch: 0.2, w: 0.1 });
        else guard(d, 'street', zF + BAL - 0.05, u.u0 + 0.1, u.u1 - 0.1, y, 1.05, 1.8);
      });
    }
  }
  for (const sx of [-1, 1]) for (const f of fins) d.box(d.plain, 0.2, yRoof - yF(1) + 0.25, BAL, sx * f, yF(1) - 0.25, zF + BAL / 2, p.slab);   // the partitions between rooms
  // the suites over the lobby's double height: a wider pane and a deeper terrace on each floor above it
  for (let k = 2; k < n; k++) {
    const y = yF(k), top = yF(k + 1) - 0.25;
    rec.balconies.push({ floor: k, u0: -LB, u1: LB, face: 'street', kind: 'suite' });
    d.slab(d.plain, 2 * LB, 0.25, BAL + 0.4, 0, y - 0.125, zF + (BAL + 0.4) / 2, p.slab);
    pane(d, 'street', zF, -LB + 0.4, LB - 0.4, y + 0.05, y + 2.75, { mull: 2.1 });
    lit(d, 'street', zF, [[-LB + 0.4, 0], [0, LB - 0.4]], y + 0.05, y + 2.75, rng, 0.6);
    if (k === n - 1) slats(d, 'street', zF + BAL + 0.34, -LB + 0.3, LB - 0.3, y, top, { pitch: 0.24, w: 0.12 });
    else guard(d, 'street', zF + BAL + 0.34, -LB + 0.3, LB - 0.3, y, 1.05, 2.0);
  }

  // ------------------------------------------------------------------------------------------------ the ground floor, the lobby, the porte-cochère
  for (const sx of [-1, 1]) for (const f of [8, 12, 16]) d.box(d.plain, 0.5, yF(1) - 0.25 - Y0, 0.45, sx * f, Y0, zF + 0.2, p.stone);   // travertine pilasters on the grid
  const left = -sg, rite = sg;                                                         // the restaurant on one side, the spa and the staff door on the gate's
  { const u = span(left, LB, X); pane(d, 'street', zF + 0.25, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { mull: 2.0 }); lit(d, 'street', zF + 0.25, bays.map(([a, b]) => { const q = span(left, a, b); return [q.u0, q.u1] as [number, number]; }), Y0 + 0.25, Y0 + 2.95, rng, 0.9); }
  { const u = span(rite, LB, 12); pane(d, 'street', zF + 0.25, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { mull: 2.0 }); slats(d, 'street', zF + 0.5, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { pitch: 0.17, w: 0.09 }); }
  door(d, { face: 'street', x: rite * 14.2, z: zF + 0.45, w: 1.2, h: 2.4, portal: false });
  rec.doors.push({ kind: 'staff', face: 'street', x: rite * 14.2, z: zF + 0.45 }, { kind: 'lobby', face: 'street', x: 0, z: zF });
  // the lobby: a double-height pane in the stone portal (two piers rising to the roof, a lintel), the doors, a transom, the name on the lintel
  for (const sx of [-1, 1]) {
    d.box(d.plain, 0.75, yRoof - Y0, BAL + 0.1, sx * (LB + 0.05), Y0, zF + BAL / 2 + 0.05, p.stone);
    d.solid(sx * (LB + 0.05) - 0.375, zF, sx * (LB + 0.05) + 0.375, zF + BAL + 0.15, yRoof);
    if (!lite) strips(d, 'street', zF + BAL + 0.1, sx * (LB + 0.05) - 0.34, sx * (LB + 0.05) + 0.34, Y0, yF(2), 0.9, p.stoneDark, 0.03);
  }
  const lw = LB - 0.45, warm = mix(p.glass, 0x6a5238, 0.35), sky = mix(p.glass, 0xb4d2e0, 0.7);
  quads(d, d.glass, 'street', zF + 0.04, [{ u0: -lw, u1: lw, y0: Y0 + 0.15, y1: yF(2) - 1.45, c: warm, c2: sky }]);                    // the lobby's pane: its warm hall below, the sky above
  quads(d, d.plain, 'street', zF + 0.06, [{ u0: -lw, u1: lw, y0: Y0 + 0.15, y1: Y0 + 0.22, c: p.frame }, { u0: -lw, u1: lw, y0: yF(2) - 1.52, y1: yF(2) - 1.45, c: p.frame },
    ...[-lw, -3.2, -1.65, 1.65, 3.2, lw - 0.05].map(u => ({ u0: u, u1: u + 0.05, y0: Y0 + 0.15, y1: yF(2) - 1.45, c: p.frame })), { u0: -lw, u1: lw, y0: Y0 + 3.5, y1: Y0 + 3.6, c: p.frame }]);
  quads(d, d.plain, 'street', zF + 0.07, [{ u0: -1.4, u1: -0.03, y0: Y0 + 0.15, y1: Y0 + 2.6, c: mix(warm, p.frame, 0.35) }, { u0: 0.03, u1: 1.4, y0: Y0 + 0.15, y1: Y0 + 2.6, c: mix(warm, p.frame, 0.35) },
    { u0: -1.4, u1: 1.4, y0: Y0 + 2.6, y1: Y0 + 2.68, c: p.frame }, { u0: -0.2, u1: -0.14, y0: Y0 + 0.9, y1: Y0 + 1.7, c: 0xc9a14b }, { u0: 0.14, u1: 0.2, y0: Y0 + 0.9, y1: Y0 + 1.7, c: 0xc9a14b }]);   // the doors, their pulls
  d.box(d.plain, 2 * LB - 0.7, 1.3, BAL, 0, yF(2) - 1.55, zF + BAL / 2, p.stone);                                               // the lintel carries a gold monogram
  d.box(d.plain, 2 * LB - 0.7, 0.1, BAL + 0.1, 0, yF(2) - 0.25, zF + BAL / 2 + 0.05, p.stoneDark);
  quads(d, d.plain, 'street', zF + BAL + 0.03, [{ u0: -0.85, u1: -0.65, y0: yF(2) - 1.4, y1: yF(2) - 0.4, c: p.accent }, { u0: 0.65, u1: 0.85, y0: yF(2) - 1.4, y1: yF(2) - 0.4, c: p.accent }, { u0: -0.7, u1: 0.7, y0: yF(2) - 0.98, y1: yF(2) - 0.82, c: p.accent }]);
  // the porte-cochère: a thin white blade on two slim posts, its underside lit, the name on its dark fascia
  { const x0 = -5.7, x1 = 5.7, z0 = zF + BAL - 0.3, z1 = 9.0, y = Y0 + 4.55;
    d.slab(d.plain, x1 - x0, 0.26, z1 - z0, 0, y - 0.13, (z0 + z1) / 2, p.slab);
    d.box(d.plain, x1 - x0 + 0.02, 0.85, 0.1, 0, y - 0.7, z1 + 0.02, p.board);
    rec.board = { x: 0, z: z1 + 0.09, y: y - 0.28 };
    nameBoard(d, s.name ?? 'HÔTEL', { x: 0, z: z1 + 0.09, y: y - 0.28, w: 7.6, h: 0.62, bg: '#' + p.board.toString(16).padStart(6, '0'), fg: '#f4e6bd' });
    for (const sx of [-1, 1]) { d.box(d.plain, 0.26, y - 0.26 - Y0, 0.26, sx * 5.25, Y0, z1 - 0.5, p.stone); d.solid(sx * 5.25 - 0.13, z1 - 0.63, sx * 5.25 + 0.13, z1 - 0.37, 4.6); }
    litBar(d, -4.6, 4.6, z1 - 0.4, y - 0.29, { d: 0.12 }); if (!lite) litBar(d, -4.6, 4.6, (z0 + z1) / 2, y - 0.29, { d: 0.12 });
  }
  // the restaurant's terrace on the left: a deck, two parasols, three tables
  { const u = span(left, LB + 1, 18.4), cx = (u.u0 + u.u1) / 2;
    d.flat(d.plain, u.u1 - u.u0, 3.0, cx, Y0 + 0.03, zF + BAL + 0.8, mix(p.wood, p.stone, 0.35));
    for (const k of lite ? [1] : [0, 2]) { const x = u.u0 + 2.6 + k * 4.4; parasol(d, x, Y0 + 0.03, zF + BAL + 1.0, 0xefe8da, 1.5); table(d, x, Y0 + 0.03, zF + BAL + 1.0); }
    if (!lite) table(d, u.u0 + 6.9, Y0 + 0.03, zF + BAL + 1.0);
  }

  // ------------------------------------------------------------------------------------------------ the roof: a pool, a lounge under a cantilevered crown, loungers, a lawn, the stair head
  const deckCol = mix(p.stone, p.slab, 0.35), zFront = zF + BAL + 0.1;
  d.flat(d.plain, 2 * X - 0.4, zFront - zB, 0, yD + 0.015, (zB + zFront) / 2, deckCol);
  { const a = Math.min(left * 6.6, left * 18.4), b = Math.max(left * 6.6, left * 18.4);
    pool(d, a, 0.4, b, 3.7, yD, { rim: 0.3, stone: p.slab, lit: 2 });
    for (let k = 0; k < (lite ? 3 : 5); k++) lounger(d, left * (7.4 + k * (lite ? 2.8 : 1.6)), yD + 0.02, -1.6, 0);
    if (!lite) for (const k of [0, 2]) parasol(d, left * (8.2 + k * 3.2), yD + 0.02, -3.6, 0xefe8da, 1.35);
    d.flat(d.plain, Math.abs(b - a) - 0.6, 3.2, (a + b) / 2, yD + 0.025, -6.2, d.c.lawn);                                    // a patch of lawn behind
    for (let k = 0; k < 3; k++) d.blob(d.leaves, 0.5, left * (8.5 + k * 4.2), yD + 0.45, -7.7, k % 2 ? d.c.hedge : d.c.hedge2, 0.85, 0);
    planter(d, left * 12.5, zF + BAL + 0.05, 4.4, 0.55, { bloom: 0xd94a8c, h: 0.45 });
  }
  { // the crown: a lounge of glass under a deep white blade on two posts, its terrace in front
    const lx = 5.2, z0 = -5.0, z1 = 0.6, h = 3.0, yT = yD + h + 0.35;
    d.box(d.plain, 2 * lx, h, z1 - z0, 0, yD, (z0 + z1) / 2, p.render);
    pane(d, 'street', z1, -lx + 0.5, lx - 0.5, yD + 0.15, yD + h - 0.25, { mull: 1.7, sky: 0.6 });
    lit(d, 'street', z1, [[-lx + 0.5, -lx / 3], [-lx / 3, lx / 3], [lx / 3, lx - 0.5]], yD + 0.15, yD + h - 0.25, rng, 0.9);
    for (const sx of [-1, 1]) slats(d, faceOf(sx), sx * lx, z0 + 0.8, z1 - 0.8, yD + 0.2, yD + h - 0.2, { pitch: 0.24, w: 0.12 });
    d.slab(d.plain, 2 * lx + 1.6, 0.28, z1 - z0 + 3.1, 0, yT - 0.14, (z0 - 0.6 + 3.1) / 2, p.slab);
    d.box(d.plain, 2 * lx + 1.62, 0.07, 0.06, 0, yT - 0.35, 3.1, p.frame);
    litBar(d, -lx - 0.2, lx + 0.2, 2.85, yT - 0.31, { d: 0.12 });
    for (const sx of [-1, 1]) d.box(d.plain, 0.16, h + 0.35, 0.16, sx * (lx + 0.5), yD, 2.85, p.frame);
    d.flat(d.plain, 2 * lx + 0.6, 2.6, 0, yD + 0.03, 1.9, mix(p.wood, p.stone, 0.3));
    for (const x of [-3.4, 0, 3.4]) { table(d, x, yD + 0.03, 1.9); }
    d.solid(-lx - 0.2, z0 - 0.2, lx + 0.2, z1, yD + h + 0.5);
  }
  { const hx0 = Math.min(rite * 14.6, rite * 19.2), hx1 = Math.max(rite * 14.6, rite * 19.2);                                   // the stair head, in render with an oak panel
    d.box(d.plain, hx1 - hx0, 3.2, 4.0, (hx0 + hx1) / 2, yD, -6.2, p.render); d.slab(d.plain, hx1 - hx0 + 0.6, 0.18, 4.6, (hx0 + hx1) / 2, yD + 3.3, -6.2, p.slab);
    slats(d, 'street', -4.2, hx0 + 0.5, hx1 - 0.5, yD + 0.2, yD + 3.0, { pitch: 0.2, w: 0.1 });
    for (let k = 0; k < (lite ? 2 : 3); k++) lounger(d, rite * (8.4 + k * 1.7), yD + 0.02, 1.2, 0, p.wood);
    if (!lite) parasol(d, rite * 9.2, yD + 0.02, -0.6, 0xefe8da, 1.35);
    planter(d, rite * 12.5, zF + BAL + 0.05, 4.4, 0.55, { h: 0.45 });
  }
  roofPlant(d, { x0: Math.min(rite * 7, rite * 14.2), x1: Math.max(rite * 7, rite * 14.2), z0: -8.0, z1: -4.2 }, yD, { units: 2 });

  // ------------------------------------------------------------------------------------------------ the back: a corridor behind oak screens, the glazed stair core, the service door
  { const at = zB, mod = 4.2, x0 = -9 * mod / 2;
    for (let k = 1; k < n; k++) { pane(d, 'back', at, -X + 0.7, X - 0.7, yF(k) + 0.55, yF(k) + 2.55, { mull: mod }); lit(d, 'back', at, Array.from({ length: 9 }, (_, m) => [x0 + m * mod, x0 + (m + 1) * mod] as [number, number]), yF(k) + 0.55, yF(k) + 2.55, rng, 0.4); }
    for (let m = 0; m < 9; m += 2) {
      if (Math.abs((m + 0.5) * mod + x0 - rite * 12.6) < 3.0) continue;               // the core stands here
      slats(d, 'back', at - 0.28, x0 + m * mod + 0.2, x0 + (m + 1) * mod - 0.2, yF(1) + 0.1, yRoof - 0.25, { pitch: 0.3, w: 0.14 });
    }
    const cx0 = Math.min(rite * 10.4, rite * 14.8), cx1 = Math.max(rite * 10.4, rite * 14.8), cz = zB - 1.5;                // the stair core
    d.box(d.plain, cx1 - cx0, yRoof + 3.2 - Y0, 1.5, (cx0 + cx1) / 2, Y0, zB - 0.75, p.render);
    d.slab(d.plain, cx1 - cx0 + 0.5, 0.2, 1.9, (cx0 + cx1) / 2, yRoof + 3.3, zB - 0.85, p.slab);
    pane(d, 'back', cz, cx0 + 0.45, cx1 - 0.45, yF(1) + 0.25, yRoof + 2.9, { sky: 0.6, head: false });
    quads(d, d.plain, 'back', cz - 0.06, Array.from({ length: n }, (_, k) => ({ u0: cx0 + 0.45, u1: cx1 - 0.45, y0: yF(k + 1) - 0.12, y1: yF(k + 1) + 0.03, c: p.frame })));
    solidBox(d, { x0: cx0, x1: cx1, z0: cz, z1: zB }, yRoof + 3.3);
    door(d, { face: 'back', x: (cx0 + cx1) / 2, z: cz, w: 1.3, h: 2.3, portal: false, steps: false });
    rec.doors.push({ kind: 'service', face: 'back', x: (cx0 + cx1) / 2, z: cz });
    d.slab(d.plain, 3.0, 0.16, 0.7, (cx0 + cx1) / 2, Y0 + 2.9, cz - 0.35, p.slab);                                         // a little canopy over the service door
    for (let k = 0; k < 3; k++) d.blob(d.leaves, 0.5, -X + 2 + k * 5.5, Y0 + 0.4, zB - 1.1, k % 2 ? d.c.hedge : d.c.hedge2, 0.8, 0);
  }

  // ------------------------------------------------------------------------------------------------ the forecourt
  paving(d, { x0: -ex, x1: ex, z0: zF + BAL + 0.05, z1: E - 0.3 }, 0xe3d9c3);
  paving(d, { x0: -6.2, x1: 6.2, z0: 6.2, z1: 9.5 }, 0x6d7075, Y0 + 0.02);                                                   // the drop-off lane
  rec.dropoff = { x0: -6.2, z0: 6.2, x1: 6.2, z1: 9.5 };
  for (let x = -5.4; x < 5.5; x += 1.8) paving(d, { x0: x, x1: x + 0.9, z0: 7.78, z1: 7.92 }, 0xf1efe8, Y0 + 0.03);
  paving(d, { x0: -1.2, x1: 1.2, z0: zF + BAL + 0.1, z1: 6.2 }, p.accent, Y0 + 0.03);                                         // the carpet from the door
  planter(d, -7.6, zF + BAL + 1.3, 3.0, 0.8, { bloom: 0xd94a8c }); planter(d, 7.6, zF + BAL + 1.3, 3.0, 0.8, { bloom: 0xd94a8c });
  slimPalm(d, left * 12.0, 7.4, 1.05, 0.4); slimPalm(d, left * 20.6, 6.0, 0.95, 1.2); slimPalm(d, rite * 11.0, 7.0, 1.0, 0.9);
  for (const [k, c] of [p.accent, p.board].entries()) flagPole(d, (k ? 1 : -1) * 7.4, E - 1.1, 7.6, c, 1);
  return { keepClear: [{ ...d.f.rect(-6.4, zF + BAL, 6.4, E), why: `hotel_dropoff:${s.id}` }] };
}
