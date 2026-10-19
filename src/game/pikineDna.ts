import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameModule } from './modules';
import type { HubWorld } from '../world/types';
import { rng, pick } from '../core/rng';
import { daylight } from '../core/clock';
import { nightOf } from '../city/nightRules';
import { gateOf, gatePlaza, stallFronts, streetEnds } from '../arena/exteriorRules';

/**
 * Pikine Street DNA, phase 2: one polished neighbourhood slice along the first walk (the room, the avenue south past the
 * gare, the grand-place, the shops' court). It adds only what the street was missing, on top of the hub the builder and the
 * street-dress module already made, in ONE merged draw call with ONE painted atlas (no Meshy, no paid asset, no new network
 * request):
 *  - the street's edge: tall painted compound walls with murals (the wrestler, the Lions, the telecom and bissap adverts,
 *    wax print, « défense d'uriner »), house gates with their « Keur » plates, between the houses the builder drew;
 *  - the overhead layer a Dakar street has: poles, crossarms, wires across the road, bunting at the squares;
 *  - the landmarks: a baobab at the first corner, the gare's portal, the grand-place's gateway, the market gateway of the
 *    shops' court and its painted flank;
 *  - the ground: painted kerbs, speed bumps, a standpipe with its jerrycans, whitewashed-tyre planters.
 * Everything here is drawn after the builder, from a seed of its own: no random stream of the hub is touched, so every
 * other tree, stall, car and person stays where it was. Solid pieces get colliders that keep the pavement lanes of the
 * street crowd (src/crowd/streetPlan.ts PAVE) free, and nothing is placed on a collider, a place, a seat or a crossing.
 */

type Rect = [number, number, number, number];                                   // u0, v0, u1, v1
const AW = 1024;
let AH = 0;                                                                     // the atlas is as tall as its cells need (dressAtlas)
const MW = 512, MH = 176, MV = 192;                                              // mural cells: 2 columns × 4 rows; a mural is drawn 512 × 192 and squeezed into its cell (the wall's 2 m height gives it back its proportions)
const rectOf = (x: number, y: number, w: number, h: number): Rect => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];

export const DNA_COUNT = {
  low: { wires: false, bunting: false, kerbs: false, props: false },
  medium: { wires: true, bunting: true, kerbs: true, props: true },
  high: { wires: true, bunting: true, kerbs: true, props: true },
} as const;

// ------------------------------------------------------------------------------------------------ the painted atlas
const MURALS = ['lutteur', 'lions', 'telecom', 'bissap', 'pikine', 'wax', 'defense', 'salon'] as const;
/**
 * Every board of the slice, in metres, and the atlas pixels each metre gets. A sign is painted in a cell of exactly its board's
 * proportions (width : height), so no letter is ever stretched; a shop's fascia is a board of its own size, not a strip of someone else's.
 */
const BOARD = {
  gare: { w: 5.2, h: 1.4, ppm: 80 }, gare_blade: { w: 2.2, h: 1.0, ppm: 100 }, jamm: { w: 2.2, h: 0.9, ppm: 100 },
  place: { w: 8.4, h: 1.0, ppm: 60 }, arene: { w: 8.4, h: 1.0, ppm: 60 }, marche: { w: 7.0, h: 1.1, ppm: 60 }, banque: { w: 6.2, h: 0.95, ppm: 80 },
  keur_mbaye: { w: 1.7, h: 0.6, ppm: 150 }, keur_sarr: { w: 1.7, h: 0.6, ppm: 150 }, keur_gueye: { w: 1.7, h: 0.6, ppm: 150 },
  borne: { w: 1.7, h: 0.75, ppm: 130 }, prix: { w: 0.75, h: 1.0, ppm: 100 },
} as const;
const FASCIA = { w: 4.5, h: 1.0, ppm: 75 };

type Trade = 'boutique' | 'couture' | 'quinc' | 'multiservice' | 'cantine' | 'pharmacie' | 'coiffure' | 'cyber' | 'supporters';
interface ShopName { trade: Trade; name: string; sub: string | string[]; bg: string; fg: string; accent: string; subFg: string }
/**
 * The names above the shops. Each trade keeps one look (its colours, its goods, its forecourt: SHOP_TRAIT, `forecourt`) and several
 * owners: the street reads as many businesses of a few kinds, not as one shop repeated. Invented names, Dakar vocabulary: « keur » (the
 * house of), « chez », « dibi » (grilled meat), « thiébou djeun » (rice and fish), « attaya » (tea), « jàmm » (peace), « teranga » (hospitality).
 */
const SHOP_NAMES: ShopName[] = [
  { trade: 'boutique', name: 'BOUTIQUE ABDOU', sub: 'Alimentation générale', bg: '#2f7a4a', fg: '#fdf0c0', accent: '#fdf0c0', subFg: '#ffffff' },
  { trade: 'boutique', name: 'BOUTIQUE MARIAMA', sub: 'Riz · Huile · Sucre · Lait', bg: '#d9b23a', fg: '#2a2410', accent: '#2f7a4a', subFg: '#1f5a36' },
  { trade: 'couture', name: 'COUTURE FATOU', sub: 'Modèles sur mesure · wax', bg: '#a8402f', fg: '#fdf0d4', accent: '#fdf0d4', subFg: '#ffe58a' },
  { trade: 'couture', name: 'TAILLEUR MODOU', sub: 'Boubous · Costumes · Retouches', bg: '#1f3d75', fg: '#fdf0d4', accent: '#f08a24', subFg: '#ffd23a' },
  { trade: 'quinc', name: 'QUINCAILLERIE', sub: 'Ndiaye & Fils · ciment · fer', bg: '#2b4f86', fg: '#f3ead4', accent: '#f3ead4', subFg: '#ffd23a' },
  { trade: 'multiservice', name: 'MULTISERVICE JÀMM', sub: ['Wave · Orange Money', 'Impression · Photocopie'], bg: '#f1e7c6', fg: '#a1321f', accent: '#a1321f', subFg: '#1b1b1b' },
  { trade: 'cantine', name: 'CANTINE MAME', sub: 'Thiéboudienne · midi', bg: '#c8702a', fg: '#fff1cf', accent: '#fff1cf', subFg: '#3a1d0a' },
  { trade: 'cantine', name: 'CHEZ TANTE YACINE', sub: 'Mafé · Yassa · Dibi · Bissap', bg: '#f3ead4', fg: '#9b3d2b', accent: '#c8702a', subFg: '#3a1d0a' },
  { trade: 'pharmacie', name: 'PHARMACIE TERANGA', sub: 'De garde · Ouverte la nuit', bg: '#f4f6f0', fg: '#1d7a4a', accent: '#1d7a4a', subFg: '#1b1b1b' },
  { trade: 'coiffure', name: 'COIFFURE PAPE', sub: 'Hommes · Dames · Enfants', bg: '#6a3f8a', fg: '#fdf0d4', accent: '#fdf0d4', subFg: '#ffd23a' },
  { trade: 'coiffure', name: 'BARBER MOUSTAPHA', sub: 'Dégradé · Barbe · Rasage', bg: '#24262c', fg: '#f5cd2e', accent: '#f5cd2e', subFg: '#ffffff' },
  { trade: 'cyber', name: 'CYBER NDOYE', sub: 'Internet · Jeux · Scan', bg: '#24262c', fg: '#f4d35e', accent: '#7fd3ff', subFg: '#ffffff' },
  { trade: 'supporters', name: 'LÀMB SHOP', sub: ['Maillots · Écharpes', 'Drapeaux des écuries'], bg: '#1a7a44', fg: '#f5cd2e', accent: '#c8322a', subFg: '#ffffff' },
];
const shopSignId = (i: number) => `shop${i}` as const;
type SignId = keyof typeof BOARD | `shop${number}`;
const boardDim = (id: SignId): { w: number; h: number; ppm: number } => id.startsWith('shop') ? FASCIA : BOARD[id as keyof typeof BOARD];

type MuralId = typeof MURALS[number];
/** One line of painted text and how it fitted its cell (read by the signage check). */
export interface DnaTextLog { id: string; text: string; size: number; wanted: number; width: number; avail: number; x0: number; x1: number; y0: number; y1: number; cw: number; ch: number }
let textLog: DnaTextLog[] = [], cellId = '', cellW = 0, cellH = 0;
type Atlas = { tex: THREE.CanvasTexture; glow: THREE.CanvasTexture; mural: Record<MuralId, Rect>; sign: Record<string, Rect>; cells: Record<string, { cw: number; ch: number }>; texts: DnaTextLog[]; w: number; h: number; white: Rect; lit: Rect };
let atlas: Atlas | null = null, atlasKey = '';

/** Centred text that shrinks (never stretches) to fit `w`; every line is logged with its measured box. */
function text(c: CanvasRenderingContext2D, t: string, x: number, y: number, w: number, size: number, fill: string, stroke?: string, weight = 800) {
  const wanted = size, font = (s: number) => `${weight} ${s}px system-ui, "Arial Narrow", sans-serif`;
  c.font = font(size);
  while (c.measureText(t).width > w && size > 8) { size -= 1; c.font = font(size); }
  const width = c.measureText(t).width, pad = stroke ? Math.max(3, size / 7) / 2 : 0;
  textLog.push({ id: cellId, text: t, size, wanted, width, avail: w, x0: x - width / 2 - pad, x1: x + width / 2 + pad, y0: y - size * 0.5 - pad, y1: y + size * 0.5 + pad, cw: cellW, ch: cellH });
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (stroke) { c.lineWidth = Math.max(3, size / 7); c.strokeStyle = stroke; c.lineJoin = 'round'; c.strokeText(t, x, y); }
  c.fillStyle = fill; c.fillText(t, x, y);
}
const poly = (c: CanvasRenderingContext2D, pts: [number, number][], fill: string) => {
  c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill();
};
const disc = (c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };

/** One painted wall, drawn into a MW × MH cell at the origin. */
function paintMural(c: CanvasRenderingContext2D, id: MuralId) {
  const frame = (col: string) => { c.strokeStyle = col; c.lineWidth = 6; c.strokeRect(3, 3, MW - 6, 186); };
  if (id === 'lutteur') {                                                       // the wrestler, in the sun of the arena evening
    const g = c.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, '#f4c64f'); g.addColorStop(1, '#df6f3b'); c.fillStyle = g; c.fillRect(0, 0, MW, MH);
    disc(c, 372, 84, 64, '#fbe8b4'); disc(c, 372, 84, 46, '#fff4d6');
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; poly(c, [[372 + Math.cos(a) * 70, 84 + Math.sin(a) * 70], [372 + Math.cos(a + 0.09) * 120, 84 + Math.sin(a + 0.09) * 120], [372 + Math.cos(a - 0.09) * 120, 84 + Math.sin(a - 0.09) * 120]], 'rgba(255,236,170,0.55)'); }
    c.fillStyle = '#7a3c1d'; c.fillRect(0, 192 - 30, MW, 30);
    c.fillStyle = '#9b5426'; for (let x = 0; x < MW; x += 34) c.fillRect(x, 192 - 30, 18, 6);
    const ink = '#241812', skin = '#3a2418';
    poly(c, [[112, 128], [132, 128], [140, 168], [118, 168]], ink); poly(c, [[196, 128], [216, 128], [226, 168], [200, 168]], ink);   // legs in the stance
    poly(c, [[108, 168], [150, 168], [150, 178], [102, 178]], ink); poly(c, [[196, 168], [238, 168], [244, 178], [196, 178]], ink);
    poly(c, [[116, 70], [212, 70], [204, 134], [124, 134]], skin);                                                                  // torso
    poly(c, [[116, 78], [78, 60], [66, 36], [82, 30], [96, 52], [124, 62]], skin); poly(c, [[212, 78], [250, 60], [262, 36], [246, 30], [232, 52], [204, 62]], skin);   // raised arms
    disc(c, 164, 52, 22, skin);                                                                                                       // head
    poly(c, [[122, 126], [206, 126], [212, 150], [116, 150]], '#d4402b');                                                            // the mbeng
    for (let k = 0; k < 6; k++) poly(c, [[122 + k * 14, 126], [130 + k * 14, 126], [130 + k * 14, 150], [124 + k * 14, 150]], '#f4efe2');
    poly(c, [[60, 40], [86, 22], [90, 34], [66, 50]], '#f4c64f');                                                                    // gris-gris bands on the arm
    text(c, 'LÀMB', 392, 156, 170, 70, '#fff4d6', '#5a2a14'); text(c, 'Pikine · Parcelles', 392, 22, 200, 26, '#5a2a14', undefined, 700);
    frame('#5a2a14');
  } else if (id === 'lions') {                                                  // the national colours, the star, the ball
    c.fillStyle = '#1d8040'; c.fillRect(0, 0, MW / 3, MH); c.fillStyle = '#f5cd2e'; c.fillRect(MW / 3, 0, MW / 3, MH); c.fillStyle = '#d7312f'; c.fillRect(MW * 2 / 3, 0, MW / 3 + 1, MH);
    const star = (x: number, y: number, r: number, col: string) => { const p: [number, number][] = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } poly(c, p, col); };
    star(MW / 2, 58, 40, '#1d8040');
    disc(c, 98, 120, 40, '#fbfaf5'); c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.arc(98, 120, 40, 0, Math.PI * 2); c.stroke();
    star(98, 120, 16, '#222'); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; c.beginPath(); c.moveTo(98 + Math.cos(a) * 16, 120 + Math.sin(a) * 16); c.lineTo(98 + Math.cos(a) * 38, 120 + Math.sin(a) * 38); c.stroke(); }
    text(c, 'ALLEZ LES LIONS', 330, 132, 320, 52, '#fff6dc', '#1a1a1a'); text(c, 'Teranga · 2026', 330, 170, 200, 22, '#1a1a1a', undefined, 700);
    frame('#1a1a1a');
  } else if (id === 'telecom') {                                                // an invented operator's advert
    const g = c.createLinearGradient(0, 0, MW, 0); g.addColorStop(0, '#1b4f9c'); g.addColorStop(1, '#2d7bd0'); c.fillStyle = g; c.fillRect(0, 0, MW, MH);
    c.fillStyle = '#ffd23a'; c.fillRect(0, MH - 44, MW, 44); c.fillRect(0, 0, MW, 12);
    text(c, 'JAMM TÉLÉCOM', 220, 56, 390, 64, '#ffffff', '#0e2f63'); text(c, 'Internet 4G · Forfaits · Recharge ici', 220, MH - 22, 420, 28, '#0e2f63', undefined, 800);
    c.fillStyle = '#0e2f63'; c.fillRect(420, 22, 56, 118); c.fillStyle = '#a9d4ff'; c.fillRect(426, 32, 44, 88); disc(c, 448, 130, 4, '#a9d4ff');
    for (let k = 0; k < 3; k++) { c.strokeStyle = '#ffd23a'; c.lineWidth = 4; c.beginPath(); c.arc(448, 28, 22 + k * 14, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
    text(c, '77 000 00 00', 220, 98, 300, 30, '#ffe58a', undefined, 700);
  } else if (id === 'bissap') {                                                 // bissap, the hibiscus drink
    c.fillStyle = '#fbe9ef'; c.fillRect(0, 0, MW, MH); c.fillStyle = '#a3123a'; c.fillRect(0, 0, MW, 16); c.fillRect(0, MH - 16, MW, 16);
    for (let k = 0; k < 6; k++) { const x = 28 + k * 38, y = 52 + (k % 2) * 20; for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5; disc(c, x + Math.cos(a) * 10, y + Math.sin(a) * 10, 9, '#c2185b'); } disc(c, x, y, 5, '#ffe28a'); }
    poly(c, [[352, 36], [392, 36], [392, 60], [412, 90], [412, 176], [332, 176], [332, 90], [352, 60]], '#8e1236'); poly(c, [[340, 100], [404, 100], [404, 168], [340, 168]], '#fbe9ef');
    c.fillStyle = '#a3123a'; c.fillRect(354, 28, 36, 10);
    text(c, 'BISSAP LÉER', 160, 118, 280, 56, '#a3123a', '#ffffff'); text(c, 'frais · glacé · 100 F', 160, 160, 260, 24, '#5a0b22', undefined, 700);
    text(c, 'Sunu', 372, 134, 56, 18, '#a3123a');
  } else if (id === 'pikine') {                                                 // the neighbourhood's name, over sun and sea
    const g = c.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, '#74c6d0'); g.addColorStop(1, '#2e86a4'); c.fillStyle = g; c.fillRect(0, 0, MW, MH);
    disc(c, 90, 62, 38, '#ffe28a');
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4; for (let r = 0; r < 4; r++) { c.beginPath(); for (let x = 0; x <= MW; x += 8) c.lineTo(x, 150 + r * 12 + Math.sin(x / 22 + r) * 5); c.stroke(); }
    text(c, 'PIKINE', 290, 70, 380, 100, '#fff6dc', '#14485e'); text(c, 'Sunu quartier · Sunu kër', 290, 134, 300, 28, '#14485e', undefined, 700);
    frame('#14485e');
  } else if (id === 'wax') {                                                    // wax-print geometry, as the tailors' cloth
    c.fillStyle = '#1f3d75'; c.fillRect(0, 0, MW, MH);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 11; x++) {
      const cx = x * 48 + (y % 2 ? 24 : 0), cy = 24 + y * 48;
      poly(c, [[cx, cy - 22], [cx + 22, cy], [cx, cy + 22], [cx - 22, cy]], y % 2 ? '#f08a24' : '#f4efe2'); disc(c, cx, cy, 9, '#1f3d75'); disc(c, cx, cy, 4, y % 2 ? '#f4efe2' : '#f08a24');
    }
    c.fillStyle = '#d7312f'; c.fillRect(0, 0, MW, 8); c.fillRect(0, MH - 8, MW, 8);
  } else if (id === 'defense') {                                                // the wall's own warning, as painted on a hundred walls
    c.fillStyle = '#f6f1e2'; c.fillRect(0, 0, MW, MH); c.fillStyle = '#c62828'; c.fillRect(0, 0, MW, 14); c.fillRect(0, MH - 14, MW, 14);
    text(c, 'DÉFENSE', 256, 56, 440, 70, '#c62828'); text(c, 'DE DÉPOSER LES ORDURES', 256, 112, 470, 40, '#1b1b1b'); text(c, 'Amende : 5 000 F · Jàmm la !', 256, 156, 420, 28, '#1b1b1b', undefined, 700);
  } else {                                                                      // « salon »: Salon Awa's flank
    c.fillStyle = '#e895ac'; c.fillRect(0, 0, MW, MH); c.fillStyle = '#fff3f6'; c.fillRect(0, 0, MW, 14); c.fillRect(0, MH - 14, MW, 14);
    poly(c, [[60, 40], [100, 40], [92, 116], [68, 116]], '#4a2433'); disc(c, 80, 36, 24, '#4a2433');                                  // a head of braids
    for (let k = 0; k < 7; k++) { c.strokeStyle = '#4a2433'; c.lineWidth = 6; c.beginPath(); c.moveTo(62 + k * 6, 44); c.quadraticCurveTo(54 + k * 7, 100, 56 + k * 8, 150); c.stroke(); }
    disc(c, 80, 62, 16, '#7a4a33');
    c.strokeStyle = '#fff3f6'; c.lineWidth = 6; c.beginPath(); c.arc(402, 46, 14, 0, Math.PI * 2); c.moveTo(414, 56); c.lineTo(450, 120); c.moveTo(396, 60); c.lineTo(352, 120); c.stroke();
    text(c, 'SALON AWA', 280, 70, 300, 60, '#fff3f6', '#7a2d46'); text(c, 'Coiffure · Tresses · Ongles', 280, 120, 320, 28, '#fff3f6', '#7a2d46', 700); text(c, 'Sur rendez-vous ou pas', 280, 156, 300, 22, '#7a2d46', undefined, 700);
  }
}

/** The frame of a board: its ground, an inset rule, in the cell's own proportions. */
function frame(c: CanvasRenderingContext2D, W: number, H: number, bg: string, fg: string) {
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const m = Math.round(H * 0.06) + 1; c.strokeStyle = fg; c.lineWidth = Math.max(3, Math.round(H / 24)); c.strokeRect(m, m, W - 2 * m, H - 2 * m);
}
/** Two lines on a board: a name, and what is sold (one or two lines of it). Sizes are fractions of the board's height, so they hold at any proportion. */
function plate(c: CanvasRenderingContext2D, W: number, H: number, name: string, nameFg: string, sub: string | string[] | undefined, subFg: string, left = 0) {
  const subs = sub === undefined ? [] : Array.isArray(sub) ? sub : [sub], cx = (W + left) / 2, avail = W - left - 2 * Math.round(H * 0.26);
  if (!subs.length) text(c, name, cx, H * 0.52, avail, H * 0.5, nameFg);
  else if (subs.length === 1) { text(c, name, cx, H * 0.35, avail, H * 0.4, nameFg); text(c, subs[0], cx, H * 0.75, avail, H * 0.2, subFg, undefined, 700); }
  else { text(c, name, cx, H * 0.28, avail, H * 0.32, nameFg); text(c, subs[0], cx, H * 0.58, avail, H * 0.2, subFg, undefined, 700); text(c, subs[1], cx, H * 0.8, avail, H * 0.2, subFg, undefined, 700); }
}

/** One painted board, in a W × H cell that has the board's own proportions. */
function paintSign(c: CanvasRenderingContext2D, id: SignId, W: number, H: number) {
  if (id.startsWith('shop')) {
    const s = SHOP_NAMES[Number(id.slice(4))];
    frame(c, W, H, s.bg, s.accent);
    if (s.trade === 'pharmacie') { c.fillStyle = s.fg; const k = H * 0.5, x = H * 0.4, y = H * 0.5; c.fillRect(x - k / 2, y - k / 6, k, k / 3); c.fillRect(x - k / 6, y - k / 2, k / 3, k); plate(c, W, H, s.name, s.fg, s.sub, s.subFg, H * 0.62); }
    else plate(c, W, H, s.name, s.fg, s.sub, s.subFg);
    return;
  }
  const bd = id as keyof typeof BOARD;
  if (bd === 'gare') { frame(c, W, H, '#1e3a8a', '#fde68a'); plate(c, W, H, 'GARE ROUTIÈRE', '#fde68a', 'PIKINE · Car rapide · Ndiaga Ndiaye', '#ffffff'); c.fillStyle = '#f4c20d'; c.fillRect(H * 0.14, H * 0.9, W - H * 0.28, H * 0.05); }
  else if (bd === 'gare_blade') { frame(c, W, H, '#1e3a8a', '#fde68a'); text(c, 'GARE', W / 2, H * 0.28, W - 40, H * 0.36, '#fde68a'); text(c, 'ROUTIÈRE', W / 2, H * 0.6, W - 40, H * 0.26, '#ffffff'); text(c, 'car rapide', W / 2, H * 0.83, W - 40, H * 0.13, '#ffd23a', undefined, 700); }
  else if (bd === 'place') { frame(c, W, H, '#1d6b3c', '#ffd23a'); plate(c, W, H, 'GRAND-PLACE', '#ffe58a', 'de Pikine · attaya · palabres · jàmm', '#ffffff'); c.fillStyle = '#d7312f'; c.fillRect(H * 0.14, H * 0.9, W - H * 0.28, H * 0.05); }
  else if (bd === 'arene') { frame(c, W, H, '#1a5c36', '#f5cd2e'); plate(c, W, H, 'RUE DE L’ARÈNE', '#f5cd2e', 'Làmb · billets · attaya · jàmm', '#ffffff'); c.fillStyle = '#c8322a'; c.fillRect(H * 0.14, H * 0.9, W - H * 0.28, H * 0.05); }
  else if (bd === 'marche') { frame(c, W, H, '#b85a1f', '#ffe9b8'); plate(c, W, H, 'MARCHÉ', '#ffe9b8', 'Boutiques · Salon · Couture', '#ffffff'); }
  else if (bd === 'keur_mbaye') { frame(c, W, H, '#f3ead4', '#2f6f4a'); plate(c, W, H, 'KEUR MBAYE', '#2f6f4a', 'Dieureudieuf', '#7a4a2a'); }
  else if (bd === 'keur_sarr') { frame(c, W, H, '#2b4f86', '#f3ead4'); plate(c, W, H, 'KEUR SARR', '#f3ead4', 'Bienvenue', '#ffd23a'); }
  else if (bd === 'keur_gueye') { frame(c, W, H, '#9b3d2b', '#fbe9b8'); plate(c, W, H, 'KEUR GUEYE', '#fbe9b8', 'Teranga', '#ffffff'); }
  else if (bd === 'borne') { frame(c, W, H, '#2d7bd0', '#ffffff'); plate(c, W, H, 'BORNE-FONTAINE', '#ffffff', '20 F le seau', '#ffe58a'); }
  else if (bd === 'banque') { frame(c, W, H, '#145d5b', '#f3ead4'); plate(c, W, H, 'BANQUE TERANGA', '#f3ead4', 'Agence de Pikine · GAB 24 h/24', '#ffd23a'); }
  else if (bd === 'jamm') { frame(c, W, H, '#f1e7c6', '#1d6b3c'); text(c, 'CITÉ JÀMM', W / 2, H * 0.33, W - 40, H * 0.42, '#1d6b3c'); text(c, 'Résidences · Parcelles', W / 2, H * 0.74, W - 40, H * 0.2, '#a1321f', undefined, 700); }
  else {                                                                        // « prix »: the price board a grocer stands on the pavement (portrait)
    frame(c, W, H, '#2f3b34', '#f3ead4');
    text(c, 'PRIX', W / 2, H * 0.17, W - 16, H * 0.16, '#ffe58a');
    ['Riz 500', 'Sucre 700', 'Lait 300'].forEach((t, k) => text(c, t, W / 2, H * (0.42 + k * 0.2), W - 18, H * 0.12, '#f3ead4', undefined, 700));
  }
}

/** The atlas: the murals, and a cell for each board the layout uses (`want`: every board when omitted, or the cached atlas). */
function dressAtlas(want?: ReadonlySet<string>): Atlas {
  if (atlas && !want) return atlas;
  const key = want ? [...want].sort().join(',') : '*';
  if (atlas && key === atlasKey) return atlas;
  atlas?.tex.dispose(); atlas?.glow.dispose();
  // the cells: murals on top, then every board in a cell of its own proportions, packed in rows (the tallest first)
  const ids = ([...(Object.keys(BOARD) as SignId[]), ...SHOP_NAMES.map((_, i) => shopSignId(i))] as SignId[]).filter(id => !want || want.has(id));
  const cells = ids.map(id => { const b = boardDim(id); return { id, cw: Math.round(b.w * b.ppm), ch: Math.round(b.h * b.ppm) }; }).sort((a, b) => b.ch - a.ch);
  const place: Record<string, { x: number; y: number }> = {}, rows: { y: number; h: number; x: number }[] = [];
  let signsEnd = 4 * MH;
  for (const cl of cells) {                                                     // first-fit decreasing: a cell goes in the first row it fits (a later, shorter one backfills)
    let row = rows.find(r => r.h >= cl.ch && r.x + cl.cw <= AW);
    if (!row) { row = { y: signsEnd, h: cl.ch, x: 0 }; rows.push(row); signsEnd += cl.ch; }
    place[cl.id] = { x: row.x, y: row.y }; row.x += cl.cw;
  }
  AH = Math.ceil((signsEnd + 16) / 16) * 16;                                    // + the two small cells (white for the plain parts, lit for windows and bulbs)
  textLog = [];
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, AW, AH);
  const mural = {} as Record<MuralId, Rect>, sign: Record<string, Rect> = {}, dims: Record<string, { cw: number; ch: number }> = {};
  MURALS.forEach((id, i) => { const x = (i % 2) * MW, y = Math.floor(i / 2) * MH; c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, MW, MH); c.clip(); c.scale(1, MH / MV); cellId = id; cellW = MW; cellH = MV; paintMural(c, id); c.restore(); mural[id] = rectOf(x, y, MW, MH); });
  for (const cl of cells) { const { x, y } = place[cl.id]; c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, cl.cw, cl.ch); c.clip(); cellId = cl.id; cellW = cl.cw; cellH = cl.ch; paintSign(c, cl.id, cl.cw, cl.ch); c.restore(); sign[cl.id] = rectOf(x, y, cl.cw, cl.ch); dims[cl.id] = { cw: cl.cw, ch: cl.ch }; }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the night glow: the small signs, a little of the murals (a wall is lit by the lamps, not by itself); the plain parts stay dark
  // (half the size: it shares the atlas's UVs, and a glow needs no more detail, so it costs a quarter of the memory)
  const cg = document.createElement('canvas'); cg.width = AW / 2; cg.height = AH / 2;
  const g2 = cg.getContext('2d')!; g2.fillStyle = '#000'; g2.fillRect(0, 0, AW / 2, AH / 2);
  g2.globalAlpha = 0.28; g2.drawImage(cv, 0, 0, AW, 4 * MH, 0, 0, AW / 2, 2 * MH); g2.globalAlpha = 1; g2.drawImage(cv, 0, 4 * MH, AW, signsEnd - 4 * MH, 0, 2 * MH, AW / 2, (signsEnd - 4 * MH) / 2);
  g2.fillStyle = '#000'; g2.fillRect(0, signsEnd / 2, AW / 2, AH / 2 - signsEnd / 2);
  g2.fillStyle = '#fff'; g2.fillRect(480, (AH - 14) / 2, 7, 6);                                // the lit cell: windows and bulbs
  const glow = new THREE.CanvasTexture(cg); glow.colorSpace = THREE.SRGBColorSpace;
  atlasKey = key;
  atlas = { tex, glow, mural, sign, cells: dims, texts: textLog, w: AW, h: AH, white: rectOf(1000, AH - 14, 14, 12), lit: rectOf(960, AH - 14, 14, 12) };
  return atlas;
}

// ------------------------------------------------------------------------------------------------ merged pieces
class Pieces {
  geos: THREE.BufferGeometry[] = [];
  tris = 0;
  /** The part of the slice the next pieces belong to, and the triangles each part costs (the budget, in the debug stats). */
  cat = 'misc';
  byCat: Record<string, number> = {};
  constructor(private white: Rect, private litCell: Rect) {}
  private put(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotY: number, rotX = 0) {
    g.rotateX(rotX); g.rotateY(rotY); g.translate(x, y, z);
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count, col = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g); this.tris += n / 3; this.byCat[this.cat] = (this.byCat[this.cat] ?? 0) + n / 3;
  }
  private plain(g: THREE.BufferGeometry, cell: Rect = this.white) {
    const n = g.attributes.position.count, uv = new Float32Array(n * 2), [u0, v0, u1, v1] = cell;
    for (let i = 0; i < n; i++) { uv[i * 2] = (u0 + u1) / 2; uv[i * 2 + 1] = (v0 + v1) / 2; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  /** Box with its base at y (no underside). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const g = this.plain(new THREE.BoxGeometry(w, h, d));
    const idx = Array.from(g.index!.array); idx.splice(18, 6); g.setIndex(idx);
    g.translate(0, h / 2, 0); this.put(g, color, x, y, z, rotY);
  }
  /** Box whose +z face carries the atlas rect. */
  board(w: number, h: number, d: number, x: number, y: number, z: number, rect: Rect, rotY = 0, color = 0xffffff) {
    const g = this.plain(new THREE.BoxGeometry(w, h, d));
    const uv = g.attributes.uv as THREE.BufferAttribute, [u0, v0, u1, v1] = rect;
    const pz = 4 * 4;                                                           // BoxGeometry face order: px nx py ny pz nz
    uv.setXY(pz, u0, v1); uv.setXY(pz + 1, u1, v1); uv.setXY(pz + 2, u0, v0); uv.setXY(pz + 3, u1, v0);
    g.translate(0, h / 2, 0); this.put(g, color, x, y, z, rotY);
  }
  /** Box with its base at y whose faces all sample the lit cell: a window or a bulb, which glows at night. */
  litBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const g = this.plain(new THREE.BoxGeometry(w, h, d), this.litCell);
    const idx = Array.from(g.index!.array); idx.splice(18, 6); g.setIndex(idx);
    g.translate(0, h / 2, 0); this.put(g, color, x, y, z, rotY);
  }
  /** A flat disc (squashed along z by `sq`, turned by `rot`) lying on the ground: worn patches, dust, soil. */
  disc(r: number, x: number, y: number, z: number, color: number, sq = 1, rot = 0) {
    const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI / 2); g.scale(1, 1, sq); this.plain(g); this.put(g, color, x, y, z, rot);
  }
  /** A soft-edged blotch lying on the ground: the colour runs from `centre` to `rim` (the ground's own colour) by vertex colours, so no edge shows and no texture is needed. */
  blot(r: number, x: number, y: number, z: number, centre: number, rim: number, sq = 1, rot = 0, seg = 10) {
    const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); g.scale(1, 1, sq); this.plain(g); g.rotateY(rot); g.translate(x, y, z);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = new THREE.Color(centre), e = new THREE.Color(rim);
    for (let i = 0; i < n; i++) { const k = i === 0 ? c : e; arr[i * 3] = k.r; arr[i * 3 + 1] = k.g; arr[i * 3 + 2] = k.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const ng = g.toNonIndexed(); this.geos.push(ng); this.tris += n > 2 ? seg : 0; this.byCat[this.cat] = (this.byCat[this.cat] ?? 0) + seg;
  }
  /** Box centred at y keeping all faces, tilted about its own x axis (awnings). */
  slab(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotY = 0, tilt = 0) {
    this.put(this.plain(new THREE.BoxGeometry(w, h, d)), color, x, y, z, rotY, tilt);
  }
  /** A flat quad lying on the ground (kerb paint, speed-bump stripes). */
  flat(w: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const g = this.plain(new THREE.PlaneGeometry(w, d)); this.put(g, color, x, y, z, rotY, -Math.PI / 2);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 8) {
    const g = this.plain(new THREE.CylinderGeometry(rTop, rBot, h, seg)); g.translate(0, h / 2, 0); this.put(g, color, x, y, z, 0);
  }
  blob(r: number, x: number, y: number, z: number, color: number, sy = 1) {
    const g = this.plain(new THREE.IcosahedronGeometry(r, 1)); g.scale(1, sy, 1); this.put(g, color, x, y, z, 0);
  }
  /** A thin rod from A to B (wires, braces): a three-sided prism. */
  rod(a: [number, number, number], b: [number, number, number], r: number, color: number) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    const g = this.plain(new THREE.CylinderGeometry(r, r, len, 3, 1, true));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
    this.put(g, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0);
  }
  /** A wire hanging between two points (a sagging chain of rods). */
  wire(a: [number, number, number], b: [number, number, number], sag: number, color = 0x1d1d20, r = 0.018) {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 6));
    let prev = a;
    for (let k = 1; k <= n; k++) {
      const t = k / n, p: [number, number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      this.rod(prev, p, r, color); prev = p;
    }
  }
  /** Bunting: small flags hanging from a sagging line, alternating the colours (a single triangle each). */
  bunting(a: [number, number, number], b: [number, number, number], sag: number, colors: number[]) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(4, Math.round(len / 0.9)), dx = (b[0] - a[0]) / len, dz = (b[2] - a[2]) / len;
    this.wire(a, b, sag, 0x2a2a2a, 0.014);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, w = 0.26;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, -0.42, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      this.plain(g); this.put(g, colors[k % colors.length], x, y, z, Math.atan2(-dz, dx));
    }
  }
}

// ------------------------------------------------------------------------------------------------ the slice
/** The lines of the walk, as the centres of the roads: `alongZ` runs along z at x = c (the avenue), otherwise along x at z = c. */
interface Line { alongZ: boolean; c: number; a: number; b: number; crossings: number[] }
const LINES: Line[] = [
  { alongZ: true, c: -60, a: -64, b: 116, crossings: [-60, 0, 60] },            // the avenue west of the gare, from the first corner to the shops' court
  { alongZ: false, c: -60, a: -60, b: -2, crossings: [-60, 0] },                // the first road, from the room to the avenue
  { alongZ: false, c: 60, a: -64, b: -4, crossings: [-60, 0] },                 // the road to the grand-place
];
const WALL_OFF = 7.12, CROSS_CLEAR = 8.6;
/** Blocks that are not rows of houses (their own frontage: the bank, the gare, the square, the shops, the Cité Jàmm). */
const NOT_HOUSES = [[0, 1], [0, 3], [1, 0], [1, 2], [1, 3]] as const;
const blockMin = (i: number) => -113 + i * 60;
const houseBlock = (x: number, z: number) => {
  for (const [i, j] of NOT_HOUSES) if (x > blockMin(i) - 3 && x < blockMin(i) + 49 && z > blockMin(j) - 3 && z < blockMin(j) + 49) return false;
  return true;
};

const SUN = [0xe0a24a, 0xc8654a, 0x5f9aa8, 0x8bb26e, 0xe4cf9a, 0xb86a8c, 0xd9d2bc];
const GATE = [0x2f7a4a, 0x2b5c9e, 0xa8402f, 0xc89a38, 0x5a3f8a];
/** The colours each trade paints itself in (walls, shutters, awnings, the goods on the shelf): no two shopfronts alike. */
const SHOP_TRAIT: Record<Trade, { walls: number[]; shutters: number[]; awnings: number[]; goods: number[] }> = {
  boutique: { walls: [0xe4cf9a, 0xd9d2bc, 0x8bb26e], shutters: [0x2f7a4a, 0xc89a38], awnings: [0xd7312f, 0x2f7a4a], goods: [0xe58a2f, 0xb8372b, 0xefe9da, 0xe8c24a, 0x6aa84f] },
  couture: { walls: [0xb86a8c, 0xc8654a, 0xe0a24a], shutters: [0x5a3f8a, 0xa8402f], awnings: [0x1f3d75, 0xf08a24], goods: [0x1f3d75, 0xf08a24, 0xd7312f, 0x7a2d8a] },
  quinc: { walls: [0x5f9aa8, 0xd9d2bc, 0x9a9a94], shutters: [0x2b5c9e, 0x5a5a5a], awnings: [0x2b5c9e, 0xa8402f], goods: [0xb0a58f, 0xc23a2a, 0x2b5c9e, 0xf2c230] },
  multiservice: { walls: [0xe4cf9a, 0xf1e7c6, 0xc89a38], shutters: [0xa8402f, 0x2b5c9e], awnings: [0xf2c230, 0xd7312f], goods: [0x222222, 0x2b5c9e, 0xefe9da] },
  cantine: { walls: [0xc8654a, 0xe0a24a, 0xd9d2bc], shutters: [0x5a3f8a, 0xa8402f], awnings: [0xc8654a, 0xf3ead4], goods: [0xbfc4c8, 0xb8372b, 0xe8c24a, 0x6aa84f] },
  pharmacie: { walls: [0xf1efe6, 0xd9d2bc], shutters: [0x2f7a4a], awnings: [0x2f7a4a, 0xf3ead4], goods: [0xefe9da, 0x2f7a4a, 0x5f9aa8] },
  coiffure: { walls: [0xb86a8c, 0x5f9aa8, 0x8bb26e], shutters: [0x5a3f8a, 0x2f7a4a], awnings: [0x7a2d8a, 0xf5cd2e], goods: [0xb86a8c, 0xefe9da, 0x5a3f8a] },
  cyber: { walls: [0x6a6e70, 0x5f9aa8, 0x2b5c9e], shutters: [0x2b2b2b], awnings: [0x2b5c9e, 0xf4d35e], goods: [0x7fd3ff, 0xefe9da] },
  supporters: { walls: [0xf1efe6, 0xe4cf9a, 0x8bb26e], shutters: [0x1a7a44, 0xc8322a], awnings: [0x1a7a44, 0xc8322a], goods: [0x1a7a44, 0xc8322a, 0xf4efe2, 0xf5cd2e] },   // the écuries' colours: Baobab green, Teranga red
};
const TRICOLOR = [0x1d8040, 0xf5cd2e, 0xd7312f];
const BUNTING = [0x1d8040, 0xf5cd2e, 0xd7312f, 0xf4efe2, 0x2b5c9e];

/** A painted board as placed: its metres, so a check can compare them with the cell it was painted in. */
export interface DnaSignUse { id: string; role: string; w: number; h: number; x: number; y: number; z: number; yaw: number }
export interface DnaItem { kind: string; x: number; z: number; solid: boolean; rect?: { x0: number; z0: number; x1: number; z1: number; h: number } }

type SliceOut = { mesh: THREE.Mesh | null; night: THREE.Mesh | null; items: DnaItem[]; signs: DnaSignUse[]; open: { x0: number; z0: number; x1: number; z1: number }[]; tris: number; byCat: Record<string, number> };

/** A stand-in atlas for the first pass of the layout: it paints nothing and only notes which boards the layout asks for. */
function stubAtlas(want: Set<string>): Atlas {
  const cell: Rect = [0, 0, 1, 1], any = new Proxy({}, { get: (_, id: string) => { want.add(id); return cell; } }) as Record<string, Rect>;
  return { tex: null as never, glow: null as never, mural: new Proxy({}, { get: () => cell }) as Atlas['mural'], sign: any, cells: {}, texts: [], w: 0, h: 0, white: cell, lit: cell };
}

/**
 * The slice is laid out twice with the same seeds: once on a stand-in atlas, to learn which boards it really uses (a name nobody sees costs no
 * atlas pixels), then for real on an atlas with a cell for each of them. The first pass leaves nothing behind (the colliders it claimed are dropped).
 */
export function dressPikineSlice(hub: HubWorld, q: keyof typeof DNA_COUNT): SliceOut {
  const want = new Set<string>(), n0 = hub.colliders.length;
  layoutSlice(hub, q, stubAtlas(want), true);
  hub.colliders.length = n0;
  return layoutSlice(hub, q, dressAtlas(want), false);
}

function layoutSlice(hub: HubWorld, q: keyof typeof DNA_COUNT, A: Atlas, dry: boolean): SliceOut {
  const O = DNA_COUNT[q], P = new Pieces(A.white, A.lit);
  let R = rng(0x9177a1);                                                          // the avenue's stream; the arena street swaps in a stream of its own, so nothing already placed moves
  const items: DnaItem[] = [];
  const uses: DnaSignUse[] = [];
  /** A painted board at its own proportions (the cell was cut for it). */
  const sign = (id: SignId, x: number, y: number, z: number, yaw: number, d = 0.06, role: string = id) => {
    const b = boardDim(id); P.board(b.w, b.h, d, x, y, z, A.sign[id], yaw); uses.push({ id, role, w: b.w, h: b.h, x, y, z, yaw });
  };
  /** The panel of a sign set flush on the front of a plain board (`bh` high, `bd` thick, its base at y), centred on it: the board's own colour is the sign's ground. */
  const panelOn = (id: SignId, x: number, y: number, z: number, yaw: number, bh: number, bd: number, role: string = id) => {
    const b = boardDim(id), n = bd / 2 + 0.02; sign(id, x + Math.sin(yaw) * n, y + (bh - b.h) / 2, z + Math.cos(yaw) * n, yaw, 0.04, role);
  };
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  /** Ground the slice keeps open whatever stands nearby: the arena gate's queue and apron, the stalls' customers, the fans' corners (src/arena/exteriorRules.ts). */
  const keepOpen: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const G = 0.12;
  const free = (r: { x0: number; z0: number; x1: number; z1: number }, pad = 0.05) =>
    !hub.colliders.some(c => r.x0 < c.x1 + pad && r.x1 > c.x0 - pad && r.z0 < c.z1 + pad && r.z1 > c.z0 - pad) && !taken.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0)
    && !keepOpen.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0);
  const clear = (x: number, z: number, d = 5) => !hub.interactables.some(i => Math.hypot(i.x - x, i.z - z) < d) && !hub.seats.some(s => Math.hypot(s.x - x, s.z - z) < 2.4)
    && !hub.rapides.some(o => Math.hypot(o.position.x - x, o.position.z - z) < 4.5) && Math.hypot(hub.spawn.x - x, hub.spawn.z - z) > 3.2;
  const claim = (r: { x0: number; z0: number; x1: number; z1: number }, h: number, kind: string, solid = true) => {
    taken.push(r); if (solid) hub.colliders.push({ ...r, h }); items.push({ kind, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, solid, rect: { ...r, h } });
  };
  const rectAt = (x: number, z: number, w: number, d: number) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  /** The frame of a line: the point `off` from the centre line on `side`, and the yaw that makes a +z face look at the road. */
  const at = (L: Line, along: number, off: number, side: 1 | -1) => L.alongZ ? { x: L.c + side * off, z: along } : { x: along, z: L.c + side * off };
  const yawOf = (L: Line, side: 1 | -1) => L.alongZ ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
  const rectOn = (L: Line, along: number, off: number, side: 1 | -1, len: number, th: number) => { const p = at(L, along, off, side); return L.alongZ ? rectAt(p.x, p.z, th, len) : rectAt(p.x, p.z, len, th); };
  const nearCrossing = (L: Line, t: number, pad = CROSS_CLEAR) => L.crossings.some(k => Math.abs(t - k) < pad);

  P.cat = 'walls';
  // ---- the street's edge: painted compound walls, house gates, boutiques and unfinished stretches, in clusters and gaps
  const muralOrder = [...MURALS.filter(m => m !== 'salon')];
  const keur: SignId[] = ['keur_mbaye', 'keur_sarr', 'keur_gueye'], shops: Trade[] = ['boutique', 'couture', 'quinc', 'multiservice', 'cantine', 'pharmacie', 'coiffure', 'cyber'];
  const namesOf = (t: Trade) => SHOP_NAMES.flatMap((n, i) => n.trade === t ? [shopSignId(i)] : []), nameUsed: Record<string, number> = {};
  let muralK = Math.floor(R() * 7), keurK = 0, shopK = Math.floor(R() * 8);
  const MURAL_H = 2.0;
  /** A narrow wall shows only the left part of a mural: one whose lettering ends before the cut, so no name is ever sliced. */
  const flankMural = (frac: number): MuralId => muralOrder.find(id => A.texts.filter(t => t.id === id).every(t => t.x1 <= frac * MW - 4)) ?? 'wax';
  type Unit = 'mural' | 'gate' | 'shop' | 'rough';
  /** What the ground and the night add in front of a unit: darker soil, a pool of warm light. */
  const soils: { x: number; z: number; w: number; d: number; rot: number }[] = [], spills: { x: number; z: number; w: number; d: number; rot: number }[] = [];
  const LIT = 0xfff0c4, DARKROOM = 0x3b2c1c;
  const CHAIRS = [0xf2f2ec, 0x2f6fb3, 0xd9322b, 0x1a9d54, 0xf4c20d];
  const WAX = [0x1f3d75, 0xf08a24, 0xd7312f, 0x2f7a4a, 0x7a2d8a, 0xf5cd2e];
  type Fwd = (d: number, a?: number) => { x: number; z: number };
  /** What each business keeps outside its door: the trade's own things, a few metres of the pavement's back strip (0.5 m deep, clear of the lanes). */
  const forecourt = (sg: Trade, f: Fwd, len: number, yaw: number) => {
    const bx = (w: number, h: number, dd: number, d: number, a: number, y: number, col: number, rot = 0) => { const q2 = f(d, a); P.box(w, h, dd, q2.x, G + y, q2.z, col, yaw + rot); };
    const cy = (r0: number, r1: number, h: number, d: number, a: number, y: number, col: number, seg = 7) => { const q2 = f(d, a); P.cyl(r0, r1, h, q2.x, G + y, q2.z, col, seg); };
    const stool = (d: number, a: number, col: number) => { cy(0.17, 0.2, 0.4, d, a, 0, col); };
    const chair = (d: number, a: number, col: number, rot = 0) => { bx(0.4, 0.04, 0.4, d, a, 0.42, col, rot); bx(0.4, 0.38, 0.04, d + 0.18, a, 0.46, col, rot); bx(0.3, 0.42, 0.3, d, a, 0, shade(col, 0.8), rot); };
    const lo = -len / 2 + 0.7, hi = len / 2 - 0.9;
    if (sg === 'boutique') {                                                       // sacks of rice, a strip of sachets hung across the door, a stool and a crate of bottles
      for (let k = 0; k < 3; k++) { bx(0.5, 0.5, 0.32, 0.5, lo + k * 0.5, 0, [0xe9dfc6, 0xd8c9a0, 0xcfb88e][k], k * 0.1); bx(0.16, 0.08, 0.16, 0.5, lo + k * 0.5, 0.5, 0xcfb88e); }
      for (let k = 0; k < 9; k++) bx(0.07, 0.2, 0.02, 0.32, -1.5 + k * 0.38, 1.5 + (k % 2) * 0.12, pick([0xd7312f, 0xf5cd2e, 0x2f7a4a, 0x2b5c9e, 0xf3ead4], R));
      stool(0.55, hi, 0x3a5fa0); bx(0.45, 0.3, 0.3, 0.55, hi + 0.5, 0, 0xc23a2a);
    } else if (sg === 'couture') {                                                 // a mannequin in wax print, cloths hung off the awning, a sewing machine on its table
      cy(0.03, 0.03, 0.9, 0.58, lo, 0, 0x777777, 5); cy(0.16, 0.12, 0.5, 0.58, lo, 0.9, pick(WAX, R), 7); cy(0.09, 0.09, 0.16, 0.58, lo, 1.4, 0x5a3a2a, 6);
      for (let k = 0; k < 4; k++) bx(0.44, 1.0, 0.02, 0.32, -0.9 + k * 0.6, 1.05, WAX[(k + 1) % WAX.length]);
      bx(0.6, 0.6, 0.38, 0.55, hi, 0, 0x6b4a2e); bx(0.3, 0.14, 0.2, 0.55, hi, 0.6, 0x222222); stool(0.55, hi + 0.7, 0xb8372b);
    } else if (sg === 'quinc') {                                                   // buckets, bags of cement, a ladder against the wall
      cy(0.2, 0.17, 0.3, 0.55, lo, 0, 0xc23a2a, 8); cy(0.2, 0.17, 0.3, 0.55, lo, 0.3, 0x2b5c9e, 8); cy(0.2, 0.17, 0.3, 0.55, lo + 0.45, 0, 0xf2c230, 8);
      for (let k = 0; k < 3; k++) bx(0.5, 0.12, 0.32, 0.55, hi, k * 0.12, 0xa9a59c, k * 0.15);
      for (const o of [-0.18, 0.18]) { const a0 = f(0.75, hi + 0.9 + o), a1 = f(0.15, hi + 0.9 + o); P.rod([a0.x, G, a0.z], [a1.x, G + 2.4, a1.z], 0.025, 0xb0a58f); }
    } else if (sg === 'multiservice') {                                            // a parasol over a table and two stools: credit sold at the kerb
      const q2 = f(0.6, lo + 0.3); P.cyl(0.03, 0.03, 2.1, q2.x, G, q2.z, 0x4a4a4a, 5); P.cyl(0.04, 1.1, 0.35, q2.x, G + 2.1, q2.z, 0xf2c230, 8);
      bx(0.7, 0.6, 0.45, 0.6, lo + 0.3, 0, 0x8a6a48); stool(0.6, lo - 0.45, 0x3a5fa0); stool(0.6, lo + 1.05, 0xd9322b);
    } else if (sg === 'cantine') {                                                 // a bench, a table with the pots, a brazier
      bx(1.3, 0.4, 0.35, 0.55, lo + 0.2, 0, 0x6b4a2e); bx(0.8, 0.7, 0.4, 0.55, hi - 0.2, 0, 0x8a6a48);
      for (let k = 0; k < 3; k++) cy(0.16, 0.15, 0.3, 0.55, hi - 0.45 + k * 0.32, 0.7, 0xbfc4c8, 8);
      cy(0.2, 0.17, 0.25, 0.6, hi + 0.7, 0, 0x2b2b2b, 8);
    } else if (sg === 'pharmacie') {                                               // the green cross, lit, on the roof edge; a bench for whoever waits
      const q2 = f(0.28, 0); P.litBox(0.7, 0.18, 0.1, q2.x, G + 3.85, q2.z, 0x2faa5a, yaw); P.litBox(0.18, 0.7, 0.1, q2.x, G + 3.59, q2.z, 0x2faa5a, yaw);
      bx(1.2, 0.4, 0.35, 0.55, lo + 0.2, 0, 0x6b4a2e); bx(0.4, 0.5, 0.3, 0.55, hi + 0.4, 0, 0xe9e4d8);
    } else if (sg === 'coiffure') {                                                // a barber's chair in the doorway and a mirror on the wall
      bx(0.45, 0.42, 0.45, 0.6, lo, 0, 0x2b4f86); bx(0.45, 0.55, 0.08, 0.78, lo, 0.42, 0x2b4f86); bx(0.3, 0.08, 0.3, 0.45, lo, 0.1, 0x555555);
      const m = f(0.3, lo); P.litBox(0.55, 0.8, 0.04, m.x, G + 1.0, m.z, 0xcfe4f0, yaw); chair(0.55, hi, pick(CHAIRS, R));
    } else if (sg === 'supporters') {                                              // a rail of jerseys in the écuries' colours, a crate of scarves, a flag on a pole, a stool
      for (const a of [lo - 0.2, lo + 1.7]) cy(0.03, 0.03, 1.9, 0.55, a, 0, 0x5a4a3a, 5);
      bx(1.95, 0.05, 0.05, 0.55, lo + 0.75, 1.85, 0x5a4a3a);
      for (let k = 0; k < 5; k++) bx(0.3, 0.55, 0.03, 0.55, lo - 0.05 + k * 0.38, 1.1, [0x1a7a44, 0xf4efe2, 0xc8322a, 0xf5cd2e, 0x1a7a44][k]);
      bx(0.55, 0.35, 0.35, 0.55, hi, 0, 0x8b6a47); bx(0.5, 0.1, 0.3, 0.55, hi, 0.35, 0xc8322a);
      cy(0.03, 0.03, 3.1, 0.6, hi + 0.8, 0, 0x4a4a4a, 5); bx(0.55, 0.34, 0.02, 0.6, hi + 0.8, 2.75, 0x1a7a44);
      stool(0.6, hi - 0.7, 0xc8322a);
    } else {                                                                       // the cyber café: three screens in the window, a plastic chair
      for (let k = -1; k <= 1; k++) { const m = f(0.32, k * 1.0); P.litBox(0.5, 0.32, 0.05, m.x, G + 1.1, m.z, 0x7fd3ff, yaw); }
      chair(0.55, hi, pick(CHAIRS, R)); chair(0.55, lo, pick(CHAIRS, R), 0.3);
    }
  };
  /** A unit of the street's edge centred `mid` along the line; false when something stands there. */
  const unit = (L: Line, side: 1 | -1, mid: number, len: number, kind: Unit, frac = 1, pickOf: { mural?: MuralId; trade?: Trade; name?: number } = {}): boolean => {
    const r = rectOn(L, mid, WALL_OFF, side, len, 0.6), c = at(L, mid, WALL_OFF, side), yaw = yawOf(L, side);
    if (!free(r) || !clear(c.x, c.z, 3)) return false;
    const fwd = (d: number, a = 0) => at(L, mid + a, WALL_OFF - d, side);                          // a point `d` in front of the wall, `a` along it
    const ground = (w: number, d: number) => { const f = fwd(1.3); soils.push({ x: f.x, z: f.z, w, d, rot: L.alongZ ? Math.PI / 2 : 0 }); const sp = fwd(1.6); spills.push({ x: sp.x, z: sp.z, w: w * 1.35, d: d * 3.0, rot: L.alongZ ? Math.PI / 2 : 0 }); };
    if (kind === 'gate') {
      const leaf = pick(GATE, R), nm = keur[keurK++ % keur.length], cap = 0xe9dfc6;
      for (const sg of [-1, 1]) { const e = fwd(0, sg * 2.1); P.box(0.55, 2.7, 0.5, e.x, G, e.z, cap, yaw); P.box(0.7, 0.14, 0.64, e.x, G + 2.7, e.z, 0x9a9183, yaw); }
      P.box(3.5, 2.15, 0.1, c.x, G, c.z, leaf, yaw);                                                      // the double leaf, with its ribs
      for (let k = -3; k <= 3; k++) { const rib = fwd(0.07, k * 0.5); P.box(0.07, 2.0, 0.04, rib.x, G + 0.05, rib.z, 0x2a2420, yaw); }
      const bar = fwd(0.07); P.box(3.5, 0.08, 0.06, bar.x, G + 1.1, bar.z, 0x2a2420, yaw);
      const lin = fwd(0.02); sign(nm, lin.x, G + 2.28, lin.z, yaw, 0.1, 'nameplate');            // the name plate over the door
      const bulb = fwd(0.1, 1.15); P.litBox(0.22, 0.14, 0.22, bulb.x, G + 2.62, bulb.z, LIT, yaw);          // the lamp over the door
      for (const sg of [-1, 1]) { const w = fwd(0, sg * 2.6); P.box(0.8, 0.9, 0.3, w.x, G, w.z, shade(SUN[Math.floor(R() * SUN.length)], 0.9), yaw); }   // the wall goes on, low
      ground(3.2, 1.0);
      claim(r, 2.8, 'gate');
    } else if (kind === 'mural') {
      const id = pickOf.mural ?? (frac < 1 ? flankMural(frac) : muralOrder[muralK++ % muralOrder.length]), rect: Rect = [A.mural[id][0], A.mural[id][1], A.mural[id][0] + (A.mural[id][2] - A.mural[id][0]) * frac, A.mural[id][3]];
      P.board(len, MURAL_H, 0.16, c.x, G, c.z, rect, yaw);                                                    // 2 m: the mural's own proportions (512 : 192)
      P.box(len + 0.1, 0.18, 0.24, c.x, G + MURAL_H, c.z, 0xcfc6b0, yaw);                                    // the coping
      P.box(len + 0.04, 0.22, 0.2, c.x, G, c.z, 0x6e6252, yaw);                                           // the dirt band at the foot
      const dust = fwd(0.5, (R() - 0.5) * len * 0.6); soils.push({ x: dust.x, z: dust.z, w: len * 0.8, d: 0.7, rot: L.alongZ ? Math.PI / 2 : 0 });
      claim(r, 2.2, 'mural');
    } else if (kind === 'rough') {
      // an unfinished stretch: raw breeze blocks with the top course missing in places, rebar waiting for the next floor, one end painted
      const h = 1.3 + R() * 0.6, raw = 0xb3ab9c, n = Math.max(2, Math.round(len / 1.4));
      for (let k = 0; k < n; k++) { const a = fwd(0, (k + 0.5) * len / n - len / 2), hh = h - (R() < 0.4 ? 0.45 : 0); P.box(len / n + 0.02, hh, 0.26, a.x, G, a.z, k % 2 ? raw : shade(raw, 0.93), yaw); }
      for (const e of [-1, 1]) { const a = fwd(0, e * (len / 2 - 0.15)); for (let k = 0; k < 3; k++) P.box(0.04, 0.9 + R() * 0.5, 0.04, a.x + (k - 1) * 0.07, G + h, a.z, 0x5c4e3f, yaw); }
      const pb = fwd(0.15, -len / 2 + len * 0.16); P.box(len * 0.32, 0.8, 0.05, pb.x, G, pb.z, pick(SUN, R), yaw);        // the part someone painted
      claim(r, h, 'rough');
    } else {
      // a boutique built into the wall, each its own: a painted front in the trade's colours, the shutter half up on a lit shop, goods that
      // are the trade's goods, a fascia, an awning of its own kind, and a forecourt of what that business keeps outside
      P.cat = 'shops';
      const sg = pickOf.trade ?? shops[shopK++ % shops.length], names = namesOf(sg), sid = names[pickOf.name ?? ((nameUsed[sg] = (nameUsed[sg] ?? -1) + 1) % names.length)], tr = SHOP_TRAIT[sg], body = pick(tr.walls, R), shut = pick(tr.shutters, R), style = Math.floor(R() * 3);
      P.box(len, 2.9, 0.56, c.x, G, c.z, body, yaw);
      for (const e of [-1, 1]) { const q2 = fwd(0.29, e * (len / 2 - 0.2)); P.box(0.4, 2.6, 0.08, q2.x, G, q2.z, shade(body, 0.8), yaw); }
      const door = fwd(0.29); P.litBox(3.2, 1.95, 0.05, door.x, G, door.z, DARKROOM, yaw);                  // the shop inside: dark by day, warm at night
      const roll = fwd(0.34); P.box(3.4, 0.4, 0.2, roll.x, G + 1.95, roll.z, shut, yaw);                    // the shutter, rolled up
      for (let k = 0; k < 3; k++) { const sl = fwd(0.4); P.box(3.3, 0.06, 0.05, sl.x, G + 1.62 + k * 0.1, sl.z, shade(shut, 0.7), yaw); }
      const shelf = fwd(0.42); P.box(3.1, 0.1, 0.46, shelf.x, G + 0.92, shelf.z, 0x6b4a2e, yaw);
      for (let k = 0; k < 5; k++) { const g2 = fwd(0.4, -1.2 + k * 0.6); P.box(0.34, 0.24 + (k % 3) * 0.07, 0.28, g2.x, G + 1.02, g2.z, pick(tr.goods, R), yaw); }
      const fas = fwd(0.31); sign(sid, fas.x, G + 2.55, fas.z, yaw, 0.1, 'fascia');                           // above the awning (2.15–2.4 m), so all its lines read; the board stands a little over the shop's roof edge, like a signboard       // the fascia
      for (const e of [-1, 1]) { const bl = fwd(0.5, e * (len / 2 - 0.5)); P.litBox(0.24, 0.12, 0.24, bl.x, G + 2.02, bl.z, LIT, yaw); }   // a bulb at each end of the awning
      if (style === 0) { const stripe = [pick(tr.awnings, R), 0xf3ead4]; for (let k = 0; k < 4; k++) { const aw = fwd(0.8, (k - 1.5) * (len - 0.4) / 4); P.slab((len - 0.4) / 4, 0.05, 1.1, aw.x, G + 2.15, aw.z, stripe[k % 2], yaw, 0.32); } }   // striped canvas
      else if (style === 1) { const aw = fwd(0.8); P.slab(len - 0.3, 0.04, 1.15, aw.x, G + 2.2, aw.z, pick(tr.awnings, R), yaw, 0.22); }                                          // a plain tarpaulin
      else { const aw = fwd(0.75); P.slab(len - 0.2, 0.05, 0.9, aw.x, G + 2.25, aw.z, 0x8f8a80, yaw, 0.15); const lip = fwd(1.2); P.box(len - 0.2, 0.12, 0.04, lip.x, G + 2.1, lip.z, 0x6e6a60, yaw); }   // a tin visor
      const board = fwd(0.6, len / 2 - 0.45); P.box(0.46, 0.6, 0.05, board.x, G, board.z, 0x2f3b34, yaw + 0.25);   // the chalkboard with today's prices
      for (const yy of [0.42, 0.32, 0.22]) P.box(0.3, 0.025, 0.06, board.x, G + yy, board.z, 0xf3ead4, yaw + 0.25);
      const fr = rectOn(L, mid, 6.5, side, len * 0.8, 0.5);
      if (O.props && free(fr)) { forecourt(sg, fwd, len, yaw); claim(fr, 1.0, 'forecourt'); }
      P.cat = 'walls';
      ground(len, 1.5);
      claim(r, 2.9, 'shop');
    }
    return true;
  };
  // each line side is a run of clusters (three to five units, almost touching), gaps (an empty yard, a lot) and, now and then,
  // an unfinished stretch: the street is irregular, and the named shops and the murals carry the identity, not the number of walls
  for (const L of LINES) for (const side of [1, -1] as const) {
    const open = L === LINES[1] && side === -1;                            // the Cité Jàmm side: only where nothing of the estate stands
    let t = L.a + 2 + R() * 7, mode: 'cluster' | 'gap' | 'rough' = R() < 0.5 ? 'cluster' : 'gap';
    while (t < L.b - 8) {
      if (nearCrossing(L, t, CROSS_CLEAR)) { t += 1; continue; }
      const p = at(L, t, WALL_OFF, side);
      if (!open && !houseBlock(p.x + (L.alongZ ? side * 4 : 0), p.z + (L.alongZ ? 0 : side * 4))) { t += 2; continue; }
      if (mode === 'gap') { t += 6 + R() * 11; mode = R() < 0.35 ? 'rough' : 'cluster'; continue; }
      if (mode === 'rough') { const len = 3 + R() * 3.5; unit(L, side, t + len / 2, len, 'rough'); t += len + 1 + R() * 2; mode = 'cluster'; continue; }
      let placed = 0, gates = 0, murals = 0, last: Unit | null = null;
      const want = 3 + Math.floor(R() * 3);
      for (let tries = 0; placed < want && tries < want * 3 && t < L.b - 8; tries++) {
        if (nearCrossing(L, t, CROSS_CLEAR)) break;
        const roll = R(), kind: Unit = placed === want - 1 && murals === 0 ? 'mural' : roll < 0.08 && gates < 1 && last !== 'gate' ? 'gate' : roll < 0.52 ? 'shop' : 'mural';   // every cluster has a mural; gates are the rarest piece
        const len = kind === 'gate' ? 4.8 : kind === 'shop' ? 5.0 : 5.4, mid = t + len / 2;
        if (nearCrossing(L, mid, CROSS_CLEAR + len / 2 - 0.3)) { t += 1; continue; }
        if (!unit(L, side, mid, len, kind)) { t += 1.5; continue; }
        placed++; last = kind; if (kind === 'gate') gates++; if (kind === 'mural') murals++;
        t = mid + len / 2 + 0.15 + R() * 0.9;
      }
      mode = 'gap';
    }
  }
  // the room's flanks: a narrower painted wall on each side of the home on the first road
  for (const a of [-50.3, -33.4]) unit(LINES[1], 1, a, 3.6, 'mural', 0.66);

  // ---- the ARENA STREET: the road z = −60 east of the junction at x = 0, up to the gate's parvis and past it. The gate's own world (the queue, the
  // stalls, the guarded moto lot, the fans' corners) belongs to src/arena: the slice keeps clear of it and dresses what the street was missing
  // around it: the approach (a gateway, paint on the ground, a pole line), the frontage on the yard side, the shops a fight evening needs.
  // Its own random stream: nothing placed above moves.
  const AR = hub.arena, gate = AR ? gateOf(AR) : null;
  const LA: Line | null = AR ? { alongZ: false, c: -60, a: 2, b: 60, crossings: [0, 60] } : null;
  const LINES_ALL: Line[] = LA ? [...LINES, LA] : LINES;
  if (AR && gate && LA) {
    const q = gate.queue;
    keepOpen.push({ x0: q.x - q.half - 4, x1: q.x + q.half + 4, z0: q.z1 - 4, z1: q.z0 + 4 });                      // the queue lane and the 4 m margin its checks keep
    for (const r of gatePlaza(AR).slice(1)) keepOpen.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });               // the apron from the pavement up to the gate
    for (const s of stallFronts(AR)) keepOpen.push({ x0: s.x - 1.8, x1: s.x + 1.8, z0: s.z - 1.8, z1: s.z + 1.8 }); // where the stalls' last customers stand
    for (const e of streetEnds(gate)) keepOpen.push({ x0: e.x - 3, x1: e.x + 3, z0: e.z - 3, z1: e.z + 3 });        // the pavement corners the fans come from and go to
    // the street's gateway, at its west end: pylons painted in the écuries' colours, a beam above the camera's reach, the street's name on both faces
    P.cat = 'landmarks';
    const x = 13.2, zs = [-67.12, -52.88];                                   // past the fans' pavement corner (x = 6.5, kept open)
    if (zs.every(z => free(rectAt(x, z, 1.2, 1.2)) && clear(x, z, 1.5))) {
      for (const z of zs) { P.box(1.1, 7.5, 1.1, x, G, z, 0xf3ead4); [0x1a7a44, 0xf4efe2, 0xc8322a].forEach((col, k) => P.box(1.13, 0.6, 1.13, x, G + 3.4 + k * 0.6, z, col)); P.box(1.3, 0.2, 1.3, x, G + 7.5, z, 0x8a8174); claim(rectAt(x, z, 1.2, 1.2), 7.7, 'gateway'); }
      P.box(0.3, 1.2, 15.6, x, G + 6.15, -60, 0x1a5c36);                                       // over the road, so its underside clears the camera's band (≤ 6.2 m)
      panelOn('arene', x, G + 6.15, -60, -Math.PI / 2, 1.2, 0.3); panelOn('arene', x, G + 6.15, -60, Math.PI / 2, 1.2, 0.3);
      spills.push({ x, z: -60, w: 5, d: 14, rot: 0 });
    }
    P.cat = 'walls';
    const R0 = R; R = rng(0xa7e4a1);
    const put = (side: 1 | -1, mids: number[], len: number, kind: Unit, pickOf: { mural?: MuralId; trade?: Trade; name?: number }) => mids.some(m => unit(LA, side, m, len, kind, 1, pickOf));
    put(-1, [16.8, 17.6, 18.4], 5.4, 'mural', { mural: 'lutteur' });                  // the wrestler: the yard side of the street says what the street is for
    put(1, [40.7, 40.3, 41.1], 5.0, 'shop', { trade: 'supporters', name: 0 });        // LÀMB SHOP, facing the parvis: jerseys, scarves, flags
    put(-1, [41.4, 42.2, 43.0], 5.0, 'shop', { trade: 'cantine', name: 1 });          // Chez Tante Yacine: dibi and mafé for after the bout
    put(-1, [47.2, 46.4, 48.0], 5.4, 'mural', { mural: 'lions' });
    put(1, [16.6, 17.4, 18.2], 5.0, 'shop', { trade: 'coiffure', name: 1 });          // Barber Moustapha: a cut before the evening
    R = R0;
  }

  // ---- the pavement's own life: where no unit stands, someone has put a few chairs, a tea, a tray, some sacks, a bench, a washing line against the wall
  // (the back strip only, 6.25–6.75 m from the centre line: clear of the carriageway and of the crowd's lanes; solid, small, and never in a doorway)
  if (O.props) {
    P.cat = 'life';
    const pt = (L: Line, side: 1 | -1, a: number, d: number) => at(L, a, WALL_OFF - d, side), yawL = (L: Line, side: 1 | -1) => yawOf(L, side);
    const seat = (x: number, z: number, yaw: number, col: number) => { P.box(0.4, 0.04, 0.4, x, G + 0.42, z, col, yaw); P.box(0.4, 0.38, 0.04, x - Math.sin(yaw) * 0.18, G + 0.46, z - Math.cos(yaw) * 0.18, col, yaw); P.box(0.3, 0.42, 0.3, x, G, z, shade(col, 0.8), yaw); };
    const kinds = ['tontine', 'tea', 'tray', 'sacks', 'bench', 'laundry', 'parasol', 'parasol'] as const;
    let last = -99, count = 0;
    type Kind = typeof kinds[number] | 'jerseys' | 'grill';
    /** One cluster of the pavement's life at `t` along `side` of `L`; false when something stands there. */
    const cluster = (L: Line, side: 1 | -1, t: number, kind: Kind): boolean => {
      const len = kind === 'laundry' ? 3.8 : kind === 'tontine' ? 1.9 : kind === 'jerseys' ? 2.2 : kind === 'grill' ? 2.6 : 1.5;
      const r = rectOn(L, t, 6.5, side, len, kind === 'laundry' ? 0.3 : 0.55), c = at(L, t, 6.5, side), yaw = yawL(L, side);
      if (!free(r) || !clear(c.x, c.z, 2.5)) return false;
      const f = (d: number, a: number) => pt(L, side, t + a, d);
      if (kind === 'tontine') {                                                  // three plastic chairs round a low table: the neighbours' evening
        for (let k = -1; k <= 1; k++) { const q2 = f(0.55, k * 0.65); seat(q2.x, q2.z, yaw + (k * 0.25), CHAIRS[Math.floor(R() * CHAIRS.length)]); }
        const q2 = f(0.5, 0); P.cyl(0.25, 0.25, 0.04, q2.x, G + 0.45, q2.z, 0xe9e4d8, 8); P.cyl(0.04, 0.04, 0.45, q2.x, G, q2.z, 0x555555, 5);
      } else if (kind === 'tea') {                                               // attaya: a brazier and its kettles, a tray of glasses, two stools, a sack of charcoal
        const b = f(0.55, -0.2); P.cyl(0.2, 0.17, 0.25, b.x, G, b.z, 0x2b2b2b, 7); P.cyl(0.1, 0.13, 0.2, b.x, G + 0.25, b.z, 0xc9c9c9, 7);
        const tr = f(0.5, 0.35); P.box(0.5, 0.05, 0.35, tr.x, G + 0.38, tr.z, 0xb0a58f, yaw); for (let k = 0; k < 4; k++) P.cyl(0.03, 0.03, 0.07, tr.x - 0.15 + k * 0.1, G + 0.43, tr.z, 0xe8e2d0, 5);
        for (const a of [-0.65, 0.8]) { const q2 = f(0.6, a); P.cyl(0.17, 0.2, 0.38, q2.x, G, q2.z, a < 0 ? 0xd9322b : 0x2f6fb3, 7); }
        const sk = f(0.45, -0.7); P.box(0.4, 0.5, 0.25, sk.x, G, sk.z, 0x3a3a3a, yaw + 0.2);
      } else if (kind === 'tray') {                                              // a girl's tray of fruit on a stool
        const q2 = f(0.55, 0); P.cyl(0.17, 0.2, 0.4, q2.x, G, q2.z, 0x3a5fa0, 7); P.box(0.6, 0.05, 0.42, q2.x, G + 0.4, q2.z, 0xe9e4d8, yaw);
        for (let k = 0; k < 6; k++) P.box(0.12, 0.1, 0.12, q2.x - 0.2 + (k % 3) * 0.2, G + 0.45 + Math.floor(k / 3) * 0.1, q2.z + (k % 2) * 0.08, k % 2 ? 0xe58a2f : 0xe8c24a, yaw);
      } else if (kind === 'sacks') {                                             // charcoal and grain, a crate
        for (let k = 0; k < 4; k++) { const q2 = f(0.5, -0.5 + (k % 2) * 0.5); P.box(0.5, 0.5, 0.32, q2.x, G + Math.floor(k / 2) * 0.5, q2.z, k % 2 ? 0xd8c9a0 : 0x3a3a3a, yaw + k * 0.15); }
        const q2 = f(0.5, 0.55); P.box(0.45, 0.3, 0.3, q2.x, G, q2.z, 0x8b6a47, yaw);
      } else if (kind === 'bench') {                                             // a plank bench on two blocks, a bucket
        const q2 = f(0.5, 0); P.box(1.4, 0.06, 0.35, q2.x, G + 0.38, q2.z, 0x6b4a2e, yaw); for (const a of [-0.55, 0.55]) { const l = f(0.5, a); P.box(0.12, 0.38, 0.3, l.x, G, l.z, 0xa59c8c, yaw); }
        const bk = f(0.5, 0.95); P.cyl(0.17, 0.14, 0.3, bk.x, G, bk.z, 0x2b5c9e, 8);
      } else if (kind === 'parasol') {                                           // a vendor's parasol: a tall coloured cone over a table of small goods, the silhouette that calls from the end of the street
        const q2 = f(0.55, 0), col = [0xd9482b, 0x1e6fd9, 0xf4c20d, 0x2f8f4e, 0xe895ac][Math.floor(R() * 5)];
        P.cyl(0.03, 0.03, 2.2, q2.x, G, q2.z, 0x4a4a4a, 5); P.cyl(0.05, 1.15, 0.4, q2.x, G + 2.1, q2.z, col, 8);
        P.box(0.9, 0.7, 0.45, q2.x, G, q2.z, 0x8a6a48, yaw); for (let k = 0; k < 4; k++) P.box(0.2, 0.18, 0.2, q2.x - 0.3 + k * 0.2, G + 0.7, q2.z, pick([0xe58a2f, 0xb8372b, 0x6aa84f, 0xe8c24a], R), yaw);
        const st = f(0.55, 0.8); P.cyl(0.17, 0.2, 0.38, st.x, G, st.z, 0x3a5fa0, 7);
      } else if (kind === 'jerseys') {                                           // by the arena: a rail of jerseys in the écuries' colours, a crate of scarves, a stool
        for (const a of [-0.95, 0.95]) { const q2 = f(0.5, a); P.cyl(0.03, 0.03, 1.9, q2.x, G, q2.z, 0x5a4a3a, 5); }
        const rail = f(0.5, 0); P.box(1.9, 0.05, 0.05, rail.x, G + 1.85, rail.z, 0x5a4a3a, yaw);
        for (let k = 0; k < 5; k++) { const q2 = f(0.5, -0.76 + k * 0.38); P.box(0.3, 0.55, 0.03, q2.x, G + 1.1, q2.z, [0x1a7a44, 0xf4efe2, 0xc8322a, 0xf5cd2e, 0x1a7a44][k], yaw); }
        const cr = f(0.5, 0.3), st = f(0.62, -0.3); P.box(0.5, 0.3, 0.32, cr.x, G, cr.z, 0x8b6a47, yaw); P.box(0.45, 0.08, 0.28, cr.x, G + 0.3, cr.z, 0xc8322a, yaw); P.cyl(0.17, 0.2, 0.38, st.x, G, st.z, 0x3a5fa0, 7);
      } else if (kind === 'grill') {                                             // dibi on the kerb: half an oil drum on legs with its grate, skewers and a heap of charcoal, a chopping table, a stool
        const gr = f(0.55, -0.35); P.box(0.9, 0.5, 0.45, gr.x, G + 0.3, gr.z, 0x2b2b2b, yaw); P.box(0.94, 0.04, 0.5, gr.x, G + 0.8, gr.z, 0x4a4a4a, yaw);
        for (const a of [-0.38, 0.38]) { const q2 = f(0.45, -0.35 + a); P.box(0.06, 0.3, 0.06, q2.x, G, q2.z, 0x2b2b2b, yaw); }
        for (let k = 0; k < 6; k++) { const q2 = f(0.55, -0.35 - 0.36 + k * 0.145); P.box(0.1, 0.06, 0.3, q2.x, G + 0.84, q2.z, k % 2 ? 0x8a4b2a : 0x9a5a34, yaw); }
        const tb = f(0.55, 0.65); P.box(0.8, 0.7, 0.4, tb.x, G, tb.z, 0x8a6a48, yaw); P.box(0.3, 0.06, 0.25, tb.x, G + 0.7, tb.z, 0xe8e2d0, yaw);
        const sk = f(0.6, 1.25); P.cyl(0.17, 0.2, 0.38, sk.x, G, sk.z, 0xd9322b, 7);
      } else {                                                                   // the washing: a line between two stakes, five cloths
        const a0 = f(0.45, -1.8), a1 = f(0.45, 1.8);
        for (const q2 of [a0, a1]) P.cyl(0.04, 0.05, 2.5, q2.x, G, q2.z, 0x6b5a4a, 5);
        P.wire([a0.x, G + 2.35, a0.z], [a1.x, G + 2.35, a1.z], 0.12, 0x555555, 0.012);
        for (let k = 0; k < 5; k++) { const q2 = f(0.45, -1.4 + k * 0.7); P.box(0.4, 0.6, 0.02, q2.x, G + 1.72, q2.z, WAX[(k + 2) % WAX.length], yaw + (L.alongZ ? Math.PI / 2 : 0)); }
        claim(rectAt(a0.x, a0.z, 0.25, 0.25), 2.5, 'laundry'); claim(rectAt(a1.x, a1.z, 0.25, 0.25), 2.5, 'laundry'); return true;
      }

      claim(r, 0.9, kind); return true;
    };
    for (const L of LINES) for (const side of [1, -1] as const) {
      last = -99;
      for (let t = L.a + 6 + R() * 4; t < L.b - 6 && count < 26; t += 3.5 + R() * 5) {
        if (nearCrossing(L, t, 9) || t - last < 5.5) continue;
        const p = at(L, t, WALL_OFF, side), gareEdge = L === LINES[0] && side === 1 && ((t > 9 && t < 23) || (t > 38 && t < 51));
        if (!gareEdge && !houseBlock(p.x + (L.alongZ ? side * 4 : 0), p.z + (L.alongZ ? 0 : side * 4))) continue;
        const kind = kinds[Math.floor(R() * kinds.length)];
        if (!cluster(L, side, t, kind)) continue;
        last = t; count++;
      }
    }
    if (LA) {                                                                      // by the arena: dibi on the kerb, jerseys on a rail, tea and chairs for whoever waits for the evening
      const R1 = R; R = rng(0xa7e4a2);
      // the gaps the gate's own ground leaves (its queue, apron and stalls are kept open): each is tried at its place, then a little either side
      const wants: [1 | -1, number, Kind][] = [[1, 20.4, 'jerseys'], [-1, 21.6, 'tea'], [-1, 37.6, 'grill'], [1, 45.6, 'grill'], [1, 50.0, 'jerseys'], [-1, 52.4, 'tontine']];
      for (const [side, t0, kind] of wants) for (const d of [0, 0.8, -0.8, 1.6, -1.6]) if (!nearCrossing(LA, t0 + d, 8.2) && cluster(LA, side, t0 + d, kind)) break;
      R = R1;
    }
  }

  P.cat = 'landmarks';
  // ---- landmarks
  // the baobab at the first corner: a girth no tree of the hub has, stubby limbs, a sparse crown (at a corner of the first crossing, inside the yard behind the kerb, never on the roadway)
  {
    const spot = ([[-70.5, -70.5], [-50.5, -49.5], [-70.5, -49.5], [-50.5, -70.5]] as const).find(([x, z]) => free(rectAt(x, z, 2.4, 2.4)) && clear(x, z, 3));
    if (spot) {
      const [x, z] = spot;
      P.cyl(1.0, 1.4, 4.3, x, G, z, 0x8a7b68, 10); P.cyl(1.25, 1.5, 0.6, x, G, z, 0x7a6b58, 10);
      for (const [a, len, tilt] of [[0.2, 2.4, 0.9], [1.5, 2.8, 1.0], [2.6, 2.5, 0.85], [3.8, 2.7, 1.0], [5.0, 2.3, 0.9]] as const) {
        const ex = x + Math.sin(a) * len * 0.8, ez = z + Math.cos(a) * len * 0.8;
        P.rod([x, G + 3.7, z], [ex, G + 3.7 + len * tilt * 0.55, ez], 0.22, 0x877764);
        for (let k = 0; k < 3; k++) P.blob(0.9 + k * 0.1, ex + Math.sin(a + k) * 0.8, G + 3.7 + len * tilt * 0.55 + 0.5 + k * 0.2, ez + Math.cos(a + k) * 0.8, k % 2 ? 0x4f7a3a : 0x5c8a42, 0.7);
      }
      claim(rectAt(x, z, 2.4, 2.4), 4.3, 'baobab');
    }
  }
  // Heights: the phone's follow camera rides 5.1 m up (10.5 m behind the player), so nothing of the slice hangs between 4.2 and 5.9 m over a
  // road or an entrance the player walks through (a board there is in the lens, or between the lens and the player): span boards and bunting
  // go above 5.9 m, and what hangs lower stands to the side, off the road (scripts/check-pikine-camera.mjs measures it).
  // the gare's portal over its west entrance: two painted pylons, a board along the kerb line, blade signs on the yard side
  {
    const x = -53.4, z0 = 25.2, z1 = 35.2;                                      // on the kerb line of the block, clear of the crowd's pavement lanes
    for (const z of [z0, z1]) { P.box(0.9, 6.6, 0.9, x, G, z, 0xf3ead4); for (let k = 0; k < 3; k++) P.box(0.93, 0.5, 0.93, x, G + 3.4 + k * 0.5, z, TRICOLOR[k]); P.box(1.1, 0.16, 1.1, x, G + 6.6, z, 0x8a8174); claim(rectAt(x, z, 1.0, 1.0), 6.6, 'portal'); }
    const zc = (z0 + z1) / 2;
    P.box(0.3, 0.3, 10.2, x, G + 3.7, zc, 0x1e3a8a);                                                        // the beam
    P.box(0.08, 1.9, 9.4, x - 0.2, G + 3.95, zc, 0x1e3a8a); panelOn('gare', x - 0.2, G + 3.95, zc, -Math.PI / 2, 1.9, 0.08);   // its board, towards the avenue
    P.box(0.08, 1.9, 9.4, x + 0.2, G + 3.95, zc, 0x1e3a8a); panelOn('gare', x + 0.2, G + 3.95, zc, Math.PI / 2, 1.9, 0.08);    // and towards the yard
    for (const [z, yaw] of [[z0, Math.PI], [z1, 0]] as const) sign('gare_blade', x + 1.0, G + 5.9, z + (yaw ? -0.55 : 0.55), yaw, 0.08, 'blade');   // blade signs, for whoever walks the avenue: on the yard side, high
    if (O.bunting) P.bunting([x, G + 6.5, z0], [x + 9, G + 6.6, z0 - 3], 0.5, BUNTING);
  }
  // the grand-place's gateway on its north side: tall pylons and the board above the camera's reach
  {
    const z = 67.4, xs = [-39, -21];
    for (const x of xs) { P.box(1.1, 7.0, 1.1, x, G, z, 0xf3ead4); for (let k = 0; k < 3; k++) P.box(1.13, 0.6, 1.13, x, G + 3.2 + k * 0.6, z, TRICOLOR[k]); P.box(1.3, 0.2, 1.3, x, G + 7.0, z, 0x8a8174); claim(rectAt(x, z, 1.2, 1.2), 7.2, 'gateway'); }
    P.box(17.4, 1.2, 0.2, -30, G + 5.95, z, 0x1d6b3c);                                                      // the beam, in the sign's green
    panelOn('place', -30, G + 5.95, z, Math.PI, 1.2, 0.2); panelOn('place', -30, G + 5.95, z, 0, 1.2, 0.2);  // the name, on both faces
  }
  // the shops' court: its market gateway on the avenue, and Salon Awa's painted flank (the court's first sight)
  {
    const x = -66.7, zs = [86.4, 97.6];
    for (const z of zs) { P.box(0.9, 7.0, 0.9, x, G, z, 0xf3ead4); P.box(0.93, 0.6, 0.93, x, G + 3.0, z, 0xd7312f); P.box(0.93, 0.6, 0.93, x, G + 3.6, z, 0xf5cd2e); P.box(1.1, 0.16, 1.1, x, G + 7.0, z, 0x8a8174); claim(rectAt(x, z, 1.0, 1.0), 7.2, 'gateway'); }
    const zc = (zs[0] + zs[1]) / 2;
    P.box(0.26, 0.26, 12.0, x, G + 5.85, zc, 0xb85a1f);
    P.box(0.3, 1.1, 11.8, x, G + 6.0, zc, 0xb85a1f);                                                        // the beam board
    panelOn('marche', x, G + 6.0, zc, -Math.PI / 2, 1.1, 0.3); panelOn('marche', x, G + 6.0, zc, Math.PI / 2, 1.1, 0.3);   // towards the avenue and towards the court
    // Salon Awa's east flank (the shop's 0.25 m wall at x = -70.5, z 76…84): a mural board in front of it, and the gate sign
    const fx = -70.5 + 0.2, fz = 80;
    if (clear(fx, fz, 1)) { P.board(7.2, 2.7, 0.05, fx, G + 0.4, fz, A.mural.salon, Math.PI / 2, 0xffffff); }
    // the shops' own fronts: a painted apron of tiles and a price board each, in the court (decor only, off the shops' aisles)
    for (const [sx, name] of [[-101, 'boutique'], [-79, 'salon']] as const) {
      for (let k = 0; k < 8; k++) P.flat(1.9, 1.9, sx - 7 + k * 2, 0.095, 86.2, k % 2 ? 0xe8d9b8 : 0xc9a46a);
      items.push({ kind: `apron:${name}`, x: sx, z: 86.2, solid: false });
    }
  }
  P.cat = 'props';
  // the avenue's pavement furniture: a standpipe with its jerrycans, whitewashed-tyre planters at the gare's portal
  if (O.props) {
    const sp = { x: -67.0, z: -30 };
    if (clear(sp.x, sp.z, 4) && free(rectAt(sp.x, sp.z, 1.2, 2.6))) {
      P.box(0.5, 0.9, 0.5, sp.x, G, sp.z, 0x8a8174); P.cyl(0.07, 0.07, 1.3, sp.x, G + 0.9, sp.z, 0x4a4d52, 6); P.box(0.07, 0.07, 0.4, sp.x, G + 1.9, sp.z + 0.2, 0x4a4d52);
      sign('borne', sp.x + 0.35, G + 1.55, sp.z + 0.9, Math.PI);                   // the sign, along the wall, for whoever walks the avenue
      for (let k = 0; k < 4; k++) P.box(0.24, 0.5, 0.34, sp.x + (k % 2) * 0.28 - 0.1, G, sp.z - 0.7 - Math.floor(k / 2) * 0.4, k % 2 ? 0xf2c230 : 0xd9a920, k * 0.4);   // the queue of jerrycans
      P.disc(1.3, sp.x + 0.2, 0.124, sp.z - 0.5, 0x5b4a38, 0.75, Math.PI / 2);                                  // the wet earth under the tap
      spills.push({ x: sp.x + 1, z: sp.z, w: 4, d: 4, rot: 0 });
      claim(rectAt(sp.x, sp.z - 0.2, 1.2, 2.6), 1.3, 'standpipe');
    }
    const planter = (x: number, z: number) => {
      if (!free(rectAt(x, z, 1.1, 1.1)) || !clear(x, z, 2.2)) return;
      for (let k = 0; k < 2; k++) P.cyl(0.45, 0.45, 0.2, x, G + k * 0.2, z, k ? 0xf4efe2 : 0x2b5c9e, 10);   // two painted tyres, planted
      P.blob(0.42, x, G + 0.62, z, 0x4f7a3a, 0.8); claim(rectAt(x, z, 1.0, 1.0), 0.5, 'planter');
    };
    for (const [x, z] of [[-52, 23], [-52, 37], [-48.5, 19], [-48.5, 41], [-47, 72], [-13, 72], [-47, 108], [-13, 108], [-72.7, -45.5], [-72.7, -28.5]] as const) planter(x, z);
    // the shops' court: a chalk A-board and a few crates and sacks of the trade in front of each shop, off the aisle the customers take
    for (const [sx, goods] of [[-101, [0xe9dfc6, 0xcfb88e, 0xb8372b]], [-79, [0xe895ac, 0xf4efe2, 0x7a2d46]]] as const) {
      const ab = { x: sx - 4.2, z: 87.6 };
      if (free(rectAt(ab.x, ab.z, 1.0, 0.6)) && clear(ab.x, ab.z, 2)) {
        P.box(0.7, 1.0, 0.05, ab.x, G, ab.z - 0.2, 0x2a2a2a, 0.15); P.box(0.7, 1.0, 0.05, ab.x, G, ab.z + 0.2, 0x2a2a2a, -0.15 + Math.PI);
        sign('prix', ab.x, G + 0.08, ab.z - 0.23, Math.PI + 0.15, 0.02, 'aboard'); claim(rectAt(ab.x, ab.z, 0.9, 0.6), 1.0, 'board');
      }
      for (let k = 0; k < 4; k++) {
        const x = sx + 4.6 + (k % 2) * 0.55, z = 87.4 + Math.floor(k / 2) * 0.5;
        if (!free(rectAt(x, z, 0.5, 0.45))) continue;
        P.box(0.5, 0.34 + (k % 3) * 0.1, 0.42, x, G, z, goods[k % goods.length], k * 0.3); claim(rectAt(x, z, 0.5, 0.45), 0.5, 'crate');
      }
    }
  }

  P.cat = 'wires';
  // ---- the overhead layer: poles with crossarms at irregular spacing, three strands along each side, spans across the road, service drops
  if (O.wires) {
    type Pole = { x: number; z: number } | null;
    /** A = the −1 side of the line, B = the +1 side, AB = both (a pair: wires span the road between them). `blades`: [along, side, sign] boards hung on a pole. */
    const network = (L: Line, spots: [number, 'A' | 'B' | 'AB'][], blade?: [1 | -1, SignId]) => {
      let bladed = false;
      const rot = L.alongZ ? 0 : Math.PI / 2, cs = Math.cos(rot), sn = Math.sin(rot), away = L.alongZ ? 1 : -1;
      const loc = (p: { x: number; z: number }, dx: number, dz = 0) => ({ x: p.x + dx * cs + dz * sn, z: p.z - dx * sn + dz * cs });   // dx across the road, dz along it
      const pole = (want: number, side: 1 | -1): Pole => {
        // the frontage is crowded: the pole takes the first free place within a few metres of where it was wanted
        for (const d of [0, 1.2, -1.2, 2.4, -2.4, 3.6]) {
          const along = want + d, p = at(L, along, 6.55, side), r = rectAt(p.x, p.z, 0.4, 0.4);
          if (!free(r) || !clear(p.x, p.z, 2.6) || nearCrossing(L, along, 6.8)) continue;      // never in the roadway of the crossing road
          P.cyl(0.11, 0.17, 7.4, p.x, G, p.z, 0x7a6a58, 5);
          P.box(2.0, 0.12, 0.12, p.x, G + 6.9, p.z, 0x5a4a3a, rot); P.box(1.4, 0.1, 0.1, p.x, G + 6.3, p.z, 0x5a4a3a, rot);          // the crossarms
          if (R() < 0.5) { const t = loc(p, 0.55 * side * away); P.box(0.55, 0.7, 0.4, t.x, G + 4.4, t.z, 0x6a6e70, rot); }              // a transformer / meter box
          if (blade && !bladed && blade[0] === side) {                                                                                  // a sign hung over the road
            bladed = true; const b = loc(p, 1.1 * side * away);                                                   // on the house side of the pole, high: never over the roadway
            for (const f of [0, Math.PI]) sign(blade[1], b.x, G + 5.9, b.z, (L.alongZ ? 0 : Math.PI / 2) + f, 0.06, 'blade');
          }
          claim(r, 7.4, 'pole'); return { x: p.x, z: p.z };
        }
        return null;
      };
      const A_: Pole[] = [], B_: Pole[] = [], pairs: [Pole, Pole][] = [];
      for (const [along, sides] of spots) {
        const a = sides.includes('A') ? pole(along, -1) : null, b = sides.includes('B') ? pole(along, 1) : null;
        if (sides.includes('A')) A_.push(a); if (sides.includes('B')) B_.push(b);
        if (sides === 'AB') pairs.push([a, b]);
      }
      const run = (list: Pole[]) => { for (let k = 1; k < list.length; k++) { const a = list[k - 1], b = list[k]; if (!a || !b) continue; for (const dx of [-0.8, 0.8]) { const u = loc(a, dx), v = loc(b, dx); P.wire([u.x, G + 7.0, u.z], [v.x, G + 7.0, v.z], 0.45); } } };
      run(A_); run(B_);
      for (const [a, b] of pairs) if (a && b) for (const [y, dz, sag] of [[7.2, 0, 0.5], [7.0, -0.4, 0.5]] as const) { const u = loc(a, 0, dz), v = loc(b, 0, dz); P.wire([u.x, G + y, u.z], [v.x, G + y, v.z], sag); }   // across the road
      for (const p of [...A_, ...B_]) if (p) {                                                           // the service drops to the houses
        const s = (L.alongZ ? p.x : p.z) < L.c ? -1 : 1, w = loc(p, 0), d1 = loc(p, s * away * 5, 0);
        P.wire([w.x, G + 6.3, w.z], [d1.x, G + 4.6, d1.z], 0.4, 0x1d1d20, 0.014);
      }
    };
    network(LINES[0], [[-54, 'A'], [-32, 'AB'], [-10, 'B'], [12, 'A'], [34, 'AB'], [56, 'B'], [72, 'AB'], [100, 'A']]);
    network(LINES[1], [[-53, 'B'], [-46, 'A'], [-36, 'AB'], [-27, 'A'], [-21, 'B'], [-13, 'AB'], [-6, 'A']], [-1, 'jamm']);          // the room's road; the Cité Jàmm sign hangs on the first pole of its side
    network(LINES[2], [[-50, 'A'], [-14, 'AB']]);
    if (LA) { const R2 = R; R = rng(0xa7e4a3); network(LA, [[7.5, 'AB'], [19, 'AB'], [41, 'AB'], [52.5, 'AB']]); R = R2; }   // the pole line goes on east of the junction, along the arena street
  }
  P.cat = 'bunting';
  // bunting across the avenue at the first corner and before the market: the neighbourhood is expecting something
  if (O.bunting) {
    P.bunting([-65.5, G + 7.3, -34], [-54.5, G + 7.2, -34], 0.6, BUNTING);
    P.bunting([-65.5, G + 7.2, 74], [-54.5, G + 7.3, 74], 0.6, BUNTING);
    P.bunting([-46, G + 7.3, 53.5], [-46, G + 7.3, 66.5], 0.6, BUNTING);
    P.bunting([-28, G + 7.3, -66.2], [-28, G + 7.3, -53.8], 0.6, BUNTING);                                  // over the room's road, between the home and the Cité Jàmm
    if (LA) for (const x of [16.5, 43.5]) P.bunting([x, G + 7.3, -66.2], [x, G + 7.3, -53.8], 0.6, [0x1a7a44, 0xf4efe2, 0xc8322a, 0xf5cd2e]);   // the two écuries' colours over the parvis
  }
  P.cat = 'kerbs';
  // painted kerbs (a coat of white and blue over the broken stones) and the speed bumps with their yellow-and-black stripes
  if (O.kerbs) {
    for (const L of LINES) for (const side of [1, -1] as const) for (let t = L.a; t < L.b; t += 2.0) {
      if (nearCrossing(L, t, 7.2)) continue;
      const p = at(L, t + 1, 5.02, side), alongZ = L.alongZ;
      if ((Math.floor(t / 2.0) + (side > 0 ? 0 : 1)) % 4 === 3) continue;
      P.flat(alongZ ? 0.34 : 1.9, alongZ ? 1.9 : 0.34, p.x, G + 0.05, p.z, Math.floor(t / 2) % 2 ? 0xf4efe2 : 0x2b5c9e);
    }
    for (const z of [-40, 30, 88]) for (let k = 0; k < 20; k++) P.flat(0.5, 1.6, -60 - 5 + k * 0.5 + 0.25, 0.094, z, k % 2 ? 0x1a1a1a : 0xf2c230);
    if (LA) {                                                                      // the arena street: kerbs (green and white across the parvis, the écuries' colours), a zebra at each end, bumps before the junctions
      for (const side of [1, -1] as const) for (let t = LA.a; t < LA.b; t += 2.0) {
        if (nearCrossing(LA, t, 7.2) || (Math.floor(t / 2.0) + (side > 0 ? 0 : 1)) % 4 === 3) continue;
        const p = at(LA, t + 1, 5.02, side), parvis = t + 1 > 15.5 && t + 1 < 44.5, odd = Math.floor(t / 2) % 2;
        P.flat(1.9, 0.34, p.x, G + 0.05, p.z, odd ? 0xf4efe2 : parvis ? 0x1a7a44 : 0x2b5c9e);
      }
      for (const x of [12.2, 47.8]) for (let k = 0; k < 10; k++) P.flat(2.6, 0.5, x, 0.095, -64.5 + k, 0xf1ede0);
      for (const x of [3.8, 56.2]) for (let k = 0; k < 20; k++) P.flat(1.6, 0.5, x, 0.094, -65 + k * 0.5 + 0.25, k % 2 ? 0x1a1a1a : 0xf2c230);
    }
  }

  P.cat = 'landmarks';
  // ---- the bank's flank on the avenue: its own name over the wall that faced the street blank (the sign, two lamps, a pool of light)
  {
    const x = -73.75, zc = -37;
    if (clear(x + 3, zc, 1) && !hub.interactables.some(i => Math.abs(i.x - x) < 3 && Math.abs(i.z - zc) < 14)) {
      P.box(0.08, 1.35, 9.2, x, G + 4.0, zc, 0x145d5b); panelOn('banque', x, G + 4.0, zc, Math.PI / 2, 1.35, 0.08);
      for (const z of [zc - 5.2, zc + 5.2]) P.litBox(0.3, 0.14, 0.3, x + 0.14, G + 3.7, z, LIT);
      spills.push({ x: x + 2.4, z: zc, w: 12, d: 4.5, rot: Math.PI / 2 });
      items.push({ kind: 'bank-sign', x, z: zc, solid: false });
    }
  }
  // the gare's portal, the gateways and the market gate are lit too
  spills.push({ x: -55.8, z: 30, w: 12, d: 5, rot: Math.PI / 2 }, { x: -30, z: 66, w: 18, d: 4.5, rot: 0 }, { x: -64.6, z: 92, w: 12, d: 4, rot: Math.PI / 2 });

  P.cat = 'ground';
  // ---- the ground: the sand's own stripes repeat, so the roadway gets long soft drifts and slanted lenses of blown sand, the pavements get dust
  // and swept strips, every shop a darker patch of trodden earth. Vertex-coloured blotches fading into the ground's own colour: no texture, no
  // transparency, the same draw call.
  {
    const Gr = rng(0x51a7c3), sc = q === 'low' ? 0.5 : 1, ROAD = shade(0x9c7b55, 0.93), WALK = shade(0xb08960, 0.93);                 // the ground's own colours as rendered (its grain takes a few per cent off), so a blotch's rim vanishes into it
    for (const L of LINES_ALL) {
      const along = L.alongZ ? Math.PI / 2 : 0;
      for (let t = L.a + 2; t < L.b - 2; t += (4.5 + Gr() * 7) / sc) {                         // long drifts, darker and lighter, one side then the other
        if (nearCrossing(L, t, 2)) continue;
        const off = (Gr() - 0.5) * 7, p = at(L, t, Math.abs(off), off < 0 ? -1 : 1), dark = Gr() < 0.5;
        P.blot(1.6 + Gr() * 3.4, p.x, 0.089 + Gr() * 0.004, p.z, shade(ROAD, dark ? 0.88 + Gr() * 0.05 : 1.06 + Gr() * 0.05), ROAD, 0.18 + Gr() * 0.2, along + (Gr() - 0.5) * 0.4);
      }
      for (let t = L.a + 8; t < L.b - 8; t += (16 + Gr() * 14) / sc) {                         // sand blown across the road: pale lenses at a slant
        if (nearCrossing(L, t, 6)) continue;
        const p = at(L, t, (Gr() - 0.5) * 3, Gr() < 0.5 ? 1 : -1);
        P.blot(2.8 + Gr() * 1.6, p.x, 0.093, p.z, shade(ROAD, 1.07), ROAD, 0.2, along + Math.PI / 2 + (Gr() - 0.5));
      }
      for (let t = L.a + 10; t < L.b - 10; t += (20 + Gr() * 14) / sc) {                       // a dark patch where something dripped
        if (nearCrossing(L, t, 4)) continue;
        const p = at(L, t, (Gr() - 0.5) * 6, 1); P.blot(0.5 + Gr() * 0.5, p.x, 0.095, p.z, shade(ROAD, 0.68), ROAD, 0.7, Gr() * 3);
      }
      for (const side of [1, -1] as const) for (let t = L.a + 2; t < L.b - 2; t += (5 + Gr() * 9) / sc) {     // dust along the kerbs, and strips swept clean
        if (nearCrossing(L, t, 3)) continue;
        const p = at(L, t, 5.7 + Gr() * 0.9, side), swept = Gr() < 0.3;
        P.blot(0.9 + Gr() * 1.4, p.x, 0.122 + Gr() * 0.003, p.z, shade(WALK, swept ? 0.92 : 1.14), WALK, 0.3 + Gr() * 0.2, along + (Gr() - 0.5) * 0.5);
      }
    }
    for (const sl of soils) { const long = Math.max(sl.w, sl.d); P.blot(long * 0.55, sl.x, 0.125, sl.z, shade(WALK, 0.76), WALK, Math.min(sl.w, sl.d) / long * 0.9, sl.rot); }
  }

  if (dry) return { mesh: null, night: null, items, signs: uses, open: keepOpen, tris: 0, byCat: {} };
  let night: THREE.Mesh | null = null;
  if (spills.length) {
    const geos = spills.map(sp => { const g = new THREE.PlaneGeometry(sp.w, sp.d); g.rotateX(-Math.PI / 2); g.rotateY(sp.rot); g.translate(sp.x, 0.16, sp.z); return g; });
    const merged = mergeGeometries(geos, false)!; for (const g of geos) g.dispose();
    night = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffa64a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    night.name = 'pikine_dna_night'; night.visible = false; night.renderOrder = 1;
  }

  if (!P.geos.length) return { mesh: null, night, items, signs: uses, open: keepOpen, tris: 0, byCat: {} };
  const geo = mergeGeometries(P.geos, false)!;
  for (const g of P.geos) g.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: A.tex, vertexColors: true, emissive: 0xffd9a0, emissiveMap: A.glow, emissiveIntensity: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'pikine_dna'; mesh.castShadow = q !== 'low'; mesh.receiveShadow = false;
  hub.signs.push(mesh);                                                      // lit a little at night with the shop signs (main.ts)
  return { mesh, night, items, signs: uses, open: keepOpen, tris: P.tris, byCat: P.byCat };
}

let poolTex: THREE.CanvasTexture | null = null;
/** Soft radial light for the night pools (the builder keeps its own, private to it). */
function poolTexture() {
  if (poolTex) return poolTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  poolTex = new THREE.CanvasTexture(cv); poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

let current: { mesh: THREE.Mesh | null; night: THREE.Mesh | null } | null = null;
let slice: DnaItem[] = [], signUses: DnaSignUse[] = [], openZones: { x0: number; z0: number; x1: number; z1: number }[] = [];
let sliceStats = { tris: 0, quality: 'medium' as string, byCat: {} as Record<string, number> };

/** The module: dresses the Pikine slice when the hub loads (one merged mesh, one for the night's pools, and a few colliders). */
export const pikineDnaModule: GameModule = {
  name: 'pikineDna',
  hubLoaded(ctx, hub) {
    if (current) {
      for (const m of [current.mesh, current.night]) if (m) { m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      current = null;
    }
    slice = []; signUses = []; openZones = [];
    if (hub.id !== 'pikine') return;
    const r = dressPikineSlice(hub, ctx.quality());
    for (const m of [r.mesh, r.night]) if (m) ctx.extra.add(m);
    current = { mesh: r.mesh, night: r.night };
    slice = r.items; signUses = r.signs; openZones = r.open; sliceStats = { tris: r.tris, quality: ctx.quality(), byCat: r.byCat };
  },
  /** The warm pools in front of the shops and gates follow the dusk (the same night measure as the lamps). */
  update(ctx) {
    const n = current?.night; if (!n) return;
    const k = nightOf(daylight(ctx.hour()));
    n.visible = k > 0.05; (n.material as THREE.MeshBasicMaterial).opacity = 1.0 * k;
  },
  debug: () => ({
    pikineDna: () => slice, pikineDnaStats: () => sliceStats,
    /** The ground the slice keeps open at the arena gate (queue lane, apron, the stalls' customers, the fans' corners). */
    pikineDnaOpen: () => openZones,
    /** The boards as placed, the cells they were painted in, and every line of text with how it fitted (scripts/check-pikine-signs.mjs). */
    pikineDnaSigns: () => { const A = dressAtlas(); return { atlas: { w: A.w, h: A.h }, uses: signUses, cells: A.cells, texts: A.texts, names: SHOP_NAMES.map((n, i) => ({ id: shopSignId(i), ...n })).filter(n => A.cells[n.id]) }; },
  }),
};
