import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BAY = 3.4;   // facade bay width (m)
const FLOOR = 3.2; // storey height (m)

/** Collects many coloured primitives and merges them into one draw call. */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  count = 0;

  private finish(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) {
    g.rotateX(rotX); g.rotateZ(rotZ); g.rotateY(rotY); g.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
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
  /** Flat horizontal quad (2 triangles) lying at height y: road markings, stripes, decals. */
  flat(w: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.PlaneGeometry(w, d);
    this.finish(g, color, x, y, z, rotY, -Math.PI / 2);
  }
  /** Box whose side faces tile a window texture (storey/bay repeat); roof/underside sample plain wall. */
  facade(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0, style = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.setAttribute('facadeStyle', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(style), 1));
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
  /**
   * Leafy canopy clump: subdivided sphere with lumpy radial noise, normals pointing out from the clump centre
   * (soft, volumetric shading instead of facets) and a vertical colour ramp (shaded underside, sunlit top).
   */
  canopy(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sy = 0.8, seed = 0, detail = 2) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position as THREE.BufferAttribute, n = p.count;
    const nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color(color), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const k = 1 + 0.16 * Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 1.7) + 0.1 * Math.sin(v.z * 7.7 + v.x * 3.1 + seed * 2.3);
      const flat = v.y < -0.35 ? 0.55 + 0.45 * (1 + v.y) / 0.65 : 1;     // flatter underside
      p.setXYZ(i, v.x * r * k, v.y * r * sy * k * flat, v.z * r * k);
      nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y * 0.8 + 0.2; nrm[i * 3 + 2] = v.z;
      const shade = 0.62 + 0.5 * (v.y * 0.5 + 0.5) + 0.06 * Math.sin(seed + i);
      col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.translate(x, y, z);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g.index ? g.toNonIndexed() : g); this.count++;
  }
  /**
   * Palm frond: an arched, drooping ribbon (uv u across, v along) for an alpha-tested leaflet texture.
   * a = heading around the trunk, len = length, lift = initial upward angle, droop = how much the tip falls.
   */
  frond(x: number, y: number, z: number, a: number, len: number, width: number, lift: number, droop: number, color: THREE.ColorRepresentation) {
    const N = 6, pos: number[] = [], uv: number[] = [], nor: number[] = [], col: number[] = [];
    const c = new THREE.Color(color), dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, ang = lift - droop * t * t;
      const h = len * t;
      pts.push(new THREE.Vector3(x + dir.x * h * Math.cos(lift * 0.5), y + len * (Math.sin(lift) * t - droop * 0.45 * t * t), z + dir.z * h * Math.cos(lift * 0.5)));
      void ang;
    }
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const w0 = width * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t0 * 1.15 + 0.08))), w1 = width * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t1 * 1.15 + 0.08)));
      const p0 = pts[i], p1 = pts[i + 1];
      // slight V fold: the edges sit a little lower than the rib
      const a0 = p0.clone().addScaledVector(side, -w0 / 2).add(new THREE.Vector3(0, -w0 * 0.18, 0)), b0 = p0.clone().addScaledVector(side, w0 / 2).add(new THREE.Vector3(0, -w0 * 0.18, 0));
      const a1 = p1.clone().addScaledVector(side, -w1 / 2).add(new THREE.Vector3(0, -w1 * 0.18, 0)), b1 = p1.clone().addScaledVector(side, w1 / 2).add(new THREE.Vector3(0, -w1 * 0.18, 0));
      for (const [p, u, v] of [[a0, 0, t0], [b0, 1, t0], [b1, 1, t1], [a0, 0, t0], [b1, 1, t1], [a1, 0, t1]] as [THREE.Vector3, number, number][]) {
        pos.push(p.x, p.y, p.z); uv.push(u, v); nor.push(0, 1, 0);
        const sh = 0.75 + 0.35 * (1 - v); col.push(c.r * sh, c.g * sh, c.b * sh);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.geos.push(g); this.count++;
  }
  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, half = false) {
    const g = half ? new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 12, 8);
    this.finish(g, color, x, y, z);
  }

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
 * Facade atlas: four window styles, each one storey × one bay (256 px cells in a 512 px atlas). White-based so the
 * building's vertex colour tints the plaster; the glow atlas marks the glass for night windows. Styles:
 * 0 louvred shutters, 1 tall French window with iron balcony rail, 2 arched window with painted frame,
 * 3 modern sliding window with an AC unit and a dirt streak. Generic designs authored in code.
 */
export const FACADE_STYLES = 4;
export function facadeTextures() {
  const S = 512, C = 256;
  const mk = (draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cells: [number, number][] = [[0, 0], [C, 0], [0, C], [C, C]];          // style k at (u0, v0) in canvas px (v from the top)
  const plaster = (c: CanvasRenderingContext2D, x: number, y: number) => {
    c.fillStyle = '#fbfaf7'; c.fillRect(x, y, C, C);
    for (let i = 0; i < 2200; i++) { const v = 232 + Math.floor(rnd() * 23); c.fillStyle = `rgb(${v},${v - 2},${v - 6})`; c.fillRect(x + rnd() * C, y + rnd() * C, 2, 2); }
    c.fillStyle = '#d9d3c7'; c.fillRect(x, y + C - 16, C, 16); c.fillStyle = '#c9c1b2'; c.fillRect(x, y + C - 18, C, 3); // slab band
  };
  const drip = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.3) => {
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, `rgba(110,100,85,${a})`); g.addColorStop(1, 'rgba(110,100,85,0)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
  };
  const glassAt = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    c.fillStyle = '#26303d'; c.fillRect(x, y, w, h);
    const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#6d849c'); g.addColorStop(0.5, '#4a5c71'); g.addColorStop(1, '#33424f');
    c.fillStyle = g; c.fillRect(x + 3, y + 3, w - 6, h - 6);
  };
  const glows: [number, number, number, number, number][] = [];                 // style, x, y, w, h (cell-relative)
  const map = mk(c => {
    // 0: rectangular window, louvred grey shutters, sill
    let [x, y] = cells[0]; plaster(c, x, y);
    c.fillStyle = '#e6e1d8'; c.fillRect(x + 68, y + 36, 120, 148);
    glassAt(c, x + 80, y + 48, 96, 124); glows.push([0, 82, 50, 92, 120]);
    c.fillStyle = '#e9e5dd'; c.fillRect(x + 126, y + 48, 5, 124); c.fillRect(x + 80, y + 106, 96, 5);
    for (const sx of [44, 188]) { c.fillStyle = '#8b8f8c'; c.fillRect(x + sx, y + 48, 24, 124); c.fillStyle = '#6d726f'; for (let k = 52; k < 168; k += 9) c.fillRect(x + sx + 2, y + k, 20, 3); }
    c.fillStyle = '#cfc8ba'; c.fillRect(x + 62, y + 180, 132, 9); drip(c, x + 88, y + 189, 80, 50);
    // 1: tall French window with balcony rail and green shutters, moulded lintel
    [x, y] = cells[1]; plaster(c, x, y);
    c.fillStyle = '#ece6da'; c.fillRect(x + 70, y + 18, 116, 16); c.fillStyle = '#d6cfbf'; c.fillRect(x + 66, y + 30, 124, 6);
    glassAt(c, x + 84, y + 40, 88, 186); glows.push([1, 86, 42, 84, 182]);
    c.fillStyle = '#efeae0'; c.fillRect(x + 126, y + 40, 4, 186); for (let k = 0; k < 3; k++) c.fillRect(x + 84, y + 90 + k * 50, 88, 3);
    for (const sx of [48, 176]) { c.fillStyle = '#3f7c5a'; c.fillRect(x + sx, y + 40, 32, 186); c.fillStyle = '#2f644a'; for (let k = 46; k < 222; k += 8) c.fillRect(x + sx + 3, y + k, 26, 3); }
    c.fillStyle = '#d2cab9'; c.fillRect(x + 56, y + 222, 144, 10);                       // balcony slab
    c.fillStyle = '#2b2b2b'; c.fillRect(x + 60, y + 170, 136, 4); for (let k = 64; k < 196; k += 10) c.fillRect(x + k, y + 172, 3, 50); // iron rail
    drip(c, x + 60, y + 232, 136, 8, 0.35);
    // 2: arched window with painted blue frame, plaster band
    [x, y] = cells[2]; plaster(c, x, y);
    c.fillStyle = '#e3ddd0'; c.fillRect(x, y + 196, C, 14);
    c.fillStyle = '#2f6fa8'; c.beginPath(); c.moveTo(x + 76, y + 186); c.lineTo(x + 76, y + 92); c.arc(x + 128, y + 92, 52, Math.PI, 0); c.lineTo(x + 180, y + 186); c.closePath(); c.fill();
    c.fillStyle = '#26303d'; c.beginPath(); c.moveTo(x + 86, y + 178); c.lineTo(x + 86, y + 94); c.arc(x + 128, y + 94, 42, Math.PI, 0); c.lineTo(x + 170, y + 178); c.closePath(); c.fill();
    c.fillStyle = '#556b82'; c.fillRect(x + 90, y + 100, 34, 74); c.fillStyle = '#48596c'; c.fillRect(x + 132, y + 100, 34, 74);
    c.fillStyle = '#2f6fa8'; c.fillRect(x + 125, y + 56, 6, 122); glows.push([2, 88, 62, 80, 114]);
    c.fillStyle = '#d4ccbb'; c.fillRect(x + 70, y + 186, 116, 8); drip(c, x + 96, y + 194, 64, 40, 0.25);
    // 3: modern sliding window, aluminium frame, AC unit, streak
    [x, y] = cells[3]; plaster(c, x, y);
    c.fillStyle = '#b9bcbf'; c.fillRect(x + 36, y + 52, 184, 104);
    glassAt(c, x + 42, y + 58, 172, 92); glows.push([3, 44, 60, 168, 88]);
    c.fillStyle = '#c4c7ca'; c.fillRect(x + 126, y + 58, 5, 92);
    c.fillStyle = '#d0cbc0'; c.fillRect(x + 32, y + 156, 192, 7);
    c.fillStyle = '#e7e7e4'; c.fillRect(x + 150, y + 172, 64, 42); c.fillStyle = '#9a9c9e'; for (let k = 0; k < 6; k++) c.fillRect(x + 154, y + 176 + k * 6, 40, 2);
    c.fillStyle = '#7d7f80'; c.beginPath(); c.arc(x + 203, y + 193, 8, 0, Math.PI * 2); c.fill();
    drip(c, x + 176, y + 214, 10, 36, 0.4); drip(c, x + 50, y + 163, 60, 60, 0.18);
  });
  const glow = mk(c => {
    c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.fillStyle = '#fff';
    for (const [k, gx, gy, gw, gh] of glows) {
      const [x, y] = cells[k];
      if (k === 2) { c.beginPath(); c.moveTo(x + gx, y + gy + gh); c.lineTo(x + gx, y + gy + 32); c.arc(x + 128, y + gy + 32, 40, Math.PI, 0); c.lineTo(x + gx + gw, y + gy + gh); c.closePath(); c.fill(); }
      else c.fillRect(x + gx, y + gy, gw, gh);
    }
  });
  return { map, glow };
}

/** Shader patch for the facade atlas: per-vertex style picks the cell, fract() repeats it per bay and storey. */
export function useFacadeAtlas(mat: THREE.Material) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float facadeStyle;\nvarying vec2 vFacOff;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacOff = vec2(mod(facadeStyle, 2.0), 1.0 - floor(facadeStyle / 2.0)) * 0.5;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFacOff;\nvec4 facSample(sampler2D t, vec2 uv) { return textureGrad(t, vFacOff + vec2(0.004) + fract(uv) * 0.492, dFdx(uv) * 0.492, dFdy(uv) * 0.492); }')
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'facSample( map, vMapUv )'))
      .replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace('texture2D( emissiveMap, vEmissiveMapUv )', 'facSample( emissiveMap, vEmissiveMapUv )'));
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + '-facatlas';
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 34; c.font = `800 ${size}px system-ui, sans-serif`;
  while (c.measureText(text).width > w - 24 && size > 12) { size -= 2; c.font = `800 ${size}px system-ui, sans-serif`; }
  c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
