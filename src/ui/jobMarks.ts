import * as THREE from 'three';
import './jobMarks.css';

/**
 * Which job a way-finding target belongs to, said the same way everywhere it is shown — the ring and the floating badge in the street
 * (src/ui/worldMarkers.ts, the delivery marker of src/economy/ui.ts), the objective on the minimap and the phone's map (src/ui/minimap.ts,
 * src/ui/fullmap.ts) and the goal line of the HUD — and never by colour alone:
 *  - a VTC ride (src/transport/vtc.ts): GREEN, a car in a rounded square, the kerb bay where the car stops outlined on the road;
 *  - a Tiak Tiak delivery (src/economy/jobs.ts, tour.ts): ORANGE, a parcel in a circle, a round ring on the ground.
 * Anything else keeps the game's sun-yellow pin.
 */
export type JobKind = 'vtc' | 'delivery';
export const JOB: Record<JobKind, { color: string; hex: number; icon: string; label: string }> = {
  vtc: { color: '#2fbf71', hex: 0x2fbf71, icon: '🚘', label: 'Course VTC' },
  delivery: { color: '#ff8a1c', hex: 0xff8a1c, icon: '📦', label: 'Livraison Tiak Tiak' },
};
/** The job of a target (`ctx.guide()`, a MissionTarget), if it has one. */
export const jobOf = (g: unknown): JobKind | null => { const j = (g as { job?: unknown } | null)?.job; return j === 'vtc' || j === 'delivery' ? j : null; };

/** The pictogram inside a badge (24 × 24 units, white): a car seen from the side, or a tied parcel. */
function glyph(c: CanvasRenderingContext2D, kind: JobKind, fill: string) {
  c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.lineCap = 'round';
  if (kind === 'vtc') {
    c.beginPath();                                            // body and cabin
    c.moveTo(2.5, 16); c.lineTo(2.5, 12.5); c.quadraticCurveTo(3, 10.5, 5.5, 10.2); c.lineTo(7.5, 6.8); c.quadraticCurveTo(8.3, 5.6, 9.8, 5.6);
    c.lineTo(15.2, 5.6); c.quadraticCurveTo(16.6, 5.6, 17.5, 6.8); c.lineTo(19.8, 10.2); c.quadraticCurveTo(21.5, 10.6, 21.5, 12.5); c.lineTo(21.5, 16); c.closePath(); c.fill();
    c.fillStyle = fill;                                       // windows
    c.beginPath(); c.moveTo(8.6, 9.8); c.lineTo(10, 7.3); c.lineTo(11.6, 7.3); c.lineTo(11.6, 9.8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(13, 9.8); c.lineTo(13, 7.3); c.lineTo(15, 7.3); c.lineTo(16.6, 9.8); c.closePath(); c.fill();
    c.fillStyle = '#fff';                                     // wheels, with the badge's colour round them
    for (const x of [7, 17]) { c.beginPath(); c.arc(x, 16.4, 2.9, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); c.beginPath(); c.arc(x, 16.4, 2.1, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
  } else {
    c.beginPath(); c.moveTo(12, 3.5); c.lineTo(20.5, 7.5); c.lineTo(20.5, 16.5); c.lineTo(12, 20.5); c.lineTo(3.5, 16.5); c.lineTo(3.5, 7.5); c.closePath(); c.fill();
    c.strokeStyle = fill; c.lineWidth = 1.6;                  // the box's edges and its tape
    c.beginPath(); c.moveTo(3.5, 7.5); c.lineTo(12, 11.5); c.lineTo(20.5, 7.5); c.moveTo(12, 11.5); c.lineTo(12, 20.5); c.moveTo(7.8, 5.5); c.lineTo(16.2, 9.5); c.stroke();
  }
}
/**
 * A job's badge on a 2D canvas, centred at (x, y), radius r (px): the VTC's a rounded square, the delivery's a circle (two shapes, two colours,
 * two pictograms). `pulse` 0…1 adds a halo.
 */
export function drawJobBadge(c: CanvasRenderingContext2D, kind: JobKind, x: number, y: number, r: number, pulse = 0) {
  const col = JOB[kind].color;
  c.save(); c.translate(x, y);
  if (pulse > 0) { c.beginPath(); c.arc(0, 0, r + 3 + pulse * 6, 0, Math.PI * 2); c.fillStyle = kind === 'vtc' ? `rgba(47,191,113,${(0.4 - pulse * 0.3).toFixed(3)})` : `rgba(255,138,28,${(0.4 - pulse * 0.3).toFixed(3)})`; c.fill(); }
  c.beginPath();
  if (kind === 'vtc') c.roundRect(-r, -r, 2 * r, 2 * r, r * 0.38); else c.arc(0, 0, r, 0, Math.PI * 2);
  c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.5, r * 0.16); c.strokeStyle = '#0c1115'; c.stroke();
  const s = (r * 1.55) / 24; c.scale(s, s); c.translate(-12, -12.5); glyph(c, kind, col);
  c.restore();
}

const textures = new Map<JobKind, THREE.CanvasTexture>();
/** The badge as a texture for a sprite floating over the job's place in the street (made once). */
export function jobBadgeTexture(kind: JobKind): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  let t = textures.get(kind);
  if (!t) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d')!; drawJobBadge(c, kind, 64, 64, 54);
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; textures.set(kind, t);
  }
  return t;
}
/** A sprite of the badge (depth-tested off: it reads over the cars and stalls in front of the place). */
export function jobBadge(kind: JobKind): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: jobBadgeTexture(kind), depthTest: false, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(1.15, 1.15, 1); s.renderOrder = 3; s.name = `job_badge_${kind}`;
  return s;
}

/** The HUD's goal line takes the job's colour and pictogram (src/ui/jobMarks.css), or none. */
let goalJob: JobKind | null | undefined;
export function markGoal(kind: JobKind | null) {
  if (kind === goalJob) return; goalJob = kind;
  const g = typeof document !== 'undefined' ? document.getElementById('goal') : null;
  if (!g) { goalJob = undefined; return; }
  if (kind) g.dataset.job = kind; else delete g.dataset.job;
}
