import * as THREE from 'three';
import { Batch } from '../world/batch';
import type { Site } from '../world/sites';
import { rng } from '../core/rng';
import { randomLook, type PersonLook } from '../actors/humanoid';
import * as P from '../activity/primitives';
import { dibi as dibiRecipe, dibiCounters, isEvening, REGULAR_MEALS, type PlayJob } from '../activity/templates';
import type { Target } from '../interact/types';
import { GrillShift, doneness, shiftPay, GOLDEN, BURNT, type FlipResult } from './grill';
import { isOpen } from '../activity/places';
import { VenueKit, Smoke, glowQuad } from './kit';
import { Cast, type Role } from './cast';
import { conversation, counter, nightOf, relate, type Venue, type VenueEnv } from './venue';
import { OWNER_BYE, ownerGreeting, ownerNews, ownerSpecial, ownerWork, type OwnerCtx } from './talk';

/**
 * A Dibi (dibiterie) on a lot of the hub (src/world/sites.ts), open-air in the Dakar way: a painted low wall on the two
 * streets, the charcoal grill smoking at the corner where everybody sees it, the butcher's counter under the concrete
 * roof at the back, long wooden tables with benches and plastic tables under a rusty tin roof, a hand-wash kettle, a
 * TV for the evening, a string of bulbs. Order at the counter (pay → the meat is grilled → sit at a free table → eat →
 * stay seated), help at the grill (a ladder of better-paid jobs), talk to the owner, come back for the day's special,
 * the regular's price and the evening attaya. Open 11 h–2 h; lively at night.
 *
 * Local frame (VenueKit): the lot is 22 × 22 m, front street toward +z, side street toward −x.
 */
export interface DibiStyle { owner: string; ownerId: string; lower: number; upper: number; sign: string; signFg: string }
export const DIBI_STYLES: Record<string, DibiStyle> = {
  pikine: { owner: 'Pathé', ownerId: 'pathe', lower: 0x2f7f8f, upper: 0xefe4c8, sign: '#7c2d12', signFg: '#fff3d6' },
  plateau: { owner: 'Aliou', ownerId: 'aliou', lower: 0x8a3b2b, upper: 0xf1e6d2, sign: '#14532d', signFg: '#f6efd8' },
};

const G0 = 0.13;            // top of the lot's ground slab
const SEAT = 0.57;          // bench and chair tops (the Sit clip's feet rest on the floor)
const OWNER_LOOK: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0xf2f2ec, bottom: 0x2b2f3a, hat: 'kufi', hatColor: 0xd9d2c4, beard: 0x1a1414, heavy: 0.5, shoes: 0x3a2a1e };
const COOK_LOOK: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xd9322b, bottom: 0x1c1c1f, muscular: 0.4, shoes: 0x1c1c1f };

export function buildDibi(env: VenueEnv, site: Site): Venue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const hub = world.id, style = DIBI_STYLES[hub] ?? DIBI_STYLES.pikine;
  const id = `${hub}:venue:${site.key}`;
  const cx = (site.x0 + site.x1) / 2, cz = (site.z0 + site.z1) / 2;
  const yaw = Math.atan2(site.front.x, site.front.z);
  const k = new VenueKit({ x: cx, z: cz }, yaw);
  const { plain: Pl, wall: Wa, block: Bl, tin: Ti, wood: Wd, floor: Fl, metal: Me, glow: Gl } = k.b;
  const R = rng(hub.length * 97 + 11);

  // ---------------------------------------------------------------- ground and walls
  Fl.box(21.6, 0.012, 21.6, 0, G0 - 0.005, 0, 0xb9b3a6);                                   // cement floor
  Pl.flat(4.6, 3.4, -8, G0 + 0.011, 8.4, 0x6f665a);                                         // soot and trampled ash by the grill
  const lowWall = (x0: number, z0: number, x1: number, z1: number, h = 1.0) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, t = 0.22;
    const w = alongX ? Math.abs(x1 - x0) : t, d = alongX ? t : Math.abs(z1 - z0);
    Wa.box(w, h, d, mx, G0 - 0.02, mz, style.upper);
    Wa.box(w + 0.02, 0.42, d + 0.02, mx, G0 - 0.02, mz, style.lower);
    Pl.box(w + 0.06, 0.07, d + 0.08, mx, G0 - 0.02 + h, mz, 0xd8cfbd);
    k.solid(mx, mz, w, d, h);
  };
  lowWall(-10.9, 10.75, -5.2, 10.75); lowWall(0.6, 10.75, 10.9, 10.75);                    // front street, wide entrance
  lowWall(-10.75, -6.0, -10.75, -0.6); lowWall(-10.75, 3.2, -10.75, 10.9);                 // side street, side entrance
  for (const [x, z] of [[-5.2, 10.75], [0.6, 10.75], [-10.75, -0.6], [-10.75, 3.2]] as const) { Wa.box(0.4, 1.35, 0.4, x, G0 - 0.02, z, style.upper); Pl.box(0.46, 0.08, 0.46, x, G0 + 1.33, z, 0xd8cfbd); }
  Bl.box(22, 2.6, 0.25, 0, G0 - 0.02, -10.85, 0xe4dfd4); k.solid(0, -10.85, 22, 0.25, 2.6);  // raw blocks toward the neighbours
  Bl.box(0.25, 2.6, 22, 10.85, G0 - 0.02, 0, 0xe4dfd4); k.solid(10.85, 0, 0.25, 22, 2.6);

  // ---------------------------------------------------------------- kitchen and butcher's counter (back)
  const KX0 = -10.75, KX1 = 3.6, KZ0 = -10.7, KZ1 = -6.0;
  Wa.box(0.25, 3.1, KZ1 - KZ0, KX0, G0 - 0.02, (KZ0 + KZ1) / 2, style.upper); Wa.box(0.27, 1.2, KZ1 - KZ0, KX0, G0 - 0.02, (KZ0 + KZ1) / 2, style.lower);
  Wa.box(0.25, 3.1, KZ1 - KZ0, KX1, G0 - 0.02, (KZ0 + KZ1) / 2, style.upper); Wa.box(0.27, 1.2, KZ1 - KZ0, KX1, G0 - 0.02, (KZ0 + KZ1) / 2, style.lower);
  Wa.box(KX1 - KX0, 3.1, 0.2, (KX0 + KX1) / 2, G0 - 0.02, KZ0 + 0.1, style.upper); Wa.box(KX1 - KX0, 1.2, 0.22, (KX0 + KX1) / 2, G0 - 0.02, KZ0 + 0.11, 0xf2f0ea);  // white tiles behind the counter
  Pl.slab(KX1 - KX0 + 0.6, 0.2, KZ1 - KZ0 + 0.9, (KX0 + KX1) / 2, G0 + 3.18, (KZ0 + KZ1) / 2 + 0.3, 0xd2cdc2);   // concrete roof
  Wa.box(KX1 - KX0 + 0.6, 0.5, 0.12, (KX0 + KX1) / 2, G0 + 2.83, KZ1 + 0.78, style.lower);                      // fascia
  k.solid(KX0, (KZ0 + KZ1) / 2, 0.3, KZ1 - KZ0, 3); k.solid(KX1, (KZ0 + KZ1) / 2, 0.3, KZ1 - KZ0, 3);
  // counter: white tiled front, wooden top; a fridge and drink crates close the rest of the front
  Wa.box(8.4, 1.05, 0.7, -4.8, G0 - 0.02, -6.55, 0xf4f2ee); Wd.box(8.6, 0.07, 0.86, -4.8, G0 + 1.03, -6.55, 0x6b4a2e);
  for (let n = 0; n < 14; n++) Pl.box(0.02, 1.0, 0.01, -8.9 + n * 0.6, G0, -6.19, 0xd8d4cc);                  // tile joints
  k.solid(-4.8, -6.55, 8.4, 0.75, 1.1);
  Pl.box(0.9, 1.9, 0.7, 1.0, G0, -6.55, 0xe9e9e6); Gl.box(0.7, 1.3, 0.02, 1.0, G0 + 0.45, -6.19, 0xdbeef6);    // fridge with a lit glass door
  for (let n = 0; n < 4; n++) for (let m = 0; m < 3; m++) Pl.cyl(0.035, 0.035, 0.22, 0.78 + m * 0.2, G0 + 0.5 + n * 0.3, -6.3, n % 2 ? 0xa3162a : 0xc4372b, 6);   // bissap bottles
  for (let n = 0; n < 3; n++) Pl.box(0.5, 0.3, 0.4, 2.4 + (n % 2) * 0.1, G0 + n * 0.3, -6.5, n % 2 ? 0xf4c20d : 0xd9322b);  // crates
  Wd.box(1.6, 0.9, 0.5, -9.8, G0, -6.5, 0x7a5a3c); k.solid(-9.8, -6.5, 1.6, 0.6, 1);                           // sink cabinet
  k.solid(2.0, -6.5, 3.2, 0.8, 2);
  // behind the counter: meat on the rail, chopping block, chest freezer, the menu board
  Pl.box(5.8, 0.04, 0.04, -5.2, G0 + 2.25, -8.4, 0x9a9a9a);
  for (let n = 0; n < 6; n++) { Pl.box(0.02, 0.28, 0.02, -7.6 + n * 0.95, G0 + 1.98, -8.4, 0x9a9a9a); Pl.blob(0.2, -7.6 + n * 0.95, G0 + 1.72, -8.4, n % 2 ? 0x9c3a2e : 0xb24b3a, 1.7, 0); }
  Wd.cyl(0.32, 0.36, 0.85, -2.4, G0, -8.0, 0x8a6a48, 10); Pl.box(0.3, 0.03, 0.08, -2.35, G0 + 0.86, -8.0, 0xbfc3c6);
  Pl.box(1.4, 0.85, 0.7, -9.2, G0, -9.9, 0xf2f2ee); Pl.box(1.42, 0.05, 0.72, -9.2, G0 + 0.85, -9.9, 0xd8dde0);
  k.sign('DIBI MOUTON · BROCHETTES · BISSAP', '#f6efd8', '#7c2d12', -4.8, G0 + 2.15, KZ0 + 0.22, 0, 5.2, 0.62);
  k.sign('BOUCHERIE · DIBITERIE', style.sign, style.signFg, -3.6, G0 + 2.83, KZ1 + 0.85, 0, 5.4, 0.42);
  Pl.box(1.3, 0.05, 0.1, -4.8, G0 + 2.95, -8.2, 0xdddddd); Gl.box(1.2, 0.04, 0.06, -4.8, G0 + 2.9, -8.2, 0xeaf6ff);   // tube
  // the rolling shutter is down when the Dibi is closed
  const shutterB = new Batch();
  shutterB.box(KX1 - KX0 - 0.3, 2.65, 0.06, (KX0 + KX1) / 2, G0, KZ1 + 0.42, 0x8a9096);
  for (let n = 0; n < 9; n++) shutterB.box(KX1 - KX0 - 0.3, 0.03, 0.08, (KX0 + KX1) / 2, G0 + 0.2 + n * 0.28, KZ1 + 0.43, 0x6a7076);
  const shutter = shutterB.build(mats.m.metal, true, true)!; k.group.add(shutter); k.keep(shutter.geometry);

  // ---------------------------------------------------------------- the grill (corner of the two streets)
  const GX = -8.0, GZ = 8.6;
  Pl.box(2.8, 0.62, 0.8, GX, G0, GZ, 0x9a4b32);                                                      // brick base
  for (let n = 0; n < 4; n++) Pl.box(2.82, 0.015, 0.82, GX, G0 + 0.15 + n * 0.15, GZ, 0xd8c8b4);       // mortar lines
  Pl.box(2.9, 0.18, 0.9, GX, G0 + 0.62, GZ, 0x2a2a2a);                                                // metal trough
  for (let n = 0; n < 13; n++) Pl.box(0.025, 0.025, 0.88, GX - 1.35 + n * 0.225, G0 + 0.86, GZ, 0xa8a8a8);   // grate
  for (let n = 0; n < 9; n++) { Pl.box(0.24, 0.07, 0.16, GX - 1.1 + n * 0.28, G0 + 0.88, GZ - 0.18 + (n % 3) * 0.17, n % 2 ? 0x6b2e14 : 0x8a4a24); }
  for (let n = 0; n < 6; n++) Pl.box(0.02, 0.02, 0.86, GX - 1.2 + n * 0.45, G0 + 0.93, GZ, 0xc8c8c8);  // skewers
  k.solid(GX, GZ, 2.9, 0.95, 1);
  const emberMat = k.keep(new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  const embers = k.mesh(new THREE.BoxGeometry(2.6, 0.03, 0.72), emberMat); embers.position.set(GX, G0 + 0.82, GZ);
  const emberPool = glowQuad(k, 5, 5, 0xff7a2a, GX, G0 + 0.03, GZ - 0.6);
  const heat = glowQuad(k, 3.6, 1.8, 0xff8a3a, GX, G0 + 1.2, GZ, false);
  Pl.box(0.55, 0.75, 0.45, -10.2, G0, 9.9, 0xe8e4d8); Pl.box(0.5, 0.6, 0.42, -9.6, G0, 10.1, 0xece6da);     // charcoal sacks
  for (let n = 0; n < 5; n++) Wd.box(0.9, 0.1, 0.1, -10.1, G0 + n * 0.1, 7.6 + (n % 2) * 0.12, 0x6a4a2c, 0.2 * (n % 3));  // firewood
  Wd.box(0.6, 0.82, 1.2, -10.1, G0, 6.6, 0x7a5a3c); Pl.box(0.45, 0.06, 0.8, -10.1, G0 + 0.82, 6.6, 0xbfc3c6);   // prep table, tray
  for (let n = 0; n < 6; n++) Pl.blob(0.07, -10.15 + (n % 2) * 0.12, G0 + 0.9, 6.35 + n * 0.1, n < 3 ? 0xb24b3a : 0xf0e6c8, 0.7, 0);  // meat, onions
  Pl.cyl(0.04, 0.04, 0.18, -9.95, G0 + 0.85, 7.05, 0xf4c20d, 6);                                       // mustard
  k.solid(-10.1, 6.6, 0.7, 1.3, 1);
  Pl.box(0.08, 2.7, 0.08, -10.45, G0, 8.0, 0x3d4047); Pl.box(0.6, 0.06, 0.06, -10.17, G0 + 2.68, 8.0, 0x3d4047);   // bulb on a post
  Gl.sphere(0.09, -9.9, G0 + 2.56, 8.0, 0xfff1c8);

  // ---------------------------------------------------------------- tin roof over the tables
  const SX0 = -2.0, SX1 = 10.6, SZ0 = -5.6, SZ1 = 9.8;
  Ti.slab(SX1 - SX0 + 0.4, 0.05, SZ1 - SZ0 + 0.4, (SX0 + SX1) / 2, G0 + 2.95, (SZ0 + SZ1) / 2, 0xe2dcd2, 0, 0.035);
  for (const x of [-1.8, 4.4, 10.35]) for (const z of [-5.4, 2.1, 9.6]) {
    Pl.cyl(0.06, 0.06, 2.95, x, G0, z, 0x3a5a6a, 6); k.solid(x, z, 0.2, 0.2, 2.8);
  }
  for (const z of [-5.4, 2.1, 9.6]) Pl.box(SX1 - SX0, 0.1, 0.08, (SX0 + SX1) / 2, G0 + 2.8, z, 0x3a5a6a);     // beams
  // string of bulbs along the open sides, two tubes under the roof (own material: on at night, off when closed)
  const lightsB = new Batch();
  for (let x = SX0 + 0.3; x < SX1; x += 0.75) lightsB.sphere(0.06, x, G0 + 2.68 + Math.sin((x - SX0) * 0.5) * 0.05, SZ1 - 0.1, [0xfff1c8, 0xffd27a, 0xffe9b0][Math.round(x * 4) % 3]);
  for (let z = SZ0 + 0.4; z < SZ1; z += 0.75) lightsB.sphere(0.06, SX0 + 0.1, G0 + 2.68 + Math.sin(z * 0.5) * 0.05, z, [0xfff1c8, 0xffd27a, 0xffe9b0][Math.round(z * 4 + 99) % 3]);
  for (const x of [1.3, 7.6]) { Pl.box(1.3, 0.05, 0.1, x, G0 + 2.72, 2.1, 0xdddddd); lightsB.box(1.2, 0.04, 0.06, x, G0 + 2.67, 2.1, 0xeaf6ff); }
  lightsB.box(0.06, 0.5, 0.86, 10.585, G0 + 1.95, 2.1, 0x34597a);                                       // TV screen
  Pl.box(0.12, 0.6, 1.0, 10.66, G0 + 1.9, 2.1, 0x1d1d1f);
  const lightsMat = k.keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const lights = lightsB.build(lightsMat, false, false)!; k.group.add(lights); k.keep(lights.geometry);
  const shedPool = glowQuad(k, 13, 15, 0xffc27a, (SX0 + SX1) / 2, G0 + 0.02, (SZ0 + SZ1) / 2);

  // ---------------------------------------------------------------- tables and seats
  const seatIds: string[] = [];
  const longTable = (name: string, x: number, z: number) => {
    Wd.box(2.6, 0.06, 0.8, x, G0 + 0.78, z, 0x8a6040);
    for (const dx of [-1.15, 1.15]) for (const dz of [-0.3, 0.3]) Wd.box(0.07, 0.78, 0.07, x + dx, G0, z + dz, 0x6b4a2e);
    for (const s of [-1, 1]) {
      Wd.box(2.6, 0.06, 0.34, x, G0 + 0.5, z + s * 0.75, 0x7a5434);
      for (const dx of [-1.1, 1.1]) Wd.box(0.06, 0.5, 0.3, x + dx, G0, z + s * 0.75, 0x6b4a2e);
      seatIds.push(...k.bench(`${id}:${name}${s > 0 ? 'n' : 's'}`, x, z + s * 0.78, s > 0 ? Math.PI : 0, 2.6, 3, SEAT).map(q => q.id));
    }
    k.solid(x, z, 2.7, 1.9, 0.9);
    // what is on the table: a napkin box, mustard, a bottle, a plate left by someone
    Pl.box(0.16, 0.08, 0.1, x - 0.3, G0 + 0.84, z, 0xf2f2ee); Pl.cyl(0.035, 0.035, 0.16, x + 0.1, G0 + 0.84, z + 0.05, 0xf4c20d, 6);
    Pl.cyl(0.04, 0.04, 0.24, x + 0.5, G0 + 0.84, z - 0.1, 0xa3162a, 6); Pl.cyl(0.16, 0.16, 0.015, x - 0.85, G0 + 0.84, z + 0.18, 0xf4f1e8, 10);
  };
  const plasticTable = (name: string, x: number, z: number, col: number) => {
    Pl.box(0.8, 0.04, 0.8, x, G0 + 0.78, z, col); Pl.cyl(0.04, 0.05, 0.78, x, G0, z, col, 6); Pl.cyl(0.25, 0.25, 0.02, x, G0, z, col, 10);
    for (const s of [-1, 1]) {
      const sx = x + s * 0.74, yawL = s > 0 ? -Math.PI / 2 : Math.PI / 2, cc = s > 0 ? 0x1a9d54 : col;
      Pl.box(0.46, 0.05, 0.44, sx, G0 + 0.46, z, cc); Pl.box(0.04, 0.42, 0.46, sx + s * 0.21, G0 + 0.5, z, cc);
      for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) Pl.box(0.04, 0.46, 0.04, sx + dx, G0, z + dz, cc);
      seatIds.push(k.seat(`${id}:${name}:${s > 0 ? 1 : 0}`, sx, z, yawL, SEAT, 'chair').id);
    }
    k.solid(x, z, 2.0, 0.9, 0.85);
    Pl.cyl(0.04, 0.04, 0.24, x + 0.2, G0 + 0.8, z + 0.15, 0xc4372b, 6);
  };
  longTable('A', 1.3, 6.1); longTable('B', 1.3, -1.6);
  plasticTable('P1', 7.6, 6.1, 0xf2f2ee); plasticTable('P2', 7.6, -1.6, 0x2a8fd1); plasticTable('P3', 7.6, -4.3, 0xf2f2ee);
  // waiting bench along the side wall, facing the counter
  Wd.box(0.4, 0.06, 3.2, -10.2, G0 + 0.5, -3.0, 0x7a5434); for (const dz of [-1.4, 1.4]) Wd.box(0.36, 0.5, 0.06, -10.2, G0, -3.0 + dz, 0x6b4a2e);
  const waiting = k.bench(`${id}:attente`, -10.2, -3.0, Math.PI / 2, 3.2, 3, SEAT);
  k.solid(-10.25, -3.0, 0.5, 3.2, 0.6);
  // hand-wash corner: a metal stand, a basin and the plastic kettle
  Me.box(0.5, 0.75, 0.5, -10.2, G0, 4.6, 0x2f6fb3); Pl.cyl(0.24, 0.18, 0.12, -10.2, G0 + 0.75, 4.6, 0xd8dde0, 10);
  Pl.cyl(0.11, 0.13, 0.22, -10.0, G0 + 0.88, 4.85, 0x1a9d54, 8); Pl.cyl(0.02, 0.02, 0.16, -9.9, G0 + 0.98, 4.95, 0x1a9d54, 4, [0.9, 0, 0]);
  k.solid(-10.2, 4.6, 0.5, 0.5, 0.9);
  // a neem tree in the back corner
  Pl.cyl(0.2, 0.28, 2.6, 8.0, G0, -8.4, 0x6e5a44, 6);
  for (let n = 0; n < 5; n++) { const a = n * 1.3 + R() * 0.4, r = n ? 1.2 : 0; k.b.plain.blob(1.3 + R() * 0.4, 8.0 + Math.sin(a) * r, 3.4 + R() * 0.6, -8.4 + Math.cos(a) * r, [0x3f6e2e, 0x4c7d36, 0x365f28][n % 3], 0.75, 0); }
  k.solid(8.0, -8.4, 0.6, 0.6, 2.4);

  // ---------------------------------------------------------------- signs facing the streets
  for (const x of [3.6, 9.8]) Pl.box(0.1, 3.0, 0.1, x, G0, 10.9, 0x3d4047);
  const signs = [
    k.sign(site.name.toUpperCase(), style.sign, style.signFg, 6.7, G0 + 2.5, 10.96, 0, 6.6, 1.0),
    k.sign('DIBI · BROCHETTES · BISSAP', style.sign, style.signFg, KX0 - 0.14, G0 + 2.25, -8.35, -Math.PI / 2, 4.2, 0.6),
  ];
  k.build(mats);
  ctx.extra.add(k.group);
  world.colliders.push(...k.colliders);
  for (const s of k.seats) ctx.seats.add(s);

  // ---------------------------------------------------------------- the place: counter, grill, hand-wash
  const keys = dibiCounters(id);
  const ownerCtx = (): OwnerCtx => ({ owner: style.owner, place: site.name, meals: counter(ctx, keys.meals), shifts: counter(ctx, keys.grill), hour: ctx.hour(), day: ctx.day(), talks: counter(ctx, `talks:${id}`), regularAt: REGULAR_MEALS });
  const talkOwner = () => {
    const c = ownerCtx();
    ctx.state.count(`talks:${id}`); relate(ctx, style.ownerId, 1); ctx.state.adjust({ social: 4 });
    conversation(ctx, `${style.owner} · ${site.name}`, ownerGreeting(c), [
      { label: 'Prendre des nouvelles', icon: '💬', pick: () => { ctx.state.adjust({ social: 3, moral: 2 }); return ownerNews(ownerCtx()); } },
      { label: 'Demander du travail', icon: '💼', pick: () => ownerWork(ownerCtx()) },
      { label: 'Le plat du jour ?', icon: '🍢', pick: () => ownerSpecial(ownerCtx()) },
      { label: 'Ba beneen yoon !', icon: '👋', pick: () => { ctx.toast(`${style.owner} : ${OWNER_BYE}`); return null; } },
    ]);
  };
  const at = (lx: number, lz: number) => k.w(lx, lz);
  const place = dibiRecipe({
    id, name: site.name, space: 'street', owner: style.owner, tables: { ...at(4.4, 1.6), r: 7.5 },
    anchors: [
      { id: 'counter', name: `Comptoir · ${style.owner}`, kind: 'counter', ...at(-4.8, -5.35), y: 1.9, radius: 2.4 },
      { id: 'grill', name: 'Grill', kind: 'spot', ...at(-6.0, 7.7), y: 1.7, radius: 1.8 },
    ],
  }, {
    converse: () => talkOwner(),
    count: c => counter(ctx, c), day: () => ctx.day(), hour: () => ctx.hour(),
    tired: e => ctx.state.data.needs.energie < e ? 'Repose-toi avant ce service' : null,
    playJob: job => startShift(job),
  });
  place.anchors.push({ id: 'lavabo', name: 'Lave-mains', kind: 'spot', ...at(-9.3, 4.6), y: 1.3, radius: 1.3 });
  place.offers.lavabo = [P.use({ id: 'mains', primitive: 'wash', label: 'Se laver les mains', detail: 'La bouilloire et la bassine, avant de manger', seconds: 2, effects: { needs: { hygiene: 6 } } })];
  ctx.places.add(place);
  // the place's identity (deliveries, routines, directory) now stands at the entrance and describes the venue
  const it = site.interactable ? world.interactables.find(i => i.id === site.interactable) : undefined;
  if (it) {
    const p = at(-2.4, 9.3); it.x = p.x; it.z = p.z; it.radius = 2.6;
    it.description = `${style.owner} : « Dalal ak jàmm ! » Ouvert de 11 h à 2 h · dibi, brochettes, bissap · on cherche une main au grill.`;
  }

  // ---------------------------------------------------------------- the people: owner, cook, clients
  const look = () => randomLook(R);
  const S = (sid: string) => k.seats.find(s => s.id === sid)!;
  const roles: Role[] = [
    { id: 'owner', look: OWNER_LOOK, ...at(-4.8, -7.3), yaw: yaw, clip: 'Idle', when: m => m !== 'closed' },
    { id: 'cook', look: COOK_LOOK, ...at(GX, GZ - 0.85), yaw: yaw, clip: 'Grab', when: m => m !== 'closed' },
    { id: 'c1', look: look(), seat: S(`${id}:An:0`), when: m => m !== 'closed' },
    { id: 'c2', look: look(), seat: S(`${id}:P1:1`), when: m => m !== 'closed' && !lite },
    { id: 'c3', look: look(), seat: S(`${id}:As:2`), when: m => m === 'evening' },
    { id: 'c4', look: look(), seat: S(`${id}:Bn:1`), when: m => m === 'evening' },
    { id: 'c5', look: look(), seat: S(`${id}:Bs:1`), when: m => m === 'evening' && !lite },
    { id: 'c6', look: look(), seat: S(`${id}:P2:0`), when: m => m === 'evening' && !lite },
    { id: 'c7', look: look(), seat: waiting[0], when: m => m === 'evening' },
    { id: 'c8', look: look(), ...at(-3.2, -5.0), yaw: yaw + Math.PI + 0.3, clip: 'Talk', when: m => m === 'evening' && !lite },
  ];
  const cast = new Cast(roles, ctx.seats, ctx.extra, id);
  env.addPeople(() => cast.bodies());

  // ---------------------------------------------------------------- what the player eats (the order's prop) and the grill stance
  const props = new THREE.Group(); ctx.extra.add(props);
  const propMesh = (fill: (b: Batch) => void) => { const b = new Batch(); fill(b); const m = b.build(mats.m.plain, false, false)!; m.visible = false; props.add(m); k.keep(m.geometry); return m; };
  const PROPS: Record<string, THREE.Mesh> = {
    dibi: propMesh(b => { b.box(0.42, 0.01, 0.34, 0, 0, 0, 0xc9a77a); for (let n = 0; n < 7; n++) b.box(0.07, 0.04, 0.05, -0.12 + (n % 4) * 0.08, 0.01, -0.06 + Math.floor(n / 4) * 0.09, n % 2 ? 0x6b2e14 : 0x8a4a24); for (let n = 0; n < 5; n++) b.box(0.05, 0.015, 0.02, 0.1 + (n % 2) * 0.04, 0.03, 0.06 - n * 0.03, 0xf0e6c8); b.box(0.04, 0.02, 0.04, -0.14, 0.01, 0.1, 0xe8b72f); }),
    brochettes: propMesh(b => { b.cyl(0.15, 0.15, 0.012, 0, 0, 0, 0xf4f1e8, 10); for (let n = 0; n < 3; n++) { b.box(0.3, 0.012, 0.012, 0, 0.02, -0.06 + n * 0.06, 0xc8c8c8); for (let m = 0; m < 4; m++) b.box(0.045, 0.035, 0.035, -0.09 + m * 0.06, 0.02, -0.06 + n * 0.06, m % 2 ? 0x6b2e14 : 0x8a4a24); } b.box(0.16, 0.05, 0.07, 0.05, 0.012, 0.11, 0xe8c890); }),
    attaya: propMesh(b => { b.cyl(0.025, 0.022, 0.08, 0, 0, 0, 0xe8f4ff, 6); b.cyl(0.022, 0.022, 0.03, 0, 0.05, 0, 0x8a5a1e, 6); b.cyl(0.06, 0.07, 0.12, 0.14, 0, 0.05, 0xb8bcc0, 8); }),
  };
  let t = 0, moment = '';

  // ---------------------------------------------------------------- the grill shift: flip each skewer when it is golden
  const skewerMat = k.keep(new THREE.MeshLambertMaterial({ color: 0xc0504a }));
  const skewerG = (() => { const b = new Batch(); b.box(0.9, 0.012, 0.012, 0, 0, 0, 0xc8c8c8); for (let m = 0; m < 5; m++) b.box(0.1, 0.07, 0.07, -0.26 + m * 0.13, -0.03, 0, 0xffffff); const g = b.build(skewerMat, false, true)!.geometry; k.keep(g); return g; })();
  const active = new THREE.Mesh(skewerG, skewerMat); active.visible = false; k.group.add(active);
  const trayMats: THREE.MeshLambertMaterial[] = [];
  const tray = Array.from({ length: 8 }, (_, n) => {
    const mat = k.keep(new THREE.MeshLambertMaterial({ color: 0x8a4a24 })); trayMats.push(mat);
    const m = new THREE.Mesh(skewerG, mat); m.visible = false; m.rotation.y = Math.PI / 2;
    m.position.set(-10.1 + (n % 2) * 0.12 - 0.06, G0 + 0.92 + Math.floor(n / 2) * 0.02, 6.25 + (n % 4) * 0.12); k.group.add(m); return m;
  });
  const RAW = new THREE.Color(0xc0504a), GOLD = new THREE.Color(0xb8742c), BURNT_C = new THREE.Color(0x2a1a10);
  const cookColour = (f: number, out: THREE.Color) => f < 0.72 ? out.copy(RAW).lerp(GOLD, f / 0.72) : out.copy(GOLD).lerp(BURNT_C, Math.min(1, (f - 0.72) / (BURNT - 0.72 + 0.15)));
  let shift: { job: PlayJob; g: GrillShift; spot: { x: number; z: number }; spin: number } | null = null;
  const SAY: Record<FlipResult, string> = { trop_tot: 'Trop tôt, elle est encore crue…', parfait: 'Parfaite, bien dorée !', trop_cuit: 'Un peu trop cuite, ça passe.', brule: 'Brûlée ! Elle est perdue.' };
  const startShift = (job: PlayJob) => {
    const p = at(GX + 1.15, GZ - 0.85); ctx.player.place(p.x, p.z, yaw);
    shift = { job, g: new GrillShift({ skewers: job.skewers, seconds: job.cook }), spot: p, spin: 0 };
    for (const m of tray) m.visible = false;
    ctx.toast(`${style.owner} : « Retourne chaque brochette quand elle est bien dorée, pas avant ! »`);
  };
  const endShift = (paid: boolean) => {
    const s = shift; if (!s) return;
    shift = null; active.visible = false; ctx.hud.progress(false);
    const body = ctx.player.body(); if (body && body.hold === 'Grab') body.hold = null;
    if (!paid) { ctx.toast('Tu as quitté le grill · service interrompu, rien de payé'); return; }
    const pay = shiftPay(s.job.pay, s.g.points, s.job.skewers);
    ctx.activities.start({ id: 'grill_paie', primitive: 'work', label: `${s.job.label} · ${s.g.golden}/${s.job.skewers} bien dorées`, steps: [{ label: s.job.label, primitive: 'work',
      effects: { money: pay, label: `${s.job.label} · ${site.name}`, needs: { energie: -s.job.energie, hygiene: -6, faim: -4 }, counters: { [s.job.counter]: 1, shifts: 1 }, category: 'service' } }] }, { place: site.name });
    relate(ctx, style.ownerId, s.g.golden >= s.job.skewers - 1 ? 2 : 1);
  };
  const flip = () => {
    const s = shift; if (!s) return;
    const f = s.g.f, r = s.g.flip(); if (!r) return;
    if (r !== 'trop_tot') { const n = s.g.results.length - 1; cookColour(f, trayMats[n].color); tray[n].visible = true; s.spin = 0.3; }
    ctx.toast(SAY[r]);
    if (s.g.done) endShift(true);
  };
  const shiftTarget = (space: string, out: Target[]) => {
    if (!shift || space !== 'street') return;
    const g = place.anchors[1];
    out.push({ id: `${id}:service`, name: 'Grill', kind: 'spot', space, x: g.x, z: g.z, y: 1.7, radius: 4, bias: -5, affordances: () => [
      { id: 'retourner', verb: 'work', label: 'Retourner la brochette', icon: '🍢', run: flip },
      { id: 'arreter', verb: 'stand', label: 'Arrêter le service', icon: '✋', run: () => endShift(false) },
    ] });
  };
  const shiftUpdate = (dt: number) => {
    const s = shift; if (!s) return;
    if (Math.hypot(ctx.player.pos.x - s.spot.x, ctx.player.pos.z - s.spot.z) > 1.6 || ctx.space() !== 'street') { endShift(false); return; }
    if (ctx.mode() !== 'play') return;                                                // the phone or a sheet is open: the fire waits
    const body = ctx.player.body(); if (body) body.hold = 'Grab';
    if (s.g.update(dt) === 'brule') { const n = s.g.results.length - 1; trayMats[n].color.copy(BURNT_C); tray[n].visible = true; ctx.toast(SAY.brule); if (s.g.done) { endShift(true); return; } }
    const f = s.g.f, d = doneness(f);
    active.visible = true; active.position.set(GX + 0.85, G0 + 0.98, GZ - 0.1);
    s.spin = Math.max(0, s.spin - dt); active.rotation.x = (s.spin / 0.3) * Math.PI;
    cookColour(f, skewerMat.color);
    const msg = d === 'cru' ? 'ça grille…' : d === 'dore' ? 'dorée : retourne-la !' : d === 'trop' ? 'vite, elle brûle !' : 'brûlée';
    ctx.hud.progress(true, Math.min(1, f / BURNT), `Brochette ${s.g.i + 1}/${s.job.skewers} · ${msg}`);
  };

  const update = (dt: number) => {
    t += dt;
    const h = ctx.hour(), night = nightOf(h), open = isOpen(place.hours, h);
    const m = !open ? 'closed' : isEvening(h) ? 'evening' : 'day';
    if (m !== moment) { moment = m; cast.setMoment(m); shutter.visible = !open; }
    // embers flicker; the glow carries at night; bulbs, tubes and TV only when open
    const f = open ? 0.78 + 0.22 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1) : 0.08;
    emberMat.color.setRGB(f, 0.36 * f + 0.04, 0.06 * f + 0.02);
    (emberPool.material as THREE.MeshBasicMaterial).opacity = open ? (0.18 + 0.6 * night) * f : 0;
    (heat.material as THREE.MeshBasicMaterial).opacity = open ? (0.05 + 0.28 * night) * f : 0;
    (shedPool.material as THREE.MeshBasicMaterial).opacity = open ? 0.55 * night : 0;
    lightsMat.color.setScalar(open ? 0.5 + 0.5 * night : 0.3);
    for (const s of signs) (s.material as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.45;
    smoke.on = open; smoke.update(dt, night);
    const street = ctx.space() === 'street';
    cast.update(dt, ctx.camera.position, lite ? 45 : 70, street);
    // the dish or the glass in front of the player while eating at this Dibi
    const cur = ctx.activities.current, seat = ctx.player.seated();
    for (const [pid, mesh] of Object.entries(PROPS)) {
      const on = !!cur && cur.step.prop === pid && !!seat && k.seats.includes(seat);
      mesh.visible = on;
      if (on) { mesh.position.set(seat!.x + Math.sin(seat!.yaw) * 0.55, G0 + 0.85, seat!.z + Math.cos(seat!.yaw) * 0.55); mesh.rotation.y = seat!.yaw; }
    }
    shiftUpdate(dt);
  };
  const smoke = new Smoke(new THREE.Vector3(...((): [number, number, number] => { const p = at(GX, GZ); return [p.x, G0 + 1.05, p.z]; })()), lite ? 3 : 6);
  ctx.extra.add(smoke.group);

  return {
    id, type: 'dibi', name: site.name, places: [place], update,
    collect: (space, _x, _z, out) => shiftTarget(space, out),
    dispose() { if (shift) { shift = null; ctx.hud.progress(false); } cast.dispose(); smoke.dispose(); props.removeFromParent(); k.dispose(); },
    debug: () => ({
      origin: { x: cx, z: cz }, id, type: 'dibi', name: site.name, owner: style.owner, moment, open: isOpen(place.hours, ctx.hour()),
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: a.space ?? place.space })),
      seats: k.seats.map(s => s.id), tables: seatIds.length, npcs: cast.presentCount, visibleNpcs: cast.shownCount,
      smoke: smoke.on, shutter: shutter.visible, entrance: at(-1.6, 12.6), inside: at(-1.6, 7.5), yaw,
      counters: { meals: counter(ctx, keys.meals), grill: counter(ctx, keys.grill) },
      prop: Object.entries(PROPS).find(([, m]) => m.visible)?.[0] ?? null,
      shift: shift ? { i: shift.g.i, n: shift.job.skewers, f: shift.g.f, state: doneness(shift.g.f), points: shift.g.points, golden: GOLDEN } : null,
    }),
  };
}
