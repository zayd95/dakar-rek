import { atlasRect, type Rect } from './kitGeometry';

/**
 * Paint atlas of the furniture kit (512 × 512 colour, 128 × 128 glow), drawn in code: wax-style prints of our own,
 * woven mats, rugs, prayer mats with a plain arch and geometric borders (no text), screens, mirror, tiles, a display
 * cabinet with tea glasses and plates. No brand, logo or real product.
 */
export const FW = 512, FH = 768;
/**
 * Free space, for the catalogue's second round (docs/ld2/LD2_C.md): the comfort lane paints in x 0…255, y 480…767; the decoration lane in
 * x 256…511, y 480…767. Each lane adds its rects to `PX` and its drawing to `drawFurnitureAtlas` in its own marked block.
 */
const PX = {
  plain: [0, 0, 16, 16], wax0: [16, 0, 64, 64], wax1: [80, 0, 64, 64], wax2: [144, 0, 64, 64], velvet: [208, 0, 64, 64], fabric: [272, 0, 64, 64],
  natte: [336, 0, 64, 64], plasticMat: [400, 0, 64, 64], canvas: [464, 0, 48, 64],
  rug1: [0, 64, 128, 96], rug2: [128, 64, 128, 96], prayer0: [256, 64, 64, 96], prayer1: [320, 64, 64, 96], prayer2: [384, 64, 64, 96],
  crt: [448, 64, 64, 48], flat: [448, 112, 64, 40],
  mirror: [0, 160, 64, 128], wood: [64, 160, 64, 64], carved: [128, 160, 64, 64], gold: [192, 160, 32, 32], shade: [224, 160, 32, 32], bulb: [256, 160, 16, 16],
  vitrine: [272, 160, 64, 96], books: [336, 160, 64, 32], fan: [400, 160, 48, 48], laptop: [448, 160, 48, 32],
  tiles: [0, 288, 64, 64], marble: [64, 288, 64, 64], hob: [128, 288, 64, 32], sink: [192, 288, 64, 32], curtain: [256, 288, 64, 64], leather: [320, 288, 64, 64],
  rattan: [384, 288, 64, 64], cloth: [448, 288, 64, 64],
  // LD2.0-C (the furnishing upgrade): pictures, canvas, towels, speaker cloth, a microwave's door, a calabash, a LED strip
  art0: [0, 352, 64, 96], art1: [64, 352, 72, 96], art2: [136, 352, 144, 96],
  stripes0: [280, 352, 64, 64], stripes1: [344, 352, 64, 64], towel: [408, 352, 48, 64], grille: [456, 352, 48, 64],
  mwave: [280, 416, 64, 32], calabash: [344, 416, 64, 64], led: [408, 416, 16, 16],
  // ---- the catalogue's second round, comfort lane (K-C): its rects here, inside x 0…255, y 480…767
  //
  // (the comfort lane's rects above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its rects here, inside x 256…511, y 480…767
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type FurnKey = keyof typeof PX;
export const FUV = Object.fromEntries(Object.entries(PX).map(([k, [x, y, w, h]]) => [k, atlasRect(x, y, w, h, FW, FH)])) as Record<FurnKey, Rect>;
export const FPLAIN: [number, number] = [8 / FW, 1 - 8 / FH];

type C2 = CanvasRenderingContext2D;
const P = (k: FurnKey) => PX[k];

function wax(c: C2, k: FurnKey, a: string, b: string, d: string, e: string) {
  const [x, y] = P(k); c.fillStyle = a; c.fillRect(x, y, 64, 64);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = x + 8 + i * 16, cy = y + 8 + j * 16;
    c.fillStyle = b; c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = d; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = e; c.fillRect(cx + 6, cy + 6, 3, 3);
  }
}
function rugBorder(c: C2, x: number, y: number, w: number, h: number, field: string, border: string, motif: string) {
  c.fillStyle = border; c.fillRect(x, y, w, h); c.fillStyle = field; c.fillRect(x + 8, y + 8, w - 16, h - 16);
  c.fillStyle = motif; for (let k = x + 10; k < x + w - 10; k += 8) { c.fillRect(k, y + 3, 4, 3); c.fillRect(k, y + h - 6, 4, 3); }
  for (let k = y + 10; k < y + h - 10; k += 8) { c.fillRect(x + 3, k, 3, 4); c.fillRect(x + w - 6, k, 3, 4); }
}
function diamond(c: C2, cx: number, cy: number, rx: number, ry: number, col: string) { c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy - ry); c.lineTo(cx + rx, cy); c.lineTo(cx, cy + ry); c.lineTo(cx - rx, cy); c.fill(); }

export function drawFurnitureAtlas(c: C2, g: C2) {
  wax(c, 'wax0', '#c2417f', '#f4c20d', '#1a9d54', '#ffffff');
  wax(c, 'wax1', '#1f5aa8', '#f4c20d', '#f2f2ec', '#d9322b');
  { const [x, y] = P('wax2'); c.fillStyle = '#7a1424'; c.fillRect(x, y, 64, 64);      // damask-like satin: deep red with gold scrolls
    c.strokeStyle = '#d4a944'; c.lineWidth = 2; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const cx = x + 16 + i * 32, cy = y + 16 + j * 32; c.beginPath(); c.ellipse(cx, cy, 11, 7, 0.6, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(cx, cy, 5, 10, -0.4, 0, Math.PI * 2); c.stroke(); } }
  { const [x, y] = P('velvet'); const gr = c.createLinearGradient(x, y, x + 64, y + 64); gr.addColorStop(0, '#8a1a2a'); gr.addColorStop(0.5, '#b0283c'); gr.addColorStop(1, '#7a1424');
    c.fillStyle = gr; c.fillRect(x, y, 64, 64); c.strokeStyle = '#d4a944'; c.lineWidth = 1.5; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 32, y + 32, 8 + k * 9, 0, Math.PI * 2); c.stroke(); } }
  { const [x, y] = P('fabric'); c.fillStyle = '#d8d8d8'; c.fillRect(x, y, 64, 64); c.fillStyle = '#c4c4c4'; for (let k = 0; k < 64; k += 4) { c.fillRect(x + k, y, 1, 64); c.fillRect(x, y + k + 2, 64, 1); } }
  { const [x, y] = P('natte'); c.fillStyle = '#d9b77a'; c.fillRect(x, y, 64, 64);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { c.fillStyle = (i + j) % 2 ? '#c49a58' : '#e6c98f'; c.fillRect(x + i * 8, y + j * 8, 8, 8); }
    c.fillStyle = '#8a2f2a'; c.fillRect(x, y + 28, 64, 4); c.fillStyle = '#2f6b45'; c.fillRect(x, y + 34, 64, 3); }
  { const [x, y] = P('plasticMat'); const cols = ['#d9322b', '#f2f2ec', '#1a9d54', '#f4c20d', '#2f6fb3', '#f2f2ec'];
    for (let k = 0; k < 16; k++) { c.fillStyle = cols[k % cols.length]; c.fillRect(x + k * 4, y, 4, 64); } c.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 64; k += 3) c.fillRect(x, y + k, 64, 1); }
  { const [x, y] = P('canvas'); c.fillStyle = '#2f6fb3'; c.fillRect(x, y, 48, 64);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { const cx = x + 8 + i * 16, cy = y + 8 + j * 16; c.fillStyle = '#f4c20d'; for (let p = 0; p < 5; p++) { const a = p * 1.2566; c.beginPath(); c.arc(cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5, 2.5, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#d9322b'; c.beginPath(); c.arc(cx, cy, 2, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#d0d0d0'; c.fillRect(x + 23, y, 2, 64); }
  { const [x, y] = P('rug1'); rugBorder(c, x, y, 128, 96, '#2a5b8f', '#b5452b', '#f2d16b');
    for (let i = 0; i < 4; i++) diamond(c, x + 22 + i * 28, y + 48, 11, 20, i % 2 ? '#f2d16b' : '#e8742c'); }
  { const [x, y] = P('rug2'); rugBorder(c, x, y, 128, 96, '#7a1424', '#1f2a4a', '#d4a944');
    c.fillStyle = '#f0e1c0'; for (let k = 0; k < 128; k += 4) { c.fillRect(x + k, y, 2, 3); c.fillRect(x + k, y + 93, 2, 3); }
    diamond(c, x + 64, y + 48, 34, 30, '#1f2a4a'); diamond(c, x + 64, y + 48, 24, 21, '#d4a944'); diamond(c, x + 64, y + 48, 12, 11, '#7a1424');
    for (const [dx, dy] of [[24, 24], [104, 24], [24, 72], [104, 72]]) diamond(c, x + dx, y + dy, 8, 8, '#d4a944'); }
  // prayer mats: a plain arch at the far end (-z) and geometric borders; no text
  const prayer = (k: FurnKey, field: string, border: string, line: string, rich: boolean) => {
    const [x, y] = P(k); c.fillStyle = border; c.fillRect(x, y, 64, 96); c.fillStyle = field; c.fillRect(x + 5, y + 5, 54, 86);
    c.strokeStyle = line; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 14, y + 86); c.lineTo(x + 14, y + 30); c.quadraticCurveTo(x + 32, y + 8, x + 50, y + 30); c.lineTo(x + 50, y + 86); c.stroke();
    if (rich) { for (let k2 = 0; k2 < 4; k2++) diamond(c, x + 32, y + 40 + k2 * 12, 6, 5, line); c.fillStyle = line; for (let k2 = x + 6; k2 < x + 58; k2 += 6) c.fillRect(k2, y + 1, 3, 3); }
  };
  prayer('prayer0', '#2f6b45', '#1f4a30', '#d9c58a', false);
  prayer('prayer1', '#1f4f7a', '#b5452b', '#f2d16b', true);
  prayer('prayer2', '#6a1020', '#2a1a10', '#d4a944', true);
  // screens (glow): an abstract evening landscape, no channel, logo or real programme
  const screen = (k: FurnKey, w: number, h: number) => {
    const [x, y] = P(k);
    for (const ctx of [c, g]) { const gr = ctx.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#3a6fb0'); gr.addColorStop(0.6, '#e8a04a'); gr.addColorStop(1, '#2f5a3a'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#1d3a2a'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.3, y + h * 0.62); ctx.lineTo(x + w * 0.55, y + h * 0.8); ctx.lineTo(x + w * 0.8, y + h * 0.55); ctx.lineTo(x + w, y + h); ctx.fill(); }
  };
  screen('crt', 64, 48); screen('flat', 64, 40);
  { const [x, y] = P('laptop'); for (const ctx of [c, g]) { ctx.fillStyle = '#d8e6f4'; ctx.fillRect(x, y, 48, 32); ctx.fillStyle = '#7fa6d0'; ctx.fillRect(x + 4, y + 4, 40, 6); ctx.fillStyle = '#9fb8d4'; for (let k = 0; k < 4; k++) ctx.fillRect(x + 4, y + 14 + k * 4, 26 - k * 3, 2); } }
  { const [x, y] = P('mirror'); const gr = c.createLinearGradient(x, y, x + 64, y + 128); gr.addColorStop(0, '#e8f0f4'); gr.addColorStop(0.45, '#b9c9d3'); gr.addColorStop(0.55, '#d6e2e8'); gr.addColorStop(1, '#8fa3b0');
    c.fillStyle = gr; c.fillRect(x, y, 64, 128); c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(x + 10, y + 128); c.lineTo(x + 22, y + 128); c.lineTo(x + 54, y); c.lineTo(x + 42, y); c.fill(); }
  { const [x, y] = P('wood'); c.fillStyle = '#e8e8e8'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#c8c8c8'; c.lineWidth = 1;
    for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(x, y + 4 + k * 7); c.bezierCurveTo(x + 20, y + k * 7, x + 40, y + 9 + k * 7, x + 64, y + 4 + k * 7); c.stroke(); } }
  { const [x, y] = P('carved'); c.fillStyle = '#e0e0e0'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#9a9a9a'; c.lineWidth = 3; c.strokeRect(x + 5, y + 5, 54, 54);
    c.lineWidth = 2; c.beginPath(); c.arc(x + 32, y + 32, 14, 0, Math.PI * 2); c.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(x + 32 + Math.cos(a) * 14, y + 32 + Math.sin(a) * 14); c.lineTo(x + 32 + Math.cos(a) * 24, y + 32 + Math.sin(a) * 24); c.stroke(); } }
  { const [x, y] = P('gold'); const gr = c.createLinearGradient(x, y, x + 32, y + 32); gr.addColorStop(0, '#f6dc8a'); gr.addColorStop(0.5, '#b8862e'); gr.addColorStop(1, '#f0cf6e'); c.fillStyle = gr; c.fillRect(x, y, 32, 32); }
  { const [x, y] = P('shade'); const gr = c.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, '#fff3d0'); gr.addColorStop(1, '#f0c879'); c.fillStyle = gr; c.fillRect(x, y, 32, 32); g.fillStyle = '#c08a40'; g.fillRect(x, y, 32, 32); }
  { const [x, y] = P('bulb'); c.fillStyle = '#ffffff'; c.fillRect(x, y, 16, 16); g.fillStyle = '#fff0c8'; g.fillRect(x, y, 16, 16); }
  { const [x, y] = P('vitrine'); c.fillStyle = '#3a2416'; c.fillRect(x, y, 64, 96); c.fillStyle = '#c9dbe4'; c.fillRect(x + 4, y + 4, 56, 88);
    for (let s = 0; s < 3; s++) { const sy = y + 30 + s * 30; c.fillStyle = '#6b4a2e'; c.fillRect(x + 4, sy, 56, 3);
      for (let k = 0; k < 6; k++) { c.fillStyle = s === 1 ? '#f2f2ec' : '#e8f4ff'; if (s === 1) { c.beginPath(); c.arc(x + 10 + k * 9, sy - 9, 6, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d4a944'; c.lineWidth = 1; c.stroke(); } else { c.fillRect(x + 8 + k * 9, sy - 12, 5, 12); c.fillStyle = '#d4a944'; c.fillRect(x + 8 + k * 9, sy - 12, 5, 2); } } }
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.moveTo(x + 8, y + 92); c.lineTo(x + 16, y + 92); c.lineTo(x + 40, y + 4); c.lineTo(x + 32, y + 4); c.fill(); c.fillStyle = '#3a2416'; c.fillRect(x + 31, y, 3, 96); }
  { const [x, y] = P('books'); const cols = ['#8a1c1c', '#1f3f78', '#2e6b3a', '#c49a2a', '#5a3a6a', '#d9d2c4', '#1a1a1a'];
    let bx = x; let k = 0; while (bx < x + 62) { const w = 4 + (k * 7) % 5, h = 22 + (k * 5) % 9; c.fillStyle = cols[k % cols.length]; c.fillRect(bx, y + 32 - h, w, h); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(bx + 1, y + 34 - h, w - 2, 1); bx += w + 1; k++; } }
  { const [x, y] = P('fan'); c.fillStyle = '#2a2a2a'; c.fillRect(x, y, 48, 48); c.fillStyle = '#dfe6ea'; c.beginPath(); c.arc(x + 24, y + 24, 23, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8fc0e0'; for (let k = 0; k < 3; k++) { const a = k * 2.094; c.beginPath(); c.ellipse(x + 24 + Math.cos(a) * 11, y + 24 + Math.sin(a) * 11, 10, 6, a, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#9aa0a6'; c.lineWidth = 1; for (let r = 6; r < 24; r += 4) { c.beginPath(); c.arc(x + 24, y + 24, r, 0, Math.PI * 2); c.stroke(); } c.fillStyle = '#555'; c.beginPath(); c.arc(x + 24, y + 24, 4, 0, Math.PI * 2); c.fill(); }
  { const [x, y] = P('tiles'); c.fillStyle = '#9fb4bf'; c.fillRect(x, y, 64, 64); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.fillStyle = (i + j) % 3 ? '#f2f4f4' : '#cfe3ea'; c.fillRect(x + i * 16 + 1, y + j * 16 + 1, 14, 14); } }
  { const [x, y] = P('marble'); c.fillStyle = '#f1efea'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#b9b4ab'; c.lineWidth = 1;
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x + k * 12, y); c.bezierCurveTo(x + k * 12 + 20, y + 20, x + k * 12 - 10, y + 40, x + k * 12 + 14, y + 64); c.stroke(); } }
  { const [x, y] = P('hob'); c.fillStyle = '#1c1c1e'; c.fillRect(x, y, 64, 32); for (const [cx, r] of [[16, 9], [48, 9]] as const) { c.strokeStyle = '#6a6e73'; c.lineWidth = 3; c.beginPath(); c.arc(x + cx, y + 16, r, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#3a3a3c'; c.beginPath(); c.arc(x + cx, y + 16, 4, 0, Math.PI * 2); c.fill(); } }
  { const [x, y] = P('sink'); c.fillStyle = '#c9cdd2'; c.fillRect(x, y, 64, 32); c.fillStyle = '#8f959b'; c.fillRect(x + 6, y + 5, 52, 22); c.fillStyle = '#5a5e63'; c.beginPath(); c.arc(x + 32, y + 16, 3, 0, Math.PI * 2); c.fill(); }
  { const [x, y] = P('curtain'); c.fillStyle = '#f2f2ec'; c.fillRect(x, y, 64, 64); for (let k = 0; k < 64; k += 8) { c.fillStyle = k % 16 ? '#3a8fd1' : '#7fc4e8'; c.fillRect(x + k, y, 4, 64); } c.fillStyle = 'rgba(0,0,0,0.1)'; for (let k = 0; k < 64; k += 6) c.fillRect(x + k, y, 1, 64); }
  { const [x, y] = P('leather'); c.fillStyle = '#3a2418'; c.fillRect(x, y, 64, 64); c.fillStyle = '#4a3020'; for (let k = 0; k < 40; k++) c.fillRect(x + ((k * 37) % 64), y + ((k * 23) % 64), 3, 2); c.strokeStyle = '#2a180e'; c.strokeRect(x + 4, y + 4, 56, 56); }
  { const [x, y] = P('rattan'); c.fillStyle = '#c9a46a'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#8f6a3a'; c.lineWidth = 1.5;
    for (let k = -64; k < 64; k += 6) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + 64, y + 64); c.stroke(); c.beginPath(); c.moveTo(x + k + 64, y); c.lineTo(x + k, y + 64); c.stroke(); } }
  wax(c, 'cloth', '#f4f1e8', '#d9322b', '#2f6fb3', '#1a9d54');
  drawHomeAtlas(c, g);
}

/**
 * The LD2.0-C pieces' paint (src/world/furnitureKit.ts « the furnishing upgrade »): three pictures of our own (a baobab at dusk, a sous-verre in the
 * Senegalese reverse-glass manner, a large canvas of pirogues at sea), striped canvas, a towel, speaker cloth, a microwave's door with its lit display,
 * a calabash's pyrography and a LED strip. No text, brand or real artwork.
 */
function drawHomeAtlas(c: C2, g: C2) {
  { const [x, y] = P('art0'); const gr = c.createLinearGradient(x, y, x, y + 96); gr.addColorStop(0, '#f6c35b'); gr.addColorStop(0.55, '#e8742c'); gr.addColorStop(1, '#8a2f2a');
    c.fillStyle = gr; c.fillRect(x, y, 64, 96); c.fillStyle = '#fff1c8'; c.beginPath(); c.arc(x + 42, y + 30, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(x, y + 80, 64, 16);
    c.beginPath(); c.moveTo(x + 22, y + 82); c.lineTo(x + 25, y + 52); c.lineTo(x + 35, y + 52); c.lineTo(x + 38, y + 82); c.fill();   // a baobab's trunk
    for (const [dx, dy, r] of [[18, 46, 7], [30, 42, 9], [42, 47, 7], [24, 38, 5], [36, 36, 5]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#2a1a10'; c.lineWidth = 2; for (const [a, b] of [[14, 40], [46, 41], [30, 30]]) { c.beginPath(); c.moveTo(x + 30, y + 52); c.lineTo(x + a, y + b); c.stroke(); }
    c.strokeStyle = '#fff1c8'; c.lineWidth = 1; c.strokeRect(x + 3.5, y + 3.5, 57, 89); }
  { const [x, y] = P('art1'); c.fillStyle = '#111111'; c.fillRect(x, y, 72, 96);                       // sous-verre: flat bright colours, black outlines, a dotted border
    c.fillStyle = '#d9322b'; for (let k = 0; k < 72; k += 6) { c.fillRect(x + k + 1, y + 2, 3, 3); c.fillRect(x + k + 1, y + 91, 3, 3); } for (let k = 6; k < 90; k += 6) { c.fillRect(x + 2, y + k, 3, 3); c.fillRect(x + 67, y + k, 3, 3); }
    c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(x + 54, y + 20, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1f5aa8'; c.beginPath(); c.moveTo(x + 36, y + 40); c.lineTo(x + 20, y + 84); c.lineTo(x + 52, y + 84); c.fill();       // a woman's boubou
    c.fillStyle = '#f4c20d'; for (const [dx, dy] of [[34, 56], [30, 66], [40, 66], [26, 76], [36, 76], [46, 76]]) { c.beginPath(); c.arc(x + dx, y + dy, 2.5, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#6b3a1f'; c.beginPath(); c.arc(x + 36, y + 34, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a9d54'; c.fillRect(x + 28, y + 24, 16, 5);                                                                         // her head tie
    c.fillStyle = '#e8742c'; c.beginPath(); c.ellipse(x + 36, y + 19, 11, 5, 0, 0, Math.PI * 2); c.fill();                              // the calabash she carries
    c.strokeStyle = '#000000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 36, y + 40); c.lineTo(x + 20, y + 84); c.lineTo(x + 52, y + 84); c.closePath(); c.stroke();
    c.fillStyle = '#1a9d54'; for (const sx of [10, 62]) { c.fillRect(x + sx - 1, y + 60, 2, 26); c.beginPath(); c.ellipse(x + sx, y + 58, 5, 9, 0, 0, Math.PI * 2); c.fill(); } }
  { const [x, y] = P('art2'); const gr = c.createLinearGradient(x, y, x, y + 56); gr.addColorStop(0, '#2a2f6a'); gr.addColorStop(0.6, '#c45a3a'); gr.addColorStop(1, '#f2a03a');
    c.fillStyle = gr; c.fillRect(x, y, 144, 56); c.fillStyle = '#1f4f7a'; c.fillRect(x, y + 56, 144, 40);
    c.fillStyle = 'rgba(255,255,255,0.25)'; for (let k = 0; k < 14; k++) c.fillRect(x + ((k * 29) % 140), y + 60 + (k % 5) * 7, 10 + (k % 3) * 4, 1.5);
    c.fillStyle = '#f6dc8a'; c.beginPath(); c.arc(x + 104, y + 44, 10, Math.PI, 0); c.fill();
    const boat = (bx: number, by: number, len: number, cols: string[]) => { c.fillStyle = cols[0]; c.beginPath(); c.moveTo(bx, by - 4); c.lineTo(bx + len, by - 6); c.lineTo(bx + len - 6, by + 3); c.lineTo(bx + 5, by + 3); c.fill();
      c.fillStyle = cols[1]; c.fillRect(bx + 6, by - 3, len - 14, 2); c.fillStyle = cols[2]; for (let k = 0; k < 3; k++) c.fillRect(bx + 10 + k * (len - 20) / 3, by - 9, 2, 6); };
    boat(x + 12, y + 70, 46, ['#d9322b', '#f4c20d', '#1a1a1a']); boat(x + 70, y + 80, 52, ['#1a9d54', '#f2f2ec', '#1a1a1a']); boat(x + 58, y + 64, 28, ['#f4c20d', '#1f5aa8', '#1a1a1a']); }
  const stripes = (k: FurnKey, cols: string[]) => { const [x, y, w, h] = PX[k]; for (let i = 0; i < w; i += 8) { c.fillStyle = cols[(i / 8) % cols.length]; c.fillRect(x + i, y, 8, h); } };
  stripes('stripes0', ['#d9322b', '#f6f1e4']); stripes('stripes1', ['#1f5aa8', '#f6f1e4', '#f4c20d', '#f6f1e4']);
  { const [x, y] = P('towel'); c.fillStyle = '#f6f4ee'; c.fillRect(x, y, 48, 64); c.fillStyle = '#2f6fb3'; c.fillRect(x, y + 6, 48, 4); c.fillRect(x, y + 54, 48, 4); c.fillStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < 48; k += 2) c.fillRect(x + k, y, 1, 64); }
  { const [x, y] = P('grille'); c.fillStyle = '#2a2a2c'; c.fillRect(x, y, 48, 64); c.fillStyle = '#343438'; for (let j = 0; j < 64; j += 2) for (let i = (j / 2) % 2; i < 48; i += 2) c.fillRect(x + i, y + j, 1, 1); }
  { const [x, y] = P('mwave'); c.fillStyle = '#1b1e22'; c.fillRect(x, y, 46, 32); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(x + 6, y + 30); c.lineTo(x + 14, y + 30); c.lineTo(x + 30, y + 2); c.lineTo(x + 22, y + 2); c.fill();
    c.fillStyle = '#9aa0a6'; c.fillRect(x + 46, y, 18, 32); c.fillStyle = '#5a5e63'; for (let k = 0; k < 6; k++) c.fillRect(x + 49 + (k % 2) * 7, y + 12 + Math.floor(k / 2) * 6, 5, 4);
    for (const ctx of [c, g]) { ctx.fillStyle = '#7dffb0'; ctx.fillRect(x + 48, y + 3, 14, 6); } }
  { const [x, y] = P('calabash'); c.fillStyle = '#c99a55'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#5a3416'; c.lineWidth = 1.5;
    for (let j = 0; j < 4; j++) { const yy = y + 8 + j * 16; c.beginPath(); for (let i = 0; i <= 8; i++) c.lineTo(x + i * 8, yy + (i % 2 ? -5 : 5)); c.stroke(); }
    c.fillStyle = '#5a3416'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const cx = x + 8 + i * 16, cy = y + 16 + j * 16; c.beginPath(); c.moveTo(cx, cy - 3); c.lineTo(cx + 3, cy + 2); c.lineTo(cx - 3, cy + 2); c.fill(); } }
  { const [x, y] = P('led'); c.fillStyle = '#ffffff'; c.fillRect(x, y, 16, 16); g.fillStyle = '#fff6e0'; g.fillRect(x, y, 16, 16); }
  // ---- the catalogue's second round, comfort lane (K-C): its drawing here
  //
  // (the comfort lane's drawing above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its drawing here
}
