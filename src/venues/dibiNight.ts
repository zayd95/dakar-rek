import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from '../world/batch';
import { buildFurniture, furnitureMaterials, type FurnitureId } from '../world/furnitureKit';
import { floorSeatTop } from '../interact/seats';
import type { Seat } from '../interact/seats';
import type { ActivitySpec } from '../activity/types';
import { posterLines } from '../arena/posters';
import { GALA, billFor } from '../arena/program';
import { eveningSize } from '../arena/exterior';
import { glowTexture, type VenueKit } from './kit';

/**
 * The Dibi at night (spec 10 Oct, the place the evening ends): what the venue (src/venues/dibi.ts) adds so that people
 * want to sit there after the gala, in the venue's own local frame (front street +z, side street −x, ground G0).
 *   - the grill: a bed of coals that glows at night (dull by day, cold when closed), sparks rising from it at night (one
 *     cheap point cloud), the brochettes on the grate turned one by one by the dibi master;
 *   - the shed: a ceiling of string lights zigzagging between the posts (in the venue's lights batch), a TV corner — low
 *     benches round a low table of the furniture kit, facing the TV on the wall that shows tonight's bout — and the
 *     attaya set of the furniture kit on its cushions under the neem, at the back;
 *   - a board of painted pieces (one texture, one draw call): the menu under the counter's fascia (the counter's own
 *     prices), the TV's screen (frames of the bout; the result once there is one, never an invented one) and three
 *     posters (tonight's card, the Dibi's hours, the attaya).
 * Draw calls added: the board, the coals, the brochettes, the furniture kit pieces (one merged mesh) and, at night only,
 * the sparks; the old painted menu sign behind the counter is replaced by the board (`DIBI_NIGHT_DRAWCALLS`).
 * Words are the game's own (no channel, no brand); wrestlers are the city's fictional cast (src/arena/program.ts).
 */
export const G0 = 0.13;
/** The venue's bench and chair top (src/venues/dibi.ts SEAT): the low benches sit at the same height. */
const SEAT = 0.57;
/** Draw calls the night layer adds near the Dibi (by day, at night), the menu sign it replaces deducted. */
export const DIBI_NIGHT_DRAWCALLS = { day: 3, night: 4 } as const;

/** Where everything stands (local frame of the Dibi). */
export const NIGHT = {
  grill: { x: -8.0, z: 8.6 },
  /** The TV on the right block wall (screen centre, facing −x) and its corner: a low table, three low benches. */
  tv: { x: 10.59, y: G0 + 1.95, z: 3.3, w: 0.9, h: 0.52 },
  tvTable: { x: 8.45, z: 3.0 },
  tvBenches: [
    { id: 'tv-o', x: 7.55, z: 3.0, yaw: Math.PI / 2, len: 2.0, n: 3 },        // facing the table and the TV
    { id: 'tv-s', x: 8.8, z: 1.75, yaw: 0, len: 1.8, n: 2 },
    { id: 'tv-n', x: 8.8, z: 4.25, yaw: Math.PI, len: 1.8, n: 2 },
  ],
  /** The attaya set under the neem (its cushions round it) and where one stands to ask for the pot. */
  attaya: { x: 5.6, z: -8.0 },
  attayaAnchor: { x: 5.6, z: -6.85 },
  /** The menu board hanging under the counter's fascia, facing the customers. */
  menu: { x: -1.75, y: G0 + 2.15, z: -5.1, w: 1.9, h: 0.86 },
  /** Posters: tonight's card and the Dibi's hours on the right block wall, the attaya over the set on the back wall. */
  posters: [
    { id: 'gala', x: 10.71, y: G0 + 1.75, z: -3.0, yaw: -Math.PI / 2 },
    { id: 'dibi', x: 10.71, y: G0 + 1.75, z: 7.3, yaw: -Math.PI / 2 },
    { id: 'attaya', x: 5.6, y: G0 + 1.7, z: -10.71, yaw: 0 },
  ],
  posterSize: { w: 0.8, h: 1.12 },
  /** String lights from post top to post top across the tin roof (the posts stand at x −1.8, 4.4, 10.35; z −5.4, 2.1, 9.6). */
  strings: [
    [[-1.8, -5.4], [10.35, 2.1]], [[-1.8, 2.1], [10.35, -5.4]], [[-1.8, 2.1], [10.35, 9.6]], [[-1.8, 9.6], [10.35, 2.1]],
  ] as [number, number][][],
  stringTop: G0 + 2.74, stringSag: 0.35,
} as const;

/** Bulbs along the string lights (local x, y, z): the closer `step` the denser. */
export function stringBulbs(step: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const [[ax, az], [bx, bz]] of NIGHT.strings) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / step));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push({ x: ax + (bx - ax) * t, y: NIGHT.stringTop - NIGHT.stringSag * Math.sin(Math.PI * t), z: az + (bz - az) * t });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the menu
/** What the board lists, in order, with the line under the dish (the price comes from the place's own offers). */
export const MENU: readonly { id: string; label: string; note?: string }[] = [
  { id: 'dibi', label: 'Dibi mouton', note: 'oignons · moutarde · pain' },
  { id: 'brochettes', label: 'Brochettes', note: 'trois, avec du pain' },
  { id: 'bissap', label: 'Bissap frais' },
  { id: 'attaya', label: 'Attaya', note: 'après le repas, le soir' },
  { id: 'theiere', label: 'Théière d’attaya', note: 'sous le neem, le soir' },
];
export interface MenuRow { id: string; label: string; note?: string; price: number }
/** The board's rows from the place's offers (every anchor): only what is really sold there, at its price. */
export function menuRows(offers: Record<string, readonly ActivitySpec[]>): MenuRow[] {
  const all = Object.values(offers).flat();
  return MENU.flatMap(m => { const o = all.find(x => x.id === m.id); return o && o.price ? [{ ...m, price: o.price }] : []; });
}
const price = (n: number) => `${n.toLocaleString('fr-FR').replace(/\s/g, ' ')} F`;

// ------------------------------------------------------------------------------------------------ the TV
export interface TvLines { tag: string; names: string; status: string; result: string | null; live: boolean }
/**
 * What the TV shows (pure): tonight's bout from the city's card while the gala runs (17 h – 23 h), its replay after —
 * with the result once the arena has one (`posterLines().result`, never an invented one) — and the card to come by day.
 */
export function tvLines(day: number, hour: number, done = false, last?: { day: number; text: string } | null): TvLines {
  const h = ((hour % 24) + 24) % 24, d = h < 5 ? day - 1 : day;                       // after midnight: the evening before
  const live = h >= GALA.doors && h < GALA.close && !done, after = !live && (h >= GALA.close || h < 5 || done);
  const bill = billFor(d), big = eveningSize(d, GALA.doors) === 'gala';
  const result = after ? posterLines(d, 12, last).result : null;                     // the arena's own result, if any
  return {
    tag: big ? 'GRAND GALA DE LUTTE' : 'COMBAT DE QUARTIER', names: `${bill.left.name} – ${bill.right.name}`.toUpperCase(),
    status: after ? 'Résumé du combat de ce soir' : live ? 'En direct · Arène de Pikine' : `Ce soir ${GALA.doors} h · Arène de Pikine`,
    result, live,
  };
}

// ------------------------------------------------------------------------------------------------ the board (one texture)
const CW = 512, CH = 512;
/** Pixel rectangles of the board's texture. */
const REG = {
  menu: [0, 0, 320, 144], tv: [[0, 152, 160, 92], [160, 152, 160, 92], [320, 152, 160, 92]], off: [480, 152, 32, 32],
  posters: { gala: [0, 252, 128, 180], dibi: [136, 252, 128, 180], attaya: [272, 252, 128, 180] } as Record<string, number[]>,
} as const;
const uvOf = (r: readonly number[]) => ({ u0: r[0] / CW, u1: (r[0] + r[2]) / CW, v0: 1 - (r[1] + r[3]) / CH, v1: 1 - r[1] / CH });

function drawBoard(c: CanvasRenderingContext2D, o: { rows: MenuRow[]; tv: TvLines; place: string; owner: string }) {
  const fit = (text: string, max: number, size: number, weight = 800) => { c.font = `${weight} ${size}px system-ui, sans-serif`; while (c.measureText(text).width > max && size > 8) { size--; c.font = `${weight} ${size}px system-ui, sans-serif`; } };
  c.clearRect(0, 0, CW, CH);
  c.textBaseline = 'middle';
  // the menu: a chalkboard in a wooden frame
  { const [x, y, w, h] = REG.menu;
    c.fillStyle = '#6b4a2e'; c.fillRect(x, y, w, h); c.fillStyle = '#1f3a2c'; c.fillRect(x + 6, y + 6, w - 12, h - 12);
    c.textAlign = 'center'; c.fillStyle = '#f2c230'; fit(`LE MENU · CHEZ ${o.owner.toUpperCase()}`, w - 24, 17, 900); c.fillText(`LE MENU · CHEZ ${o.owner.toUpperCase()}`, x + w / 2, y + 20);
    const rows = o.rows.slice(0, 5), rh = (h - 40) / Math.max(1, rows.length);
    rows.forEach((r, i) => {
      const ry = y + 36 + rh * (i + 0.5);
      c.textAlign = 'left'; c.fillStyle = '#f1ece0'; fit(r.label, 150, 15); c.fillText(r.label, x + 14, ry - (r.note ? 4 : 0));
      if (r.note) { c.fillStyle = '#b9c9b0'; fit(r.note, 170, 10, 600); c.fillText(r.note, x + 14, ry + 9); }
      c.textAlign = 'right'; c.fillStyle = '#f2c230'; fit(price(r.price), 110, 16, 900); c.fillText(price(r.price), x + w - 14, ry);
    }); }
  // the TV: the bout in three frames (a sand ring, the crowd, the two wrestlers in their écuries' colours), a banner
  const names = o.tv.names.split(' – ');
  REG.tv.forEach(([x, y, w, h], f) => {
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#0f1d33'); g.addColorStop(0.45, '#23324a'); g.addColorStop(1, '#3a2c1c');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    for (let k = 0; k < 40; k++) { c.fillStyle = ['#c8322a', '#f2c230', '#f1ece0', '#1a7a44'][k % 4]; c.fillRect(x + ((k * 37) % w), y + 10 + ((k * 13) % 22), 2, 2); }   // the crowd
    c.fillStyle = '#d9c08a'; c.beginPath(); c.ellipse(x + w / 2, y + h * 0.66, w * 0.42, h * 0.16, 0, 0, Math.PI * 2); c.fill();
    const fighter = (fx: number, col: string, lean: number, down = false) => {
      c.save(); c.translate(x + fx, y + h * 0.66); c.rotate(down ? -1.3 : lean);
      c.fillStyle = '#4e2e1c'; c.fillRect(-4, -26, 8, 18); c.beginPath(); c.arc(0, -30, 4.5, 0, Math.PI * 2); c.fill();   // body, head
      c.fillStyle = col; c.fillRect(-5, -9, 10, 6);                                                                           // the ngemb
      c.fillStyle = '#4e2e1c'; c.fillRect(-4, -3, 3, 8); c.fillRect(1, -3, 3, 8);
      c.restore();
    };
    if (f === 0) { fighter(w * 0.36, '#1a7a44', 0.1); fighter(w * 0.64, '#c8322a', -0.1); }
    else if (f === 1) { fighter(w * 0.46, '#1a7a44', 0.45); fighter(w * 0.54, '#c8322a', -0.45); }
    else if (o.tv.result) { c.fillStyle = 'rgba(10,10,14,0.85)'; c.fillRect(x, y + 18, w, 44); c.textAlign = 'center'; c.fillStyle = '#ffe7b0'; fit(o.tv.result, w - 12, 11); c.fillText(o.tv.result, x + w / 2, y + 40); }
    else { fighter(w * 0.42, '#1a7a44', 0.7); fighter(w * 0.6, '#c8322a', -0.2); }
    c.fillStyle = o.tv.live ? '#a3231a' : '#1b2a7a'; c.fillRect(x, y + h - 22, w, 22);
    c.textAlign = 'center'; c.fillStyle = '#fff3d0'; const t = `${names[0] ?? ''} – ${names[1] ?? ''}`; fit(t, w - 10, 11, 900); c.fillText(t, x + w / 2, y + h - 15);
    c.fillStyle = '#f2c230'; fit(o.tv.status, w - 10, 7, 700); c.fillText(o.tv.status, x + w / 2, y + h - 5);
    if (o.tv.live) { c.fillStyle = '#ff4a3a'; c.beginPath(); c.arc(x + 8, y + 8, 3, 0, Math.PI * 2); c.fill(); }
  });
  { const [x, y, w, h] = REG.off; c.fillStyle = '#0a0b0e'; c.fillRect(x, y, w, h); }
  // posters: tonight's card, the Dibi's hours, the attaya
  { const [x, y, w, h] = REG.posters.gala, big = /GRAND/.test(o.tv.tag);
    c.fillStyle = big ? '#f4dfae' : '#e6eef0'; c.fillRect(x, y, w, h); c.fillStyle = big ? '#a3231a' : '#0f5e6e'; c.fillRect(x, y, w, 34);
    c.textAlign = 'center'; c.fillStyle = '#fff3d0'; fit(o.tv.tag, w - 10, 13, 900); c.fillText(o.tv.tag, x + w / 2, y + 17);
    c.fillStyle = '#1a7a44'; c.fillRect(x + 6, y + 44, w / 2 - 9, 50); c.fillStyle = '#c8322a'; c.fillRect(x + w / 2 + 3, y + 44, w / 2 - 9, 50);
    c.fillStyle = '#ffffff'; fit(names[0] ?? '', w / 2 - 14, 13, 900); c.fillText(names[0] ?? '', x + w / 4, y + 69); fit(names[1] ?? '', w / 2 - 14, 13, 900); c.fillText(names[1] ?? '', x + (3 * w) / 4, y + 69);
    c.fillStyle = '#3a2a14'; fit('VS', 30, 14, 900); c.fillText('VS', x + w / 2, y + 108);
    c.fillStyle = big ? '#a3231a' : '#0f5e6e'; fit('ARÈNE DE PIKINE', w - 12, 12, 900); c.fillText('ARÈNE DE PIKINE', x + w / 2, y + 130);
    c.fillStyle = '#3a2a14'; fit('LÀMB · LUTTE SÉNÉGALAISE', w - 12, 9, 800); c.fillText('LÀMB · LUTTE SÉNÉGALAISE', x + w / 2, y + 166); }
  { const [x, y, w, h] = REG.posters.dibi;
    c.fillStyle = '#7c2d12'; c.fillRect(x, y, w, h); c.fillStyle = '#f6efd8'; c.fillRect(x + 5, y + 5, w - 10, h - 10);
    c.textAlign = 'center'; c.fillStyle = '#7c2d12'; fit('DIBI', w - 16, 30, 900); c.fillText('DIBI', x + w / 2, y + 30);
    fit(o.place.toUpperCase(), w - 16, 11, 800); c.fillText(o.place.toUpperCase(), x + w / 2, y + 54);
    c.fillStyle = '#2a2a2a'; c.fillRect(x + 22, y + 92, w - 44, 10);                                                       // the grill
    for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#6b2e14' : '#8a4a24'; c.fillRect(x + 28 + k * 15, y + 82, 11, 9); }
    c.fillStyle = '#ff7a2a'; c.fillRect(x + 22, y + 102, w - 44, 4);
    c.fillStyle = '#7c2d12'; fit('OUVERT JUSQU’À 2 H', w - 14, 12, 900); c.fillText('OUVERT JUSQU’À 2 H', x + w / 2, y + 128);
    c.fillStyle = '#3a2a14'; fit('DIBI · BROCHETTES · ATTAYA', w - 14, 9, 700); c.fillText('DIBI · BROCHETTES · ATTAYA', x + w / 2, y + 152); }
  { const [x, y, w, h] = REG.posters.attaya;
    c.fillStyle = '#14532d'; c.fillRect(x, y, w, h);
    c.textAlign = 'center'; c.fillStyle = '#f2c230'; fit('ATTAYA', w - 16, 26, 900); c.fillText('ATTAYA', x + w / 2, y + 28);
    c.fillStyle = '#c9cdd2'; c.beginPath(); c.ellipse(x + w / 2, y + 90, 22, 17, 0, 0, Math.PI * 2); c.fill();            // the teapot
    c.fillRect(x + w / 2 + 18, y + 80, 18, 5); c.fillStyle = '#9aa0a6'; c.fillRect(x + w / 2 - 7, y + 68, 14, 6);
    for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(232,244,255,0.85)'; c.fillRect(x + 30 + k * 26, y + 118, 12, 16); c.fillStyle = '#b5652e'; c.fillRect(x + 30 + k * 26, y + 126, 12, 8); }
    c.fillStyle = '#f1ece0'; fit('SOUS LE NEEM, LE SOIR', w - 14, 10, 800); c.fillText('SOUS LE NEEM, LE SOIR', x + w / 2, y + 152);
    fit('TROIS VERRES', w - 14, 9, 700); c.fillText('TROIS VERRES', x + w / 2, y + 168); }
}

/** One quad of the board in the venue's frame: centre, facing local yaw, w × h, showing pixel rectangle `r`. */
function quad(pos: number[], uv: number[], idx: number[], x: number, y: number, z: number, yaw: number, w: number, h: number, r: readonly number[]) {
  const base = pos.length / 3, c = Math.cos(yaw), s = Math.sin(yaw), u = uvOf(r);
  // the quad's right (local) is (cos yaw, 0, −sin yaw); its normal (sin yaw, 0, cos yaw)
  for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) pos.push(x + c * dx, y + dy, z - s * dx);
  uv.push(u.u0, u.v0, u.u1, u.v0, u.u1, u.v1, u.u0, u.v1);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export interface NightState { open: boolean; night: number; hour: number; day: number; done: boolean; camera: { x: number; z: number } }

/** The night layer of one Dibi (built into its VenueKit before `k.build`). */
export class DibiNight {
  readonly seats: Seat[] = [];
  private readonly coalMat: THREE.MeshBasicMaterial;
  private readonly coals: THREE.Mesh;
  private readonly skewers: THREE.InstancedMesh;
  private readonly angle: number[] = [];
  private readonly target: number[] = [];
  private readonly sparks: THREE.Points;
  private readonly sp: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number }[] = [];
  private readonly board: THREE.Mesh;
  private readonly boardMat: THREE.MeshLambertMaterial;
  private readonly tex: THREE.CanvasTexture | null;
  private readonly tvUv: number;                     // first uv index of the TV quad
  private next = 1.2; private turn = 0; private frameT = 0; private frame = 0;
  private boardKey = ''; private rows: MenuRow[] = [];
  private tv: TvLines = { tag: '', names: '', status: '', result: null, live: false };
  flips = 0;
  level = 0;
  /** How much the coals glow, flicker aside (0.42 by day … 1 at night; 0 when closed). */
  glow = 0;

  constructor(k: VenueKit, id: string, private readonly o: { place: string; owner: string; lite: boolean; rand: () => number; lights: Batch }) {
    const { grill: gr } = NIGHT, B = k.b;
    // ------------------------------------------------ the coal bed (replaces the flat ember strip)
    const cb = new Batch();
    cb.box(2.6, 0.03, 0.72, gr.x, G0 + 0.8, gr.z, 0x3a1a0e);
    const lumps = o.lite ? 34 : 70;
    for (let n = 0; n < lumps; n++) {
      const r = o.rand(), s = 0.05 + o.rand() * 0.05;
      cb.box(s, s * 0.7, s, gr.x - 1.25 + o.rand() * 2.5, G0 + 0.82, gr.z - 0.32 + o.rand() * 0.64, r < 0.25 ? 0x2a1a14 : r < 0.62 ? 0xff6a1a : r < 0.8 ? 0xffb040 : 0x8a8580, o.rand() * 3);
    }
    this.coalMat = k.keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.coals = cb.build(this.coalMat, false, false)!; this.coals.name = 'dibi_coals'; k.group.add(this.coals); k.keep(this.coals.geometry);
    // ------------------------------------------------ the brochettes, turned one by one
    const sk = new Batch();
    sk.slab(0.016, 0.016, 0.92, 0, 0, 0, 0xc8c8c8);
    for (let n = 0; n < 5; n++) { const meat = n % 2 === 0; sk.slab(meat ? 0.075 : 0.055, meat ? 0.07 : 0.05, meat ? 0.075 : 0.045, 0, 0, -0.3 + n * 0.15, meat ? (n % 4 ? 0x6b2e14 : 0x8a4a24) : 0xf0e6c8); }
    const skMesh = sk.build(new THREE.MeshBasicMaterial())!, skMat = k.keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const skGeo = k.keep(skMesh.geometry); (skMesh.material as THREE.Material).dispose();
    this.skewers = new THREE.InstancedMesh(skGeo, skMat, 6); this.skewers.name = 'dibi_brochettes';
    for (let i = 0; i < 6; i++) { this.angle.push(i * 0.7); this.target.push(i * 0.7); }
    this.placeSkewers(); k.group.add(this.skewers);
    // ------------------------------------------------ sparks over the coals at night (one point cloud)
    const ns = o.lite ? 10 : 22;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ns * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(ns * 4), 4));
    const pm = new THREE.PointsMaterial({ size: 0.07, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sparks = new THREE.Points(g, pm); this.sparks.name = 'dibi_sparks'; this.sparks.visible = false;
    k.keep(g); k.keep(pm); k.group.add(this.sparks);
    for (let i = 0; i < ns; i++) this.sp.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 1, life: 0 });
    // ------------------------------------------------ the ceiling of string lights and its wires
    // (in the venue's lights batch: lit while open, brighter at night)
    stringBulbs(o.lite ? 1.4 : 0.9).forEach((p, i) => o.lights.blob(0.05, p.x, p.y, p.z, [0xfff1c8, 0xffd27a, 0xffe9b0][i % 3], 1, 0));
    for (const [[ax, az], [bx, bz]] of NIGHT.strings) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, y = (t: number) => NIGHT.stringTop - NIGHT.stringSag * Math.sin(Math.PI * t);
        const p = { x: ax + (bx - ax) * t0, y: y(t0), z: az + (bz - az) * t0 }, q = { x: ax + (bx - ax) * t1, y: y(t1), z: az + (bz - az) * t1 };
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, len = Math.hypot(dx, dy, dz);
        const a = Math.acos(dy / len), s = Math.sin(a), b = s > 1e-6 ? Math.atan2(dz / s, -dx / s) : 0;
        B.plain.cyl(0.006, 0.006, len, p.x, p.y + 0.02, p.z, 0x1d1d1f, 3, [0, b, a]);
      }
    }
    // ------------------------------------------------ the TV corner: low benches round a low table, facing the TV
    for (const bn of NIGHT.tvBenches) {
      const along = Math.abs(Math.sin(bn.yaw)) > 0.5;                                   // a bench facing ±x runs along z
      const w = along ? 0.34 : bn.len, d = along ? bn.len : 0.34;
      B.wood.box(w, 0.05, d, bn.x, SEAT - 0.05, bn.z, 0x7a5434);
      for (const s of [-1, 1]) B.wood.box(along ? 0.3 : 0.06, SEAT - 0.05 - G0, along ? 0.06 : 0.3, bn.x + (along ? 0 : s * (bn.len / 2 - 0.12)), G0, bn.z + (along ? s * (bn.len / 2 - 0.12) : 0), 0x6b4a2e);
      k.solid(bn.x, bn.z, w, d, 0.5);
      this.seats.push(...k.bench(`${id}:${bn.id}`, bn.x, bn.z, bn.yaw, bn.len, bn.n, SEAT));
    }
    k.solid(NIGHT.tvTable.x, NIGHT.tvTable.z, 0.56, 1.02, 0.45);
    // the attaya set's brazier and pot are solid; its cushions are the seats
    k.solid(NIGHT.attaya.x, NIGHT.attaya.z - 0.18, 0.5, 0.4, 0.4);
    // ------------------------------------------------ the furniture kit pieces, merged in one mesh
    const furn: { id: FurnitureId; x: number; z: number; rotY: number; seats?: string }[] = [
      { id: 'lowTable:better', x: NIGHT.tvTable.x, z: NIGHT.tvTable.z, rotY: Math.PI / 2 },
      { id: 'attaya:basic', x: NIGHT.attaya.x, z: NIGHT.attaya.z, rotY: 0, seats: 'attaya' },
    ];
    const parts: THREE.BufferGeometry[] = [];
    for (const f of furn) {
      const b = buildFurniture(f.id), mesh = b.group.children[0] as THREE.Mesh, geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x, G0, f.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rotY), new THREE.Vector3(1, 1, 1)));
      parts.push(geo);
      if (f.seats) for (const s of b.spec.seats) {
        const c = Math.cos(f.rotY), sn = Math.sin(f.rotY), lx = f.x + s.x * c + s.z * sn, lz = f.z - s.x * sn + s.z * c;
        this.seats.push(k.seat(`${id}:${f.seats}:${s.id}`, lx, lz, f.rotY + s.yaw, floorSeatTop(G0 + s.top), s.kind, s.clip));
      }
    }
    const merged = parts.length > 1 ? mergeGeometries(parts, false)! : parts[0];
    if (parts.length > 1) for (const p of parts) p.dispose();
    const fm = new THREE.Mesh(merged, furnitureMaterials().body); fm.name = 'dibi_furniture'; fm.castShadow = true; fm.receiveShadow = true;
    k.group.add(fm); k.keep(merged);
    // ------------------------------------------------ the board: menu, TV screen, posters
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const m = NIGHT.menu;
    quad(pos, uv, idx, m.x, m.y, m.z, 0, m.w, m.h, REG.menu);
    for (const dx of [-m.w / 2 + 0.15, m.w / 2 - 0.15]) B.plain.box(0.012, 0.3, 0.012, m.x + dx, m.y + m.h / 2, m.z, 0x2b2b2b);   // its two hangers
    this.tvUv = uv.length / 2;
    quad(pos, uv, idx, NIGHT.tv.x, NIGHT.tv.y, NIGHT.tv.z, -Math.PI / 2, NIGHT.tv.w, NIGHT.tv.h, REG.off);
    const P = NIGHT.posterSize;
    for (const p of NIGHT.posters) quad(pos, uv, idx, p.x, p.y, p.z, p.yaw, P.w, P.h, REG.posters[p.id]);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bg.setIndex(idx); bg.computeVertexNormals(); bg.computeBoundingSphere();
    this.tex = typeof document === 'undefined' ? null : k.keep(new THREE.CanvasTexture(document.createElement('canvas')));
    if (this.tex) this.tex.colorSpace = THREE.SRGBColorSpace;
    this.boardMat = k.keep(new THREE.MeshLambertMaterial({ map: this.tex, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.15 }));
    this.board = new THREE.Mesh(bg, this.boardMat); this.board.name = 'dibi_board'; k.group.add(this.board); k.keep(bg);
  }

  /** The menu's rows (from the place's offers, once it exists). */
  setMenu(offers: Record<string, readonly ActivitySpec[]>) { this.rows = menuRows(offers); this.boardKey = ''; }

  private placeSkewers() {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 6; i++) {
      q.setFromAxisAngle(Z, this.angle[i]);
      M.compose(new THREE.Vector3(NIGHT.grill.x - 1.1 + i * 0.44, G0 + 0.93, NIGHT.grill.z), q, one);
      this.skewers.setMatrixAt(i, M);
    }
    this.skewers.instanceMatrix.needsUpdate = true;
  }

  /** One frame. Returns true when the dibi master has just turned a brochette (the venue plays his gesture). */
  update(dt: number, s: NightState): boolean {
    const night = s.night, f = s.open ? 0.82 + 0.18 * Math.sin(this.frameT * 7.3 + 1) * Math.sin(this.frameT * 2.9) : 0;
    // coals: dull red by day, glowing at night, cold when closed
    this.glow = s.open ? 0.42 + 0.58 * night : 0;
    this.level = s.open ? this.glow * f : 0.12;
    this.coalMat.color.setRGB(this.level, this.level * (0.78 + 0.1 * night), this.level * (0.72 + 0.1 * night));
    // the brochettes: on the grill while open, turned one by one
    this.skewers.visible = s.open;
    let turned = false;
    if (s.open) {
      this.next -= dt;
      if (this.next <= 0) { this.next = 1.2 + this.o.rand() * 0.8; this.turn = (this.turn + 1) % 6; this.target[this.turn] += Math.PI; this.flips++; turned = true; }
      let moved = false;
      for (let i = 0; i < 6; i++) { const d = this.target[i] - this.angle[i]; if (Math.abs(d) > 1e-3) { this.angle[i] += Math.sign(d) * Math.min(Math.abs(d), dt * Math.PI / 0.35); moved = true; } }
      if (moved) this.placeSkewers();
    }
    // sparks rise from the coals at night, near the camera only
    const near = Math.hypot(s.camera.x - NIGHT.grill.x, s.camera.z - NIGHT.grill.z) < 45;
    this.sparks.visible = s.open && night > 0.3 && near;
    if (this.sparks.visible) this.stepSparks(dt);
    // the board: the menu, the posters and the TV (redrawn when what it says changes), lit a little at night
    this.frameT += dt;
    const tv = tvLines(s.day, s.hour, s.done);
    const key = `${tv.tag}|${tv.names}|${tv.status}|${tv.result}|${tv.live}|${this.rows.map(r => r.id + r.price).join(',')}`;
    if (key !== this.boardKey && this.tex) {
      this.boardKey = key; this.tv = tv;
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
      const c = cv.getContext('2d'); if (c) drawBoard(c, { rows: this.rows, tv, place: this.o.place, owner: this.o.owner });
      this.tex.image = cv; this.tex.needsUpdate = true;
    } else if (key !== this.boardKey) { this.boardKey = key; this.tv = tv; }
    this.boardMat.emissiveIntensity = s.open ? 0.15 + 0.55 * night : 0.04;
    // the TV: frames of the bout (0, 1, 0, 1, 2) while open, a dark screen when closed
    const seq = [0, 1, 0, 1, 2], slot = s.open ? seq[Math.floor(this.frameT / 1.6) % seq.length] : -1;
    if (slot !== this.frame) { this.frame = slot; this.setTv(slot < 0 ? REG.off : REG.tv[slot]); }
    return turned;
  }

  private setTv(r: readonly number[]) {
    const a = this.board.geometry.attributes.uv as THREE.BufferAttribute, u = uvOf(r), i = this.tvUv;
    a.setXY(i, u.u0, u.v0); a.setXY(i + 1, u.u1, u.v0); a.setXY(i + 2, u.u1, u.v1); a.setXY(i + 3, u.u0, u.v1); a.needsUpdate = true;
  }

  private stepSparks(dt: number) {
    const g = this.sparks.geometry, P = g.attributes.position as THREE.BufferAttribute, C = g.attributes.color as THREE.BufferAttribute, R = this.o.rand, gr = NIGHT.grill;
    this.sp.forEach((p, i) => {
      p.t += dt / Math.max(0.05, p.life);
      if (p.t >= 1) { p.t = R() * 0.2; p.life = 0.6 + R() * 0.7; p.x = gr.x - 1.2 + R() * 2.4; p.y = G0 + 0.9; p.z = gr.z - 0.3 + R() * 0.6; p.vx = (R() - 0.5) * 0.5; p.vy = 0.8 + R() * 0.8; p.vz = (R() - 0.5) * 0.4; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx += (R() - 0.5) * dt * 1.2;
      P.setXYZ(i, p.x, p.y, p.z);
      const a = (1 - p.t) * Math.min(1, p.t * 8);
      C.setXYZW(i, 1, 0.55 + 0.3 * (1 - p.t), 0.15, a);
    });
    P.needsUpdate = true; C.needsUpdate = true;
  }

  debug() {
    return {
      coals: +this.level.toFixed(2), glow: +this.glow.toFixed(2), sparks: this.sparks.visible, flips: this.flips, brochettes: this.skewers.visible,
      tv: { frame: this.frame, names: this.tv.names, status: this.tv.status, result: this.tv.result, live: this.tv.live },
      menu: this.rows.map(r => ({ id: r.id, label: r.label, price: r.price })),
      seats: this.seats.map(s => s.id),
    };
  }
}
