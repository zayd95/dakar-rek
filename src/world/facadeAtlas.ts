/**
 * The facade atlas: every district's walls are drawn from ONE texture (and one material, one draw call per hub), but a wall is no longer one window
 * repeated to the ground. The atlas is `FACADE_ROWS` kinds of storey, each in `FACADE_COLS` bays that differ (an open window, closed shutters, an air
 * conditioner, a blank bay…). A building's faces name the row of their upper storeys, of their ground floor and of their top floor (`FacadeStyle`,
 * src/world/batch.ts); the facade shader (src/world/grain.ts, `windows`) picks a bay for each cell of the wall, centres the bays on the face so no
 * window is cut by a corner, and lights some of them at night.
 *
 * Two layers in one RGBA image: what the building's paint tints (render, sills, the old louvred shutters), and what keeps its own colour (a roller
 * shutter, a green metal door, a shop's board, white aluminium frames, bare breeze blocks). The alpha channel says which: 1 = painted by the wall
 * colour, 0.5 = own colour (never below 0.5: a canvas stores its colours premultiplied, and half is where they still survive).
 *
 * A storey is 128 px for 3.4 m × 3.2 m (as the single window tile was). The left 8 px of every row's first bay are wall only: the shader paints the
 * margins of a face (what is left over once the whole bays are centred) from that strip, so the storey's bands run on to the corner.
 */
export const FACADE_COLS = 4, FACADE_ROWS = 8;
/** The rows. `CLASSIC` (row 0, bay 0) is the districts' old window, untouched: what every wall without a style shows. */
export const ROW = {
  /** Rendered wall, a window between louvred shutters (bay 0: exactly the old tile). */
  CLASSIC: 0,
  /** Offices (the Plateau): a ribbon of glass under a concrete sun-breaker, a claustra bay, blinds. */
  OFFICE: 1,
  /** A commercial ground floor: roller shutter, open shop, the building's door, a glazed front; a painted board over each. */
  SHOPS: 2,
  /** A residential ground floor: a metal door, small barred windows, a meter box, the dusty plinth. */
  HOME_GROUND: 3,
  /** Mermoz · Sacré-Cœur: white aluminium windows and balcony doors over a band of ceramic tiles, wrought-iron grilles. */
  TILED: 4,
  /** Pikine: small windows with painted metal shutters, cloth curtains, cement patches on rough render. */
  SELF_BUILT: 5,
  /** A floor that waits for its walls' render: bare breeze blocks between concrete posts, empty openings. */
  UNFINISHED: 6,
  /** Modern blocks (the university residences of Fann, new apartments): wide windows under sun-breakers, jalousies, loggias, claustras. */
  MODERN: 7,
} as const;

type C2 = CanvasRenderingContext2D;
const S = 128;
/** Deterministic speckle: the atlas is the same on every device and every build. */
function prng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

interface Painter {
  /** Tinted by the building's colour (white-based). */ t: C2;
  /** Keeps its own colour. */ o: C2;
  /** Night glow mask (white = lit glass). */ g: C2;
  r: () => number;
}

const rect = (c: C2, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** Rendered plaster with the speckle of the old tile. */
function plaster(p: Painter, rough = 0) {
  rect(p.t, '#fbfaf7', 0, 0, S, S);
  for (let i = 0; i < 700; i++) { const v = 235 + Math.floor(p.r() * 20); rect(p.t, `rgb(${v},${v - 2},${v - 6})`, p.r() * S, p.r() * S, 2, 2); }
  for (let i = 0; i < rough; i++) {                                    // blotches of a rougher render (self-built walls)
    const v = 205 + Math.floor(p.r() * 30); p.t.fillStyle = `rgba(${v},${v - 4},${v - 12},0.5)`;
    p.t.beginPath(); p.t.ellipse(p.r() * S, p.r() * S, 4 + p.r() * 12, 2 + p.r() * 6, p.r() * 3, 0, Math.PI * 2); p.t.fill();
  }
}
/** The slab's line between two storeys (bottom of the tile). */
function slab(p: Painter) { rect(p.t, '#d9d3c7', 0, S - 9, S, 9); rect(p.t, '#c9c1b2', 0, S - 10, S, 2); }
/** The dusty plinth of a ground floor (tinted: a darker band of the wall's own paint), 0.7 m. */
function plinth(p: Painter, x0 = 0, x1 = S) {
  rect(p.t, '#b3ab9c', x0, S - 28, x1 - x0, 28); rect(p.t, '#9a9284', x0, S - 29, x1 - x0, 2);
  const g = p.t.createLinearGradient(0, S - 46, 0, S - 28); g.addColorStop(0, 'rgba(120,108,90,0)'); g.addColorStop(1, 'rgba(120,108,90,0.28)');
  p.t.fillStyle = g; p.t.fillRect(x0, S - 46, x1 - x0, 18);                                         // splash above it
}
/** Dark glass with two lighter panes' reflections, and its share of the glow mask. */
function glassAt(p: Painter, x: number, y: number, w: number, h: number, glow = 1, own = false) {
  const c = own ? p.o : p.t;
  rect(c, '#26303d', x, y, w, h);
  rect(c, '#55697f', x + 1, y + 1, w - 2, Math.max(2, h * 0.42)); rect(c, '#43546a', x + 1, y + 1 + Math.max(2, h * 0.42), w - 2, h - 2 - Math.max(2, h * 0.42));
  if (glow > 0) { const v = Math.round(255 * glow); rect(p.g, `rgb(${v},${v},${v})`, x + 1, y + 1, w - 2, h - 2); }
}
/** A drip stain under a sill. */
function drip(p: Painter, x: number, y: number, w: number, h: number) {
  const g = p.t.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(120,110,95,0.35)'); g.addColorStop(1, 'rgba(120,110,95,0)');
  p.t.fillStyle = g; p.t.fillRect(x, y, w, h);
}
/** A split air conditioner's outdoor unit on the wall (its own colour). */
function acBox(p: Painter, x: number, y: number) {
  rect(p.o, '#dcdad3', x, y, 26, 15); rect(p.o, '#b9b7b0', x, y + 13, 26, 2);
  p.o.fillStyle = '#8f8d87'; p.o.beginPath(); p.o.arc(x + 9, y + 7, 5, 0, Math.PI * 2); p.o.fill();
  rect(p.o, '#c9c7c0', x + 17, y + 3, 7, 1); rect(p.o, '#c9c7c0', x + 17, y + 6, 7, 1); rect(p.o, '#c9c7c0', x + 17, y + 9, 7, 1);
  drip(p, x + 4, y + 15, 14, 22);
}
/** A painted board over a shop: a colour, a border and what reads as a line of letters from the street. */
function board(p: Painter, x: number, y: number, w: number, h: number, bg: string, fg: string, glow = 0.16) {
  rect(p.o, bg, x, y, w, h); p.o.strokeStyle = fg; p.o.lineWidth = 1; p.o.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  let lx = x + 7; p.o.fillStyle = fg;
  while (lx < x + w - 10) { const lw = 3 + Math.floor(p.r() * 5); p.o.fillRect(lx, y + h * 0.3, lw, h * 0.42); lx += lw + 2 + (p.r() < 0.22 ? 5 : 0); }
  if (glow > 0) { const v = Math.round(255 * glow); rect(p.g, `rgb(${v},${v},${v})`, x, y, w, h); }
}

// ---------------------------------------------------------------- row 0: the classic window
function classic(p: Painter, k: number) {
  plaster(p); slab(p);
  rect(p.t, '#e6e1d8', 34, 18, 60, 74);                                  // window surround
  rect(p.t, '#26303d', 40, 24, 48, 62);                                  // recess / glass
  if (k !== 1) {
    rect(p.t, '#5b6f86', 42, 26, 20, 26); rect(p.t, '#4a5c71', 66, 26, 20, 26);
    rect(p.t, '#e9e5dd', 63, 24, 3, 62); rect(p.t, '#e9e5dd', 40, 53, 48, 3);     // mullions
    rect(p.g, '#fff', 42, 26, 44, 58);
  }
  if (k === 1) {                                                          // both leaves closed over the window (the room is empty, or it is noon)
    for (const x of [40, 64]) { rect(p.t, '#8b8f8c', x, 24, 24, 62); p.t.fillStyle = '#6d726f'; for (let y = 27; y < 84; y += 5) p.t.fillRect(x + 1, y, 22, 2); }
    rect(p.t, '#5f6360', 63, 24, 2, 62);
  } else {
    for (const x of [22, 94]) {                                           // louvred shutters folded back
      if (k === 2 && x === 22) continue;
      rect(p.t, '#8b8f8c', x, 24, 12, 62); p.t.fillStyle = '#6d726f'; for (let y = 27; y < 84; y += 5) p.t.fillRect(x + 1, y, 10, 2);
    }
    if (k === 2) {                                                        // one leaf pulled to, a curtain behind the other pane
      rect(p.t, '#8b8f8c', 40, 24, 23, 62); p.t.fillStyle = '#6d726f'; for (let y = 27; y < 84; y += 5) p.t.fillRect(41, y, 21, 2);
      rect(p.o, '#d8c9a8', 67, 26, 9, 58); rect(p.o, '#c4b38e', 70, 26, 2, 58);
      rect(p.g, '#000', 40, 24, 24, 62);
    }
  }
  rect(p.t, '#cfc8ba', 32, 90, 64, 5);                                    // sill
  if (k === 3) acBox(p, 70, 97); else drip(p, 44, 95, 40, S - 105);
}

// ---------------------------------------------------------------- row 1: offices
function office(p: Painter, k: number) {
  plaster(p); slab(p);
  rect(p.o, '#efebe2', 8, 17, 112, 6); rect(p.t, '#8f887c', 8, 23, 112, 3);        // the concrete sun-breaker over the ribbon, and its shade
  rect(p.t, '#e6e1d8', 8, 26, 112, 58);
  const x0 = k === 2 ? 62 : 12;
  glassAt(p, x0, 29, 116 - x0, 52, k === 1 ? 0.55 : 1, true);
  for (let x = x0 + 26; x < 112; x += 26) rect(p.o, '#d9d6cf', x, 29, 2, 52);        // aluminium mullions
  rect(p.o, '#d9d6cf', x0, 62, 116 - x0, 2);
  if (k === 1) { p.o.fillStyle = '#c9cfd2'; for (let y = 31; y < 60; y += 4) p.o.fillRect(x0 + 1, y, 114 - x0, 2); }   // blinds down to the transom
  if (k === 2) {                                                          // a claustra bay: the stair or the corridor behind a screen of pierced blocks
    rect(p.o, '#ece8de', 12, 29, 46, 52);
    p.o.fillStyle = '#4b4a48'; for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) p.o.fillRect(15 + i * 9, 32 + j * 8.4, 5, 5);
    rect(p.g, '#3a3a3a', 12, 29, 46, 52);
  }
  if (k === 3) { rect(p.o, '#15191f', 90, 31, 24, 30); acBox(p, 20, 90); acBox(p, 78, 90); }   // a pane swung open; the floor's air conditioners on the spandrel
  for (const x of [8, 117]) rect(p.o, '#efebe2', x, 26, 3, 58);                  // the frame's posts
  rect(p.t, '#cfc8ba', 8, 84, 112, 4);
}

// ---------------------------------------------------------------- row 2: shops
function shops(p: Painter, k: number) {
  plaster(p);
  rect(p.t, '#d9d3c7', 0, 0, S, 6);                                       // the slab over the shops
  rect(p.o, '#8f8d86', 0, S - 9, S, 9); rect(p.o, '#77756f', 0, S - 10, S, 2);     // the concrete step along the front
  const X0 = 13, W = 102, Y0 = 34, H = S - 9 - Y0;
  if (k === 0) {                                                          // a roller shutter down
    board(p, X0 - 2, 9, W + 4, 21, '#b8322a', '#fbf3e0');
    rect(p.o, '#8d979e', X0, Y0, W, H); p.o.fillStyle = '#737c83'; for (let y = Y0 + 3; y < Y0 + H - 4; y += 5) p.o.fillRect(X0, y, W, 2);
    rect(p.o, '#5d656b', X0, Y0, W, 5); rect(p.o, '#5d656b', X0 + W / 2 - 5, Y0 + H - 12, 10, 8); rect(p.o, '#63696e', X0, Y0 + H - 3, W, 3);
  } else if (k === 1) {                                                   // an open shop: the shelves in the shade, the counter, the shutter rolled up
    board(p, X0 - 2, 9, W + 4, 21, '#1f5fa8', '#f9d648');
    rect(p.o, '#1d1a17', X0, Y0, W, H); rect(p.o, '#5d656b', X0, Y0, W, 7);
    const goods = ['#d9482b', '#f4c20d', '#2f8f4e', '#e8e2d2', '#1e6fd9', '#e8742c', '#c2307a', '#f2efe6'];
    for (let s = 0; s < 3; s++) {
      rect(p.o, '#6b5137', X0 + 5, Y0 + 26 + s * 18, W - 10, 2);
      for (let x = X0 + 7; x < X0 + W - 12; x += 6 + Math.floor(p.r() * 3)) { const h = 7 + Math.floor(p.r() * 6); rect(p.o, goods[Math.floor(p.r() * goods.length)], x, Y0 + 26 + s * 18 - h, 5, h); }
    }
    rect(p.o, '#7a5a3c', X0 + 4, Y0 + H - 22, W - 34, 22); rect(p.o, '#5a3f2a', X0 + 4, Y0 + H - 23, W - 34, 3);
    rect(p.g, '#c8c8c8', X0, Y0 + 7, W, H - 7);
  } else if (k === 2) {                                                   // the building's own door, between the shops: a number, a lamp, a letter box
    plinth(p, 0, 44); plinth(p, 86, S);
    rect(p.o, '#8f8d86', 0, S - 9, S, 9); rect(p.o, '#77756f', 0, S - 10, S, 2);
    rect(p.t, '#e6e1d8', 42, 22, 46, S - 31); rect(p.o, '#16191d', 46, 26, 38, S - 35);
    rect(p.o, '#2d4f44', 48, 44, 34, S - 53); rect(p.o, '#3b6657', 51, 48, 12, 28); rect(p.o, '#3b6657', 67, 48, 12, 28); rect(p.o, '#3b6657', 51, 82, 28, 30);
    rect(p.o, '#c9a24a', 77, 80, 2, 6);
    glassAt(p, 48, 28, 34, 13, 0.8, true); rect(p.o, '#16191d', 64, 28, 2, 13);
    rect(p.o, '#f3efe2', 96, 40, 14, 10); rect(p.o, '#2a2f36', 99, 43, 8, 4);                   // the number plate
    rect(p.o, '#3a3d42', 22, 58, 12, 16); rect(p.o, '#1f2226', 24, 62, 8, 2);                   // letter box
    rect(p.o, '#f6e7b0', 61, 15, 8, 5); rect(p.g, '#fff', 59, 13, 12, 8);                       // the lamp over the door
  } else {                                                                // a glazed front: aluminium frame, posters on the glass
    board(p, X0 - 2, 9, W + 4, 21, '#2f7d4a', '#fdf6e4');
    rect(p.o, '#c9cdd0', X0, Y0, W, H); glassAt(p, X0 + 3, Y0 + 3, 60, H - 6, 0.9, true); glassAt(p, X0 + 66, Y0 + 3, W - 69, H - 6, 0.9, true);
    rect(p.o, '#c9cdd0', X0 + 66, Y0 + 44, W - 69, 3); rect(p.o, '#9aa0a4', X0 + 69, Y0 + 24, 2, 9);
    rect(p.o, '#e8d34a', X0 + 8, Y0 + 14, 18, 24); rect(p.o, '#d9482b', X0 + 30, Y0 + 20, 16, 20); rect(p.o, '#f2efe6', X0 + 10, Y0 + 46, 24, 12);
    p.o.fillStyle = 'rgba(255,255,255,0.10)'; p.o.beginPath(); p.o.moveTo(X0 + 40, Y0 + 3); p.o.lineTo(X0 + 60, Y0 + 3); p.o.lineTo(X0 + 22, Y0 + H - 3); p.o.lineTo(X0 + 3, Y0 + H - 3); p.o.fill();
  }
}

// ---------------------------------------------------------------- row 3: a house's ground floor
function homeGround(p: Painter, k: number) {
  plaster(p, 5);
  rect(p.t, '#d9d3c7', 0, 0, S, 4);
  plinth(p);
  if (k === 0) {                                                          // a small barred window, high in the wall
    rect(p.t, '#e6e1d8', 44, 26, 44, 38); glassAt(p, 48, 30, 36, 30, 0.9, true);
    p.o.fillStyle = '#2b2e33'; for (let x = 52; x < 84; x += 7) p.o.fillRect(x, 30, 1.5, 30); p.o.fillRect(48, 44, 36, 1.5);
    rect(p.t, '#cfc8ba', 42, 62, 48, 4); drip(p, 50, 66, 30, 26);
  } else if (k === 1) {                                                   // the metal door, painted, a step, a grille over it
    rect(p.t, '#e6e1d8', 38, 18, 52, S - 27); rect(p.o, '#15181c', 42, 22, 44, S - 31);
    rect(p.o, '#2a6b8a', 44, 40, 40, S - 49); rect(p.o, '#1f5570', 63, 40, 2, S - 49);
    for (const x of [47, 67]) { rect(p.o, '#35809f', x, 45, 14, 30); rect(p.o, '#35809f', x, 80, 14, 34); }
    rect(p.o, '#d8d2c2', 60, 78, 3, 7);
    p.o.fillStyle = '#2b2e33'; for (let x = 46; x < 84; x += 6) p.o.fillRect(x, 24, 1.5, 14); rect(p.g, '#777', 44, 24, 40, 14);
    rect(p.o, '#8f8d86', 34, S - 9, 60, 9); rect(p.o, '#77756f', 34, S - 10, 60, 2);
  } else if (k === 2) {                                                   // a window behind closed metal shutters
    rect(p.t, '#e6e1d8', 34, 26, 60, 52);
    for (const x of [38, 65]) { rect(p.o, '#6f8a7a', x, 30, 25, 44); p.o.fillStyle = '#587264'; for (let y = 33; y < 72; y += 5) p.o.fillRect(x + 1, y, 23, 2); }
    rect(p.t, '#cfc8ba', 32, 76, 64, 4); drip(p, 44, 80, 40, 18);
  } else {                                                                // a blank bay: the meter, a patch of cement, a number painted by hand
    rect(p.o, '#a8a294', 14, 60, 34, 22); rect(p.o, '#9a9486', 14, 70, 34, 1); rect(p.o, '#9a9486', 30, 60, 1, 10);
    rect(p.o, '#7f8489', 84, 44, 18, 24); rect(p.o, '#5d6266', 86, 47, 14, 9); rect(p.o, '#3a3d40', 92, 68, 2, S - 96);
    rect(p.o, '#2b3a55', 60, 22, 4, 9); rect(p.o, '#2b3a55', 67, 22, 6, 9); rect(p.o, '#fbfaf7', 69, 24, 2, 5);
  }
}

// ---------------------------------------------------------------- row 4: Mermoz · Sacré-Cœur
function tiled(p: Painter, k: number) {
  plaster(p); slab(p);
  // the band of ceramic tiles under the windows (a darker tone of the house's own colour, joints of its own)
  rect(p.t, '#cbbfa9', 0, 88, S, 31);
  p.t.fillStyle = 'rgba(255,250,240,0.55)'; for (let x = 0; x < S; x += 8) p.t.fillRect(x, 88, 1, 31); for (let y = 88; y < 119; y += 8) p.t.fillRect(0, y, S, 1);
  for (let i = 0; i < 26; i++) { p.t.fillStyle = `rgba(110,84,56,${0.06 + p.r() * 0.14})`; p.t.fillRect(Math.floor(p.r() * 16) * 8 + 1, 89 + Math.floor(p.r() * 4) * 8, 7, 7); }
  rect(p.t, '#b9ad98', 0, 86, S, 2);
  if (k === 0 || k === 2) {                                               // a sliding aluminium window, white frame
    rect(p.o, '#f4f2ec', 28, 22, 72, 62); glassAt(p, 32, 26, 31, 54, 1, true); glassAt(p, 65, 26, 31, 54, 1, true);
    rect(p.o, '#dcd9d0', 28, 82, 72, 3);
    if (k === 2) {                                                        // wrought iron over it
      p.o.strokeStyle = '#23262b'; p.o.lineWidth = 1.2;
      for (let x = 32; x <= 96; x += 8) { p.o.beginPath(); p.o.moveTo(x, 26); p.o.lineTo(x, 80); p.o.stroke(); }
      for (let x = 36; x < 96; x += 16) { p.o.beginPath(); p.o.ellipse(x + 4, 53, 5, 12, 0, 0, Math.PI * 2); p.o.stroke(); }
      p.o.beginPath(); p.o.moveTo(32, 38); p.o.lineTo(96, 38); p.o.moveTo(32, 68); p.o.lineTo(96, 68); p.o.stroke();
      acBox(p, 6, 60);
    } else rect(p.o, '#e9dcc0', 67, 28, 12, 50);                           // a curtain drawn half-way
  } else if (k === 1) {                                                   // the balcony's glass door
    rect(p.o, '#f4f2ec', 30, 16, 68, S - 25); glassAt(p, 34, 20, 29, S - 33, 1, true); glassAt(p, 65, 20, 29, S - 33, 1, true);
    rect(p.o, '#f4f2ec', 34, 44, 60, 2); rect(p.o, '#e6d7b8', 36, 47, 12, S - 62); rect(p.o, '#8d9399', 62, 76, 1.5, 8);
  } else {                                                                // the bathrooms' bay: tiles up the wall and a small louvred window
    rect(p.t, '#cbbfa9', 40, 0, 48, 88);
    p.t.fillStyle = 'rgba(255,250,240,0.55)'; for (let x = 40; x <= 88; x += 8) p.t.fillRect(x, 0, 1, 88); for (let y = 0; y < 88; y += 8) p.t.fillRect(40, y, 48, 1);
    rect(p.o, '#f4f2ec', 50, 28, 28, 24); glassAt(p, 53, 31, 22, 18, 0.7, true);
    p.o.fillStyle = '#dfe5e8'; for (let y = 34; y < 48; y += 4) p.o.fillRect(53, y, 22, 1);
  }
}

// ---------------------------------------------------------------- row 5: Pikine's self-built houses
function selfBuilt(p: Painter, k: number) {
  plaster(p, 9);
  rect(p.t, '#d3ccbf', 0, S - 6, S, 6);                                   // the slab's edge, barely marked
  const patch = (x: number, y: number, w: number, h: number) => {          // cement that never got its paint
    rect(p.o, '#aaa497', x, y, w, h); p.o.fillStyle = '#958f82';
    for (let j = 0; j * 8 < h; j++) { p.o.fillRect(x, y + j * 8, w, 1); for (let i = (j % 2) * 8; i < w; i += 16) p.o.fillRect(x + i, y + j * 8, 1, Math.min(8, h - j * 8)); }
  };
  if (k === 0) {                                                          // a small window, one metal leaf closed
    rect(p.t, '#e2dcd0', 38, 30, 52, 50); glassAt(p, 64, 34, 22, 42, 0.95, true);
    rect(p.o, '#2f7f8a', 42, 34, 22, 42); p.o.fillStyle = '#25666f'; for (let y = 38; y < 74; y += 6) p.o.fillRect(43, y, 20, 2);
    rect(p.t, '#c9c2b4', 36, 78, 56, 4); drip(p, 46, 82, 36, 24);
  } else if (k === 1) {                                                   // a window open on a wax-print curtain, bars across it
    rect(p.t, '#e2dcd0', 38, 30, 52, 50); rect(p.o, '#1a1c20', 42, 34, 44, 42);
    rect(p.o, '#c9762e', 44, 34, 22, 40); rect(p.o, '#e3b23c', 48, 34, 3, 40); rect(p.o, '#8f3d1f', 56, 34, 3, 40); rect(p.o, '#e3b23c', 44, 50, 22, 3);
    p.o.fillStyle = '#3a3d42'; for (let x = 46; x < 86; x += 8) p.o.fillRect(x, 34, 1.5, 42);
    rect(p.g, '#e0e0e0', 42, 34, 44, 42); rect(p.t, '#c9c2b4', 36, 78, 56, 4);
  } else if (k === 2) {                                                   // a blank bay: blocks showing through, a crack
    patch(52, 58, 48, 40); patch(20, 14, 24, 16);
    p.t.strokeStyle = 'rgba(70,60,50,0.55)'; p.t.lineWidth = 1; p.t.beginPath(); p.t.moveTo(30, 40); p.t.lineTo(36, 62); p.t.lineTo(31, 84); p.t.lineTo(38, 112); p.t.stroke();
  } else {                                                                // an opening that still waits for its frame
    patch(34, 22, 60, 64); rect(p.o, '#15130f', 44, 34, 40, 44); rect(p.o, '#bdb7aa', 38, 26, 52, 8);
    rect(p.o, '#3f77b5', 44, 34, 40, 14); rect(p.o, '#356aa3', 44, 46, 40, 2);                      // a tarpaulin against the dust
  }
}

// ---------------------------------------------------------------- row 6: the floor that is not finished
function unfinished(p: Painter, k: number) {
  rect(p.t, '#fbfaf7', 0, 0, S, S);
  rect(p.o, '#aca698', 0, 0, S, S);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 9; i++) {              // breeze blocks, 40 × 20 cm, running bond
    const x = i * 16 + (j % 2) * 8, v = 164 + Math.floor(p.r() * 22);
    rect(p.o, `rgb(${v},${v - 4},${v - 12})`, x + 1, j * 8 + 1, 15, 7);
  }
  if (k === 1 || k === 3) { rect(p.o, '#c2bdb2', 36, 26, 56, 8); rect(p.o, '#14120f', 42, 34, 44, 46); }   // an empty opening under its lintel
  if (k === 3) { rect(p.o, '#b9482f', 42, 34, 26, 40); rect(p.o, '#d8a13a', 46, 34, 3, 40); rect(p.o, '#d8a13a', 58, 34, 3, 40); }   // a cloth hung in it: someone lives here already
  if (k === 2) { p.o.fillStyle = 'rgba(205,200,190,0.75)'; p.o.beginPath(); p.o.ellipse(70, 70, 34, 22, 0.3, 0, Math.PI * 2); p.o.fill(); }   // a first coat of cement, thrown on
  rect(p.o, '#c2bdb2', 0, 0, 7, S); rect(p.o, '#c2bdb2', 121, 0, 7, S);     // the concrete posts
  rect(p.o, '#bcb6ab', 0, S - 10, S, 10); rect(p.o, '#a59f93', 0, S - 11, S, 2);   // the ring beam
}

// ---------------------------------------------------------------- row 7: modern blocks
function modern(p: Painter, k: number) {
  plaster(p); slab(p);
  if (k === 0 || k === 1) {                                               // a wide window under its concrete sun-breaker
    rect(p.o, '#f0ede5', 12, 20, 104, 6); rect(p.t, '#8f887c', 12, 26, 104, 4);
    rect(p.o, '#3a3f45', 16, 30, 96, 54); glassAt(p, 19, 33, 44, 48, 1, true); glassAt(p, 65, 33, 44, 48, 1, true);
    if (k === 1) { p.o.fillStyle = '#9fb0bd'; for (let y = 36; y < 80; y += 5) p.o.fillRect(19, y, 44, 1.5); }    // glass jalousies (nako) on one side
    rect(p.t, '#cfc8ba', 14, 84, 100, 4);
    rect(p.t, '#d6cfc2', 16, 92, 96, 22); rect(p.t, '#c4bcae', 16, 92, 96, 1);                     // the spandrel panel
  } else if (k === 2) {                                                   // a loggia: the balcony taken inside the wall
    rect(p.o, '#1c2026', 12, 14, 104, S - 23); glassAt(p, 22, 26, 34, S - 44, 0.8, true); rect(p.o, '#2b3038', 62, 22, 44, S - 40);
    rect(p.o, '#f0ede5', 12, 80, 104, 3); p.o.fillStyle = '#e4e0d6'; for (let x = 14; x < 116; x += 6) p.o.fillRect(x, 83, 2, S - 92);
    rect(p.o, '#d2603a', 70, 52, 16, 20); rect(p.o, '#e9e4d8', 90, 48, 10, 26);                     // washing on the line inside
  } else {                                                                // a claustra: the stairwell behind pierced blocks
    rect(p.o, '#ece8de', 30, 6, 68, S - 15);
    p.o.fillStyle = '#4b4a48'; for (let i = 0; i < 7; i++) for (let j = 0; j < 12; j++) p.o.fillRect(33 + i * 9, 9 + j * 9, 5, 5);
    rect(p.g, '#2c2c2c', 30, 6, 68, S - 15);
  }
}

const PAINT: ((p: Painter, k: number) => void)[] = [classic, office, shops, homeGround, tiled, selfBuilt, unfinished, modern];

/**
 * Paints the atlas (once: the canvases are kept). `map`: RGBA, row r of the atlas is r storeys up from the image's bottom (a texture's v), so the
 * shader's (row + v) / FACADE_ROWS reads it. `glow`: the night mask, half the size.
 */
let painted: { map: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;
export function facadeAtlas(): { map: HTMLCanvasElement; glow: HTMLCanvasElement } {
  if (painted) return painted;
  const W = S * FACADE_COLS, H = S * FACADE_ROWS;
  const mk = (w: number, h: number) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const map = mk(W, H), own = mk(W, H), glowFull = mk(W, H), glow = mk(W / 2, H / 2);
  const t = map.getContext('2d')!, o = own.getContext('2d')!, g = glowFull.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let row = 0; row < FACADE_ROWS; row++) for (let col = 0; col < FACADE_COLS; col++) {
    const x = col * S, y = (FACADE_ROWS - 1 - row) * S;
    for (const c of [t, o, g]) { c.save(); c.beginPath(); c.rect(x, y, S, S); c.clip(); c.translate(x, y); }
    PAINT[row]({ t, o, g, r: prng(977 + row * 131 + col * 17) }, col);
    for (const c of [t, o, g]) c.restore();
  }
  // one image: the own-colour layer over the tinted one, the alpha channel saying which is which (1 tinted … 0.5 own)
  const a = t.getImageData(0, 0, W, H), b = o.getImageData(0, 0, W, H), n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4) {
    const k = b.data[i + 3] / 255;
    if (k <= 0) continue;
    a.data[i] = b.data[i] * k + a.data[i] * (1 - k); a.data[i + 1] = b.data[i + 1] * k + a.data[i + 1] * (1 - k); a.data[i + 2] = b.data[i + 2] * k + a.data[i + 2] * (1 - k);
    a.data[i + 3] = 255 - Math.round(k * 127);
  }
  t.putImageData(a, 0, 0);
  const gc = glow.getContext('2d')!; gc.drawImage(glowFull, 0, 0, W / 2, H / 2);
  return (painted = { map, glow });
}
