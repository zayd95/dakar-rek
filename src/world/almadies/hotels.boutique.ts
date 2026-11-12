import { E, type GateSide, type RoofPanel, type SiteDraw, type SiteResult } from './contract';
import { bench, door, gateX, menuBoard, nameBoard, paving, parkedCar, perimeter, planter, roofPlant, scooter, slabEdge, solidBox, volume } from './parts';
import { STAFF, ST, Y0, clamp, courses, flagPole, glassRail, bollard, guard, info, litBar, pendants, stringLights, terrace, uplight, lounger, mix, pane, parasol, pool, quads, slats, slimPalm, strips, table, person, trolley } from './hotels.kit';

/**
 * LD2.0-E lane E-H, the boutique hotel (46 × 22 m site, 3 to 5 storeys): a long low front of cantilevered slabs between travertine bookends, a balcony for
 * every room (a glass guard, then an oak screen, the rhythm running along the front and up it like a draught board), a double-height glass lobby in a stone
 * portal under a porte-cochère (the name on its dark fascia), a drop-off in a paved forecourt behind a low railed wall; on the roof a pool, a lounge under a
 * deep white blade, a lawn and a glass parapet. The sides are the stone bookends (a glazed slot, an oak panel), the back a corridor's oak screens and a glazed stair core.
 */
export function buildBoutique(d: SiteDraw): SiteResult {
  const { site: s, p } = d, lite = d.lite, rec = info(d), life = rec.life;
  const n = clamp(s.storeys, 3, 5);
  const gate: GateSide = s.gate === 'centre' ? 'right' : s.gate, gx = gateX(d.w, gate), sg: 1 | -1 = gx < 0 ? -1 : 1;                           // the service side: the gate's
  rec.serviceSide = sg;
  const X = 19.6, zB = -8.4, zF = 2.5, BAL = 1.8, LB = 4.35, ex = d.w / 2;
  const yF = (k: number) => Y0 + k * ST, yRoof = yF(n), yD = yRoof + 0.1;                // floor k's level; the roof slab's underside, its top (the roof deck)
  const row = { x0: -X, x1: X, z0: zB, z1: zF };
  const faceOf = (sx: number) => sx > 0 ? 'right' as const : 'left' as const;
  perimeter(d, { gate, entries: [{ x: 0, w: 8 }] });                                  // a see-through railing on its plinth; the way in is open ground between two piers

  // ------------------------------------------------------------------------------------------------ the masses
  volume(d, row, Y0, yF(1) - 0.25, p.stone);                                           // the ground storey in travertine
  volume(d, row, yF(1) - 0.25, yRoof, p.render);                                       // the rooms' storeys in render
  for (let k = 1; k < n; k++) slabEdge(d, row, yF(k), 0.25, 0.22);                     // a thin white slab at every floor, all round
  for (const sx of [-1, 1]) {                                                          // the stone bookends: the end walls, full height, proud of the front
    d.box(d.plain, 0.8, yRoof - Y0, zF + BAL + 0.2 - zB, sx * (X + 0.4), Y0, (zB - 0.1 + zF + BAL + 0.1) / 2, p.stone);
    courses(d, faceOf(sx), sx * (X + 0.8), zB - 0.1, zF + BAL + 0.1, Y0, yRoof, 0.85, p.stoneDark);
    // the side's slot of glass (the stair's landing windows), and an oak panel
    const sf = faceOf(sx), at = sx * (X + 0.8), a = yF(1) + 0.3, b = yRoof - 0.4;
    pane(d, sf, at, 0.3, 1.5, Y0 + 0.45, b, { sky: 0.6, glow: 'lit' });                                                // the stair's glass from the pavement's level up
    quads(d, d.plain, sf, at + sx * 0.06, Array.from({ length: n - 1 }, (_, k) => ({ u0: 0.3, u1: 1.5, y0: yF(k + 1) - 0.3, y1: yF(k + 1) - 0.2, c: p.frame })));
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
      pane(d, 'street', zF, run.u0 + 0.05, run.u1 - 0.05, y + 0.05, y + 2.7, { mull: 2.0, rooms: 4 });
      bays.forEach(([a, b], i) => {
        const g = sx < 0 ? 3 - i : 6 + i, u = span(sx, a, b), oak = (g + k) % 2 === 1;
        rec.balconies.push({ floor: k, u0: u.u0, u1: u.u1, face: 'street', kind: oak ? 'oak' : 'glass' });
        if (oak) slats(d, 'street', zF + BAL - 0.06, u.u0 + 0.1, u.u1 - 0.1, y, top, { pitch: 0.26, w: 0.12 });
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
    pane(d, 'street', zF, -LB + 0.4, LB - 0.4, y + 0.05, y + 2.75, { mull: 2.1, rooms: 2 });
    if (k === n - 1) slats(d, 'street', zF + BAL + 0.34, -LB + 0.3, LB - 0.3, y, top, { pitch: 0.26, w: 0.13 });
    else guard(d, 'street', zF + BAL + 0.34, -LB + 0.3, LB - 0.3, y, 1.05, 2.0);
  }

  // ------------------------------------------------------------------------------------------------ the ground floor, the lobby, the porte-cochère
  for (const sx of [-1, 1]) for (const f of [8, 12, 16]) d.box(d.plain, 0.5, yF(1) - 0.25 - Y0, 0.45, sx * f, Y0, zF + 0.2, p.stone);   // travertine pilasters on the grid
  const left = -sg, rite = sg;                                                         // the restaurant on one side, the spa and the staff door on the gate's
  { const u = span(left, LB, X); pane(d, 'street', zF + 0.25, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { mull: 2.0, rooms: 4, glow: 'lit' }); }
  { const u = span(rite, LB, 8); pane(d, 'street', zF + 0.25, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { mull: 2.0, rooms: 1 }); slats(d, 'street', zF + 0.5, u.u0 + 0.3, u.u1 - 0.3, Y0 + 0.25, Y0 + 2.95, { pitch: 0.24, w: 0.11 }); }
  door(d, { face: 'street', x: rite * 14.2, z: zF + 0.45, w: 1.2, h: 2.4, portal: false });
  rec.doors.push({ kind: 'staff', face: 'street', x: rite * 14.2, z: zF + 0.45 }, { kind: 'lobby', face: 'street', x: 0, z: zF });
  // the lobby: a double-height pane in the stone portal (two piers rising to the roof, a lintel), the doors, a transom, the name on the lintel
  for (const sx of [-1, 1]) {
    d.box(d.plain, 0.75, yRoof - Y0, BAL + 0.1, sx * (LB + 0.05), Y0, zF + BAL / 2 + 0.05, p.stone);
    d.solid(sx * (LB + 0.05) - 0.375, zF, sx * (LB + 0.05) + 0.375, zF + BAL + 0.15, yRoof);
    if (!lite) strips(d, 'street', zF + BAL + 0.1, sx * (LB + 0.05) - 0.34, sx * (LB + 0.05) + 0.34, Y0, yF(2), 0.9, p.stoneDark, 0.03);
  }
  for (const sx of [-1, 1]) { uplight(d, sx * (LB + 0.05), zF + BAL + 0.05, 'street', 0.5); }
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
    pendants(d, 'street', zF + 0.04, -lw + 0.8, lw - 0.8, yF(2) - 1.85, 5, 0.5); pendants(d, 'street', zF + 0.04, -lw + 1.0, lw - 1.0, Y0 + 3.05, 4, 0.45);
    rec.board = { x: 0, z: z1 + 0.09, y: y - 0.28 };
    nameBoard(d, s.name ?? 'HÔTEL', { x: 0, z: z1 + 0.09, y: y - 0.28, w: 7.6, h: 0.62, bg: '#' + p.board.toString(16).padStart(6, '0'), fg: '#f4e6bd' });
    for (const sx of [-1, 1]) { d.box(d.plain, 0.26, y - 0.26 - Y0, 0.26, sx * 5.25, Y0, z1 - 0.5, p.stone); d.solid(sx * 5.25 - 0.13, z1 - 0.63, sx * 5.25 + 0.13, z1 - 0.37, 4.6); }
    litBar(d, -4.6, 4.6, z1 - 0.4, y - 0.29, { d: 0.12 }); if (!lite) litBar(d, -4.6, 4.6, (z0 + z1) / 2, y - 0.29, { d: 0.12 });
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
  const crown = { lx: 5.2, z0: -5.0, z1: 0.6, h: 3.0 };
  { // the crown: a lounge of glass under a deep white blade on two posts, its terrace in front
    const { lx, z0, z1, h } = crown, yT = yD + h + 0.35;
    d.box(d.plain, 2 * lx, h, z1 - z0, 0, yD, (z0 + z1) / 2, p.render);
    pane(d, 'street', z1, -lx + 0.5, lx - 0.5, yD + 0.15, yD + h - 0.25, { mull: 1.7, sky: 0.6, rooms: 3, glow: 'lit' });
    for (const sx of [-1, 1]) slats(d, faceOf(sx), sx * lx, z0 + 0.8, z1 - 0.8, yD + 0.2, yD + h - 0.2, { pitch: 0.24, w: 0.12 });
    d.slab(d.plain, 2 * lx + 1.6, 0.28, z1 - z0 + 3.1, 0, yT - 0.14, (z0 - 0.6 + 3.1) / 2, p.slab);
    d.box(d.plain, 2 * lx + 1.62, 0.07, 0.06, 0, yT - 0.35, 3.1, p.frame);
    litBar(d, -lx - 0.2, lx + 0.2, 2.85, yT - 0.31, { d: 0.12 });
    for (const sx of [-1, 1]) d.box(d.plain, 0.16, h + 0.35, 0.16, sx * (lx + 0.5), yD, 2.85, p.frame);
    d.flat(d.plain, 2 * lx + 0.6, 2.6, 0, yD + 0.03, 1.9, mix(p.wood, p.stone, 0.3));
    for (const x of [-2.6, 2.6]) { table(d, x, yD + 0.03, 1.9); }
    d.solid(-lx - 0.2, z0 - 0.2, lx + 0.2, z1, yD + h + 0.5);
  }
  // the rooftop restaurant's name up on the crown's roof, where the street and the distance see it (round 4: « put it on top since it's a rooftop and make it visible from the street and far »):
  // a long board over the street, one face each way (the sea road in front, the avenue behind), and a blade across each end of the roof, read from along the street. The venue
  // (src/venues/rooftop.ts) paints and lights the faces (one mesh, the one it always had); what is drawn here is the gantry: the boards' bodies, their posts, a lit edge and a lit top.
  const rooftopSign: RoofPanel[] = [];
  { const yT = yD + crown.h + 0.35, y0 = yT + 1.15, bh = 3.2, fw = 14.2, bw = 5.4, zS = 2.6, yc = y0 + bh / 2, fr = p.frame;
    d.slab(d.plain, fw + 0.3, bh, 0.16, 0, yc, zS - 0.1, fr);                                                                                  // the front board's body (a frame round the faces)
    for (const x of [-6.2, 0, 6.2]) d.box(d.metal, 0.22, y0 - yT, 0.22, x, yT, zS - 0.1, fr);                                                  // its three posts, off the crown's roof
    litBar(d, -fw / 2, fw / 2, zS + 0.1, y0 - 0.06, { d: 0.1, h: 0.06 });                                                                      // the edge under it, lit
    litBar(d, -fw / 2, fw / 2, zS + 0.02, y0 + bh + 0.1, { d: 0.12, h: 0.12, col: 0xffe2a8 });                                                  // and a lit bar along its top
    // a blade at each end of the roof, standing on the slab's overhang above the end walls: from the avenue and the cross street at the hotel's sides (a board over the crown is
    // hidden there by the hotel's own end wall) as from along the sea road, the blade is the one that faces the viewer
    const xb = X + 0.7, zb = -2.0, yb = yD + 2.3, ybc = yb + bh / 2;
    for (const sx of [-1, 1]) {
      d.slab(d.plain, 0.16, bh, bw + 0.3, sx * xb, ybc, zb, fr);                                                                              // its body,
      for (const z of [zb - 2.0, zb + 2.0]) d.box(d.metal, 0.2, yb - yD, 0.2, sx * xb, yD, z, fr);                                              // its two posts, off the roof,
      d.box(d.bulbs, 0.1, 0.06, bw, sx * (xb + 0.1), yb - 0.06, zb, 0xfff1c8);                                                                    // the lit edge under it
    }
    const pf = { y: yc, h: bh - 0.18 }, pb = { y: ybc, h: bh - 0.18 };
    rooftopSign.push({ ...pf, x: 0, z: zS + 0.01, w: fw - 0.16, yaw: 0, kind: 'front' }, { ...pf, x: 0, z: zS - 0.21, w: fw - 0.16, yaw: Math.PI, kind: 'front' },
      { ...pb, x: xb + 0.11, z: zb, w: bw - 0.16, yaw: Math.PI / 2, kind: 'blade' }, { ...pb, x: -(xb + 0.11), z: zb, w: bw - 0.16, yaw: -Math.PI / 2, kind: 'blade' });
  }
  { const hx0 = Math.min(rite * 14.6, rite * 19.2), hx1 = Math.max(rite * 14.6, rite * 19.2);                                   // the stair head, in render with an oak panel
    d.box(d.plain, hx1 - hx0, 3.2, 4.0, (hx0 + hx1) / 2, yD, -6.2, p.render); d.slab(d.plain, hx1 - hx0 + 0.6, 0.18, 4.6, (hx0 + hx1) / 2, yD + 3.3, -6.2, p.slab);
    slats(d, 'street', -4.2, hx0 + 0.5, hx1 - 0.5, yD + 0.2, yD + 3.0, { pitch: 0.3, w: 0.14 });
    for (let k = 0; k < (lite ? 2 : 3); k++) lounger(d, rite * (8.4 + k * 1.7), yD + 0.02, 1.2, 0, p.wood);
    if (!lite) parasol(d, rite * 9.2, yD + 0.02, -0.6, 0xefe8da, 1.35);
    planter(d, rite * 12.5, zF + BAL + 0.05, 4.4, 0.55, { h: 0.45 });
  }
  roofPlant(d, { x0: Math.min(rite * 7, rite * 14.2), x1: Math.max(rite * 7, rite * 14.2), z0: -8.0, z1: -4.2 }, yD, { units: 2 });

  // ------------------------------------------------------------------------------------------------ the back: a corridor behind oak screens, the glazed stair core, the service door
  { const at = zB, mod = 4.2, x0 = -9 * mod / 2;
    for (let k = 1; k < n; k++) { pane(d, 'back', at, -X + 0.7, X - 0.7, yF(k) + 0.55, yF(k) + 2.55, { mull: mod, rooms: 9 }); }
    for (let m = 0; m < 9; m += 2) {
      if (Math.abs((m + 0.5) * mod + x0 - rite * 12.6) < 3.0) continue;               // the core stands here
      slats(d, 'back', at - 0.28, x0 + m * mod + 0.2, x0 + (m + 1) * mod - 0.2, yF(1) + 0.1, yRoof - 0.25, { pitch: 0.4, w: 0.18 });
    }
    const cx0 = Math.min(rite * 10.4, rite * 14.8), cx1 = Math.max(rite * 10.4, rite * 14.8), cz = zB - 1.5;                // the stair core
    d.box(d.plain, cx1 - cx0, yRoof + 3.2 - Y0, 1.5, (cx0 + cx1) / 2, Y0, zB - 0.75, p.render);
    d.slab(d.plain, cx1 - cx0 + 0.5, 0.2, 1.9, (cx0 + cx1) / 2, yRoof + 3.3, zB - 0.85, p.slab);
    pane(d, 'back', cz, cx0 + 0.45, cx1 - 0.45, yF(1) + 0.25, yRoof + 2.9, { sky: 0.6, head: false, glow: 'lit' });
    quads(d, d.plain, 'back', cz - 0.06, Array.from({ length: n }, (_, k) => ({ u0: cx0 + 0.45, u1: cx1 - 0.45, y0: yF(k + 1) - 0.12, y1: yF(k + 1) + 0.03, c: p.frame })));
    solidBox(d, { x0: cx0, x1: cx1, z0: cz, z1: zB }, yRoof + 3.3);
    door(d, { face: 'back', x: (cx0 + cx1) / 2, z: cz, w: 1.3, h: 2.3, portal: false, steps: false });
    rec.doors.push({ kind: 'service', face: 'back', x: (cx0 + cx1) / 2, z: cz });
    d.slab(d.plain, 3.0, 0.16, 0.7, (cx0 + cx1) / 2, Y0 + 2.9, cz - 0.35, p.slab);                                         // a little canopy over the service door
    for (let k = 0; k < 3; k++) d.blob(d.leaves, 0.5, -X + 2 + k * 5.5, Y0 + 0.4, zB - 1.1, k % 2 ? d.c.hedge : d.c.hedge2, 0.8, 0);
  }

  // ------------------------------------------------------------------------------------------------ the forecourt: open to the pavement, the café's terrace on one side of the way in
  const lane = { x0: -4, z0: 6.0, x1: 4, z1: E - 0.3 };
  paving(d, { x0: -ex, x1: ex, z0: zF + BAL + 0.05, z1: E - 0.3 }, 0xe3d9c3);
  paving(d, lane, 0x6d7075, Y0 + 0.02);                                                                                       // the drop-off lane runs through the opening to the kerb
  rec.dropoff = lane; rec.entry = { x: 0, w: 8 };
  for (let z = 6.5; z < E - 0.6; z += 1.0) paving(d, { x0: -0.07, x1: 0.07, z0: z, z1: z + 0.5 }, 0xf1efe8, Y0 + 0.03);
  paving(d, { x0: -3.9, x1: 3.9, z0: 6.0, z1: 6.15 }, 0xf1efe8, Y0 + 0.03);
  paving(d, { x0: -1.2, x1: 1.2, z0: zF + BAL + 0.1, z1: 6.0 }, p.accent, Y0 + 0.03);                                         // the carpet from the door
  { const u = span(left, 6.4, 19.4), t = terrace(d, { x0: u.u0, x1: u.u1, z0: zF + BAL + 0.3, z1: 9.9, rows: [{ z: 6.1, per: 4 }, { z: 8.5, per: 2 }], deck: mix(p.wood, p.stone, 0.4) });
    rec.terraces.push(t); life.seats.push(...t.seats);
    stringLights(d, left * 6.6, left * 19.6, 7.3, 3.2);
    planter(d, left * 20.2, zF + BAL + 0.75, 2.2, 0.6, { bloom: 0xd94a8c });
    menuBoard(d, left * 6.1, 10.2, 0); rec.props.push({ kind: 'menu', x: left * 6.1, z: 10.2 });
    // three customers already at their tables (row 1: the chairs on the street side of two tables, row 2: one), the waiter in the aisle between the rows, facing them
    const sit = (i: number) => life.people.push(person(t.seats[i].x, t.seats[i].z, t.seats[i].yaw, 'Sit'));
    sit(0); sit(4); sit(8);
    life.people.push(person((t.seats[2].x + t.seats[4].x) / 2, 7.3, Math.PI, 'Talk', STAFF.waiter));         // (between the second and third tables: the second row's tables stand under the first's gaps)
  }
  // the lobby's staff: a doorman on the lobby's step, a bellhop beside him with his trolley of bags, a valet by the drop-off lane (outside it), both turned to the street
  life.people.push(person(-2.1, 3.7, 0, 'Idle', STAFF.doorman), person(1.9, 3.7, 0, 'Idle', STAFF.bellhop));
  trolley(d, 3.0, 3.75, 0); rec.props.push({ kind: 'trolley', x: 3.0, z: 3.75 });
  life.people.push(person(rite * 5.4, 8.3, -rite * Math.PI / 2, 'Idle', STAFF.valet));
  // a parked car beside the lane (parallel, in the gate's half of the forecourt), two scooters by the staff door
  parkedCar(d, rite * 14.6, 8.6, Math.PI / 2, { col: mix(p.accent, 0xdddddd, 0.55) }); rec.props.push({ kind: 'car', x: rite * 14.6, z: 8.6 });
  for (const [x, c] of [[17.1, 0xc23b2a], [18.0, 0x2b5f8a]] as const) { scooter(d, rite * x, 4.9, 0, c); rec.props.push({ kind: 'scooter', x: rite * x, z: 4.9 }); }
  // the rooftop restaurant's stair door (the venue draws the door, the sign); its doorman stands by it
  life.people.push(person(rite * 11.0, 3.95, 0, 'Idle', STAFF.doorman));
  planter(d, rite * 7.6, zF + BAL + 1.3, 3.0, 0.8, { bloom: 0xd94a8c });
  for (const x of [-4.8, 4.8]) bollard(d, x, 6.6);
  slimPalm(d, left * 21.0, 9.3, 0.95, 1.2); slimPalm(d, rite * 11.0, 7.0, 1.0, 0.9);
  for (const [k, c] of [mix(p.accent, 0xffffff, 0.4), 0xf4f1ea].entries()) flagPole(d, (k ? 1 : -1) * 5.6, E - 1.0, 7.6, c, 1);
  // the road-side flanks (the cross roads run along both ends): a lawn and shrubs under the stone end walls, a bench facing the road, a lamp, the stair's glass down to the pavement
  for (const sx of [-1, 1]) {
    d.flat(d.plain, 1.7, zF + BAL + 0.1 - zB, sx * 21.55, Y0 + 0.02, (zB + zF + BAL + 0.1) / 2, d.c.lawn);
    for (let k = 0; k < (lite ? 2 : 3); k++) d.blob(d.leaves, 0.5, sx * 21.6, Y0 + 0.4, -6.2 + k * 4.6, k % 2 ? d.c.hedge : d.c.hedge2, 0.85, 0);
    life.seats.push(...bench(d, sx * 21.7, -3.0, sx * Math.PI / 2, { len: 1.8, n: 2 })); rec.props.push({ kind: 'bench', x: sx * 21.7, z: -3.0 });
    bollard(d, sx * 21.7, 3.4);
    rec.flanks.push({ side: sx as -1 | 1, what: 'planting' });
  }
  // the stair door of the rooftop restaurant (the Terrasse de Ngor, src/venues/rooftop.ts) on the street face (its name is up on the roof: the sign above), in the first bay beyond the lobby's portal, between the pilasters at 8 and 12 (the gate's side), under the balconies: seen from the avenue, a few strides from the way in
  return { keepClear: [{ ...d.f.rect(-4.6, zF + BAL, 4.6, E + 3.2), why: `hotel_dropoff:${s.id}` }], rooftopDoor: { x: rite * 10.0, z: zF + 1.1 }, rooftopSign: { panels: rooftopSign }, life };
}
