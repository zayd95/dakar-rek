import * as THREE from 'three';
import { Batch } from '../world/batch';
import type { Collider, HubWorld } from '../world/types';
import type { Arm, Pt } from './network';
import type { Footprint } from './traffic';
import type { RoundSpec } from './roundabout';

/**
 * The BRT corridor of Sacré-Cœur, where the road to Mermoz crosses it (a junction with `brt: true`, src/road/routes.ts). After the real SUNUBRT line (Petersen ⇄ Guédiawaye,
 * electric articulated buses): a reserved two-way busway down the MIDDLE of a wide avenue, behind kerbs, a covered station island in it beside the crossing, the avenue's
 * own car lanes either side. One station, one crossing, two buses at most: no timetable, no fare, no passenger economy (docs/districts/M1-MERMOZ.md).
 *
 * Rules kept:
 *  • Ordinary vehicles never enter the busway: it is not drivable ground (the avenue's ground is only its two car carriageways, `brtGroundArms`), its kerbs and the bollards at
 *    its mouths are solid, and no route uses a side road (GPS plans district to district, src/road/graph.ts; a junction's arms are never part of a route).
 *  • The crossing has a signal (`BrtLine.signal`): the main road holds at its stop lines while a bus crosses; road traffic obeys it (src/road/traffic.ts). The player is not
 *    forced (nothing is enforced in the game), but a bus never drives into the player's vehicle, nor into a car still in the crossing: it waits.
 *  • A bus approaches, waits at its stop line if it must, crosses, dwells at the station, and leaves into the underpass (« trémie ») at the end of the avenue; it comes back out of the
 *    other one later. Buses never overlap (one per direction, each on its own lane) and never float (they run on the busway's surface).
 *
 * Frames: everything here is in the road's own frame (district a's), like the chunks. `t` is the distance along the avenue from the crossing (positive toward the junction's +1
 * side, the left of a → b), `lat` the offset across it (positive to the left of +t).
 */
export const BUS_LANE = 3.35;          // centre of each bus lane from the avenue's axis
export const BUSWAY_HALF = 5.2;        // the busway: two lanes of 3.5 m and a 2.4 m median (the station island where it stands)
export const KERB_OUT = 5.8;           // the separator kerb, 0.6 m
export const CAR_OUT = 12.8;           // the avenue's car carriageway, one way each side (7 m)
export const AVENUE_HALF = 15.6;       // and its pavements
export const STATION = { t0: 17, t1: 49, half: 1.6 };   // the station island, in the busway's median, on the +1 side of the crossing
export const PORTAL = 16;              // the underpass mouths stand this far from the avenue's ends
export const BUS = { length: 18, width: 2.55, height: 3.25 };
/** The main road's stop lines, either side of the avenue (m from the junction's arc length). */
export const MAIN_STOP = AVENUE_HALF + 2;
/** The buses' stop lines, either side of the main road (m from the axis crossing). */
export const BUS_STOP = 13;

export interface BrtLayout {
  /** The junction's arc length on the road, and the crossing's centre. */
  s: number; x: number; z: number;
  /** The avenue's +t direction (the road's left there) and the road's forward direction. */
  ux: number; uz: number; fx: number; fz: number;
  /** How far the avenue runs each way from the crossing. */
  len: number;
  /** A point of the avenue (road frame). */
  at(t: number, lat: number): Pt;
  /** The crossing is a rond-point the busway runs straight through (src/road/roundabout.ts), or null for a plain crossing. */
  round: RoundSpec | null;
}

/**
 * Where things stand along the avenue for this crossing: the main road's stop lines (m from the crossing along the road), the buses' stop lines (along the avenue), the
 * station island, where the avenue's own carriageways and pavements start. A rond-point pushes them out past its ring; on it the ring's traffic holds either side of the busway.
 */
export function brtDims(lay: BrtLayout) {
  const r = lay.round;
  if (!r) return { mainStop: MAIN_STOP, busStop: BUS_STOP, station: STATION, busway0: 6, avenue0: 10, zebra: MAIN_STOP - 0.8, busLine: MAIN_STOP + 2.5, front: MAIN_STOP + 12, cross: MAIN_STOP - 3 };
  const t0 = r.ring + 7;
  return { mainStop: BUSWAY_HALF + 2.6, busStop: r.ring + 2, station: { t0, t1: t0 + 32, half: STATION.half }, busway0: 0, avenue0: r.ring - 1, zebra: r.ring + 2.6, busLine: r.ring + 2.3, front: r.ring + 20, cross: r.ring + 1 };
}

export function brtLayout(j: { s: number; x: number; z: number; yaw: number }, len: number, round: RoundSpec | null = null): BrtLayout {
  const fx = Math.sin(j.yaw), fz = Math.cos(j.yaw), ux = Math.cos(j.yaw), uz = -Math.sin(j.yaw);
  // the avenue's left of +t is the road's forward reversed: left of a heading (ux, uz) is (uz, −ux) = (−fx, −fz)
  return { s: j.s, x: j.x, z: j.z, ux, uz, fx, fz, len, round, at: (t, lat) => ({ x: j.x + ux * t - fx * lat, z: j.z + uz * t - fz * lat }) };
}

/** The drivable ground the avenue adds: its two car carriageways each side of the busway (never the busway). */
export function brtGroundArms(lay: BrtLayout): Arm[] {
  const mid = (KERB_OUT + CAR_OUT) / 2, half = (CAR_OUT - KERB_OUT) / 2 + 0.3, out: Arm[] = [];
  const t0 = lay.round ? lay.round.ring - 1.5 : 4;                                                                // (on a rond-point, from its ring outward)
  for (const side of [1, -1]) for (const lat of [mid, -mid]) out.push({ a: lay.at(side * t0, lat), b: lay.at(side * (lay.len - PORTAL - 1), lat), half });
  return out;
}

/** Is a road-frame point inside the busway (lanes and median, the crossing excluded)? */
export function inBusway(lay: BrtLayout, x: number, z: number, pad = 0): boolean {
  const dx = x - lay.x, dz = z - lay.z, t = dx * lay.ux + dz * lay.uz, lat = -(dx * lay.fx + dz * lay.fz), r = lay.round;
  if (r && Math.abs(t) > r.island - 0.5 && Math.abs(t) < r.ring + 0.5) return false;                              // (the ring crosses it there)
  return (r ? true : Math.abs(t) > MAIN_STOP - 2) && Math.abs(t) < lay.len && Math.abs(lat) < BUSWAY_HALF + pad;
}

const RED_ASPHALT = 0x9a4136, KERB = 0xd8d2c4, WHITE = 0xeeeae0, STEEL = 0x8a9198, YEL = 0xf2b21b;

/**
 * The corridor's fixed parts, merged into the chunk's own meshes: the red busway and its markings, kerbs, the planted median, the station island (shelter, canopy, railings,
 * checkered paving, ticket gates), the car carriageways and pavements, zebras, bollards at the busway's mouths, the underpass mouths and the buildings that close the avenue.
 * Solid: kerbs, bollards, station, portals, buildings. People: a few waiting on the island.
 */
export function buildBrtStatic(lay: BrtLayout, b: { plain: Batch; asphalt: Batch }, colliders: Collider[], people: HubWorld['people'], lite: boolean, R: () => number) {
  const { plain, asphalt } = b, yaw = Math.atan2(lay.ux, lay.uz), Y = 0.08, MARK = 0.1;
  const P = (t: number, lat: number) => lay.at(t, lat);
  const solid = (t: number, lat: number, along: number, across: number, h: number) => {
    // an axis-aligned chain of boxes along the avenue (it runs at an angle in the road's frame)
    const n = Math.max(1, Math.ceil(along / Math.max(1, across * 1.5)));
    for (let k = 0; k < n; k++) {
      const c = P(t + ((k + 0.5) / n - 0.5) * along, lat), a = along / n;
      const hx = (Math.abs(lay.ux) * a + Math.abs(lay.fx) * across) / 2, hz = (Math.abs(lay.uz) * a + Math.abs(lay.fz) * across) / 2;
      colliders.push({ x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz, h });
    }
  };
  const box = (bt: Batch, t: number, lat: number, along: number, across: number, h: number, y: number, col: number) => { const c = P(t, lat); bt.box(across, h, along, c.x, y, c.z, col, yaw); };
  const D = brtDims(lay), RD = lay.round, STN = D.station;
  const flat = (t: number, lat: number, along: number, across: number, col: number, y = MARK) => { const c = P(t, lat); plain.flat(across, along, c.x, y, c.z, col, yaw); };

  for (const side of [1, -1]) {
    const t0 = D.busway0, t1 = lay.len, mid = (t0 + t1) / 2, L = t1 - t0;
    // the busway: red asphalt (over a rond-point's ring where it crosses it), a dashed line between its two lanes where there is no median, its solid edge lines
    box(asphalt, side * mid, 0, L, BUSWAY_HALF * 2, 0.02, RD ? Y + 0.006 : Y - 0.005, RED_ASPHALT);
    for (const e of [-1, 1]) flat(side * mid, e * (BUSWAY_HALF - 0.2), L, 0.15, WHITE);
    if (RD) for (let t = 1; t < RD.ring + 1; t += 3) flat(side * t, 0, 1.6, 0.15, WHITE);                       // the dashes between its lanes, through the rond-point
    flat(side * D.busLine, 0, 0.5, BUSWAY_HALF * 2, WHITE);                                                 // the buses' stop line … painted « BUS »
    for (const lane of [-1, 1]) flat(side * (D.busLine + 3.5), lane * BUS_LANE, 2.4, 1.4, 0xf2e7c4);
    // the separator kerbs, low and solid (0.25 m: a car stops against them); on a rond-point, beyond its ring and along the island's gap (the island's halves have their own)
    const kerbRuns: [number, number][] = RD ? [[RD.ring + 1, lay.len]] : [[t0 + 2, lay.len]];
    for (const [k0, k1] of kerbRuns) for (const e of [-1, 1]) { const km = (k0 + k1) / 2; box(plain, side * km, e * (BUSWAY_HALF + 0.3), k1 - k0, 0.6, 0.25, Y - 0.02, KERB); solid(side * km, e * (BUSWAY_HALF + 0.3), k1 - k0, 0.6, 0.6); }
    // the median between the two bus lanes: a planted strip with low shrubs, except along the station island and at the mouth
    const m0 = side > 0 ? STN.t1 + 3 : D.busLine + 3.5, m1 = lay.len - PORTAL - 2;
    if (m1 > m0) {
      box(plain, side * (m0 + m1) / 2, 0, m1 - m0, 1.6, 0.22, Y, KERB);
      box(plain, side * (m0 + m1) / 2, 0, m1 - m0 - 0.4, 1.3, 0.06, Y + 0.22, 0x6f8a45);
      if (!lite) for (let t = m0 + 2; t < m1 - 1; t += 2.6) { const c = P(side * t, 0); plain.blob(0.42 + R() * 0.15, c.x, Y + 0.5, c.z, R() < 0.3 ? 0xd23a8c : 0x3f7a35, 0.7, 0); }
      solid(side * (m0 + m1) / 2, 0, m1 - m0, 1.6, 0.6);
    }
    // bollards across the busway's mouth: a bus is let through by its signal, a car never (they are solid for the player's vehicle at all times)
    // (on a rond-point the busway is not ground beyond the ring: no car can turn into it, so no bollards for the buses to drive through)
    if (!RD) {
      for (let k = -4; k <= 4; k++) { const c = P(side * (MAIN_STOP + 1), k * 1.15); plain.cyl(0.09, 0.11, 0.9, c.x, Y, c.z, k % 2 ? YEL : 0x222222, 6); }
      solid(side * (MAIN_STOP + 1), 0, 0.6, BUSWAY_HALF * 2, 0.9);
    } else for (const e of [-1, 1]) { const c = P(side * (RD.ring + 1.2), e * (BUSWAY_HALF + 0.3)); plain.cyl(0.09, 0.11, 0.9, c.x, Y, c.z, YEL, 6); }
    // the avenue's car carriageways, their pavements, their kerbs; lane dashes
    for (const e of [-1, 1]) {
      const cm = e * (KERB_OUT + CAR_OUT) / 2;
      const a0 = D.avenue0, am = (a0 + lay.len) / 2, aL = lay.len - a0, p0 = RD ? RD.ring + 4.5 : a0, pm = (p0 + lay.len) / 2, pL = lay.len - p0;
      box(asphalt, side * am, cm, aL, CAR_OUT - KERB_OUT, 0.02, Y - 0.006, 0x4d5057);
      for (let t = D.zebra + 5; t < lay.len - 4; t += 8) flat(side * t, cm, 3, 0.18, WHITE);
      box(plain, side * pm, e * (CAR_OUT + 1.4), pL, 2.8, 0.14, 0.012, RD ? 0xb76e52 : 0xcfc8b4);              // the pavements (brick on a rond-point's avenue, as on the reference)
      box(plain, side * pm, e * (AVENUE_HALF - 0.1), pL, 0.25, 1.3, 0.012, 0x9da3a8);                          // railings along the pavements
      solid(side * pm, e * (AVENUE_HALF - 0.1), pL, 0.3, 1.3);
    }
    // zebra crossings over the car carriageways and the busway, beside the main road
    for (let k = -11; k <= 11; k++) if (Math.abs(k * 1.15) < CAR_OUT) flat(side * D.zebra, k * 1.15, 2.6, 0.55, WHITE);

    // the underpass mouth at the end: the busway dips under a cross street; a concrete headwall, the dark way in, the cross street's deck over it, walls either side
    const tp = lay.len - PORTAL;
    box(plain, side * (tp + 12), 0, 24, AVENUE_HALF * 2 + 20, 0.5, 5.2, 0xbdb6a8);                                    // the deck: the cross street passes over the busway
    for (const e of [-1, 1]) { box(plain, side * (tp + 12), e * (BUSWAY_HALF + 0.5), 24, 0.8, 5.2, 0, 0xc9c2b4); solid(side * (tp + 12), e * (BUSWAY_HALF + 0.5), 24, 0.8, 5.2); box(plain, side * (tp + 12), e * ((BUSWAY_HALF + AVENUE_HALF + 10) / 2 + 0.5), 24, AVENUE_HALF + 9 - BUSWAY_HALF, 5.2, 0, 0xc9c2b4); solid(side * (tp + 12), e * ((BUSWAY_HALF + AVENUE_HALF + 10) / 2 + 0.5), 24, AVENUE_HALF + 9 - BUSWAY_HALF, 5.2); }
    box(plain, side * (tp + 0.2), 0, 0.5, BUSWAY_HALF * 2 + 1.4, 1.4, 4.2, 0xd8d2c4);                               // the headwall's lintel
    box(plain, side * (tp + 12.5), 0, 23, BUSWAY_HALF * 2 - 0.2, 4.6, -0.05, 0x101114);                              // the darkness under the deck (a box: nothing seen through it)
    flat(side * (tp + 0.6), 0, 0.3, BUSWAY_HALF * 2 - 0.4, 0x2a2a2c, Y + 0.003);
    // the cross street beyond, and the apartment blocks that close the view down the avenue
    for (const e of [-1, 0, 1]) {
      const h = 14 + R() * 10, col = [0xf1e6d2, 0xe8d8b8, 0xdfe6e8, 0xd9a47c][Math.floor(R() * 4)];
      box(plain, side * (lay.len + 18), e * 19, 14, 17, h, 0, col);
      box(plain, side * (lay.len + 18), e * 19, 14.4, 17.4, 0.4, h, 0xd8d2c4);
      solid(side * (lay.len + 18), e * 19, 14, 17, h);
    }
    // the avenue's frontage: apartment blocks 4–9 floors and shops set behind the pavements
    for (let t = D.front; t < lay.len - 14; t += 15 + R() * 4) for (const e of [-1, 1]) {
      const h = 3.2 * (3 + Math.floor(R() * 6)), w = 11 + R() * 3, col = [0xf1e6d2, 0xe9cfae, 0xdfe6e8, 0xf4efe6, 0xe3c9a6, 0xc7d5df][Math.floor(R() * 6)];
      const lat = e * (AVENUE_HALF + 2 + w / 2);
      box(plain, side * t, lat, 12, w, h, 0, col);
      box(plain, side * t, lat, 12.3, w + 0.3, 0.3, h, 0xd8d2c4);
      if (!lite) for (let f = 1; f < h / 3.2; f++) box(plain, side * t, e * (AVENUE_HALF + 1.6), 7, 1.0, 0.15, f * 3.2, 0xd8d2c4);   // balconies
      box(plain, side * t, e * (AVENUE_HALF + 1.95), 10, 0.1, 0.6, 2.7, [0xd9482b, 0x1e6fd9, 0x2f8f4e, 0xf4c20d][Math.floor(R() * 4)]);   // shop boards
      solid(side * t, lat, 12, w, h);
    }
  }

  // the station island (on the +1 side): raised platform, checkered paving, railings, a long canopy on steel columns, the gates at its end toward the crossing
  const st0 = STN.t0, st1 = STN.t1, sm = (st0 + st1) / 2, sl = st1 - st0;
  box(plain, sm, 0, sl, STN.half * 2, 0.32, Y, 0xcfc8b8);
  if (!lite) for (let t = st0 + 0.5; t < st1 - 0.5; t += 1) for (const l of [-0.75, 0.25]) { const odd = (Math.round(t) + (l > 0 ? 1 : 0)) % 2; flat(t, l + 0.25, 0.98, 0.98, odd ? 0x2c2c2e : 0xeeeae0, Y + 0.325); }
  for (const e of [-1, 1]) {
    box(plain, sm, e * (STN.half - 0.05), sl, 0.06, 1.05, Y + 0.32, STEEL);
    for (let t = st0 + 1; t < st1; t += 2) box(plain, t, e * (STN.half - 0.05), 0.06, 0.06, 1.05, Y + 0.32, STEEL);
  }
  for (let t = st0 + 2; t <= st1 - 2; t += 7.5) box(plain, t, 0, 0.3, 0.3, 3.6, Y + 0.32, 0x5c6066);
  box(plain, sm, 0, sl + 2, STN.half * 2 + 3.2, 0.25, Y + 3.9, 0xe6e2da);                                        // the canopy, wider than the island (it shelters the doors)
  box(plain, sm, 0, sl + 2.2, STN.half * 2 + 3.4, 0.35, Y + 4.15, 0x3b4048);
  box(plain, st0 + 0.5, 0, 1, 2.6, 2.2, Y + 0.32, 0x5c6066);                                                     // the gates and the ticket machine at its end
  box(plain, st0 + 0.5, 0.9, 0.6, 0.7, 1.6, Y + 0.32, 0xd23a2a);
  box(plain, sm, 0, 3, 0.5, 1.0, Y + 2.8, 0x0f6b3a);                                                            // the name board under the canopy
  solid(sm, 0, sl, STN.half * 2, 1.4);
  const look = () => [0x2f6fa8, 0xd66532, 0xeee8da, 0xc2417f, 0x2e8b57, 0xf1f1ee][Math.floor(R() * 6)];
  for (let k = 0; k < (lite ? 2 : 5); k++) {
    const t = st0 + 4 + R() * (sl - 8), c = P(t, (R() - 0.5) * 1.6);
    people.push({ x: c.x, z: c.z, yaw: yaw + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5), clip: R() < 0.5 ? 'Talk' : 'Idle', y: Y + 0.32, look: { skin: 0x5b3420, style: R() < 0.4 ? 'dress' : 'tee', top: look(), bottom: 0x2b3a55, female: R() < 0.5 } });
  }
  // the crossing's signals: four poles (both ways on the main road, both ways on the busway); their lamps are lit by BrtLine
  for (const c of [...HEADS(lay).main, ...HEADS(lay).bus]) {
    plain.cyl(0.08, 0.1, 3.4, c.x, 0, c.z, 0x3e4349, 6); colliders.push({ x0: c.x - 0.25, x1: c.x + 0.25, z0: c.z - 0.25, z1: c.z + 0.25, h: 3.4 });
  }
}

/** Where the signal heads stand (road frame): the main road's for the a → b and b → a traffic, and the busway's. */
const HEADS = (lay: BrtLayout) => {
  const D = brtDims(lay), r = lay.round;
  return r ? {
    // on a rond-point: the ring's heads on its outer edge just before each stop line (a → b goes round on the road's right, the −t side), the buses' beyond the ring
    main: [lay.at(-(r.ring + 1.2), D.mainStop + 1.5), lay.at(r.ring + 1.2, -(D.mainStop + 1.5))],
    bus: [lay.at(D.busLine, -(BUSWAY_HALF + 0.7)), lay.at(-D.busLine, BUSWAY_HALF + 0.7)],
  } : {
    main: [lay.at(-(AVENUE_HALF + 0.5), -7.5), lay.at(AVENUE_HALF + 0.5, 7.5)],
    bus: [lay.at(MAIN_STOP + 2.5, -(BUSWAY_HALF + 0.7)), lay.at(-(MAIN_STOP + 2.5), BUSWAY_HALF + 0.7)],
  };
};

/** An electric articulated bus in the SUNUBRT livery: white body, a yellow cap and roof, a green band, a red skirt, dark glass, the accordion joint. */
export function makeBrtBus(lite: boolean): { group: THREE.Group; dispose(): void } {
  const b = new Batch(), half = BUS.length / 2, W = BUS.width;
  const WHITE_B = 0xf3f2ee, YELLOW = 0xf2c10f, GREEN = 0x1f8a4c, RED = 0xd23a2a, GLASS = 0x1e2a33;
  for (const [z0, z1] of [[-half, -0.6], [0.6, half]]) {
    const L = z1 - z0, cz = (z0 + z1) / 2;
    b.box(W, 2.7, L, 0, 0.45, cz, WHITE_B);
    b.box(W + 0.02, 0.35, L, 0, 0.45, cz, RED);                                                                    // the red skirt
    b.box(W + 0.03, 0.45, L * 0.92, 0, 1.0, cz, GREEN);                                                          // the green band under the windows
    b.box(W + 0.04, 1.05, L - 0.6, 0, 1.6, cz, GLASS);                                                           // the windows
    b.box(W - 0.1, 0.12, L - 0.2, 0, 3.15, cz, YELLOW);                                                          // the roof
    if (!lite) b.box(1.4, 0.35, L * 0.5, 0, 3.2, cz, 0xdedcd6);                                                  // roof batteries
    for (const wz of [z0 + 1.6, z1 - 1.8]) for (const sx of [-1, 1]) b.cyl(0.5, 0.5, 0.36, sx * (W / 2 - 0.12), 0.5, wz, 0x1a1a1c, 10, [0, 0, Math.PI / 2]);
  }
  b.box(W - 0.3, 2.5, 1.3, 0, 0.55, 0, 0x2b2d30);                                                                // the accordion
  b.box(W + 0.02, 1.35, 0.15, 0, 1.75, half, YELLOW);                                                           // the yellow cap of the front
  b.box(W - 0.2, 1.0, 0.12, 0, 1.85, half + 0.04, GLASS);                                                       // the windscreen
  b.box(W - 0.6, 0.3, 0.1, 0, 2.95, half + 0.05, 0x111111);                                                     // the destination display…
  b.box(W - 0.8, 0.14, 0.11, 0, 3.02, half + 0.06, 0xf2a02a);                                                   // …lit amber
  for (const sx of [-1, 1]) b.box(0.35, 0.18, 0.1, sx * 0.9, 0.85, half + 0.04, 0xfff3c8);                       // headlights
  b.box(W, 0.6, 0.12, 0, 2.3, -half - 0.02, YELLOW);                                                            // the rear
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = b.build(mat, true, true)!, group = new THREE.Group(); group.add(mesh); group.name = 'brt-bus';
  return { group, dispose() { mesh.geometry.dispose(); mat.dispose(); } };
}

type Phase = 'main' | 'mainAmber' | 'allRed' | 'bus' | 'busEnd';
interface Bus { g: THREE.Group; dir: 1 | -1; t: number; v: number; state: 'hidden' | 'run' | 'dwell'; wait: number; dwelt: boolean; crossed: boolean }

export interface BrtWorld {
  /** The player's vehicle or body (road frame), or null. */
  player: Pt | null;
  /** Is anything of the road traffic standing in this road-frame circle? */
  trafficAt(x: number, z: number, r: number): boolean;
}

/**
 * The corridor's moving parts: its two buses and its signal. Light: two merged bus meshes, four lamp heads; nothing saved (like the road traffic).
 */
export class BrtLine {
  readonly group = new THREE.Group();
  private buses: Bus[] = [];
  private phase: Phase = 'main';
  private phaseT = 0;
  private sinceBus = 99;
  private lamps: { main: THREE.Mesh[]; bus: THREE.Mesh[] };
  private lampMats: Record<'red' | 'amber' | 'green' | 'off' | 'bar', THREE.MeshBasicMaterial>;
  private disposables: { dispose(): void }[] = [];
  /** Checks: what happened (crossings made, dwells, waits for something in the crossing). */
  readonly stats = { crossings: 0, dwells: 0, heldForCrossing: 0, phases: 0 };

  constructor(readonly lay: BrtLayout, lite: boolean, private rand: () => number) {
    this.group.name = 'brt-line';
    for (const dir of [1, -1] as const) {
      const bus = makeBrtBus(lite); this.disposables.push(bus); this.group.add(bus.group); bus.group.visible = false;
      this.buses.push({ g: bus.group, dir, t: 0, v: 0, state: 'hidden', wait: dir > 0 ? 2 : 22, dwelt: false, crossed: false });
    }
    const m = (c: number) => { const x = new THREE.MeshBasicMaterial({ color: c }); this.disposables.push(x); return x; };
    this.lampMats = { red: m(0xff2a1a), amber: m(0xffa516), green: m(0x2aff6a), off: m(0x222326), bar: m(0xf5f5f0) };
    const heads = HEADS(lay), yaw = Math.atan2(lay.ux, lay.uz);
    const headGeo = new THREE.BoxGeometry(0.34, 0.95, 0.3), lampGeo = new THREE.BoxGeometry(0.2, 0.2, 0.06); this.disposables.push(headGeo, lampGeo);
    const housing = m(0x1b1c1f);
    const head = (p: Pt, facing: number, n: number): THREE.Mesh[] => {
      const g = new THREE.Group(); g.position.set(p.x, 3.3, p.z); g.rotation.y = facing; this.group.add(g);
      const box = new THREE.Mesh(headGeo, housing); box.position.y = 0.47; g.add(box);
      const out: THREE.Mesh[] = [];
      for (let k = 0; k < n; k++) { const l = new THREE.Mesh(lampGeo, this.lampMats.off); l.position.set(0, 0.8 - k * 0.3, 0.16); g.add(l); out.push(l); }
      return out;
    };
    // the main road's heads face the traffic arriving at them; the bus heads (a white bar: go, horizontal: stop — like a real BRT signal) face the buses
    const roadYaw = Math.atan2(lay.fx, lay.fz);
    this.lamps = {
      main: [...head(heads.main[0], roadYaw + Math.PI, 3), ...head(heads.main[1], roadYaw, 3)],
      bus: [...head(heads.bus[0], yaw, 2), ...head(heads.bus[1], yaw + Math.PI, 2)],
    };
    this.paint();
  }

  /** The main road's signal for traffic going `dir` (a → b is +1): the stop line's arc length and whether to stop there. */
  signal(dir: 1 | -1): { stopS: number; stop: boolean; amber: boolean } {
    const stop = this.phase !== 'main';
    return { stopS: this.lay.s - dir * brtDims(this.lay).mainStop, stop, amber: this.phase === 'mainAmber' };
  }
  get phaseName() { return this.phase; }

  private paint() {
    const L = this.lampMats, p = this.phase;
    const main = p === 'main' ? 'green' : p === 'mainAmber' ? 'amber' : 'red';
    for (let k = 0; k < this.lamps.main.length; k++) { const slot = k % 3; this.lamps.main[k].material = (slot === 0 && main === 'red') || (slot === 1 && main === 'amber') || (slot === 2 && main === 'green') ? L[main] : L.off; }
    for (let k = 0; k < this.lamps.bus.length; k++) { const slot = k % 2; this.lamps.bus[k].material = (slot === 0 && p !== 'bus') ? L.red : (slot === 1 && p === 'bus') ? L.bar : L.off; }
  }
  private go(p: Phase) { this.phase = p; this.phaseT = 0; this.stats.phases++; this.paint(); }

  /** The crossing (the main road's carriageway across the busway) is clear of the player and the road traffic. */
  private crossingClear(w: BrtWorld): boolean {
    const span = brtDims(this.lay).cross;
    for (let t = -span; t <= span; t += 3) for (const lat of [-BUS_LANE, BUS_LANE]) {
      const p = this.lay.at(t, lat);
      if (w.player && Math.hypot(p.x - w.player.x, p.z - w.player.z) < 3.2) return false;
      if (w.trafficAt(p.x, p.z, 2.6)) return false;
    }
    return true;
  }

  private place(b: Bus) {
    const lane = -b.dir * BUS_LANE;                                                    // right-hand: the bus going +t keeps to the −lat side
    const p = this.lay.at(b.t, lane), yaw = Math.atan2(this.lay.ux * b.dir, this.lay.uz * b.dir);
    b.g.position.set(p.x, 0.08, p.z); b.g.rotation.y = yaw;
  }

  update(dt: number, w: BrtWorld, near: boolean) {
    this.phaseT += dt; this.sinceBus += dt;
    const L = this.lay.len, half = BUS.length / 2, start = L - PORTAL + 6, D = brtDims(this.lay), BUS_AT = D.busStop, STN = D.station;
    let request = false;
    for (const b of this.buses) {
      if (b.state === 'hidden') {
        b.wait -= dt; b.g.visible = false;
        // a bus comes out of the underpass only when the player is near enough to see it (both out of view: they wait), and never onto the other bus
        if (b.wait <= 0 && near) { b.state = 'run'; b.t = -b.dir * start; b.v = 7; b.dwelt = false; b.crossed = false; b.g.visible = true; this.place(b); }
        continue;
      }
      // where it must stop next, in its own forward coordinate (crossing at 0): its stop line (until it has crossed), the station (once), the far underpass (where it vanishes).
      // Going +t the island comes after the crossing; going −t, before it.
      const front = b.t * b.dir + half, stationAt = b.dir > 0 ? STN.t1 - 1 : -(STN.t0 + 1);
      let target = Infinity;
      if (!b.dwelt && front <= stationAt + 0.3) target = stationAt;
      if (!b.crossed) {
        const line = -BUS_AT, ready = b.dwelt || b.dir > 0;
        if (front < line + 1) {
          if (ready && front > line - 45) request = true;
          if (this.phase !== 'bus' || !this.crossingClear(w)) { target = Math.min(target, line); if (this.phase === 'bus' && front > line - 2) this.stats.heldForCrossing++; }
        }
        if (b.t * b.dir - half > BUS_AT) { b.crossed = true; this.stats.crossings++; }
      }
      // the player or a car in its lane ahead (it never drives into anything)
      for (let d = 2; d < 14; d += 2) {
        const p = this.lay.at(b.dir * (front + d), -b.dir * BUS_LANE);
        if ((w.player && Math.hypot(p.x - w.player.x, p.z - w.player.z) < 2.6) || w.trafficAt(p.x, p.z, 1.6)) { target = Math.min(target, front + d - 3); break; }
      }
      if (b.state === 'dwell') {
        b.wait -= dt; b.v = 0;
        if (b.wait <= 0) { b.state = 'run'; b.dwelt = true; }
      } else {
        const gap = target - front, want = gap === Infinity ? 11 : gap < 0.4 ? 0 : Math.min(11, Math.sqrt(2 * 1.6 * Math.max(0, gap - 0.3)));
        b.v += Math.max(-4 * dt, Math.min(1.4 * dt, want - b.v));
        if (b.v < 0.02 && want === 0) b.v = 0;
        b.t += b.dir * b.v * dt;
        if (!b.dwelt && b.v === 0 && Math.abs(front - stationAt) < 1.2) { b.state = 'dwell'; b.wait = 9 + this.rand() * 5; this.stats.dwells++; }
        if (b.t * b.dir > L - PORTAL + 10) { b.state = 'hidden'; b.wait = 35 + this.rand() * 25; b.g.visible = false; continue; }
      }
      this.place(b);
    }
    // the signal: the main road keeps green until a bus asks; then amber, all red, the bus's phase while it crosses, all red, back to green (at least 12 s of green between)
    switch (this.phase) {
      case 'main': if (request && this.sinceBus > 12) this.go('mainAmber'); break;
      case 'mainAmber': if (this.phaseT > 2.5) this.go('allRed'); break;
      case 'allRed': if (this.phaseT > 1.5) this.go('bus'); break;
      case 'bus': {
        const crossing = this.buses.some(b => b.state !== 'hidden' && !b.crossed && b.t * b.dir + BUS.length / 2 > -brtDims(this.lay).busStop - 1);
        if ((!crossing && this.phaseT > 5) || this.phaseT > 30) this.go('busEnd');
        break;
      }
      case 'busEnd': if (this.phaseT > 1.5) { this.go('main'); this.sinceBus = 0; } break;
    }
  }

  /** The buses' footprints (road frame + offset), for the player's vehicle: a bus is solid. */
  footprints(out: Footprint[], x: number, z: number, range: number, dx: number, dz: number) {
    for (const b of this.buses) {
      if (b.state === 'hidden') continue;
      const p = b.g.position; if ((p.x - x) ** 2 + (p.z - z) ** 2 > range * range) continue;
      out.push({ x: p.x + dx, z: p.z + dz, yaw: b.g.rotation.y, hl: BUS.length / 2, hw: BUS.width / 2 });
    }
  }
  /** Is a bus standing in this road-frame circle (for the road traffic and the checks)? */
  busAt(x: number, z: number, r: number): boolean {
    for (const b of this.buses) {
      if (b.state === 'hidden') continue;
      const dx = x - b.g.position.x, dz = z - b.g.position.z, f = Math.sin(b.g.rotation.y) * dx + Math.cos(b.g.rotation.y) * dz, l = Math.cos(b.g.rotation.y) * dx - Math.sin(b.g.rotation.y) * dz;
      if (Math.abs(f) < BUS.length / 2 + r && Math.abs(l) < BUS.width / 2 + r) return true;
    }
    return false;
  }
  info() { return { phase: this.phase, buses: this.buses.map(b => ({ dir: b.dir, t: Math.round(b.t * 10) / 10, v: Math.round(b.v * 10) / 10, state: b.state, crossed: b.crossed, dwelt: b.dwelt, x: b.g.position.x, z: b.g.position.z })), ...this.stats }; }
  dispose() { this.group.removeFromParent(); for (const d of this.disposables) d.dispose(); this.buses = []; }
}
