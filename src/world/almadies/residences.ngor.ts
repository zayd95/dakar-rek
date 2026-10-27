import { GROUND, STOREY, type SiteBuilder } from './contract';
import { door, nameBoard, palm, perimeter, planter, roofPlant, solidBox } from './parts';
import { GREEN, GUARD, kitOf, mix } from './residences.kit';

/**
 * LD2.0-E lane E-R: « Résidence de Ngor » (S, 22 × 22 m, 4 storeys): a luxury residence of a handful of flats in the flagship villa's style at the scale of
 * a small block. The car gate stays at the lot's centre on the street wall (the game's sale board, its door and its walking marker stand on the
 * pavement outside it: nothing of this design stands beyond the wall).
 *
 *  - behind the gate a planted courtyard (lawns in stripes, a stone path to the lobby, hedges, two palms) and the lobby: a stone-clad volume under
 *    the first floor's terrace, which cantilevers over the door as its canopy, with the residence's name on the terrace's solid parapet;
 *  - the main block in an ivory render over a travertine ground floor, thin white slabs cantilevered at every floor; each upper floor has its
 *    balcony (frameless glass guards) and its oak screen in another bay, so the oak and the glass alternate from one storey to the next;
 *  - the top floor set back behind its own terrace, an oak pergola over its street corner and a deep roof visor over the rest, as the villa's;
 *  - at the east end the stair tower behind a claustra of oak slats from the ground to above the roof, as the villa's.
 */
export const ngor: SiteBuilder = d => {
  const { site: s, p, lite } = d, k = kitOf(d), n = Math.max(3, s.storeys), H = STOREY, G = GROUND, L = (i: number) => G + i * H, roof = L(n), top = n - 1;
  const A = { x0: -9.0, x1: 5.4, z0: -9.6, z1: 2.6 }, T = { x0: 5.4, x1: 8.8, z0: -9.6, z1: 4.0 }, LB = { x0: -3.6, x1: 3.6, z0: A.z1, z1: 6.2 };
  const PH = { x0: A.x0, x1: A.x1, z0: A.z0, z1: 0.6 };                                  // the top floor, set back from the street
  const FZ = 4.5, tz = 8.0;                                                                // the terraces' front edge, and the canopy's over the lobby
  perimeter(d, { gate: s.gate, front: 'wall' });
  const m = k.plain, wood = mix(p.wood, 0x000000, 0.1);

  // ------------------------------------------------------------------------------------------------ the masses
  m.box(A.x0, G, A.z0, A.x1, L(1), A.z1, p.stone, 'TU');                                   // the ground floor in travertine
  m.box(A.x0, L(1), A.z0, A.x1, L(top), A.z1, p.render, 'TU');                             // the floors above in the render
  m.box(PH.x0, L(top), PH.z0, PH.x1, roof, PH.z1, p.render, 'TU');                         // the top floor, set back
  m.box(T.x0, G, T.z0, T.x1, roof + 1.5, T.z1, p.render2, 'TU');                           // the stair tower
  m.box(LB.x0, G, LB.z0, LB.x1, L(1), LB.z1, p.stone, 'TU');                               // the lobby
  for (let i = 1; i < top; i++) k.slab({ x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1 }, L(i), { over: 0.4 });          // the floors' slabs, cantilevered all round
  k.slab({ x0: A.x0, x1: A.x1, z0: A.z0, z1: FZ - 0.4 }, L(top), { over: 0.4, thick: 0.28 });                  // the top floor's terrace slab
  k.slab({ x0: PH.x0, x1: PH.x1, z0: PH.z0, z1: 1.0 }, roof, { over: 0.4, thick: 0.3 });                       // the roof, and its visor over the east half of the terrace
  k.slab({ x0: -2.0, x1: PH.x1, z0: 1.0, z1: 3.1 }, roof, { over: 0.4, thick: 0.3 });
  k.slab({ x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1 }, roof + 1.5, { over: 0.4, overS: 0.1, thick: 0.22 });      // the tower's own thin roof
  k.post(-2.0, 3.1 + 0.0, 0.2, L(top), roof - 0.0, p.frame, 'U');                          // the visor's one slim post, at its west corner

  // ------------------------------------------------------------------------------------------------ the street face of the main block
  const F = k.facade('street', A.z1);
  const bays: [number, number][] = [[-9.0, -5.4], [-5.4, -1.8], [-1.8, 1.8], [1.8, 5.4]];
  const win = (i: number, f: number, o: { y0?: number; y1?: number } = {}) => F.opening({ u0: bays[i][0] + 0.35, u1: bays[i][1] - 0.35, y0: L(f) + (o.y0 ?? 0.04), y1: L(f) + (o.y1 ?? 2.72) });
  /** A tall oak screen in a white frame, over the storeys f0…f1. */
  const screen = (i: number, f0: number, f1: number) => {
    const [a, b] = bays[i], y0 = L(f0) + 0.02, y1 = L(f1 + 1) - 0.34;
    F.quad(a + 0.3, b - 0.3, y0, y1, 0.04, p.render2);
    F.box(a + 0.3, a + 0.55, y0, y1, 0, 0.22, p.slab); F.box(b - 0.55, b - 0.3, y0, y1, 0, 0.22, p.slab);
    F.slats({ u0: a + 0.55, u1: b - 0.55, y0: y0 + 0.02, y1: y1 - 0.02, pitch: 0.21, w: 0.07, depth: 0.14, n0: 0.06 });
  };
  // ground floor: the garden flat's salons either side of the lobby
  F.opening({ u0: -8.6, u1: -4.2, y0: G + 0.35, y1: G + 2.7, mull: 2 }); F.opening({ u0: 4.2, u1: 5.0, y0: G + 0.35, y1: G + 2.7, mull: 0 });
  for (let f = 1; f < top; f++) {
    for (let i = 0; i < 4; i++) win(i, f);
    if (f % 2) screen(3, f, f); else screen(0, f, f);                                 // the oak screen swaps sides from one floor to the next …
    if (f === 1) continue;                                                               // (the first floor opens on the long terrace)
    const a = f % 2 ? 0 : 1, b = f % 2 ? 1 : 2;                                          // … and the balcony takes the other bays
    F.balcony({ u0: bays[a][0] + 0.1, u1: bays[b][1] - 0.1, y: L(f), depth: 1.9, guard: 'glass', returns: [true, true] });
  }
  // the first floor's terrace: a long slab, deeper over the lobby, its guard in clear glass, a solid band for the name
  const T1 = L(1);
  m.box(A.x0 - 0.3, T1 - 0.26, A.z1, A.x1 + 0.3, T1, FZ, p.slab, '');                    // the terrace along the front
  m.box(LB.x0 - 0.3, T1 - 0.26, A.z1, LB.x1 + 0.3, T1, tz, p.slab, '');                  // deeper over the lobby: its canopy
  const gy0 = T1 + 0.06, gy1 = T1 + 1.05;
  m.vq('z', FZ - 0.06, A.x0 - 0.3, LB.x0 - 0.3, gy0, gy1, 1, GUARD); m.vq('z', FZ - 0.06, LB.x1 + 0.3, A.x1 + 0.3, gy0, gy1, 1, GUARD);
  m.vq('x', A.x0 - 0.27, A.z1, FZ - 0.06, gy0, gy1, -1, GUARD); m.vq('x', A.x1 + 0.27, A.z1, FZ - 0.06, gy0, gy1, 1, GUARD);
  m.vq('x', LB.x0 - 0.27, FZ, tz - 0.06, gy0, gy1, -1, GUARD); m.vq('x', LB.x1 + 0.27, FZ, tz - 0.06, gy0, gy1, 1, GUARD);
  m.vq('z', tz - 0.06, LB.x0 - 0.3, -2.6, gy0, gy1, 1, GUARD); m.vq('z', tz - 0.06, 2.6, LB.x1 + 0.3, gy0, gy1, 1, GUARD);
  m.box(-2.6, T1, tz - 0.3, 2.6, T1 + 0.95, tz - 0.05, p.render2, 'U');                  // the solid band that carries the name
  m.box(-2.6, T1 + 0.95, tz - 0.34, 2.6, T1 + 1.02, tz, p.slab, 'U');
  for (const [x0, x1] of [[A.x0 - 0.2, LB.x0 - 0.3], [LB.x1 + 0.3, A.x1 + 0.2]] as const) m.hq(x0, A.z1, x1, FZ, T1 + 0.02, true, wood);   // the decks
  m.hq(LB.x0 - 0.2, A.z1, LB.x1 + 0.2, tz, T1 + 0.02, true, wood);
  k.leaves.box(A.x0 + 0.1, T1, FZ - 0.75, LB.x0 - 0.5, T1 + 0.5, FZ - 0.3, GREEN.hedge2, 'U'); k.leaves.box(LB.x1 + 0.5, T1, FZ - 0.75, A.x1 - 0.1, T1 + 0.5, FZ - 0.3, GREEN.hedge2, 'U');   // planters on the terrace

  // ------------------------------------------------------------------------------------------------ the top floor: wide glass behind its terrace
  const FP = k.facade('street', PH.z1), TT = L(top);
  FP.opening({ u0: -8.6, u1: -4.0, y0: TT + 0.04, y1: TT + 2.8, mull: 2 }); FP.opening({ u0: -3.6, u1: 1.2, y0: TT + 0.04, y1: TT + 2.8, mull: 2 });
  FP.quad(1.6, 4.9, TT + 0.04, TT + 2.8, 0.03, p.wood);
  FP.slats({ u0: 1.6, u1: 4.9, y0: TT + 0.1, y1: TT + 2.7, pitch: 0.3, w: 0.1, depth: 0.1, n0: 0.06, col: mix(p.wood, 0xffffff, 0.12), back: 0x3a2a1c });
  m.hq(A.x0 - 0.2, PH.z1, A.x1 + 0.2, FZ - 0.5, TT + 0.02, true, wood);                  // the deck
  m.vq('z', FZ - 0.06 - 0.4, A.x0 - 0.3, A.x1 + 0.3, TT + 0.06, TT + 1.05, 1, GUARD);
  m.vq('x', A.x0 - 0.27, PH.z1 + 0.5, FZ - 0.46, TT + 0.06, TT + 1.05, -1, GUARD); m.vq('x', A.x1 + 0.27, PH.z1 + 0.5, FZ - 0.46, TT + 0.06, TT + 1.05, 1, GUARD);
  m.box(A.x0 - 0.3, TT + 1.05, FZ - 0.5, A.x1 + 0.3, TT + 1.09, FZ - 0.4, p.frame, 'UB');
  // a plunge pool on the terrace, under the visor
  const pl = { x0: 0.4, x1: 4.2, z0: 1.5, z1: 3.1 };
  m.hq(pl.x0 - 0.3, pl.z0 - 0.3, pl.x1 + 0.3, pl.z1 + 0.3, TT + 0.035, true, mix(p.slab, 0xffffff, 0.3)); d.flat(d.water, pl.x1 - pl.x0, pl.z1 - pl.z0, (pl.x0 + pl.x1) / 2, TT + 0.05, (pl.z0 + pl.z1) / 2, 0x2fa8d8);
  // the pergola over the terrace's street corner
  const pg = { x0: -8.4, x1: -3.2, z0: 1.4, z1: 3.9 }, ph = 2.7;
  for (const x of [pg.x0, pg.x1]) for (const z of [pg.z0, pg.z1]) k.post(x, z, 0.16, TT, TT + ph, p.frame, 'U');
  for (const z of [pg.z0, pg.z1]) m.box(pg.x0 - 0.15, TT + ph, z - 0.1, pg.x1 + 0.15, TT + ph + 0.2, z + 0.1, p.frame, 'U');
  const ns = Math.floor((pg.x1 - pg.x0) / (lite ? 0.9 : 0.42));
  for (let i = 0; i <= ns; i++) { const x = pg.x0 + ((pg.x1 - pg.x0) * i) / ns; m.box(x - 0.04, TT + ph + 0.2, pg.z0 - 0.15, x + 0.04, TT + ph + 0.3, pg.z1 + 0.15, p.wood, 'UBSLR'); }

  k.bulbs.box(PH.x0 - 0.4, roof - 0.17, 1.4, -2.4, roof - 0.11, 1.43, 0xffe2b8, 'UBTLR'); k.bulbs.box(-2.4, roof - 0.17, 3.5, PH.x1 + 0.4, roof - 0.11, 3.53, 0xffe2b8, 'UBTLR');   // a line of light along the visor's fascia

  // ------------------------------------------------------------------------------------------------ the lobby: a glazed front, the door under the canopy
  const FL = k.facade('street', LB.z1);
  FL.opening({ u0: -3.2, u1: -1.2, y0: G + 0.12, y1: G + 2.95, mull: 1 }); FL.opening({ u0: 1.2, u1: 3.2, y0: G + 0.12, y1: G + 2.95, mull: 1 });
  door(d, { face: 'street', x: 0, z: LB.z1, w: 1.5, h: 2.7, portal: true, steps: true });
  for (const x of [-1.2, 1.2]) k.bulbs.box(x - 0.18, T1 - 0.3, tz - 1.2, x + 0.18, T1 - 0.26, tz - 0.8, 0xfff1c8, 'T');   // downlights in the canopy's soffit
  k.bulbs.box(-0.6, T1 - 0.3, LB.z1 + 0.4, 0.6, T1 - 0.26, LB.z1 + 0.8, 0xfff1c8, 'T');
  m.box(1.9, G + 1.0, LB.z1, 2.2, G + 1.4, LB.z1 + 0.05, p.frame, 'iU'); k.bulbs.box(1.95, G + 1.3, LB.z1 + 0.05, 2.15, G + 1.34, LB.z1 + 0.07, 0xfff1c8, 'U');   // the intercom

  // ------------------------------------------------------------------------------------------------ the stair tower's claustra
  const FT = k.facade('street', T.z1), ty1 = roof + 1.5 - 0.15;
  FT.box(T.x0, T.x0 + 0.3, G, ty1 + 0.15, 0, 0.3, p.slab); FT.box(T.x1 - 0.3, T.x1, G, ty1 + 0.15, 0, 0.3, p.slab);
  FT.box(T.x0 + 0.3, T.x1 - 0.3, ty1 - 0.25, ty1 + 0.15, 0, 0.3, p.slab);
  FT.quad(T.x0 + 0.3, T.x1 - 0.3, G, ty1 - 0.25, 0.02, 0x3a2e24);
  FT.slats({ u0: T.x0 + 0.3, u1: T.x1 - 0.3, y0: G + 0.25, y1: ty1 - 0.28, pitch: 0.13, w: 0.05, depth: 0.12, n0: 0.1, alt: p.wood - 0x0f0f0f, back: null });
  for (let i = 0; i < 3; i++) { const x = T.x0 + 0.65 + i * 0.95; k.bulbs.box(x - 0.08, G, T.z1 + 0.4, x + 0.08, G + 0.07, T.z1 + 0.56, 0xfff1c8, 'U'); }   // uplights at its foot
  const FS = k.facade('right', T.x1);
  for (let f = 0; f < n; f++) { FS.opening({ u0: -6.0, u1: -4.8, y0: L(f) + 0.9, y1: L(f) + 2.1, mull: 0, head: false }); FS.opening({ u0: -1.6, u1: -0.4, y0: L(f) + 0.9, y1: L(f) + 2.1, mull: 0, head: false }); }

  // ------------------------------------------------------------------------------------------------ the west side and the back
  const FW = k.facade('left', A.x0);
  for (let f = 0; f < n; f++) { FW.opening({ u0: -7.2, u1: -4.6, y0: L(f) + (f ? 0.04 : 0.5), y1: L(f) + 2.7, mull: 1, head: false }); FW.opening({ u0: -2.4, u1: -1.4, y0: L(f) + 0.9, y1: L(f) + 2.1, mull: 0, head: false }); FW.opening({ u0: 0.6, u1: 1.6, y0: L(f) + 0.9, y1: L(f) + 2.1, mull: 0, head: false }); }
  const FB = k.facade('back', A.z0);
  for (let f = 0; f < n; f++) for (const [a, b] of [[-8.4, -5.4], [-4.4, -1.4], [-0.4, 2.6], [3.2, 5.0]] as const) FB.opening({ u0: a, u1: b, y0: L(f) + (f ? 0.04 : 0.5), y1: L(f) + 2.7, mull: 1, head: false });
  for (let f = 1; f < n; f++) FB.balcony({ u0: -8.4, u1: -1.4, y: L(f), depth: 1.3, guard: f % 2 ? 'solid' : 'glass', guardCol: p.render, green: true });

  // ------------------------------------------------------------------------------------------------ the roof: a parapet, the plant
  const R = { x0: A.x0 - 0.1, x1: A.x1 + 0.1, z0: A.z0 - 0.1, z1: 1.2 };
  m.vq('z', R.z1 - 0.06, R.x0, -2.4, roof + 0.06, roof + 1.1, 1, GUARD); m.vq('x', R.x0 + 0.05, R.z0, R.z1, roof + 0.06, roof + 1.1, -1, GUARD);
  m.vq('z', R.z0 + 0.05, R.x0, R.x1, roof + 0.06, roof + 1.1, -1, GUARD); m.vq('x', R.x1 - 0.05, R.z0, 3.3, roof + 0.06, roof + 1.1, 1, GUARD);
  m.vq('x', -2.4, R.z1 - 0.06, 3.3, roof + 0.06, roof + 1.1, -1, GUARD); m.vq('z', 3.3, -2.4, R.x1, roof + 0.06, roof + 1.1, 1, GUARD);
  roofPlant(d, { x0: 0.4, x1: 8, z0: -9.2, z1: -4.5 }, roof + 0.02, { units: 2 });

  // ------------------------------------------------------------------------------------------------ the courtyard
  const gr = (x: number, z: number, w: number, dd: number, y: number, col: number) => m.hq(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, G + y, true, col);
  gr(-6.0, 8.4, 9.2, 4.2, 0.03, GREEN.lawn); gr(6.0, 8.4, 9.2, 4.2, 0.03, GREEN.lawn);                                   // two lawns, mown in stripes
  for (let i = 0; i < 4; i++) { gr(-6.0, 6.8 + i * 1.0, 9.2, 0.5, 0.04, GREEN.lawn2); gr(6.0, 6.8 + i * 1.0, 9.2, 0.5, 0.04, GREEN.lawn2); }
  gr(0, 8.2, 2.8, 5.0, 0.05, mix(p.stone, 0xffffff, 0.25));                                                              // the path from the gate to the door
  gr(0, 9.2, 2.8, 0.06, 0.06, p.stoneDark); gr(0, 7.6, 2.8, 0.06, 0.06, p.stoneDark);
  const hb = (x0: number, x1: number, z: number, h = 0.55) => k.leaves.box(x0, G, z - 0.3, x1, G + h, z + 0.3, GREEN.hedge2, 'U');
  hb(-10.2, -2.6, 10.1); hb(2.6, 10.2, 10.1);
  planter(d, -6.5, 4.0, 5.0, 0.8, { h: 0.5, bloom: mix(p.accent, 0xff7a9a, 0.4) }); planter(d, 5.1, 3.4, 1.8, 0.7, { h: 0.55, hedge: GREEN.hedge2 });
  palm(d, -7.0, 7.5, 1.05, 0.3); palm(d, 7.2, 7.4, 0.95, 1.2);
  for (const x of [-2.2, 2.2]) { m.box(x - 0.07, G, 9.3 - 0.07, x + 0.07, G + 0.7, 9.3 + 0.07, p.frame, 'U'); k.bulbs.box(x - 0.08, G + 0.62, 9.3 - 0.08, x + 0.08, G + 0.74, 9.3 + 0.08, 0xfff1c8, 'U'); }

  // ------------------------------------------------------------------------------------------------ the name, and what is solid
  if (s.name) {
    const w = Math.min(5.0, 0.3 * s.name.length), css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    nameBoard(d, s.name, { x: 0, z: tz - 0.03, y: T1 + 0.5, w, h: 0.8, bg: css(p.board), fg: '#f4e6bd' });
  }
  solidBox(d, A, roof + 1.1); solidBox(d, T, roof + 1.5); solidBox(d, LB, L(1));
  k.flush();
};
