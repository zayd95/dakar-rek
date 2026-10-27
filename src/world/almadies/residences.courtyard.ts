import { GROUND, STOREY, type SiteBuilder } from './contract';
import { nameBoard, palm, perimeter, roofPlant } from './parts';
import { GREEN, GUARD, kitOf, mix, type Facade } from './residences.kit';

/**
 * LD2.0-E lane E-R: the courtyard complex (L, 46 × 46 m, 5 storeys): « Jardins de Ngor ». Four wings round a courtyard with a pool and a garden; the
 * street wing is pierced at the gate's centre line by a porte-cochère (the gate, the passage, the pool beyond) under a stone lintel that carries the
 * name; the four corner towers are clad in oak blades and stand a floor above the roofs, the roofs between them have their pergolas. The outside
 * faces (the four are seen from roads) are ribbons of glazing and staggered balconies; the courtyard faces are continuous garden terraces with
 * planters, every floor, onto the pool.
 */
export const courtyard: SiteBuilder = d => {
  const { site: s, p, lite } = d, k = kitOf(d), n = Math.max(4, s.storeys), H = STOREY, G = GROUND, L = (i: number) => G + i * H, roof = L(n);
  const O = { x0: -19.5, x1: 19.5, z0: -31.5, z1: 6.5 }, C = { x0: -10, x1: 10, z0: -22, z1: -3 }, PASS = { x0: -2.8, x1: 2.8 }, TW = 5.0, STEP = 1.0, TERR = 1.8;
  const m = k.plain, gl = k.glass, wood = mix(p.wood, 0x000000, 0.1), dark = 0x241c16;
  perimeter(d, { gate: s.gate, front: 'wall' });

  // ------------------------------------------------------------------------------------------------ the masses: four wings, the passage, the slabs
  // The ground floor's wings stand on the courtyard's edge; each floor above steps its inner wall back by a metre, so the terraces cascade into the court.
  const hole = (k_: number) => { const i = Math.max(0, k_ - 1) * STEP; return { x0: C.x0 - i, x1: C.x1 + i, z0: C.z0 - i, z1: C.z1 + i }; };
  const wingsAt = (h: { x0: number; x1: number; z0: number; z1: number }) => [{ x0: O.x0, x1: O.x1, z0: h.z1, z1: O.z1 }, { x0: O.x0, x1: O.x1, z0: O.z0, z1: h.z0 }, { x0: O.x0, x1: h.x0, z0: h.z0, z1: h.z1 }, { x0: h.x1, x1: O.x1, z0: h.z0, z1: h.z1 }];
  for (const w of [{ x0: O.x0, x1: PASS.x0, z0: C.z1, z1: O.z1 }, { x0: PASS.x1, x1: O.x1, z0: C.z1, z1: O.z1 }, ...wingsAt(C).slice(1)]) { m.box(w.x0, G, w.z0, w.x1, L(1), w.z1, p.stone, 'TU'); d.solid(w.x0, w.z0, w.x1, w.z1, roof); }
  for (let f = 1; f < n; f++) {
    for (const w of wingsAt(hole(f))) m.box(w.x0, L(f), w.z0, w.x1, f === n - 1 ? roof : L(f + 1), w.z1, p.render, 'TU');
    const h = hole(f), t = TERR, o = { over: 0, thick: 0.26, overS: 0 };
    k.slab({ x0: O.x0, x1: O.x1, z0: h.z1 - t, z1: O.z1 }, L(f), { ...o, over: 0.35, overS: 0.35 });                         // the street wing's slab, out to its terrace
    k.slab({ x0: O.x0, x1: O.x1, z0: O.z0, z1: h.z0 + t }, L(f), { ...o, over: 0.35 });
    k.slab({ x0: O.x0, x1: h.x0 + t, z0: h.z0 + t, z1: h.z1 - t }, L(f), { ...o, over: 0.35, overS: 0 });
    k.slab({ x0: h.x1 - t, x1: O.x1, z0: h.z0 + t, z1: h.z1 - t }, L(f), { ...o, over: 0.35, overS: 0 });
  }
  const rh = hole(n);
  k.slab({ x0: O.x0, x1: O.x1, z0: rh.z1, z1: O.z1 }, roof, { over: 0.5, overS: 1.0, thick: 0.34 }); k.slab({ x0: O.x0, x1: O.x1, z0: O.z0, z1: rh.z0 }, roof, { over: 0.5, thick: 0.34 });
  k.slab({ x0: O.x0, x1: rh.x0, z0: rh.z0, z1: rh.z1 }, roof, { over: 0.5, overS: 0, thick: 0.34 }); k.slab({ x0: rh.x1, x1: O.x1, z0: rh.z0, z1: rh.z1 }, roof, { over: 0.5, overS: 0, thick: 0.34 });
  k.sec('masses');

  // ------------------------------------------------------------------------------------------------ the street face and the passage
  const FS = k.facade('street', O.z1);
  const floorsOut = (F: Facade, u0: number, u1: number, bays: number, o: { lean?: boolean; bal?: boolean; guard?: 'glass' | 'solid'; depth?: number; ground?: boolean }) => {
    const bw = (u1 - u0) / bays;
    for (let f = o.ground ? 0 : 1; f < n; f++) for (let b = 0; b < bays; b++) {
      const a = u0 + b * bw, y = L(f), g = f === 0;
      if (f === 1 && (b === 2 || b === 3) && o.bal) continue;                                                             // behind the portal
      F.opening({ u0: a + 0.5, u1: a + bw - 0.5, y0: y + (g ? 0.4 : 0.04), y1: y + (g ? 2.7 : 2.74), mull: bw > 4.4 ? 1 : 0, lean: o.lean, head: !g });
      if (o.bal && f > 0 && (b + f) % 2 === 0) F.balcony({ u0: a + 0.04, u1: a + bw - 0.04, y, depth: o.depth ?? 1.6, guard: o.guard ?? (f % 2 ? 'glass' : 'solid'), guardCol: p.render, green: true });
    }
  };
  floorsOut(FS, -14.5, 14.5, 6, { bal: true, depth: 1.8, ground: false });
  // the ground floor of the street wing: garden flats' glass either side of the passage, stone courses
  for (const [a, b] of [[-14.0, -9.8], [-9.0, -4.9]] as const) { FS.opening({ u0: a, u1: b, y0: G + 0.4, y1: G + 2.7, mull: 1 }); FS.opening({ u0: -b, u1: -a, y0: G + 0.4, y1: G + 2.7, mull: 1 }); }
  for (const y of [G + 0.85, G + 1.7, G + 2.55]) { FS.quad(-14.5, PASS.x0 - 0.9, y, y + 0.03, 0.01, p.stoneDark); FS.quad(PASS.x1 + 0.9, 14.5, y, y + 0.03, 0.01, p.stoneDark); }
  // the portal: two stone piers and a deep lintel over the passage, the name on it; the passage's soffit lit, its floor paved
  const PT = L(2) - 0.3;
  FS.box(-5.0, PASS.x0, G, PT, 0, 0.45, p.stone, 'iu'); FS.box(PASS.x1, 5.0, G, PT, 0, 0.45, p.stone, 'iu');
  FS.box(PASS.x0, PASS.x1, L(1) - 0.3, PT, 0, 0.45, p.stone, 'iu');
  FS.box(-5.08, 5.08, PT - 0.1, PT + 0.04, 0, 0.55, p.slab, 'iu'); FS.box(-5.0, 5.0, L(1) - 0.36, L(1) - 0.3, 0, 0.5, p.accent, 'iu');
  for (const x of [-4.6, 4.6]) k.bulbs.box(x - 0.1, G + 2.2, O.z1 + 0.45, x + 0.1, G + 2.7, O.z1 + 0.5, 0xfff1c8, 'U');
  m.hq(PASS.x0, C.z1, PASS.x1, O.z1, G + 0.03, true, mix(p.stone, 0xffffff, 0.35));
  for (const z of [4.6, 0.6]) k.bulbs.box(-0.6, L(1) - 0.34, z - 0.1, 0.6, L(1) - 0.3, z + 0.1, 0xfff1c8, 'T');
  const lobby = k.facade('right', PASS.x0);                                                                                     // the lobby's glass door, on the passage's west wall
  lobby.opening({ u0: 0.2, u1: 2.6, y0: G + 0.1, y1: G + 2.7, mull: 1, head: false, ledge: false }); lobby.opening({ u0: 3.0, u1: 3.8, y0: G + 0.9, y1: G + 2.6, mull: 0, head: false, ledge: false, n: 0 });
  k.bulbs.box(PASS.x0 + 0.04, G + 2.9, 1.0, PASS.x0 + 0.2, G + 2.96, 2.0, 0xfff1c8, 'U');
  k.sec('street');
  if (s.name) { const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`; nameBoard(d, s.name, { x: 0, z: O.z1 + 0.47, y: L(1) + 1.2, w: Math.min(9.0, 0.33 * s.name.length), h: 0.9, bg: css(p.board), fg: '#f4e6bd' }); }

  // ------------------------------------------------------------------------------------------------ the corner towers: blades on the two outside faces
  const towers: { x: number; z: number; sx: 1 | -1; sz: 1 | -1 }[] = [{ x: O.x0, z: O.z1, sx: -1, sz: 1 }, { x: O.x1, z: O.z1, sx: 1, sz: 1 }, { x: O.x0, z: O.z0, sx: -1, sz: -1 }, { x: O.x1, z: O.z0, sx: 1, sz: -1 }];
  for (const t of towers) {
    const x0 = t.sx < 0 ? t.x - 0.4 : t.x - TW, x1 = t.sx < 0 ? t.x + TW : t.x + 0.4, z0 = t.sz < 0 ? t.z - 0.4 : t.z - TW, z1 = t.sz < 0 ? t.z + TW : t.z + 0.4, top = roof + H - 0.2;
    m.box(x0, G, z0, x1, top, z1, p.render2, 'TU'); k.slab({ x0, x1, z0, z1 }, top + 0.22, { over: 0.25, thick: 0.22 });
    const ft = k.facade(t.sz > 0 ? 'street' : 'back', t.sz > 0 ? z1 : z0), fs = k.facade(t.sx > 0 ? 'right' : 'left', t.sx > 0 ? x1 : x0);
    const pitch = lite ? 0.5 : 0.34;
    ft.quad(x0, x1, G, top, 0.02, dark); fs.quad(t.sz > 0 ? z0 : z0, z1, G, top, 0.02, dark);
    ft.slats({ u0: x0 + 0.15, u1: x1 - 0.15, y0: G + 0.3, y1: top - 0.2, pitch, w: 0.12, depth: 0.14, n0: 0.04, back: null, col: p.wood });
    fs.slats({ u0: z0 + 0.15, u1: z1 - 0.15, y0: G + 0.3, y1: top - 0.2, pitch: pitch * 1.25, w: 0.12, depth: 0.14, n0: 0.04, back: null, col: mix(p.wood, p.frame, 0.2) });
    for (const y of [G + 0.3, L(2) + 0.3, roof - 0.1]) { ft.box(x0, x1, y, y + 0.08, 0.0, 0.2, p.slab, 'iu'); }
    d.solid(x0, z0, x1, z1, top);
  }
  k.sec('towers');

  // ------------------------------------------------------------------------------------------------ the sides and the back
  const side = (face: 'left' | 'right', at: number) => {
    const F = k.facade(face, at);
    for (let f = 1; f < n; f++) {
      for (let b = 0; b < 6; b++) { const a = -26.5 + b * (28 / 6); F.opening({ u0: a + 0.5, u1: a + 28 / 6 - 0.5, y0: L(f) + 0.04, y1: L(f) + 2.74, lean: true }); }
      const a = f % 2 ? -26.5 : -26.5 + 14;
      F.balcony({ u0: a + 0.04, u1: a + 14 - 0.04, y: L(f), depth: 1.5, guard: f % 2 ? 'glass' : 'solid', guardCol: p.render, green: true });
    }
    for (const b of [0, 1, 2, 3]) { const a = -26.5 + b * (28 / 6) * 1.5; F.opening({ u0: a + 0.5, u1: a + 3.2, y0: G + 0.5, y1: G + 2.6, lean: true }); }
  };
  side('left', O.x0); side('right', O.x1);
  const FB = k.facade('back', O.z0);
  for (let f = 1; f < n; f++) for (let b = 0; b < 6; b++) { const a = -14.5 + b * (29 / 6); FB.opening({ u0: a + 0.5, u1: a + 29 / 6 - 0.5, y0: L(f) + 0.04, y1: L(f) + 2.74, lean: true }); if ((b + f) % 2 === 0) FB.balcony({ u0: a + 0.04, u1: a + 29 / 6 - 0.04, y: L(f), depth: 1.4, guard: f % 2 ? 'glass' : 'solid', guardCol: p.render, green: true }); }
  for (let b = 0; b < 6; b++) { const a = -14.5 + b * (29 / 6); FB.opening({ u0: a + 0.5, u1: a + 29 / 6 - 0.5, y0: G + 0.5, y1: G + 2.6, lean: true }); }
  k.sec('sides');

  // ------------------------------------------------------------------------------------------------ the courtyard's faces: garden terraces, every floor
  const faces = (f: number) => {
    const h = hole(f);
    return [{ F: k.facade('back', h.z1), a: h.x0, b: h.x1 }, { F: k.facade('street', h.z0), a: h.x0, b: h.x1 }, { F: k.facade('right', h.x0), a: h.z0, b: h.z1 }, { F: k.facade('left', h.x1), a: h.z0, b: h.z1 }];
  };
  for (let f = 0; f < n; f++) for (const { F, a, b } of faces(f)) {
    const bw = (b - a) / 4;
    for (let i = 0; i < 4; i++) F.opening({ u0: a + i * bw + 0.7, u1: a + (i + 1) * bw - 0.7, y0: L(f) + (f ? 0.04 : 0.1), y1: L(f) + 2.74, lean: true });
    if (f === 0) continue;
    F.pane(a, b, L(f) + 0.06, L(f) + 1.05, TERR - 0.06, GUARD); F.box(a, b, L(f) + 1.05, L(f) + 1.09, TERR - 0.09, TERR - 0.03, p.frame, 'iue');
    F.box(a + 0.3, b - 0.3, L(f), L(f) + 0.5, TERR - 0.7, TERR - 0.2, GREEN.hedge2, 'iu', k.leaves);
  }
  k.sec('court');

  // ------------------------------------------------------------------------------------------------ the courtyard: pool, deck, lawns, trees
  const cx = 0, cz = (C.z0 + C.z1) / 2;
  m.hq(C.x0, C.z0, C.x1, C.z1, G + 0.03, true, mix(p.stone, 0xffffff, 0.35));
  m.hq(C.x0 + 1.9, C.z0 + 1.9, C.x1 - 1.9, C.z1 - 1.9, G + 0.035, true, GREEN.lawn);
  const PW = { x0: -6.4, x1: 6.4, z0: cz - 3.2, z1: cz + 3.2 };
  m.hq(PW.x0 - 1.4, PW.z0 - 1.4, PW.x1 + 1.4, PW.z1 + 1.4, G + 0.05, true, wood);                                           // the deck
  m.hq(PW.x0 - 0.35, PW.z0 - 0.35, PW.x1 + 0.35, PW.z1 + 0.35, G + 0.06, true, mix(p.slab, 0xffffff, 0.3));                  // the coping
  d.flat(d.water, PW.x1 - PW.x0, PW.z1 - PW.z0, cx, G + 0.075, cz, 0x2fa8d8);
  for (const sx of [-1, 1]) for (let i = 0; i < (lite ? 1 : 2); i++) { const x = cx + sx * (1.8 + i * 2.6), z = PW.z1 + 0.75; k.plain.box(x - 0.3, G + 0.05, z - 0.8, x + 0.3, G + 0.38, z + 0.8, p.slab, 'U'); }   // loungers
  const tree = (x: number, z: number, sc: number, c = GREEN.hedge2) => {
    d.cyl(d.trunks, 0.14 * sc, 0.2 * sc, 2.4 * sc, x, G, z, 0x7b5d3f, 5);
    d.blob(d.leaves, 1.5 * sc, x, G + 3.0 * sc, z, c, 0.8, 0); d.blob(d.leaves, 1.1 * sc, x + 0.9 * sc, G + 2.5 * sc, z + 0.3, GREEN.hedge, 0.8, 0); d.blob(d.leaves, 1.0 * sc, x - 0.8 * sc, G + 2.6 * sc, z - 0.4, GREEN.moss, 0.8, 0);
    d.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 3);
  };
  tree(-8.2, cz + 5, 1.1); tree(8.2, cz - 5, 1.0); if (!lite) tree(-8.0, cz - 6.2, 0.9);
  k.sec('pool');

  // ------------------------------------------------------------------------------------------------ the roof: pergolas on the street side, plant at the back
  const Y = roof, pgs = [{ x0: -13.5, x1: -4.5, z0: 0.6, z1: 4.6 }, { x0: 4.5, x1: 13.5, z0: 0.6, z1: 4.6 }];
  for (const pg of pgs) {
    for (const x of [pg.x0, pg.x1]) for (const z of [pg.z0, pg.z1]) k.post(x, z, 0.16, Y, Y + 2.7, p.frame, 'U');
    for (const z of [pg.z0, pg.z1]) m.box(pg.x0 - 0.12, Y + 2.7, z - 0.1, pg.x1 + 0.12, Y + 2.9, z + 0.1, p.frame, '');
    const ns = Math.floor((pg.x1 - pg.x0) / (lite ? 1.0 : 0.55));
    for (let i = 0; i <= ns; i++) { const x = pg.x0 + ((pg.x1 - pg.x0) * i) / ns; m.box(x - 0.04, Y + 2.9, pg.z0 - 0.15, x + 0.04, Y + 3.02, pg.z1 + 0.15, p.wood, 'LR'); }
    m.hq(pg.x0 - 0.5, pg.z0 - 0.4, pg.x1 + 0.5, pg.z1 + 0.5, Y + 0.02, true, wood);
  }
  const gy = Y + 0.06, pr = { x0: O.x0 - 0.5, x1: O.x1 + 0.5, z0: O.z0 - 0.5, z1: O.z1 + 1.0 };
  gl.vq('z', pr.z1 - 0.06, pr.x0, pr.x1, gy, gy + 1.05, 1, GUARD); gl.vq('z', pr.z0 + 0.04, pr.x0, pr.x1, gy, gy + 1.05, -1, GUARD);
  gl.vq('x', pr.x0 + 0.04, pr.z0, pr.z1, gy, gy + 1.05, -1, GUARD); gl.vq('x', pr.x1 - 0.04, pr.z0, pr.z1, gy, gy + 1.05, 1, GUARD);
  roofPlant(d, { x0: -10, x1: 10, z0: -30.5, z1: -26 }, Y + 0.02, { units: 3 });
  k.sec('roof');

  // ------------------------------------------------------------------------------------------------ the gardens outside
  const gr = (x: number, z: number, w: number, dd: number, y: number, col: number) => m.hq(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, G + y, true, col);
  gr(-11.4, 8.7, 17.6, 3.6, 0.03, GREEN.lawn); gr(11.4, 8.7, 17.6, 3.6, 0.03, GREEN.lawn); gr(0, 8.7, 5.6, 3.6, 0.05, mix(p.stone, 0xffffff, 0.4));
  for (let i = 0; i < 3; i++) { gr(-11.4, 7.7 + i * 1.0, 17.6, 0.45, 0.04, GREEN.lawn2); gr(11.4, 7.7 + i * 1.0, 17.6, 0.45, 0.04, GREEN.lawn2); }
  const hb = (x0: number, x1: number, z0: number, z1: number, h = 0.55) => k.leaves.box(x0, G, z0, x1, G + h, z1, GREEN.hedge2, 'U');
  hb(-22.4, -3.4, 10.0, 10.6); hb(3.4, 22.4, 10.0, 10.6); hb(-22.4, -21.8, -34.4, 10.0); hb(21.8, 22.4, -34.4, 10.0); hb(-22.4, 22.4, -34.4, -33.8);
  palm(d, -6.6, 8.6, 1.15, 0.3); palm(d, 6.6, 8.4, 1.0, 1.2);
  d.light(0, 8.7, 3, 0.16); d.light(0, cz, 4, 0.16);
  k.sec('garden');
  k.flush();
};
