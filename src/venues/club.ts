import * as THREE from 'three';
import { Batch } from '../world/batch';
import { rng } from '../core/rng';
import { randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { isOpen } from '../activity/places';
import { CLUB_ENTRY, CLUB_REGULAR, TABLE_SERVICE, club as clubRecipe, clubCounters, clubCrowd, clubNight, clubTheme, nightsToContest, type ClubTheme } from '../activity/templates';
import * as P from '../activity/primitives';
import type { TargetSource } from '../interact/types';
import { price } from '../i18n/lines';
import type { Seat } from '../interact/seats';
import type { Collider } from '../world/types';
import { quote } from '../i18n/wolof';
import { VenueKit, glowQuad } from './kit';
import { Cast, type Role } from './cast';
import { conversation, counter, nightOf, relate, type Venue, type VenueEnv } from './venue';
import { CLUBBER_NAMES, CLUB_BYE, barmanGreeting, barmanMenu, clubberBye, clubberDance, clubberHello, clubberRegulars, clubberTonight, djContest, djTalk, doormanAsk, doormanBye, doormanGreeting, doormanRegulars, doormanWelcome, programme, type ClubCtx, type ClubMoment } from './talk';

/**
 * La Vague (Ngor, Almadies): a dance terrace on the north beach, open 21 h–5 h. A bamboo fence with one gate on the
 * road side, the doorman and his rope: the entry is paid once a night (a regular, after three nights, comes in free).
 * Inside: a lit dance floor (tiles that change colour on the beat), the DJ booth under a truss of coloured beams, a
 * thatched bar with stools (juices of Dakar, no alcohol), low benches by the fence, string lights and the sea behind.
 * Each night has a theme (a week of seven, the same for everyone); the « Nuit du sabar » holds a dance contest after
 * 23 h. Dancing is the shared timing gesture on the drum's beat; the crowd follows the hour (almost empty at 21 h,
 * building before midnight, the peak after it, thinning at dawn; more people with the graphics quality) and cheers a
 * good dancer. « Entrer » shows the fee before anything is paid. Inside, the terrace is its own presence space
 * (`almadies:venue:club`: its location chat and quick phrases); the bar serves on the stools, the waiter brings drinks to
 * the lounge tables, clubbers have a word for you, « Sortir » by the gate. By day the gate is shut, the sign says when it opens.
 *
 * Local frame (VenueKit): 24 × 18 m, gate toward +z (the road), the sea toward −z.
 */
export const CLUB_SITE: Record<string, { x: number; z: number; yaw: number }> = { almadies: { x: -36, z: -144, yaw: 0 } };
export const CLUB_NAME = 'La Vague';
/** Debug only (`__dakar.clubShift(n)`): play the club as if the city were n days ahead (the checks reach the contest night). */
let dayShift = 0;
export const shiftClubDay = (n: number) => { dayShift = n; };

const G0 = 0.12;                                   // top of the deck
const W = 12, D = 9;                               // half extents of the terrace
const FX = -3, FZ = -1.5, FW = 8, FD = 7;          // dance floor centre and size (1 m tiles)
const BOOTH = { x: -3, z: -7.5, h: 0.45 };
const GATE = 1.5;                                  // half width of the gate opening
/** Dancers' spots on the floor (local), the first three come at opening, the rest after 22 h. */
const SPOTS: [number, number][] = [[-4.8, -2.6], [-1.4, -2.8], [-3.0, 0.8], [-6.0, -0.6], [0.0, -0.8], [-5.6, 1.4], [-0.6, 1.5], [-3.2, -4.2], [-6.0, -4.0], [0.0, -4.2]];
/** Colours of each theme's lights. */
const PALETTE: Record<string, number[]> = {
  mbalax: [0xff8a1e, 0x1fbf5f, 0xffd23a], afro: [0xff2fa8, 0xff8a1e, 0x2fd8e8], rap: [0xe8312f, 0xf2f2f2, 0x2f6fff],
  salsa: [0xe8312f, 0xffc23a, 0xff5fa0], zouk: [0x9a4dff, 0xff5fc8, 0x3a7dff], sabar: [0xffc23a, 0xe8312f, 0x1fbf5f], retro: [0xff5fc8, 0x2fe8e0, 0xfff04a],
};
const DOORMAN: PersonLook = { skin: 0x3b2216, style: 'tee', top: 0x1c1c1f, bottom: 0x1c1c1f, muscular: 0.8, heavy: 0.3, shoes: 0x1c1c1f };
const BARMAN: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0xf2f2ec, bottom: 0x2b2f3a, shoes: 0x3a2a1e };
const WAITER: PersonLook = { skin: 0x45291a, style: 'tee', top: 0x1c1c1f, bottom: 0x1c1c1f, accent: 0xf2f2ec, shoes: 0x1c1c1f };
/** Where the lounge waiter waits (local), between the tables and the gate. */
const WAITER_HOME = { x: -7.6, z: 6.4 };
/** The player is on the terrace (its space while true): module-wide, a hub has one club. */
let inClub = false;
const DJ: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xe8742c, bottom: 0x222428, shoes: 0xf2f2ec, beard: 0x1a1414 };

/** The week's programme on the board by the gate (redrawn each night). */
function drawProgramme(cv: HTMLCanvasElement, night: number) {
  const c = cv.getContext('2d')!, w = cv.width, h = cv.height;
  c.fillStyle = '#10243a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#2fd8e8'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
  c.fillStyle = '#2fd8e8'; c.textAlign = 'center'; c.font = '800 34px system-ui, sans-serif'; c.fillText('LA VAGUE', w / 2, 52);
  c.fillStyle = '#f2f2ec'; c.font = '600 18px system-ui, sans-serif'; c.fillText('Programme · 21 h – 5 h', w / 2, 80);
  c.textAlign = 'left';
  programme(night).forEach((line, k) => {
    const [when, what] = line.split(' · '), t = clubTheme(night + k);
    const y = 122 + k * 40;
    c.fillStyle = k === 0 ? '#ffd23a' : '#9fb6c2'; c.font = `${k === 0 ? 800 : 600} 17px system-ui, sans-serif`; c.fillText(when, 20, y);
    c.fillStyle = t.contest ? '#ffc23a' : '#f2f2ec'; c.font = `${t.contest || k === 0 ? 800 : 500} 19px system-ui, sans-serif`; c.fillText((t.contest ? '★ ' : '') + what, 20, y + 20);
  });
  c.fillStyle = '#9fb6c2'; c.font = '500 15px system-ui, sans-serif'; c.fillText(`Entrée ${CLUB_ENTRY} F · habitués offerts`, 20, h - 22);
}

export function buildClub(env: VenueEnv): Venue {
  const { ctx, mats } = env;
  const world = ctx.world()!;
  const hub = world.id, site = CLUB_SITE[hub];
  const id = `${hub}:venue:club`;
  const q = ctx.quality(), lite = q === 'low';
  const SPACE = id;                                  // the terrace's own space (seats, targets, presence and chat)
  const k = new VenueKit({ x: site.x, z: site.z }, site.yaw, SPACE);
  const { plain: Pl, wood: Wd, metal: Me } = k.b;
  const at = (x: number, z: number) => k.w(x, z);
  const R = rng(4242);
  const keys = clubCounters(id);

  // ---------------------------------------------------------------- deck and bamboo fence
  Wd.box(W * 2, G0, D * 2, 0, 0, 0, 0xa8794f);                                               // wooden deck on the sand
  for (let x = -W + 1.5; x < W; x += 3) Pl.box(0.04, 0.005, D * 2 - 0.2, x, G0, 0, 0x7a5636); // board joints
  const fence = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
    const w = alongX ? len : 0.14, d = alongX ? 0.14 : len;
    Wd.box(w, h, d, mx, G0, mz, 0xcfae72);                                                   // bamboo panel
    Wd.box(alongX ? len : 0.2, 0.08, alongX ? 0.2 : len, mx, G0 + h, mz, 0x8a6a3e);            // top rail
    for (let s = 0; s <= len; s += 2.4) { const t = s / len; Wd.box(0.18, h + 0.2, 0.18, x0 + (x1 - x0) * t, G0, z0 + (z1 - z0) * t, 0x7a5a32); }
    k.solid(mx, mz, alongX ? len : 0.3, alongX ? 0.3 : len, h);
  };
  fence(-W, D, -GATE, D, 1.8); fence(GATE, D, W, D, 1.8);                                    // road side, the gate between
  fence(-W, -D, W, -D, 1.1);                                                                  // sea side: low, the sea stays in view
  fence(-W, -D, -W, D, 1.6); fence(W, -D, W, D, 1.6);

  // ---------------------------------------------------------------- the gate: arch, sign, torches, doorman's rope, day shutters
  for (const s of [-1, 1]) { Wd.box(0.32, 3.6, 0.32, s * (GATE + 0.25), G0, D, 0x5a3f22); }
  Wd.box(GATE * 2 + 1.2, 0.5, 0.4, 0, G0 + 3.4, D, 0x5a3f22);
  const signs = [k.sign(`${CLUB_NAME.toUpperCase()} · terrasse dansante`, '#10243a', '#2fd8e8', 0, G0 + 3.65, D + 0.22, 0, 3.9, 0.6, 1024)];
  const neon = new Batch();                                                                   // bulbs, neon strips and flames: lit only when open
  neon.box(GATE * 2 + 1.0, 0.05, 0.05, 0, G0 + 3.98, D + 0.22, 0x2fd8e8);
  for (const s of [-1, 1]) {
    Me.cyl(0.04, 0.05, 1.7, s * 2.7, G0, D + 0.7, 0x2b2b2f, 6);                                // torches by the gate
    Me.cyl(0.12, 0.07, 0.18, s * 2.7, G0 + 1.7, D + 0.7, 0x2b2b2f, 8);
    neon.cyl(0.0, 0.11, 0.34, s * 2.7, G0 + 1.86, D + 0.7, 0xff9a2a, 6);
  }
  const gateB = new Batch();                                                                  // shut by day: two bamboo leaves
  for (const s of [-1, 1]) { gateB.box(GATE - 0.05, 1.7, 0.08, s * GATE / 2, G0, D, 0xb8955a); for (let n = 0; n < 6; n++) gateB.box(0.07, 1.74, 0.11, s * (0.12 + n * 0.25), G0, D, 0x8a6a3e); }
  const gateMesh = gateB.build(mats.m.wood, true, true)!; k.group.add(gateMesh); k.keep(gateMesh.geometry);
  const closedSign = k.sign('FERMÉ · OUVRE À 21 H', '#7c2d12', '#fff3d6', 0, G0 + 1.15, D + 0.08, 0, 2.2, 0.38, 640);
  const ropeB = new Batch();                                                                  // at night, the doorman's rope
  for (const s of [-1, 1]) { ropeB.cyl(0.035, 0.035, 0.95, s * 1.2, G0, D + 0.6, 0xd8dade, 8); ropeB.cyl(0.16, 0.18, 0.04, s * 1.2, G0, D + 0.6, 0xd8dade, 10); ropeB.sphere(0.06, s * 1.2, G0 + 0.97, D + 0.6, 0xd8dade); }
  ropeB.box(2.4, 0.07, 0.07, 0, G0 + 0.82, D + 0.6, 0xb0182b);
  const ropeMesh = ropeB.build(mats.m.plain, true, false)!; k.group.add(ropeMesh); k.keep(ropeMesh.geometry);
  const gp = at(0, D), gate: Collider = { x0: gp.x - GATE, x1: gp.x + GATE, z0: gp.z - 0.25, z1: gp.z + 0.25, h: 1.8 };
  // the week's programme on the fence, right of the gate
  const progCv = document.createElement('canvas'); progCv.width = 300; progCv.height = 440;
  const progTex = k.keep(new THREE.CanvasTexture(progCv)); progTex.colorSpace = THREE.SRGBColorSpace;
  const progMat = (new THREE.MeshLambertMaterial({ map: progTex, emissive: 0xffffff, emissiveMap: progTex, emissiveIntensity: 0 }));
  const board = k.mesh(new THREE.PlaneGeometry(1.3, 1.9), progMat); board.position.set(4.4, G0 + 1.55, D + 0.12);
  Wd.box(1.45, 0.08, 0.1, 4.4, G0 + 2.52, D + 0.1, 0x5a3f22);

  // ---------------------------------------------------------------- dance floor (tiles lit on the beat: one small texture)
  const tiles = new Uint8Array(FW * FD * 4);
  const tileTex = k.keep(new THREE.DataTexture(tiles, FW, FD, THREE.RGBAFormat));
  tileTex.magFilter = THREE.NearestFilter; tileTex.minFilter = THREE.NearestFilter; tileTex.colorSpace = THREE.SRGBColorSpace;
  const tileMat = new THREE.MeshBasicMaterial({ map: tileTex });
  const fg = new THREE.PlaneGeometry(FW, FD); fg.rotateX(-Math.PI / 2);
  const floorMesh = k.mesh(fg, tileMat); floorMesh.position.set(FX, G0 + 0.012, FZ);
  for (let i = 0; i <= FW; i++) Pl.box(0.05, 0.006, FD, FX - FW / 2 + i, G0 + 0.012, FZ, 0x1a1a1f);   // grout
  for (let j = 0; j <= FD; j++) Pl.box(FW, 0.006, 0.05, FX, G0 + 0.012, FZ - FD / 2 + j, 0x1a1a1f);
  for (const s of [-1, 1]) { Me.box(FW + 0.2, 0.04, 0.1, FX, G0, FZ + s * (FD / 2 + 0.05), 0x9aa0a6); Me.box(0.1, 0.04, FD, FX + s * (FW / 2 + 0.05), G0, FZ, 0x9aa0a6); }

  // ---------------------------------------------------------------- DJ booth, speakers, truss and beams
  Pl.box(5.2, BOOTH.h, 2.4, BOOTH.x, G0, BOOTH.z, 0x1c1c22); k.solid(BOOTH.x, BOOTH.z, 5.2, 2.4, BOOTH.h + 1.1);
  Pl.box(3.0, 1.0, 0.7, BOOTH.x, G0 + BOOTH.h, BOOTH.z + 0.75, 0x2a2a33);                     // the desk
  neon.box(3.0, 0.06, 0.04, BOOTH.x, G0 + BOOTH.h + 0.5, BOOTH.z + 1.11, 0x2fd8e8);
  for (const s of [-1, 1]) { Pl.cyl(0.24, 0.24, 0.04, BOOTH.x + s * 0.8, G0 + BOOTH.h + 1.0, BOOTH.z + 0.7, 0x111114, 14); neon.cyl(0.05, 0.05, 0.05, BOOTH.x + s * 0.8, G0 + BOOTH.h + 1.0, BOOTH.z + 0.7, 0xff5fc8, 8); }
  neon.box(0.5, 0.02, 0.32, BOOTH.x, G0 + BOOTH.h + 1.0, BOOTH.z + 0.62, 0x9fd8ff);                 // the laptop's light
  for (const sx of [-6.4, 0.4]) {
    Pl.box(1.0, 1.9, 0.9, sx, G0, -6.9, 0x18181c); k.solid(sx, -6.9, 1.0, 0.9, 1.9);
    for (const y of [0.5, 1.35]) Pl.cyl(0.3, 0.3, 0.04, sx, G0 + y, -6.43, 0x2f2f36, 14, [Math.PI / 2, 0, 0]);
  }
  for (const s of [-1, 1]) { Me.box(0.22, 4.5, 0.22, FX + s * 4.6, G0, -6.0, 0x8a8f96); k.solid(FX + s * 4.6, -6.0, 0.3, 0.3, 4.5); }
  Me.box(9.4, 0.26, 0.26, FX, G0 + 4.3, -6.0, 0x8a8f96);
  const SPOT_X = lite ? [-5, -1] : [-6, -4, -2, 0];
  for (const sx of SPOT_X) Me.cyl(0.12, 0.16, 0.32, sx, G0 + 3.98, -6.0, 0x2b2b2f, 8);
  signs.push(k.sign(CLUB_NAME.toUpperCase(), '#10243a', '#ff5fc8', FX, G0 + 4.95, -5.86, 0, 3.0, 0.7, 512));
  const beams = SPOT_X.map((sx, i) => {
    const g = new THREE.ConeGeometry(1.15, 4.3, 14, 1, true); g.translate(0, -2.15, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = k.mesh(g, mat); m.position.set(sx, G0 + 3.85, -6.0); m.renderOrder = 2; m.userData.i = i; return m;
  });

  // ---------------------------------------------------------------- the bar: counter, shelf of juices, stools, thatched roof
  Wd.box(1.0, 1.1, 8.0, 9.6, G0, -1.0, 0x6b4a2a); Pl.box(1.2, 0.06, 8.2, 9.6, G0 + 1.1, -1.0, 0xe8dcc0);
  neon.box(0.04, 0.05, 7.8, 9.08, G0 + 0.2, -1.0, 0xff8a1e);
  k.solid(9.6, -1.0, 1.0, 8.0, 1.1);
  Wd.box(0.5, 2.0, 6.0, 11.6, G0, -1.0, 0x5a3f22); k.solid(11.6, -1.0, 0.5, 6.0, 2.0);
  const JUICE = [0xb0182b, 0xe8d28a, 0xe8b45a, 0xff8a1e, 0xd8f0ff];
  for (let n = 0; n < 16; n++) Pl.cyl(0.05, 0.05, 0.26, 11.45, G0 + (n < 8 ? 1.12 : 1.62), -3.6 + (n % 8) * 0.72, JUICE[n % 5], 6);
  for (const y of [1.1, 1.6]) Wd.box(0.42, 0.04, 5.8, 11.45, G0 + y, -1.0, 0x8a6a3e);
  neon.box(0.03, 0.04, 5.8, 11.33, G0 + 2.0, -1.0, 0xffd28a);
  for (const z of [-5.1, 3.1]) { Wd.box(1.8, 0.95, 0.4, 11.0, G0, z, 0x6b4a2a); k.solid(11.0, z, 1.8, 0.4, 0.95); }   // closes the barman's side
  const stools: Seat[] = [-4.2, -2.6, -1.0, 0.6, 2.2].map((z, i) => {
    Me.cyl(0.03, 0.05, 0.62, 8.5, G0, z, 0x9aa0a6, 6); Me.cyl(0.16, 0.16, 0.02, 8.5, G0, z, 0x9aa0a6, 10);
    Pl.cyl(0.19, 0.19, 0.07, 8.5, G0 + 0.62, z, 0xb0182b, 12);
    return k.seat(`${id}:tabouret:${i}`, 8.5, z, Math.PI / 2, G0 + 0.68, 'stool');
  });
  const thatchB = new Batch();
  for (const [x, z] of [[8.5, -5.7], [11.8, -5.7], [8.5, 3.7], [11.8, 3.7]]) { Wd.box(0.16, 2.9, 0.16, x, G0, z, 0x7a5a32); k.solid(x, z, 0.25, 0.25, 2.9); }
  thatchB.slab(4.6, 0.32, 10.4, 10.3, G0 + 3.15, -1.0, 0xc9a45c, 0, 0);
  for (let n = 0; n < 9; n++) thatchB.box(0.06, 0.4, 10.6, 8.2 + n * 0.52, G0 + 2.7, -1.0, n % 2 ? 0xb8904a : 0xd8b46a);   // straw fringe
  const thatch = thatchB.build(mats.m.plain, true, true)!; k.group.add(thatch); k.keep(thatch.geometry);

  // ---------------------------------------------------------------- lounge by the west fence, standing tables
  const lounge: Seat[] = [];
  for (const z of [-5, -1, 3]) {
    Wd.box(0.8, 0.4, 2.6, -11.3, G0, z, 0x5a3f22); Pl.box(0.78, 0.1, 2.5, -11.3, G0 + 0.4, z, [0x1f7a44, 0xb0182b, 0x27407a][(z + 5) / 4]);
    Pl.box(0.25, 0.5, 2.5, -11.65, G0 + 0.4, z, 0xe8dcc0);
    k.solid(-11.3, z, 0.8, 2.6, 0.45);
    lounge.push(...k.bench(`${id}:banquette:${z}`, -11.1, z, Math.PI / 2, 2.4, 2, G0 + 0.5));
    Wd.box(0.9, 0.42, 1.1, -9.9, G0, z, 0x8a6a3e); k.solid(-9.9, z, 0.9, 1.1, 0.42);
    neon.cyl(0.07, 0.09, 0.2, -9.9, G0 + 0.42, z, 0xffc26a, 6);
  }
  for (const z of [-3, 1.5]) { Me.cyl(0.05, 0.05, 1.05, 4.6, G0, z, 0x2b2b2f, 6); Wd.cyl(0.38, 0.38, 0.05, 4.6, G0 + 1.05, z, 0x8a6a3e, 14); k.solid(4.6, z, 0.6, 0.6, 1.1); }

  // ---------------------------------------------------------------- string lights along the fences
  const string = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(((t * len) % 4) / 4 * Math.PI) * 0.28;
      neon.box(0.09, 0.12, 0.09, x0 + (x1 - x0) * t, G0 + 2.62 - sag, z0 + (z1 - z0) * t, [0xffe0a0, 0xff9a5a, 0x9fe8ff, 0xffe0a0][i % 4]);
    }
    for (let s = 0; s <= len + 0.01; s += 4) { const t = s / len; Wd.box(0.08, 2.7, 0.08, x0 + (x1 - x0) * t, G0, z0 + (z1 - z0) * t, 0x5a3f22); }
  };
  string(-W + 0.15, -D + 0.15, -W + 0.15, D - 0.3); string(W - 0.15, -D + 0.15, W - 0.15, -6.2); string(-W + 0.15, -D + 0.15, W - 0.15, -D + 0.15);   // along the fences, clear of the bar
  const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const neonMesh = neon.build(neonMat, false, false)!; k.group.add(neonMesh); k.keep(neonMesh.geometry); k.keep(neonMat);
  const floorPool = glowQuad(k, FW + 4, FD + 4, 0xff5fc8, FX, G0 + 0.03, FZ);
  const barPool = glowQuad(k, 6, 11, 0xffb060, 9.2, G0 + 0.03, -1.0);
  const gatePool = glowQuad(k, 7.5, 4, 0xff9a3a, 0, G0 + 0.03, D + 0.8);
  k.build(mats);
  ctx.extra.add(k.group);
  world.colliders.push(...k.colliders);
  for (const s of k.seats) ctx.seats.add(s);
  // the place's identity in the hub (« Les coins du quartier », walking hint), in front of the gate
  const front = at(0, D + 2.6);
  world.interactables.push({ id: `${hub}:city:club`, name: `${CLUB_NAME} · terrasse dansante`, kind: 'actions', x: front.x, z: front.z, radius: 0, actions: [],
    description: `Lamine, le videur : « Dalal ak jàmm ! » Ouvert de 21 h à 5 h · une soirée à thème chaque nuit.` });

  // ---------------------------------------------------------------- the place
  const day = () => ctx.day() + dayShift;
  const night = () => clubNight(day(), ctx.hour());
  const admitted = () => counter(ctx, keys.paid) === night() + 1;
  const clubCtx = (): ClubCtx => ({ night: night(), hour: ctx.hour(), nights: counter(ctx, keys.nights), regularAt: CLUB_REGULAR, entry: CLUB_ENTRY });
  const later: { t: number; line: string }[] = [];
  const queue = (line: string, delay = 2.7) => later.push({ t: delay, line });   // after the activity's own « ✓ » toast
  const scoreNow = () => { const s = ctx.activities.current?.scores ?? []; return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0; };
  const talk = (role: string) => {
    ctx.state.adjust({ social: 3 });
    if (role === 'videur') {
      relate(ctx, 'lamine_vague', 1);
      conversation(ctx, `Lamine · ${CLUB_NAME}`, doormanGreeting(clubCtx()), [
        { label: 'Le programme de la semaine', icon: '📅', pick: () => `« ${programme(night()).join(' · ')}. »` },
        { label: 'Et les habitués ?', icon: '🤝', pick: () => doormanRegulars(clubCtx()) },
        { label: 'Le concours de danse', icon: '🏆', pick: () => djContest(clubCtx()) },
        { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`Lamine : ${CLUB_BYE}`); return null; } },
      ]);
    } else if (role === 'barman') {
      relate(ctx, 'saliou_vague', 1);
      conversation(ctx, `Saliou · bar de ${CLUB_NAME}`, barmanGreeting(counter(ctx, keys.nights)), [
        { label: 'Qu’est-ce qu’on boit ?', icon: '🥤', pick: () => barmanMenu() },
        { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`Saliou : ${CLUB_BYE}`); return null; } },
      ]);
    } else {
      relate(ctx, 'dj_mbaye', 1);
      conversation(ctx, 'DJ Mbaye', djTalk(clubCtx()), [
        { label: 'Le concours de danse', icon: '🏆', pick: () => djContest(clubCtx()) },
        { label: 'Les prochaines soirées', icon: '📅', pick: () => `« ${programme(night() + 1, 6).join(' · ')}. »` },
        { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`DJ Mbaye : « Ba beneen yoon ! »`); return null; } },
      ]);
    }
  };
  const cheer = (n: number) => {
    const me = ctx.player.pos, near = dancers.map(d => ({ d, p: cast.where(d) })).filter(e => e.p?.shown)
      .sort((a, b) => Math.hypot(a.p!.x - me.x, a.p!.z - me.z) - Math.hypot(b.p!.x - me.x, b.p!.z - me.z));
    for (const e of near.slice(0, n)) cast.burst(e.d, 'Celebrate', 2.6);
  };
  const done = (a: string) => {
    const s = scoreNow();
    if (a === 'entree') {
      ctx.state.data.counters[keys.paid] = night() + 1;
      relate(ctx, 'lamine_vague', 1);
      queue(doormanWelcome(clubCtx()), 0.1);
    } else if (a === 'danse') {
      if (s >= 0.8) { cheer(3); queue(`Une danseuse : ${quote('Rafet na')} · la piste t’applaudit`); }
      else if (s < 0.45) queue(`Un danseur : ${quote('Ndank ndank')} · écoute le tambour`);
    } else if (a === 'concours') {
      ctx.state.data.counters[keys.contestNight] = night() + 1;
      cheer(dancers.length);
      if (s >= 0.9) { ctx.state.count(`${keys.contests}:victoires`); queue('DJ Mbaye : « Le gagnant de ce soir… c’est toi ! » · toute la terrasse applaudit'); }
      else queue(s >= 0.65 ? 'DJ Mbaye : « Deuxième place ! Rafet na ! » · reviens à la prochaine nuit du sabar' : 'DJ Mbaye : « Applaudissez-le ! » · la prochaine nuit du sabar, tu feras mieux');
    } else if (a === 'sortie') {
      const out = at(0, D + 2.4); ctx.player.place(out.x, out.z, site.yaw);
      queue(doormanBye(), 0.1);
    } else if (a === 'morceau') {
      cast.burst('dj', 'Celebrate', 2.2); cheer(4);
      queue('DJ Mbaye : « Waaw kay ! Celui-là, c’est pour toi ! »', 0.1);
    }
  };
  const barC = at(8.5, -1.0), loungeC = at(-11.1, -1.0);
  const place = clubRecipe({
    id, name: `${CLUB_NAME} · terrasse dansante`, space: SPACE, bar: { ...barC, r: 3.6 }, lounge: { ...loungeC, r: 5.2 },
    anchors: [
      { id: 'door', name: `Entrée · ${CLUB_NAME}`, kind: 'door', ...at(0, D + 1.6), y: 2.4, radius: 2.0, space: 'street' },
      { id: 'floor', name: 'Piste de danse', kind: 'spot', ...at(FX, FZ), y: 2.0, radius: 3.3 },
      { id: 'bar', name: `Bar · ${CLUB_NAME}`, kind: 'counter', ...at(8.0, -1.0), y: 1.9, radius: 3.6, bias: -0.5 },   // reached from every stool
      { id: 'lounge', name: 'Tables · service à table', kind: 'furniture', ...at(-9.3, -1.0), y: 1.6, radius: 4.6, bias: 0.2 },
      { id: 'dj', name: 'DJ Mbaye', kind: 'person', ...at(BOOTH.x, -5.75), y: 2.3, radius: 1.5, bias: -1 },            // wins over greeting him
      { id: 'exit', name: 'Sortie', kind: 'door', ...at(0, D - 1.7), y: 2.2, radius: 1.4 },
    ],
  }, {
    count: c => counter(ctx, c), day, hour: () => ctx.hour(), converse: talk, done, enter: () => askEntry(),
    tired: e => (ctx.state.data.needs.energie < e ? 'Tu es trop fatigué pour danser · repose-toi' : null),
  });
  // « Entrer »: the fee is shown before anything is paid; « Payer » runs the place's own paying step
  const askEntry = () => {
    const pay = { ...place.offers.door.find(o => o.id === 'payer')!, visible: undefined }, short = ctx.state.wallet < CLUB_ENTRY;   // hidden on the sheet, run from here
    ctx.menu(`${CLUB_NAME} · entrée`, doormanAsk(clubCtx()), [
      { label: `Payer ${price(CLUB_ENTRY)} et entrer`, icon: '🎟️', right: `−${price(CLUB_ENTRY)}`, disabled: short, detail: short ? 'Pas assez d’argent sur toi' : 'Une seule fois pour toute la nuit',
        onPick: () => { ctx.hud.closeModal(); ctx.activities.start(pay, { place: place.name }); } },
      { label: 'Pas ce soir', icon: '👋', onPick: () => { ctx.hud.closeModal(); ctx.toast(`Lamine : ${CLUB_BYE}`); } },
    ]);
  };
  ctx.places.add(place);

  // ---------------------------------------------------------------- the people: doorman, barman, DJ, the crowd
  const nDancers = q === 'low' ? 4 : q === 'medium' ? 7 : 10;
  const dancers = SPOTS.slice(0, nDancers).map((_, i) => `danse${i}`);
  const dancerRoles: Role[] = SPOTS.slice(0, nDancers).map(([x, z], i) => ({
    id: `danse${i}`, look: randomLook(R), ...at(x, z), y: G0, yaw: site.yaw + Math.PI + (R() - 0.5) * 1.4, clip: (i % 2 ? 'Dance_B' : 'Dance_A') as Clip,
    phase: R(), yieldR: 0.95, when: (m: string) => m === 'peak' || (m === 'warm' && i < Math.ceil(nDancers / 2)) || (m === 'early' && i < 1) || (m === 'dawn' && i < 2),
  }));
  const S = (list: Seat[], i: number) => list[i];
  /** Clubbers with a word for you: on stools, at the lounge tables, standing at a high table; named by their look. */
  interface Talker { role: Role; name: string; female: boolean }
  const named = { f: 0, m: 0 };
  const talker = (role: Omit<Role, 'look'>): Talker => {
    const look = randomLook(R), female = !!look.female, list = female ? CLUBBER_NAMES.f : CLUBBER_NAMES.m;
    return { role: { ...role, look } as Role, female, name: list[(female ? named.f++ : named.m++) % list.length] };
  };
  const talkers: Talker[] = [
    talker({ id: 'bar0', seat: S(stools, 0), when: m => m !== 'closed' }),
    talker({ id: 'bar1', seat: S(stools, 3), when: m => (m === 'peak' || m === 'warm') && !lite }),
    talker({ id: 'lounge0', seat: S(lounge, 0), when: m => m === 'warm' || m === 'peak' || m === 'dawn' }),
    talker({ id: 'lounge1', seat: S(lounge, 3), when: m => m === 'peak' }),
    talker({ id: 'lounge2', seat: S(lounge, 4), when: m => m === 'peak' && !lite }),
    talker({ id: 'debout0', ...at(4.0, -3.0), y: G0, yaw: site.yaw + Math.PI / 2, clip: 'Talk', when: m => m === 'warm' || m === 'peak' }),
    talker({ id: 'debout1', ...at(5.2, -3.0), y: G0, yaw: site.yaw - Math.PI / 2, clip: 'Talk', phase: 0.4, when: m => m === 'peak' && !lite }),
  ];
  const roles: Role[] = [
    { id: 'videur', look: DOORMAN, ...at(2.3, D + 1.0), yaw: site.yaw, clip: 'Idle', when: m => m !== 'closed' },
    { id: 'barman', look: BARMAN, ...at(10.75, -1.2), y: G0, yaw: site.yaw - Math.PI / 2, clip: 'Talk', when: m => m !== 'closed' },
    { id: 'dj', look: DJ, ...at(BOOTH.x, BOOTH.z - 0.1), y: G0 + BOOTH.h, yaw: site.yaw, clip: 'Dance_B', phase: 0.3, when: m => m !== 'closed' },
    ...dancerRoles,
    { id: 'serveur', look: WAITER, ...at(WAITER_HOME.x, WAITER_HOME.z), y: G0, yaw: site.yaw - Math.PI / 2, clip: 'Idle', when: m => m !== 'closed' },
    ...talkers.map(t => t.role),
  ];
  const cast = new Cast(roles, ctx.seats, ctx.extra, id);
  env.addPeople(() => cast.bodies().filter(b => b.id.endsWith(':videur')));       // in the street: the doorman; inside, the clubbers below

  // ---------------------------------------------------------------- clubbers: a short exchange (French and everyday Wolof)
  const met = new Set<string>();
  const chatWith = (t: Talker) => {
    const first = !met.has(t.role.id); met.add(t.role.id);
    const m = clubCrowd(ctx.hour()) as ClubMoment;
    ctx.state.adjust({ social: 4 }); relate(ctx, `vague_${t.role.id}`, 1);
    conversation(ctx, `${t.name} · ${CLUB_NAME}`, clubberHello(t.name, m === ('closed' as string) ? 'early' : m, first), [
      { label: 'La soirée', icon: '🎶', pick: () => clubberTonight(night(), ctx.hour()) },
      { label: 'Tu viens souvent ?', icon: '🤝', pick: () => clubberRegulars(counter(ctx, keys.nights), CLUB_REGULAR) },
      { label: 'On danse ?', icon: '💃', pick: () => { ctx.state.adjust({ moral: 2 }); return clubberDance(); } },
      { label: m === 'dawn' ? 'Bonne nuit' : 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`${t.name} : ${clubberBye(m)}`); return null; } },
    ]);
  };
  const clubbers: TargetSource = {
    name: 'club-people',
    collect: (space, x, z, out) => {
      if (space !== SPACE) return;
      for (const t of talkers) {
        const w = cast.where(t.role.id); if (!w?.shown || Math.abs(w.x - x) > 2.4 || Math.abs(w.z - z) > 2.4) continue;
        const known = met.has(t.role.id), spec = P.talk({ id: 'discuter', label: known ? `Discuter avec ${t.name}` : 'Discuter', then: () => chatWith(t) });
        out.push({ id: `${id}:client:${t.role.id}`, name: known ? t.name : t.female ? 'Une cliente' : 'Un client', kind: 'person', space, x: w.x, z: w.z, y: t.role.seat ? 1.6 : 2.15, radius: 2.4, bias: 0.3,
          affordances: () => [{ id: spec.id, verb: spec.primitive, label: spec.label, icon: spec.icon, disabled: ctx.activities.blocked(spec), run: () => { ctx.activities.start(spec); } }] });
      }
    },
  };
  ctx.interactions.add(clubbers);

  // ---------------------------------------------------------------- the night: moments, gate, lights on the beat
  let t = 0, moment = '', beat = -2, shut: boolean | null = null, progNight = Number.NaN;   // beat -1 = the closed pattern
  let serving: unknown = null;
  const col = new THREE.Color();
  const paint = (theme: ClubTheme, b: number, open: boolean) => {
    const pal = PALETTE[theme.id] ?? PALETTE.mbalax;
    for (let j = 0; j < FD; j++) for (let i = 0; i < FW; i++) {
      const o = (j * FW + i) * 4;
      if (!open) { const v = (i + j) % 2 ? 70 : 92; tiles[o] = v; tiles[o + 1] = v; tiles[o + 2] = v + 8; tiles[o + 3] = 255; continue; }
      const mode = Math.floor(b / 8) % 3;
      const pick = mode === 0 ? (i + j + b) % 2 ? -1 : (b >> 1) % 3 : mode === 1 ? (Math.abs(i - FW / 2 + 0.5) + Math.abs(j - FD / 2 + 0.5) + 16 - (b % 8)) % 3 | 0 : ((i * 7 + j * 13 + b * 5) % 5 < 2 ? (i + b) % 3 : -1);
      if (pick < 0) { tiles[o] = 24; tiles[o + 1] = 20; tiles[o + 2] = 34; } else { col.set(pal[pick]); tiles[o] = col.r * 255; tiles[o + 1] = col.g * 255; tiles[o + 2] = col.b * 255; }
      tiles[o + 3] = 255;
    }
    tileTex.needsUpdate = true;
  };
  const update = (dt: number) => {
    t += dt;
    const h = ctx.hour(), open = isOpen(place.hours, h), n = nightOf(h), theme = clubTheme(night());
    const m = clubCrowd(h);
    if (m !== moment) { moment = m; cast.setMoment(m); }
    if (night() !== progNight) { progNight = night(); drawProgramme(progCv, progNight); progTex.needsUpdate = true; }
    // the gate: shut by day, the rope until you have paid tonight; never closes on someone inside
    const me = k.local(ctx.player.pos.x, ctx.player.pos.z);
    const insideNow = me.x > -W && me.x < W && me.z > -D && me.z < D + 0.45;
    inClub = !ctx.inside() && me.x > -W + 0.1 && me.x < W - 0.1 && me.z > -D + 0.1 && me.z < D - 0.15;
    const want = !(open && admitted()) && !insideNow;
    if (want !== shut) {
      shut = want;
      const i = world.colliders.indexOf(gate);
      if (want && i < 0) world.colliders.push(gate); else if (!want && i >= 0) world.colliders.splice(i, 1);
    }
    gateMesh.visible = closedSign.visible = !open && !insideNow;                // the leaves swing open for someone leaving
    ropeMesh.visible = open && !admitted();
    // lights: on the beat when open (≈ 124 bpm), dark by day
    const b = Math.floor(t / 0.485);
    const key = open ? b : -1;
    if (key !== beat) { beat = key; paint(theme, b, open); }
    tileMat.color.setScalar(open ? 0.55 + 0.45 * n : 0.8);
    neonMat.color.setScalar(open ? 0.55 + 0.45 * n : 0.22);
    const pal = PALETTE[theme.id] ?? PALETTE.mbalax;
    for (const beam of beams) {
      const i = beam.userData.i as number, mat = beam.material as THREE.MeshBasicMaterial;
      beam.visible = open && n > 0.2;
      if (!beam.visible) continue;
      beam.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.55; beam.rotation.x = Math.cos(t * 0.63 + i * 1.1) * 0.4;
      mat.color.set(pal[(i + (b >> 2)) % pal.length]); mat.opacity = 0.16 * n;
    }
    (floorPool.material as THREE.MeshBasicMaterial).opacity = open ? 0.5 * n : 0;
    (floorPool.material as THREE.MeshBasicMaterial).color.set(pal[(b >> 1) % pal.length]);
    (barPool.material as THREE.MeshBasicMaterial).opacity = open ? 0.45 * n : 0;
    (gatePool.material as THREE.MeshBasicMaterial).opacity = open ? (0.4 + 0.08 * Math.sin(t * 9)) * n : 0;
    for (const s of signs) (s.material as THREE.MeshLambertMaterial).emissiveIntensity = open ? 0.25 + 0.6 * n : 0.1 * n;
    progMat.emissiveIntensity = 0.2 + 0.4 * n;
    // cutaway: under the thatch the follow camera would only see straw
    thatch.visible = !(ctx.camera.position.y > G0 + 3.0 && me.x > 8 - 1 && me.z > -6.2 && me.z < 4.2 && me.x < W);
    // table service: the waiter walks to the player's table while the drink is brought, then back to his spot
    const cur = ctx.activities.current, table = !!cur && cur.spec.id.startsWith('table_');
    if (table && cur!.step.label === TABLE_SERVICE && serving !== cur!.spec) {
      serving = cur!.spec; const seat = ctx.player.seated();
      if (seat) { const ls = k.local(seat.x, seat.z); cast.walkTo('serveur', [at(-9.0, ls.z)], site.yaw - Math.PI / 2, 'Talk', 2.4); }
    }
    if (!table && serving) { serving = null; cast.walkTo('serveur', [at(WAITER_HOME.x, WAITER_HOME.z)], site.yaw - Math.PI / 2, 'Idle', 1.6); }
    const sp = ctx.space();
    cast.update(dt, ctx.camera.position, lite ? 45 : 70, sp === 'street' || sp === SPACE, ctx.player.pos);
    for (let i = later.length - 1; i >= 0; i--) { later[i].t -= dt; if (later[i].t <= 0) { ctx.toast(later[i].line); later.splice(i, 1); } }
  };

  return {
    id, type: 'club', name: place.name, places: [place], update,
    space: () => (inClub ? SPACE : null),
    dispose() { ctx.interactions.remove('club-people'); cast.dispose(); k.dispose(); later.length = 0; inClub = false; },
    debug: () => ({
      id, type: 'club', name: place.name, origin: { x: site.x, z: site.z }, yaw: site.yaw, moment, open: isOpen(place.hours, ctx.hour()), space: inClub ? SPACE : null,
      waiter: cast.where('serveur'), lounge: lounge.map(s => s.id), talkers: talkers.map(t => ({ id: t.role.id, ...cast.where(t.role.id)! })).filter(w => w.shown),
      night: night(), theme: clubTheme(night()).id, contestIn: nightsToContest(night()), admitted: admitted(), gateShut: shut, rope: ropeMesh.visible, beams: beams.filter(b => b.visible).length,
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: a.space ?? place.space })), seats: k.seats.map(s => s.id), stools: stools.map(s => s.id),
      npcs: cast.presentCount, visibleNpcs: cast.shownCount, dancers: dancers.map(d => cast.where(d)),
      entrance: at(0, D + 2.2), inside: at(0, D - 2.5), floor: at(FX, FZ),
      counters: { paid: counter(ctx, keys.paid), nights: counter(ctx, keys.nights), dances: counter(ctx, keys.dances), contests: counter(ctx, keys.contests), contestNight: counter(ctx, keys.contestNight) },
      tile: Array.from(tiles.slice(0, 4)),
    }),
  };
}
