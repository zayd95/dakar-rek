import { atlasRect, type Rect } from './kitGeometry';

/**
 * Paint atlas of the shop interior kit (512 × 704 colour, 128 × 176 glow), drawn in code: product cartons, tins, bottle
 * labels, sacks and medicine boxes with GENERIC words only (riz, sucre, lait, huile… never a brand), wax prints of our
 * own, phone and TV screens (no real interface or programme), pegboards, a café menu, posters and counter panels, and
 * shelf strips (a whole row of goods painted on one quad, for Low quality). No logo, no real product, no inscription.
 */
export const SW = 512, SH = 704;
const PX = {
  plain: [0, 0, 16, 16], light: [0, 16, 16, 16], dark: [0, 32, 16, 16], mirror: [0, 48, 16, 16],
  pk0: [16, 0, 32, 32], pk1: [48, 0, 32, 32], pk2: [80, 0, 32, 32], pk3: [112, 0, 32, 32], pk4: [144, 0, 32, 32], pk5: [176, 0, 32, 32], pk6: [208, 0, 32, 32], pk7: [240, 0, 32, 32],
  tin0: [272, 0, 32, 32], tin1: [304, 0, 32, 32], tin2: [336, 0, 32, 32], tin3: [368, 0, 32, 32],
  bt0: [400, 0, 28, 32], bt1: [428, 0, 28, 32], bt2: [456, 0, 28, 32], bt3: [484, 0, 28, 32],
  ph0: [16, 32, 32, 32], ph1: [48, 32, 32, 32], ph2: [80, 32, 32, 32], ph3: [112, 32, 32, 32],
  sack0: [144, 32, 48, 32], sack1: [192, 32, 48, 32], paint0: [240, 32, 32, 32], paint1: [272, 32, 32, 32],
  wax0: [304, 32, 32, 32], wax1: [336, 32, 32, 32], wax2: [368, 32, 32, 32], wax3: [400, 32, 32, 32],
  screen: [432, 32, 16, 32], screen2: [448, 32, 16, 32], tv: [464, 32, 48, 32],
  pegTools: [0, 64, 128, 96], pegPhone: [128, 64, 128, 96], menu: [256, 64, 128, 96], fridge: [384, 64, 64, 96],
  cross: [448, 64, 32, 32], clock: [480, 64, 32, 32], guichet: [448, 96, 64, 32], tag: [448, 128, 32, 32], ticket: [480, 128, 32, 32],
  poster0: [0, 160, 64, 96], poster1: [64, 160, 64, 96], poster2: [128, 160, 64, 96], poster3: [192, 160, 64, 96],
  safe: [256, 160, 64, 96], glassDoor: [320, 160, 64, 96], curtain: [384, 160, 64, 96], basket: [448, 160, 64, 64], leather: [448, 224, 64, 32],
  tiles: [0, 256, 64, 64], wood: [64, 256, 64, 64], wall: [128, 256, 64, 64], natte: [192, 256, 64, 64], bazin: [256, 256, 64, 64],
  wax4: [320, 256, 64, 64], wax5: [384, 256, 64, 64], pirogue: [448, 256, 64, 64],
  pnlGrocery: [0, 320, 128, 32], pnlPhone: [128, 320, 128, 32], pnlCloth: [256, 320, 128, 32], pnlHome: [384, 320, 128, 32],
  pnlPharma: [0, 352, 128, 32], pnlJuice: [128, 352, 128, 32], pnlBank: [256, 352, 128, 32], pnlHardware: [384, 352, 128, 32],
  pnlCraft: [0, 384, 128, 32], pnlBeauty: [128, 384, 128, 32], transfer: [256, 384, 128, 32], wood2: [384, 384, 128, 32],
  sGrocery: [0, 416, 128, 32], sPharma: [128, 416, 128, 32], sHardware: [256, 416, 128, 32], sTech: [384, 416, 128, 32],
  sFabric: [0, 448, 128, 32], sHome: [128, 448, 128, 32], sBeauty: [256, 448, 128, 32], sCraft: [384, 448, 128, 32],
  sBottles: [0, 480, 128, 32], sFiles: [128, 480, 128, 32], sShoes: [256, 480, 128, 32], sBooks: [384, 480, 128, 32],
  // garage and restaurant (10 Oct, lane w2-shops-2)
  pnlGarage: [0, 512, 128, 32], sParts: [0, 544, 128, 32], oil0: [0, 576, 32, 32], oil1: [32, 576, 32, 32], tyre: [64, 576, 32, 32], plate: [96, 576, 32, 32],
  menuResto: [128, 512, 128, 96], pnlResto: [256, 512, 128, 32], seaview: [256, 544, 128, 64], pass: [384, 512, 128, 64], checker: [384, 576, 64, 64], cloth2: [448, 576, 64, 64],
  wood3: [0, 608, 128, 32],
  // the car showroom (10 Oct, lane w2-car-dealer): the keys board, price cards, the desk panel, its floor, a poster
  keys: [0, 640, 96, 64], carCard0: [96, 640, 60, 40], carCard1: [156, 640, 60, 40], carCard2: [216, 640, 60, 40],
  pnlCars: [276, 640, 128, 32], floorShow: [404, 640, 64, 64], posterCars: [468, 640, 44, 64],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type ShopKey = keyof typeof PX;
export const SUV = Object.fromEntries(Object.entries(PX).map(([k, [x, y, w, h]]) => [k, atlasRect(x, y, w, h, SW, SH)])) as Record<ShopKey, Rect>;
export const SPLAIN: [number, number] = [8 / SW, 1 - 8 / SH];
/** The i-th of n equal slots of a painted strip (one item of a shelf strip, one stack of folded cloth…). */
export function shopSlot(k: ShopKey, i: number, n: number): Rect {
  const [x, y, w, h] = PX[k], sw = w / n;
  return atlasRect(x + (i % n) * sw, y, sw, h, SW, SH);
}
/** Dominant colour of a painted face (the sides of a carton, the cap of a tin take it). */
export const SCOL: Partial<Record<ShopKey, number>> = {
  pk0: 0xc23a2e, pk1: 0xf2c230, pk2: 0x2f6fb3, pk3: 0x2e9b57, pk4: 0xe8822c, pk5: 0xf1ece0, pk6: 0x7b4aa0, pk7: 0x1d1f24,
  tin0: 0xd0312a, tin1: 0x2a5d9f, tin2: 0xf2efe6, tin3: 0x3f8b3a, bt0: 0xf1c232, bt1: 0x5fa8d8, bt2: 0x9c1f3a, bt3: 0xee7d22,
  ph0: 0xf4f4f2, ph1: 0xf4f4f2, ph2: 0xf4f4f2, ph3: 0xf4f4f2, sack0: 0xeeeae0, sack1: 0xb08d5e, paint0: 0xf2f2ee, paint1: 0x2f6fb3,
  wax0: 0xc2417f, wax1: 0x1f5aa8, wax2: 0xe8a322, wax3: 0x1a8a5a, wax4: 0x7a2fa0, wax5: 0xd9482b, bazin: 0x3a7bd5, leather: 0x7a4a26,
  oil0: 0xd9a420, oil1: 0x2b2f36, tyre: 0x1d1d1f, plate: 0xf2f2ee,
};

type C2 = CanvasRenderingContext2D;
const P = (k: ShopKey) => PX[k];

function label(c: C2, x: number, y: number, w: number, text: string, size: number, col: string, font = 'bold') {
  c.fillStyle = col; c.font = `${font} ${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x + w / 2, y, w - 2);
}
function carton(c: C2, k: ShopKey, bg: string, band: string, word: string, ink: string, motif: (x: number, y: number) => void) {
  const [x, y, w, h] = P(k);
  c.fillStyle = bg; c.fillRect(x, y, w, h);
  c.fillStyle = band; c.fillRect(x, y + h - 9, w, 9);
  motif(x, y);
  label(c, x, y + h - 4.5, w, word, 7, ink);
}
function tin(c: C2, k: ShopKey, bg: string, band: string, word: string, ink: string) {
  const [x, y, w, h] = P(k);
  c.fillStyle = '#c9cdd2'; c.fillRect(x, y, w, h);
  c.fillStyle = bg; c.fillRect(x, y + 4, w, h - 8);
  c.fillStyle = band; c.fillRect(x, y + 12, w, 9);
  label(c, x, y + 16.5, w, word, 7, ink);
}
function bottle(c: C2, k: ShopKey, liquid: string, lab: string, word: string) {
  const [x, y, w, h] = P(k);
  c.fillStyle = liquid; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 3, y, 3, h);
  c.fillStyle = lab; c.fillRect(x, y + 11, w, 11);
  label(c, x, y + 16.5, w, word, 6, '#1d1f24');
}
function wax(c: C2, k: ShopKey, a: string, b: string, d: string, step: number) {
  const [x, y, w, h] = P(k);
  c.fillStyle = a; c.fillRect(x, y, w, h);
  for (let j = 0; j < h / step; j++) for (let i = 0; i < w / step; i++) {
    const cx = x + step / 2 + i * step, cy = y + step / 2 + j * step;
    c.fillStyle = b; c.beginPath(); c.arc(cx, cy, step * 0.36, 0, Math.PI * 2); c.fill();
    c.fillStyle = d; if ((i + j) % 2) { c.beginPath(); c.arc(cx, cy, step * 0.16, 0, Math.PI * 2); c.fill(); } else c.fillRect(cx - step * 0.12, cy - step * 0.45, step * 0.24, step * 0.9);
  }
}
function panel(c: C2, k: ShopKey, bg: string, ink: string, text: string, edge = '#00000033') {
  const [x, y, w, h] = P(k);
  c.fillStyle = bg; c.fillRect(x, y, w, h);
  c.fillStyle = edge; c.fillRect(x, y, w, 3); c.fillRect(x, y + h - 3, w, 3);
  label(c, x, y + h / 2 + 1, w, text, 13, ink);
}
/** A shelf strip: a row of goods (`draw` paints one item at its slot) over a shelf shadow. */
function strip(c: C2, k: ShopKey, n: number, draw: (x: number, y: number, w: number, h: number, i: number) => void) {
  const [x, y, w, h] = P(k);
  c.fillStyle = '#4b3a2c'; c.fillRect(x, y, w, h);
  const sw = w / n;
  for (let i = 0; i < n; i++) draw(x + i * sw, y, sw, h, i);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + h - 3, w, 3);
}
const GOODS = ['#c23a2e', '#f2c230', '#2f6fb3', '#2e9b57', '#e8822c', '#f1ece0', '#7b4aa0', '#d0312a', '#5fa8d8'];

export function drawShopAtlas(c: C2, g: C2) {
  // basics: white (vertex colours), light (glow), dark, mirror
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 16, 16);
  c.fillStyle = '#fffaf0'; c.fillRect(0, 16, 16, 16); g.fillStyle = '#fff4dc'; g.fillRect(0, 16, 16, 16);
  c.fillStyle = '#1d1f24'; c.fillRect(0, 32, 16, 16);
  { const gr = c.createLinearGradient(0, 48, 16, 64); gr.addColorStop(0, '#cfe2ea'); gr.addColorStop(0.5, '#9fbccb'); gr.addColorStop(1, '#dcebf0'); c.fillStyle = gr; c.fillRect(0, 48, 16, 16); }

  // cartons (generic words: tea, sugar, milk, soap, biscuits, coffee, stock cubes, a phone box)
  carton(c, 'pk0', '#c23a2e', '#f2d16b', 'THÉ', '#7a1414', (x, y) => { c.fillStyle = '#2e9b57'; c.beginPath(); c.ellipse(x + 16, y + 11, 9, 5, -0.6, 0, Math.PI * 2); c.fill(); });
  carton(c, 'pk1', '#f2c230', '#ffffff', 'SUCRE', '#8a5a00', (x, y) => { c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) c.fillRect(x + 6 + i * 7, y + 5 + j * 7, 6, 6); });
  carton(c, 'pk2', '#2f6fb3', '#ffffff', 'LAIT', '#1d3f73', (x, y) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 16, y + 12, 8, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2f6fb3'; c.beginPath(); c.arc(x + 16, y + 12, 4, 0, Math.PI * 2); c.fill(); });
  carton(c, 'pk3', '#2e9b57', '#f1ece0', 'SAVON', '#1d5a33', (x, y) => { c.fillStyle = '#f1ece0'; c.beginPath(); c.ellipse(x + 16, y + 12, 10, 6, 0, 0, Math.PI * 2); c.fill(); });
  carton(c, 'pk4', '#e8822c', '#7a3a10', 'BISCUITS', '#ffffff', (x, y) => { c.fillStyle = '#c8873e'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + 8 + i * 8, y + 12, 4, 0, Math.PI * 2); c.fill(); } });
  carton(c, 'pk5', '#f1ece0', '#5a3a22', 'CAFÉ', '#f1ece0', (x, y) => { c.fillStyle = '#5a3a22'; c.beginPath(); c.ellipse(x + 16, y + 12, 6, 8, 0.4, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f1ece0'; c.beginPath(); c.moveTo(x + 13, y + 6); c.lineTo(x + 19, y + 18); c.stroke(); });
  carton(c, 'pk6', '#7b4aa0', '#f2c230', 'BOUILLON', '#3a1a55', (x, y) => { c.fillStyle = '#f2c230'; c.fillRect(x + 9, y + 6, 14, 12); });
  carton(c, 'pk7', '#1d1f24', '#3a3d44', 'MOBILE', '#e6e6e6', (x, y) => { c.strokeStyle = '#e6e6e6'; c.lineWidth = 1.5; c.strokeRect(x + 11, y + 3, 10, 17); });
  tin(c, 'tin0', '#d0312a', '#f2c230', 'TOMATE', '#7a1414');
  tin(c, 'tin1', '#2a5d9f', '#f1ece0', 'SARDINES', '#1d3f73');
  tin(c, 'tin2', '#f2efe6', '#2f6fb3', 'LAIT', '#ffffff');
  tin(c, 'tin3', '#3f8b3a', '#f2c230', 'PETITS POIS', '#1d4a1d');
  bottle(c, 'bt0', '#e9b62a', '#f6f1e0', 'HUILE');
  bottle(c, 'bt1', '#a9d6f0', '#2f6fb3', 'EAU');
  bottle(c, 'bt2', '#7d1730', '#f6f1e0', 'BISSAP');
  bottle(c, 'bt3', '#ee7d22', '#f6f1e0', 'GINGEMBRE');
  // medicine boxes: white, a coloured band, a generic word
  const ph: [ShopKey, string, string][] = [['ph0', '#2e9b57', 'SIROP'], ['ph1', '#2f6fb3', 'VITAMINES'], ['ph2', '#d0312a', 'PANSEMENTS'], ['ph3', '#e8822c', 'CRÈME']];
  for (const [k, col, word] of ph) { const [x, y] = P(k); c.fillStyle = '#f7f7f4'; c.fillRect(x, y, 32, 32); c.fillStyle = col; c.fillRect(x, y + 4, 32, 7); c.fillRect(x + 22, y + 16, 6, 12); label(c, x, y + 20, 22, word, 6, '#333'); }
  { const [x, y] = P('sack0'); c.fillStyle = '#eeeae0'; c.fillRect(x, y, 48, 32); c.fillStyle = '#d8d2c2'; for (let k = 0; k < 48; k += 3) c.fillRect(x + k, y, 1, 32);
    c.fillStyle = '#c23a2e'; c.fillRect(x, y + 3, 48, 3); c.fillStyle = '#2e9b57'; c.fillRect(x, y + 26, 48, 3); label(c, x, y + 13, 48, 'RIZ', 10, '#c23a2e'); label(c, x, y + 21, 48, '25 KG', 7, '#333'); }
  { const [x, y] = P('sack1'); c.fillStyle = '#b08d5e'; c.fillRect(x, y, 48, 32); c.fillStyle = '#9a784c'; for (let k = 0; k < 32; k += 4) c.fillRect(x, y + k, 48, 1);
    label(c, x, y + 13, 48, 'CIMENT', 9, '#3a2a18'); label(c, x, y + 22, 48, '50 KG', 7, '#3a2a18'); }
  for (const [k, col] of [['paint0', '#d0312a'], ['paint1', '#2f6fb3']] as [ShopKey, string][]) {
    const [x, y] = P(k); c.fillStyle = '#c9cdd2'; c.fillRect(x, y, 32, 32); c.fillStyle = '#f7f7f4'; c.fillRect(x, y + 5, 32, 22);
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y + 27); c.quadraticCurveTo(x + 16, y + 8, x + 32, y + 27); c.fill(); label(c, x, y + 11, 32, 'PEINTURE', 6, '#333');
  }
  wax(c, 'wax0', '#c2417f', '#f4c20d', '#1a9d54', 8);
  wax(c, 'wax1', '#1f5aa8', '#f4c20d', '#f2f2ec', 8);
  wax(c, 'wax2', '#e8a322', '#7a1424', '#f2f2ec', 8);
  wax(c, 'wax3', '#1a8a5a', '#f2f2ec', '#e8742c', 8);
  wax(c, 'wax4', '#7a2fa0', '#f4c20d', '#f2f2ec', 16);
  wax(c, 'wax5', '#d9482b', '#1f2a4a', '#f4c20d', 16);
  { const [x, y] = P('bazin'); c.fillStyle = '#3a7bd5'; c.fillRect(x, y, 64, 64); c.strokeStyle = '#7fb0ee'; c.lineWidth = 2;
    for (let k = -64; k < 64; k += 10) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + 64, y + 64); c.stroke(); } c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x, y, 64, 20); }
  // screens: a home screen of tiles (no real interface), a seaside picture on the TVs
  for (const [k, a, b] of [['screen', '#2a6fd1', '#8fd0ff'], ['screen2', '#1a9d54', '#bdf2c9']] as [ShopKey, string, string][]) {
    const [x, y] = P(k); for (const ctx of [c, g]) { const gr = ctx.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, a); gr.addColorStop(1, b); ctx.fillStyle = gr; ctx.fillRect(x, y, 16, 32);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) ctx.fillRect(x + 3 + i * 6, y + 6 + j * 6, 4, 4); }
  }
  { const [x, y] = P('tv'); for (const ctx of [c, g]) { const gr = ctx.createLinearGradient(x, y, x, y + 32); gr.addColorStop(0, '#f7b267'); gr.addColorStop(0.55, '#f4845f'); gr.addColorStop(0.56, '#2a6f97'); gr.addColorStop(1, '#14425e'); ctx.fillStyle = gr; ctx.fillRect(x, y, 48, 32);
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x + 30, y + 16, 5, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#3b2a1e'; ctx.fillRect(x + 8, y + 15, 12, 3); } }

  // pegboards: hardware tools, phone accessories
  for (const k of ['pegTools', 'pegPhone'] as ShopKey[]) {
    const [x, y, w, h] = P(k); c.fillStyle = '#c9a77a'; c.fillRect(x, y, w, h); c.fillStyle = '#8a6a44';
    for (let j = 4; j < h; j += 8) for (let i = 4; i < w; i += 8) c.fillRect(x + i, y + j, 1.5, 1.5);
  }
  { const [x, y] = P('pegTools');
    const tool = (tx: number, ty: number, fn: () => void) => { c.save(); c.translate(x + tx, y + ty); fn(); c.restore(); };
    for (let i = 0; i < 4; i++) tool(10 + i * 28, 8, () => { c.fillStyle = '#6b4a2e'; c.fillRect(-2, 6, 4, 24); c.fillStyle = '#5b6168'; c.fillRect(-7, 2, 14, 6); });           // hammers
    for (let i = 0; i < 5; i++) tool(10 + i * 22, 46, () => { c.fillStyle = '#9aa0a6'; c.fillRect(-1.5, 0, 3, 18 + i * 2); c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); });   // spanners
    for (let i = 0; i < 4; i++) tool(16 + i * 28, 74, () => { c.fillStyle = ['#d0312a', '#f2c230', '#2f6fb3', '#2e9b57'][i]; c.fillRect(-3, 0, 6, 9); c.fillStyle = '#9aa0a6'; c.fillRect(-1, 9, 2, 10); });  // screwdrivers
    tool(118, 60, () => { c.strokeStyle = '#d0312a'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke(); });                                                         // a coil of wire
  }
  { const [x, y] = P('pegPhone'), cols = ['#1d1f24', '#d0312a', '#2f6fb3', '#f2c230', '#c2417f', '#2e9b57'];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
      const cx = x + 10 + i * 20, cy = y + 8 + j * 30;
      c.fillStyle = '#e8e8e8'; c.fillRect(cx - 1, cy - 4, 2, 4);
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(cx - 7, cy, 14, 22);                                   // blister pack
      c.fillStyle = cols[(i + j) % cols.length];
      if (j === 0) c.fillRect(cx - 4, cy + 3, 8, 15);                                                             // phone cases
      else if (j === 1) { c.strokeStyle = cols[(i + 2) % cols.length]; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy + 11, 5, 0, Math.PI * 2); c.stroke(); }   // cables
      else { c.beginPath(); c.arc(cx - 3, cy + 14, 2.5, 0, Math.PI * 2); c.arc(cx + 3, cy + 14, 2.5, 0, Math.PI * 2); c.fill(); c.fillRect(cx - 1, cy + 4, 2, 9); }  // earphones
    }
  }
  // café menu (lit board): generic drinks and prices of the game
  { const [x, y, w, h] = P('menu'); for (const ctx of [c, g]) { ctx.fillStyle = '#1f3a2c'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
    label(c, x, y + 14, w, 'JUS FRAIS', 14, '#f2c230');
    const rows: [string, string][] = [['Bouye', '500'], ['Bissap', '500'], ['Gingembre', '500'], ['Café Touba', '100'], ['Sandwich', '750']];
    c.font = 'bold 10px sans-serif'; c.textBaseline = 'middle';
    rows.forEach(([a, b], i) => { c.fillStyle = '#f1ece0'; c.textAlign = 'left'; c.fillText(a, x + 10, y + 32 + i * 12); c.textAlign = 'right'; c.fillStyle = '#f2c230'; c.fillText(b + ' F', x + w - 10, y + 32 + i * 12); });
    g.fillStyle = '#5a5a3a'; g.fillRect(x + 6, y + 6, w - 12, h - 12); }
  // drinks fridge front (glass, rows of bottles, lit)
  { const [x, y, w, h] = P('fridge'); for (const ctx of [c, g]) { ctx.fillStyle = '#d8e6ea'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#9fb7c0'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { c.fillStyle = GOODS[(i * 3 + j) % GOODS.length]; c.fillRect(x + 7 + i * 9, y + 10 + j * 21, 6, 15); c.fillStyle = '#e6e6e6'; c.fillRect(x + 6, y + 26 + j * 21, w - 12, 2); }
    g.fillStyle = '#b8d4dc'; g.fillRect(x + 4, y + 4, w - 8, 6); c.fillStyle = '#d0312a'; c.fillRect(x, y, w, 4); }
  // green cross (a generic sign, no name), clock, guichet plate, price tag, ticket screen
  { const [x, y] = P('cross'); for (const ctx of [c, g]) { ctx.fillStyle = '#0d2a1a'; ctx.fillRect(x, y, 32, 32); ctx.fillStyle = '#2ecc71'; ctx.fillRect(x + 11, y + 4, 10, 24); ctx.fillRect(x + 4, y + 11, 24, 10); } }
  { const [x, y] = P('clock'); c.fillStyle = '#f7f7f4'; c.beginPath(); c.arc(x + 16, y + 16, 15, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#1d1f24'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(x + 16, y + 16); c.lineTo(x + 16, y + 6); c.moveTo(x + 16, y + 16); c.lineTo(x + 23, y + 19); c.stroke(); }
  { const [x, y, w, h] = P('guichet'); c.fillStyle = '#145d5b'; c.fillRect(x, y, w, h); label(c, x, y + h / 2, w, 'GUICHET', 11, '#fff2d3'); }
  { const [x, y] = P('tag'); c.fillStyle = '#f2c230'; c.fillRect(x, y, 32, 32); label(c, x, y + 16, 32, '500 F', 10, '#1d1f24'); }
  { const [x, y] = P('ticket'); for (const ctx of [c, g]) { ctx.fillStyle = '#103040'; ctx.fillRect(x, y, 32, 32); } label(c, x, y + 12, 32, 'TICKET', 7, '#8fe3ff'); label(c, x, y + 22, 32, 'A 042', 8, '#ffffff'); g.fillStyle = '#2a6a8a'; g.fillRect(x + 4, y + 4, 24, 24); }
  // posters (the bank's own, health, repairs, fashion) — generic, game-made
  { const [x, y] = P('poster0'); c.fillStyle = '#145d5b'; c.fillRect(x, y, 64, 96); c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(x + 32, y + 18); c.lineTo(x + 52, y + 36); c.lineTo(x + 12, y + 36); c.fill(); c.fillRect(x + 18, y + 36, 28, 20);
    c.fillStyle = '#145d5b'; c.fillRect(x + 28, y + 44, 8, 12); label(c, x, y + 68, 64, 'VOTRE PROJET', 7, '#fff2d3'); label(c, x, y + 80, 64, 'TERANGA', 10, '#f2c230'); }
  { const [x, y] = P('poster1'); c.fillStyle = '#f2f7f2'; c.fillRect(x, y, 64, 96); c.fillStyle = '#2ecc71'; c.fillRect(x + 26, y + 12, 12, 32); c.fillRect(x + 16, y + 22, 32, 12);
    label(c, x, y + 60, 64, 'PRENEZ SOIN', 7, '#1d5a33'); label(c, x, y + 72, 64, 'DE VOUS', 7, '#1d5a33'); c.fillStyle = '#2ecc71'; c.fillRect(x + 8, y + 84, 48, 3); }
  { const [x, y] = P('poster2'); c.fillStyle = '#1d2a44'; c.fillRect(x, y, 64, 96); c.fillStyle = '#e6e6e6'; c.fillRect(x + 22, y + 10, 20, 36); c.fillStyle = '#2a6fd1'; c.fillRect(x + 24, y + 13, 16, 28);
    c.strokeStyle = '#f2c230'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 46, y + 14); c.lineTo(x + 54, y + 40); c.stroke(); label(c, x, y + 62, 64, 'RÉPARATION', 8, '#f2c230'); label(c, x, y + 76, 64, 'EXPRESS', 9, '#ffffff'); }
  { const [x, y] = P('poster3'); c.fillStyle = '#f1e4d0'; c.fillRect(x, y, 64, 96); c.fillStyle = '#c2417f'; c.beginPath(); c.moveTo(x + 32, y + 18); c.lineTo(x + 50, y + 74); c.lineTo(x + 14, y + 74); c.fill();
    c.fillStyle = '#5b3420'; c.beginPath(); c.arc(x + 32, y + 14, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f4c20d'; c.fillRect(x + 20, y + 40, 24, 4); label(c, x, y + 86, 64, 'NOUVELLE COLLECTION', 6, '#7a2f55'); }
  { const [x, y] = P('safe'); c.fillStyle = '#7d8790'; c.fillRect(x, y, 64, 96); c.fillStyle = '#a7b0b8'; c.fillRect(x + 4, y + 4, 56, 88); c.strokeStyle = '#4a525a'; c.lineWidth = 3; c.beginPath(); c.arc(x + 32, y + 48, 14, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.moveTo(x + 32, y + 48); c.lineTo(x + 32 + Math.cos(a) * 14, y + 48 + Math.sin(a) * 14); c.stroke(); } }
  { const [x, y] = P('glassDoor'); c.fillStyle = '#5b6168'; c.fillRect(x, y, 64, 96); c.fillStyle = '#a9c7d2'; c.fillRect(x + 5, y + 5, 54, 86); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + 12, y + 8, 6, 80); }
  { const [x, y] = P('curtain'); for (let k = 0; k < 64; k += 8) { c.fillStyle = k % 16 ? '#8a1a2a' : '#a52a3c'; c.fillRect(x + k, y, 8, 96); } c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, y + 88, 64, 8); }
  { const [x, y] = P('basket'); c.fillStyle = '#d9b77a'; c.fillRect(x, y, 64, 64); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { c.fillStyle = (i + j) % 2 ? '#c49a58' : '#e6c98f'; c.fillRect(x + i * 8, y + j * 8, 8, 8); }
    c.fillStyle = '#8a2f2a'; c.fillRect(x, y + 20, 64, 5); c.fillStyle = '#2f6b45'; c.fillRect(x, y + 40, 64, 4); }
  { const [x, y] = P('leather'); c.fillStyle = '#7a4a26'; c.fillRect(x, y, 64, 32); c.strokeStyle = '#d9b77a'; c.setLineDash([3, 2]); c.strokeRect(x + 4, y + 4, 56, 24); c.setLineDash([]); c.fillStyle = '#c9a043'; c.fillRect(x + 28, y + 12, 8, 8); }
  { const [x, y] = P('tiles'); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.fillStyle = (i + j) % 2 ? '#e8e2d4' : '#d9d2c0'; c.fillRect(x + i * 16, y + j * 16, 16, 16); } c.fillStyle = '#b9b2a2'; for (let k = 0; k <= 64; k += 16) { c.fillRect(x + k, y, 1, 64); c.fillRect(x, y + k, 64, 1); } }
  for (const [k, a, b] of [['wood', '#9a6a3e', '#86592f'], ['wood2', '#7a4a26', '#6a3e1e']] as [ShopKey, string, string][]) { const [x, y, w, h] = P(k); c.fillStyle = a; c.fillRect(x, y, w, h); c.fillStyle = b; for (let j = 0; j < h; j += 5) c.fillRect(x, y + j, w, 1.5); }
  { const [x, y] = P('wall'); c.fillStyle = '#efe6d4'; c.fillRect(x, y, 64, 64); c.fillStyle = 'rgba(0,0,0,0.04)'; for (let k = 0; k < 40; k++) c.fillRect(x + (k * 37) % 64, y + (k * 23) % 64, 3, 2); c.fillStyle = '#c9b48f'; c.fillRect(x, y + 56, 64, 8); }
  { const [x, y] = P('natte'); c.fillStyle = '#d9b77a'; c.fillRect(x, y, 64, 64); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { c.fillStyle = (i + j) % 2 ? '#c49a58' : '#e6c98f'; c.fillRect(x + i * 8, y + j * 8, 8, 8); }
    c.fillStyle = '#8a2f2a'; c.fillRect(x, y + 28, 64, 4); c.fillStyle = '#2f6b45'; c.fillRect(x, y + 34, 64, 3); }
  { const [x, y] = P('pirogue'); const cols = ['#d9322b', '#f4c20d', '#1a9d54', '#2f6fb3', '#f2f2ec', '#1a9d54', '#d9322b', '#f4c20d'];
    for (let k = 0; k < 8; k++) { c.fillStyle = cols[k]; c.fillRect(x, y + k * 8, 64, 8); } c.fillStyle = '#1d1f24'; for (let i = 0; i < 64; i += 16) { c.beginPath(); c.moveTo(x + i, y + 32); c.lineTo(x + i + 8, y + 24); c.lineTo(x + i + 16, y + 32); c.fill(); } }
  // counter panels (what the shop does, in plain words)
  panel(c, 'pnlGrocery', '#2a6f6d', '#fff2d3', 'ALIMENTATION');
  panel(c, 'pnlPhone', '#1d2a44', '#8fd0ff', 'TÉLÉPHONIE');
  panel(c, 'pnlCloth', '#7a2f55', '#f6e7c1', 'COUTURE · TISSUS');
  panel(c, 'pnlHome', '#9a472d', '#fff2d3', 'MAISON · DÉCO');
  panel(c, 'pnlPharma', '#f2f7f2', '#1d7a43', 'SANTÉ · SOINS');
  panel(c, 'pnlJuice', '#49704b', '#fff2d3', 'JUS FRAIS');
  panel(c, 'pnlBank', '#145d5b', '#fff2d3', 'ACCUEIL');
  panel(c, 'pnlHardware', '#2b2f36', '#f2c230', 'QUINCAILLERIE');
  panel(c, 'pnlCraft', '#8a5a32', '#fff2d3', 'ARTISANAT');
  panel(c, 'pnlBeauty', '#6b3fa0', '#f6e7c1', 'BEAUTÉ');
  panel(c, 'transfer', '#f2c230', '#1d1f24', 'CRÉDIT · TRANSFERT');
  // shelf strips (one quad = a row of goods)
  strip(c, 'sGrocery', 12, (x, y, w, h, i) => { const col = GOODS[(i * 5) % GOODS.length]; const hh = 14 + (i * 7) % 12; c.fillStyle = col; c.fillRect(x + 1, y + h - 3 - hh, w - 2, hh); c.fillStyle = '#ffffff'; c.fillRect(x + 2, y + h - 3 - hh + 4, w - 4, 3); });
  strip(c, 'sPharma', 14, (x, y, w, h, i) => { const hh = 10 + (i * 5) % 10; c.fillStyle = '#f7f7f4'; c.fillRect(x + 1, y + h - 3 - hh, w - 2, hh); c.fillStyle = ['#2e9b57', '#2f6fb3', '#d0312a', '#e8822c'][i % 4]; c.fillRect(x + 1, y + h - 3 - hh + 2, w - 2, 3); });
  strip(c, 'sHardware', 10, (x, y, w, h, i) => { const hh = 16 + (i % 3) * 4; c.fillStyle = '#c9cdd2'; c.fillRect(x + 1, y + h - 3 - hh, w - 2, hh); c.fillStyle = ['#d0312a', '#2f6fb3', '#f2c230', '#2e9b57', '#f2f2ee'][i % 5]; c.fillRect(x + 1, y + h - 3 - hh + 4, w - 2, hh - 8); });
  strip(c, 'sTech', 8, (x, y, w, h, i) => { c.fillStyle = i % 3 ? '#1d1f24' : '#e6e6e6'; c.fillRect(x + 2, y + 6, w - 4, h - 9); c.fillStyle = '#2a6fd1'; if (i % 2) c.fillRect(x + 5, y + 9, w - 10, h - 16); else { c.fillStyle = '#555'; c.beginPath(); c.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2); c.fill(); } });
  strip(c, 'sFabric', 8, (x, y, w, _h, i) => { const cols = ['#c2417f', '#1f5aa8', '#e8a322', '#1a8a5a', '#7a2fa0', '#d9482b', '#3a7bd5', '#f1ece0']; for (let k = 0; k < 4; k++) { c.fillStyle = cols[(i + k) % cols.length]; c.fillRect(x + 1, y + 5 + k * 6, w - 2, 5); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 1 + (k * 3) % 8, y + 6 + k * 6, 3, 3); } });
  strip(c, 'sHome', 9, (x, y, w, h, i) => { const col = ['#f2f2ee', '#c9cdd2', '#d0312a', '#2f6fb3', '#f2c230'][i % 5]; c.fillStyle = col; if (i % 3 === 0) { for (let k = 0; k < 4; k++) c.fillRect(x + 2, y + h - 6 - k * 3, w - 4, 2); } else if (i % 3 === 1) { c.beginPath(); c.ellipse(x + w / 2, y + h - 10, w / 2 - 2, 8, 0, 0, Math.PI * 2); c.fill(); } else c.fillRect(x + w / 2 - 3, y + 6, 6, h - 9); });
  strip(c, 'sBeauty', 12, (x, y, w, h, i) => { const hh = 12 + (i * 5) % 10; c.fillStyle = ['#c2417f', '#f2f2ee', '#f2c230', '#6b3fa0', '#2e9b57'][i % 5]; c.fillRect(x + 2, y + h - 3 - hh, w - 4, hh); c.fillStyle = '#1d1f24'; c.fillRect(x + 3, y + h - 5 - hh, w - 6, 3); });
  strip(c, 'sCraft', 6, (x, y, w, h, i) => { if (i % 2) { c.fillStyle = '#d9b77a'; c.beginPath(); c.moveTo(x + 3, y + 6); c.lineTo(x + w - 3, y + 6); c.lineTo(x + w - 6, y + h - 3); c.lineTo(x + 6, y + h - 3); c.fill(); c.fillStyle = '#8a2f2a'; c.fillRect(x + 4, y + 12, w - 8, 3); } else { c.fillStyle = '#7a4a26'; c.fillRect(x + 4, y + 10, w - 8, h - 13); c.fillStyle = '#c9a043'; c.fillRect(x + w / 2 - 2, y + 14, 4, 4); } });
  strip(c, 'sBottles', 16, (x, y, w, h, i) => { c.fillStyle = ['#e9b62a', '#a9d6f0', '#7d1730', '#ee7d22'][i % 4]; c.fillRect(x + 2, y + 9, w - 4, h - 12); c.fillRect(x + w / 2 - 1, y + 4, 2, 5); c.fillStyle = '#f6f1e0'; c.fillRect(x + 2, y + 16, w - 4, 5); });
  strip(c, 'sFiles', 14, (x, y, w, h, i) => { c.fillStyle = ['#145d5b', '#2f6fb3', '#c23a2e', '#f2c230', '#5b6168'][i % 5]; c.fillRect(x + 1, y + 5, w - 2, h - 8); c.fillStyle = '#f2f2ee'; c.fillRect(x + 2, y + 9, w - 4, 4); });
  strip(c, 'sShoes', 8, (x, y, w, h, i) => { c.fillStyle = ['#1d1f24', '#7a4a26', '#c2417f', '#f2f2ee', '#c9a043'][i % 5]; c.beginPath(); c.ellipse(x + w / 2 - 3, y + h - 8, 5, 4, 0, 0, Math.PI * 2); c.ellipse(x + w / 2 + 4, y + h - 8, 5, 4, 0, 0, Math.PI * 2); c.fill(); });
  strip(c, 'sBooks', 16, (x, y, w, h, i) => { c.fillStyle = GOODS[(i * 4) % GOODS.length]; c.fillRect(x + 1, y + 4 + (i % 3) * 2, w - 2, h - 7 - (i % 3) * 2); });
  // garage: panel, a strip of parts boxes and cans, oil cans, a tyre's tread, a plate of grilled fish (restaurant)
  panel(c, 'pnlGarage', '#2b2f36', '#f2c230', 'MÉCANIQUE · MOTOS');
  strip(c, 'sParts', 10, (x, y, w, h, i) => { if (i % 3 === 2) { c.fillStyle = ['#d9a420', '#c23a2e', '#2b2f36'][i % 3]; c.fillRect(x + 2, y + 8, w - 4, h - 11); c.fillRect(x + w / 2 - 2, y + 4, 5, 4); } else { c.fillStyle = i % 2 ? '#b08d5e' : '#e6e6e6'; c.fillRect(x + 1, y + 10, w - 2, h - 13); c.fillStyle = '#c23a2e'; c.fillRect(x + 2, y + 13, w - 4, 3); } });
  for (const [k, col, word] of [['oil0', '#d9a420', 'HUILE MOTEUR'], ['oil1', '#2b2f36', '2 TEMPS']] as [ShopKey, string, string][]) {
    const [x, y] = P(k); c.fillStyle = col; c.fillRect(x, y, 32, 32); c.fillStyle = '#f2f2ee'; c.fillRect(x, y + 10, 32, 12); label(c, x, y + 16, 32, word, 5, '#1d1f24');
  }
  { const [x, y] = P('tyre'); c.fillStyle = '#1d1d1f'; c.fillRect(x, y, 32, 32); c.fillStyle = '#3a3a3e'; for (let k = 0; k < 32; k += 6) { c.fillRect(x + k, y, 3, 32); } }
  { const [x, y] = P('plate'); c.fillStyle = '#f2f2ee'; c.beginPath(); c.arc(x + 16, y + 16, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b5652e'; c.beginPath(); c.ellipse(x + 15, y + 15, 10, 5, -0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f2c230'; c.beginPath(); c.arc(x + 23, y + 21, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3f8b3a'; c.fillRect(x + 6, y + 20, 5, 3); }
  // restaurant: the lit menu (its two dishes, the game's prices), the counter panel, a seaside painting, the kitchen pass
  { const [x, y, w, h] = P('menuResto'); for (const ctx of [c, g]) { ctx.fillStyle = '#0c2a3e'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
    label(c, x, y + 14, w, 'LA CARTE', 14, '#f2c230');
    const rows: [string, string][] = [['Poisson grillé', '3 500'], ['Jus de bissap', '800']];
    c.font = 'bold 10px sans-serif'; c.textBaseline = 'middle';
    rows.forEach(([a, b], i) => { c.fillStyle = '#f1ece0'; c.textAlign = 'left'; c.fillText(a, x + 10, y + 36 + i * 16); c.textAlign = 'right'; c.fillStyle = '#f2c230'; c.fillText(b + ' F', x + w - 10, y + 36 + i * 16); });
    label(c, x, y + 80, w, 'Face à l’océan', 9, '#9fc7dd', 'italic');
    g.fillStyle = '#3a4a5a'; g.fillRect(x + 6, y + 6, w - 12, h - 12); }
  panel(c, 'pnlResto', '#0c4a6e', '#f3f0ea', 'RESTAURANT');
  { const [x, y, w, h] = P('seaview'); const gr = c.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#f7b267'); gr.addColorStop(0.5, '#f4845f'); gr.addColorStop(0.52, '#2a6f97'); gr.addColorStop(1, '#14425e');
    c.fillStyle = gr; c.fillRect(x, y, w, h); c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(x + 80, y + 32, 9, Math.PI, 0); c.fill();
    c.fillStyle = '#3b2a1e'; c.beginPath(); c.moveTo(x + 18, y + 40); c.lineTo(x + 52, y + 40); c.lineTo(x + 46, y + 46); c.lineTo(x + 24, y + 46); c.fill();   // a pirogue on the sea
    c.strokeStyle = '#8a5a32'; c.lineWidth = 6; c.strokeRect(x + 3, y + 3, w - 6, h - 6); }
  { const [x, y, w, h] = P('pass'); for (const ctx of [c, g]) { ctx.fillStyle = '#2b2620'; ctx.fillRect(x, y, w, h); }
    c.fillStyle = '#c9cdd2'; c.fillRect(x + 4, y + h - 14, w - 8, 10);                                     // the pass shelf, steel
    for (let k = 0; k < 4; k++) { c.fillStyle = '#f2f2ee'; c.beginPath(); c.ellipse(x + 18 + k * 30, y + h - 16, 11, 4, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#b5652e'; c.fillRect(x + 12 + k * 30, y + h - 19, 12, 3); }
    g.fillStyle = '#7a4a1a'; g.fillRect(x + 4, y + 4, w - 8, h - 24); }                                   // heat lamps over the pass
  { const [x, y] = P('checker'); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { c.fillStyle = (i + j) % 2 ? '#f2f2ee' : '#c23a2e'; c.fillRect(x + i * 8, y + j * 8, 8, 8); } }
  { const [x, y] = P('cloth2'); c.fillStyle = '#f2f2ee'; c.fillRect(x, y, 64, 64); c.fillStyle = '#0c4a6e'; for (let k = 4; k < 64; k += 12) { c.fillRect(x + k, y, 3, 64); c.fillRect(x, y + k, 64, 3); } }
  { const [x, y, w, h] = P('wood3'); c.fillStyle = '#b48c5c'; c.fillRect(x, y, w, h); c.fillStyle = '#9a744a'; for (let j = 0; j < h; j += 4) c.fillRect(x, y + j, w, 1.5); }
  // car showroom: the board of keys behind the salesman (numbered tags), price cards (the other cars are taken), the desk
  // panel with the dealer's (fictional) name, large light floor tiles, a poster
  { const [x, y, w, h] = P('keys'); c.fillStyle = '#6b4a2e'; c.fillRect(x, y, w, h); c.fillStyle = '#c9a77a'; c.fillRect(x + 3, y + 3, w - 6, h - 6);
    const tags = ['#d0312a', '#2f6fb3', '#f2c230', '#2e9b57', '#f2f2ee', '#e8822c'];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
      const kx = x + 10 + i * 15, ky = y + 9 + j * 19, n = j * 6 + i;
      c.fillStyle = '#5b6168'; c.fillRect(kx - 1, ky - 3, 2, 3);                                   // the hook
      if (n === 4 || n === 13) continue;                                                          // two keys out (on a test drive)
      c.strokeStyle = '#9aa0a6'; c.lineWidth = 1.2; c.beginPath(); c.arc(kx, ky + 2, 2.5, 0, Math.PI * 2); c.stroke();   // the ring
      c.fillStyle = '#c9cdd2'; c.fillRect(kx - 1, ky + 4, 2, 6);                                   // the key
      c.fillStyle = tags[(i + j) % tags.length]; c.fillRect(kx + 2, ky + 3, 5, 7);                 // its tag
      c.fillStyle = '#1d1f24'; c.font = 'bold 4px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n + 1), kx + 4.5, ky + 6.5);
    } }
  const card = (k: ShopKey, top: string, price: string, band: string | null, bandCol: string) => {
    const [x, y, w, h] = P(k); c.fillStyle = '#f2c230'; c.fillRect(x, y, w, h); c.fillStyle = '#ffffff'; c.fillRect(x + 2, y + 2, w - 4, h - 4);
    c.fillStyle = '#1b2a7a'; c.fillRect(x + 2, y + 2, w - 4, 9); label(c, x, y + 6.5, w, top, 6, '#f2c230');
    label(c, x, y + 20, w, price, price.length > 8 ? 8 : 9, '#1d1f24');
    if (band) { c.fillStyle = bandCol; c.fillRect(x + 2, y + h - 12, w - 4, 10); label(c, x, y + h - 7, w, band, 7, '#ffffff'); }
    else { label(c, x, y + h - 8, w, 'BON ÉTAT', 6, '#1b2a7a'); }
  };
  card('carCard0', 'OCCASION', 'À VENDRE', null, '');
  card('carCard1', 'OCCASION', '3 400 000 F', 'RÉSERVÉE', '#c8322a');
  card('carCard2', 'OCCASION', '4 100 000 F', 'VENDUE', '#2e6b30');
  panel(c, 'pnlCars', '#1b2a7a', '#f2c230', 'NDIAYE AUTO · OCCASIONS');
  { const [x, y] = P('floorShow'); for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { c.fillStyle = (i + j) % 2 ? '#e4e5e2' : '#dcdedb'; c.fillRect(x + i * 32, y + j * 32, 32, 32); }
    c.fillStyle = '#b9bcb8'; for (let k = 0; k <= 64; k += 32) { c.fillRect(x + Math.min(k, 63), y, 1, 64); c.fillRect(x, y + Math.min(k, 63), 64, 1); }
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 4, y + 4, 10, 2); c.fillRect(x + 36, y + 36, 10, 2); }
  { const [x, y, w, h] = P('posterCars'); c.fillStyle = '#1b2a7a'; c.fillRect(x, y, w, h); c.fillStyle = '#f2c230'; c.fillRect(x, y + h - 14, w, 14);
    c.fillStyle = '#c9cdd2'; c.beginPath(); c.moveTo(x + 5, y + 30); c.lineTo(x + 12, y + 22); c.lineTo(x + 30, y + 22); c.lineTo(x + 39, y + 30); c.lineTo(x + 39, y + 36); c.lineTo(x + 5, y + 36); c.fill();   // a saloon
    c.fillStyle = '#1d1f24'; c.beginPath(); c.arc(x + 13, y + 37, 3.5, 0, Math.PI * 2); c.arc(x + 31, y + 37, 3.5, 0, Math.PI * 2); c.fill();
    label(c, x, y + 10, w, 'PRÊTE', 8, '#ffffff'); label(c, x, y + 50, w, 'À ROULER', 7, '#ffffff'); label(c, x, y + h - 7, w, 'CONTRÔLÉE', 6, '#1b2a7a'); }
  // ceiling tube: glow
  g.fillStyle = '#fff4dc'; g.fillRect(0, 16, 16, 16);
}
