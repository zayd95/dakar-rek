import * as THREE from 'three';

/**
 * Procedural, seamless surface textures (authored in code, no generated images).
 * Each is a light grey/white detail map multiplied with the vertex colour of the batch that uses it,
 * sampled in world space (see addGrain's `detail` option) so one texture serves every wall or slab size.
 * Colour only: there are no normal or roughness maps.
 */
const cache = new Map<string, THREE.CanvasTexture>();

/** Small deterministic RNG so textures are identical on every device. */
function prng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function make(key: string, size: number, draw: (c: CanvasRenderingContext2D, S: number, r: () => number) => void) {
  const hit = cache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size, prng(key.length * 7919 + size));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t); return t;
}

/** Speckle that wraps around the edges, so the tile stays seamless. */
function speckle(c: CanvasRenderingContext2D, S: number, r: () => number, n: number, lo: number, hi: number, sz = 2, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(lo + r() * (hi - lo)), x = r() * S, y = r() * S, s = 1 + r() * sz;
    c.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    for (const dx of [0, -S]) for (const dy of [0, -S]) c.fillRect(x + dx, y + dy, s, s);
  }
}

/** Concrete paving slabs, 50 cm, with grout and per-slab tone. Texture covers 2 m. */
export const pavingTexture = () => make('paving', 256, (c, S, r) => {
  c.fillStyle = '#e9e6e0'; c.fillRect(0, 0, S, S);
  const n = 4, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 222 + Math.floor(r() * 26);
    c.fillStyle = `rgb(${v},${v - 1},${v - 4})`; c.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    if (r() < 0.25) { c.fillStyle = 'rgba(90,80,60,0.12)'; c.beginPath(); c.arc(i * t + r() * t, j * t + r() * t, 6 + r() * 14, 0, Math.PI * 2); c.fill(); } // stains
  }
  speckle(c, S, r, 2500, 190, 255, 1.5, 0.35);
  c.fillStyle = 'rgba(120,112,100,0.5)';
  for (let k = 0; k <= n; k++) { c.fillRect(k * t - 1, 0, 2, S); c.fillRect(0, k * t - 1, S, 2); }
});

/** Hollow cement breeze blocks (parpaings) 40 × 20 cm, running bond with rough mortar. Covers 1.6 m × 1.6 m. */
export const breezeBlockTexture = () => make('breeze', 256, (c, S, r) => {
  c.fillStyle = '#b9b4aa'; c.fillRect(0, 0, S, S);
  const bw = S / 4, bh = S / 8;
  for (let row = 0; row < 8; row++) for (let k = -1; k < 4; k++) {
    const x = k * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
    const v = 200 + Math.floor(r() * 30);
    c.fillStyle = `rgb(${v},${v - 2},${v - 7})`;
    c.fillRect(x + 3, y + 3, bw - 5, bh - 5);
  }
  speckle(c, S, r, 6000, 120, 235, 1.6, 0.45);
  c.fillStyle = 'rgba(150,140,125,0.35)'; for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S; c.fillRect(x, y, 2 + r() * 4, 1); } // mortar smears
});

/** Glazed floor tiles, 33 cm, two-tone pattern (common in Dakar homes). Covers 1.32 m. */
export const floorTileTexture = () => make('floortile', 256, (c, S, r) => {
  const n = 4, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 236 + Math.floor(r() * 12);
    c.fillStyle = `rgb(${v},${v - 4},${v - 10})`; c.fillRect(i * t, j * t, t, t);
    c.strokeStyle = 'rgba(160,130,95,0.45)'; c.lineWidth = 2; c.strokeRect(i * t + 14, j * t + 14, t - 28, t - 28);
  }
  c.fillStyle = 'rgba(150,115,80,0.6)';                                          // diamond motif at tile corners
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = i * t, y = j * t; c.beginPath(); c.moveTo(x, y - 13); c.lineTo(x + 13, y); c.lineTo(x, y + 13); c.lineTo(x - 13, y); c.fill(); }
  speckle(c, S, r, 900, 200, 255, 1, 0.2);
  c.fillStyle = 'rgba(110,100,90,0.8)';
  for (let k = 0; k <= n; k++) { c.fillRect(k * t - 1, 0, 2, S); c.fillRect(0, k * t - 1, S, 2); }
});

/** Wood planks with grain. Covers 1 m. */
export const woodTexture = () => make('wood', 256, (c, S, r) => {
  const n = 5, t = S / n;
  for (let k = 0; k < n; k++) {
    const v = 215 + Math.floor(r() * 30);
    c.fillStyle = `rgb(${v},${v - 18},${v - 40})`; c.fillRect(0, k * t, S, t);
    for (let g = 0; g < 14; g++) {
      c.strokeStyle = `rgba(110,70,35,${0.08 + r() * 0.12})`; c.lineWidth = 1 + r();
      const y0 = k * t + r() * t; c.beginPath(); c.moveTo(0, y0);
      for (let x = 0; x <= S; x += 32) c.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 2 * (1 + Math.floor(r() * 2))) * 2);
      c.stroke();
    }
    c.fillStyle = 'rgba(70,45,25,0.7)'; c.fillRect(0, k * t, S, 2);
  }
});

/** Corrugated / weathered painted metal with rust streaks. Covers 1 m. */
export const metalTexture = () => make('metal', 128, (c, S, r) => {
  c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) { const g = c.createLinearGradient(x, 0, x + 8, 0); g.addColorStop(0, '#f6f6f6'); g.addColorStop(0.5, '#bdbdbd'); g.addColorStop(1, '#f6f6f6'); c.fillStyle = g; c.fillRect(x, 0, 8, S); }
  for (let i = 0; i < 18; i++) { const x = r() * S, l = 20 + r() * 60; const g = c.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(140,70,30,0.45)'); g.addColorStop(1, 'rgba(140,70,30,0)'); c.fillStyle = g; for (const dx of [0, -S]) c.fillRect(x + dx, r() * S * 0.3, 2 + r() * 3, l); }
  speckle(c, S, r, 500, 120, 200, 1.5, 0.25);
});

/** Painted plaster with dirt variation, for interiors. Covers 2 m. */
export const plasterTexture = () => make('plaster', 128, (c, S, r) => {
  c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, S, S);
  speckle(c, S, r, 1800, 215, 255, 2, 0.5);
  for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(160,150,130,0.06)'; const x = r() * S, y = r() * S, s = 20 + r() * 40; for (const dx of [0, -S]) for (const dy of [0, -S]) c.fillRect(x + dx, y + dy, s, s * 0.6); }
});

/** Leaf clusters: overlapping small leaves in light/dark tones, seamless. Multiplied with the canopy colour. Covers 1.1 m. */
export const leafTexture = () => make('leaves', 256, (c, S, r) => {
  c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 7 + r() * 9, w = 3 + r() * 3;
    const v = Math.floor(120 + r() * 135);
    c.fillStyle = `rgb(${v},${Math.min(255, v + 8)},${Math.max(0, v - 20)})`;
    for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) { c.beginPath(); c.ellipse(x + dx, y + dy, l, w, a, 0, Math.PI * 2); c.fill(); }
  }
  for (let i = 0; i < 260; i++) {                                               // dark gaps between leaves
    const x = r() * S, y = r() * S; c.fillStyle = 'rgba(40,40,30,0.55)';
    for (const dx of [0, -S]) for (const dy of [0, -S]) { c.beginPath(); c.arc(x + dx, y + dy, 1.5 + r() * 2.5, 0, Math.PI * 2); c.fill(); }
  }
});

/** Worn asphalt: fine aggregate, darker patch repairs, hairline cracks, oil stains. Covers 4 m. */
export const asphaltTexture = () => make('asphalt', 512, (c, S, r) => {
  c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, S, S);
  speckle(c, S, r, 26000, 120, 255, 1.4, 0.55);
  for (let i = 0; i < 7; i++) {                                                 // patch repairs (darker, newer asphalt)
    const x = r() * S, y = r() * S, w = 40 + r() * 120, h = 30 + r() * 90, v = 120 + Math.floor(r() * 30);
    c.fillStyle = `rgba(${v},${v},${v + 4},0.55)`;
    for (const dx of [0, -S]) for (const dy of [0, -S]) c.fillRect(x + dx, y + dy, w, h);
  }
  for (let i = 0; i < 10; i++) {                                                // oil / tyre stains
    const x = r() * S, y = r() * S, s = 10 + r() * 30;
    const g = c.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, 'rgba(40,40,45,0.35)'); g.addColorStop(1, 'rgba(40,40,45,0)');
    c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2);
  }
  c.strokeStyle = 'rgba(60,60,60,0.55)'; c.lineWidth = 1.2;                     // hairline cracks
  for (let i = 0; i < 14; i++) {
    let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; c.lineTo(x, y); }
    c.stroke();
  }
});

/** Packed sand street: grains, darker damp patches, scattered pebbles and footprints. Covers 3 m. */
export const sandRoadTexture = () => make('sandroad', 512, (c, S, r) => {
  c.fillStyle = '#e4e0d8'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) {
    const x = r() * S, y = r() * S, s = 30 + r() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, s); const d = r() < 0.5;
    g.addColorStop(0, d ? 'rgba(150,130,100,0.22)' : 'rgba(255,250,240,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) c.fillRect(x - s + dx, y - s + dy, s * 2, s * 2);
  }
  speckle(c, S, r, 20000, 150, 255, 1.2, 0.5);
  for (let i = 0; i < 160; i++) { const v = 110 + Math.floor(r() * 80); c.fillStyle = `rgb(${v},${v - 6},${v - 14})`; const x = r() * S, y = r() * S; c.beginPath(); c.arc(x, y, 1 + r() * 2.2, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < 40; i++) {                                                 // footprints
    const x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    c.fillStyle = 'rgba(140,120,95,0.18)'; c.beginPath(); c.ellipse(x, y, 5, 11, a, 0, Math.PI * 2); c.fill();
  }
});

/** Palm frond leaflets on a transparent background: rib along v, leaflets angled toward the tip. 128 × 256. */
let frondTex: THREE.CanvasTexture | null = null;
export function frondTexture(): THREE.CanvasTexture {
  if (frondTex) return frondTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const c = cv.getContext('2d')!; const r = prng(99);
  c.clearRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 5) {
    for (const s of [-1, 1]) {
      const len = 54 * (0.55 + 0.45 * Math.sin(Math.PI * (y / 256))) * (0.85 + r() * 0.3);
      const v = 150 + Math.floor(r() * 90);
      c.strokeStyle = `rgb(${v},${Math.min(255, v + 15)},${Math.floor(v * 0.6)})`; c.lineWidth = 3.2;
      c.beginPath(); c.moveTo(64, y); c.quadraticCurveTo(64 + s * len * 0.5, y + 6, 64 + s * len, y + 18 + r() * 6); c.stroke();
    }
  }
  c.strokeStyle = 'rgb(190,170,110)'; c.lineWidth = 4; c.beginPath(); c.moveTo(64, 0); c.lineTo(64, 256); c.stroke();
  frondTex = new THREE.CanvasTexture(cv); frondTex.colorSpace = THREE.SRGBColorSpace; frondTex.anisotropy = 4;
  return frondTex;
}

/**
 * Higgsfield-generated textures (artistic interpretations; prompts, job ids and seam checks in
 * assets-src/references/PROVENANCE.md). Shipped as 512 px JPEGs in public/assets/tex and loaded on demand the first time
 * a hub needs them. Detail maps (breeze_block, sand, painted_metal, paving, wood) were desaturated/neutralised so they
 * modulate each surface's own colour; floor_tiles_terracotta keeps its colours. Colour maps only.
 */
const loaded = new Map<string, THREE.Texture>();
export function generatedTexture(name: 'breeze_block' | 'sand' | 'painted_metal' | 'floor_tiles_terracotta' | 'paving' | 'wood'): THREE.Texture {
  const hit = loaded.get(name); if (hit) return hit;
  const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  loaded.set(name, t); return t;
}
