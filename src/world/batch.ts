import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACADE_COLS, FACADE_ROWS, facadeAtlas } from './facadeAtlas';

const BAY = 3.4;   // facade bay width (m)
const FLOOR = 3.2; // storey height (m)

/**
 * How a building's walls read the facade atlas (src/world/facadeAtlas.ts): the row of its upper storeys, of its ground floor (on the faces that see
 * a street, and on the others), of its top floor. Without a style a wall shows the classic window on every storey, as it always did.
 */
export interface FacadeStyle {
  /** The atlas row of the storeys (`ROW`). */
  upper: number;
  /** The ground floor's row on the faces that see a street (`streets`); without it the ground floor is a storey like the others. */
  ground?: number;
  /** The ground floor's row on the other faces (a back wall, a party wall). */
  back?: number;
  /** The top storey's row (an unfinished floor, a penthouse). */
  top?: number;
  /** Outward normals (the box's own axes, before its rotation) of the faces that see a street. */
  streets?: [number, number][];
  /** Storeys in the wall's height: the rows are stretched to them (a 2.75 m storey in Pikine). Without it, 3.2 m a storey, and what is left over the last whole one is plain wall. */
  floors?: number;
  /** Shifts the ground floor's sequence of bays (door, shop, shop…) so two neighbours do not open their doors in step. */
  seed?: number;
}

/** Collects many coloured primitives and merges them into one draw call. */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  count = 0;
  /**
   * A batch of walls drawn by the facade material: every piece carries the `fstyle` attribute (the rows of its storeys, the face's width in bays,
   * its storeys: read by the facade shader, src/world/grain.ts). All zero on a piece without a style: the classic window.
   */
  styled = false;
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
    if (this.styled && !g.attributes.fstyle) g.setAttribute('fstyle', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
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
    if (this.styled && !g.attributes.fstyle) g.setAttribute('fstyle', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
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
  /**
   * Box whose side faces show the facade atlas, a bay (3.4 m) by a storey; roof/underside sample plain wall. Without a `style`: the classic
   * window on every storey (the same box, the same uv as ever). With one (in a `styled` batch): each side face says which rows it reads.
   */
  facade(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0, style?: FacadeStyle) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const widths = [d, d, 0, 0, w, w], storeys = style?.floors ?? h / FLOOR;
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.03, 0.03);
        else uv.setXY(i, uv.getX(i) * (widths[f] / BAY), uv.getY(i) * storeys);
      }
    }
    if (style && this.styled) {
      const st = new Float32Array(24 * 4), normals: [number, number][] = [[1, 0], [-1, 0], [0, 0], [0, 0], [0, 1], [0, -1]];
      for (let f = 0; f < 6; f++) {
        if (f === 2 || f === 3) continue;                                  // (the roof and the underside: zeros, plain wall)
        const street = !style.streets || style.streets.some(([nx, nz]) => nx === normals[f][0] && nz === normals[f][1]);
        const ground = street ? style.ground : style.back ?? style.ground;
        const rows = style.upper + 16 * (ground === undefined ? 0 : ground + 1) + 256 * (style.top === undefined ? 0 : style.top + 1);
        for (let k = 0; k < 4; k++) st.set([rows, (style.seed ?? 0) & 3, widths[f] / BAY, Math.max(1, Math.floor(storeys + 0.2))], (f * 4 + k) * 4);
      }
      g.setAttribute('fstyle', new THREE.BufferAttribute(st, 4));
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

  /** Takes another batch's pieces (the same material: one mesh, one draw call instead of two); the other batch is left empty. */
  absorb(other: Batch) { if (other === this) return; this.geos.push(...other.geos); this.count = this.geos.length; other.geos.length = 0; other.count = 0; }

  /** Triangles drawn so far (for the budgets: tests/helpers/siteCost.ts). */
  triangles() { let n = 0; for (const g of this.geos) n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; return n; }
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
 * The facade textures: the atlas of storeys (src/world/facadeAtlas.ts) and its night mask. White-based where each building's vertex colour tints
 * it; the alpha channel marks what keeps its own colour (doors, shutters, boards, frames). Sampled by the facade shader (src/world/grain.ts,
 * `windows`), which reads a row and a bay of it for each cell of a wall: the textures themselves repeat nowhere.
 */
export function facadeTextures() {
  const { map: mapCanvas, glow: glowCanvas } = facadeAtlas();
  const mk = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: mk(mapCanvas), glow: mk(glowCanvas) };
}
export { FACADE_COLS, FACADE_ROWS };

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
