/**
 * Canvas drawing shared by the minimap and the full map: the hub's static layer (roads, blocks, buildings, sea, landmarks,
 * drawn once per hub load from the hub's own layout data) and the place icons. 2D canvas only: no Three.js, no draw call
 * in the 3D scene.
 */
import type { HubWorld } from '../world/types';
import { HALF, NB, PITCH, BLK, ROAD, hubLayout } from '../world/builder';
import { KIND_COLOR, type PlaceKind } from './minimapMath';

/** The hub's static map, north up: `K` pixels per metre, its top-left corner at world (x0, z0). */
export interface Layer { canvas: HTMLCanvasElement; K: number; x0: number; z0: number; w: number; h: number }

export const PALETTE = {
  ground: '#283034', sea: '#123a52', surf: '#2d6a8a', beach: '#4b473a', block: '#313a3f', road: '#56616a', kerb: '#6b7781', dash: '#8b97a0',
  building: '#4e5b63', roof: '#5b6870', park: '#2f5c46', plaza: '#4a4f45', void: '#1b2125',
};

const roadC = (k: number) => -HALF + ROAD / 2 + k * PITCH;
const blockMin = (i: number) => -HALF + ROAD + i * PITCH;

/** Pre-renders the static layer of a hub into an offscreen canvas. */
export function buildLayer(hub: HubWorld, K = 2.5, margin = 80): Layer {
  const lay = hubLayout(hub.id);
  const x0 = hub.bounds.x0 - margin, z0 = hub.bounds.z0 - margin, x1 = hub.bounds.x1 + margin, z1 = hub.bounds.z1 + margin;
  const w = Math.ceil((x1 - x0) * K), h = Math.ceil((z1 - z0) * K);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.scale(K, K); c.translate(-x0, -z0);                                    // draw in metres, world axes
  const rect = (x: number, z: number, rw: number, rh: number, col: string) => { c.fillStyle = col; c.fillRect(x, z, rw, rh); };
  rect(x0, z0, x1 - x0, z1 - z0, PALETTE.ground);
  // the sea (west of the Corniche, north of the Almadies): beach, then water up to the surf line
  if (lay.sea === 'west') { rect(x0, z0, -HALF - 8 - x0, z1 - z0, PALETTE.beach); rect(x0, z0, -HALF - 31 - x0, z1 - z0, PALETTE.sea); rect(-HALF - 33, z0, 3.5, z1 - z0, PALETTE.surf); }
  if (lay.sea === 'north') { rect(x0, z0, x1 - x0, -HALF - 8 - z0, PALETTE.beach); rect(x0, z0, x1 - x0, -HALF - 36 - z0, PALETTE.sea); rect(x0, -HALF - 38, x1 - x0, 3.5, PALETTE.surf); }
  // blocks
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) rect(blockMin(i), blockMin(j), BLK, BLK, PALETTE.block);
  // landmarks' blocks, tinted
  const tint: Record<string, string> = { mosque: '#2f4f43', market: '#5a4630', station: '#5b5230', plaza: PALETTE.plaza, pitch: PALETTE.park, port: '#2d4a5c', gym: '#44503a', monument: PALETTE.park, arena: '#563a3f', ecurie: '#4d3d3a' };
  for (const s of lay.specials) { const col = tint[s.kind]; if (col) rect(s.x - BLK / 2, s.z - BLK / 2, BLK, BLK, col); }
  // roads: kerbs, asphalt, centre dashes
  const lo = -HALF - 12, hi = HALF + 12;
  for (let k = 0; k <= NB; k++) { rect(roadC(k) - ROAD / 2 - 0.9, lo, ROAD + 1.8, hi - lo, PALETTE.kerb); rect(lo, roadC(k) - ROAD / 2 - 0.9, hi - lo, ROAD + 1.8, PALETTE.kerb); }
  for (let k = 0; k <= NB; k++) { rect(roadC(k) - ROAD / 2, lo, ROAD, hi - lo, PALETTE.road); rect(lo, roadC(k) - ROAD / 2, hi - lo, ROAD, PALETTE.road); }
  c.strokeStyle = PALETTE.dash; c.lineWidth = 0.5; c.setLineDash([3, 3]);
  for (let k = 0; k <= NB; k++) for (let m = 0; m < NB; m++) {
    const a = roadC(m) + ROAD / 2 + 2, b = roadC(m + 1) - ROAD / 2 - 2;
    c.beginPath(); c.moveTo(roadC(k), a); c.lineTo(roadC(k), b); c.moveTo(a, roadC(k)); c.lineTo(b, roadC(k)); c.stroke();
  }
  c.setLineDash([]);
  // buildings: the colliders tall and wide enough to be a building (not a bench, a wall or a railing)
  for (const b of hub.colliders) {
    const bw = b.x1 - b.x0, bd = b.z1 - b.z0;
    if (b.h < 2.2 || bw < 2.5 || bd < 2.5 || bw * bd < 14) continue;
    if (bw > 120 || bd > 120) continue;
    c.fillStyle = PALETTE.building; c.fillRect(b.x0, b.z0, bw, bd);
    c.fillStyle = PALETTE.roof; c.fillRect(b.x0 + 0.5, b.z0 + 0.5, Math.max(0.5, bw - 1), Math.max(0.5, bd - 1));
  }
  // the arena's ring and the monument's hill
  if (hub.arena) { c.fillStyle = '#6a444a'; c.beginPath(); c.arc(hub.arena.cx, hub.arena.cz, hub.arena.r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#8b5b52'; c.beginPath(); c.arc(hub.arena.cx, hub.arena.cz, hub.arena.r * 0.62, 0, Math.PI * 2); c.fill(); }
  if (hub.monument) { c.fillStyle = '#3e6a52'; c.beginPath(); c.arc(hub.monument.cx, hub.monument.cz, 14, 0, Math.PI * 2); c.fill(); }
  return { canvas, K, x0, z0, w, h };
}

// ------------------------------------------------------------------ icons (24 × 24 grid, white on the kind's colour)
const PATHS: Record<PlaceKind, { fill: string[]; stroke: string[]; cut: string[] }> = {
  food: { fill: ['M4 12h16a8 8 0 0 1-16 0z'], stroke: ['M9 8c-1-1.4 1-2 0-3.5M14 8c-1-1.4 1-2 0-3.5'], cut: [] },
  shop: { fill: ['M5.5 8.5h13l1 12h-15z'], stroke: ['M9 9.5V7a3 3 0 0 1 6 0v2.5'], cut: [] },
  transport: { fill: ['M5 4.5h14a1 1 0 0 1 1 1V18H4V5.5a1 1 0 0 1 1-1z'], stroke: [], cut: ['M6.5 7h11v4.5h-11z'] },
  arena: { fill: ['M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z'], stroke: ['M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z'], cut: [] },
  mosque: { fill: ['M4 20v-6h16v6z', 'M6.2 14a5.8 5.8 0 0 1 11.6 0z'], stroke: ['M12 8.2V3.5'], cut: [] },
  home: { fill: ['M12 3.5 2.8 11.5H5.5V20.5h13V11.5H21.2z'], stroke: [], cut: ['M10.2 20.5v-5h3.6v5z'] },
  work: { fill: ['M3.5 8.5h17v11h-17z'], stroke: ['M9 8.5V5.5h6v3'], cut: [] },
  spot: { fill: ['M12 4l8 8-8 8-8-8z'], stroke: [], cut: [] },
};
const path2d = new Map<string, Path2D>();
const p2d = (d: string) => { let p = path2d.get(d); if (!p) { p = new Path2D(d); path2d.set(d, p); } return p; };

/** A place icon: a disc of the kind's colour with a white glyph, centred at (x, y), radius r (px). */
export function drawIcon(c: CanvasRenderingContext2D, kind: PlaceKind, x: number, y: number, r: number, opts: { glyph?: boolean; dim?: boolean } = {}) {
  const col = KIND_COLOR[kind];
  c.save();
  c.translate(x, y);
  if (opts.dim) c.globalAlpha = 0.65;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = col; c.fill();
  c.lineWidth = Math.max(1, r * 0.16); c.strokeStyle = 'rgba(10,14,18,.9)'; c.stroke();
  if (opts.glyph !== false && r >= 5) {
    const s = (r * 1.5) / 24;
    c.scale(s, s); c.translate(-12, -12);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
    const d = PATHS[kind];
    for (const p of d.fill) c.fill(p2d(p));
    for (const p of d.stroke) c.stroke(p2d(p));
    c.fillStyle = col; for (const p of d.cut) c.fill(p2d(p));
  }
  c.restore();
}

/** A pin-style arrow on the ring pointing outward at `angle` (clockwise from up): a target beyond the map's edge. */
export function drawEdgeArrow(c: CanvasRenderingContext2D, x: number, y: number, angle: number, col: string, size = 7) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, -size); c.lineTo(size * 0.9, size * 0.7); c.lineTo(0, size * 0.25); c.lineTo(-size * 0.9, size * 0.7); c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(10,14,18,.95)'; c.stroke();
  c.restore();
}

/** The player's arrow (pointing up when facing where the camera looks). */
export function drawArrow(c: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, -size); c.lineTo(size * 0.72, size * 0.8); c.lineTo(0, size * 0.36); c.lineTo(-size * 0.72, size * 0.8); c.closePath();
  c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#0c1115'; c.lineJoin = 'round'; c.stroke();
  c.restore();
}
