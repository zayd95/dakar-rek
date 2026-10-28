import { GROUND, STOREY, type SiteBuilder } from './contract';
import { door, nameBoard, palm, perimeter, roofPlant } from './parts';
import { GREEN, GUARD, bougainvillea, kitOf, mix } from './residences.kit';

/**
 * LD2.0-E lane E-R: the stacked and staggered residence (M, 46 × 22 m, 6 storeys): « Les Alizés ». The whole block stands on slim pilotis over a gated
 * parking court (painted bays), between two vertical cores in a colour of the palette. Its street face is a weave: every floor but the ground floor
 * has its balconies on two bays out of three, and the bay without moves one bay over from one floor to the next, so the gaps climb the façade on a
 * diagonal. The glazed lobby with its canopy, the intercom and the name on a stone sign wall stand beside the gate; the top floor is set back behind
 * its deck, a pergola over one end of it and a deep roof visor over the rest; the plant and the panels are on the roof.
 */
/** True where the bay `b` (1…7) of floor `f` has its balcony: two bays in three, the bay without moving one bay to the left (and wrapping) from one floor to the next. */
export const stackHasBalcony = (b: number, f: number) => (b + f) % 3 !== 2;
/** The runs of bays [first, last] that share a balcony slab on floor `f`. */
export function stackBalconyRuns(f: number): [number, number][] {
  const runs: [number, number][] = [];
  for (let b = 1; b <= 7; b++) {
    if (!stackHasBalcony(b, f)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === b - 1) last[1] = b; else runs.push([b, b]);
  }
  return runs;
}
export const stack: SiteBuilder = d => {
  const { site: s, p, lite } = d, k = kitOf(d), n = Math.max(4, s.storeys), H = STOREY, G = GROUND, L = (i: number) => G + i * H, roof = L(n), top = n - 1;
  const B = { x0: -20.25, x1: 20.25, z0: -8.2, z1: 3.2 }, BAY = 4.5, bu = (i: number) => B.x0 + i * BAY;         // the block, its nine bays (0 and 8 are the cores)
  const core = mix(p.accent, p.render, 0.62), m = k.plain, wood = mix(p.wood, 0x000000, 0.1);
  const ENTRY = { x: 13.8, w: 3.6 };                                                      // the walk-in opening in the street railing, in line with the lobby's door
  perimeter(d, { gate: s.gate, entries: [ENTRY] });
  k.info.entries.push(ENTRY);

  // ------------------------------------------------------------------------------------------------ the ground: the court, its bays, the pilotis
  const conc = mix(p.stoneDark, 0xffffff, 0.55), line = 0xf4f2ec, y0 = G;
  m.hq(-22.4, -10.4, 22.4, 10.4, y0 + 0.03, true, conc);
  for (let j = 0; j <= 8; j++) m.hq(-15.5 + j * 2.6 - 0.05, -8.0, -15.5 + j * 2.6 + 0.05, -3.0, y0 + 0.045, true, line);
  m.hq(-15.5, -3.05, 5.3, -2.95, y0 + 0.045, true, line);
  m.hq(-2.2, 3.4, 2.2, 10.4, y0 + 0.05, true, mix(conc, 0xffffff, 0.2));                                                // the drive, from the gate
  for (let j = 0; j < 8; j++) {                                                                                           // the pilotis: slim stone posts, two rows
    const x = -15.75 + j * BAY;
    k.post(x, B.z1 - 0.25, 0.42, G, L(1) - 0.2, p.stone, 'UT'); k.post(x, B.z0 + 0.25, 0.42, G, L(1) - 0.2, p.stone, 'UT');
    d.solid(x - 0.21, B.z1 - 0.46, x + 0.21, B.z1 - 0.04, L(1)); d.solid(x - 0.21, B.z0 + 0.04, x + 0.21, B.z0 + 0.46, L(1));
  }
  for (let j = 0; j < 4; j++) { const x = -13.5 + j * 9, zz = -0.8; k.bulbs.box(x - 0.5, L(1) - 0.3, zz - 0.06, x + 0.5, L(1) - 0.26, zz + 0.06, 0xfff1c8, 'T'); }   // the soffit's lights

  k.sec('ground');
  // ------------------------------------------------------------------------------------------------ the masses
  const slab = (f: number, o: { z1?: number; x0?: number; x1?: number; over?: number; thick?: number } = {}) => k.slab({ x0: o.x0 ?? B.x0, x1: o.x1 ?? B.x1, z0: B.z0, z1: o.z1 ?? B.z1 }, L(f), { over: o.over ?? 0.35, thick: o.thick ?? 0.26 });
  for (let f = 1; f < top; f++) slab(f);
  slab(top);                                                                                                               // the top floor's slab …
  k.slab({ x0: -15.75, x1: 15.75, z0: B.z1, z1: 4.9 }, L(top), { over: 0.35, thick: 0.28 });                               // … and its terrace in front
  m.box(B.x0, L(1), B.z0, B.x1, L(top), B.z1, p.render, 'TU');                                                             // the floors
  m.box(-15.75, L(top), B.z0, 15.75, roof, 0.8, p.render, 'TU');                                                          // the top floor, set back between the cores
  for (const [x0, x1] of [[B.x0, -15.75], [15.75, B.x1]] as const) {                                                       // the two cores, in the palette's colour
    m.box(x0, G, B.z0, x1, roof + 1.4, B.z1 + 0.3, core, 'TU'); m.box(x0 - 0.02, G, B.z1, x1 + 0.02, L(1), B.z1 + 0.34, p.stone, 'TU');
    k.slab({ x0, x1, z0: B.z0, z1: B.z1 + 0.3 }, roof + 1.4, { over: 0.3, thick: 0.22 });
    d.solid(x0, B.z0, x1, B.z1 + 0.3, roof + 1.4);
  }
  slab(n, { x0: B.x0, x1: B.x1, z1: 1.0, thick: 0.3, over: 0.4 });                                                          // the roof …
  k.slab({ x0: -5.0, x1: 15.75, z0: 1.0, z1: 3.7 }, roof, { over: 0.4, thick: 0.3 });                                       // … and its visor over the east two thirds of the terrace
  k.roofDeck({ x0: B.x0 - 0.4, x1: B.x1 + 0.4, z0: B.z0 - 0.4, z1: 1.4 }, roof, 0.4); k.roofDeck({ x0: -5.4, x1: 16.15, z0: 1.0, z1: 4.1 }, roof, 0.4); k.solar(-11.5, -6.6, roof, 6);
  k.post(-5.0, 3.7, 0.2, L(top), roof - 0.2, p.frame, 'U');

  k.sec('masses');
  // ------------------------------------------------------------------------------------------------ the street face: the weave
  const F = k.facade('street', B.z1);
  for (let f = 1; f < top; f++) {
    for (let b = 1; b <= 7; b++) {
      if (!stackHasBalcony(b, f)) F.quad(bu(b) + 0.08, bu(b + 1) - 0.08, L(f) - 0.02, L(f + 1) - 0.3, 0.015, mix(p.accent, p.render, 0.35));      // the gap: a panel in the accent
      F.opening({ u0: bu(b) + 0.5, u1: bu(b + 1) - 0.5, y0: L(f) + 0.04, y1: L(f) + 2.74, mull: 1, lean: f > 5 });
      if (!stackHasBalcony(b, f)) F.quad(bu(b) + 0.55, bu(b + 1) - 0.55, L(f) + 0.06, L(f) + 1.0, 0.075, GUARD);                                   // a glass rail across its door
    }
    stackBalconyRuns(f).forEach(([a, e], g) => F.balcony({ u0: bu(a) + 0.04, u1: bu(e + 1) - 0.04, y: L(f), depth: 1.8, guard: (f + g) % 2 ? 'glass' : 'solid', guardCol: (f + g) % 2 ? undefined : p.render2, green: true }));
  }
  for (const [x0, x1] of [[B.x0, -15.75], [15.75, B.x1]] as const) {                                                       // the cores' fronts: a slim opening on each floor, the stair
    const Fc = k.facade('street', B.z1 + 0.3);
    for (let f = 1; f < top; f++) Fc.opening({ u0: x0 + 1.4, u1: x1 - 1.4, y0: L(f) + 0.6, y1: L(f) + 2.3, mull: 0, head: false });
    Fc.slats({ u0: x0 + 0.4, u1: x1 - 0.4, y0: G + 0.2, y1: L(1) - 0.4, pitch: 0.2, w: 0.07, depth: 0.1, back: 0x2a211a });
  }
  k.sec('weave');
  // the top floor, set back: wide glass, two oak panels, a deck, a glass guard with planters, a pergola
  const FP = k.facade('street', 0.8), TT = L(top);
  for (let i = 0; i < 7; i++) {
    const a = -15.75 + i * BAY + 0.4, b = a + BAY - 0.8;
    if (i === 1 || i === 5) { FP.quad(a, b, TT + 0.04, TT + 2.8, 0.03, p.wood); FP.slats({ u0: a, u1: b, y0: TT + 0.1, y1: TT + 2.7, pitch: 0.3, w: 0.1, depth: 0.1, n0: 0.06, col: mix(p.wood, 0xffffff, 0.12), back: 0x3a2a1c }); }
    else FP.opening({ u0: a, u1: b, y0: TT + 0.04, y1: TT + 2.8, mull: 2 });
  }
  m.hq(-15.9, 0.8, 15.9, 4.3, TT + 0.02, true, wood);
  m.vq('z', 4.9 - 0.06 - 0.4, -16.1, 16.1, TT + 0.06, TT + 1.05, 1, GUARD); m.vq('x', -16.07, 3.9, 4.44, TT + 0.06, TT + 1.05, -1, GUARD); m.vq('x', 16.07, 3.9, 4.44, TT + 0.06, TT + 1.05, 1, GUARD);
  m.box(-16.1, TT + 1.05, 4.4, 16.1, TT + 1.09, 4.5, p.frame, 'UB');
  k.leaves.box(-15.2, TT, 3.5, -5.5, TT + 0.45, 4.1, GREEN.hedge2, 'U'); k.leaves.box(1.0, TT, 3.5, 15.2, TT + 0.45, 4.1, GREEN.hedge2, 'U');
  const pg = { x0: -14.4, x1: -6.0, z0: 1.4, z1: 3.9 }, ph = 2.7;
  for (const x of [pg.x0, pg.x1]) for (const z of [pg.z0, pg.z1]) k.post(x, z, 0.16, TT, TT + ph, p.frame, 'U');
  for (const z of [pg.z0, pg.z1]) m.box(pg.x0 - 0.15, TT + ph, z - 0.1, pg.x1 + 0.15, TT + ph + 0.2, z + 0.1, p.frame, 'U');
  const ns = Math.floor((pg.x1 - pg.x0) / (lite ? 0.9 : 0.42));
  for (let i = 0; i <= ns; i++) { const x = pg.x0 + ((pg.x1 - pg.x0) * i) / ns; m.box(x - 0.04, TT + ph + 0.2, pg.z0 - 0.15, x + 0.04, TT + ph + 0.3, pg.z1 + 0.15, p.wood, 'UBSLR'); }

  k.sec('topfloor');
  // ------------------------------------------------------------------------------------------------ the lobby, its canopy and door, the sign wall
  const LB = { x0: 6.75, x1: 15.75, z0: -1.5, z1: B.z1 };
  m.box(LB.x0, G, LB.z0, LB.x1, L(1) - 0.2, LB.z1 - 0.15, p.render2, 'TU');
  d.solid(LB.x0, LB.z0, LB.x1, LB.z1, L(1));
  const FL = k.facade('street', LB.z1);
  FL.opening({ u0: 7.1, u1: 12.5, y0: G + 0.1, y1: G + 2.95, mull: 2, head: false, ledge: false, lit: true });
  door(d, { face: 'street', x: ENTRY.x, z: LB.z1, w: 1.6, h: 2.7, portal: true, steps: true });
  k.slab({ x0: 6.9, x1: 15.6, z0: LB.z1 + 0.05, z1: 5.6 }, G + 3.1, { over: 0, thick: 0.2, col: p.slab });
  for (const x of [7.2, 15.3]) { k.post(x, 5.35, 0.2, G, G + 2.9, p.frame, 'UT'); d.solid(x - 0.1, 5.25, x + 0.1, 5.45, 3); }
  for (const x of [9.0, 13.8]) k.bulbs.box(x - 0.2, G + 2.88, 4.4, x + 0.2, G + 2.92, 4.8, 0xfff1c8, 'T');
  FL.houseNumber(s.number, 15.4, G + 1.55, 0.08);
  m.box(15.15, G + 1.0, LB.z1 - 0.2, 15.45, G + 1.4, LB.z1 + 0.05, p.frame, 'iU'); k.bulbs.box(15.2, G + 1.3, LB.z1 + 0.05, 15.4, G + 1.34, LB.z1 + 0.07, 0xfff1c8, 'U');   // the intercom
  k.info.units.push({ kind: 'lobby', face: 'street', u0: LB.x0, u1: LB.x1, awning: false });
  k.info.doors.push({ kind: 'lobby', x: ENTRY.x, z: LB.z1, face: 'street', stand: { x: ENTRY.x, z: LB.z1 + 0.95 } });
  // the gateway over the opening: two stone posts on the railing's piers and a deep lintel, the name on it (read from the street over the pavement)
  const pz0 = 10.63, pz1 = 10.99;
  for (const x of [ENTRY.x - ENTRY.w / 2 - 0.2, ENTRY.x + ENTRY.w / 2 + 0.2]) { m.box(x - 0.22, G, pz0, x + 0.22, G + 3.9, pz1, p.stone, 'U'); d.solid(x - 0.22, pz0, x + 0.22, pz1, 3.9); }
  m.box(ENTRY.x - 3.2, G + 3.0, 10.55, ENTRY.x + 3.2, G + 3.9, 10.97, p.render2, 'U'); m.box(ENTRY.x - 3.28, G + 3.9, 10.5, ENTRY.x + 3.28, G + 3.98, 11.0, p.slab, 'U');
  m.box(ENTRY.x - 3.2, G + 2.94, 10.55, ENTRY.x + 3.2, G + 3.0, 10.97, p.accent, 'U');
  if (s.name) { const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`; nameBoard(d, s.name, { x: ENTRY.x, z: 11.0, y: G + 3.45, w: Math.min(6.0, 0.3 * s.name.length), h: 0.8, bg: css(p.board), fg: '#f4e6bd' }); }
  // the street's units: a café at the west end, a shop east of the gate; troughs and a bench on the pavement side
  k.unit({ kind: 'cafe', x0: -21.0, x1: -12.6, z0: 5.6, z1: 8.9, door: -13.8, tables: 3, awning: 1.3, terrace: 0.8 });
  k.unit({ kind: 'shop', x0: 3.6, x1: 10.6, z0: 6.0, z1: 8.9, door: 4.9, awning: 1.3, fascia: p.board, stripe: [mix(p.accent, 0xffffff, 0.5)] });
  k.trough(7.2, 10.2, 10.05, { bloom: mix(p.accent, 0xff7a9a, 0.4) }); d.solid(7.2, 9.75, 10.2, 10.35, 1.0);
  k.bench(-8.2, 9.9, 1.8); d.solid(-9.1, 9.65, -7.3, 10.15, 0.9);
  k.sec('lobby');

  // ------------------------------------------------------------------------------------------------ the ends and the back
  for (const sx of [-1, 1]) {
    const FE = k.facade(sx < 0 ? 'left' : 'right', sx * B.x1);
    for (let f = 1; f < top; f++) for (const [a, b] of [[-6.6, -3.4], [-0.6, 2.6]] as const) FE.opening({ u0: a, u1: b, y0: L(f) + 0.04, y1: L(f) + 2.74, mull: 1, head: false });
    FE.slats({ u0: -3.0, u1: -1.0, y0: L(1) + 0.1, y1: L(top) - 0.3, pitch: 0.3, w: 0.1, depth: 0.14, back: 0x2a211a });                            // a tall oak screen between the windows
    FE.shopfront({ u0: -6.4, u1: -1.8, fascia: sx < 0 ? p.accent : p.board, mull: 2.3 }); FE.awning({ u0: -6.5, u1: -1.7, y: G + 2.82, depth: 1.0, drop: 0.6, col: sx < 0 ? p.accent : p.board });   // the end toward the road: a window on it, its awning
    k.info.units.push({ kind: sx < 0 ? 'cafe' : 'shop', face: sx < 0 ? 'left' : 'right', u0: -6.4, u1: -1.8, awning: true });
  }
  const FB = k.facade('back', B.z0);
  for (let f = 1; f < top; f++) {
    for (let i = 1; i < 8; i++) FB.opening({ u0: bu(i) + 0.5, u1: bu(i + 1) - 0.5, y0: L(f) + 0.04, y1: L(f) + 2.74, lean: true });
    if (f % 2) FB.balcony({ u0: bu(1), u1: bu(8), y: L(f), depth: 1.2, guard: 'solid', guardCol: p.render, green: true });
  }
  for (let i = 1; i < 8; i++) FB.opening({ u0: bu(i) + 0.5, u1: bu(i + 1) - 0.5, y0: TT + 0.04, y1: TT + 2.74, lean: true });

  k.sec('ends');
  // ------------------------------------------------------------------------------------------------ the roof: the plant, a glass parapet; the front garden
  m.vq('z', 1.0 + 0.34, B.x0 - 0.3, -5.1, roof + 0.06, roof + 1.1, 1, GUARD);
  m.vq('z', B.z0 - 0.3, B.x0 - 0.3, B.x1 + 0.3, roof + 0.06, roof + 1.1, -1, GUARD);
  m.vq('x', B.x0 - 0.3, B.z0 - 0.3, 1.34, roof + 0.06, roof + 1.1, -1, GUARD); m.vq('x', B.x1 + 0.3, B.z0 - 0.3, 1.34, roof + 0.06, roof + 1.1, 1, GUARD);
  roofPlant(d, { x0: -12, x1: 12, z0: -8, z1: -3.8 }, roof + 0.02, { units: 3 });
  palm(d, -7.4, 5.0, 1.1, 0.3);
  [-9.6, 19.4].forEach((x, i) => bougainvillea(d, x, 10.85, 1.4, 0.62 + (i % 3) * 0.08, i));                                           // flowers over the railing
  d.light(0, 8.0, 2.6, 0.16); d.light(ENTRY.x, 6.0, 2.6, 0.16); d.light(-16.8, 9.8, 2.4, 0.16);
  k.sec('roof');
  k.flush();
};
