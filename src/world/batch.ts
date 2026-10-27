import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BAY = 3.4;   // facade bay width (m)
const FLOOR = 3.2; // storey height (m)

/** Collects many coloured primitives and merges them into one draw call. */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  count = 0;
  /**
   * Baked shading, for the places that ask for it (Mermoz and its road, the M1 visual pass): `ground` darkens vertical faces toward the ground (the contact shade at the
   * foot of a wall, a trunk, a post: `min` at the ground up to full colour at `h` metres); `under` darkens faces that look down (a crown's underside, a balcony's soffit)
   * to `under` × their colour. Off by default: every other batch is exactly as before.
   */
  shade: { ground?: { h: number; min: number }; under?: number } | null = null;

  /** Add a custom surface (boat planks, fish…) to the same merged draw call. */
  geometry(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, yaw = 0) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    this.finish(g, color, x, y, z, yaw);
  }

  /** A surface that already carries its own vertex colours (a road ribbon that fades from one surface to another), added to the same merged draw call. */
  coloured(g: THREE.BufferGeometry) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (g.index) g = g.toNonIndexed();
    this.geos.push(g); this.count++;
  }

  private finish(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) {
    g.rotateX(rotX); g.rotateZ(rotZ); g.rotateY(rotY); g.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const sh = this.shade, pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (sh && nor) {
        const ny = nor.getY(i);
        if (sh.ground && Math.abs(ny) < 0.6) { const u = Math.max(0, Math.min(1, pos.getY(i) / sh.ground.h)); k *= sh.ground.min + (1 - sh.ground.min) * u * u * (3 - 2 * u); }
        if (sh.under !== undefined && ny < -0.2) k *= 1 - (1 - sh.under) * Math.min(1, (-ny - 0.2) / 0.6);
      }
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.index) g = g.toNonIndexed();
    this.geos.push(g); this.count++;
  }

  /** Box with its base at y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    // drop the bottom face (-y, indices 18..23): boxes stand on something, it is never seen
    const idx = Array.from(g.index!.array); idx.splice(18, 6); g.setIndex(idx);
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rotY);
  }
  /** Box centred at height y keeping all six faces (seen from below: roofs, canopies), tilted by `tilt` about its own x axis (and `roll` about z). */
  slab(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0, tilt = 0, roll = 0) {
    this.finish(new THREE.BoxGeometry(w, h, d), color, x, y, z, rotY, tilt, roll);
  }
  /** Flat horizontal quad (2 triangles) lying at height y: road markings, stripes, decals. */
  flat(w: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.PlaneGeometry(w, d);
    this.finish(g, color, x, y, z, rotY, -Math.PI / 2);
  }
  /** Box whose side faces tile a window texture (storey/bay repeat); roof/underside sample plain wall. */
  facade(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const widths = [d, d, 0, 0, w, w];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.03, 0.03);
        else uv.setXY(i, uv.getX(i) * (widths[f] / BAY), uv.getY(i) * (h / FLOOR));
      }
    }
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rotY);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, rot: [number, number, number] = [0, 0, 0]) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rot[1], rot[0], rot[2]);
  }
  /** Low-poly blob (tree canopy, sandbag, bush). sy squashes it vertically. */
  blob(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sy = 1, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.scale(1, sy, 1);
    this.finish(g, color, x, y, z);
  }
  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, half = false) {
    const g = half ? new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 12, 8);
    this.finish(g, color, x, y, z);
  }

  /** Number of pieces so far; `rollback(mark)` drops the pieces added after it (a builder's dry run). */
  mark() { return this.geos.length; }
  rollback(mark: number) { this.geos.length = Math.min(this.geos.length, mark); this.count = this.geos.length; }

  build(material: THREE.Material, receive = true, cast = true): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.receiveShadow = receive; m.castShadow = cast;
    return m;
  }
}

/**
 * Facade texture (one storey × one bay): rendered plaster, a recessed window with frame, louvred shutters,
 * sill with a drip stain, and the slab line between storeys. White-based so each building's vertex colour
 * tints it. The emissive mask lights the window glass at night.
 */
export function facadeTextures() {
  const S = 128;
  const mk = (draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const map = mk(c => {
    c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { const v = 235 + Math.floor(Math.random() * 20); c.fillStyle = `rgb(${v},${v - 2},${v - 6})`; c.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    c.fillStyle = '#d9d3c7'; c.fillRect(0, S - 9, S, 9);                 // slab band between storeys
    c.fillStyle = '#c9c1b2'; c.fillRect(0, S - 10, S, 2);
    c.fillStyle = '#e6e1d8'; c.fillRect(34, 18, 60, 74);                 // window surround
    c.fillStyle = '#26303d'; c.fillRect(40, 24, 48, 62);                 // recess / glass
    c.fillStyle = '#5b6f86'; c.fillRect(42, 26, 20, 26); c.fillStyle = '#4a5c71'; c.fillRect(66, 26, 20, 26);
    c.fillStyle = '#e9e5dd'; c.fillRect(63, 24, 3, 62); c.fillRect(40, 53, 48, 3); // mullions
    for (const x of [22, 94]) {                                           // louvred shutters
      c.fillStyle = '#8b8f8c'; c.fillRect(x, 24, 12, 62);
      c.fillStyle = '#6d726f'; for (let y = 27; y < 84; y += 5) c.fillRect(x + 1, y, 10, 2);
    }
    c.fillStyle = '#cfc8ba'; c.fillRect(32, 90, 64, 5);                  // sill
    const g = c.createLinearGradient(0, 95, 0, S - 10); g.addColorStop(0, 'rgba(120,110,95,0.35)'); g.addColorStop(1, 'rgba(120,110,95,0)');
    c.fillStyle = g; c.fillRect(44, 95, 40, S - 105);                    // drip stain under the sill
  });
  const glow = mk(c => { c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.fillStyle = '#fff'; c.fillRect(42, 26, 44, 58); });
  return { map, glow };
}

/**
 * Canvas textures must have the same aspect ratio as their physical sign plane.
 * Otherwise the GPU stretches letters (especially on long, narrow shop fronts).
 * Keep the texture relatively small for mobile graphics memory.
 */
export function signCanvasSize(boardWidth: number, boardHeight: number): { width: number; height: number } {
  const pixelsPerMetre = Math.min(80, 96 / boardHeight, 1536 / boardWidth);   // 80 px a metre is 1 : 1 for a name's letters (0.4 m) seen from 12 m on the phone, and keeps a 21 m board under 1 536 px
  return {
    width: Math.max(1, Math.round(boardWidth * pixelsPerMetre)),
    height: Math.max(1, Math.round(boardHeight * pixelsPerMetre)),
  };
}

/** Paints a sign into `cv` at its own size and returns what it painted: the font size, and the measured width of the line (letter-spaced if it was). */
function paintSignCanvas(cv: HTMLCanvasElement, text: string, bg: string, fg: string): { size: number; width: number } {
  const w = cv.width, h = cv.height, c = cv.getContext('2d')!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = fg; c.lineWidth = Math.max(3, Math.round(h / 28)); c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = fg; c.textBaseline = 'middle';
  const pad = Math.max(12, Math.round(h * 0.28)), font = (s: number) => `800 ${s}px system-ui, sans-serif`;
  let size = Math.round(h * 0.6); c.font = font(size);
  while (c.measureText(text).width > w - 2 * pad && size > 8) { size -= 1; c.font = font(size); }
  const glyphs = [...text], base = c.measureText(text).width;
  // a long, low board with a short name (« BOUTIQUE DIALLO » on 16 m): the letters keep their shape and are spaced out, never stretched
  const track = glyphs.length > 1 && w / h > 7 ? Math.max(0, Math.min(size * 0.3, (w * 0.62 - base) / (glyphs.length - 1))) : 0;
  if (track > 0.5) {
    c.textAlign = 'left';
    let x = (w - base - track * (glyphs.length - 1)) / 2;
    for (const g of glyphs) { c.fillText(g, x, h / 2 + 2); x += c.measureText(g).width + track; }
  } else { c.textAlign = 'center'; c.fillText(text, w / 2, h / 2 + 2); }
  return { size, width: base + track * Math.max(0, glyphs.length - 1) };
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const { size, width } = paintSignCanvas(cv, text, bg, fg);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.sign = { text, bg, fg, size, w, h, width };   // read by refitSign and by the signage audit (scripts/check-pikine-signs.mjs)
  return t;
}

/**
 * A sign painted by `signTexture` at a size chosen by its caller may sit on a plane of other proportions (a 512 × 128 canvas on a
 * 7 m × 0.95 m board): repaint it at the plane's own proportions so the letters are never stretched. True when it was repainted.
 */
export function refitSign(t: THREE.Texture, planeW: number, planeH: number): boolean {
  const info = t.userData.sign as { text: string; bg: string; fg: string; w: number; h: number } | undefined;
  const cv = t.image as HTMLCanvasElement | undefined;
  if (!info || typeof cv?.getContext !== 'function' || Math.abs(info.w / info.h / (planeW / planeH) - 1) <= 0.02) return false;
  const { width, height } = signCanvasSize(planeW, planeH);
  cv.width = width; cv.height = height;
  const { size, width: tw } = paintSignCanvas(cv, info.text, info.bg, info.fg);
  t.userData.sign = { ...info, size, w: width, h: height, width: tw };
  t.needsUpdate = true;
  return true;
}
