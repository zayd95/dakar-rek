/**
 * The camera's vertical field of view for a screen of `w` × `h` CSS pixels.
 * Portrait: 66°. Landscape: 58°, except on a screen wider than about 16:9 — a phone on its side is about 2.2 : 1, where
 * 58° vertical opens the horizontal angle to about 100° (stretched edges, a tiny character in the middle of a short
 * view). There the vertical angle narrows so the horizontal one stays near 90°, never under 50° vertical.
 */
export function fovFor(w: number, h: number): number {
  if (!(w > 0 && h > 0) || w < h) return 66;
  const keepH = (2 * Math.atan(Math.tan(Math.PI / 4) / (w / h)) * 180) / Math.PI;   // vertical angle for a 90° horizontal one
  return Math.round(Math.min(58, Math.max(50, keepH)) * 10) / 10;
}

/** The horizontal field of view (degrees) for a vertical one and an aspect ratio. */
export const horizontalFov = (fov: number, aspect: number): number => (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
