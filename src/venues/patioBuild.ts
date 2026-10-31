import * as THREE from 'three';
import { Batch } from '../world/batch';
import { rng } from '../core/rng';
import type { Seat } from '../interact/seats';
import { VenueKit, archBand, archPiece, glowTexture, type VenueMaterials } from './kit';
import { SIGNS, programme } from '../i18n/patioLines';
import {
  BAR, BOOTH, DANCE_FLOOR, FLOOR_TOP as F, GATE, HW, PATIO_DRINKS, PATIO_ENTRY, PATIO_HOURS, PATIO_REGULAR, PORCH, SALON, SEAT_IDS, SMOKE_DOOR, TERRACE, VIP, WALL_T, ZB, ZF,
} from './patioPlan';
import { price } from '../i18n/lines';

/**
 * Le Patio's geometry: an ochre courtyard club on the night street's empty site (docs/districts/PATIO.md), drawn into a VenueKit in the club's local frame (the gate on the road toward +z,
 * the sea toward −z). It is a few merged batches — the kit's plain / wall / wood / paving, one neon batch, the dance floor's lit tiles, ONE atlas of painted signs, one board that is
 * redrawn when the door opens or a night turns, ONE mesh of additive light pools, two beams, and one mesh that is the day's (the shut leaves, the crates) or the night's (the rope and its
 * posts) — at most twelve draw calls at night. Nothing here is unseeded: the only random stream is a local one seeded from a constant, so the same site is built the same way every time.
 */
const OCHRE = 0xc98a42, OCHRE2 = 0xbf7f3a, CAP = 0x8f5a2c, TRIM = 0xe6cf9b, TERRA = 0xa8552e, MAGENTA = 0xd81b60, TEAL = 0x1f6f6a, GOLD = 0xd9a441;
const WOOD_D = 0x4a2c1a, WOOD_M = 0x7a4e2c, WOOD_L = 0x9a6b3c, STEEL = 0x24232b, VELVET = 0x9a1030, AMBER = 0xffb14a, PINK = 0xff4fa8, WARM = 0xffd9a0;

/** The terrace is a raised deck: its height above the courtyard's floor at a local point, with a short ramp (two treads) on the west and north edges and a longer one across the smokers' door out to the promenade. */
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
export function terraceHeight(x: number, z: number): number {
  if (x < TERRACE.x0 - 0.6 || x > TERRACE.x1 || z < TERRACE.z0 - 0.6) return 0;
  const inDoor = Math.abs(x - SMOKE_DOOR.x) <= SMOKE_DOOR.half + 0.1;
  if (z > TERRACE.z1) return inDoor ? TERRACE.lift * (1 - smooth((z - TERRACE.z1) / 1.0)) : 0;
  return TERRACE.lift * smooth((x - (TERRACE.x0 - 0.6)) / 0.6) * smooth((z - (TERRACE.z0 - 0.6)) / 0.6);
}

/** One additive pool of light: flat on the floor, or upright on a wall (`yaw` is the way it faces). Its group is lit together (src/venues/patio.ts). */
export interface Pool { group: string; x: number; y: number; z: number; w: number; h: number; flat: boolean; yaw: number }
export interface Box { x0: number; x1: number; z0: number; z1: number; h: number }
/** Where every collider came from (the tests account for each one). */
export interface Account extends Box { why: string }

export interface PatioParts {
  group: THREE.Group;
  seats: { stools: Seat[]; salon: Seat[]; vip: Seat[] };
  /** Colliders as drawn, in local metres, with why. */
  accounts: Account[];
  /** The two gates (world colliders toggled by the venue): the arched gate and the smokers' door. */
  gates: { main: Box[]; smoke: Box[] };
  atlas: { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial };
  boards: { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; cv: HTMLCanvasElement; tex: THREE.CanvasTexture };
  neon: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
  tiles: { data: Uint8Array; tex: THREE.DataTexture; mat: THREE.MeshBasicMaterial; w: number; d: number };
  pools: { mesh: THREE.Mesh; colors: Float32Array; list: Pool[] };
  beams: THREE.Mesh[];
  day: THREE.Mesh | null;
  night: THREE.Mesh | null;
  /** Triangles drawn by the batches, by name (the budget in docs/districts/PATIO.md). */
  tris: Record<string, number>;
  /** The local points the venue needs: where the doorman's rope is, the dance floor's spot. */
  at: { floor: { x: number; z: number }; door: { x: number; z: number }; rope: { x: number; z: number } };
}

// ------------------------------------------------------------------ the painted signs
interface Cell { id: string; w: number; h: number; x: number; y: number }
const ATLAS_W = 1536;
/** Shelf-packs the atlas's cells (in order): the same layout every time. */
function pack(cells: { id: string; w: number; h: number }[]): { cells: Cell[]; height: number } {
  const out: Cell[] = []; let x = 0, y = 0, row = 0;
  for (const c of cells) {
    if (x + c.w > ATLAS_W) { x = 0; y += row; row = 0; }
    out.push({ ...c, x, y }); x += c.w; row = Math.max(row, c.h);
  }
  return { cells: out, height: y + row };
}
const font = (w: number, s: number) => `${w} ${s}px system-ui, sans-serif`;
function neonText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, core: string, glow: string, weight = 800, spacing = 0) {
  c.font = font(weight, size); c.textAlign = 'center'; c.textBaseline = 'middle';
  const anyC = c as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in anyC) anyC.letterSpacing = `${spacing}px`;
  c.shadowColor = glow; c.shadowBlur = size * 0.35; c.fillStyle = glow; c.fillText(text, x, y);
  c.shadowBlur = size * 0.1; c.fillStyle = core; c.fillText(text, x, y);
  c.shadowBlur = 0;
  if ('letterSpacing' in anyC) anyC.letterSpacing = '0px';
}
function drawAtlas(cv: HTMLCanvasElement, cells: Cell[]) {
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1a0f16'; c.fillRect(0, 0, cv.width, cv.height);
  for (const cell of cells) {
    c.save(); c.translate(cell.x, cell.y); c.beginPath(); c.rect(0, 0, cell.w, cell.h); c.clip();
    const cx = cell.w / 2, cy = cell.h / 2;
    if (cell.id === 'main') {                                                      // the sign over the gate: aubergine ground, a magenta frame, amber letters
      const g = c.createLinearGradient(0, 0, 0, cell.h); g.addColorStop(0, '#34122e'); g.addColorStop(1, '#1d0b1c');
      c.fillStyle = g; c.fillRect(0, 0, cell.w, cell.h);
      c.strokeStyle = '#ff4fa8'; c.lineWidth = 7; c.shadowColor = '#ff4fa8'; c.shadowBlur = 16; c.strokeRect(12, 12, cell.w - 24, cell.h - 24); c.shadowBlur = 0;
      c.strokeStyle = '#ffb14a'; c.lineWidth = 2; c.strokeRect(26, 26, cell.w - 52, cell.h - 52);
      neonText(c, SIGNS.main, cx, cell.h * 0.43, cell.h * 0.52, '#fff3d6', '#ffa62e', 900, 14);
      neonText(c, SIGNS.sub, cx, cell.h * 0.8, cell.h * 0.15, '#ffe6f2', '#ff4fa8', 700, 6);
    } else if (cell.id === 'bar') {
      c.fillStyle = '#1f0f1e'; c.fillRect(0, 0, cell.w, cell.h); c.strokeStyle = '#ffb14a'; c.lineWidth = 4; c.strokeRect(6, 6, cell.w - 12, cell.h - 12);
      neonText(c, SIGNS.bar, cx, cy, cell.h * 0.46, '#fff3d6', '#ffa62e', 800, 3);
    } else if (cell.id === 'smoke') {
      c.fillStyle = '#12302e'; c.fillRect(0, 0, cell.w, cell.h); c.strokeStyle = '#7fe3d2'; c.lineWidth = 5; c.strokeRect(7, 7, cell.w - 14, cell.h - 14);
      neonText(c, SIGNS.smoke, cx, cell.h * 0.4, cell.h * 0.34, '#eafff9', '#2fd8c8', 800, 5);
      c.font = font(600, cell.h * 0.13); c.fillStyle = '#bfeee6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SIGNS.smokeSub, cx, cell.h * 0.78);
    } else if (cell.id === 'vip') {
      c.fillStyle = '#2a0c1c'; c.fillRect(0, 0, cell.w, cell.h); c.strokeStyle = '#d9a441'; c.lineWidth = 4; c.strokeRect(6, 6, cell.w - 12, cell.h - 12);
      neonText(c, SIGNS.vip, cx, cy, cell.h * 0.36, '#fff0c8', '#d9a441', 800, 4);
    } else if (cell.id === 'menu') {                                               // the bar's chalkboard: the menu and its prices
      c.fillStyle = '#23262b'; c.fillRect(0, 0, cell.w, cell.h); c.strokeStyle = '#8a5a32'; c.lineWidth = 10; c.strokeRect(5, 5, cell.w - 10, cell.h - 10);
      c.fillStyle = '#f6efe0'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = font(800, 40); c.fillText('LA CARTE', cx, 46);
      const rows = PATIO_DRINKS.length, top = 92, step = (cell.h - top - 18) / rows;
      PATIO_DRINKS.forEach((d, i) => {
        const y = top + i * step + step / 2;
        c.fillStyle = d.alcohol ? '#ffd9a0' : '#bfeee6'; c.textAlign = 'left'; c.font = font(600, 27); c.fillText(d.label, 24, y);
        c.textAlign = 'right'; c.font = font(800, 27); c.fillText(`${d.price}`, cell.w - 24, y);
      });
    }
    c.restore();
  }
}

/** The board at the gate, redrawn when the door opens or a night turns: the state (top) and the week (below). */
export const BOARD_W = 512, BOARD_H = 640, BOARD_STATE_H = 176;
export function drawBoards(cv: HTMLCanvasElement, open: boolean, night: number) {
  const c = cv.getContext('2d')!, w = cv.width, h = cv.height;
  c.fillStyle = open ? '#0f3a2a' : '#4a1410'; c.fillRect(0, 0, w, BOARD_STATE_H);
  c.strokeStyle = open ? '#7dffb0' : '#ffb59a'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, BOARD_STATE_H - 12);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = open ? '#d8ffe8' : '#fff0e6';
  c.font = font(800, open ? 70 : 54); c.fillText(open ? SIGNS.open : 'FERMÉ', w / 2, open ? BOARD_STATE_H / 2 : 62);
  if (!open) { c.font = font(600, 32); c.fillText(`ouvre à ${PATIO_HOURS[0]} h`, w / 2, 128); }
  c.fillStyle = '#1d0b1c'; c.fillRect(0, BOARD_STATE_H, w, h - BOARD_STATE_H);
  c.strokeStyle = '#ff4fa8'; c.lineWidth = 6; c.strokeRect(6, BOARD_STATE_H + 6, w - 12, h - BOARD_STATE_H - 12);
  c.fillStyle = '#ffb14a'; c.font = font(800, 40); c.fillText('LE PATIO', w / 2, BOARD_STATE_H + 44);
  c.fillStyle = '#f2e6d8'; c.font = font(600, 22); c.fillText(`${PATIO_HOURS[0]} h – ${PATIO_HOURS[1]} h · tous les soirs`, w / 2, BOARD_STATE_H + 80);
  c.textAlign = 'left';
  programme(night, 5).forEach((line, k) => {
    const [when, what] = line.split(' · '), y = BOARD_STATE_H + 126 + k * 58;
    c.fillStyle = k === 0 ? '#ffd23a' : '#b9a6b8'; c.font = font(k === 0 ? 800 : 600, 21); c.fillText(when, 28, y);
    c.fillStyle = '#f6efe8'; c.font = font(k === 0 ? 800 : 500, 25); c.fillText(what, 28, y + 26);
  });
  c.textAlign = 'center'; c.fillStyle = '#b9a6b8'; c.font = font(500, 19);
  c.fillText(`18+ · ticket ${price(PATIO_ENTRY)}`, w / 2, h - 44);
  c.fillText(`habitués offerts après ${PATIO_REGULAR} soirées`, w / 2, h - 18);
}

// ------------------------------------------------------------------ the build
export interface BuildOpts { lite: boolean; id: string; night: number }
export function drawPatio(kit: VenueKit, mats: VenueMaterials, o: BuildOpts): PatioParts {
  const { plain: Pl, wall: Wl, wood: Wd, paving: Pv } = kit.b;
  const R = rng(20261031), lite = o.lite;
  const neon = new Batch(), dayB = new Batch(), nightB = new Batch();
  const accounts: Account[] = [];
  const solid = (why: string, x: number, z: number, w: number, d: number, h: number) => { kit.solid(x, z, w, d, h); accounts.push({ why, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h }); };
  const pools: Pool[] = [];
  const pool = (group: string, x: number, y: number, z: number, w: number, h: number, flat = true, yaw = 0) => pools.push({ group, x, y, z, w, h, flat, yaw });
  const seats = { stools: [] as Seat[], salon: [] as Seat[], vip: [] as Seat[] };
  const PI = Math.PI;

  // ---------------------------------------------------------------- the floor: ochre pavers, a darker apron, borders
  Pv.box(HW * 2, F, ZB + ZF, 0, 0, 0, 0xb5764a);
  Pl.flat(HW * 2 - 0.2, 0.08, 0, F + 0.004, ZF - 0.5, 0x8f5a2c);                                  // a border along the street wall
  for (let x = -HW + 3; x < HW - 1; x += 3) Pl.flat(0.05, ZB + ZF - 0.4, x, F + 0.003, 0, 0xa0673c);   // joints
  Pl.flat(5.4, 6.4, 0, F + 0.004, 6.2, 0x9c6238);                                                   // the way in from the gate to the floor
  Pl.flat(5.6, 4.8, SALON.cx, F + 0.006, SALON.cz, 0x6b2234); Pl.flat(5.2, 4.4, SALON.cx, F + 0.008, SALON.cz, 0x7e2c40);   // the salon's rug

  // ---------------------------------------------------------------- the walls
  const side = (x: number, name: string) => { Wl.box(WALL_T, 3.4, ZB + ZF + 1, x, 0, 0, OCHRE2); solid(name, x, 0, WALL_T, ZB + ZF + 1, 3.4); Pl.box(WALL_T, 0.14, ZB + ZF + 1, x, 3.4, 0, CAP); };
  side(-HW - WALL_T / 2, 'west wall'); side(HW + WALL_T / 2, 'east wall');
  Wl.box(HW * 2 + 1, 3.4, WALL_T, 0, 0, -ZB - WALL_T / 2, OCHRE2); solid('back wall', 0, -ZB - WALL_T / 2, HW * 2 + 1, WALL_T, 3.4); Pl.box(HW * 2 + 1, 0.14, WALL_T, 0, 3.4, -ZB - WALL_T / 2, CAP);
  const zw = ZF + WALL_T / 2;                                                                       // the street wall: the gate in the middle, the smokers' door to the east
  const piece = (x0: number, x1: number, name: string) => { Wl.box(x1 - x0, 3.8, WALL_T, (x0 + x1) / 2, 0, zw, OCHRE); solid(name, (x0 + x1) / 2, zw, x1 - x0, WALL_T, 3.8); Pl.box(x1 - x0, 0.14, 0.7, (x0 + x1) / 2, 3.8, zw, CAP); };
  piece(-HW - WALL_T, -GATE.half, 'street wall west'); piece(GATE.half, SMOKE_DOOR.x - SMOKE_DOOR.half, 'street wall middle'); piece(SMOKE_DOOR.x + SMOKE_DOOR.half, HW + WALL_T, 'street wall east');
  Wl.box(SMOKE_DOOR.half * 2, 3.8 - 2.5, WALL_T, SMOKE_DOOR.x, 2.5, zw, OCHRE);                    // over the smokers' door
  Wd.box(SMOKE_DOOR.half * 2 + 0.3, 0.16, 0.7, SMOKE_DOOR.x, 2.5, zw, WOOD_D);
  Pl.box(0.14, 2.5, 0.6, SMOKE_DOOR.x - SMOKE_DOOR.half - 0.07, 0, zw, TRIM); Pl.box(0.14, 2.5, 0.6, SMOKE_DOOR.x + SMOKE_DOOR.half + 0.07, 0, zw, TRIM);
  // the gate: the wall over the arch, a pediment, the arch's band and its piers
  const spring = 2.7, over = 4.7;
  Wl.geometry(archPiece(GATE.half * 2, over - spring, WALL_T), OCHRE, GATE.x, spring, zw);
  Wl.geometry(archBand(GATE.half, GATE.half + 0.22, WALL_T + 0.1), TRIM, GATE.x, spring, zw);
  for (const s of [-1, 1]) {
    Wl.box(2.5, over - 3.8, WALL_T, s * 2.75, 3.8, zw, OCHRE);                                       // the pediment either side of the arch
    Pl.box(0.3, spring, WALL_T + 0.1, s * (GATE.half + 0.11), 0, zw, TRIM);                          // the jambs' trim
  }
  Pl.box(GATE.half * 2 + 3.2, 0.2, 0.7, GATE.x, over, zw, CAP);                                      // the pediment's cap

  // ---------------------------------------------------------------- the big sign over the gate (painted in the atlas), its frame and its marquee bulbs
  const SY = 6.0, SW = 7.4, SH = 2.3, SZ = 10.1;
  for (const s of [-1, 1]) { Pl.box(0.2, SY - SH / 2 - over + 0.1, 0.2, s * (SW / 2 - 0.15), over, 9.95, STEEL); }
  Pl.box(SW + 0.3, SH + 0.3, 0.22, 0, SY - SH / 2 - 0.15, 9.97, STEEL);
  const bulbs = (x0: number, y0: number, x1: number, y1: number, z: number, step: number, cols: number[]) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i <= n; i++) neon.box(0.09, 0.09, 0.09, x0 + (x1 - x0) * i / n - 0.045, y0 + (y1 - y0) * i / n - 0.045, z, cols[i % cols.length]);
  };
  const bx = SW / 2 + 0.08, byT = SY + SH / 2 + 0.08, byB = SY - SH / 2 - 0.08;
  bulbs(-bx, byT, bx, byT, SZ + 0.06, 0.45, [AMBER, WARM]); bulbs(-bx, byB, bx, byB, SZ + 0.06, 0.45, [AMBER, WARM]);
  bulbs(-bx, byB, -bx, byT, SZ + 0.06, 0.45, [PINK, WARM]); bulbs(bx, byB, bx, byT, SZ + 0.06, 0.45, [PINK, WARM]);
  pool('sign', 0, 5.0, 10.6, 9.0, 4.2, false, 0);                                                  // the sign's spill on the wall below it and the air before it
  pool('gate', 0, F + 0.03, 11.7, 9.5, 4.6);                                                         // and the gate's on the promenade (flat, clear of the lane's edge by the quad's soft rim)

  // ---------------------------------------------------------------- the porch in front of the gate: posts, beams, slats, the festoons' end, lanterns
  const PZ = PORCH.postZ;
  for (const s of [-1, 1]) {
    Wd.box(0.22, 3.4, 0.22, s * PORCH.postX, 0, PZ, WOOD_D); solid('porch post', s * PORCH.postX, PZ, 0.3, 0.3, 3.4);
    Wd.box(0.18, 0.2, PZ - ZF + 0.1, s * PORCH.postX, 3.3, (PZ + ZF) / 2 - 0.05, WOOD_D);                  // side beam back to the wall
  }
  Wd.box(PORCH.postX * 2 + 0.4, 0.2, 0.2, 0, 3.3, PZ, WOOD_D);                                       // front beam: the festoon of the promenade ends on it
  for (let x = -2.2; x <= 2.21; x += 0.5) Wd.box(0.12, 0.1, PZ - ZF, x, 3.5, (PZ + ZF) / 2, WOOD_M);   // slats
  for (const s of [-1, 1]) {
    neon.cyl(0.0, 0.13, 0.3, s * 1.55, 2.55, 10.35, AMBER, 6);                                       // lanterns hung either side of the gate
    Pl.box(0.04, 0.6, 0.04, s * 1.55, 2.6, 10.35, STEEL);
  }
  Pl.box(0.08, 0.08, 1.1, 11.6, 3.36, ZF + 0.55, STEEL); neon.cyl(0.0, 0.12, 0.28, 11.6, 3.05, PZ - 0.02, AMBER, 6);   // the second festoon's end: an arm from the wall
  pool('porch', 0, F + 0.03, 10.6, 5.2, 2.6);

  // ---------------------------------------------------------------- bougainvillea: magenta and green over the wall tops and the gate
  const BOUG = [MAGENTA, 0xe8408a, 0xc2185b, 0xf06aa8], LEAF = [0x2f6b34, 0x3c7d3a, 0x25562c];
  const clump = (x: number, y: number, z: number, s: number, c = BOUG, tilt = 1) => { Pl.blob(s, x, y, z, LEAF[Math.floor(R() * LEAF.length)], 0.7 * tilt, 0); Pl.blob(s * 0.85, x + (R() - 0.5) * s * 0.7, y + s * 0.25, z + (R() - 0.5) * s * 0.5, c[Math.floor(R() * c.length)], 0.8 * tilt, 0); };
  const nTop = lite ? 6 : 10;
  for (let i = 0; i < nTop; i++) { const t = (i + 0.5) / nTop; clump(-HW + 0.4 + (HW * 2 - 0.8) * t + (R() - 0.5) * 0.6, 3.8 + 0.05, 9.7 + (R() - 0.5) * 0.3, 0.42 + R() * 0.2); }
  for (let i = 0; i < (lite ? 4 : 7); i++) { clump(-HW + 0.2, 3.4 + 0.05, -8.5 + i * (lite ? 4.6 : 2.9) + R() * 0.5, 0.4 + R() * 0.12); clump(HW - 0.2, 3.4 + 0.05, -8.5 + i * (lite ? 4.6 : 2.9) + R() * 0.5, 0.4 + R() * 0.12); }
  { const nb = lite ? 5 : 9; for (let i = 0; i < nb; i++) clump(-HW + 1.2 + i * ((HW * 2 - 2.4) / (nb - 1)), 3.4 + 0.05, -ZB + 0.15, 0.42 + R() * 0.15); }
  for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) clump(s * (GATE.half + 0.5), 2.4 + i * 0.5 + (R() - 0.5) * 0.2, 10.12, 0.3 + R() * 0.12, BOUG, 1.2); }
  for (const s of [-1, 1]) {                                                                         // big terracotta pots either side of the porch, bougainvillea in them
    const px = s * 3.9; Pl.cyl(0.46, 0.34, 0.8, px, 0, 10.85, TERRA, 10); clump(px, 0.95, 10.85, 0.55); clump(px, 1.35, 10.85, 0.38);
    solid('pot', px, 10.85, 0.9, 0.9, 0.9);
  }
  for (const [px, pz] of [[-12.6, -8.6], [12.6, 8.6]] as const) { Pl.cyl(0.5, 0.36, 0.8, px, F, pz, TERRA, 10); clump(px, F + 0.95, pz, 0.6); solid('corner pot', px, pz, 0.9, 0.9, 0.9); }

  // ---------------------------------------------------------------- the gate by day: the shut leaves, the crates (one mesh, shown when the place is closed)
  dayB.geometry((() => { const g = new THREE.CylinderGeometry(GATE.half - 0.04, GATE.half - 0.04, 0.14, 18, 1, false, PI / 2, PI); g.rotateX(PI / 2); return g; })(), WOOD_D, GATE.x, spring, ZF + WALL_T / 2);
  for (const s of [-1, 1]) {
    dayB.box(GATE.half - 0.05, spring, 0.12, s * GATE.half / 2, 0, zw, WOOD_D);
    for (let k = 0; k < 4; k++) dayB.box(0.06, spring, 0.15, s * (0.18 + k * 0.33), 0, zw + 0.01, 0x2f1a10);
    for (const y of [0.5, 1.3, 2.1]) dayB.box(GATE.half - 0.05, 0.09, 0.17, s * GATE.half / 2, y, zw + 0.02, STEEL);
  }
  dayB.box(SMOKE_DOOR.half * 2 - 0.04, 2.5, 0.12, SMOKE_DOOR.x, 0, zw, WOOD_D);
  for (let k = 0; k < 4; k++) dayB.box(0.05, 2.5, 0.15, SMOKE_DOOR.x - 0.65 + k * 0.43, 0, zw + 0.01, 0x2f1a10);
  for (const [cx, cz, h] of [[-2.9, 10.75, 0.38], [-3.5, 10.75, 0.38], [-3.2, 10.75, 0.76], [-2.9, 11.25, 0.38]] as const) dayB.box(0.5, h, 0.5, cx, 0, cz, 0xb98b4d);   // the delivery's crates

  // ---------------------------------------------------------------- the rope at night: stanchions and a velvet rope (the doorman's), a chain across the smokers' door
  for (const s of [-1, 1]) { nightB.cyl(0.03, 0.03, 0.95, s * PORCH.ropeX, 0, PORCH.ropeZ, 0xd8c68a, 8); nightB.cyl(0.16, 0.18, 0.04, s * PORCH.ropeX, 0, PORCH.ropeZ, 0xd8c68a, 10); nightB.sphere(0.065, s * PORCH.ropeX, 0.97, PORCH.ropeZ, 0xd8c68a); }
  nightB.box(PORCH.ropeX * 2, 0.07, 0.07, 0, 0.8, PORCH.ropeZ, VELVET);
  for (const s of [-1, 1]) { nightB.cyl(0.03, 0.03, 0.9, SMOKE_DOOR.x + s * SMOKE_DOOR.half * 0.9, 0, 10.3, 0xd8c68a, 8); }
  nightB.box(SMOKE_DOOR.half * 1.8, 0.05, 0.05, SMOKE_DOOR.x, 0.78, 10.3, VELVET);

  // ---------------------------------------------------------------- the dance floor: lit tiles on a dark ground (ripples from the middle), a brass border
  const FW = DANCE_FLOOR.w, FD = DANCE_FLOOR.d, FX = DANCE_FLOOR.x, FZ = DANCE_FLOOR.z;
  const data = new Uint8Array(FW * FD * 4);
  const tex = kit.keep(new THREE.DataTexture(data, FW, FD, THREE.RGBAFormat));
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const tileMat = new THREE.MeshBasicMaterial({ map: tex });
  const fg = new THREE.PlaneGeometry(FW, FD); fg.rotateX(-PI / 2);
  const floorMesh = kit.mesh(fg, tileMat); floorMesh.position.set(FX, F + 0.014, FZ);
  for (let i = 0; i <= FW; i++) Pl.flat(0.04, FD, FX - FW / 2 + i, F + 0.016, FZ, 0x140c14);
  for (let j = 0; j <= FD; j++) Pl.flat(FW, 0.04, FX, F + 0.016, FZ - FD / 2 + j, 0x140c14);
  for (const s of [-1, 1]) { Pl.box(FW + 0.3, 0.05, 0.12, FX, F, FZ + s * (FD / 2 + 0.06), GOLD); Pl.box(0.12, 0.05, FD, FX + s * (FW / 2 + 0.06), F, FZ, GOLD); }

  // ---------------------------------------------------------------- the DJ booth against the back wall, its backdrop and ring, the speakers, the light bar
  const bz = BOOTH.z;
  Pl.box(BOOTH.w, BOOTH.h, BOOTH.d, BOOTH.x, F, bz, 0x1c1620); solid('DJ booth', BOOTH.x, bz, BOOTH.w, BOOTH.d, F + 1.5);
  Pl.box(3.0, 0.95, 0.7, BOOTH.x, F + BOOTH.h, bz + 0.7, 0x2a2030);
  Pl.box(BOOTH.w, 3.1, 0.2, BOOTH.x, F + BOOTH.h, -ZB + 0.15, 0x24101f);                              // the backdrop
  neon.box(3.0, 0.06, 0.04, BOOTH.x, F + BOOTH.h + 0.5, bz + 1.06, PINK);
  for (const s of [-1, 1]) { Pl.cyl(0.24, 0.24, 0.04, BOOTH.x + s * 0.8, F + BOOTH.h + 0.95, bz + 0.7, 0x0e0a10, 14); neon.cyl(0.05, 0.05, 0.05, BOOTH.x + s * 0.8, F + BOOTH.h + 0.98, bz + 0.7, AMBER, 8); }
  for (const [rad, col, seg] of [[1.1, PINK, 20], [0.8, AMBER, 16]] as const) for (let i = 0; i < seg; i++) {
    const a = (i / seg) * PI * 2; neon.box(0.12, 0.12, 0.05, BOOTH.x + Math.cos(a) * rad - 0.06, F + 2.1 + Math.sin(a) * rad - 0.06, -ZB + 0.27, col);
  }
  for (const sx of [-4.2, 4.2]) { Pl.box(1.0, 1.9, 0.9, sx, F, bz + 0.3, 0x18141a); solid('speaker', sx, bz + 0.3, 1.0, 0.9, 1.9); for (const y of [0.5, 1.35]) Pl.cyl(0.3, 0.3, 0.04, sx, F + y, bz + 0.78, 0x2f2a36, 14, [PI / 2, 0, 0]); }
  Pl.box(7.0, 0.18, 0.18, BOOTH.x, F + 3.05, bz + 1.3, STEEL);
  for (const s of [-1, 1]) Pl.box(0.16, 3.05, 0.16, BOOTH.x + s * 3.5, F, bz + 1.3, STEEL);
  for (const sx of lite ? [-2, 2] : [-2.6, -0.9, 0.9, 2.6]) Pl.cyl(0.12, 0.16, 0.32, sx, F + 2.75, bz + 1.3, 0x14101a, 8);

  // ---------------------------------------------------------------- the covered bar on the west wall
  const cx = BAR.counterX, cz = (BAR.z0 + BAR.z1) / 2, cl = BAR.z1 - BAR.z0;
  Wd.box(1.0, 1.1, cl, cx, F, cz, 0x3c2418); Pl.box(1.22, 0.07, cl + 0.2, cx, F + 1.1, cz, 0x231520);
  Pl.box(0.05, 0.9, cl - 0.3, cx + 0.52, F + 0.08, cz, TEAL);                                        // the counter's tiled front
  neon.box(0.03, 0.05, cl - 0.4, cx + 0.56, F + 0.2, cz, AMBER); neon.box(0.03, 0.04, cl - 0.4, cx + 0.62, F + 1.18, cz, PINK);
  solid('bar counter', cx, cz, 1.0, cl, 1.1);
  Wd.box(0.55, 2.3, cl - 1.6, -HW + 0.3, F, cz, 0x2e1b12); solid('bottle shelves', -HW + 0.3, cz, 0.55, cl - 1.6, 2.3);
  const BOTTLE = [0xb0182b, 0xe8d28a, 0xe8a43a, 0x1f7a44, 0xc8e8f4, 0x6b3a14, 0xffb14a, 0x2f4fa8];
  for (const [row, y] of [[0, 0.9], [1, 1.45], [2, 2.0]] as const) {
    Wd.box(0.42, 0.04, cl - 1.8, -HW + 0.58, F + y, cz, WOOD_M);
    const nb = lite ? 7 : 11;
    for (let i = 0; i < nb; i++) Pl.cyl(0.045, 0.05, 0.28, -HW + 0.6, F + y + 0.04, cz - (cl - 2.4) / 2 + (i / (nb - 1)) * (cl - 2.4), BOTTLE[(i * 3 + row * 5) % BOTTLE.length], 6);
    neon.box(0.03, 0.05, cl - 2, -HW + 0.74, F + y - 0.02, cz, row === 1 ? PINK : AMBER);
  }
  solid('bar end south', -11.9, BAR.z1 + 0.2, 2.2, 0.4, 1.0); Wd.box(2.2, 1.0, 0.4, -11.9, F, BAR.z1 + 0.2, 0x3c2418);
  solid('bar end north', -11.9, BAR.z0 - 0.2, 2.2, 0.4, 1.0); Wd.box(2.2, 1.0, 0.4, -11.9, F, BAR.z0 - 0.2, 0x3c2418);
  BAR.stools.forEach((z, i) => {
    Pl.cyl(0.035, 0.05, 0.62, BAR.stoolX, F, z, STEEL, 6); Pl.cyl(0.2, 0.2, 0.07, BAR.stoolX, F + 0.62, z, i % 2 ? TEAL : VELVET, 12);
    seats.stools.push(kit.seat(`${o.id}:${SEAT_IDS.stool(i)}`, BAR.stoolX, z, -PI / 2, F + 0.68, 'stool'));
  });
  const rz0 = BAR.z0 - 0.4, rz1 = BAR.z1 + 0.4;                                                       // the roof: solid over the service side, slats over the stools
  Wd.box(0.2, 2.75, 0.2, -8.65, F, rz0 + 0.2, WOOD_D); Wd.box(0.2, 2.75, 0.2, -8.65, F, rz1 - 0.2, WOOD_D); solid('bar post', -8.65, rz0 + 0.2, 0.3, 0.3, 2.75); solid('bar post', -8.65, rz1 - 0.2, 0.3, 0.3, 2.75);
  Wd.slab(2.9, 0.16, rz1 - rz0, -12.05, F + 2.75, (rz0 + rz1) / 2, 0x2b1a14);
  for (let z = rz0 + 0.2; z < rz1; z += 0.55) Wd.box(2.7, 0.1, 0.22, -9.95, F + 2.7, z, WOOD_D);
  Wd.box(0.22, 0.24, rz1 - rz0, -8.65, F + 2.62, (rz0 + rz1) / 2, WOOD_D);
  pool('bar', BAR.stoolX + 0.2, F + 0.03, cz, 7, 9.8);

  // ---------------------------------------------------------------- the salon: three sofas round a low table, a small table by the street wall
  const sofa = (x: number, z: number, yaw: number, len: number, base: number, colour: number, y0 = F) => {
    const ax = Math.abs(Math.sin(yaw)) > 0.5, w = ax ? 0.9 : len, d = ax ? len : 0.9;                    // a quarter turn: the long side along z (west/east) or along x
    Wd.box(w, 0.4, d, x, y0, z, base);
    Pl.box(ax ? 0.78 : len - 0.1, 0.12, ax ? len - 0.1 : 0.78, x, y0 + 0.4, z, colour);
    const bx = Math.sin(yaw), bz = Math.cos(yaw);
    Pl.box(ax ? 0.22 : len - 0.1, 0.5, ax ? len - 0.1 : 0.22, x - bx * 0.34, y0 + 0.4, z - bz * 0.34, colour);
    return { w, d };
  };
  const SOFA = [0x5a2a4a, 0xc9922e, 0x1f6f6a];
  {
    const a = sofa(-HW + 0.5, 3.4, PI / 2, 3.2, WOOD_D, SOFA[0]);
    solid('sofa', -HW + 0.5, 3.4, a.w, a.d, 0.45);
    seats.salon.push(...kit.bench(`${o.id}:${SEAT_IDS.salon[0]}`, -HW + 0.7, 3.4, PI / 2, 3.0, 2, F + 0.5));
    const b = sofa(-9.4, ZF - 0.5, PI, 3.2, WOOD_D, SOFA[1]);
    solid('sofa', -9.4, ZF - 0.5, b.w, b.d, 0.45);
    seats.salon.push(...kit.bench(`${o.id}:${SEAT_IDS.salon[1]}`, -9.4, ZF - 0.7, PI, 3.0, 2, F + 0.5));
    const c = sofa(-7.4, 3.4, -PI / 2, 3.2, WOOD_D, SOFA[2]);
    solid('sofa', -7.4, 3.4, c.w, c.d, 0.45);
    seats.salon.push(...kit.bench(`${o.id}:${SEAT_IDS.salon[2]}`, -7.6, 3.4, -PI / 2, 3.0, 2, F + 0.5));
  }
  for (const [tx, tz, tw, td] of [[SALON.tableX, SALON.tableZ, 1.0, 1.6], [-9.4, 6.9, 1.4, 0.8]] as const) {
    Wd.box(tw, 0.38, td, tx, F, tz, WOOD_M); Pl.box(tw + 0.08, 0.05, td + 0.08, tx, F + 0.38, tz, 0x231520); solid('low table', tx, tz, tw, td, 0.43);
    neon.cyl(0.05, 0.06, 0.12, tx, F + 0.43, tz, AMBER, 6);
  }
  pool('salon', SALON.cx, F + 0.03, SALON.cz, 7.4, 6.5);

  // ---------------------------------------------------------------- the VIP corner: a raised platform behind a rope, a sofa and a table
  const vx = (VIP.x0 + VIP.x1) / 2, vz = (VIP.z0 + VIP.z1) / 2, vtop = F + VIP.lift;
  Wd.box(VIP.x1 - VIP.x0, VIP.lift, VIP.z1 - VIP.z0, vx, F, vz, 0x3a2418);
  Pl.flat(5.0, 3.8, vx, vtop + 0.004, vz, 0x4a1a2e);
  {
    const a = sofa(VIP.x1 - 0.5, vz, -PI / 2, 3.4, WOOD_D, SOFA[0], vtop); solid('VIP sofa', VIP.x1 - 0.5, vz, a.w, a.d, 0.45 + VIP.lift);
    seats.vip.push(...kit.bench(`${o.id}:${SEAT_IDS.vip[0]}`, VIP.x1 - 0.7, vz, -PI / 2, 3.0, 2, vtop + 0.5));
    const b = sofa(10.4, VIP.z0 + 0.5, 0, 3.2, WOOD_D, SOFA[0], vtop); solid('VIP sofa', 10.4, VIP.z0 + 0.5, b.w, b.d, 0.45 + VIP.lift);
    seats.vip.push(...kit.bench(`${o.id}:${SEAT_IDS.vip[1]}`, 10.4, VIP.z0 + 0.7, 0, 3.0, 2, vtop + 0.5));
    Wd.box(1.3, 0.36, 1.3, 10.6, vtop, vz + 0.1, WOOD_M); solid('VIP table', 10.6, vz + 0.1, 1.3, 1.3, 0.4 + VIP.lift); neon.cyl(0.05, 0.06, 0.12, 10.6, vtop + 0.36, vz + 0.1, PINK, 6);
  }
  for (const [px, pz] of [[VIP.x0 - 0.1, VIP.z0 + 0.1], [VIP.x0 - 0.1, vz], [VIP.x0 - 0.1, VIP.z1 + 0.1], [10.7, VIP.z1 + 0.1], [VIP.x1 - 0.1, VIP.z1 + 0.1]] as const) { Pl.cyl(0.03, 0.03, 0.95, px, F, pz, 0xd8c68a, 8); Pl.sphere(0.065, px, F + 0.97, pz, 0xd8c68a); }
  Pl.box(0.07, 0.07, VIP.z1 - VIP.z0, VIP.x0 - 0.1, F + 0.8, vz, VELVET); Pl.box(VIP.x1 - VIP.x0, 0.07, 0.07, vx, F + 0.8, VIP.z1 + 0.1, VELVET);
  solid('VIP rope', VIP.x0 - 0.1, vz, 0.2, VIP.z1 - VIP.z0 + 0.2, 1.0); solid('VIP rope', vx, VIP.z1 + 0.1, VIP.x1 - VIP.x0 + 0.2, 0.2, 1.0);
  pool('vip', vx, vtop + 0.03, vz, 6.5, 5);

  // ---------------------------------------------------------------- high tables standing by the east wall, and the smoking terrace
  const high = (x: number, z: number, base: number, name: string) => {
    Pl.cyl(0.05, 0.08, 1.1, x, base, z, STEEL, 6); Pl.cyl(0.07, 0.3, 0.05, x, base, z, STEEL, 8); Wd.cyl(0.42, 0.42, 0.05, x, base + 1.1, z, WOOD_L, 14); solid(name, x, z, 0.7, 0.7, 1.15);
    neon.cyl(0.04, 0.05, 0.1, x, base + 1.15, z, AMBER, 6);
  };
  high(10.4, -2.3, F, 'high table'); high(11.8, 0.4, F, 'high table');
  const tx = (TERRACE.x0 + TERRACE.x1) / 2, tz = (TERRACE.z0 + TERRACE.z1) / 2, ttop = F + TERRACE.lift;
  Wd.box(TERRACE.x1 - TERRACE.x0, TERRACE.lift, TERRACE.z1 - TERRACE.z0, tx, F, tz, WOOD_M);
  for (let z = TERRACE.z0 + 0.6; z < TERRACE.z1; z += 0.6) Pl.flat(TERRACE.x1 - TERRACE.x0, 0.03, tx, ttop + 0.004, z, 0x5a3820);
  Wd.box(0.5, 0.11, TERRACE.z1 - TERRACE.z0, TERRACE.x0 - 0.25, F, tz, WOOD_M); Wd.box(1.6, 0.11, 0.4, 8.8, F, TERRACE.z0 - 0.2, WOOD_M);   // the treads (the ground follows: terraceHeight)
  const rail = (x0: number, x1: number, z0: number, z1: number) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
    Wd.box(alongX ? len : 0.1, 0.08, alongX ? 0.1 : len, mx, ttop + 0.9, mz, WOOD_D);
    for (let s = 0; s <= len + 0.01; s += 1.6) { const t = len ? s / len : 0; Wd.box(0.1, 0.92, 0.1, x0 + (x1 - x0) * t - 0.05, ttop, z0 + (z1 - z0) * t - 0.05, WOOD_D); }
    solid('terrace rail', mx, mz, alongX ? len : 0.2, alongX ? 0.2 : len, 0.95);
  };
  rail(TERRACE.x0 + 0.1, 8.0, TERRACE.z0, TERRACE.z0); rail(9.6, TERRACE.x1 - 0.1, TERRACE.z0, TERRACE.z0);
  high(8.0, 6.4, ttop, 'terrace table'); high(11.2, 5.4, ttop, 'terrace table'); high(11.2, 8.2, ttop, 'terrace table');
  for (const [lx, lz] of [[TERRACE.x0 + 0.1, TERRACE.z0], [TERRACE.x1 - 0.1, TERRACE.z0], [TERRACE.x1 - 0.1, TERRACE.z1 - 0.1]] as const) { Pl.cyl(0.05, 0.05, 2.2, lx, ttop, lz, STEEL, 6); neon.cyl(0.0, 0.12, 0.26, lx, ttop + 2.2, lz, AMBER, 6); }
  Wd.box(2.0, 0.09, 0.8, SMOKE_DOOR.x, 0.035, ZF + 1.15, WOOD_M); Wd.box(2.3, 0.05, 0.4, SMOKE_DOOR.x, 0.035, ZF + 1.75, WOOD_M);   // the outside steps (the promenade is 0.035)
  pool('terrace', tx, ttop + 0.03, tz, 7.6, 7);

  // ---------------------------------------------------------------- string lights across the courtyard, uplights at the walls, the walls' washes
  const strings = lite ? [-9, -3, 3, 9] : [-10.5, -7, -3.5, 0, 3.5, 7, 10.5];
  for (const sx of strings) {
    const z0 = -ZB + 0.3, z1 = ZF - 0.3, len = z1 - z0, n = Math.round(len / (lite ? 1.4 : 1.0));
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(t * PI) * 0.55;
      neon.box(0.07, 0.09, 0.07, sx - 0.035, 3.2 - sag, z0 + len * t - 0.035, [WARM, AMBER, 0xff9ac8, WARM][i % 4]);
    }
  }
  for (const sz of lite ? [] : [-5, 4.5]) for (let i = 0; i <= 26; i++) { const t = i / 26; neon.box(0.07, 0.09, 0.07, -HW + 0.3 + (HW * 2 - 0.6) * t, 3.25 - Math.sin(t * PI) * 0.5, sz, [AMBER, WARM, PINK][i % 3]); }
  for (const [ux, uz] of [[-HW + 0.45, -6.2], [-HW + 0.45, 7.2], [HW - 0.45, -4.0], [HW - 0.45, 1.5], [-5.5, -ZB + 0.4], [5.5, -ZB + 0.4], [-5.8, ZF - 0.4], [5.8, ZF - 0.4]] as const) { Pl.cyl(0.12, 0.16, 0.22, ux, F, uz, STEEL, 8); neon.cyl(0.09, 0.09, 0.03, ux, F + 0.22, uz, AMBER, 8); }
  pool('wash', -HW + 0.06, 1.7, -6.2, 3.8, 3.4, false, PI / 2); pool('wash', -HW + 0.06, 1.7, 7.2, 3.8, 3.4, false, PI / 2);
  pool('wash', HW - 0.06, 1.7, -2.0, 4.2, 3.4, false, -PI / 2); pool('wash', -5.5, 1.7, -ZB + 0.06, 4.0, 3.4, false, 0); pool('wash', 5.5, 1.7, -ZB + 0.06, 4.0, 3.4, false, 0);
  pool('floor', FX, F + 0.04, FZ, FW + 5, FD + 5);
  pool('booth', 0, F + 0.04, bz + 1.2, 7, 3.4);

  // ---------------------------------------------------------------- the beams (two cones from the light bar), the atlas and the board
  const beams = (lite ? [0] : [-1.8, 1.8]).map((sx, i) => {
    const g = new THREE.ConeGeometry(1.05, 4.0, 14, 1, true); g.translate(0, -2.0, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = kit.mesh(g, mat); m.position.set(sx, F + 2.75, bz + 1.3); m.renderOrder = 2; m.userData.i = i; m.visible = false; return m;
  });
  // the atlas: every painted sign but the board at the gate
  const SIGN_CELLS = pack([{ id: 'main', w: 1024, h: 320 }, { id: 'bar', w: 512, h: 128 }, { id: 'smoke', w: 512, h: 192 }, { id: 'vip', w: 384, h: 144 }, { id: 'menu', w: 512, h: 640 }]);
  const acv = document.createElement('canvas'); acv.width = ATLAS_W; acv.height = SIGN_CELLS.height;
  drawAtlas(acv, SIGN_CELLS.cells);
  const atex = kit.keep(new THREE.CanvasTexture(acv)); atex.colorSpace = THREE.SRGBColorSpace; atex.anisotropy = 4;
  const amat = kit.keep(new THREE.MeshLambertMaterial({ map: atex, emissive: 0xffffff, emissiveMap: atex, emissiveIntensity: 0 }));
  const cellOf = (id: string) => SIGN_CELLS.cells.find(c => c.id === id)!;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const quad = (id: string, qx: number, qy: number, qz: number, w: number, h: number, yaw: number) => {
    const c = cellOf(id), u0 = (c.x + 3) / ATLAS_W, u1 = (c.x + c.w - 3) / ATLAS_W, v1 = 1 - (c.y + 3) / acv.height, v0 = 1 - (c.y + c.h - 3) / acv.height, cs = Math.cos(yaw), sn = Math.sin(yaw), base = pos.length / 3;
    for (const [lx, ly, u, v] of [[-w / 2, -h / 2, u0, v0], [w / 2, -h / 2, u1, v0], [w / 2, h / 2, u1, v1], [-w / 2, h / 2, u0, v1]] as const) {
      pos.push(qx + lx * cs, qy + ly, qz - lx * sn); nor.push(sn, 0, cs); uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad('main', 0, SY, SZ, SW, SH, 0);
  quad('smoke', SMOKE_DOOR.x, 3.15, ZF + WALL_T + 0.03, 2.0, 0.75, 0);
  quad('smoke', 6.6, ttop + 1.45, TERRACE.z0 + 0.12, 1.6, 0.6, -PI / 2);
  quad('bar', -8.5, F + 2.3, cz, 2.8, 0.7, PI / 2);
  quad('vip', 10.6, vtop + 1.35, VIP.z1 + 0.16, 1.4, 0.52, 0);
  quad('menu', -11.2, F + 1.7, -ZB + 0.05, 1.0, 1.25, 0);
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ag.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ag.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ag.setIndex(idx);
  const atlasMesh = kit.mesh(ag, amat);
  // the board at the gate (state and week)
  const bcv = document.createElement('canvas'); bcv.width = BOARD_W; bcv.height = BOARD_H;
  const btex = kit.keep(new THREE.CanvasTexture(bcv)); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 4;
  drawBoards(bcv, false, o.night);
  const bmat = kit.keep(new THREE.MeshLambertMaterial({ map: btex, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: 0 }));
  const bpos: number[] = [], bnor: number[] = [], buv: number[] = [], bidx: number[] = [];
  const bquad = (qx: number, qy: number, qz: number, w: number, h: number, v0: number, v1: number) => {
    const base = bpos.length / 3;
    for (const [lx, ly, u, v] of [[-w / 2, -h / 2, 0, v0], [w / 2, -h / 2, 1, v0], [w / 2, h / 2, 1, v1], [-w / 2, h / 2, 0, v1]] as const) { bpos.push(qx + lx, qy + ly, qz); bnor.push(0, 0, 1); buv.push(u, v); }
    bidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const vS = 1 - BOARD_STATE_H / BOARD_H;
  bquad(-3.55, 1.95, ZF + WALL_T + 0.03, 1.5, 0.5, vS, 1); bquad(3.65, 1.5, ZF + WALL_T + 0.03, 1.3, 1.3 * (BOARD_H - BOARD_STATE_H) / BOARD_W, 0, vS);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(bnor, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); bg.setIndex(bidx);
  const boardMesh = kit.mesh(bg, bmat);
  Wd.box(1.5 + 0.1, 0.08, 0.1, -3.55, 1.7 - 0.04, 10.02, WOOD_D); Wd.box(1.3 + 0.1, 0.08, 0.1, 3.65, 0.88, 10.02, WOOD_D);

  // ---------------------------------------------------------------- merge: the kit's batches, the neon, the day's and the night's, the pools
  const tris: Record<string, number> = {};
  for (const k of ['plain', 'wall', 'wood', 'paving'] as const) tris[k] = kit.b[k].triangles();
  tris.neon = neon.triangles(); tris.day = dayB.triangles(); tris.night = nightB.triangles();
  kit.build(mats);
  const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const neonMesh = neon.build(neonMat, false, false)!; kit.group.add(neonMesh); kit.keep(neonMesh.geometry); kit.keep(neonMat);
  const dayMesh = dayB.build(mats.m.wood, true, true); if (dayMesh) { kit.group.add(dayMesh); kit.keep(dayMesh.geometry); }
  const nightMesh = nightB.build(mats.m.plain, true, false); if (nightMesh) { kit.group.add(nightMesh); kit.keep(nightMesh.geometry); }
  // the pools: one geometry, one vertex colour per quad (black adds nothing, additively)
  const pp: number[] = [], pu: number[] = [], pi: number[] = [];
  for (const p of pools) {
    const b = pp.length / 3, cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    for (const [lx, ly, u, v] of [[-p.w / 2, -p.h / 2, 0, 0], [p.w / 2, -p.h / 2, 1, 0], [p.w / 2, p.h / 2, 1, 1], [-p.w / 2, p.h / 2, 0, 1]] as const) {
      if (p.flat) pp.push(p.x + lx, p.y, p.z - ly); else pp.push(p.x + lx * cs, p.y + ly, p.z - lx * sn);
      pu.push(u, v);
    }
    pi.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const poolColors = new Float32Array(pools.length * 4 * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); pg.setAttribute('color', new THREE.BufferAttribute(poolColors, 3)); pg.setIndex(pi);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolMesh = kit.mesh(pg, poolMat); poolMesh.renderOrder = 1; poolMesh.frustumCulled = false;
  tris.pools = pi.length / 3; tris.tiles = 2; tris.atlas = idx.length / 3; tris.boards = bidx.length / 3; tris.beams = 2 * 14 * 2;

  // the gates are colliders the venue puts in and takes out (never on someone inside): the arch itself, and the line of the rope from post to post (nobody slips round the rope into the arch)
  const gates = {
    main: [{ x0: GATE.x - GATE.half, x1: GATE.x + GATE.half, z0: zw - 0.25, z1: zw + 0.25, h: 2.7 }, { x0: -PORCH.postX, x1: PORCH.postX, z0: PORCH.ropeZ - 0.12, z1: PORCH.ropeZ + 0.12, h: 1.0 }],
    smoke: [{ x0: SMOKE_DOOR.x - SMOKE_DOOR.half, x1: SMOKE_DOOR.x + SMOKE_DOOR.half, z0: zw - 0.25, z1: zw + 0.25, h: 2.5 }],
  };
  void floorMesh;
  return {
    group: kit.group, seats, accounts, gates, atlas: { mesh: atlasMesh, mat: amat }, boards: { mesh: boardMesh, mat: bmat, cv: bcv, tex: btex }, neon: { mesh: neonMesh, mat: neonMat },
    tiles: { data, tex, mat: tileMat, w: FW, d: FD }, pools: { mesh: poolMesh, colors: poolColors, list: pools }, beams, day: dayMesh, night: nightMesh, tris,
    at: { floor: { x: FX, z: FZ }, door: { x: 0, z: ZF + 2.1 }, rope: { x: 0, z: PORCH.ropeZ } },
  };
}
