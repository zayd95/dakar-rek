import { GROUND, STOREY, type SiteBuilder } from './contract';
import { door, nameBoard, palm, perimeter, roofPlant } from './parts';
import { GREEN, GUARD, kitOf, mix } from './residences.kit';

/**
 * LD2.0-E lane E-R: the louvred residence (M, 46 × 22 m, 6 storeys): « Kër Salam », « Les Cormorans ». The block's front is wrapped in brise-soleil: deep
 * loggias, one bay wide and one storey tall, between slim concrete fins, and tall screens of vertical blades (oak in the even bays, the palette's bronze
 * in the odd) that close them on some floors and open them on others, so the wrap is dappled, a different run of blades in every column. Planters
 * spill over the open loggias' guards. A two-storey glass lobby stands out in front of the middle three bays, a band of stone above its glass
 * carrying the name, a canopy over its door; the roof is crowned by a pergola of oak blades, the plant behind it.
 */
/** True where the bay `b` (0…8) is closed by blades on floor `f`: the even bays but one floor in four, the odd bays on that floor only. */
export const screenClosed = (b: number, f: number) => (b % 2 === 0) !== ((f + b) % 4 === 0);
/** The three bays in front of which the glass lobby stands. */
export const LOBBY_BAYS = [3, 4, 5];
export const screen: SiteBuilder = d => {
  const { site: s, p, lite } = d, k = kitOf(d), n = Math.max(4, s.storeys), H = STOREY, G = GROUND, L = (i: number) => G + i * H, roof = L(n), top = n - 1;
  const B = { x0: -20.25, x1: 20.25, z0: -8.2 }, Zin = 1.4, Zout = 3.6, BAY = 4.5, bu = (i: number) => B.x0 + i * BAY;
  const m = k.plain, blade = [p.wood, mix(p.frame, p.wood, 0.12)];
  perimeter(d, { gate: s.gate, front: 'wall' });

  // ------------------------------------------------------------------------------------------------ the masses
  m.box(B.x0, G, B.z0, B.x1, L(1), Zout, p.stone, 'TU');                                                                    // the stone plinth
  m.box(B.x0, L(1), B.z0, B.x1, roof, Zin, p.render, 'TU');                                                                 // the block, behind its loggias
  for (let i = 1; i <= top; i++) k.slab({ x0: B.x0, x1: B.x1, z0: B.z0, z1: Zout }, L(i), { over: 0.3, overS: 0.05, thick: 0.26 });
  k.slab({ x0: B.x0, x1: B.x1, z0: B.z0, z1: Zout }, roof, { over: 0.4, overS: 1.0, thick: 0.34 });                          // the roof: a deep visor
  for (let b = 1; b < 9; b++) m.box(bu(b) - 0.15, b >= 3 && b <= 6 ? L(2) : L(1), Zin, bu(b) + 0.15, roof, Zout + 0.04, p.slab, 'BTU');   // the fins between the loggias
  for (const x of [B.x0, B.x1 - 0.3]) m.box(x, L(1), Zin, x + 0.3, roof, Zout + 0.04, p.slab, 'BTU');                                       // the end fins, closing the end loggias
  d.solid(B.x0, B.z0, B.x1, Zout, roof + 0.4);
  k.sec('masses');

  // ------------------------------------------------------------------------------------------------ the wrap: loggias and blades
  const Fi = k.facade('street', Zin), Fo = k.facade('street', Zout);
  const closed = screenClosed, lobbyBay = (b: number) => LOBBY_BAYS.includes(b);
  for (let b = 0; b < 9; b++) {
    let f = 1;
    while (f <= top) {
      if (lobbyBay(b) && f === 1) { f++; continue; }
      const c = closed(b, f); let e = f; while (e + 1 <= top && closed(b, e + 1) === c) e++;
      const u0 = bu(b) + 0.2, u1 = bu(b + 1) - 0.2;
      if (c) {                                                                                                               // a screen of blades over the floors f…e
        const y0 = L(f) + 0.0, y1 = L(e + 1) - 0.27;
        Fo.slats({ u0, u1, y0, y1, pitch: 0.36, w: 0.12, depth: 0.3, n0: -0.26, col: blade[b % 2], back: 0x241c16 });
        Fo.box(u0 - 0.03, u1 + 0.03, y1 - 0.2, y1, -0.3, 0.1, p.frame, 'iute'); Fo.box(u0 - 0.03, u1 + 0.03, y0, y0 + 0.14, -0.3, 0.1, p.frame, 'iute');
      } else {
        for (let g = f; g <= e; g++) {
          Fi.quad(bu(b) + 0.15, bu(b + 1) - 0.15, L(g), L(g + 1) - 0.27, 0.01, p.render2);
          Fi.opening({ u0: bu(b) + 0.5, u1: bu(b + 1) - 0.5, y0: L(g) + 0.04, y1: L(g) + 2.74, mull: 1, ledge: false, lean: g > 5 });
          Fo.quad(u0, u1, L(g) + 0.06, L(g) + 1.05, -0.06, GUARD); Fo.box(u0, u1, L(g) + 1.05, L(g) + 1.09, -0.09, -0.03, p.frame, 'iue');
          k.leaves.box(bu(b) + 0.35, L(g), Zout - 0.75, bu(b + 1) - 0.35, L(g) + 0.5, Zout - 0.25, GREEN.hedge2, 'U');
          if (!lite && (b + g) % 2 === 0) k.leaves.box(bu(b) + 0.35, L(g) + 0.5, Zout - 0.7, bu(b) + 1.2, L(g) + 0.75, Zout - 0.3, GREEN.moss, 'U');
        }
      }
      f = e + 1;
    }
  }
  k.sec('wrap');
  // the plinth's front: courses of stone
  for (const y of [G + 0.85, G + 1.7, G + 2.55]) Fo.quad(B.x0, B.x1, y, y + 0.03, 0.01, p.stoneDark);

  // ------------------------------------------------------------------------------------------------ the lobby: two storeys of glass, a band for the name, a canopy
  const LB = { x0: -6.75, x1: 6.75, z0: Zout - 0.05, z1: 5.7 }, lt = L(2) - 0.28;
  m.box(LB.x0, G, LB.z0, LB.x1, lt, LB.z1 - 0.1, p.render2, 'TU');
  k.slab({ x0: LB.x0, x1: LB.x1, z0: LB.z0, z1: LB.z1 }, lt + 0.14, { over: 0.25, thick: 0.28 });
  m.hq(LB.x0, LB.z0, LB.x1, LB.z1, lt + 0.15, true, GREEN.moss);                                                          // a green roof
  d.solid(LB.x0, LB.z0, LB.x1, LB.z1, lt);
  const FL = k.facade('street', LB.z1 - 0.1);
  for (const [a, b] of [[-6.4, -2.2], [-1.5, 1.5], [2.2, 6.4]] as const) FL.opening({ u0: a, u1: b, y0: G + 0.12, y1: lt - 1.45, mull: a === -1.5 ? 0 : 2, head: false, ledge: false });
  FL.box(LB.x0, LB.x1, lt - 1.45, lt, -0.02, 0.12, p.stone, 'iu');                                                          // the stone band above the glass
  FL.box(LB.x0, LB.x1, lt - 1.5, lt - 1.42, 0, 0.18, p.accent, 'iu');
  door(d, { face: 'street', x: 0, z: LB.z1 - 0.1, w: 1.8, h: 2.7, portal: true, steps: true });
  k.slab({ x0: -2.6, x1: 2.6, z0: LB.z1 - 0.1, z1: LB.z1 + 2.3 }, G + 3.35, { over: 0, thick: 0.2 });                        // the canopy
  for (const x of [-2.4, 2.4]) { k.post(x, LB.z1 + 2.0, 0.18, G, G + 3.15, p.frame, 'UT'); d.solid(x - 0.09, LB.z1 + 1.91, x + 0.09, LB.z1 + 2.09, 3.3); }
  for (const x of [-1.2, 1.2]) k.bulbs.box(x - 0.18, G + 3.15, LB.z1 + 1.0, x + 0.18, G + 3.19, LB.z1 + 1.4, 0xfff1c8, 'T');
  m.box(2.0, G + 1.0, LB.z1 - 0.1, 2.3, G + 1.4, LB.z1 - 0.05, p.frame, 'iU'); k.bulbs.box(2.05, G + 1.3, LB.z1 - 0.05, 2.25, G + 1.34, LB.z1 - 0.03, 0xfff1c8, 'U');   // the intercom
  if (s.name) { const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`; nameBoard(d, s.name, { x: 0, z: LB.z1 - 0.1 + 0.16, y: lt - 0.72, w: Math.min(11.5, 0.34 * s.name.length), h: 0.9, bg: css(p.board), fg: '#f4e6bd' }); }
  k.sec('lobby');

  // ------------------------------------------------------------------------------------------------ the crown: a pergola of oak blades, a glass parapet, the plant
  const pg = { x0: -10.5, x1: 10.5, z0: -3.4, z1: 3.9 }, ph = 2.9, Y = roof;
  m.hq(pg.x0 - 0.8, pg.z0 - 0.4, pg.x1 + 0.8, pg.z1 + 0.5, Y + 0.02, true, mix(p.wood, 0x000000, 0.1));
  for (const x of [-10.5, -5.25, 0, 5.25, 10.5]) for (const z of [pg.z0, pg.z1]) k.post(x, z, 0.18, Y, Y + ph, p.frame, 'U');
  for (const z of [pg.z0, pg.z1]) m.box(pg.x0 - 0.15, Y + ph, z - 0.11, pg.x1 + 0.15, Y + ph + 0.22, z + 0.11, p.frame, '');
  const ns = Math.floor((pg.x1 - pg.x0) / (lite ? 0.9 : 0.5));
  for (let i = 0; i <= ns; i++) { const x = pg.x0 + ((pg.x1 - pg.x0) * i) / ns; m.box(x - 0.045, Y + ph + 0.22, pg.z0 - 0.2, x + 0.045, Y + ph + 0.36, pg.z1 + 0.2, p.wood, 'LR'); }
  const gy = roof + 0.06;
  m.vq('z', Zout + 0.95, B.x0 - 0.3, B.x1 + 0.3, gy, gy + 1.05, 1, GUARD); m.vq('z', B.z0 - 0.4, B.x0 - 0.4, B.x1 + 0.4, gy, gy + 1.05, -1, GUARD);
  m.vq('x', B.x0 - 0.4, B.z0 - 0.4, Zout + 1.0, gy, gy + 1.05, -1, GUARD); m.vq('x', B.x1 + 0.4, B.z0 - 0.4, Zout + 1.0, gy, gy + 1.05, 1, GUARD);
  m.box(B.x0 - 0.4, gy + 1.05, Zout + 0.9, B.x1 + 0.4, gy + 1.09, Zout + 1.0, p.frame, 'UB');
  roofPlant(d, { x0: -14, x1: 14, z0: -8, z1: -4.5 }, roof + 0.02, { units: 3 });
  k.sec('crown');

  // ------------------------------------------------------------------------------------------------ the ends and the back
  for (const sx of [-1, 1]) {
    const FE = k.facade(sx < 0 ? 'left' : 'right', sx * B.x1);
    for (let f = 1; f <= top; f++) for (const [a, b] of [[-7.0, -4.4], [-0.6, 0.6]] as const) FE.opening({ u0: a, u1: b, y0: L(f) + 0.7, y1: L(f) + 2.4, mull: a < -2 ? 1 : 0, head: false, lean: true });
    FE.slats({ u0: -2.8, u1: 2.0, y0: L(1) + 0.1, y1: roof - 0.3, pitch: 0.4, w: 0.12, depth: 0.25, back: 0x241c16, col: blade[1] });
  }
  const FB = k.facade('back', B.z0);
  for (let f = 1; f <= top; f++) {                                                                                           // a ribbon of glass on each floor, a mullion every bay
    FB.opening({ u0: B.x0 + 0.5, u1: B.x1 - 0.5, y0: L(f) + 0.3, y1: L(f) + 2.5, mull: 0, lean: true });
    if (!lite) for (let b = 1; b < 9; b++) FB.quad(bu(b) - 0.04, bu(b) + 0.04, L(f) + 0.3, L(f) + 2.5, 0.05, p.frame);
  }
  k.sec('ends');

  // ------------------------------------------------------------------------------------------------ the garden
  const gr = (x: number, z: number, w: number, dd: number, y: number, col: number) => m.hq(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, G + y, true, col);
  gr(-14.7, 8.2, 14, 5, 0.03, GREEN.lawn); gr(14.7, 8.2, 14, 5, 0.03, GREEN.lawn);
  for (let i = 0; i < 4; i++) { gr(-14.7, 6.4 + i * 1.2, 14, 0.6, 0.04, GREEN.lawn2); gr(14.7, 6.4 + i * 1.2, 14, 0.6, 0.04, GREEN.lawn2); }
  gr(0, 8.2, 14, 5, 0.03, mix(p.stone, 0xffffff, 0.3)); gr(0, 8.2, 4.4, 5, 0.05, mix(p.stone, 0xffffff, 0.5));
  for (const x of [-7.4, 7.4]) gr(x * 0.5 + (x < 0 ? -0.0 : 0.0), 8.2, 0.07, 5, 0.06, p.stoneDark);
  const hb = (x0: number, x1: number, z: number, h = 0.55) => k.leaves.box(x0, G, z - 0.3, x1, G + h, z + 0.3, GREEN.hedge2, 'U');
  hb(-22.4, -3.2, 10.15); hb(3.2, 22.4, 10.15);
  palm(d, -10.8, 7.8, 1.2, 0.3); palm(d, 10.8, 7.2, 1.05, 1.2);
  d.light(0, 8.2, 3, 0.16);
  k.sec('garden');
  k.flush();
};
