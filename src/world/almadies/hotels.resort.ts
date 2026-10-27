import { E, type SiteDraw, type SiteResult } from './contract';
import { gateX, nameBoard, paving, perimeter, planter, roofPlant, siteRng, slabEdge, solidBox, volume } from './parts';
import { ST, Y0, clamp, courses, flagPole, glassRail, cells, guard, info, lit, litBar, lounger, mix, pane, parasol, pool, quads, slats, slimPalm, table } from './hotels.kit';

/**
 * LD2.0-E lane E-H, the resort (46 × 46 m, the whole block, 3 to 7 storeys): a U of two long wings round a pool court that opens toward the back (the
 * sea road), the wings stepping down toward the sea (5, 4, then 3 storeys) so each step is a planted terrace, their court sides a stack of deep glass
 * balconies, their outer sides oak panels and ribbons of glass. At the street a wide glass lobby pavilion under a huge lit canopy (the name on its fascia)
 * between two low flanks that step back in terraces. In the court: the long pool, a plunge pool, loungers and parasols, palms, a pergola bar by the
 * lobby and a beach-club pergola at the sea end, seen over a low wall from the coast road.
 */
export function buildResort(d: SiteDraw): SiteResult {
  const { site: s, p } = d, lite = d.lite, rec = info(d);
  const n = clamp(s.storeys, 3, 5);
  const gx = gateX(d.w, s.gate), sg: 1 | -1 = gx < 0 ? -1 : 1, left = -sg, rite = sg;
  rec.serviceSide = sg;
  const WX = 21.5, CX = 10.5, BAL = 1.8, FZ0 = -4, FZ1 = 4.5, ZB = -32, ex = d.w / 2;
  const yF = (k: number) => Y0 + k * ST;
  const courtFace = (sx: number) => sx < 0 ? 'right' as const : 'left' as const, outerFace = (sx: number) => sx < 0 ? 'left' as const : 'right' as const;
  const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
  const rng = siteRng(d, 'lit');
  perimeter(d, { gate: s.gate, front: 'low', h: 1.6 });

  // ------------------------------------------------------------------------------------------------ the wings: three segments stepping down toward the sea
  const segs = [{ z0: -14, z1: FZ0, m: n }, { z0: -23, z1: -14, m: Math.max(2, n - 1) }, { z0: ZB, z1: -23, m: Math.max(2, n - 2) }];
  const pl = (sx: number, z0: number, z1: number) => ({ x0: Math.min(sx * CX, sx * WX), x1: Math.max(sx * CX, sx * WX), z0, z1 });
  for (const sx of [-1, 1]) {
    segs.forEach((g, si) => {
      const r = pl(sx, g.z0, g.z1), yTop = yF(g.m), len = g.z1 - g.z0, zc = (g.z0 + g.z1) / 2, next = segs[si - 1];
      volume(d, r, Y0, yF(1) - 0.25, p.stone);
      volume(d, r, yF(1) - 0.25, yTop, p.render);
      for (let k = 1; k < g.m; k++) slabEdge(d, r, yF(k), 0.25, 0.2);
      slabEdge(d, r, yTop + 0.1, 0.3, 0.45);
      solidBox(d, r, yTop + 0.5);
      // the court side: a stack of deep glass balconies between partitions, the ground floor's glass opening on the deck
      const cf = courtFace(sx), cx = sx * CX, gz0 = g.z0 + 0.5, gz1 = g.z1 - 0.5;
      pane(d, cf, cx, gz0, gz1, Y0 + 0.2, yF(1) - 0.5, { mull: 3.1, sky: 0.5 });
      for (let k = 1; k < g.m; k++) {
        const y = yF(k);
        rec.balconies.push({ floor: k, u0: g.z0, u1: g.z1, face: cf, kind: 'glass' });
        d.slab(d.plain, BAL, 0.25, len + 0.4, sx * (CX - BAL / 2), y - 0.125, zc, p.slab);
        pane(d, cf, cx, gz0, gz1, y + 0.05, y + 2.7, { mull: 3.1 });
        lit(d, cf, cx, cells(gz0, gz1, Math.round(len / 3.1)), y + 0.05, y + 2.7, rng, 0.45);
        guard(d, cf, sx * (CX - BAL) , gz0 - 0.2, gz1 + 0.2, y, 1.05, 3.1);
      }
      const nfin = Math.max(1, Math.round(len / 3.1));
      for (let i = 0; i <= nfin; i++) {
        const z = g.z0 + (len * i) / nfin;
        d.box(d.plain, BAL, yTop - yF(1) + 0.25, 0.2, sx * (CX - BAL / 2), yF(1) - 0.25, Math.min(g.z1 - 0.1, Math.max(g.z0 + 0.1, z)), i % 2 ? p.slab : p.render2);
      }
      // the outer side: oak panels over ribbons of glass
      const of = outerFace(sx), ox = sx * WX;
      for (let k = 1; k < g.m; k++) { pane(d, of, ox, gz0, gz1, yF(k) + 0.6, yF(k) + 2.5, { mull: 3.1, head: true }); lit(d, of, ox, cells(gz0, gz1, Math.round(len / 3.1)), yF(k) + 0.6, yF(k) + 2.5, rng, 0.4); }
      courses(d, of, ox, g.z0, g.z1, Y0, yF(1) - 0.25, 0.85, p.stoneDark);
      for (let i = 0; i < Math.round(len / 9); i++) slats(d, of, ox, g.z0 + 1.5 + i * 9, g.z0 + 4.5 + i * 9, yF(1) + 0.3, yTop - 0.3, { pitch: 0.26, w: 0.13 });
      if (si === 0) {                                                                                                    // the wing's front, above the flank's third storey
        const fx = (r.x0 + r.x1) / 2;
        for (let k = 3; k < g.m; k++) {
          pane(d, 'street', g.z1, r.x0 + 0.7, r.x1 - 0.7, yF(k) + 0.15, yF(k) + 2.7, { mull: 2.2, sky: 0.55 });
          slats(d, 'street', g.z1, sx > 0 ? r.x1 - 2.4 : r.x0 + 0.6, sx > 0 ? r.x1 - 0.6 : r.x0 + 2.4, yF(k) + 0.15, yF(k) + 2.7, { pitch: 0.24, w: 0.12 });
        }
        d.flat(d.plain, r.x1 - r.x0 - 0.2, 5.2, fx, yF(3) + 0.1 + 0.015, FZ0 + 2.7, mix(p.stone, p.slab, 0.4));              // the flank's roof is this floor's terrace
        guard(d, 'street', FZ1 - 3.2 + 0.45, r.x0 + 0.2, r.x1 - 0.2, yF(3) + 0.1, 1.05, 2.2);
        for (let k = 0; k < (lite ? 1 : 2); k++) lounger(d, fx + (k ? 1.6 : -1.6) * (sx > 0 ? 1 : -1), yF(3) + 0.12, FZ0 + 3.0, 0, p.wood);
        planter(d, fx, FZ1 - 3.2 - 0.0, 3.6, 0.5, { h: 0.45 });
        roofPlant(d, { x0: r.x0 + 0.6, x1: r.x1 - 0.6, z0: g.z0 + 0.8, z1: g.z1 - 0.8 }, yTop + 0.1, { units: 1, panels: !lite });
      }
      // a terrace on the roof of the segment, planted, in front of the next, taller one
      if (next) {
        const yT = yTop + 0.1 + 0.015, gz = g.z1, rx = (r.x0 + r.x1) / 2;
        d.flat(d.plain, r.x1 - r.x0 - 0.4, len - 0.6, rx, yT, zc, mix(p.stone, p.slab, 0.4));
        d.flat(d.plain, r.x1 - r.x0 - 2.4, 2.2, rx, yT + 0.01, g.z0 + 2.0, d.c.lawn);
        for (let k = 0; k < 3; k++) d.blob(d.leaves, 0.5, rx - 3 + k * 3, yT + 0.45, g.z0 + 2.0, k % 2 ? d.c.hedge : d.c.hedge2, 0.85, 0);
        for (let k = 0; k < (lite ? 1 : 2); k++) lounger(d, rx + (k ? 1.5 : -1.5), yT + 0.02, gz - 2.4, 0, p.wood);
        guard(d, cf, cx, g.z0 + 0.3, g.z1 - 0.3, yTop + 0.1, 1.05, 3.1);
        // the taller segment's rear wall above this roof: ribbons and an oak panel
        for (let k = g.m; k < next.m; k++) pane(d, 'back', gz, r.x0 + 1, r.x1 - 1, yF(k) + 0.6, yF(k) + 2.5, { mull: 3.5 });
        void gz;
      } else {
        glassRail(d, { x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: r.z0 + 0.1, z1: r.z1 - 0.1 }, yTop + 0.1, 1.0);
      }
    });
  }
  // the sea ends of the wings: a double-height glazed lounge, an oak screen, a roof garden
  for (const sx of [-1, 1]) {
    const g = segs[2], r = pl(sx, g.z0, g.z1), yTop = yF(g.m), x0 = r.x0 + 0.8, x1 = r.x1 - 0.8;
    pane(d, 'back', g.z0, x0, x1, Y0 + 0.2, yF(2) - 0.5, { mull: 1.8, sky: 0.6 });
    for (let k = 2; k < g.m; k++) { pane(d, 'back', g.z0, x0 + 3.2, x1 - 3.2, yF(k) + 0.1, yF(k) + 2.7, { mull: 2.0 }); slats(d, 'back', g.z0, x0, x0 + 2.8, yF(k) + 0.1, yF(k) + 2.7, { pitch: 0.25, w: 0.12 }); slats(d, 'back', g.z0, x1 - 2.8, x1, yF(k) + 0.1, yF(k) + 2.7, { pitch: 0.25, w: 0.12 }); }
    const rx = (r.x0 + r.x1) / 2;
    d.slab(d.plain, r.x1 - r.x0 + 1.2, 0.25, 2.0, rx, yF(1) - 0.12, g.z0 - 1.0 + 0.0, p.slab);                                                       // a deep first-floor terrace over the lounge
    guard(d, 'back', g.z0 - 1.95, r.x0 - 0.5, r.x1 + 0.5, yF(1), 1.05, 3.0);
    d.flat(d.plain, r.x1 - r.x0 - 0.4, r.z1 - r.z0 - 0.6, rx, yTop + 0.125, (r.z0 + r.z1) / 2, d.c.lawn);                                           // the roof, a garden
    for (let k = 0; k < 4; k++) d.blob(d.leaves, 0.55, rx - 3.6 + k * 2.4, yTop + 0.5, g.z0 + 1.0, k % 2 ? d.c.hedge : d.c.hedge2, 0.85, 0);
  }

  // ------------------------------------------------------------------------------------------------ the front: two flanks stepping back, a lobby pavilion under a vast canopy
  for (const sx of [-1, 1]) {
    const r = { x0: Math.min(sx * 8.5, sx * WX), x1: Math.max(sx * 8.5, sx * WX), z0: FZ0, z1: FZ1 }, rx = (r.x0 + r.x1) / 2, yTop = yF(2);
    volume(d, r, Y0, yF(1) - 0.25, p.stone);
    volume(d, r, yF(1) - 0.25, yTop, p.render);
    slabEdge(d, r, yF(1), 0.25, 0.2);
    slabEdge(d, { ...r, z1: FZ1 + BAL }, yTop + 0.1, 0.3, 0.2);                                                   // the first floor's roof terrace reaches over the balcony
    solidBox(d, r, yTop + 0.4);
    pane(d, 'street', FZ1, r.x0 + 0.4, r.x1 - 0.4, Y0 + 0.2, yF(1) - 0.5, { mull: 2.2 });
    rec.balconies.push({ floor: 1, u0: r.x0, u1: r.x1, face: 'street', kind: 'glass' });
    d.slab(d.plain, r.x1 - r.x0 + 0.2, 0.25, BAL, rx, yF(1) - 0.125, FZ1 + BAL / 2, p.slab);
    pane(d, 'street', FZ1, r.x0 + 0.4, r.x1 - 0.4, yF(1) + 0.05, yF(1) + 2.7, { mull: 2.2 });
    lit(d, 'street', FZ1, cells(r.x0 + 0.4, r.x1 - 0.4, 3), yF(1) + 0.05, yF(1) + 2.7, rng, 0.6);
    guard(d, 'street', FZ1 + BAL - 0.05, r.x0 + 0.2, r.x1 - 0.2, yF(1), 1.05, 2.2);
    for (let i = 0; i <= 4; i++) d.box(d.plain, 0.2, yTop - yF(1) + 0.25, BAL, r.x0 + 0.1 + ((r.x1 - r.x0 - 0.2) * i) / 4, yF(1) - 0.25, FZ1 + BAL / 2, i % 2 ? p.slab : p.render2);
    // the third storey set back, a terrace in front of it
    const f3 = { x0: r.x0, x1: r.x1, z0: FZ0, z1: FZ1 - 3.2 };
    volume(d, f3, yTop + 0.1, yF(3), p.render); slabEdge(d, f3, yF(3) + 0.1, 0.3, 0.5);
    pane(d, 'street', f3.z1, f3.x0 + 0.5, f3.x1 - 0.5, yTop + 0.2, yTop + 2.9, { mull: 2.2, sky: 0.6 });
    solidBox(d, f3, yF(3) + 0.4);
    glassRail(d, { x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: FZ1 - 3.0, z1: FZ1 + BAL + 0.1 }, yTop + 0.1, 1.05);
    for (let k = 0; k < (lite ? 2 : 3); k++) planter(d, rx - 4 + k * 4, FZ1 + BAL - 0.3, 3.0, 0.5, { h: 0.45, bloom: k === 1 ? 0xd94a8c : undefined });
    for (let k = 0; k < (lite ? 1 : 2); k++) lounger(d, rx + (k ? 3 : -3), yTop + 0.13, FZ1 - 1.4, 0);
    d.flat(d.plain, r.x1 - r.x0 - 0.4, 3.0, rx, yTop + 0.125, FZ1 - 1.6, mix(p.stone, p.slab, 0.4));
    courses(d, 'street', FZ1, r.x0, r.x1, Y0, yF(1) - 0.25, 0.85, p.stoneDark);
  }
  // the lobby: a glass box two storeys high between stone piers, the canopy its roof
  { const lx = 8.5, yC = yF(2), zL = 6.8, zC = 10.0;
    volume(d, { x0: -lx, x1: lx, z0: FZ0, z1: FZ1 }, Y0, yC - 0.3, p.render2);
    pane(d, 'street', zL, -lx + 0.3, lx - 0.3, Y0 + 0.15, yC - 0.45, { mull: 1.9, sky: 0.65 });
    quads(d, d.plain, 'street', zL + 0.07, [{ u0: -lx + 0.3, u1: lx - 0.3, y0: Y0 + 3.5, y1: Y0 + 3.6, c: p.frame }]);
    quads(d, d.plain, 'street', zL + 0.07, [-1, 1].flatMap(sx => [{ u0: Math.min(sx * 0.03, sx * 1.6), u1: Math.max(sx * 0.03, sx * 1.6), y0: Y0 + 0.15, y1: Y0 + 2.6, c: mix(p.glass, 0x6a5238, 0.45) }, { u0: Math.min(sx * 0.18, sx * 0.24), u1: Math.max(sx * 0.18, sx * 0.24), y0: Y0 + 0.9, y1: Y0 + 1.7, c: 0xc9a14b }]));
    d.box(d.plain, 17.0, yC - Y0 - 0.3, zL - FZ1 + 0.1, 0, Y0, (zL + FZ1) / 2 - 0.05, p.render2);                    // the hall behind the glass
    // and on the court: the hall's glass wall under the canopy's edge, its doors to the deck between two stone piers
    pane(d, 'back', FZ0, -lx + 0.7, lx - 0.7, Y0 + 0.15, yC - 0.5, { mull: 1.9, sky: 0.55 });
    quads(d, d.plain, 'back', FZ0 - 0.06, [{ u0: -lx + 0.7, u1: lx - 0.7, y0: Y0 + 3.5, y1: Y0 + 3.6, c: p.frame }, { u0: -1.6, u1: 1.6, y0: Y0 + 0.15, y1: Y0 + 2.6, c: mix(p.glass, 0x6a5238, 0.45) }, { u0: -0.03, u1: 0.03, y0: Y0 + 0.15, y1: Y0 + 2.6, c: p.frame }]);
    rec.doors.push({ kind: 'service', face: 'back', x: 0, z: FZ0 });
    for (const sx of [-1, 1]) d.box(d.plain, 0.9, yC - Y0 - 0.3, 0.5, sx * (lx - 0.35), Y0, FZ0 - 0.25, p.stone);
    for (const sx of [-1, 1]) { d.box(d.plain, 0.8, yC - Y0 - 0.3, 0.7, sx * lx, Y0, zL, p.stone); d.solid(sx * lx - 0.4, zL - 0.35, sx * lx + 0.4, zL + 0.35, yC); }
    d.box(d.plain, 4.2, 0.12, 2.4, 0, Y0, zL + 1.2, p.stone);                                                         // the steps
    solidBox(d, { x0: -lx, x1: lx, z0: FZ0, z1: zL - 0.1 }, yC + 0.3);
    // the canopy: a vast thin blade level with the flanks' floor, on four slim posts, lit underneath; the name on its fascia
    d.slab(d.plain, 2 * 13.0, 0.3, zC - FZ0, 0, yC - 0.15, (zC + FZ0) / 2, p.slab);
    d.box(d.plain, 2 * 13.0 + 0.02, 1.0, 0.1, 0, yC - 1.1, zC + 0.02, p.board);
    rec.board = { x: 0, z: zC + 0.09, y: yC - 0.62 };
    rec.doors.push({ kind: 'lobby', face: 'street', x: 0, z: zL });
    nameBoard(d, s.name ?? 'HÔTEL', { x: 0, z: zC + 0.09, y: yC - 0.62, w: 11.0, h: 0.8, bg: hex(p.board), fg: '#f4e6bd' });
    for (const x of [-12.2, -4.1, 4.1, 12.2]) { d.box(d.plain, 0.26, yC - 0.3 - Y0, 0.26, x, Y0, zC - 0.6, p.stone); d.solid(x - 0.13, zC - 0.73, x + 0.13, zC - 0.47, yC); }
    litBar(d, -11.5, 11.5, zC - 0.6, yC - 0.33, { d: 0.12 }); if (!lite) { litBar(d, -11.5, 11.5, 8.4, yC - 0.33, { d: 0.12 }); litBar(d, -11.5, 11.5, 6.0, yC - 0.33, { d: 0.12 }); }
    // the sky terrace on the canopy's roof: lawn and planters behind a glass rail
    glassRail(d, { x0: -12.9, x1: 12.9, z0: FZ1 + BAL - 0.3, z1: zC - 0.1 }, yC, 1.05);
    d.flat(d.plain, 24.6, zC - 0.5 - (FZ1 + BAL), 0, yC + 0.015, (zC - 0.5 + FZ1 + BAL) / 2, d.c.lawn);
    for (let k = 0; k < (lite ? 3 : 6); k++) planter(d, -10 + k * (lite ? 10 : 4), zC - 0.8, 2.6, 0.5, { h: 0.45 });
  }

  // ------------------------------------------------------------------------------------------------ the court: the pool, its deck, the bar and the beach club
  { const cz = (FZ0 + ZB) / 2, deck = mix(p.wood, p.slab, 0.45), zD1 = FZ0, zD0 = -34.5;
    d.flat(d.plain, 2 * CX - 0.2, zD1 - zD0, 0, Y0 + 0.02, (zD0 + zD1) / 2, deck);
    d.flat(d.plain, 2 * CX - 0.2, 4.4, 0, Y0 + 0.03, zD1 - 2.2, mix(p.stone, p.slab, 0.3));                          // the terrace by the lobby's back
    pool(d, -5.2, -26.0, 5.2, -11.0, Y0, { rim: 0.4, h: 0.28, stone: p.slab, water: 0x2fa8d8, lit: 3 });
    d.flat(d.water, 4.8, 3.2, -2.6, Y0 + 0.31, -13.0 + 0.0, 0x6fd0e8);                                              // the sun shelf
    pool(d, 6.2, -17.0, 9.4, -13.8, Y0, { rim: 0.35, h: 0.3, stone: p.slab, water: 0x4fb8dc });                      // the plunge pool
    for (let z = -12.5; z > -25; z -= (lite ? 3.6 : 1.9)) { lounger(d, -6.9, Y0 + 0.02, z, 0); if (z > -22) lounger(d, 6.9, Y0 + 0.02, z, 0); }
    if (!lite) for (const [x, z] of [[-8.0, -15.5], [-8.0, -21.5], [8.0, -22], [7.6, -11.0]] as const) parasol(d, x, Y0 + 0.02, z, mix(p.accent, 0xffffff, 0.6), 1.4);
    for (let k = 0; k < 5; k++) paving(d, { x0: -0.8, x1: 0.8, z0: -7.3 - k * 0.9, z1: -7.0 - k * 0.9 }, 0xf4f1ea, Y0 + 0.035);   // stepping slabs from the lobby
    // the pool bar by the lobby: oak pergola over a counter and tables
    { const a = -8.4, b = 8.4, z0 = zD1 - 0.2 - 5.2, z1 = zD1 - 0.2, h = 2.8;
      for (const x of [a, 0, b]) d.box(d.plain, 0.18, h, 0.18, x, Y0, z0, p.frame);
      d.box(d.plain, b - a + 0.4, 0.22, 0.22, 0, Y0 + h, z0, p.frame); d.box(d.plain, b - a + 0.4, 0.22, 0.22, 0, Y0 + h, z1 - 0.1, p.frame);
      for (let k = 0; k <= (lite ? 5 : 9); k++) d.box(d.plain, 0.07, 0.07, z1 - z0 + 0.4, a + ((b - a) * k) / (lite ? 5 : 9), Y0 + h + 0.2, (z0 + z1) / 2, p.wood);
      d.box(d.plain, 5.0, 1.05, 0.7, left * 4.5, Y0, z0 + 0.8, p.stone); d.box(d.plain, 5.2, 0.06, 0.85, left * 4.5, Y0 + 1.05, z0 + 0.82, p.wood);
      for (let k = 0; k < (lite ? 2 : 4); k++) d.box(d.plain, 0.38, 0.68, 0.38, left * 4.5 - 1.8 + k * (lite ? 3.6 : 1.2), Y0, z0 + 1.9, p.accent);
      for (const x of [rite * 3.2, rite * 6.6]) { table(d, x, Y0 + 0.02, z0 + 2.6); }
      litBar(d, a + 0.6, b - 0.6, z0 + 0.3, Y0 + h - 0.02, { d: 0.1 });
    }
    // the beach club at the sea end: a pergola, daybeds, a bar, seen over the low wall
    { const a = -9.0, b = 9.0, z0 = -34.0, z1 = -28.6, h = 2.7;
      for (const x of [a, (a + b) / 2, b]) for (const z of [z0 + 0.2, z1]) d.box(d.plain, 0.18, h, 0.18, x, Y0, z, p.frame);
      for (const z of [z0 + 0.2, z1]) d.box(d.plain, b - a + 0.4, 0.22, 0.22, 0, Y0 + h, z, p.frame);
      for (const x of [a, (a + b) / 2, b]) d.box(d.plain, 0.2, 0.18, z1 - z0, x, Y0 + h + 0.02, (z0 + z1) / 2, p.frame);
      for (let k = 0; k <= (lite ? 6 : 12); k++) d.box(d.plain, 0.08, 0.08, z1 - z0 + 0.5, a + ((b - a) * k) / (lite ? 6 : 12), Y0 + h + 0.2, (z0 + z1) / 2, p.wood);
      for (let k = 0; k < 3; k++) { d.box(d.plain, 2.0, 0.4, 2.0, a + 3 + k * 6, Y0 + 0.02, z0 + 2.3, p.wood); d.flat(d.plain, 1.8, 1.8, a + 3 + k * 6, Y0 + 0.43, z0 + 2.3, mix(p.accent, 0xffffff, 0.75)); }
      litBar(d, a + 0.6, b - 0.6, z1 - 0.3, Y0 + h - 0.02, { d: 0.1 });
      d.box(d.plain, 3.6, 1.05, 0.7, 0, Y0, z0 + 0.7, p.stone); d.box(d.plain, 3.8, 0.06, 0.85, 0, Y0 + 1.05, z0 + 0.72, p.wood);
    }
    for (const [x, z, sc] of [[-8.0, -9.5, 1.1], [8.0, -9.5, 1.0], [-8.2, -26.5, 1.0], [8.0, -27.0, 1.1], [-9.6, -31.0, 0.9]] as const) slimPalm(d, x, z, sc, x * 0.3);
    void cz;
  }

  // ------------------------------------------------------------------------------------------------ the forecourt
  paving(d, { x0: -ex, x1: ex, z0: FZ1 + BAL + 0.05, z1: E - 0.3 }, 0xe3d9c3);
  paving(d, { x0: -11.5, x1: 11.5, z0: 7.4, z1: 10.2 }, 0x6d7075, Y0 + 0.02);
  rec.dropoff = { x0: -11.5, z0: 7.4, x1: 11.5, z1: 10.2 };
  for (let x = -10.5; x < 10.6; x += 1.8) paving(d, { x0: x, x1: x + 0.9, z0: 8.78, z1: 8.92 }, 0xf1efe8, Y0 + 0.03);
  paving(d, { x0: -1.4, x1: 1.4, z0: 6.9, z1: 7.4 }, p.accent, Y0 + 0.03);
  slimPalm(d, -17.5, 8.4, 1.1, 0.3); slimPalm(d, -14.5, 6.6, 1.0, 1.0); slimPalm(d, 17.0, 6.8, 1.05, 0.7);
  planter(d, left * 16.5, 7.4, 4.2, 0.8, { bloom: 0xd94a8c }); planter(d, rite * 16.0, FZ1 + BAL + 0.9, 3.2, 0.8);
  for (let k = 0; k < 3; k++) flagPole(d, left * (20.2 - k * 1.3), E - 1.1, 7.8, k === 1 ? 0xf4f1ea : p.accent, 1);
  return { keepClear: [{ ...d.f.rect(-12.5, FZ1 + BAL, 12.5, E), why: `hotel_dropoff:${s.id}` }] };
}
