import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameModule } from './modules';
import type { HubWorld } from '../world/types';
import { rng, pick } from '../core/rng';

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
const AW = 1024, AH = 1024;
const MW = 512, MH = 176;                                                       // mural cells: 2 columns × 4 rows
const SW = 256, SH = 100;                                                       // sign cells: 4 columns × 3 rows, under the murals (the last 16 rows stay white: the plain parts sample them)
const rectOf = (x: number, y: number, w: number, h: number): Rect => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];

export const DNA_COUNT = {
  low: { wires: false, bunting: false, kerbs: false, props: false },
  medium: { wires: true, bunting: true, kerbs: true, props: true },
  high: { wires: true, bunting: true, kerbs: true, props: true },
} as const;

// ------------------------------------------------------------------------------------------------ the painted atlas
const MURALS = ['lutteur', 'lions', 'telecom', 'bissap', 'pikine', 'wax', 'defense', 'salon'] as const;
const SIGNS = ['gare', 'place', 'marche', 'keur_mbaye', 'keur_sarr', 'keur_gueye', 'borne', 'bienvenue', 'boutique', 'couture', 'quinc', 'telecentre'] as const;
type MuralId = typeof MURALS[number];
type SignId = typeof SIGNS[number];
let atlas: { tex: THREE.CanvasTexture; glow: THREE.CanvasTexture; mural: Record<MuralId, Rect>; sign: Record<SignId, Rect>; white: Rect } | null = null;

function text(c: CanvasRenderingContext2D, t: string, x: number, y: number, w: number, size: number, fill: string, stroke?: string, weight = 800) {
  c.font = `${weight} ${size}px system-ui, "Arial Narrow", sans-serif`;
  while (c.measureText(t).width > w && size > 10) { size -= 2; c.font = `${weight} ${size}px system-ui, "Arial Narrow", sans-serif`; }
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
    text(c, 'JAMM TÉLÉCOM', 220, 56, 390, 64, '#ffffff', '#0e2f63'); text(c, 'Internet 4G · Wave · Recharge ici', 220, MH - 22, 420, 28, '#0e2f63', undefined, 800);
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

/** One painted sign board, in a SW × SH cell. */
function paintSign(c: CanvasRenderingContext2D, id: SignId) {
  const box = (bg: string, fg: string) => { c.fillStyle = bg; c.fillRect(0, 0, SW, SH); c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(5, 5, SW - 10, SH - 10); };
  if (id === 'gare') { box('#1e3a8a', '#fde68a'); text(c, 'GARE ROUTIÈRE', 128, 36, 220, 36, '#fde68a'); text(c, 'PIKINE · Car rapide · Ndiaga Ndiaye', 128, 72, 230, 20, '#ffffff', undefined, 700); c.fillStyle = '#f4c20d'; c.fillRect(10, 84, 236, 8); }
  else if (id === 'place') { box('#1d6b3c', '#ffd23a'); text(c, 'GRAND-PLACE', 128, 36, 220, 36, '#ffe58a'); text(c, 'de Pikine · attaya · dames · jàmm', 128, 72, 230, 20, '#ffffff', undefined, 700); c.fillStyle = '#d7312f'; c.fillRect(10, 84, 236, 8); }
  else if (id === 'marche') { box('#b85a1f', '#ffe9b8'); text(c, 'MARCHÉ', 128, 34, 220, 38, '#ffe9b8'); text(c, 'Boutiques · Salon · Couture', 128, 70, 230, 22, '#ffffff', undefined, 700); }
  else if (id === 'keur_mbaye') { box('#f3ead4', '#2f6f4a'); text(c, 'KEUR MBAYE', 128, 38, 220, 36, '#2f6f4a'); text(c, 'Dieureudieuf', 128, 74, 200, 20, '#7a4a2a', undefined, 700); }
  else if (id === 'keur_sarr') { box('#2b4f86', '#f3ead4'); text(c, 'KEUR SARR', 128, 38, 220, 36, '#f3ead4'); text(c, 'Bienvenue', 128, 74, 200, 20, '#ffd23a', undefined, 700); }
  else if (id === 'keur_gueye') { box('#9b3d2b', '#fbe9b8'); text(c, 'KEUR GUEYE', 128, 38, 220, 36, '#fbe9b8'); text(c, 'Teranga', 128, 74, 200, 20, '#ffffff', undefined, 700); }
  else if (id === 'borne') { box('#2d7bd0', '#ffffff'); text(c, 'BORNE-FONTAINE', 128, 34, 230, 26, '#ffffff'); text(c, 'Eau potable · 20 F le seau', 128, 70, 230, 22, '#ffe58a', undefined, 700); }
  else if (id === 'bienvenue') { box('#d7312f', '#ffe58a'); text(c, 'BIENVENUE', 128, 40, 220, 38, '#ffe58a'); text(c, 'À PIKINE', 128, 76, 200, 30, '#ffffff'); }
  else if (id === 'boutique') { box('#2f7a4a', '#fdf0c0'); text(c, 'BOUTIQUE ABDOU', 128, 36, 230, 30, '#fdf0c0'); text(c, 'Alimentation générale', 128, 72, 230, 20, '#ffffff', undefined, 700); }
  else if (id === 'couture') { box('#a8402f', '#fdf0d4'); text(c, 'COUTURE FATOU', 128, 36, 230, 30, '#fdf0d4'); text(c, 'Modèles sur mesure · wax', 128, 72, 230, 20, '#ffe58a', undefined, 700); }
  else if (id === 'quinc') { box('#2b4f86', '#f3ead4'); text(c, 'QUINCAILLERIE', 128, 36, 230, 30, '#f3ead4'); text(c, 'NDIAYE & FILS · ciment · fer', 128, 72, 232, 20, '#ffd23a', undefined, 700); }
  else { box('#f1e7c6', '#a1321f'); text(c, 'TÉLÉCENTRE', 128, 36, 230, 30, '#a1321f'); text(c, 'Crédit · Transfert · Wave', 128, 72, 230, 20, '#1b1b1b', undefined, 700); }
}

function dressAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, AW, AH);
  const mural = {} as Record<MuralId, Rect>, sign = {} as Record<SignId, Rect>;
  MURALS.forEach((id, i) => { const x = (i % 2) * MW, y = Math.floor(i / 2) * MH; c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, MW, MH); c.clip(); c.scale(1, MH / 192); paintMural(c, id); c.restore(); mural[id] = rectOf(x, y, MW, MH); });
  SIGNS.forEach((id, i) => { const x = (i % 4) * SW, y = 4 * MH + Math.floor(i / 4) * SH; c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, SW, SH); c.clip(); paintSign(c, id); c.restore(); sign[id] = rectOf(x, y, SW, SH); });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // the night glow: the small signs, a little of the murals (a wall is lit by the lamps, not by itself); the plain parts stay dark
  const cg = document.createElement('canvas'); cg.width = AW; cg.height = AH;
  const g2 = cg.getContext('2d')!; g2.fillStyle = '#000'; g2.fillRect(0, 0, AW, AH);
  g2.globalAlpha = 0.28; g2.drawImage(cv, 0, 0, AW, 4 * MH, 0, 0, AW, 4 * MH); g2.globalAlpha = 1; g2.drawImage(cv, 0, 4 * MH, AW, 3 * SH, 0, 4 * MH, AW, 3 * SH);
  g2.fillStyle = '#000'; g2.fillRect(0, 4 * MH + 3 * SH, AW, AH - 4 * MH - 3 * SH);
  const glow = new THREE.CanvasTexture(cg); glow.colorSpace = THREE.SRGBColorSpace;
  atlas = { tex, glow, mural, sign, white: rectOf(1000, 1010, 14, 12) };
  return atlas;
}

// ------------------------------------------------------------------------------------------------ merged pieces
class Pieces {
  geos: THREE.BufferGeometry[] = [];
  tris = 0;
  constructor(private white: Rect) {}
  private put(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotY: number, rotX = 0) {
    g.rotateX(rotX); g.rotateY(rotY); g.translate(x, y, z);
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count, col = new THREE.Color(color), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g); this.tris += n / 3;
  }
  private plain(g: THREE.BufferGeometry) {
    const n = g.attributes.position.count, uv = new Float32Array(n * 2), [u0, v0, u1, v1] = this.white;
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
    const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 4));
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
const TRICOLOR = [0x1d8040, 0xf5cd2e, 0xd7312f];
const BUNTING = [0x1d8040, 0xf5cd2e, 0xd7312f, 0xf4efe2, 0x2b5c9e];

export interface DnaItem { kind: string; x: number; z: number; solid: boolean; rect?: { x0: number; z0: number; x1: number; z1: number; h: number } }

export function dressPikineSlice(hub: HubWorld, q: keyof typeof DNA_COUNT): { mesh: THREE.Mesh | null; items: DnaItem[]; tris: number } {
  const O = DNA_COUNT[q], A = dressAtlas(), P = new Pieces(A.white), R = rng(0x9177a1);
  const items: DnaItem[] = [];
  const taken: { x0: number; z0: number; x1: number; z1: number }[] = [];
  const G = 0.12;
  const free = (r: { x0: number; z0: number; x1: number; z1: number }, pad = 0.05) =>
    !hub.colliders.some(c => r.x0 < c.x1 + pad && r.x1 > c.x0 - pad && r.z0 < c.z1 + pad && r.z1 > c.z0 - pad) && !taken.some(c => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0);
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

  // ---- the street's edge: painted compound walls, house gates and boutiques, only in front of rows of houses
  const muralOrder = [...MURALS.filter(m => m !== 'salon')];
  const keur: SignId[] = ['keur_mbaye', 'keur_sarr', 'keur_gueye'], shops: SignId[] = ['boutique', 'couture', 'quinc', 'telecentre'];
  let muralK = 0, keurK = 0, shopK = 0;
  type Unit = 'mural' | 'gate' | 'shop';
  /** A unit of the street's edge centred `mid` along the line; false when something stands there. */
  const unit = (L: Line, side: 1 | -1, mid: number, len: number, kind: Unit, frac = 1): boolean => {
    const r = rectOn(L, mid, WALL_OFF, side, len, 0.6), c = at(L, mid, WALL_OFF, side), yaw = yawOf(L, side);
    if (!free(r) || !clear(c.x, c.z, 3)) return false;
    const fwd = (d: number, a = 0) => at(L, mid + a, WALL_OFF - d, side);                          // a point `d` in front of the wall, `a` along it
    if (kind === 'gate') {
      const leaf = pick(GATE, R), nm = keur[keurK++ % keur.length], cap = 0xe9dfc6;
      for (const sg of [-1, 1]) { const e = fwd(0, sg * 2.1); P.box(0.55, 2.7, 0.5, e.x, G, e.z, cap, yaw); P.box(0.7, 0.14, 0.64, e.x, G + 2.7, e.z, 0x9a9183, yaw); }
      P.box(3.5, 2.15, 0.1, c.x, G, c.z, leaf, yaw);                                                      // the double leaf, with its ribs
      for (let k = -3; k <= 3; k++) { const rib = fwd(0.07, k * 0.5); P.box(0.07, 2.0, 0.04, rib.x, G + 0.05, rib.z, 0x2a2420, yaw); }
      const bar = fwd(0.07); P.box(3.5, 0.08, 0.06, bar.x, G + 1.1, bar.z, 0x2a2420, yaw);
      const lin = fwd(0.02); P.board(1.7, 0.6, 0.1, lin.x, G + 2.28, lin.z, A.sign[nm], yaw);            // the name plate over the door
      for (const sg of [-1, 1]) { const w = fwd(0, sg * 2.6); P.box(0.8, 0.9, 0.3, w.x, G, w.z, shade(SUN[Math.floor(R() * SUN.length)], 0.9), yaw); }   // the wall goes on, low
      claim(r, 2.8, 'gate');
    } else if (kind === 'mural') {
      const id = muralOrder[muralK++ % muralOrder.length], rect: Rect = [A.mural[id][0], A.mural[id][1], A.mural[id][0] + (A.mural[id][2] - A.mural[id][0]) * frac, A.mural[id][3]];
      P.board(len, 1.95, 0.16, c.x, G, c.z, rect, yaw);
      P.box(len + 0.1, 0.18, 0.24, c.x, G + 1.95, c.z, 0xcfc6b0, yaw);                                    // the coping
      P.box(len + 0.04, 0.22, 0.2, c.x, G, c.z, 0x6e6252, yaw);                                           // the dirt band at the foot
      claim(r, 2.2, 'mural');
    } else {
      // a boutique built into the wall: painted front, the shutter half up on a dark shop, a shelf, goods, a fascia sign, a striped awning
      const sg = shops[shopK++ % shops.length], body = pick(SUN, R), shut = pick(GATE, R), stripe = [pick(GATE, R), 0xf3ead4];
      P.box(len, 2.9, 0.56, c.x, G, c.z, body, yaw);
      for (const e of [-1, 1]) { const q2 = fwd(0.29, e * (len / 2 - 0.2)); P.box(0.4, 2.6, 0.08, q2.x, G, q2.z, shade(body, 0.8), yaw); }
      const door = fwd(0.29); P.box(3.2, 1.95, 0.05, door.x, G, door.z, 0x2a2018, yaw);                    // the dark of the shop
      const roll = fwd(0.34); P.box(3.4, 0.4, 0.2, roll.x, G + 1.95, roll.z, shut, yaw);                    // the shutter, rolled up
      for (let k = 0; k < 3; k++) { const sl = fwd(0.4); P.box(3.3, 0.06, 0.05, sl.x, G + 1.62 + k * 0.1, sl.z, shade(shut, 0.7), yaw); }
      const shelf = fwd(0.42); P.box(3.1, 0.1, 0.46, shelf.x, G + 0.92, shelf.z, 0x6b4a2e, yaw);
      for (let k = 0; k < 6; k++) { const g2 = fwd(0.4, -1.35 + k * 0.54); P.box(0.34, 0.26 + (k % 3) * 0.06, 0.28, g2.x, G + 1.02, g2.z, pick([0xe58a2f, 0xb8372b, 0x6aa84f, 0xe8c24a, 0xefe9da, 0x2b5c9e], R), yaw); }
      const fas = fwd(0.31); P.board(len - 0.5, 0.78, 0.1, fas.x, G + 2.2, fas.z, A.sign[sg], yaw);       // the fascia
      for (let k = 0; k < 4; k++) { const aw = fwd(0.8, (k - 1.5) * (len - 0.4) / 4); P.slab((len - 0.4) / 4, 0.05, 1.1, aw.x, G + 2.15, aw.z, stripe[k % 2], yaw, 0.32); }
      claim(r, 2.9, 'shop');
    }
    return true;
  };
  for (const L of LINES) for (const side of [1, -1] as const) {
    let t = L.a + 2, last: Unit | null = null, run = 0;
    while (t < L.b - 8) {
      if (nearCrossing(L, t, CROSS_CLEAR)) { t += 1; continue; }
      const p = at(L, t, WALL_OFF, side);
      if (!houseBlock(p.x + (L.alongZ ? side * 4 : 0), p.z + (L.alongZ ? 0 : side * 4))) { t += 2; continue; }
      const roll = R(), kind: Unit = last === 'gate' ? (roll < 0.5 ? 'mural' : 'shop') : roll < 0.2 ? 'gate' : roll < 0.52 && !(last === 'shop' && run >= 1) ? 'shop' : 'mural';
      const len = kind === 'gate' ? 4.8 : kind === 'shop' ? 5.0 : 5.4, mid = t + len / 2;
      if (nearCrossing(L, mid, CROSS_CLEAR + len / 2 - 0.3)) { t += 1; continue; }
      if (!unit(L, side, mid, len, kind)) { t += 1.5; continue; }
      run = last === kind ? run + 1 : 0; last = kind;
      t = mid + len / 2 + 0.8 + R() * 2.2;
    }
  }
  // the room's flanks: a narrower painted wall on each side of the home on the first road
  for (const a of [-50.3, -33.4]) unit(LINES[1], 1, a, 3.6, 'mural', 0.66);

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
  // the gare's portal over its west entrance, two painted pylons and a board
  {
    const x = -53.4, z0 = 25.2, z1 = 35.2;                                      // on the kerb line of the block, clear of the crowd's pavement lanes
    for (const z of [z0, z1]) { P.box(0.9, 5.4, 0.9, x, G, z, 0xf3ead4); for (let k = 0; k < 3; k++) P.box(0.93, 0.5, 0.93, x, G + 2.9 + k * 0.5, z, TRICOLOR[k]); P.box(1.1, 0.16, 1.1, x, G + 5.4, z, 0x8a8174); claim(rectAt(x, z, 1.0, 1.0), 5.4, 'portal'); }
    const zc = (z0 + z1) / 2;
    P.box(0.3, 0.3, 10.2, x, G + 3.7, zc, 0x1e3a8a);                                                        // the beam
    P.board(9.4, 1.9, 0.08, x - 0.2, G + 3.95, zc, A.sign.gare, -Math.PI / 2);                              // its board, towards the avenue
    P.board(9.4, 1.9, 0.08, x + 0.2, G + 3.95, zc, A.sign.gare, Math.PI / 2);                               // and towards the yard
    for (const [z, yaw] of [[z0, Math.PI], [z1, 0]] as const) P.board(2.6, 1.3, 0.08, x - 1.5, G + 4.6, z + (yaw ? -0.55 : 0.55), A.sign.gare, yaw);   // blade signs, for whoever walks the avenue
    if (O.bunting) P.bunting([x, G + 5.2, z0], [x + 9, G + 4.3, z0 - 3], 0.6, BUNTING);
  }
  // the grand-place's gateway on its north side
  {
    const z = 67.4, xs = [-39, -21];
    for (const x of xs) { P.box(1.0, 4.4, 1.0, x, G, z, 0xf3ead4); for (let k = 0; k < 3; k++) P.box(1.03, 0.45, 1.03, x, G + 2.3 + k * 0.45, z, TRICOLOR[k]); P.box(1.2, 0.18, 1.2, x, G + 4.4, z, 0x8a8174); claim(rectAt(x, z, 1.1, 1.1), 4.5, 'gateway'); }
    P.board(17.4, 1.2, 0.2, -30, G + 3.9, z, A.sign.place, Math.PI, 0xffffff);                              // facing the road to the north
    P.board(17.4, 1.2, 0.2, -30, G + 3.9, z + 0.01, A.sign.place, 0, 0xffffff);
    P.board(2.8, 1.1, 0.08, -39.2 - 1.4, G + 4.7, z, A.sign.place, Math.PI / 2);                              // a blade towards whoever walks the road east
    if (O.bunting) { P.bunting([-39, G + 4.2, z], [-30, G + 3.3, z + 8], 0.7, BUNTING); P.bunting([-21, G + 4.2, z], [-30, G + 3.3, z + 8], 0.7, BUNTING); P.bunting([-30, G + 3.4, z + 8], [-30, G + 5.3, z + 23], 1.2, BUNTING); }
  }
  // the shops' court: its market gateway on the avenue, and Salon Awa's painted flank (the court's first sight)
  {
    const x = -66.7, zs = [86.4, 97.6];
    for (const z of zs) { P.box(0.9, 4.0, 0.9, x, G, z, 0xf3ead4); P.box(0.93, 0.5, 0.93, x, G + 1.0, z, 0xd7312f); P.box(0.93, 0.5, 0.93, x, G + 2.0, z, 0xf5cd2e); P.box(1.1, 0.16, 1.1, x, G + 4.0, z, 0x8a8174); claim(rectAt(x, z, 1.0, 1.0), 4.1, 'gateway'); }
    const zc = (zs[0] + zs[1]) / 2;
    P.box(0.26, 0.26, 12.0, x, G + 3.2, zc, 0xb85a1f);
    P.board(11.8, 1.1, 0.08, x - 0.17, G + 3.45, zc, A.sign.marche, -Math.PI / 2);                          // towards the avenue
    P.board(11.8, 1.1, 0.08, x + 0.17, G + 3.45, zc, A.sign.marche, Math.PI / 2);                           // towards the court
    P.board(2.4, 1.1, 0.08, x - 1.3, G + 4.2, zs[0] - 0.5, A.sign.marche, Math.PI);                          // a blade, for whoever walks down the avenue
    if (O.bunting) { P.bunting([x, G + 3.6, zs[0]], [x - 12, G + 3.8, zs[0] - 1.5], 0.5, BUNTING); P.bunting([x, G + 3.6, zs[1]], [x - 12, G + 3.8, zs[1] + 1.5], 0.5, BUNTING); }
    // Salon Awa's east flank (the shop's 0.25 m wall at x = -70.5, z 76…84): a mural board in front of it, and the gate sign
    const fx = -70.5 + 0.2, fz = 80;
    if (clear(fx, fz, 1)) { P.board(7.2, 2.7, 0.05, fx, G + 0.4, fz, A.mural.salon, Math.PI / 2, 0xffffff); }
    // the shops' own fronts: a painted apron of tiles and a price board each, in the court (decor only, off the shops' aisles)
    for (const [sx, name] of [[-101, 'boutique'], [-79, 'salon']] as const) {
      for (let k = 0; k < 8; k++) P.flat(1.9, 1.9, sx - 7 + k * 2, 0.095, 86.2, k % 2 ? 0xe8d9b8 : 0xc9a46a);
      items.push({ kind: `apron:${name}`, x: sx, z: 86.2, solid: false });
    }
  }
  // the avenue's pavement furniture: a standpipe with its jerrycans, whitewashed-tyre planters at the gare's portal
  if (O.props) {
    const sp = { x: -67.0, z: -30 };
    if (clear(sp.x, sp.z, 4) && free(rectAt(sp.x, sp.z, 1.2, 2.6))) {
      P.box(0.5, 0.9, 0.5, sp.x, G, sp.z, 0x8a8174); P.cyl(0.07, 0.07, 1.3, sp.x, G + 0.9, sp.z, 0x4a4d52, 6); P.box(0.07, 0.07, 0.4, sp.x, G + 1.9, sp.z + 0.2, 0x4a4d52);
      P.board(1.3, 0.65, 0.06, sp.x + 0.35, G + 1.55, sp.z + 0.9, A.sign.borne, Math.PI, 0xffffff);                   // the sign, along the wall, for whoever walks the avenue
      for (let k = 0; k < 4; k++) P.box(0.24, 0.5, 0.34, sp.x + (k % 2) * 0.28 - 0.1, G, sp.z - 0.7 - Math.floor(k / 2) * 0.4, k % 2 ? 0xf2c230 : 0xd9a920, k * 0.4);   // the queue of jerrycans
      claim(rectAt(sp.x, sp.z - 0.2, 1.2, 2.6), 1.3, 'standpipe');
    }
    const planter = (x: number, z: number) => {
      if (!free(rectAt(x, z, 1.1, 1.1)) || !clear(x, z, 2.2)) return;
      for (let k = 0; k < 2; k++) P.cyl(0.45, 0.45, 0.2, x, G + k * 0.2, z, k ? 0xf4efe2 : 0x2b5c9e, 10);   // two painted tyres, planted
      P.blob(0.42, x, G + 0.62, z, 0x4f7a3a, 0.8); claim(rectAt(x, z, 1.0, 1.0), 0.5, 'planter');
    };
    for (const [x, z] of [[-52, 23], [-52, 37], [-48.5, 19], [-48.5, 41], [-47, 72], [-13, 72], [-47, 108], [-13, 108]] as const) planter(x, z);
    // the shops' court: a chalk A-board and a few crates and sacks of the trade in front of each shop, off the aisle the customers take
    for (const [sx, goods] of [[-101, [0xe9dfc6, 0xcfb88e, 0xb8372b]], [-79, [0xe895ac, 0xf4efe2, 0x7a2d46]]] as const) {
      const ab = { x: sx - 4.2, z: 87.6 };
      if (free(rectAt(ab.x, ab.z, 1.0, 0.6)) && clear(ab.x, ab.z, 2)) {
        P.box(0.7, 1.0, 0.05, ab.x, G, ab.z - 0.2, 0x2a2a2a, 0.15); P.box(0.7, 1.0, 0.05, ab.x, G, ab.z + 0.2, 0x2a2a2a, -0.15 + Math.PI);
        P.board(0.62, 0.8, 0.02, ab.x, G + 0.08, ab.z - 0.23, A.sign.boutique, Math.PI + 0.15); claim(rectAt(ab.x, ab.z, 0.9, 0.6), 1.0, 'board');
      }
      for (let k = 0; k < 4; k++) {
        const x = sx + 4.6 + (k % 2) * 0.55, z = 87.4 + Math.floor(k / 2) * 0.5;
        if (!free(rectAt(x, z, 0.5, 0.45))) continue;
        P.box(0.5, 0.34 + (k % 3) * 0.1, 0.42, x, G, z, goods[k % goods.length], k * 0.3); claim(rectAt(x, z, 0.5, 0.45), 0.5, 'crate');
      }
    }
  }

  // ---- the overhead layer: poles with crossarms every ~22 m along the avenue, wires along it and across the road
  if (O.wires) {
    // poles down the avenue: W = west kerb, E = east kerb, both = a span of wires across the road between the pair
    const spots: [number, 'W' | 'E' | 'WE'][] = [[-54, 'W'], [-32, 'WE'], [-10, 'E'], [12, 'W'], [34, 'WE'], [56, 'E'], [72, 'WE'], [100, 'W']];
    const pole = (x: number, z: number, side: 1 | -1) => {
      const r = rectAt(x, z, 0.4, 0.4);
      if (!free(r) || !clear(x, z, 2.6)) return null;
      P.cyl(0.11, 0.17, 7.4, x, G, z, 0x7a6a58, 6); P.box(0.12, 0.12, 2.0, x, G + 6.9, z, 0x5a4a3a, 0); P.box(2.0, 0.12, 0.12, x, G + 6.5, z, 0x5a4a3a);
      for (const dz of [-0.9, -0.3, 0.3, 0.9]) P.cyl(0.04, 0.04, 0.16, x, G + 7.0, z + dz, 0xdcd8c8, 5);
      if (R() < 0.5) P.box(0.55, 0.7, 0.4, x - side * 0.5, G + 4.4, z, 0x6a6e70);                         // a transformer / meter box
      claim(r, 7.4, 'pole'); return { x, z };
    };
    type Pole = { x: number; z: number } | null;
    const west: Pole[] = [], east: Pole[] = [], pairs: [Pole, Pole][] = [];
    for (const [z, sides] of spots) {
      const w = sides.includes('W') ? pole(-66.55, z, -1) : null, e = sides.includes('E') ? pole(-53.45, z, 1) : null;
      if (sides.includes('W')) west.push(w); if (sides.includes('E')) east.push(e);
      if (sides === 'WE') pairs.push([w, e]);
    }
    const run = (list: Pole[]) => { for (let k = 1; k < list.length; k++) { const a = list[k - 1], b = list[k]; if (!a || !b) continue; for (const dz of [-0.6, 0, 0.6]) P.wire([a.x, G + 7.0, a.z + dz], [b.x, G + 7.0, b.z + dz], 0.45); } };
    run(west); run(east);
    for (const [w, e] of pairs) if (w && e) { P.wire([w.x, G + 6.8, w.z], [e.x, G + 6.8, e.z], 0.7); P.wire([w.x, G + 6.5, w.z - 0.4], [e.x, G + 6.5, e.z - 0.4], 0.8); }   // across the road
    for (const p of [...west, ...east]) if (p) {                                                               // the service drops to the houses
      const s = p.x < -60 ? -1 : 1;
      P.wire([p.x, G + 6.3, p.z], [p.x + s * 5, G + 4.6, p.z + 2.5], 0.4, 0x1d1d20, 0.014); P.wire([p.x, G + 6.2, p.z], [p.x + s * 6.5, G + 4.2, p.z - 3], 0.4, 0x1d1d20, 0.014);
    }
  }
  // bunting across the avenue at the first corner and before the market: the neighbourhood is expecting something
  if (O.bunting) {
    P.bunting([-65.5, G + 6.2, -34], [-54.5, G + 6.0, -34], 0.9, BUNTING);
    P.bunting([-65.5, G + 6.0, 74], [-54.5, G + 6.2, 74], 0.9, BUNTING);
    P.bunting([-46, G + 5.8, 53.5], [-46, G + 5.8, 66.5], 0.9, BUNTING);
  }
  // painted kerbs (a coat of white and blue over the broken stones) and the speed bumps with their yellow-and-black stripes
  if (O.kerbs) {
    for (const L of [LINES[0], LINES[2]]) for (const side of [1, -1] as const) for (let t = L.a; t < L.b; t += 1.0) {
      if (nearCrossing(L, t, 7.2)) continue;
      const p = at(L, t + 0.5, 5.02, side), alongZ = L.alongZ;
      if ((Math.floor(t / 1.0) + (side > 0 ? 0 : 1)) % 4 === 3) continue;
      P.flat(alongZ ? 0.34 : 0.96, alongZ ? 0.96 : 0.34, p.x, G + 0.05, p.z, Math.floor(t) % 2 ? 0xf4efe2 : 0x2b5c9e);
    }
    for (const z of [-40, 30, 88]) for (let k = 0; k < 20; k++) P.flat(0.5, 1.6, -60 - 5 + k * 0.5 + 0.25, 0.094, z, k % 2 ? 0x1a1a1a : 0xf2c230);
  }

  if (!P.geos.length) return { mesh: null, items, tris: 0 };
  const geo = mergeGeometries(P.geos, false)!;
  for (const g of P.geos) g.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: A.tex, vertexColors: true, emissive: 0xffffff, emissiveMap: A.glow, emissiveIntensity: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'pikine_dna'; mesh.castShadow = q !== 'low'; mesh.receiveShadow = false;
  hub.signs.push(mesh);                                                      // lit a little at night with the shop signs (main.ts)
  return { mesh, items, tris: P.tris };
}

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

let current: { mesh: THREE.Mesh | null; geo: THREE.BufferGeometry | null } | null = null;
let slice: DnaItem[] = [];
let sliceStats = { tris: 0, quality: 'medium' as string };

/** The module: dresses the Pikine slice when the hub loads (one merged mesh and a few colliders). */
export const pikineDnaModule: GameModule = {
  name: 'pikineDna',
  hubLoaded(ctx, hub) {
    if (current) { current.mesh?.removeFromParent(); current.geo?.dispose(); (current.mesh?.material as THREE.Material | undefined)?.dispose(); current = null; }
    slice = [];
    if (hub.id !== 'pikine') return;
    const r = dressPikineSlice(hub, ctx.quality());
    if (r.mesh) { ctx.extra.add(r.mesh); current = { mesh: r.mesh, geo: r.mesh.geometry }; }
    slice = r.items; sliceStats = { tris: r.tris, quality: ctx.quality() };
  },
  debug: () => ({ pikineDna: () => slice, pikineDnaStats: () => sliceStats }),
};
