import * as THREE from 'three';

/**
 * LD2.0-D look pass (docs/ld2/LD2_D.md): the villa's own finishes, drawn in code like the game's other surface textures (src/world/textures.ts):
 * light, nearly neutral detail maps multiplied with each surface's vertex colour, sampled in world space (src/world/grain.ts `detail`), so one map
 * serves every floor and wall whatever its size; and the view seen through the windows.
 *
 * - `stoneTiles`: large-format slabs of 120 × 60 cm, cream marble veined in pale grey with a few travertine pits, the joints fine: the ground floor's
 *   floors, the bathrooms' walls, the stone accent walls inside and the travertine cladding outside (tinted per use).
 * - `oakPlanks`: wide oak boards (20 cm) in staggered lengths, their grain and the hairline between them: the bedrooms' floors, and tinted darker the
 *   teak decks round the pool and on the roof.
 * - `windowView`: what a window looks out on (UV-mapped on the pane): the Almadies sky, the ocean's horizon and the garden's palms and greenery.
 */
const cache = new Map<string, THREE.CanvasTexture>();
function prng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, repeat = true) {
  const hit = cache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c, prng(key.length * 7919 + w * 31 + h));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t); return t;
}

/** Metres covered by one repeat of the stone and oak maps (addGrain's `detailSize`). */
export const FINISH_SIZE = 2.4;

/** Large cream marble slabs, 120 × 60 cm (2 × 4 per repeat of 2.4 m), with soft veins, a few pits and fine joints. */
export const stoneTiles = () => make('villa-stone', 512, 512, (c, r) => {
  const S = 512, tw = S / 2, th = S / 4;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
    const x0 = col * tw, y0 = row * th, v = 244 + Math.floor(r() * 9) - 4;
    c.fillStyle = `rgb(${v},${v - 2},${v - 6})`; c.fillRect(x0, y0, tw, th);
    c.save(); c.beginPath(); c.rect(x0, y0, tw, th); c.clip();
    // clouds in the stone
    for (let k = 0; k < 5; k++) {
      const cx = x0 + r() * tw, cy = y0 + r() * th, rad = 30 + r() * 70, g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(205,196,182,${0.05 + r() * 0.06})`); g.addColorStop(1, 'rgba(205,196,182,0)');
      c.fillStyle = g; c.fillRect(x0, y0, tw, th);
    }
    // veins: long soft diagonals, a fine one beside each
    for (let k = 0; k < 3; k++) {
      const a = { x: x0 - 20 + r() * 60, y: y0 + r() * th }, b = { x: x0 + tw + 20, y: y0 + r() * th };
      const m1 = { x: x0 + tw * (0.3 + r() * 0.2), y: y0 + r() * th }, m2 = { x: x0 + tw * (0.6 + r() * 0.2), y: y0 + r() * th };
      for (const [wd, al] of [[2.2, 0.08], [0.8, 0.22]] as const) {
        c.strokeStyle = `rgba(150,140,128,${al * (0.6 + r() * 0.6)})`; c.lineWidth = wd;
        c.beginPath(); c.moveTo(a.x, a.y); c.bezierCurveTo(m1.x, m1.y, m2.x, m2.y, b.x, b.y); c.stroke();
      }
    }
    // travertine's pits: short dashes along the bedding
    for (let k = 0; k < 26; k++) { c.fillStyle = `rgba(176,160,136,${0.18 + r() * 0.2})`; c.fillRect(x0 + r() * tw, y0 + r() * th, 2 + r() * 6, 1); }
    c.restore();
    // the joint (top and left edges: the texture repeats, so every edge gets one)
    c.fillStyle = 'rgba(178,170,158,0.9)'; c.fillRect(x0, y0, tw, 1.5); c.fillRect(x0, y0, 1.5, th);
  }
});

/** Wide oak boards (12 per repeat of 2.4 m, 20 cm each) along the map's u, in staggered lengths; grain, a few knots, the hairline joints. */
export const oakPlanks = () => make('villa-oak', 512, 512, (c, r) => {
  const S = 512, n = 12, bw = S / n;
  c.fillStyle = 'rgb(236,228,216)'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    const y0 = i * bw, joints = [r() * S, r() * S].sort((a, b) => a - b);
    // two boards per row (wrapping), each its own tone and grain
    const spans: [number, number][] = [[joints[0], joints[1]], [joints[1], joints[0] + S]];
    for (const [a, b] of spans) {
      const v = 214 + Math.floor(r() * 36), tone = `rgb(${v + 10},${v},${v - 14})`;
      for (const off of [0, -S]) { c.fillStyle = tone; c.fillRect(a + off, y0, b - a, bw); }
      for (let k = 0; k < 9; k++) {
        const yy = y0 + 2 + r() * (bw - 4), al = 0.05 + r() * 0.1, amp = 1 + r() * 2.5, ph = r() * 6;
        c.strokeStyle = `rgba(120,92,62,${al})`; c.lineWidth = 0.6 + r() * 1.2;
        for (const off of [0, -S]) {
          c.beginPath(); c.moveTo(a + off, yy);
          for (let x = a; x <= b; x += 16) c.lineTo(x + off, yy + Math.sin(x * 0.02 + ph) * amp);
          c.stroke();
        }
      }
      if (r() < 0.35) { const kx = a + r() * (b - a), ky = y0 + bw * (0.3 + r() * 0.4); for (const off of [0, -S]) { c.fillStyle = 'rgba(110,80,52,0.35)'; c.beginPath(); c.ellipse(kx + off, ky, 5 + r() * 4, 2 + r() * 1.5, 0, 0, Math.PI * 2); c.fill(); } }
      for (const off of [0, -S]) { c.fillStyle = 'rgba(80,60,40,0.55)'; c.fillRect(a + off, y0, 1, bw); }
    }
    c.fillStyle = 'rgba(80,60,40,0.6)'; c.fillRect(0, y0, S, 1);
  }
});

/** The view out of a window (UV 0…1 on the pane, v up): the sky with a few clouds, the ocean's horizon, palms and greenery in the foreground. */
export const windowView = () => make('villa-view', 256, 256, (c, r) => {
  const S = 256, sea = S * 0.56, green = S * 0.8;
  let g = c.createLinearGradient(0, 0, 0, sea);
  g.addColorStop(0, '#5fa6dc'); g.addColorStop(0.7, '#a9d3ef'); g.addColorStop(1, '#e6f2f6');
  c.fillStyle = g; c.fillRect(0, 0, S, sea);
  for (let k = 0; k < 6; k++) { const x = r() * S, y = 20 + r() * (sea - 70); c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(x, y, 24 + r() * 30, 5 + r() * 5, 0, 0, Math.PI * 2); c.fill(); }
  g = c.createLinearGradient(0, sea, 0, green);
  g.addColorStop(0, '#2f86b5'); g.addColorStop(1, '#22698f');
  c.fillStyle = g; c.fillRect(0, sea, S, green - sea);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, sea, S, 1.5);
  // the garden's greenery along the bottom, two palms rising out of it
  c.fillStyle = '#3d6b35'; c.fillRect(0, green, S, S - green);
  for (let k = 0; k < 18; k++) { c.fillStyle = k % 2 ? '#4f7f3f' : '#35602f'; c.beginPath(); c.ellipse(r() * S, green + r() * 10, 16 + r() * 16, 10 + r() * 8, 0, 0, Math.PI * 2); c.fill(); }
  for (const px of [S * 0.16, S * 0.86]) {
    c.strokeStyle = '#6b5a44'; c.lineWidth = 4; c.beginPath(); c.moveTo(px, S); c.quadraticCurveTo(px + 6, S * 0.6, px + 2, S * 0.36); c.stroke();
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.48, len = 34 + r() * 10;
      c.strokeStyle = '#2f5a2a'; c.lineWidth = 5; c.beginPath(); c.moveTo(px + 2, S * 0.36);
      c.quadraticCurveTo(px + 2 + Math.cos(a) * len * 0.6, S * 0.36 + Math.sin(a) * len * 0.6 - 6, px + 2 + Math.cos(a) * len, S * 0.36 + Math.sin(a) * len * 0.5 + 14); c.stroke();
    }
  }
}, false);
