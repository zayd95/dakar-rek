import { atlasRect, type Rect } from '../world/kitGeometry';
import { lex } from '../i18n/wolof';

/**
 * Shared paint atlas of the vehicle kit (1024 × 512 colour, 512 × 256 glow), drawn in code — our own designs only.
 * Car rapide art: hand-painted-style chevrons, geometric friezes, flowers, birds, fish, waves, a painted eye and
 * fictional nicknames (TERAANGA, NDANK NDANK, JÀMM). No religious inscription, no crescent, no real brand, badge,
 * company name or logo. The bus line « SAMA BUS » is fictional (it only evokes a city bus by its colours).
 */
export const AW = 1024, AH = 512;
const PX = {
  plain: [0, 0, 16, 16], head: [16, 0, 48, 48], headRect: [64, 0, 64, 32], tail: [128, 0, 64, 32], grille: [192, 0, 64, 32],
  grilleChrome: [256, 0, 64, 32], plate: [320, 0, 64, 16], taxiSign: [384, 0, 64, 32],
  rimSteel: [448, 0, 64, 64], rimAlloy: [512, 0, 64, 64], rimHubcap: [576, 0, 64, 64], rimMoto: [640, 0, 64, 64], rimTruck: [704, 0, 64, 64],
  dest0: [768, 0, 256, 32], dest1: [768, 32, 256, 32], dest2: [768, 64, 256, 32],
  band: [0, 64, 512, 32], frieze: [0, 96, 512, 48],
  panel0: [0, 144, 192, 128], panel1: [192, 144, 192, 128], panel2: [384, 144, 192, 128],
  name0: [576, 144, 256, 40], name1: [576, 184, 256, 40], name2: [576, 224, 256, 40],
  front: [576, 264, 192, 96], rear: [768, 264, 192, 96], busSide: [0, 272, 512, 48],
  seatFabric: [0, 320, 64, 64], truckBoard: [512, 360, 256, 48], light: [768, 360, 64, 16], slats: [832, 360, 128, 64],
  lamp: [960, 360, 32, 32],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type AtlasKey = keyof typeof PX;
export const UV = Object.fromEntries(Object.entries(PX).map(([k, [x, y, w, h]]) => [k, atlasRect(x, y, w, h, AW, AH)])) as Record<AtlasKey, Rect>;
export const PLAIN_UV: [number, number] = [8 / AW, 1 - 8 / AH];
/** Part of an atlas rect (fractions of its width and height, from its bottom-left). */
export const sub = (r: Rect, u0: number, v0: number, u1: number, v1: number): Rect => [r[0] + (r[2] - r[0]) * u0, r[1] + (r[3] - r[1]) * v0, r[0] + (r[2] - r[0]) * u1, r[1] + (r[3] - r[1]) * v1];

/** Car rapide nicknames painted on the front and rear boards: Wolof words from the lexicon, in CLAD spelling
 * (teraanga « hospitalité », ndank ndank « petit à petit », jàmm « la paix »), painted in capitals. */
export const RAPIDE_NAMES: readonly string[] = ['teraanga', 'Ndank ndank', 'jàmm'].map(k => lex(k).wo.toUpperCase());
export const BUS_LINES = ['8  PIKINE', '15  PLATEAU', '23  PARCELLES'] as const;

type C2 = CanvasRenderingContext2D;
const P = (k: AtlasKey) => PX[k];

function star(c: C2, x: number, y: number, r: number, col: string) {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.fill();
}
function fitText(c: C2, text: string, maxW: number, size: number, weight = 900, style = 'italic') {
  c.font = `${style} ${weight} ${size}px system-ui, sans-serif`;
  while (c.measureText(text).width > maxW && size > 8) { size -= 1; c.font = `${style} ${weight} ${size}px system-ui, sans-serif`; }
}
function rim(c: C2, k: AtlasKey, draw: (cx: number, cy: number) => void) {
  const [x, y] = P(k), cx = x + 32, cy = y + 32;
  c.fillStyle = '#171717'; c.fillRect(x, y, 64, 64);
  c.fillStyle = '#1d1d1d'; c.beginPath(); c.arc(cx, cy, 31, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2c2c2c'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 27, 0, Math.PI * 2); c.stroke();
  draw(cx, cy);
}

export function drawVehicleAtlas(c: C2, g: C2) {
  // lamps --------------------------------------------------------------------------------------------------------
  { const [x, y] = P('head'); c.fillStyle = '#262626'; c.fillRect(x, y, 48, 48);
    const gr = c.createRadialGradient(x + 22, y + 21, 2, x + 24, y + 24, 20); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#f1ecd6'); gr.addColorStop(1, '#a9a596');
    c.fillStyle = gr; c.beginPath(); c.arc(x + 24, y + 24, 19, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d7dbdf'; c.lineWidth = 3; c.stroke();
    g.fillStyle = '#fff3d2'; g.beginPath(); g.arc(x + 24, y + 24, 18, 0, Math.PI * 2); g.fill(); }
  { const [x, y] = P('headRect'); c.fillStyle = '#1c1c1c'; c.fillRect(x, y, 64, 32);
    const gr = c.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, '#f7f7f2'); gr.addColorStop(1, '#a8acb0');
    c.fillStyle = gr; c.fillRect(x + 3, y + 4, 46, 24);
    c.fillStyle = '#e9e4cf'; for (const dx of [14, 36]) { c.beginPath(); c.arc(x + dx, y + 16, 8, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#f39c12'; c.fillRect(x + 51, y + 6, 10, 20);
    g.fillStyle = '#fff3d6'; g.fillRect(x + 4, y + 5, 44, 22); }
  { const [x, y] = P('tail'); c.fillStyle = '#2a0b0b'; c.fillRect(x, y, 64, 32);
    c.fillStyle = '#c81e1e'; c.fillRect(x + 3, y + 3, 42, 26); c.fillStyle = '#e04a3a'; for (let k = 0; k < 3; k++) c.fillRect(x + 6 + k * 13, y + 6, 10, 20);
    c.fillStyle = '#f0f0ea'; c.fillRect(x + 46, y + 3, 6, 26); c.fillStyle = '#f39c12'; c.fillRect(x + 53, y + 3, 8, 26);
    g.fillStyle = '#ff2a18'; g.fillRect(x + 3, y + 3, 42, 26); }
  { const [x, y] = P('lamp'); const gr = c.createRadialGradient(x + 16, y + 16, 1, x + 16, y + 16, 15); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#ffd27a');
    c.fillStyle = gr; c.fillRect(x, y, 32, 32); g.fillStyle = '#ffe2a0'; g.fillRect(x, y, 32, 32); }
  { const [x, y] = P('light'); c.fillStyle = '#f4f6f8'; c.fillRect(x, y, 64, 16); g.fillStyle = '#d8e8ff'; g.fillRect(x, y, 64, 16); }
  { const [x, y] = P('grille'); c.fillStyle = '#121212'; c.fillRect(x, y, 64, 32); c.fillStyle = '#3c3c3c'; for (let k = 3; k < 32; k += 5) c.fillRect(x + 2, y + k, 60, 2); }
  { const [x, y] = P('grilleChrome'); const gr = c.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, '#f3f5f7'); gr.addColorStop(0.5, '#9aa0a6'); gr.addColorStop(1, '#e2e5e8');
    c.fillStyle = gr; c.fillRect(x, y, 64, 32); c.fillStyle = '#0d0d0f'; c.fillRect(x + 4, y + 4, 56, 24);
    c.fillStyle = '#c9cdd2'; for (let k = 8; k < 60; k += 6) c.fillRect(x + k, y + 4, 2, 24); }
  { const [x, y] = P('plate'); c.fillStyle = '#f4f4ef'; c.fillRect(x, y, 64, 16); c.strokeStyle = '#111'; c.lineWidth = 1.5; c.strokeRect(x + 1.5, y + 1.5, 61, 13);
    c.fillStyle = '#222'; for (const [dx, w] of [[6, 4], [11, 4], [19, 4], [24, 4], [29, 4], [34, 4], [42, 4], [47, 4]]) c.fillRect(x + dx, y + 5, w - 1, 7); }
  { const [x, y] = P('taxiSign'); c.fillStyle = '#141414'; c.fillRect(x, y, 64, 32); c.fillStyle = '#f5c400'; c.fillRect(x, y, 64, 3); c.fillRect(x, y + 29, 64, 3);
    c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, 'TAXI', 56, 20, 900, 'normal'); c.fillText('TAXI', x + 32, y + 17);
    g.fillStyle = '#ffd23a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'TAXI', 56, 20, 900, 'normal'); g.fillText('TAXI', x + 32, y + 17); }
  // rims ---------------------------------------------------------------------------------------------------------
  rim(c, 'rimSteel', (cx, cy) => {
    c.fillStyle = '#8f959b'; c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5d6267'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.ellipse(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 3, 2, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#c4c8cc'; c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill();
  });
  rim(c, 'rimAlloy', (cx, cy) => {
    c.fillStyle = '#2b2d30'; c.beginPath(); c.arc(cx, cy, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d9dde2'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 22, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 6; c.lineCap = 'round'; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); c.stroke(); }
    c.fillStyle = '#eef0f2'; c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
  });
  rim(c, 'rimHubcap', (cx, cy) => {
    c.fillStyle = '#efeee8'; c.beginPath(); c.arc(cx, cy, 21, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b9bcc0'; c.lineWidth = 1.5; for (const r of [16, 10]) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#1d4f9c'; c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.fill();
  });
  rim(c, 'rimMoto', (cx, cy) => {
    c.strokeStyle = '#c9cdd2'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 24, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1; for (let k = 0; k < 18; k++) { const a = k * Math.PI / 9; c.beginPath(); c.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); c.lineTo(cx + Math.cos(a + 0.5) * 23, cy + Math.sin(a + 0.5) * 23); c.stroke(); }
    c.fillStyle = '#8c9196'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
  });
  rim(c, 'rimTruck', (cx, cy) => {
    c.fillStyle = '#b8352a'; c.beginPath(); c.arc(cx, cy, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a1a14'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.arc(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 2.6, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill(); c.fillStyle = '#9aa0a6'; c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
  });
  // bus destination boards (amber LED) -------------------------------------------------------------------------------
  BUS_LINES.forEach((t, i) => {
    const [x, y] = P(`dest${i}` as AtlasKey);
    c.fillStyle = '#0c0c0c'; c.fillRect(x, y, 256, 32); g.fillStyle = '#000'; g.fillRect(x, y, 256, 32);
    for (const ctx of [c, g]) { ctx.fillStyle = '#ffb000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; fitText(ctx, t, 236, 22, 800, 'normal'); ctx.fillText(t, x + 10, y + 17); }
  });
  // car rapide ---------------------------------------------------------------------------------------------------
  { const [x, y] = P('band'); c.fillStyle = '#f4f1e8'; c.fillRect(x, y, 512, 32);
    c.fillStyle = '#1d4f9c'; c.fillRect(x, y, 512, 3); c.fillRect(x, y + 29, 512, 3);
    for (let k = 0; k < 22; k++) {
      const bx = x + 6 + k * 23, col = k % 4 === 1 ? '#d33a2c' : k % 4 === 3 ? '#1d4f9c' : '#151515';
      c.fillStyle = col; c.beginPath(); c.moveTo(bx, y + 7); c.lineTo(bx + 12, y + 16); c.lineTo(bx, y + 25); c.lineTo(bx + 6, y + 25); c.lineTo(bx + 18, y + 16); c.lineTo(bx + 6, y + 7); c.fill();
    } }
  { const [x, y] = P('frieze'); c.fillStyle = '#1d4f9c'; c.fillRect(x, y, 512, 48);
    c.fillStyle = '#f2b705'; c.fillRect(x, y, 512, 3); c.fillRect(x, y + 45, 512, 3);
    for (let k = 0; k < 6; k++) {
      const cx = x + 44 + k * 85;
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(cx - 34, y + 24); c.lineTo(cx, y + 12); c.lineTo(cx + 34, y + 24); c.lineTo(cx, y + 36); c.fill();
      c.fillStyle = '#d33a2c'; c.beginPath(); c.moveTo(cx - 12, y + 24); c.lineTo(cx, y + 18); c.lineTo(cx + 12, y + 24); c.lineTo(cx, y + 30); c.fill();
      c.fillStyle = '#151515'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 40, y + 6); c.lineTo(cx + s * 50, y + 24); c.lineTo(cx + s * 40, y + 42); c.lineTo(cx + s * 44, y + 24); c.fill(); }
      c.fillStyle = '#f2b705'; c.fillRect(cx + 37, y + 22, 9, 4);
    } }
  // rear quarter panels: flowers and birds / fish and waves / painted eye
  { const [x, y] = P('panel0'); c.fillStyle = '#f2b705'; c.fillRect(x, y, 192, 128);
    c.fillStyle = '#1d4f9c'; c.fillRect(x + 8, y + 8, 176, 112); c.fillStyle = '#f4f1e8'; c.fillRect(x + 12, y + 12, 168, 104);
    c.strokeStyle = '#2f7d3a'; c.lineWidth = 3; for (const a of [-0.5, -0.2, 0.1, 0.4]) { c.beginPath(); c.moveTo(x + 96, y + 108); c.quadraticCurveTo(x + 96 + a * 60, y + 70, x + 96 + a * 110, y + 40); c.stroke(); }
    const fl = (fx: number, fy: number, col: string) => { c.fillStyle = col; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.ellipse(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8, 7, 4, a, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#f2b705'; c.beginPath(); c.arc(fx, fy, 4, 0, Math.PI * 2); c.fill(); };
    fl(x + 41, y + 42, '#d33a2c'); fl(x + 84, y + 34, '#c2417f'); fl(x + 108, y + 52, '#e8742c'); fl(x + 140, y + 38, '#d33a2c');
    c.fillStyle = '#4fb26a'; for (const [lx, ly] of [[70, 80], [120, 76], [96, 92]]) { c.beginPath(); c.ellipse(x + lx, y + ly, 10, 4, 0.6, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#1d4f9c'; c.lineWidth = 3; for (const [bx, by] of [[40, 90], [150, 88]]) { c.beginPath(); c.moveTo(bx + x - 12, y + by); c.quadraticCurveTo(x + bx - 5, y + by - 8, x + bx, y + by); c.quadraticCurveTo(x + bx + 5, y + by - 8, x + bx + 12, y + by); c.stroke(); } }
  { const [x, y] = P('panel1'); c.fillStyle = '#1d4f9c'; c.fillRect(x, y, 192, 128);
    c.strokeStyle = '#f2b705'; c.lineWidth = 4; c.strokeRect(x + 6, y + 6, 180, 116);
    c.strokeStyle = '#7fd3e8'; c.lineWidth = 4; for (let r = 0; r < 3; r++) { c.beginPath(); for (let k = 0; k <= 12; k++) c.lineTo(x + 10 + k * 14.5, y + 92 + r * 10 + Math.sin(k * 1.4 + r) * 4); c.stroke(); }
    const fish = (fx: number, fy: number, s: number, col: string) => { c.fillStyle = col; c.beginPath(); c.ellipse(fx, fy, 18 * s, 8 * s, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(fx + 16 * s, fy); c.lineTo(fx + 30 * s, fy - 9 * s); c.lineTo(fx + 30 * s, fy + 9 * s); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(fx - 10 * s, fy - 2 * s, 2.5 * s, 0, Math.PI * 2); c.fill(); };
    fish(x + 54, y + 44, 1.2, '#f2b705'); fish(x + 128, y + 64, 1.0, '#e8742c'); fish(x + 70, y + 76, 0.8, '#ffffff');
    for (const [sx, sy] of [[150, 26], [24, 26], [110, 22]]) star(c, x + sx, y + sy, 7, '#f2b705'); }
  { const [x, y] = P('panel2'); c.fillStyle = '#f2b705'; c.fillRect(x, y, 192, 128);
    for (let k = 0; k < 16; k++) { c.fillStyle = ['#d33a2c', '#1a9d54', '#1d4f9c'][k % 3]; c.beginPath(); c.moveTo(x + k * 12, y); c.lineTo(x + k * 12 + 6, y + 10); c.lineTo(x + k * 12 + 12, y); c.fill(); c.beginPath(); c.moveTo(x + k * 12, y + 128); c.lineTo(x + k * 12 + 6, y + 118); c.lineTo(x + k * 12 + 12, y + 128); c.fill(); }
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + 22, y + 64); c.quadraticCurveTo(x + 96, y + 8, x + 170, y + 64); c.quadraticCurveTo(x + 96, y + 120, x + 22, y + 64); c.fill();
    c.strokeStyle = '#151515'; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#2f7fd1'; c.beginPath(); c.arc(x + 96, y + 64, 26, 0, Math.PI * 2); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(x + 96, y + 64, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 88, y + 56, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#151515'; c.lineWidth = 3; for (let k = 0; k < 7; k++) { const t = 0.2 + k * 0.1, ex = x + 22 + (148 * t), ey = y + 64 - Math.sin(t * Math.PI) * 32; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + (t - 0.5) * 16, ey - 12); c.stroke(); } }
  RAPIDE_NAMES.forEach((t, i) => {
    const [x, y] = P(`name${i}` as AtlasKey);
    c.fillStyle = '#f4f1e8'; c.fillRect(x, y, 256, 40); c.fillStyle = '#d33a2c'; c.fillRect(x, y, 256, 3); c.fillStyle = '#1a9d54'; c.fillRect(x, y + 37, 256, 3);
    star(c, x + 16, y + 20, 9, '#f2b705'); star(c, x + 240, y + 20, 9, '#f2b705');
    c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, t, 196, 28);
    c.fillStyle = '#d33a2c'; c.fillText(t, x + 129, y + 22); c.fillStyle = '#1d4f9c'; c.fillText(t, x + 128, y + 20);
  });
  { const [x, y] = P('front'); c.fillStyle = '#f2b705'; c.fillRect(x, y, 192, 96); c.fillStyle = '#1d4f9c'; c.fillRect(x, y + 56, 192, 40);
    c.strokeStyle = '#1d4f9c'; c.lineWidth = 7; for (const o of [0, 13]) { c.beginPath(); c.moveTo(x, y + 14 + o); c.lineTo(x + 70, y + 14 + o); c.lineTo(x + 96, y + 48 + o * 0.4); c.lineTo(x + 122, y + 14 + o); c.lineTo(x + 192, y + 14 + o); c.stroke(); }
    c.fillStyle = '#111'; c.fillRect(x + 58, y + 40, 76, 26); c.fillStyle = '#3a3a3a'; for (let k = 0; k < 5; k++) c.fillRect(x + 61, y + 43 + k * 5, 70, 2);
    c.fillStyle = '#f39c12'; c.fillRect(x + 16, y + 66, 18, 7); c.fillRect(x + 158, y + 66, 18, 7);
    c.fillStyle = '#ffffff'; for (const ex of [26, 166]) { for (let k = 0; k < 5; k++) { const a = Math.PI + 0.35 + k * 0.6; c.fillRect(x + ex + Math.cos(a) * 22, y + 36 + Math.sin(a) * 22, 3, 3); } }
    for (const [i, col] of ['#1a9d54', '#f2b705', '#d33a2c'].entries()) { c.fillStyle = col; c.fillRect(x + 84 + i * 8, y + 74, 8, 14); } }
  { const [x, y] = P('rear'); c.fillStyle = '#f2b705'; c.fillRect(x, y, 192, 96); c.fillStyle = '#1d4f9c'; c.fillRect(x, y + 60, 192, 36);
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#d33a2c' : '#1d4f9c'; c.fillRect(x, y + 10 + k * 9, 192, 4); }
    star(c, x + 48, y + 78, 9, '#f2b705'); star(c, x + 144, y + 78, 9, '#f2b705'); }
  // bus side strip: swoosh and the fictional line name
  { const [x, y] = P('busSide'); c.fillStyle = '#f4f4f2'; c.fillRect(x, y, 512, 48);
    c.fillStyle = '#f2c21a'; c.beginPath(); c.moveTo(x, y + 40); c.quadraticCurveTo(x + 260, y + 6, x + 512, y + 18); c.lineTo(x + 512, y + 26); c.quadraticCurveTo(x + 260, y + 16, x, y + 48); c.fill();
    c.fillStyle = '#1a9d54'; c.beginPath(); c.moveTo(x, y + 48); c.quadraticCurveTo(x + 260, y + 18, x + 512, y + 30); c.lineTo(x + 512, y + 36); c.quadraticCurveTo(x + 260, y + 26, x + 20, y + 48); c.fill();
    c.fillStyle = '#1a3f8f'; c.textAlign = 'left'; c.textBaseline = 'middle'; fitText(c, 'SAMA BUS', 170, 26); c.fillText('SAMA BUS', x + 300, y + 14);
    c.fillStyle = '#1a3f8f'; c.beginPath(); c.arc(x + 280, y + 14, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f4f4f2'; c.beginPath(); c.arc(x + 280, y + 14, 4, 0, Math.PI * 2); c.fill(); }
  { const [x, y] = P('seatFabric'); c.fillStyle = '#2b3f7a'; c.fillRect(x, y, 64, 64);
    for (let k = 0; k < 64; k += 8) for (let j = 0; j < 64; j += 8) { c.fillStyle = (k + j) % 16 ? '#c33b2f' : '#f2b705'; c.fillRect(x + k + 2, y + j + 2, 3, 3); } }
  { const [x, y] = P('truckBoard'); c.fillStyle = '#c0392b'; c.fillRect(x, y, 256, 48); c.strokeStyle = '#f2c21a'; c.lineWidth = 4; c.strokeRect(x + 3, y + 3, 250, 42);
    c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, 'DAKAR · THIÈS', 190, 24);
    c.fillStyle = '#1d4f9c'; c.fillText('DAKAR · THIÈS', x + 130, y + 26); c.fillStyle = '#ffffff'; c.fillText('DAKAR · THIÈS', x + 128, y + 24);
    star(c, x + 18, y + 24, 8, '#f2c21a'); star(c, x + 238, y + 24, 8, '#f2c21a'); }
  { const [x, y] = P('slats'); const cols = ['#c0392b', '#1a9d54', '#f2c21a', '#1d4f9c', '#e8742c', '#c0392b', '#1a9d54', '#f2c21a'];
    cols.forEach((col, k) => { c.fillStyle = col; c.fillRect(x, y + k * 8, 128, 7); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y + k * 8 + 7, 128, 1); });
    c.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 40; k++) c.fillRect(x + ((k * 37) % 128), y + ((k * 23) % 64), 6, 1);
    c.fillStyle = '#5b4632'; for (const dx of [0, 62, 124]) c.fillRect(x + dx, y, 4, 64); }
}
