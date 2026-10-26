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
  // two wax prints of our own, buttoned velvet and leather, a Senegalese leather pouf's embossed side and top, an ivory brocade, tan leather, brass nailheads
  waxA: [0, 480, 64, 64], waxB: [64, 480, 64, 64], velvetTuft: [128, 480, 64, 64], leatherTuft: [192, 480, 64, 64],
  poufSide: [0, 544, 128, 48], poufTop: [128, 544, 64, 64], brocade: [192, 544, 64, 64], leatherTan: [0, 608, 64, 64], nailFront: [64, 608, 32, 64],
  //
  // (the comfort lane's rects above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its rects here, inside x 256…511, y 480…767
  basket0: [256, 480, 48, 48], basket1: [304, 480, 48, 48], basket2: [352, 480, 48, 48], pierced: [400, 480, 32, 48], lampGlass: [432, 480, 32, 32],
  flame: [464, 480, 16, 16], crystal: [464, 496, 16, 16], glaze: [480, 480, 32, 32], clayBand: [432, 512, 32, 16],
  raffia: [256, 528, 32, 96], carvedPanel: [288, 528, 32, 96], lacquer: [320, 528, 128, 96], aquaFresh: [256, 624, 96, 48], aquaSea: [352, 624, 128, 48],
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
  {
    // each paint stays inside its own rect (no bleeding into a neighbour's)
    const within = (k: FurnKey, draw: (x: number, y: number, w: number, h: number) => void) => { const [x, y, w, h] = PX[k]; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); draw(x, y, w, h); c.restore(); };
    const disc = (cx: number, cy: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); };
    // wax « feuilles »: ochre almonds edged in white on indigo, orange hearts, white dots
    within('waxA', (x, y) => {
      c.fillStyle = '#1f3f8a'; c.fillRect(x, y, 64, 64);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const cx = x + 8 + i * 16, cy = y + 8 + j * 16, a = (i + j) % 2 ? 0.75 : -0.75;
        c.fillStyle = '#f2a81d'; c.beginPath(); c.ellipse(cx, cy, 7.2, 3.8, a, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#f6f1e4'; c.lineWidth = 1; c.stroke();
        disc(cx, cy, 1.9, '#e0512b');
      }
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) disc(x + i * 16, y + j * 16, 1.6, '#f6f1e4');
    });
    // wax « disques »: concentric yellow, red and cream rings on emerald, yellow diamonds between
    within('waxB', (x, y) => {
      c.fillStyle = '#127a4c'; c.fillRect(x, y, 64, 64);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const cx = x + 16 + i * 32, cy = y + 16 + j * 32;
        [[13, '#f4c20d'], [10.5, '#d9322b'], [8, '#f6f1e4'], [5.5, '#f4c20d'], [3, '#1a1a1a']].forEach(([r, col]) => disc(cx, cy, r as number, col as string));
      }
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) diamond(c, x + i * 32, y + j * 32, 4, 4, '#f4c20d');
    });
    // buttoned (capitonné) upholstery: puffed diamonds between creases, a button at each crossing
    const tufted = (k: FurnKey, base: [string, string], puff: string, crease: string, button: string, rim: string) => within(k, (x, y) => {
      const gr = c.createLinearGradient(x, y, x + 64, y + 64); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); c.fillStyle = gr; c.fillRect(x, y, 64, 64);
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) if ((i + j) % 2) {
        const cx = x + i * 16, cy = y + j * 16, rg = c.createRadialGradient(cx - 2, cy - 3, 1, cx, cy, 13);
        rg.addColorStop(0, puff); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(cx - 16, cy - 16, 32, 32);
      }
      c.strokeStyle = crease; c.lineWidth = 1.6;
      for (let m = -2; m <= 2; m++) { c.beginPath(); c.moveTo(x + 32 * m, y); c.lineTo(x + 32 * m + 64, y + 64); c.stroke(); c.beginPath(); c.moveTo(x + 32 * m, y + 64); c.lineTo(x + 32 * m + 64, y); c.stroke(); }
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) if (!((i + j) % 2)) { disc(x + i * 16, y + j * 16, 3, rim); disc(x + i * 16, y + j * 16, 2.2, button); disc(x + i * 16 - 0.7, y + j * 16 - 0.8, 0.8, 'rgba(255,255,255,0.7)'); }
    });
    tufted('velvetTuft', ['#6c1020', '#962033'], 'rgba(196,64,86,0.85)', '#40070f', '#e8c46a', '#7a5a1a');
    tufted('leatherTuft', ['#93501f', '#b0652c'], 'rgba(214,142,82,0.9)', '#55290c', '#6a3814', '#4a240a');
    // tan leather: a mottled grain, a soft sheen, a welt stitched round the edge
    within('leatherTan', (x, y) => {
      c.fillStyle = '#ad642d'; c.fillRect(x, y, 64, 64);
      for (let k = 0; k < 90; k++) { c.fillStyle = k % 3 ? 'rgba(90,40,12,0.18)' : 'rgba(230,170,110,0.2)'; c.fillRect(x + ((k * 37) % 64), y + ((k * 53) % 64), 2, 1.5); }
      const gr = c.createLinearGradient(x, y, x + 64, y + 64); gr.addColorStop(0, 'rgba(255,230,190,0.22)'); gr.addColorStop(0.5, 'rgba(255,230,190,0)'); gr.addColorStop(1, 'rgba(60,25,5,0.18)'); c.fillStyle = gr; c.fillRect(x, y, 64, 64);
      c.strokeStyle = '#6a3412'; c.lineWidth = 1.2; c.strokeRect(x + 3.5, y + 3.5, 57, 57);
      c.fillStyle = '#e6c08a'; for (let k = 6; k < 60; k += 4) { c.fillRect(x + k, y + 5.5, 2, 1); c.fillRect(x + k, y + 57.5, 2, 1); c.fillRect(x + 5.5, y + k, 1, 2); c.fillRect(x + 57.5, y + k, 1, 2); }
    });
    // an armchair's arm front: tan leather and a row of brass nailheads round it
    within('nailFront', (x, y) => {
      c.fillStyle = '#a65d29'; c.fillRect(x, y, 32, 64); c.fillStyle = 'rgba(255,225,180,0.18)'; c.fillRect(x + 8, y + 8, 16, 48);
      for (let k = 5; k < 60; k += 5) { disc(x + 4, y + k, 1.6, '#e2c26a'); disc(x + 28, y + k, 1.6, '#e2c26a'); }
      for (let k = 9; k < 26; k += 5) { disc(x + k, y + 4, 1.6, '#e2c26a'); disc(x + k, y + 60, 1.6, '#e2c26a'); }
    });
    // a Senegalese leather pouf's side: stitched tan leather above and below, an embossed band of red and green triangles between dark bands
    within('poufSide', (x, y) => {
      c.fillStyle = '#c4874a'; c.fillRect(x, y, 128, 48);
      c.fillStyle = '#5a2e14'; c.fillRect(x, y + 7, 128, 3); c.fillRect(x, y + 38, 128, 3);
      c.fillStyle = '#d6a062'; c.fillRect(x, y + 10, 128, 28);
      for (let k = 0; k < 4; k++) {
        const bx = x + k * 32;
        c.fillStyle = '#a8321f'; c.beginPath(); c.moveTo(bx + 2, y + 35); c.lineTo(bx + 16, y + 13); c.lineTo(bx + 30, y + 35); c.fill();
        c.fillStyle = '#3d6b3a'; c.beginPath(); c.moveTo(bx + 18, y + 13); c.lineTo(bx + 32, y + 13); c.lineTo(bx + 25, y + 24); c.fill(); c.beginPath(); c.moveTo(bx, y + 13); c.lineTo(bx + 14, y + 13); c.lineTo(bx + 7, y + 24); c.fill();
        diamond(c, bx + 16, y + 28, 4, 5, '#5a2e14'); diamond(c, bx + 16, y + 28, 2, 2.5, '#f2d16b');
        c.strokeStyle = 'rgba(255,236,200,0.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx + 3, y + 34); c.lineTo(bx + 16, y + 14); c.stroke();
      }
      c.fillStyle = '#5a2e14'; for (let k = 0; k < 128; k += 5) { c.fillRect(x + k, y + 3, 3, 1); c.fillRect(x + k, y + 44, 3, 1); }
    });
    // its top: a stitched rosette, a crown of red and green points round a dark star
    within('poufTop', (x, y) => {
      const cx = x + 32, cy = y + 32; c.fillStyle = '#c4874a'; c.fillRect(x, y, 64, 64);
      disc(cx, cy, 30, '#b97b40'); c.strokeStyle = '#5a2e14'; c.lineWidth = 1; c.setLineDash([3, 2]); c.beginPath(); c.arc(cx, cy, 27, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, b2 = a + Math.PI / 12; c.fillStyle = k % 2 ? '#3d6b3a' : '#a8321f'; c.beginPath(); c.moveTo(cx + Math.cos(a - 0.22) * 14, cy + Math.sin(a - 0.22) * 14); c.lineTo(cx + Math.cos(b2 - 0.26) * 24, cy + Math.sin(b2 - 0.26) * 24); c.lineTo(cx + Math.cos(a + 0.22) * 14, cy + Math.sin(a + 0.22) * 14); c.fill(); }
      c.fillStyle = '#5a2e14'; c.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, r = k % 2 ? 6 : 13; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.fill();
      disc(cx, cy, 4, '#a8321f'); disc(cx, cy, 1.6, '#f2d16b');
    });
    // an ivory bazin brocade with gold scrolls (the canopy bed's spread)
    within('brocade', (x, y) => {
      c.fillStyle = '#f1e6cc'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#c9a043'; c.lineWidth = 1.6;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const cx = x + 16 + i * 32, cy = y + 16 + j * 32; c.beginPath(); c.ellipse(cx, cy, 11, 6, 0.7, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(cx, cy, 5, 11, -0.5, 0, Math.PI * 2); c.stroke(); disc(cx, cy, 2, '#c9a043'); }
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) diamond(c, x + i * 32, y + j * 32, 3.5, 3.5, '#d9b85a');
    });
  }
  //
  // (the comfort lane's drawing above, the decoration lane's below)
  //
  // ---- the catalogue's second round, decoration lane (K-D): its drawing here
  // Coiled basket plates in bright colours, raffia, carved openwork, black lacquer with a gold baobab, a hurricane lamp's lit globe, candle flames,
  // cut crystal, pierced iron, a glazed band, an incised clay band, and two aquarium backdrops (fresh water, a reef). All our own; no text.
  {
    const disc = (cx: number, cy: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); };
    /** A coiled basket plate seen from the front: `at(r)` colours its coil at radius r (px), `motif` draws over it; stitches on top. */
    const basket = (k: FurnKey, at: (r: number) => string, motif?: (cx: number, cy: number) => void) => {
      const [x, y, w] = PX[k], cx = x + w / 2, cy = y + w / 2;
      c.fillStyle = '#9a7438'; c.fillRect(x, y, w, w);
      for (let r = w / 2; r > 0; r -= 1) disc(cx, cy, r, at(r));
      motif?.(cx, cy);
      c.strokeStyle = 'rgba(70,40,10,0.28)'; c.lineWidth = 0.7;
      for (let r = w / 2 - 2; r > 2; r -= 2.4) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = 'rgba(60,35,10,0.45)'; c.lineWidth = 0.8;
      for (let r = w / 2 - 3; r > 3; r -= 4.8) for (let a = (r % 3) * 0.2; a < Math.PI * 2; a += 4.2 / r) { c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 1.2), cy + Math.sin(a) * (r - 1.2)); c.lineTo(cx + Math.cos(a) * (r + 1.2), cy + Math.sin(a) * (r + 1.2)); c.stroke(); }
      disc(cx, cy, 1.2, '#5a3a14');
    };
    const straw = (r: number) => (Math.floor(r / 2) % 2 ? '#dcbb7c' : '#cfa865');
    basket('basket0', r => r > 22 ? '#9a7438' : r > 18 ? '#c8322a' : r > 15 ? straw(r) : r > 12 ? '#1c1814' : r > 5 ? straw(r) : '#c8322a', (cx, cy) => {
      for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, b = a + Math.PI / 16, e = a + Math.PI / 8; c.fillStyle = k % 2 ? '#1c1814' : '#c8322a';
        c.beginPath(); c.moveTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); c.lineTo(cx + Math.cos(b) * 18, cy + Math.sin(b) * 18); c.lineTo(cx + Math.cos(e) * 15, cy + Math.sin(e) * 15); c.fill(); }
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.fillStyle = '#1c1814'; c.beginPath(); c.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5); c.lineTo(cx + Math.cos(a + 0.2) * 10, cy + Math.sin(a + 0.2) * 10); c.lineTo(cx + Math.cos(a + 0.4) * 5, cy + Math.sin(a + 0.4) * 5); c.fill(); }
    });
    basket('basket1', r => r > 22 ? '#9a7438' : r > 20 ? '#2e8b4c' : straw(r), (cx, cy) => {
      const cols = ['#2e8b4c', '#f4c20d', '#7a3a8a', '#f4c20d'];
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.fillStyle = cols[k % 4]; c.beginPath(); c.arc(cx, cy, 18, a, a + Math.PI / 6); c.arc(cx, cy, 8, a + Math.PI / 6, a, true); c.fill(); }
      disc(cx, cy, 6, '#2e8b4c'); disc(cx, cy, 3, '#f4c20d');
    });
    basket('basket2', r => r > 22 ? '#9a7438' : r > 19 ? '#1f5aa8' : r > 17 ? straw(r) : r > 14.5 ? '#e8742c' : r > 12.5 ? straw(r) : r > 10 ? '#d94a8c' : r > 8 ? straw(r) : r > 5.5 ? '#1a9d54' : r > 3 ? straw(r) : '#f4c20d');
    // raffia stretched in a frame: woven rows, indigo and rust bands, lozenges
    { const [x, y, w, h] = PX.raffia; c.fillStyle = '#d8c08a'; c.fillRect(x, y, w, h);
      for (let j = 0; j < h; j += 2) { c.fillStyle = (j / 2) % 2 ? '#c9ad74' : '#e3cd98'; c.fillRect(x, y + j, w, 1); }
      c.fillStyle = 'rgba(110,80,35,0.22)'; for (let i = 1; i < w; i += 3) c.fillRect(x + i, y, 1, h);
      for (const [yy, col] of [[5, '#2f3f78'], [9, '#a8452a'], [12, '#2f3f78'], [82, '#2f3f78'], [85, '#a8452a'], [89, '#2f3f78']] as const) { c.fillStyle = col; c.fillRect(x, y + yy, w, 2); }
      for (let k = 0; k < 5; k++) { diamond(c, x + 16, y + 26 + k * 12, 8, 6, '#a8452a'); diamond(c, x + 16, y + 26 + k * 12, 5, 4, '#e3cd98'); diamond(c, x + 16, y + 26 + k * 12, 2, 2, '#2f3f78'); } }
    // carved openwork: a frame, a rosette under the arch, a lattice of diamonds, slots below (the holes near black)
    { const [x, y, w, h] = PX.carvedPanel; c.fillStyle = '#6e4527'; c.fillRect(x, y, w, h);
      c.fillStyle = '#3a2212'; c.fillRect(x, y, w, 3); c.fillRect(x, y + h - 3, w, 3); c.fillRect(x, y, 3, h); c.fillRect(x + w - 3, y, 3, h); c.fillRect(x, y + 24, w, 2); c.fillRect(x, y + 74, w, 2);
      disc(x + 16, y + 13, 9, '#2a160a'); disc(x + 16, y + 13, 7, '#8a5a32');
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.fillStyle = '#140a05'; c.beginPath(); c.ellipse(x + 16 + Math.cos(a) * 4.5, y + 13 + Math.sin(a) * 4.5, 2.2, 1.1, a, 0, Math.PI * 2); c.fill(); }
      disc(x + 16, y + 13, 1.6, '#140a05');
      for (let j = 0; j < 9; j++) for (let i = 0; i < 4; i++) { const cx = x + 6 + i * 7 + (j % 2) * 3.5, cy = y + 30 + j * 5; if (cx < x + 27) diamond(c, cx, cy, 2.6, 2.2, '#140a05'); }
      for (let i = 0; i < 4; i++) { c.fillStyle = '#140a05'; c.fillRect(x + 6 + i * 6, y + 79, 3, 12); }
      c.fillStyle = 'rgba(255,220,170,0.18)'; c.fillRect(x + 3, y + 3, w - 6, 1); }
    // black lacquer and gold leaf across four panels: a crescent and stars, a great baobab, birds over the dunes, a smaller baobab
    { const [x, y, w, h] = PX.lacquer; const bg = c.createLinearGradient(x, y, x, y + h); bg.addColorStop(0, '#1d1517'); bg.addColorStop(1, '#0b0909'); c.fillStyle = bg; c.fillRect(x, y, w, h);
      const gold = c.createLinearGradient(x, y, x + w, y + h); gold.addColorStop(0, '#f6dc8a'); gold.addColorStop(0.45, '#c8962e'); gold.addColorStop(0.7, '#f0cc6a'); gold.addColorStop(1, '#b8862e');
      c.fillStyle = gold; c.strokeStyle = gold;
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + 80); c.bezierCurveTo(x + 30, y + 72, x + 50, y + 84, x + 78, y + 78); c.bezierCurveTo(x + 100, y + 73, x + 116, y + 80, x + w, y + 77); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
      c.fillStyle = '#0b0909'; for (let k = 0; k < 9; k++) c.fillRect(x + 6 + k * 14, y + 86 + (k % 3), 6, 1.2);
      c.fillStyle = gold; c.beginPath(); c.arc(x + 15, y + 20, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1b1416'; c.beginPath(); c.arc(x + 18, y + 18, 6.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = gold; for (const [sx, sy] of [[8, 40], [24, 34], [12, 58], [26, 52], [20, 8]]) { c.fillRect(x + sx - 0.5, y + sy - 2, 1, 4); c.fillRect(x + sx - 2, y + sy - 0.5, 4, 1); }
      const baobab = (bx: number, by: number, s: number) => { c.beginPath(); c.moveTo(bx - 7 * s, by); c.lineTo(bx - 4.5 * s, by - 26 * s); c.lineTo(bx + 4.5 * s, by - 26 * s); c.lineTo(bx + 7 * s, by); c.fill();
        c.lineWidth = 2.2 * s; for (const [a, l] of [[-2.4, 13], [-1.9, 11], [-1.2, 12], [-0.7, 14], [-1.55, 9]]) { c.beginPath(); c.moveTo(bx, by - 25 * s); c.lineTo(bx + Math.cos(a) * l * s, by - 25 * s + Math.sin(a) * l * s); c.stroke(); }
        for (const [dx, dy, r] of [[-12, -34, 4], [-8, -38, 3.5], [0, -40, 4], [8, -37, 3.5], [12, -33, 4], [-4, -36, 3], [5, -35, 3]]) { c.beginPath(); c.arc(bx + dx * s, by + dy * s, r * s, 0, Math.PI * 2); c.fill(); } };
      baobab(x + 48, y + 80, 1.15); baobab(x + 112, y + 78, 0.7);
      c.fillStyle = '#9a2a1a'; c.beginPath(); c.arc(x + 80, y + 30, 8, 0, Math.PI * 2); c.fill(); c.lineWidth = 1; c.beginPath(); c.arc(x + 80, y + 30, 9.5, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 1.1; for (const [bx, by, s] of [[72, 52, 1], [86, 46, 0.8], [92, 58, 0.7], [104, 30, 0.8], [70, 20, 0.6]]) { c.beginPath(); c.moveTo(x + bx - 4 * s, y + by - 2 * s); c.quadraticCurveTo(x + bx - 1.5 * s, y + by - 3 * s, x + bx, y + by); c.quadraticCurveTo(x + bx + 1.5 * s, y + by - 3 * s, x + bx + 4 * s, y + by - 2 * s); c.stroke(); }
      c.lineWidth = 1.4; for (let i = 0; i < 4; i++) c.strokeRect(x + i * 32 + 2.5, y + 2.5, 27, h - 5); }
    // a hurricane lamp's globe, lit: amber glass round a white flame (the globe's lower half is the image's lower half)
    { const [x, y, w, h] = PX.lampGlass; for (const ctx of [c, g]) {
      const gr = ctx.createRadialGradient(x + w / 2, y + 17, 1, x + w / 2, y + 16, 19); gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.28, '#ffd877'); gr.addColorStop(0.65, '#f2a443'); gr.addColorStop(1, '#c8742a');
      ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fffdf2'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + 17, 2.6, 5.5, 0, 0, Math.PI * 2); ctx.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 5, y + 4, 2, 24); }
    { const [x, y] = P('flame'); for (const ctx of [c, g]) { ctx.fillStyle = '#ff9a30'; ctx.fillRect(x, y, 16, 16); ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.ellipse(x + 8, y + 10, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); } }
    { const [x, y] = P('crystal'); c.fillStyle = '#e4f0fa'; c.fillRect(x, y, 16, 16);
      for (const [pts, col] of [[[0, 0, 8, 6, 0, 12], '#b9cfe8'], [[16, 4, 8, 6, 16, 14], '#cfe0f2'], [[4, 16, 8, 6, 12, 16], '#a9bfe0'], [[6, 0, 8, 6, 12, 0], '#ffffff']] as const) { c.fillStyle = col; c.beginPath(); c.moveTo(x + pts[0], y + pts[1]); c.lineTo(x + pts[2], y + pts[3]); c.lineTo(x + pts[4], y + pts[5]); c.fill(); }
      g.fillStyle = '#323c48'; g.fillRect(x, y, 16, 16); g.fillStyle = '#b8c8dc'; g.fillRect(x + 6, y + 2, 4, 4); }
    // pierced iron: stars, drops and dots let the light through (the holes glow)
    { const [x, y, w, h] = PX.pierced; c.fillStyle = '#2a2420'; c.fillRect(x, y, w, h); c.fillStyle = '#7a5e2e'; c.fillRect(x, y, w, 3); c.fillRect(x, y + h - 3, w, 3);
      const star = (ctx: C2, cx: number, cy: number, r: number) => { for (const a of [0, Math.PI / 4]) { ctx.beginPath(); for (let k = 0; k < 4; k++) { const t = a + k * Math.PI / 2; ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } ctx.fill(); } };
      for (const ctx of [c, g]) {
        ctx.fillStyle = '#ffc45e'; for (const [sx, sy] of [[8, 11], [24, 11], [16, 24], [8, 37], [24, 37]]) star(ctx, x + sx, y + sy, 4.2);
        ctx.fillStyle = '#ffe2a0'; for (const [sx, sy] of [[16, 8], [3, 24], [29, 24], [16, 40], [8, 24], [24, 24], [16, 15], [16, 33]]) { ctx.beginPath(); ctx.arc(x + sx, y + sy, 1.3, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#ffd27a'; for (const [sx, sy] of [[3, 7], [29, 7], [3, 41], [29, 41]]) { ctx.beginPath(); ctx.ellipse(x + sx, y + sy, 1.3, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
      } }
    // a cobalt glaze with a cream band of triangles (the vase's belly)
    { const [x, y, w, h] = PX.glaze; const gr = c.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#2a5cb8'); gr.addColorStop(1, '#1a3a86'); c.fillStyle = gr; c.fillRect(x, y, w, h);
      c.fillStyle = '#efe4c8'; c.fillRect(x, y + 10, w, 12); c.fillStyle = '#c98a2a'; c.fillRect(x, y + 10, w, 1.5); c.fillRect(x, y + 20.5, w, 1.5);
      for (let k = 0; k < 4; k++) { c.fillStyle = '#1f4aa0'; c.beginPath(); c.moveTo(x + k * 8, y + 20); c.lineTo(x + k * 8 + 4, y + 12); c.lineTo(x + k * 8 + 8, y + 20); c.fill(); c.fillStyle = '#c98a2a'; c.beginPath(); c.arc(x + k * 8 + 8, y + 14, 1.4, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 10; k++) c.fillRect(x + ((k * 13) % 31), y + 2 + ((k * 7) % 6) + (k > 5 ? 22 : 0), 1, 1); }
    // terracotta with an incised zigzag and dots (the jar's belly)
    { const [x, y, w, h] = PX.clayBand; c.fillStyle = '#b5653a'; c.fillRect(x, y, w, h); c.fillStyle = '#9a5230'; c.fillRect(x, y + 1, w, 1); c.fillRect(x, y + h - 2, w, 1);
      c.strokeStyle = '#6e3418'; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i <= 8; i++) c.lineTo(x + i * 4, y + (i % 2 ? 5 : 11)); c.stroke();
      c.fillStyle = '#6e3418'; for (let i = 0; i < 8; i++) c.fillRect(x + i * 4 + 1.5, y + (i % 2 ? 11.5 : 4), 1, 1); }
    // aquarium backdrops: fresh water with its plants, a reef in deep blue (a little light of their own at night)
    { const [x, y, w, h] = PX.aquaFresh; const gr = c.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#4fb3a6'); gr.addColorStop(0.6, '#23707a'); gr.addColorStop(1, '#123e46'); c.fillStyle = gr; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(x + 6 + k * 20, y); c.lineTo(x + 14 + k * 20, y); c.lineTo(x + 2 + k * 20, y + h); c.lineTo(x - 4 + k * 20, y + h); c.fill(); }
      for (let k = 0; k < 22; k++) { const sx = x + 2 + ((k * 37) % 92), top = y + 8 + ((k * 11) % 22); c.strokeStyle = ['#3f8a3a', '#5aa84a', '#2e6b2e', '#6ab84e'][k % 4]; c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx, y + h - 4); c.quadraticCurveTo(sx + (k % 2 ? 4 : -4), (top + y + h) / 2, sx + (k % 3) - 1, top); c.stroke(); }
      for (const [sx, sy] of [[20, 30], [60, 22], [75, 34], [40, 18]]) { c.fillStyle = '#c84a3a'; c.beginPath(); c.arc(x + sx, y + sy, 2.2, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#8a7a5a'; c.fillRect(x, y + h - 5, w, 5); c.fillStyle = '#b8a47a'; for (let k = 0; k < 40; k++) c.fillRect(x + ((k * 29) % w), y + h - 5 + (k % 4), 1.5, 1);
      g.fillStyle = '#0c2a2a'; g.fillRect(x, y, w, h); g.fillStyle = '#163e3c'; g.fillRect(x, y, w, h / 3); }
    { const [x, y, w, h] = PX.aquaSea; const gr = c.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#36a2ec'); gr.addColorStop(0.55, '#1a62b8'); gr.addColorStop(1, '#0a2a62'); c.fillStyle = gr; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.13)'; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x + 8 + k * 22, y); c.lineTo(x + 18 + k * 22, y); c.lineTo(x + 6 + k * 22, y + h); c.lineTo(x - 2 + k * 22, y + h); c.fill(); }
      for (const [sx, r, col] of [[10, 9, '#3a3a8a'], [30, 12, '#4a3a90'], [58, 8, '#2e4a8a'], [80, 13, '#4a3a90'], [104, 10, '#3a3a8a'], [124, 8, '#2e4a8a']] as const) { c.fillStyle = col; c.beginPath(); c.arc(x + sx, y + h, r, Math.PI, 0); c.fill(); }
      for (const [sx, sy, col] of [[22, 14, '#f4d43a'], [70, 10, '#f4d43a'], [96, 20, '#7fd0ff'], [46, 24, '#ff8a3a'], [112, 12, '#7fd0ff']] as const) { c.fillStyle = col; c.fillRect(x + sx, y + sy, 3, 1.5); }
      g.fillStyle = '#0a1e3a'; g.fillRect(x, y, w, h); g.fillStyle = '#123468'; g.fillRect(x, y, w, h / 3); }
  }
}
