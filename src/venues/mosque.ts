import * as THREE from 'three';
import { Batch } from '../world/batch';
import type { Site } from '../world/sites';
import type { Interactable } from '../world/types';
import type { Interior } from '../world/interiors';
import { rng } from '../core/rng';
import type { PersonLook } from '../actors/humanoid';
import { floorSeatTop } from '../interact/seats';
import { mosque as mosqueRecipe } from '../activity/templates';
import { VenueKit, archBand, archPiece, crescent, glowQuad } from './kit';
import { Cast, hideShoes, type Role } from './cast';
import { conversation, counter, nightOf, relate, type Venue, type VenueEnv } from './venue';
import { prayerAt, prayerPeaks } from './prayer';
import { IMAM_BYE, imamGreeting, imamHelp, imamNews, imamTimes, type ImamCtx } from './talk';
import { calligraphy, passage, type PassageId } from './quran';
import { openQuranReader } from './quranReader';

/**
 * The Grande Mosquée of the Médina (a block of the Plateau hub, src/world/sites.ts), calm and distinct: a walled
 * courtyard under two shade trees with benches for the elders, a covered row of ablution taps with low stools and plastic
 * kettles, a portico of arches with the shoe racks, a white prayer hall with green bands, a pale green dome and one tall
 * minaret. Inside (a walkable interior): carpet woven in prayer rows facing the mihrab, the minbar, columns, a chandelier,
 * fans, a shelf of closed books, chairs for the elders, the imam.
 *
 * Wash at the taps → leave the shoes at the door (they wait on the rack; the player is barefoot inside) → pray on a row
 * (kneeling, calm: no recitation is ever shown) or sit quietly → talk with the imam (everyday French and Wolof, no
 * religious text) → sweep the courtyard as a volunteer. No commerce. The rows fill up around the prayer times
 * (src/venues/prayer.ts, also the place's `peaks` for the NPC system). Quranic text comes only from Tanzil's verified
 * text, verbatim (src/venues/quran.ts): calligraphy panels on the hall's walls and a mushaf on its stand to read.
 *
 * Local frame (VenueKit): the 46 × 46 m block, front street toward +z.
 */
const G0 = 0.14;                                   // top of the block's paving
const WHITE = 0xf6f3ea, GREEN = 0x2f7a55, PALE = 0x7fb59a, GOLD = 0xd4b24a, STONE = 0xd9d2c0;
const IMAM: PersonLook = { skin: 0x4e2e1c, style: 'boubou', top: 0xf2f2ec, pattern: 'bazin', hat: 'kufi', hatColor: 0xf2f2ec, beard: 0xd8d4cc, heavy: 0.3 };
const WORSHIP_TOPS = [0xf2f2ec, 0x9cc8e8, 0x27407a, 0xe8e2d4, 0x1f7a44, 0xd9b44a, 0x6b3fa0, 0x7a1f3d];

export function buildMosque(env: VenueEnv, site: Site): Venue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const hub = world.id;
  const id = `${hub}:venue:${site.key}`;
  const cx = (site.x0 + site.x1) / 2, cz = (site.z0 + site.z1) / 2;
  const yaw = Math.atan2(site.front.x, site.front.z);
  const k = new VenueKit({ x: cx, z: cz }, yaw);
  const { plain: Pl, wall: Wa, paving: Pv, glow: Gl } = k.b;
  const R = rng(7713);
  const at = (lx: number, lz: number) => k.w(lx, lz);

  // ---------------------------------------------------------------- courtyard, enclosure, gate
  Pv.box(44.8, 0.012, 16.6, 0, G0 - 0.005, 14.3, 0xe6dfd0);                             // light paving
  Pv.box(3.2, 0.014, 13.4, 0, G0 - 0.004, 15.9, 0xc9bfae);                               // path from the gate to the portico
  const wallSeg = (x0: number, z0: number, x1: number, z1: number, h = 2.1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, t = 0.3;
    const w = alongX ? Math.abs(x1 - x0) : t, d = alongX ? t : Math.abs(z1 - z0);
    Wa.box(w, h, d, mx, G0 - 0.02, mz, WHITE); Pl.box(w + 0.02, 0.45, d + 0.02, mx, G0 - 0.02, mz, 0x9fb8a8);
    Pl.box(w + 0.1, 0.12, d + 0.1, mx, G0 + h - 0.04, mz, GREEN);
    k.solid(mx, mz, w, d, h);
  };
  wallSeg(-22.85, 22.75, -3.0, 22.75); wallSeg(3.0, 22.75, 22.85, 22.75);
  wallSeg(-22.75, -22.85, -22.75, 22.85); wallSeg(22.75, -22.85, 22.75, 22.85); wallSeg(-22.85, -22.75, 22.85, -22.75);
  for (const s of [-1, 1]) {                                                             // gate pillars with green caps
    Wa.box(0.9, 5.7, 0.9, s * 2.95, G0 - 0.02, 22.75, WHITE); Pl.box(1.0, 0.25, 1.0, s * 2.95, G0 + 5.6, 22.75, GREEN);
    Pl.sphere(0.32, s * 2.95, G0 + 5.85, 22.75, PALE, true); Pl.sphere(0.07, s * 2.95, G0 + 6.2, 22.75, GOLD);
    k.solid(s * 2.95, 22.75, 0.9, 0.9, 5.7);
  }
  Wa.geometry(archPiece(5.0, 3.4, 0.7), WHITE, 0, G0 + 2.2, 22.75);                    // the gate arch
  Pl.box(5.95, 0.16, 0.86, 0, G0 + 5.58, 22.75, GREEN);                                  // coping
  Pl.geometry(archBand(2.5, 2.62, 0.74), GREEN, 0, G0 + 2.2, 22.75);
  const signs = [k.sign('GRANDE MOSQUÉE', '#0f3d33', '#f3ecd0', 0, G0 + 5.1, 23.12, 0, 4.2, 0.62)];
  // two shade trees stay from the hub (local ±9, 15); benches for the elders face the path
  const benchAt = (name: string, x: number, z: number, yawL: number) => {
    Pl.box(0.5, 0.06, 2.6, x, G0 + 0.5, z, 0x8c6542, 0); Pl.box(0.08, 0.5, 2.6, x - Math.sin(yawL) * 0.26, G0 + 0.52, z, 0x8c6542);
    for (const dz of [-1.1, 1.1]) Pl.box(0.45, 0.5, 0.08, x, G0, z + dz, 0x253d43);
    k.solid(x, z, 0.6, 2.6, 0.7);
    return k.bench(`${id}:${name}`, x + Math.sin(yawL) * 0.04, z, yawL, 2.6, 2, 0.6);
  };
  const benchW = benchAt('bancO', -6.6, 15.0, Math.PI / 2), benchE = benchAt('bancE', 6.6, 15.0, -Math.PI / 2);
  // broom leaning on the east tree (the courtyard is swept by volunteers)
  Pl.cyl(0.02, 0.02, 1.4, 8.45, G0, 15.6, 0x8a6a48, 4, [0.25, 0, 0]); Pl.cyl(0.12, 0.03, 0.4, 8.45, G0, 15.95, 0xd9c48a, 6, [0.25, 0, 0]);
  // lanterns along the path
  for (const z of [11.5, 18.5]) for (const s of [-1, 1]) {
    Pl.cyl(0.05, 0.07, 2.6, s * 2.6, G0, z, 0x2a3a35, 6); Pl.box(0.3, 0.4, 0.3, s * 2.6, G0 + 2.6, z, 0x2a3a35); Gl.box(0.22, 0.3, 0.22, s * 2.6, G0 + 2.65, z, 0xfff0c8);
    k.solid(s * 2.6, z, 0.2, 0.2, 2.6);
  }
  const lanternPool = [glowQuad(k, 6, 6, 0xffd9a0, -2.6, G0 + 0.02, 11.5), glowQuad(k, 6, 6, 0xffd9a0, 2.6, G0 + 0.02, 11.5), glowQuad(k, 6, 6, 0xffd9a0, -2.6, G0 + 0.02, 18.5), glowQuad(k, 6, 6, 0xffd9a0, 2.6, G0 + 0.02, 18.5)];

  // ---------------------------------------------------------------- ablution taps (west side of the courtyard)
  const TX = -21.75;
  Wa.box(0.38, 1.15, 11.0, TX, G0 - 0.02, 14.0, 0xf2f0ea); Pl.box(0.42, 0.08, 11.04, TX, G0 + 1.13, 14.0, GREEN);
  for (let n = 0; n < 22; n++) Pl.box(0.01, 1.1, 0.01, TX + 0.2, G0, 8.6 + n * 0.5, 0xd2dcd6);                   // tile joints
  Pl.box(0.32, 0.02, 11.0, TX + 0.45, G0 + 0.005, 14.0, 0x6f7a76);                                                 // gutter
  k.solid(TX, 14.0, 0.4, 11.0, 1.2);
  const stools: ReturnType<VenueKit['seat']>[] = [];
  const KETTLES = [0xd9322b, 0x1a9d54, 0x2f6fb3, 0xf4c20d, 0xe8742c, 0x6b3fa0, 0x1a9d54];
  for (let n = 0; n < 7; n++) {
    const z = 9.4 + n * 1.55;
    Pl.cyl(0.03, 0.03, 0.18, TX + 0.22, G0 + 0.72, z, GOLD, 6, [0, 0, Math.PI / 2]); Pl.cyl(0.025, 0.025, 0.1, TX + 0.32, G0 + 0.64, z, GOLD, 6);   // brass tap
    Pl.cyl(0.17, 0.2, 0.5, TX + 1.05, G0, z, STONE, 10);                                                          // low concrete stool
    stools.push(k.seat(`${id}:robinet:${n}`, TX + 1.05, z, -Math.PI / 2, 0.62, 'stool'));
    const kc = KETTLES[n]; Pl.cyl(0.1, 0.12, 0.22, TX + 1.55, G0, z + 0.45, kc, 8); Pl.cyl(0.02, 0.025, 0.16, TX + 1.42, G0 + 0.12, z + 0.45, kc, 4, [0, 0, 0.9]);
  }
  Pl.slab(3.8, 0.08, 11.6, -20.85, G0 + 2.9, 14.0, GREEN, 0, 0);                                                    // shade roof
  for (const z of [8.5, 14.0, 19.5]) { Pl.cyl(0.06, 0.06, 2.9, -19.1, G0, z, 0x2a3a35, 6); k.solid(-19.1, z, 0.2, 0.2, 2.8); }

  // ---------------------------------------------------------------- prayer hall (exterior), portico, dome
  const HX = 15, HZ0 = -19.5, HZ1 = 5.6, HH = 7.4;
  Wa.box(HX * 2, HH, HZ1 - HZ0, 0, G0 - 0.02, (HZ0 + HZ1) / 2, WHITE);
  Pl.box(HX * 2 + 0.06, 0.8, HZ1 - HZ0 + 0.06, 0, G0 - 0.02, (HZ0 + HZ1) / 2, 0x9fb8a8);                     // plinth
  Pl.box(HX * 2 + 0.1, 0.5, HZ1 - HZ0 + 0.1, 0, G0 + HH - 0.6, (HZ0 + HZ1) / 2, GREEN);                     // green band
  Pl.box(HX * 2 + 0.4, 0.3, HZ1 - HZ0 + 0.4, 0, G0 + HH - 0.05, (HZ0 + HZ1) / 2, 0xe9e5d8);                // roof slab
  const merlons = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.1);
    for (let i = 0; i <= n; i++) { const t = i / n; Wa.box(0.45, 0.55, 0.45, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, WHITE); }
  };
  merlons(-HX, HZ1, HX, HZ1, G0 + HH + 0.2); merlons(-HX, HZ0, HX, HZ0, G0 + HH + 0.2);
  merlons(-HX, HZ0, -HX, HZ1, G0 + HH + 0.2); merlons(HX, HZ0, HX, HZ1, G0 + HH + 0.2);
  k.solid(0, (HZ0 + HZ1) / 2, HX * 2, HZ1 - HZ0, HH);
  // arched windows: dark recess with a half-disc head, on the facade and both long sides
  const windowAt = (x: number, z: number, faceYaw: number, w = 1.3, h = 2.3, y = 1.5) => {
    const fx = Math.sin(faceYaw) * 0.03, fz = Math.cos(faceYaw) * 0.03;
    const rect = new THREE.PlaneGeometry(w, h); rect.translate(0, h / 2, 0);
    Pl.geometry(rect, 0x23343a, x + fx, G0 + y, z + fz, faceYaw);
    Pl.geometry(new THREE.CircleGeometry(w / 2, 10, 0, Math.PI), 0x23343a, x + fx, G0 + y + h, z + fz, faceYaw);
    const fr = new THREE.PlaneGeometry(w + 0.24, 0.12); Pl.geometry(fr, GREEN, x + fx * 1.2, G0 + y - 0.06, z + fz * 1.2, faceYaw);
  };
  for (const x of [-11.5, -7.2, 7.2, 11.5]) windowAt(x, HZ1, 0);
  for (const z of [1.5, -3.5, -8.5, -13.5]) { windowAt(-HX, z, -Math.PI / 2); windowAt(HX, z, Math.PI / 2); }
  // portico: six columns, five arches, a roof; the central bay is the door
  const PZ = 9.0;
  Pv.box(23.2, 0.03, PZ - HZ1 + 0.4, 0, G0, (HZ1 + PZ) / 2, 0xd8d0c0);
  const cols = [-11.1, -6.66, -2.22, 2.22, 6.66, 11.1];
  for (const x of cols) {
    Wa.box(0.6, 2.6, 0.6, x, G0 - 0.02, PZ, WHITE); Pl.box(0.72, 0.18, 0.72, x, G0 + 2.5, PZ, GREEN); Pl.box(0.7, 0.4, 0.7, x, G0 - 0.02, PZ, 0x9fb8a8);
    k.solid(x, PZ, 0.6, 0.6, 2.6);
  }
  for (let i = 0; i < cols.length - 1; i++) Wa.geometry(archPiece(cols[i + 1] - cols[i] - 0.6, 2.35, 0.6), WHITE, (cols[i] + cols[i + 1]) / 2, G0 + 2.6, PZ);
  Pl.box(23.4, 0.32, PZ - HZ1 + 0.7, 0, G0 + 4.95, (HZ1 + PZ) / 2 + 0.05, 0xe9e5d8); Pl.box(23.5, 0.3, 0.12, 0, G0 + 4.7, PZ + 0.36, GREEN);
  merlons(-11.5, PZ + 0.3, 11.5, PZ + 0.3, G0 + 5.25);
  // the door: a tall arched opening, wooden leaves open inside, warm light from the hall
  const door = new THREE.PlaneGeometry(2.4, 2.9); door.translate(0, 1.45, 0);
  Gl.geometry(door, 0x6a4a2a, 0, G0, HZ1 + 0.02, 0); Gl.geometry(new THREE.CircleGeometry(1.2, 12, 0, Math.PI), 0x6a4a2a, 0, G0 + 2.9, HZ1 + 0.02, 0);
  for (const s of [-1, 1]) Pl.box(0.1, 2.9, 1.1, s * 1.25, G0, HZ1 + 0.55, 0x6b4426);                          // leaves open against the jambs
  Pl.geometry(archBand(1.2, 1.36, 0.16), GOLD, 0, G0 + 2.9, HZ1 + 0.1);
  // shoe racks either side of the door, pairs on the shelves and on the floor
  const SHOES = [0x3a2a1e, 0xf2f2ec, 0x1c1c1f, 0x8a5a3a, 0xc4372b, 0x2f6fb3, 0xd9b44a, 0x6b4a2e];
  const pair = (x: number, y: number, z: number, c: number, r = 0) => { for (const d of [-0.07, 0.07]) Pl.box(0.11, 0.06, 0.28, x + Math.cos(r) * d, y, z - Math.sin(r) * d, c, r); };
  for (const s of [-1, 1]) {
    const x = s * 3.9;
    for (const y of [0, 0.38, 0.76, 1.14]) Pl.box(2.2, 0.04, 0.42, x, G0 + y, HZ1 + 0.24, 0x7a5a3c);
    for (const dx of [-1.08, 1.08]) Pl.box(0.05, 1.2, 0.42, x + dx, G0, HZ1 + 0.24, 0x6b4a2e);
    for (let n = 0; n < 15; n++) if (R() < 0.75) pair(x - 0.85 + (n % 5) * 0.42, G0 + 0.04 + Math.floor(n / 5) * 0.38, HZ1 + 0.24, SHOES[Math.floor(R() * SHOES.length)]);
    k.solid(x, HZ1 + 0.24, 2.2, 0.45, 1.2);
  }
  for (let n = 0; n < 6; n++) pair(-2.2 + n * 0.85 + (n > 2 ? 0.9 : 0), G0, HZ1 + 0.95 + (n % 2) * 0.25, SHOES[n % SHOES.length], (n % 3) * 0.3 - 0.3);
  const myShoes = new Batch(); for (const d of [-0.07, 0.07]) myShoes.box(0.11, 0.07, 0.28, 1.95 + d, G0, HZ1 + 1.1, 0x2b2f3a, 0.15);
  const myShoesMesh = myShoes.build(mats.m.plain, true, true)!; myShoesMesh.visible = false; k.group.add(myShoesMesh); k.keep(myShoesMesh.geometry);
  // drum, dome and finial; the mihrab's bulge at the back
  const DZ = -7.5;
  Wa.cyl(5.9, 5.9, 1.7, 0, G0 + HH + 0.25, DZ, WHITE, 16); Pl.cyl(5.95, 5.95, 0.25, 0, G0 + HH + 1.85, DZ, GREEN, 16);
  Pl.sphere(5.6, 0, G0 + HH + 2.1, DZ, PALE, true);
  Pl.cyl(0.25, 0.4, 0.6, 0, G0 + HH + 7.6, DZ, GOLD, 8); Pl.sphere(0.3, 0, G0 + HH + 8.4, DZ, GOLD);
  Pl.geometry(crescent(0.42), GOLD, 0, G0 + HH + 9.1, DZ);
  for (let n = 0; n < 16; n++) { const a = (n / 16) * Math.PI * 2; Gl.sphere(0.08, Math.sin(a) * 6.0, G0 + HH + 1.95, DZ + Math.cos(a) * 6.0, 0xfff1c8); }
  Wa.cyl(2.2, 2.2, 6.4, 0, G0 - 0.02, HZ0, WHITE, 14); Pl.sphere(2.2, 0, G0 + 6.38, HZ0, PALE, true);
  // the minaret, in the west side yard next to the hall
  const MX = -18.9, MZ = 2.6;
  Wa.box(3.4, 7.6, 3.4, MX, G0 - 0.02, MZ, WHITE); Pl.box(3.5, 0.4, 3.5, MX, G0 + 7.2, MZ, GREEN);
  Pl.box(1.0, 2.1, 0.06, MX, G0, MZ + 1.71, 0x5a3a22);
  Wa.cyl(1.35, 1.45, 11.8, MX, G0 + 7.6, MZ, WHITE, 8);
  for (const y of [11.5, 15.5]) Pl.cyl(1.38, 1.38, 0.25, MX, G0 + y, MZ, GREEN, 8);
  Pl.cyl(2.05, 1.5, 0.45, MX, G0 + 19.3, MZ, WHITE, 12);
  for (let n = 0; n < 14; n++) { const a = (n / 14) * Math.PI * 2; Pl.box(0.06, 0.85, 0.06, MX + Math.sin(a) * 1.95, G0 + 19.75, MZ + Math.cos(a) * 1.95, GREEN); }
  const rail = new THREE.TorusGeometry(1.95, 0.05, 4, 20); rail.rotateX(Math.PI / 2); Pl.geometry(rail, GREEN, MX, G0 + 20.6, MZ);
  Wa.cyl(0.95, 1.05, 4.6, MX, G0 + 19.75, MZ, WHITE, 8);
  Pl.cyl(1.35, 1.35, 0.3, MX, G0 + 24.3, MZ, GREEN, 8);
  Pl.cyl(0, 1.05, 2.8, MX, G0 + 24.6, MZ, PALE, 8);
  Pl.sphere(0.22, MX, G0 + 27.55, MZ, GOLD); Pl.geometry(crescent(0.3), GOLD, MX, G0 + 28.15, MZ);
  k.solid(MX, MZ, 3.4, 3.4, 7.6);
  // green light ring on the minaret balcony and around the dome at night (own material: off by day)
  const neonB = new Batch();
  const ring = new THREE.TorusGeometry(2.0, 0.045, 4, 24); ring.rotateX(Math.PI / 2); neonB.geometry(ring, 0x5cffa0, MX, G0 + 19.78, MZ);
  const ring2 = new THREE.TorusGeometry(1.4, 0.04, 4, 20); ring2.rotateX(Math.PI / 2); neonB.geometry(ring2, 0x5cffa0, MX, G0 + 24.62, MZ);
  const neonMat = k.keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const neon = neonB.build(neonMat, false, false)!; k.group.add(neon); k.keep(neon.geometry);
  const facadeGlow = glowQuad(k, 26, 9, 0xfff4dc, 0, G0 + 4, HZ1 + 0.6, false);

  k.build(mats);
  ctx.extra.add(k.group);
  world.colliders.push(...k.colliders);
  for (const s of k.seats) ctx.seats.add(s);

  // ---------------------------------------------------------------- the prayer hall (walkable interior)
  const doorId = `${id}:salle`;
  const out = at(0, 8.0);
  const doorIt: Interactable = { id: doorId, name: 'Salle de prière', kind: 'actions', x: out.x, z: out.z, radius: 0, actions: [{ id: 'entrer', label: 'Entrer', seconds: 0, special: 'enter' }] };
  world.interactables.push(doorIt);
  const hall = buildHall(env, id, doorId, 1600, 0);
  ctx.addInterior(doorIt, hall.int);

  // ---------------------------------------------------------------- the place (taps and door in the courtyard, rows and imam in the hall)
  let washed = false;
  const imamCtx = (): ImamCtx => ({ imam: 'Imam Seck', visits: counter(ctx, `talks:${id}`), hour: ctx.hour(), helped: counter(ctx, 'mosquee_aide') });
  const talkImam = () => {
    const c = imamCtx();
    ctx.state.count(`talks:${id}`); relate(ctx, 'imam_seck', 1); ctx.state.adjust({ social: 4 });
    conversation(ctx, 'Imam Seck', imamGreeting(c), [
      { label: 'Prendre des nouvelles', icon: '💬', pick: () => { ctx.state.adjust({ social: 3 }); return imamNews(imamCtx()); } },
      { label: 'Les heures de prière', icon: '🕰️', pick: () => imamTimes(imamCtx()) },
      { label: 'Proposer son aide', icon: '🧹', pick: () => imamHelp(imamCtx()) },
      { label: 'Ba beneen yoon', icon: '👋', pick: () => { ctx.toast(`Imam Seck : ${IMAM_BYE}`); return null; } },
    ]);
  };
  const H = hall.at;
  const place = mosqueRecipe({
    id, name: site.name, space: 'street', peaks: prayerPeaks(),
    anchors: [
      { id: 'ablutions', name: 'Robinets des ablutions', kind: 'spot', ...at(-19.9, 14.0), y: 1.6, radius: 2.8 },
      { id: 'door', name: 'Salle de prière', kind: 'door', ...at(0, 7.0), y: 2.4, radius: 2.0 },
      { id: 'cour', name: 'Balai de la cour', kind: 'spot', ...at(7.7, 14.6), y: 1.5, radius: 1.5 },
      { id: 'hall', name: 'Rangs de prière', kind: 'place', ...H(0, -1.2), y: 1.6, radius: 9, bias: 0.8, space: doorId },
      { id: 'imam', name: 'Imam Seck', kind: 'person', ...H(-2.2, -5.0), y: 1.5, radius: 1.6, space: doorId },
      { id: 'shelf', name: 'Coran sur son support', kind: 'furniture', ...H(-8.9, 4.6), y: 0.9, radius: 1.4, space: doorId },
    ],
  }, {
    converse: () => talkImam(),
    enter: () => ctx.enter(doorId),
    congregation: () => prayerAt(ctx.hour())?.name ?? null,
    prayReady: () => (washed ? null : 'Fais d’abord tes ablutions aux robinets de la cour'),
    done: a => { if (a === 'ablutions') washed = true; },
    read: () => openQuranReader(ctx),
  });
  ctx.places.add(place);

  // ---------------------------------------------------------------- people: elders, people at the taps, worshippers, the imam
  const look = (r: number): PersonLook => ({ skin: [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25][r % 4], style: 'boubou', top: WORSHIP_TOPS[r % WORSHIP_TOPS.length], pattern: r % 3 ? 'bazin' : 'uni', hat: r % 4 === 3 ? null : 'kufi', hatColor: r % 2 ? 0xf2f2ec : 0x1c1c1f, beard: r % 3 === 0 ? 0xd8d4cc : null, heavy: r % 5 === 0 ? 0.5 : 0 });
  const prayer = (m: string) => m === 'prayer';
  const street: Role[] = [
    { id: 'ancien1', look: look(0), seat: benchW[0], when: m => m !== 'night' },
    { id: 'ancien2', look: look(3), seat: benchE[1], when: m => m !== 'night' && !lite },
    { id: 'robinet1', look: look(5), seat: stools[1], when: prayer, barefoot: true },
    { id: 'robinet2', look: look(6), seat: stools[4], when: m => prayer(m) && !lite, barefoot: true },
    { id: 'porche', look: look(7), ...at(-2.6, 7.1), yaw: yaw + Math.PI * 0.9, clip: 'Talk', when: prayer, barefoot: true },
  ];
  const streetCast = new Cast(street, ctx.seats, ctx.extra, id);
  env.addPeople(() => streetCast.bodies());
  const rows = hall.rows;
  const pick = (row: number, col: number) => rows[row * 15 + col];
  const inside: Role[] = [
    { id: 'imam', look: IMAM, seat: hall.imamSeat, when: () => true, barefoot: true },
    { id: 'f1', look: look(1), seat: pick(1, 4), when: m => m !== 'night', barefoot: true },
    { id: 'f2', look: look(2), seat: pick(3, 11), when: m => m !== 'night' && !lite, barefoot: true },
    { id: 'chaise', look: { ...look(9), heavy: 0.5, beard: 0xd8d4cc }, seat: hall.chairs[1], when: m => m !== 'night', barefoot: true },
    ...[7, 6, 8, 5, 9, 4, 10].map((col, i): Role => ({ id: `r${i}`, look: look(10 + i), seat: pick(0, col), when: m => prayer(m) && (!lite || i < 3), barefoot: true })),
    ...[7, 6, 8].map((col, i): Role => ({ id: `s${i}`, look: look(20 + i), seat: pick(1, col), when: m => prayer(m) && !lite, barefoot: true })),
  ];
  const hallCast = new Cast(inside, ctx.seats, ctx.scene, id);            // not under the hub group: the hub disposes it on unload

  // ---------------------------------------------------------------- the player's shoes and the moments of the day
  let barefoot = false, moment = '';
  const setBarefoot = (on: boolean) => {
    barefoot = on; myShoesMesh.visible = on;
    const body = ctx.player.body(); if (body) hideShoes(body, on);
  };
  const centre = at(0, 6);
  const update = (dt: number) => {
    const h = ctx.hour(), night = nightOf(h);
    const m = prayerAt(h) ? 'prayer' : h >= 22 || h < 5.5 ? 'night' : 'calm';
    if (m !== moment) { moment = m; streetCast.setMoment(m); hallCast.setMoment(m); }
    const space = ctx.space();
    streetCast.update(dt, ctx.camera.position, lite ? 45 : 70, space === 'street');
    hallCast.update(dt, ctx.camera.position, 40, space === doorId);
    neonMat.color.setScalar(0.08 + 0.92 * night);
    (facadeGlow.material as THREE.MeshBasicMaterial).opacity = 0.22 * night;
    for (const p of lanternPool) (p.material as THREE.MeshBasicMaterial).opacity = 0.6 * night;
    for (const s of signs) (s.material as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.5;
    hall.update(h);
    if (space === 'street' && washed && Math.hypot(ctx.player.pos.x - centre.x, ctx.player.pos.z - centre.z) > 40) washed = false;   // ablutions last the visit
    if ((space === doorId) !== barefoot) setBarefoot(space === doorId);
  };

  return {
    id, type: 'mosque', name: site.name, places: [place], update,
    spaceChanged: space => setBarefoot(space === doorId),
    dispose() { if (barefoot) setBarefoot(false); streetCast.dispose(); hallCast.dispose(); hall.dispose(); k.dispose(); },
    debug: () => ({
      origin: { x: cx, z: cz }, id, type: 'mosque', name: site.name, door: doorId, moment, washed, barefoot, shoesOnRack: myShoesMesh.visible,
      congregation: prayerAt(ctx.hour())?.name ?? null,
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: a.space ?? place.space })),
      prayerSeats: rows.length, stools: stools.map(s => s.id), npcsStreet: streetCast.presentCount, npcsHall: hallCast.presentCount,
      gate: at(0, 25.5), courtyard: at(0, 14), yaw, quran: hall.quran,
    }),
  };
}

// -------------------------------------------------------------------- prayer hall interior
function rugTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1f5f45'; c.fillRect(0, 0, 128, 192);                                 // field
  c.fillStyle = '#d4b24a'; c.fillRect(0, 0, 128, 5); c.fillRect(0, 0, 4, 192); c.fillRect(124, 0, 4, 192);
  c.fillStyle = '#7a1f2b';                                                             // the niche shape, its top toward the qibla
  c.beginPath(); c.moveTo(20, 176); c.lineTo(20, 62); c.arc(64, 62, 44, Math.PI, 0); c.lineTo(108, 176); c.closePath(); c.fill();
  c.strokeStyle = '#d4b24a'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#c9a24a';                                                             // a diamond and small stars inside
  c.beginPath(); c.moveTo(64, 82); c.lineTo(84, 118); c.lineTo(64, 154); c.lineTo(44, 118); c.closePath(); c.fill();
  c.fillStyle = '#1f5f45'; c.beginPath(); c.moveTo(64, 100); c.lineTo(74, 118); c.lineTo(64, 136); c.lineTo(54, 118); c.closePath(); c.fill();
  for (const [x, y] of [[40, 40], [88, 40], [64, 30]]) { c.fillStyle = '#e8d08a'; c.fillRect(x - 3, y - 3, 6, 6); }
  c.fillStyle = '#163f30'; c.fillRect(0, 184, 128, 8);                                 // the row's line
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function tileTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1f5f45'; c.fillRect(0, 0, 128, 128);
  const star = (x: number, y: number, r: number, col: string) => {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.55 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  };
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128], [64, 64]]) { star(x, y, 30, '#d4b24a'); star(x, y, 16, '#f4efe0'); }
  for (const [x, y] of [[64, 0], [0, 64], [128, 64], [64, 128]]) star(x, y, 14, '#5aa88a');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildHall(env: VenueEnv, id: string, doorId: string, ox: number, oz: number) {
  const { mats } = env;
  const k = new VenueKit({ x: ox, z: oz }, 0, doorId);
  const root = new THREE.Group(); root.add(k.group);
  const { plain: Pl, wall: Wa, wood: Wd, glow: Gl } = k.b;
  const W = 20, D = 15, H = 5.2, x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, F = 0.1;
  const at = (lx: number, lz: number) => k.w(lx, lz);
  // floor, carpet woven in rows (one niche per place, 0.9 × 1.4 m, tops toward the mihrab)
  Pl.box(W, F, D, 0, 0, 0, 0xe9e4da);
  const cw = 18.9, cz0 = -6.75, cz1 = 5.85;
  const rugTex = k.keep(rugTexture()); rugTex.repeat.set(cw / 0.9, (cz1 - cz0) / 1.4);
  const rugG = new THREE.PlaneGeometry(cw, cz1 - cz0); rugG.rotateX(-Math.PI / 2);
  const rug = k.mesh(rugG, new THREE.MeshLambertMaterial({ map: rugTex })); rug.position.set(0, F + 0.004, (cz0 + cz1) / 2); rug.receiveShadow = true;
  // walls: plaster, green tile dado with a gold line, skirting
  const side = (w: number, d: number, x: number, z: number) => {
    Wa.box(w, H, d, x, F, z, 0xf6f3ea); Pl.box(w + (d > w ? 0.02 : 0), 1.25, d + (w > d ? 0.02 : 0), x, F, z, 0x3f8a6a);
    Pl.box(w + (d > w ? 0.03 : 0), 0.05, d + (w > d ? 0.03 : 0), x, F + 1.25, z, 0xd4b24a);
  };
  side(W, 0.2, 0, z0 - 0.1); side(0.2, D, x0 - 0.1, 0); side(0.2, D, x1 + 0.1, 0);
  side(W / 2 - 1.3, 0.2, (x0 - 1.3) / 2, z1 + 0.1); side(W / 2 - 1.3, 0.2, (x1 + 1.3) / 2, z1 + 0.1);
  Wa.box(2.6, H - 3.2, 0.2, 0, F + 3.2, z1 + 0.1, 0xf6f3ea);
  Wd.box(2.6, 3.2, 0.08, 0, F, z1 + 0.22, 0x5a3a22);                                     // the door, closed behind you
  k.colliders.push({ x0: ox + x0 - 1, z0: oz + z0 - 1, x1: ox + x1 + 1, z1: oz + z0, h: H }, { x0: ox + x0 - 1, z0: oz + z0, x1: ox + x0, z1: oz + z1 + 1, h: H },
    { x0: ox + x1, z0: oz + z0, x1: ox + x1 + 1, z1: oz + z1 + 1, h: H }, { x0: ox + x0 - 1, z0: oz + z1, x1: ox + x1 + 1, z1: oz + z1 + 1, h: H });
  // windows on the long walls: daylight between green shutters (the light follows the hour)
  const skyB = new Batch();
  for (const z of [-4, 0, 4]) for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.01), r = -s * Math.PI / 2;
    const pane = new THREE.PlaneGeometry(1.3, 2.0); pane.translate(0, 1.0, 0); skyB.geometry(pane, 0xffffff, x, F + 1.6, z, r);
    skyB.geometry(new THREE.CircleGeometry(0.65, 10, 0, Math.PI), 0xffffff, x, F + 3.6, z, r);
    for (const d of [-0.8, 0.8]) Pl.box(0.05, 2.6, 0.35, x - s * 0.03, F + 1.55, z + d, GREEN);
  }
  const skyMat = k.keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const sky = skyB.build(skyMat, false, false)!; k.group.add(sky); k.keep(sky.geometry);
  // the qibla wall: mihrab niche in a tiled panel, the minbar beside it
  const tile = k.keep(tileTexture()); tile.repeat.set(4.4 / 1.1, 4.6 / 1.1);
  const panel = k.mesh(new THREE.PlaneGeometry(4.4, 4.6), new THREE.MeshLambertMaterial({ map: tile })); panel.position.set(0, F + 2.3, z0 + 0.005);
  const niche = new THREE.PlaneGeometry(1.7, 2.3); niche.translate(0, 1.15, 0); Pl.geometry(niche, 0x16382c, 0, F + 0.3, z0 + 0.012);
  Pl.geometry(new THREE.CircleGeometry(0.85, 14, 0, Math.PI), 0x16382c, 0, F + 2.6, z0 + 0.012);
  Pl.geometry(archBand(0.85, 0.99, 0.1), GOLD, 0, F + 2.6, z0 + 0.06);
  for (const s of [-1, 1]) Pl.box(0.12, 2.3, 0.1, s * 0.92, F + 0.3, z0 + 0.06, GOLD);
  Pl.box(1.9, 0.3, 0.3, 0, F, z0 + 0.15, 0x7a6a50);
  const MX = 2.6;                                                                       // minbar: steps up toward the wall, rails, a canopy
  for (let n = 0; n < 6; n++) Wd.box(0.9, 0.25 * (n + 1), 0.34, MX, F, z0 + 2.1 - n * 0.34, 0x7a4a2a);
  for (const s of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.06, 0.06, 2.3); rail.rotateX(0.6); Wd.geometry(rail, 0x5e3a20, MX + s * 0.46, F + 1.35, z0 + 1.3);
    for (const z of [z0 + 2.3, z0 + 0.3]) Wd.box(0.08, z === z0 + 0.3 ? 2.6 : 1.0, 0.08, MX + s * 0.46, F, z, 0x5e3a20);
  }
  Wd.box(1.05, 0.08, 0.6, MX, F + 2.6, z0 + 0.4, 0x5e3a20); Pl.sphere(0.32, MX, F + 2.68, z0 + 0.4, PALE, true);
  k.solid(MX, z0 + 1.3, 1.0, 2.6, 2.6);
  // columns, ceiling with the dome's ring, chandelier, fans
  for (const x of [-7.4, 7.4]) for (const z of [-3.0, 2.2]) { Wa.box(0.55, H, 0.55, x, F, z, 0xf6f3ea); Pl.box(0.6, 1.25, 0.6, x, F, z, 0x3f8a6a); Pl.box(0.7, 0.2, 0.7, x, F + H - 0.3, z, GOLD); k.solid(x, z, 0.55, 0.55, H); }
  const ceil = k.mesh(new THREE.PlaneGeometry(W + 0.4, D + 0.4), new THREE.MeshLambertMaterial({ color: 0xf4f1ea, emissive: 0x2a2824 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, F + H, 0);
  Pl.cyl(3.3, 3.3, 0.06, 0, F + H - 0.08, -1.0, GREEN, 24); Pl.cyl(2.9, 2.9, 0.07, 0, F + H - 0.1, -1.0, 0xe9e5d8, 24);
  Pl.cyl(0.02, 0.02, 1.4, 0, F + H - 1.45, -1.0, 0x8a7a4a, 4);
  const chand = new THREE.TorusGeometry(1.0, 0.04, 4, 20); chand.rotateX(Math.PI / 2); Pl.geometry(chand, GOLD, 0, F + H - 1.5, -1.0);
  for (let n = 0; n < 10; n++) { const a = (n / 10) * Math.PI * 2; Gl.sphere(0.07, Math.sin(a), F + H - 1.42, -1.0 + Math.cos(a), 0xfff1c8); }
  Gl.sphere(0.16, 0, F + H - 1.6, -1.0, 0xfff1c8);
  for (const [fx, fz] of [[-4.6, -3.6], [4.6, -3.6], [-4.6, 3.0], [4.6, 3.0]]) {
    Pl.cyl(0.03, 0.03, 0.5, fx, F + H - 0.5, fz, 0x333333, 4); Pl.cyl(0.13, 0.13, 0.1, fx, F + H - 0.58, fz, 0xe8e8e8, 8);
    for (let n = 0; n < 3; n++) Pl.box(0.15, 0.015, 0.85, fx + Math.sin(n * 2.094) * 0.45, F + H - 0.56, fz + Math.cos(n * 2.094) * 0.45, 0xe8e8e8, n * 2.094);
  }
  // shelf of closed books (west wall, back), chairs for the elders (east, back)
  Wd.box(0.42, 1.9, 1.9, x0 + 0.24, F, 4.6, 0x6e4426);
  for (let r = 0; r < 4; r++) {
    Wd.box(0.4, 0.03, 1.8, x0 + 0.26, F + 0.15 + r * 0.45, 4.6, 0x5a3820);
    for (let n = 0; n < 12; n++) Pl.box(0.24, 0.3 + ((n * 7) % 5) * 0.015, 0.1, x0 + 0.3, F + 0.18 + r * 0.45, 3.85 + n * 0.135, [0x1f5f45, 0x7a1f2b, 0x27407a, 0x8a6a3a, 0x3a2a1e][(n + r) % 5]);
  }
  k.solid(x0 + 0.24, 4.6, 0.45, 1.9, 1.9);
  const chairs = [6.6, 7.4, 8.2].map((x, i) => {
    Pl.box(0.46, 0.05, 0.44, x, F + 0.46, 6.2, 0xf2f2ee); Pl.box(0.46, 0.42, 0.04, x, F + 0.5, 6.42, 0xf2f2ee);
    for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) Pl.box(0.04, 0.46, 0.04, x + dx, F, 6.2 + dz, 0xf2f2ee);
    return k.seat(`${id}:chaise:${i}`, x, 6.18, Math.PI, 0.56, 'chair');
  });
  k.solid(7.4, 6.2, 2.4, 0.5, 0.9);
  // prayer rows: kneeling places facing the mihrab (the carpet's niches), and the imam's place facing the rows
  const top = floorSeatTop(F);
  const rows: ReturnType<VenueKit['seat']>[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) rows.push(k.seat(`${id}:rang:${r}:${c}`, -6.3 + c * 0.9, -4.4 + r * 1.4, Math.PI, top, 'prayer', 'Kneel'));
  const imamSeat = k.seat(`${id}:imam`, -2.2, -6.2, 0, top, 'prayer', 'Kneel');
  // Quranic calligraphy (verified Tanzil text, verbatim): high on the walls only, never at foot level
  const quran: { id: PassageId; refs: string; lines: number; drawn: boolean }[] = [];
  const writing = (pid: PassageId, w: number, h: number, x: number, y: number, z: number, rotY: number, numbered = false) => {
    const p = passage(pid), c = calligraphy(p, w, h, { numbered });
    k.keep(c.texture);
    // a touch of glow from its own gold so the writing reads in the hall's soft light (day and night)
    const m = k.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: c.texture, emissive: 0xffffff, emissiveMap: c.texture, emissiveIntensity: 0.28 }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    quran.push({ id: pid, refs: p.verses.map(v => `${v.sura}:${v.aya}`).join(','), lines: c.lines, drawn: c.drawn });
  };
  writing('ikhlas', 3.4, 0.8, 0, F + 4.15, z0 + 0.03, 0, true);                     // cartouche above the mihrab's arch
  writing('kursi', 4.6, 2.3, -6.0, F + 3.0, z0 + 0.02, 0);                    // framed Âyat al-Kursî, qibla wall, left of the mihrab
  writing('bismillah', 3.0, 0.7, 0, F + 3.75, z1 - 0.02, Math.PI);            // over the door, seen when facing the way out
  Wd.box(4.8, 2.5, 0.04, -6.0, F + 1.75, z0 + 0.02 - 0.03, 0x5e3a20);         // wooden frame behind the large panel
  const tile2 = k.keep(tileTexture()); tile2.repeat.set(4.6 / 1.1, 2.3 / 1.1);   // its pair on the right: geometric tiles, no text
  const pair = k.mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshLambertMaterial({ map: tile2 })); pair.position.set(6.0, F + 3.0, z0 + 0.02);
  Wd.box(4.8, 2.5, 0.04, 6.0, F + 1.75, z0 + 0.02 - 0.03, 0x5e3a20);
  // the mushaf, open on its folding stand (rahla) on a low table in front of the shelf: never on the floor
  const TX = -9.05, TZ = 4.6, TY = F + 0.34;
  Wd.box(0.46, 0.04, 0.66, TX, TY - 0.04, TZ, 0x6e4426);
  for (const dx of [-0.19, 0.19]) for (const dz of [-0.28, 0.28]) Wd.box(0.04, TY - 0.04 - F, 0.04, TX + dx, F, TZ + dz, 0x5a3820);
  k.solid(TX, TZ, 0.5, 0.7, 0.4);
  const book = (w: number, h: number, d: number, side: number, lift: number, color: number, wood: boolean) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, lift, side * d / 2); g.rotateX(-side * 0.3); g.rotateZ(-0.95);      // pages rise from the spine; far edge up, facing the reader (+x)
    (wood ? Wd : Pl).geometry(g, color, TX, TY + 0.2, TZ);
  };
  for (const s of [-1, 1]) {
    book(0.3, 0.012, 0.24, s, -0.02, 0x7a4a2a, true);                        // the stand's two carved boards
    book(0.27, 0.008, 0.2, s, -0.006, 0x1f5f45, false);                      // green cover
    book(0.25, 0.012, 0.19, s, 0.004, 0xf3ecd8, false);                      // pages
    const leg = new THREE.BoxGeometry(0.025, 0.14, 0.03); leg.rotateX(s * 0.5); Wd.geometry(leg, 0x7a4a2a, TX + 0.05, TY + 0.06, TZ + s * 0.035);   // the crossed feet
  }
  k.build(mats);
  const interactables: Interactable[] = [{ id: `${id}:sortir`, name: 'Sortir', kind: 'actions', x: ox, z: oz + z1 - 0.7, radius: 1.3, actions: [{ id: 'sortir', label: 'Sortir (remettre ses chaussures)', seconds: 0, special: 'exit' }] }];
  const int: Interior = {
    kind: 'venue', name: 'Salle de prière', group: root, colliders: k.colliders, interactables, seats: k.seats,
    bounds: { x0: ox + x0 + 0.3, x1: ox + x1 - 0.3, z0: oz + z0 + 0.3, z1: oz + z1 - 0.3 },
    cameraBox: { x0: ox + x0 + 0.15, x1: ox + x1 - 0.15, z0: oz + z0 + 0.15, z1: oz + z1 - 0.15 },
    spawn: { x: ox + 0.6, z: oz + z1 - 1.1, yaw: Math.PI },
    light: new THREE.Vector3(ox, F + H - 0.9, oz - 0.5), lightColor: 0xffe2b0,
  };
  const day = new THREE.Color(0xdcecf6), dusk = new THREE.Color(0x1d2a44);
  return {
    int, rows, imamSeat, chairs, at, quran,
    update(h: number) { skyMat.color.copy(dusk).lerp(day, 1 - nightOf(h)); },
    dispose() { k.dispose(); root.removeFromParent(); },
  };
}
